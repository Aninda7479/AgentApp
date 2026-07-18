import {
  BaseProviderAdapter,
  BYOKConfig,
  CompletionRequest,
  CompletionResponse,
  ModelCapability,
  AIProvider
} from '../types/agent.js';
import { applyReasoningEffort } from '../orchestrator/reasoning-effort.js';

/** Provider adapter for OpenAI-compatible Chat Completions API. */
export class OpenAIAdapter implements BaseProviderAdapter {
  public readonly provider: AIProvider = 'openai';
  private apiKey: string;
  private baseUrl: string;
  private defaultModel: string;

  constructor(config: BYOKConfig) {
    if (config.provider !== 'openai' && config.provider !== 'custom') {
      throw new Error(`Invalid provider for OpenAIAdapter: ${config.provider}`);
    }
    this.apiKey = config.apiKey;
    this.baseUrl = (config.baseUrl || 'https://api.openai.com/v1').replace(/\/+$/, '');
    this.defaultModel = config.modelName || 'gpt-4o';
  }

  public async complete(request: CompletionRequest): Promise<CompletionResponse> {
    const model = request.model || this.defaultModel;
    const url = `${this.baseUrl}/chat/completions`;

    const payload = {
      model,
      messages: request.messages.map(m => ({
        role: m.role,
        content: m.content,
        name: m.name
      })),
      temperature: request.temperature ?? 0.7,
      max_tokens: request.maxTokens,
      stream: false
    };

    applyReasoningEffort(payload, this.provider, request.reasoningEffort, request.maxTokens);

    const controller = new AbortController();
    const timeoutMs = Number(process.env.SUPERAGENT_HTTP_TIMEOUT_MS ?? 300000);
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`
      },
      body: JSON.stringify(payload),
      signal: controller.signal
    }).finally(() => clearTimeout(timer));

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OpenAI API error [${response.status}]: ${errorText}`);
    }

    const data = await response.json() as {
      id: string;
      choices: Array<{
        message: {
          content: string;
        };
      }>;
      usage?: {
        prompt_tokens: number;
        completion_tokens: number;
        total_tokens: number;
      };
    };

    const content = data.choices?.[0]?.message?.content || '';

    return {
      id: data.id || `openai-${Date.now()}`,
      provider: 'openai',
      model,
      content,
      usage: data.usage ? {
        promptTokens: data.usage.prompt_tokens,
        completionTokens: data.usage.completion_tokens,
        totalTokens: data.usage.total_tokens
      } : undefined
    };
  }

  public async streamComplete(
    request: CompletionRequest,
    onChunk: (chunk: string) => void
  ): Promise<CompletionResponse> {
    const model = request.model || this.defaultModel;
    const url = `${this.baseUrl}/chat/completions`;

    const payload = {
      model,
      messages: request.messages.map(m => ({
        role: m.role,
        content: m.content
      })),
      temperature: request.temperature ?? 0.7,
      stream: true
    };

    applyReasoningEffort(payload, this.provider, request.reasoningEffort, request.maxTokens);

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OpenAI API stream error [${response.status}]: ${errorText}`);
    }

    let fullContent = '';
    if (response.body) {
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let done = false;
      while (!done) {
        const { value, done: doneReading } = await reader.read();
        done = doneReading;
        if (value) {
          const chunkStr = decoder.decode(value, { stream: true });
          const lines = chunkStr.split('\n');
          for (const line of lines) {
            const trimmed = line.trim();
            if (trimmed.startsWith('data: ') && trimmed !== 'data: [DONE]') {
              try {
                const json = JSON.parse(trimmed.slice(6));
                const delta = json.choices?.[0]?.delta?.content || '';
                if (delta) {
                  fullContent += delta;
                  onChunk(delta);
                }
              } catch {
                // ignore parse errors for incomplete SSE chunks
              }
            }
          }
        }
      }
    }

    return {
      id: `openai-stream-${Date.now()}`,
      provider: 'openai',
      model,
      content: fullContent
    };
  }

  public async listModels(): Promise<ModelCapability[]> {
    return [
      {
        id: 'gpt-4o',
        name: 'GPT-4o',
        provider: 'openai',
        contextWindow: 128000,
        maxOutputTokens: 4096,
        supportsVision: true,
        supportsTools: true,
        supportsReasoning: false
      },
      {
        id: 'o3-mini',
        name: 'o3-mini',
        provider: 'openai',
        contextWindow: 200000,
        maxOutputTokens: 100000,
        supportsVision: false,
        supportsTools: true,
        supportsReasoning: true
      },
      {
        id: 'gpt-4o-mini',
        name: 'GPT-4o Mini',
        provider: 'openai',
        contextWindow: 128000,
        maxOutputTokens: 4096,
        supportsVision: true,
        supportsTools: true,
        supportsReasoning: false
      }
    ];
  }
}
