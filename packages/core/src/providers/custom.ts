import {
  BaseProviderAdapter,
  BYOKConfig,
  CompletionRequest,
  CompletionResponse,
  ModelCapability,
  AIProvider
} from '../types/agent.js';

export class CustomAdapter implements BaseProviderAdapter {
  public readonly provider: AIProvider;
  private apiKey: string;
  private baseUrl: string;
  private defaultModel: string;

  constructor(config: BYOKConfig) {
    if (config.provider !== 'deepseek' && config.provider !== 'custom' && config.provider !== 'deepinfra') {
      throw new Error(`Invalid provider for CustomAdapter: ${config.provider}`);
    }
    this.provider = config.provider;
    this.apiKey = config.apiKey || 'custom-key';

    if (config.provider === 'deepseek') {
      this.baseUrl = (config.baseUrl || 'https://api.deepseek.com/v1').replace(/\/+$/, '');
      this.defaultModel = config.modelName || 'deepseek-chat';
    } else if (config.provider === 'deepinfra') {
      this.baseUrl = (config.baseUrl || 'https://api.deepinfra.com/v1/openai').replace(/\/+$/, '');
      this.defaultModel = config.modelName || 'meta-llama/Llama-3-70b-instruct';
    } else {
      this.baseUrl = (config.baseUrl || 'http://localhost:11434/v1').replace(/\/+$/, '');
      this.defaultModel = config.modelName || 'custom-model';
    }
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

    const payload = {
      model,
      messages: request.messages.map(m => ({
        role: m.role,
        content: m.content
      })),
      temperature: request.temperature ?? 0.7,
      max_tokens: request.maxTokens
    };

    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload)
    });

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

    const content = data.choices?.[0]?.message?.content || '';

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

    const payload = {
      model,
      messages: request.messages.map(m => ({
        role: m.role,
        content: m.content
      })),
      temperature: request.temperature ?? 0.7,
      stream: true
    };

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
                const delta = json.choices?.[0]?.delta?.content || '';
                if (delta) {
                  fullContent += delta;
                  onChunk(delta);
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

    return [
      {
        id: this.defaultModel,
        name: `Custom Model (${this.defaultModel})`,
        provider: 'custom',
        contextWindow: 32768,
        maxOutputTokens: 4096,
        supportsVision: false,
        supportsTools: true,
        supportsReasoning: false
      }
    ];
  }
}
