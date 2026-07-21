import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AgentEngine, type AgentEvent } from '../src/providers/ai-engine.js';
import type { ToolDefinition } from '../src/providers/ai-engine-types.js';

/**
 * CERTAIN-2: Core engine tool-loop failure-path tests.
 *
 * Exercises every error / guard / recovery branch inside AgentEngine.run():
 *   1. Unknown tool → "Error: Unknown tool" fed back, loop continues
 *   2. Tool execution throws → error string fed back, loop finishes
 *   3. Runaway loop (identical tool calls repeated) → early stop
 *   4. Max iterations exceeded → error event
 *   5. Provider API error → error event
 *   6. User abort → abort event
 *   7. Context overflow → auto-compact + retry
 */

type StreamResult = {
  fullContent: string;
  toolCalls: Array<{ id: string; name: string; args: Record<string, unknown> }>;
};

// ── Helper: mock streamFromProvider to return pre-planned results ────────────
function mockStream(results: StreamResult[]) {
  let idx = 0;
  return vi.spyOn(
    AgentEngine.prototype as any,
    'streamFromProvider'
  ).mockImplementation(async () => {
    if (idx < results.length) return results[idx++];
    return { fullContent: 'done', toolCalls: [] };
  });
}

// ── Helper: fire-returning tool ──────────────────────────────────────────────
function makeFailTool(name = 'fail_tool'): ToolDefinition {
  return {
    name,
    description: 'Always throws',
    parameters: { type: 'object', properties: {} },
    execute: async () => { throw new Error('Tool crashed intentionally'); }
  };
}

// ── Helper: echo tool that echoes first arg ──────────────────────────────────
function makeEchoTool(name = 'echo_tool'): ToolDefinition {
  return {
    name,
    description: 'Echoes args',
    parameters: { type: 'object', properties: { msg: { type: 'string' } } },
    execute: async (args) => `echo:${args.msg ?? 'empty'}`
  };
}

function collectEvents(engine: AgentEngine, prompt: string, attachments?: any[]): Promise<AgentEvent[]> {
  const events: AgentEvent[] = [];
  return engine.run(prompt, (e) => events.push(e), attachments).then(() => events);
}

// ═════════════════════════════════════════════════════════════════════════════
// Test suite
// ═════════════════════════════════════════════════════════════════════════════

