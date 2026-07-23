import {
  BaseProviderAdapter,
  BYOKConfig,
  CompletionRequest,
  CompletionResponse,
  ModelCapability,
  AIProvider
} from '../types/agent.js';
import { resolveBaseUrl, getProviderMeta } from './provider-meta.js';
import { applyReasoningEffort } from '../orchestrator/reasoning-effort.js';
import { detectRepetitiveLoop } from './ai-engine-helpers.js';

/** Generic provider adapter for OpenAI-compatible third-party / self-hosted endpoints. */
export class CustomAdapter implements BaseProviderAdapter {
  public readonly provider: AIProvider;
  private apiKey: string;
  private baseUrl: string;
  private defaultModel: string;

  constructor(config: BYOKConfig) {
    this.provider = config.provider;
    this.apiKey = config.apiKey || 'custom-key';
    this.baseUrl = resolveBaseUrl(config.provider, config.baseUrl);
    this.defaultModel = config.modelName || getProviderMeta(config.provider)?.name || 'gpt-4o';
  }

  public async complete(request: CompletionRequest): Promise<CompletionResponse> {
    const model = request.model || this.defaultModel;
    const url = `${this.baseUrl}/chat/completions`;

    const headers: Record<string, string> = {
      'Content-Type': 'application/json'
    };
    if (this.apiKey) {
      headers['Authorization'] = `Bearer ${this.apiKey}`;
    }

    const payload: Record<string, any> = {
      model,
      messages: request.messages.map(m => ({
        role: m.role,
        content: m.content
      })),
      temperature: request.temperature ?? 0.7,
      max_tokens: request.maxTokens,
      frequency_penalty: request.frequencyPenalty ?? 0.3,
      presence_penalty: request.presencePenalty ?? 0.3
    };

    applyReasoningEffort(payload, this.provider, request.reasoningEffort, request.maxTokens);

    const controller = new AbortController();
    const timeoutMs = Number(process.env.SUPERAGENT_HTTP_TIMEOUT_MS ?? 300000);
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
      signal: controller.signal
    }).finally(() => clearTimeout(timer));

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`${this.provider.toUpperCase()} API error [${response.status}]: ${errorText}`);
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

    const choiceMsg = data.choices?.[0]?.message as any;
    let content = choiceMsg?.content || choiceMsg?.reasoning || choiceMsg?.reasoning_content || choiceMsg?.thought || '';
    const loopCheck = detectRepetitiveLoop(content);
    if (loopCheck.isLoop) {
      content = loopCheck.cleanText;
    }

    return {
      id: data.id || `${this.provider}-${Date.now()}`,
      provider: this.provider,
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

    const headers: Record<string, string> = {
      'Content-Type': 'application/json'
    };
    if (this.apiKey) {
      headers['Authorization'] = `Bearer ${this.apiKey}`;
    }

    const payload: Record<string, any> = {
      model,
      messages: request.messages.map(m => ({
        role: m.role,
        content: m.content
      })),
      temperature: request.temperature ?? 0.7,
      stream: true,
      frequency_penalty: request.frequencyPenalty ?? 0.3,
      presence_penalty: request.presencePenalty ?? 0.3
    };

    applyReasoningEffort(payload, this.provider, request.reasoningEffort, request.maxTokens);

    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`${this.provider.toUpperCase()} API stream error [${response.status}]: ${errorText}`);
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
                const delta = json.choices?.[0]?.delta;
                const chunkText = delta?.content || delta?.reasoning || delta?.reasoning_content || delta?.thought || '';
                if (chunkText) {
                  fullContent += chunkText;
                  const loopCheck = detectRepetitiveLoop(fullContent);
                  if (loopCheck.isLoop) {
                    fullContent = loopCheck.cleanText;
                    done = true;
                    try { await reader.cancel(); } catch {}
                    break;
                  }
                  onChunk(chunkText);
                }
              } catch {
                // ignore parse error
              }
            }
          }
        }
      }
    }

    return {
      id: `${this.provider}-stream-${Date.now()}`,
      provider: this.provider,
      model,
      content: fullContent
    };
  }

  public async listModels(): Promise<ModelCapability[]> {
    if (this.provider === 'deepseek') {
      return [
        {
          id: 'deepseek-chat',
          name: 'DeepSeek Chat (V3)',
          provider: 'deepseek',
          contextWindow: 64000,
          maxOutputTokens: 8192,
          supportsVision: false,
          supportsTools: true,
          supportsReasoning: false
        },
        {
          id: 'deepseek-reasoner',
          name: 'DeepSeek Reasoner (R1)',
          provider: 'deepseek',
          contextWindow: 64000,
          maxOutputTokens: 8192,
          supportsVision: false,
          supportsTools: true,
          supportsReasoning: true
        }
      ];
    }

    if (this.provider === 'deepinfra') {
      return [
        {
          id: this.defaultModel,
          name: `DeepInfra Model (${this.defaultModel})`,
          provider: 'deepinfra',
          contextWindow: 128000,
          maxOutputTokens: 4096,
          supportsVision: false,
          supportsTools: true,
          supportsReasoning: false
        }
      ];
    }

    // For other OpenAI-compatible providers (OpenRouter, Kimi, Mistral, …) and
    // generic custom endpoints the real model list is discovered via the
    // provider's own `/models` endpoint, so we don't fabricate capabilities
    // here.
    return [];
  }
}
