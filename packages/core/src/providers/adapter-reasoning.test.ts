import { describe, it, expect, vi, afterEach } from 'vitest';
import { OpenAIAdapter } from './openai.js';
import { AnthropicAdapter } from './anthropic.js';
import { GeminiAdapter } from './gemini.js';
import { CustomAdapter } from './custom.js';
import type { CompletionRequest } from '../types/agent.js';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function fakeOkResponse() {
  return {
    ok: true,
    async json() {
      return { id: 'x', choices: [{ message: { content: 'answer' } }] };
    },
    async text() {
      return '';
    }
  };
}

function captureFetch(): { body: () => any } {
  let captured: any;
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_url: string, init: any) => {
      captured = JSON.parse(init.body);
      return fakeOkResponse();
    })
  );
  return { body: () => captured };
}

const baseReq = (effort?: 'low' | 'medium' | 'high'): CompletionRequest => ({
  messages: [{ role: 'user', content: 'prove this theorem' }],
  maxTokens: 4096,
  reasoningEffort: effort
});

describe('adapter reasoning-effort injection (end-to-end via mocked fetch)', () => {
  it('OpenAI adapter sends reasoning_effort and omits it when unset', async () => {
    let cap = captureFetch();
    const adapter = new OpenAIAdapter({ provider: 'openai', apiKey: 'k', modelName: 'o3-mini' });
    await adapter.complete(baseReq('high'));
    expect(cap.body().reasoning_effort).toBe('high');

    cap = captureFetch();
    await adapter.complete(baseReq(undefined));
    expect(cap.body().reasoning_effort).toBeUndefined();
  });

  it('DeepSeek (CustomAdapter) sends reasoning_effort', async () => {
    const cap = captureFetch();
    const adapter = new CustomAdapter({ provider: 'deepseek', apiKey: 'k', modelName: 'deepseek-reasoner' });
    await adapter.complete(baseReq('medium'));
    expect(cap.body().reasoning_effort).toBe('medium');
  });

  it('Anthropic adapter enables thinking and forces temperature 1.0', async () => {
    const cap = captureFetch();
    const adapter = new AnthropicAdapter({ provider: 'anthropic', apiKey: 'k', modelName: 'claude-3-7-sonnet-20250219' });
    await adapter.complete(baseReq('high'));
    expect(cap.body().thinking).toEqual({ type: 'enabled', budget_tokens: 4095 });
    expect(cap.body().temperature).toBe(1);
  });

  it('Gemini adapter deep-merges thinkingConfig into generationConfig', async () => {
    const cap = captureFetch();
    const adapter = new GeminiAdapter({ provider: 'gemini', apiKey: 'k', modelName: 'gemini-2.5-flash' });
    await adapter.complete(baseReq('low'));
    expect(cap.body().generationConfig.thinkingConfig).toEqual({
      thinkingBudget: 1024,
      includeThoughts: false
    });
    expect(cap.body().generationConfig.temperature).toBe(0.7);
  });
});