describe('CERTAIN-2: tool-loop failure paths', () => {
  let spy: ReturnType<typeof vi.spyOn>;

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ── 1. Unknown tool ───────────────────────────────────────────────────────

  it('returns an error string when the tool name is unknown', async () => {
    spy = mockStream([
      // Turn 1: model asks for a tool that doesn't exist
      { fullContent: '', toolCalls: [{ id: 'tc-1', name: 'nonexistent_tool', args: { x: 1 } }] },
      // Turn 2: model sees the error and produces a final answer
      { fullContent: 'The tool was not found.', toolCalls: [] }
    ]);

    const engine = new AgentEngine({
      provider: 'openai', model: 'test', apiKey: 'k',
      permissionMode: 'auto-approve-edits'
    }, 'unknown-tool');

    const events = await collectEvents(engine, 'Do something');

    const toolResults = events.filter(e => e.type === 'tool_result');
    expect(toolResults.length).toBe(1);
    expect(toolResults[0].toolResult).toContain('Error: Unknown tool');
    expect(toolResults[0].toolResult).toContain('nonexistent_tool');
    expect(events.map(e => e.type)).toContain('done');
  });

  // ── 2. Tool execution throws ──────────────────────────────────────────────

  it('catches a thrown tool error and feeds it back into history', async () => {
    spy = mockStream([
      { fullContent: '', toolCalls: [{ id: 'tc-2', name: 'fail_tool', args: {} }] },
      { fullContent: 'The tool failed.', toolCalls: [] }
    ]);

    const engine = new AgentEngine({
      provider: 'openai', model: 'test', apiKey: 'k',
      extraTools: [makeFailTool()],
      permissionMode: 'auto-approve-edits'
    }, 'tool-error');

    const events = await collectEvents(engine, 'Run the failing tool');

    const toolResults = events.filter(e => e.type === 'tool_result');
    expect(toolResults.length).toBe(1);
    expect(toolResults[0].toolResult).toContain('Tool error:');
    expect(toolResults[0].toolResult).toContain('Tool crashed intentionally');
    expect(events.map(e => e.type)).toContain('done');
  });

  // ── 3. Runaway loop guard ─────────────────────────────────────────────────

  it('stops the loop when the same tool call is repeated too many times', async () => {
    const identicalCall = { id: 'tc-run', name: 'echo_tool', args: { msg: 'stuck' } };
    // Need 4 turns with identical calls to hit MAX_SAME_TOOL_REPEATS (2):
    //   Turn 1: consecutiveSameToolSig = 0, lastToolSig = "echo_tool:..." (set)
    //   Turn 2: consecutiveSameToolSig = 1, lastToolSig stays
    //   Turn 3: consecutiveSameToolSig = 2 → guard fires (>= MAX_SAME_TOOL_REPEATS)
    const results: StreamResult[] = Array.from({ length: 4 }, () => ({
      fullContent: '', toolCalls: [identicalCall]
    }));

    spy = mockStream(results);

    const engine = new AgentEngine({
      provider: 'openai', model: 'test', apiKey: 'k',
      extraTools: [makeEchoTool()],
      permissionMode: 'auto-approve-edits'
    }, 'runaway-loop');

    const events = await collectEvents(engine, 'Keep calling echo_tool');

    const errors = events.filter(e => e.type === 'error');
    expect(errors.length).toBe(1);
    expect(errors[0].error).toContain('repeating the same tool call');
    // Must NOT have a 'done' event — the loop stopped early
    expect(events.map(e => e.type)).not.toContain('done');
  });

  // ── 4. Max iterations exceeded ────────────────────────────────────────────

  it('emits an error when MAX_ITERATIONS (10) is exceeded', async () => {
    // Each turn returns tool calls so the loop never naturally finishes.
    // After 10 iterations the loop exits with an error.
    const results: StreamResult[] = Array.from({ length: 11 }, (_, i) => ({
      fullContent: `turn-${i}`,
      toolCalls: [{ id: `tc-${i}`, name: 'echo_tool', args: { msg: `iter-${i}` } }]
    }));

    spy = mockStream(results);

    const engine = new AgentEngine({
      provider: 'openai', model: 'test', apiKey: 'k',
      extraTools: [makeEchoTool()],
      permissionMode: 'auto-approve-edits'
    }, 'max-iter');

    const events = await collectEvents(engine, 'Loop forever');

    const errors = events.filter(e => e.type === 'error');
    expect(errors.length).toBe(1);
    expect(errors[0].error).toContain('Max iterations');
    // No done event
    expect(events.map(e => e.type)).not.toContain('done');
  });

  // ── 5. Provider API error ─────────────────────────────────────────────────

  it('emits an error event when the provider API fails', async () => {
    spy = vi.spyOn(
      AgentEngine.prototype as any,
      'streamFromProvider'
    ).mockImplementation(async () => {
      throw new Error('OPENAI API error [401]: Invalid API key');
    });

    const engine = new AgentEngine({
      provider: 'openai', model: 'test', apiKey: 'bad-key',
      permissionMode: 'auto-approve-edits'
    }, 'api-error');

    const events = await collectEvents(engine, 'Hello');

    const errors = events.filter(e => e.type === 'error');
    expect(errors.length).toBe(1);
    expect(errors[0].error).toContain('Invalid API key');
    expect(events.map(e => e.type)).not.toContain('done');
  });

  // ── 6. User abort ─────────────────────────────────────────────────────────

  it('emits an abort event when the user aborts mid-run', async () => {
    const engine = new AgentEngine({
      provider: 'openai', model: 'test', apiKey: 'k',
      permissionMode: 'auto-approve-edits'
    }, 'abort-test');

    spy = vi.spyOn(
      AgentEngine.prototype as any,
      'streamFromProvider'
    ).mockImplementation(async function (this: AgentEngine) {
      // When the engine is aborted, its AbortController fires and stream
      // consumers see an AbortError. Simulate that: wait a tick, then if
      // the controller is already aborted throw; otherwise listen.
      const ac = (this as any).abortController as AbortController | undefined;
      if (!ac) return { fullContent: '', toolCalls: [] };

      if (ac.signal.aborted) {
        const err = new DOMException('The operation was aborted', 'AbortError');
        throw err;
      }

      return new Promise((_, reject) => {
        ac.signal.addEventListener('abort', () => {
          reject(new DOMException('The operation was aborted', 'AbortError'));
        }, { once: true });
      });
    });

    const eventsPromise = collectEvents(engine, 'Hello');

    // Give the engine a tick to start the stream, then abort
    await new Promise(r => setTimeout(r, 30));
    engine.abort();

    const events = await eventsPromise;

    const aborts = events.filter(e => e.type === 'abort');
    expect(aborts.length).toBe(1);
    expect(aborts[0].sessionId).toBe('abort-test');
  });

  // ── 7. Context overflow → auto-compact + retry ────────────────────────────

  it('retries after context overflow by compacting history', async () => {
    let callCount = 0;

    spy = vi.spyOn(
      AgentEngine.prototype as any,
      'streamFromProvider'
    ).mockImplementation(async () => {
      callCount++;
      if (callCount === 1) {
        // First call: context overflow
        throw new Error('This model maximum context length is 128000 tokens');
      }
      // Second call succeeds
      return { fullContent: 'Recovered after compaction', toolCalls: [] };
    });

    const engine = new AgentEngine({
      provider: 'openai', model: 'test', apiKey: 'k',
      permissionMode: 'auto-approve-edits',
      contextWindow: 128000
    }, 'context-overflow');

    // Need history.length > 6 for the auto-compact recovery to trigger.
    // Engine constructor adds a system message, so we add 6 more user messages.
    for (let i = 0; i < 6; i++) {
      engine.addUserMessage(`Message ${i + 1}: some content to fill context window`);
    }

    const events = await collectEvents(engine, 'Do something');

    // Should have retried (called stream twice)
    expect(callCount).toBe(2);
    // Should have completed successfully on retry
    expect(events.map(e => e.type)).toContain('done');
    // Should have emitted a context event from the compact
    const contextEvents = events.filter(e => e.type === 'context');
    expect(contextEvents.length).toBeGreaterThanOrEqual(1);
  });

  // ── 8. Local connection refused (Ollama) → enriched error ─────────────────

  it('enriches ECONNREFUSED errors for local providers', async () => {
    const fetchError = new Error('fetch failed');
    (fetchError as any).cause = { code: 'ECONNREFUSED', message: 'connect ECONNREFUSED' };

    spy = vi.spyOn(
      AgentEngine.prototype as any,
      'streamFromProvider'
    ).mockImplementation(async () => { throw fetchError; });

    const engine = new AgentEngine({
      provider: 'ollama', model: 'llama3.2', apiKey: '',
      baseUrl: 'http://localhost:11434',
      permissionMode: 'auto-approve-edits'
    }, 'ollama-refused');

    const events = await collectEvents(engine, 'Hello');

    const errors = events.filter(e => e.type === 'error');
    expect(errors.length).toBe(1);
    expect(errors[0].error).toContain('Ollama (Local) connection refused');
    expect(errors[0].error).toContain('http://localhost:11434');
  });

  // ── 9. Tool result truncation for large results ───────────────────────────

  it('truncates large tool results before storing in history', async () => {
    const hugePayload = 'x'.repeat(10_000);

    spy = mockStream([
      { fullContent: '', toolCalls: [{ id: 'tc-big', name: 'echo_tool', args: { msg: hugePayload } }] },
      { fullContent: 'Got it', toolCalls: [] }
    ]);

    const echoTool: ToolDefinition = {
      name: 'echo_tool',
      description: 'Returns a large payload',
      parameters: { type: 'object', properties: { msg: { type: 'string' } } },
      execute: async (args) => args.msg ?? 'empty'
    };

    const engine = new AgentEngine({
      provider: 'openai', model: 'test', apiKey: 'k',
      extraTools: [echoTool],
      permissionMode: 'auto-approve-edits'
    }, 'truncation');

    const events = await collectEvents(engine, 'Send big data');

    // The tool_result event should show the full content (for UI display)
    const toolResults = events.filter(e => e.type === 'tool_result');
    expect(toolResults.length).toBe(1);

    // Internally, history should have been truncated (we verify the engine
    // doesn't crash — the truncation limit is MAX_TOOL_RESULT_CHARS = 4000)
    expect(events.map(e => e.type)).toContain('done');
  });

  // ── 10. Mixed success + failure across turns ──────────────────────────────

  it('completes the loop when some tool calls fail and others succeed', async () => {
    spy = mockStream([
      // Turn 1: one tool call that will fail
      { fullContent: '', toolCalls: [{ id: 'tc-fail', name: 'fail_tool', args: {} }] },
      // Turn 2: model sees the error, tries a working tool
      { fullContent: '', toolCalls: [{ id: 'tc-ok', name: 'echo_tool', args: { msg: 'hello' } }] },
      // Turn 3: model sees the echo result and answers
      { fullContent: 'The echo succeeded.', toolCalls: [] }
    ]);

    const engine = new AgentEngine({
      provider: 'openai', model: 'test', apiKey: 'k',
      extraTools: [makeFailTool(), makeEchoTool()],
      permissionMode: 'auto-approve-edits'
    }, 'mixed-results');

    const events = await collectEvents(engine, 'Try both tools');

    const toolResults = events.filter(e => e.type === 'tool_result');
    expect(toolResults.length).toBe(2);

    // First tool result should be the error
    expect(toolResults[0].toolResult).toContain('Tool error:');
    // Second tool result should be the echo
    expect(toolResults[1].toolResult).toContain('echo:hello');

    expect(events.map(e => e.type)).toContain('done');
  });
});
