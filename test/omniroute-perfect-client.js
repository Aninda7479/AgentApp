import { TextDecoder } from 'util';

const DEFAULT_BASE_URL = 'http://127.0.0.1:20128/v1';
const DEFAULT_API_KEY = 'sk-0c5cf9a3af701b2e-329358-00864672';
const DEFAULT_MODEL = 'oc/big-pickle';

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

/**
 * Production-Grade OmniRoute Provider Client for oc/big-pickle & OmniRoute models
 */
export class OmniRouteClient {
  constructor(options = {}) {
    this.baseUrl = (options.baseUrl || DEFAULT_BASE_URL).replace(/\/+$/, '');
    this.apiKey = options.apiKey || DEFAULT_API_KEY;
    this.defaultModel = options.model || DEFAULT_MODEL;
    this.maxRetries = options.maxRetries ?? 3;
    this.retryDelayMs = options.retryDelayMs ?? 2000;
  }

  getHeaders() {
    return {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${this.apiKey}`
    };
  }

  async listModels() {
    const res = await fetch(`${this.baseUrl}/models`, {
      headers: this.getHeaders()
    });
    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`OmniRoute listModels failed (${res.status}): ${errText}`);
    }
    const data = await res.json();
    return data.data || [];
  }

  sanitizePayload(payload) {
    const sanitized = {
      model: payload.model || this.defaultModel,
      messages: payload.messages || []
    };

    if (payload.max_completion_tokens) {
      sanitized.max_completion_tokens = payload.max_completion_tokens;
    }

    if (payload.tools && Array.isArray(payload.tools) && payload.tools.length > 0) {
      sanitized.tools = payload.tools;
    }

    if (payload.reasoning_effort) {
      sanitized.reasoning_effort = payload.reasoning_effort;
    }

    return sanitized;
  }

  async chatCompletion(payload, onChunk = null) {
    const sanitized = this.sanitizePayload(payload);
    let attempt = 0;

    while (attempt <= this.maxRetries) {
      attempt++;
      try {
        const res = await fetch(`${this.baseUrl}/chat/completions`, {
          method: 'POST',
          headers: this.getHeaders(),
          body: JSON.stringify(sanitized)
        });

        if (!res.ok) {
          const errText = await res.text();
          if ((res.status >= 500 || res.status === 429) && attempt <= this.maxRetries) {
            await sleep(this.retryDelayMs * attempt);
            continue;
          }
          throw new Error(`OmniRoute API Error (${res.status}): ${errText}`);
        }

        if (!res.body) {
          throw new Error('Response body is null');
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let accumulatedContent = '';
        let accumulatedReasoning = '';
        const toolCallsMap = new Map();

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed || trimmed.startsWith(':')) continue;
            if (trimmed === 'data: [DONE]') continue;

            if (trimmed.startsWith('data: ')) {
              const jsonStr = trimmed.slice(6);
              try {
                const parsed = JSON.parse(jsonStr);
                const delta = parsed.choices?.[0]?.delta;
                if (!delta) continue;

                if (delta.content) {
                  accumulatedContent += delta.content;
                  if (onChunk) onChunk(delta.content);
                }

                if (delta.reasoning || delta.thinking) {
                  accumulatedReasoning += (delta.reasoning || delta.thinking);
                }

                if (delta.tool_calls && Array.isArray(delta.tool_calls)) {
                  for (const tc of delta.tool_calls) {
                    const index = tc.index ?? 0;
                    if (!toolCallsMap.has(index)) {
                      toolCallsMap.set(index, {
                        id: tc.id || '',
                        type: tc.type || 'function',
                        function: {
                          name: tc.function?.name || '',
                          arguments: tc.function?.arguments || ''
                        }
                      });
                    } else {
                      const existing = toolCallsMap.get(index);
                      if (tc.id) existing.id = tc.id;
                      if (tc.function?.name) existing.function.name += tc.function.name;
                      if (tc.function?.arguments) existing.function.arguments += tc.function.arguments;
                    }
                  }
                }
              } catch (err) {
                // Ignore partial line JSON parse errors
              }
            }
          }
        }

        return {
          content: accumulatedContent,
          reasoning: accumulatedReasoning,
          toolCalls: toolCallsMap.size > 0 ? Array.from(toolCallsMap.values()) : undefined
        };

      } catch (err) {
        if (attempt <= this.maxRetries && err.message.includes('500')) {
          await sleep(this.retryDelayMs * attempt);
        } else {
          throw err;
        }
      }
    }
  }
}
