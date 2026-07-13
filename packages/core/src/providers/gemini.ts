import {
  BaseProviderAdapter,
  BYOKConfig,
  CompletionRequest,
  CompletionResponse,
  ModelCapability,
  AIProvider
} from '../types/agent.js';

/** Provider adapter for the Google Gemini Generative Language API. */
export class GeminiAdapter implements BaseProviderAdapter {
  public readonly provider: AIProvider = 'gemini';
  private apiKey: string;
  private baseUrl: string;
  private defaultModel: string;

  constructor(config: BYOKConfig) {
    this.apiKey = config.apiKey;
    this.baseUrl = (config.baseUrl || 'https://generativelanguage.googleapis.com').replace(/\/+$/, '');
    this.defaultModel = config.modelName || 'gemini-2.5-flash';
  }

  public async complete(request: CompletionRequest): Promise<CompletionResponse> {
    const model = request.model || this.defaultModel;
    const url = `${this.baseUrl}/v1beta/models/${model}:generateContent`;

    let systemText = '';
    const contents: Array<{ role: string; parts: Array<{ text: string }> }> = [];

    for (const msg of request.messages) {
      if (msg.role === 'system') {
        systemText = systemText ? `${systemText}\n${msg.content}` : msg.content;
      } else {
        const geminiRole = msg.role === 'assistant' ? 'model' : 'user';
        contents.push({
          role: geminiRole,
          parts: [{ text: msg.content }]
        });
      }
    }

    if (contents.length === 0) {
      contents.push({ role: 'user', parts: [{ text: 'Hello' }] });
    }

    const payload: Record<string, unknown> = {
      contents,
      generationConfig: {
        temperature: request.temperature ?? 0.7,
        maxOutputTokens: request.maxTokens
      }
    };

    if (systemText) {
      payload.systemInstruction = {
        parts: [{ text: systemText }]
      };
    }

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': this.apiKey
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Gemini API error [${response.status}]: ${errorText}`);
    }

    const data = await response.json() as {
      candidates?: Array<{
        content?: {
          parts?: Array<{ text?: string }>;
        };
      }>;
      usageMetadata?: {
        promptTokenCount: number;
        candidatesTokenCount: number;
        totalTokenCount: number;
      };
    };

    const parts = data.candidates?.[0]?.content?.parts || [];
    const content = parts.map(p => p.text || '').join('');

    return {
      id: `gemini-${Date.now()}`,
      provider: 'gemini',
      model,
      content,
      usage: data.usageMetadata ? {
        promptTokens: data.usageMetadata.promptTokenCount,
        completionTokens: data.usageMetadata.candidatesTokenCount,
        totalTokens: data.usageMetadata.totalTokenCount
      } : undefined
    };
  }

  public async streamComplete(
    request: CompletionRequest,
    onChunk: (chunk: string) => void
  ): Promise<CompletionResponse> {
    const model = request.model || this.defaultModel;
    const url = `${this.baseUrl}/v1beta/models/${model}:streamGenerateContent?alt=sse`;

    let systemText = '';
    const contents: Array<{ role: string; parts: Array<{ text: string }> }> = [];

    for (const msg of request.messages) {
      if (msg.role === 'system') {
        systemText = systemText ? `${systemText}\n${msg.content}` : msg.content;
      } else {
        const geminiRole = msg.role === 'assistant' ? 'model' : 'user';
        contents.push({
          role: geminiRole,
          parts: [{ text: msg.content }]
        });
      }
    }

    const payload: Record<string, unknown> = {
      contents,
      generationConfig: {
        temperature: request.temperature ?? 0.7,
        maxOutputTokens: request.maxTokens
      }
    };

    if (systemText) {
      payload.systemInstruction = {
        parts: [{ text: systemText }]
      };
    }

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': this.apiKey
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Gemini API stream error [${response.status}]: ${errorText}`);
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
                const text = json.candidates?.[0]?.content?.parts?.[0]?.text || '';
                if (text) {
                  fullContent += text;
                  onChunk(text);
                }
              } catch {
                // ignore parsing SSE chunk errors
              }
            }
          }
        }
      }
    }

    return {
      id: `gemini-stream-${Date.now()}`,
      provider: 'gemini',
      model,
      content: fullContent
    };
  }

  public async listModels(): Promise<ModelCapability[]> {
    return [
      {
        id: 'gemini-2.5-flash',
        name: 'Gemini 2.5 Flash',
        provider: 'gemini',
        contextWindow: 1000000,
        maxOutputTokens: 8192,
        supportsVision: true,
        supportsTools: true,
        supportsReasoning: true
      },
      {
        id: 'gemini-1.5-pro',
        name: 'Gemini 1.5 Pro',
        provider: 'gemini',
        contextWindow: 2000000,
        maxOutputTokens: 8192,
        supportsVision: true,
        supportsTools: true,
        supportsReasoning: false
      },
      {
        id: 'gemini-1.5-flash',
        name: 'Gemini 1.5 Flash',
        provider: 'gemini',
        contextWindow: 1000000,
        maxOutputTokens: 8192,
        supportsVision: true,
        supportsTools: true,
        supportsReasoning: false
      }
    ];
  }
}
