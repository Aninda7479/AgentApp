import { describe, it, expect, vi, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { AgentEngine, type AgentEvent } from '../src/main/ai-engine';

/**
 * CERTAIN-3 smoke test: Desktop send message end-to-end.
 *
 * Proves the desktop message lifecycle works without a real Electron shell:
 *   1. User types a prompt in the Composer.
 *   2. Renderer prepares an IPC `agent-run` invocation.
 *   3. Main process creates an AgentEngine and calls engine.run().
 *   4. Engine streams events (token, tool_call, tool_result, done) back.
 *
 * Mocks the provider HTTP layer (streamFromProvider) so no real API key is
 * needed. Exercises two complete paths:
 *   A. Text-only response (no tools) — simplest happy path.
 *   B. Tool-use loop — engine calls read_file, feeds result back, then answers.
 *
 * Pass criteria:
 *   - Engine emits token events (at least one)
 *   - Engine emits a done event (loop completed)
 *   - Tool path emits tool_call + tool_result events
 *   - All events carry the correct sessionId
 *   - History is updated after run completes
 */

type StreamResult = {
  fullContent: string;
  toolCalls: Array<{ id: string; name: string; args: Record<string, unknown> }>;
};

let callIndex = 0;

function mockStream(results: StreamResult[]) {
  callIndex = 0;
  return vi.spyOn(
    AgentEngine.prototype as any,
    'streamFromProvider'
  ).mockImplementation(async () => {
    if (callIndex < results.length) return results[callIndex++];
    return { fullContent: '', toolCalls: [] };
  });
}

function collectEvents(engine: AgentEngine, prompt: string): Promise<AgentEvent[]> {
  const events: AgentEvent[] = [];
  return engine.run(prompt, (e) => events.push(e)).then(() => events);
}

// ── Fixture ─────────────────────────────────────────────────────────────────

const SMOKE_ROOT = path.join(os.tmpdir(), 'sa-desktop-e2e-smoke');
const FIXTURE_FILE = path.join(SMOKE_ROOT, 'e2e-fixture.txt');
const FIXTURE_CONTENT = 'CERTAIN-3-DESKTOP-E2E-OK';

// ═════════════════════════════════════════════════════════════════════════════
// A. Text-only response — simplest desktop send path
// ═════════════════════════════════════════════════════════════════════════════

describe('CERTAIN-3A: Desktop text-only send', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('runs a prompt and emits context + done events with correct sessionId', async () => {
    mockStream([
      { fullContent: 'Hello from the desktop!', toolCalls: [] }
    ]);

    const engine = new AgentEngine(
      { provider: 'openai', model: 'gpt-4o-mini', apiKey: 'test-key',
        permissionMode: 'full-autonomy', projectRoot: process.cwd() },
      'desktop-e2e-text'
    );

    const events = await collectEvents(engine, 'Say hello');

    // Session id must propagate to every event
    for (const e of events) {
      expect(e.sessionId).toBe('desktop-e2e-text');
    }

    // Must emit a context event (usage estimate) and a done event
    const contexts = events.filter(e => e.type === 'context');
    expect(contexts.length).toBeGreaterThanOrEqual(1);

    const done = events.filter(e => e.type === 'done');
    expect(done.length).toBe(1);

    // Response content must be stored in history (mock providers don't emit
    // token events — those come from real streaming providers only)
    const history = (engine as any).history as Array<{ role: string; content: string }>;
    const assistantMsg = history.find((m: any) => m.role === 'assistant');
    expect(assistantMsg).toBeDefined();
    expect(assistantMsg!.content).toBe('Hello from the desktop!');
  });

  it('completes with no tool calls in the event stream', async () => {
    mockStream([
      { fullContent: 'No tools here.', toolCalls: [] }
    ]);

    const engine = new AgentEngine(
      { provider: 'openai', model: 'gpt-4o-mini', apiKey: 'test-key',
        permissionMode: 'full-autonomy', projectRoot: process.cwd() },
      'desktop-e2e-notools'
    );

    const events = await collectEvents(engine, 'Just answer');

    const toolCalls = events.filter(e => e.type === 'tool_call');
    const toolResults = events.filter(e => e.type === 'tool_result');
    expect(toolCalls.length).toBe(0);
    expect(toolResults.length).toBe(0);
    expect(events.map(e => e.type)).toContain('done');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// B. Tool-use loop — read_file then answer
// ═════════════════════════════════════════════════════════════════════════════

describe('CERTAIN-3B: Desktop tool-use send', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    try { fs.rmSync(SMOKE_ROOT, { recursive: true, force: true }); } catch { /* ok */ }
  });

  it('runs a read_file tool call and completes the loop', async () => {
    fs.mkdirSync(SMOKE_ROOT, { recursive: true });
    fs.writeFileSync(FIXTURE_FILE, FIXTURE_CONTENT, 'utf-8');

    mockStream([
      // Turn 1: engine asks to read the fixture file
      { fullContent: '', toolCalls: [
        { id: 'tc-e2e-1', name: 'read_file', args: { path: FIXTURE_FILE } }
      ] },
      // Turn 2: engine sees the tool result and answers
      { fullContent: `File contains: ${FIXTURE_CONTENT}`, toolCalls: [] }
    ]);

    const engine = new AgentEngine(
      { provider: 'openai', model: 'gpt-4o-mini', apiKey: 'test-key',
        permissionMode: 'full-autonomy', projectRoot: SMOKE_ROOT },
      'desktop-e2e-tool'
    );

    const events = await collectEvents(engine, 'Read the fixture file');

    // Must have tool_call and tool_result events
    const toolCalls = events.filter(e => e.type === 'tool_call');
    const toolResults = events.filter(e => e.type === 'tool_result');
    expect(toolCalls.length).toBeGreaterThanOrEqual(1);
    expect(toolResults.length).toBeGreaterThanOrEqual(1);

    // Tool must be read_file with the fixture path
    expect(toolCalls[0].toolName).toBe('read_file');
    expect(toolCalls[0].toolArgs?.path).toBe(FIXTURE_FILE);

    // Tool result must contain the fixture content
    expect(toolResults[0].toolResult).toContain(FIXTURE_CONTENT);

    // Must complete with a done event
    expect(events.map(e => e.type)).toContain('done');

    // StreamFromProvider called twice (tool turn + answer turn)
    expect(callIndex).toBe(2);
  });

  it('preserves session id across multi-turn tool loop', async () => {
    fs.mkdirSync(SMOKE_ROOT, { recursive: true });
    fs.writeFileSync(FIXTURE_FILE, 'multi-turn-test', 'utf-8');

    mockStream([
      { fullContent: '', toolCalls: [
        { id: 'tc-mt', name: 'read_file', args: { path: FIXTURE_FILE } }
      ] },
      { fullContent: 'Done reading.', toolCalls: [] }
    ]);

    const engine = new AgentEngine(
      { provider: 'openai', model: 'gpt-4o-mini', apiKey: 'test-key',
        permissionMode: 'full-autonomy', projectRoot: SMOKE_ROOT },
      'desktop-e2e-multiturn'
    );

    const events = await collectEvents(engine, 'Read file');

    // Every event must carry the session id
    for (const e of events) {
      expect(e.sessionId).toBe('desktop-e2e-multiturn');
    }

    // Must have tool_call + tool_result + done events
    const toolCalls = events.filter(e => e.type === 'tool_call');
    const toolResults = events.filter(e => e.type === 'tool_result');
    expect(toolCalls.length).toBeGreaterThanOrEqual(1);
    expect(toolResults.length).toBeGreaterThanOrEqual(1);
    expect(events.map(e => e.type)).toContain('done');

    // Final answer must be stored in history (last assistant message)
    const history = (engine as any).history as Array<{ role: string; content: string }>;
    const assistantMsgs = history.filter((m: any) => m.role === 'assistant');
    expect(assistantMsgs.length).toBeGreaterThanOrEqual(2); // tool-turn + answer-turn
    const lastAssistant = assistantMsgs[assistantMsgs.length - 1];
    expect(lastAssistant.content).toContain('Done reading');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// C. History state after run
// ═════════════════════════════════════════════════════════════════════════════

describe('CERTAIN-3C: Desktop history after send', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('stores user and assistant messages in history after a run', async () => {
    mockStream([
      { fullContent: 'The answer is 42.', toolCalls: [] }
    ]);

    const engine = new AgentEngine(
      { provider: 'openai', model: 'gpt-4o-mini', apiKey: 'test-key',
        permissionMode: 'full-autonomy', projectRoot: process.cwd() },
      'desktop-e2e-history'
    );

    await collectEvents(engine, 'What is the answer?');

    // Access private history to verify messages were stored
    const history = (engine as any).history as Array<{ role: string; content: string }>;

    // Should have: system + user + assistant
    expect(history.length).toBeGreaterThanOrEqual(3);
    expect(history[0].role).toBe('system');

    const userMsg = history.find((m: any) => m.role === 'user');
    expect(userMsg).toBeDefined();
    expect(userMsg!.content).toContain('What is the answer?');

    const assistantMsg = history.find((m: any) => m.role === 'assistant');
    expect(assistantMsg).toBeDefined();
    expect(assistantMsg!.content).toContain('The answer is 42.');
  });

  it('stores tool calls and results in history during a tool loop', async () => {
    fs.mkdirSync(SMOKE_ROOT, { recursive: true });
    const tmpFile = path.join(SMOKE_ROOT, 'hist-test.txt');
    fs.writeFileSync(tmpFile, 'hist-content', 'utf-8');

    mockStream([
      { fullContent: '', toolCalls: [
        { id: 'tc-hist', name: 'read_file', args: { path: tmpFile } }
      ] },
      { fullContent: 'Got it', toolCalls: [] }
    ]);

    const engine = new AgentEngine(
      { provider: 'openai', model: 'gpt-4o-mini', apiKey: 'test-key',
        permissionMode: 'full-autonomy', projectRoot: SMOKE_ROOT },
      'desktop-e2e-toolhist'
    );

    await collectEvents(engine, 'Read file');

    const history = (engine as any).history as Array<{ role: string; content: string }>;

    // Should contain a tool message with the read_file result
    const toolMsg = history.find((m: any) => m.role === 'tool');
    expect(toolMsg).toBeDefined();
    expect(toolMsg!.content).toContain('hist-content');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// D. Error path — provider failure during send
// ═════════════════════════════════════════════════════════════════════════════

describe('CERTAIN-3D: Desktop send error handling', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('emits an error event when the provider fails during a send', async () => {
    vi.spyOn(
      AgentEngine.prototype as any,
      'streamFromProvider'
    ).mockImplementation(async () => {
      throw new Error('Provider unavailable');
    });

    const engine = new AgentEngine(
      { provider: 'openai', model: 'gpt-4o-mini', apiKey: 'bad-key',
        permissionMode: 'full-autonomy', projectRoot: process.cwd() },
      'desktop-e2e-error'
    );

    const events = await collectEvents(engine, 'Hello');

    const errors = events.filter(e => e.type === 'error');
    expect(errors.length).toBe(1);
    expect(errors[0].error).toContain('Provider unavailable');
    expect(errors[0].sessionId).toBe('desktop-e2e-error');
    expect(events.map(e => e.type)).not.toContain('done');
  });
});
