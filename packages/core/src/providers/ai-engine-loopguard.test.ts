import { describe, it, expect, vi, afterEach } from 'vitest';
import { AgentEngine, type AgentEvent } from './ai-engine.js';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

/**
 * Stubs global fetch to return an OpenAI-style SSE stream that emits ONE tool
 * call (a non-existent tool name, so execution is a harmless no-op "Unknown
 * tool" and never launches a real browser). The same call is returned on every
 * request, so the engine should hit the runaway-loop guard instead of calling
 * the provider MAX_ITERATIONS times.
 */
function stubRepeatingToolCall(toolName = 'nonexistent_tool', args = { url: 'https://x.com' }) {
  let callCount = 0;
  const sse =
    `data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_1","function":{"name":"${toolName}","arguments":""}}]}}]}\n` +
    `data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":${JSON.stringify(JSON.stringify(args))}}]}}]}\n` +
    `data: [DONE]\n`;

  vi.stubGlobal(
    'fetch',
    vi.fn(async () => {
      callCount++;
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new TextEncoder().encode(sse));
          controller.close();
        }
      });
      return {
        ok: true,
        status: 200,
        body: stream,
        async text() {
          return '';
        }
      } as any;
    })
  );
  return { calls: () => callCount };
}

describe('AgentEngine run() — runaway-loop guard', () => {
  it('stops early (not at MAX_ITERATIONS) when the same tool call repeats', async () => {
    const fetchInfo = stubRepeatingToolCall();
    const engine = new AgentEngine(
      { provider: 'openai', apiKey: 'k', model: 'gpt-4o' },
      'loop-guard-session'
    );

    const events: AgentEvent[] = [];
    await engine.run('hi', (e) => events.push(e));

    const errors = events.filter((e) => e.type === 'error');
    const dones = events.filter((e) => e.type === 'done');

    expect(dones.length).toBe(0);
    expect(errors.length).toBeGreaterThanOrEqual(1);
    expect(errors[0].error).toMatch(/repeating the same tool call/i);
    // 3 identical turns → guard trips on the 3rd; must be well under MAX_ITERATIONS (10).
    expect(fetchInfo.calls()).toBeLessThan(10);
    expect(fetchInfo.calls()).toBeGreaterThanOrEqual(3);
  });

  it('does NOT trip the guard for a normal single tool turn that then finishes', async () => {
    // First call returns a tool call, second call returns plain text (no tool).
    let callCount = 0;
    const toolSse =
      `data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_1","function":{"name":"nonexistent_tool","arguments":""}}]}}]}\n` +
      `data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":"{}"}]}}]}\n` +
      `data: [DONE]\n`;
    const textSse = `data: {"choices":[{"delta":{"content":"all done"}}]}\n` + `data: [DONE]\n`;
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        const sse = callCount++ === 0 ? toolSse : textSse;
        const stream = new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(new TextEncoder().encode(sse));
            controller.close();
          }
        });
        return { ok: true, status: 200, body: stream, async text() { return ''; } } as any;
      })
    );

    const engine = new AgentEngine(
      { provider: 'openai', apiKey: 'k', model: 'gpt-4o' },
      'no-loop-session'
    );
    const events: AgentEvent[] = [];
    await engine.run('hi', (e) => events.push(e));

    expect(events.some((e) => e.type === 'error')).toBe(false);
    expect(events.some((e) => e.type === 'done')).toBe(true);
  });
});

import { sanitizeRepetitiveContent, toOpenAIMessages } from './multimodal.js';

describe('sanitizeRepetitiveContent & history sanitization', () => {
  it('strips repetitive token loops from corrupted assistant responses', () => {
    const corrupted = "Hi there! I am happy to help. HiHiHiHiHiHiHiHiHiHiHiHiHiHiHiHiHi";
    const cleaned = sanitizeRepetitiveContent(corrupted);
    expect(cleaned).toBe("Hi there! I am happy to help.");
  });

  it('sanitizes prior assistant history messages before sending to models', () => {
    const history = [
      { role: 'user' as const, content: 'hi' },
      { role: 'assistant' as const, content: "Hello! How can I assist? 'm Super'm Super'm Super'm Super'm Super" }
    ];

    const messages = toOpenAIMessages(history as any);
    expect(messages[1].content).toBe("Hello! How can I assist?");
  });
});
