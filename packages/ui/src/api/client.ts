import { ModelConfig, ServerConfig } from '../types.js';

export type EventCallback = (event: {
  type: 'token' | 'tool_call' | 'tool_output' | 'error' | 'finished';
  data: any;
}) => void;

export class SuperAgentApiClient {
  private config: ServerConfig;

  constructor(config: ServerConfig) {
    this.config = config;
  }

  public getBaseUrl(): string {
    const protocol = typeof window !== 'undefined' && window.location.protocol === 'https:' ? 'https' : 'http';
    const host = this.config.host || (typeof window !== 'undefined' ? window.location.hostname : 'localhost');
    return `${protocol}://${host}:${this.config.port}`;
  }

  public async checkHealth(): Promise<boolean> {
    try {
      const res = await fetch(`${this.getBaseUrl()}/health`, { signal: AbortSignal.timeout(3000) });
      return res.ok;
    } catch {
      return false;
    }
  }

  public async streamAgentRun(
    userPrompt: string,
    modelConfig: ModelConfig,
    systemPrompt?: string,
    onEvent?: EventCallback
  ): Promise<void> {
    const endpoint = `${this.getBaseUrl()}/api/agent/stream`;
    
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_prompt: userPrompt,
          system_prompt: systemPrompt,
          provider: modelConfig.provider,
          model_id: modelConfig.modelId,
          api_key: modelConfig.apiKey,
          base_url: modelConfig.baseUrl,
          temperature: modelConfig.temperature
        })
      });

      if (!response.ok || !response.body) {
        throw new Error(`HTTP error ${response.status}: ${response.statusText}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed.startsWith('data: ')) {
            const rawJson = trimmed.slice(6);
            if (rawJson === '[DONE]') break;
            try {
              const parsed = JSON.parse(rawJson);
              if (onEvent) onEvent(parsed);
            } catch (err) {
              console.warn('[ApiClient] Failed to parse SSE JSON:', rawJson, err);
            }
          }
        }
      }
    } catch (err: any) {
      if (onEvent) {
        onEvent({
          type: 'error',
          data: { message: err?.message || 'Network streaming request failed' }
        });
      }
    }
  }
}
