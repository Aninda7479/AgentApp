import {
  BaseProviderAdapter,
  BYOKConfig,
  CompletionRequest,
  CompletionResponse,
  ModelCapability,
  AIProvider
} from '../types/agent.js';
import { toAnthropicMessages } from './multimodal.js';
import { applyReasoningEffort } from '../orchestrator/reasoning-effort.js';
import { detectRepetitiveLoop } from './ai-engine-helpers.js';

/** Provider adapter for the Anthropic Messages API (Claude). */
export class AnthropicAdapter implements BaseProviderAdapter {
  public readonly provider: AIProvider = 'anthropic';
  private apiKey: string;
  private baseUrl: string;
  private defaultModel: string;

  constructor(config: BYOKConfig) {
    this.apiKey = config.apiKey;
    this.baseUrl = (config.baseUrl || 'https://api.anthropic.com').replace(/\/+$/, '');
    this.defaultModel = config.modelName || 'claude-3-7-sonnet-20250219';
  }

  public async complete(request: CompletionRequest): Promise<CompletionResponse> {
    const model = request.model || this.defaultModel;
    const url = `${this.baseUrl}/v1/messages`;

    const { systemPrompt, messages: filteredMessages } = toAnthropicMessages(request.messages);

    if (filteredMessages.length === 0) {
      filteredMessages.push({ role: 'user', content: 'Hello' });
    }

    const payload: Record<string, unknown> = {
      model,
      messages: filteredMessages,
      max_tokens: request.maxTokens || 4096,
      temperature: request.temperature ?? 0.7
    };

    if (systemPrompt) {
      payload.system = systemPrompt;
    }

    applyReasoningEffort(payload, this.provider, request.reasoningEffort, request.maxTokens || 4096);

    const controller = new AbortController();
    const timeoutMs = Number(process.env.SUPERAGENT_HTTP_TIMEOUT_MS ?? 300000);
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify(payload),
      signal: controller.signal
    }).finally(() => clearTimeout(timer));

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Anthropic API error [${response.status}]: ${errorText}`);
    }

    const data = await response.json() as {
      id: string;
      content: Array<{ type: string; text?: string }>;
      usage?: {
        input_tokens: number;
        output_tokens: number;
      };
    };

    const textBlocks = data.content?.filter(c => c.type === 'text') || [];
    let content = textBlocks.map(b => b.text || '').join('');
    const loopCheck = detectRepetitiveLoop(content);
    if (loopCheck.isLoop) {
      content = loopCheck.cleanText;
    }

    return {
      id: data.id || `anthropic-${Date.now()}`,
      provider: 'anthropic',
      model,
      content,
      usage: data.usage ? {
        promptTokens: data.usage.input_tokens,
        completionTokens: data.usage.output_tokens,
        totalTokens: data.usage.input_tokens + data.usage.output_tokens
      } : undefined
    };
  }

  public async streamComplete(
    request: CompletionRequest,
    onChunk: (chunk: string) => void
  ): Promise<CompletionResponse> {
    const model = request.model || this.defaultModel;
    const url = `${this.baseUrl}/v1/messages`;

    const { systemPrompt, messages: filteredMessages } = toAnthropicMessages(request.messages);

    const payload: Record<string, unknown> = {
      model,
      messages: filteredMessages,
      max_tokens: request.maxTokens || 4096,
      temperature: request.temperature ?? 0.7,
      stream: true
    };

    if (systemPrompt) {
      payload.system = systemPrompt;
    }

    applyReasoningEffort(payload, this.provider, request.reasoningEffort, request.maxTokens || 4096);

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Anthropic API stream error [${response.status}]: ${errorText}`);
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
            if (trimmed.startsWith('data: ')) {
              try {
                const json = JSON.parse(trimmed.slice(6));
                if (json.type === 'content_block_delta' && json.delta?.text) {
                  const text = json.delta.text;
                  fullContent += text;
                  const loopCheck = detectRepetitiveLoop(fullContent);
                  if (loopCheck.isLoop) {
                    fullContent = loopCheck.cleanText;
                    done = true;
                    try { await reader.cancel(); } catch {}
                    break;
                  }
                  onChunk(text);
                }
              } catch {
                // ignore SSE parse chunk error
              }
            }
          }
        }
      }
    }

    return {
      id: `anthropic-stream-${Date.now()}`,
      provider: 'anthropic',
      model,
      content: fullContent
    };
  }

  public async listModels(): Promise<ModelCapability[]> {
    return [
      {
        id: 'claude-3-7-sonnet-20250219',
        name: 'Claude 3.7 Sonnet',
        provider: 'anthropic',
        contextWindow: 200000,
        maxOutputTokens: 8192,
        supportsVision: true,
        supportsTools: true,
        supportsReasoning: true
      },
      {
        id: 'claude-3-5-sonnet-20241022',
        name: 'Claude 3.5 Sonnet',
        provider: 'anthropic',
        contextWindow: 200000,
        maxOutputTokens: 8192,
        supportsVision: true,
        supportsTools: true,
        supportsReasoning: false
      },
      {
        id: 'claude-3-opus-20240229',
        name: 'Claude 3 Opus',
        provider: 'anthropic',
        contextWindow: 200000,
        maxOutputTokens: 4096,
        supportsVision: true,
        supportsTools: true,
        supportsReasoning: false
      }
    ];
  }
}
