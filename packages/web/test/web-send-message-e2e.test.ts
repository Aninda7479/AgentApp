import { describe, it, expect, vi, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { AgentEngine, type AgentEvent } from '../src/ai-engine';

/**
 * CERTAIN-4 smoke test: Web send message end-to-end.
 *
 * Proves the web message lifecycle works without a real browser or network:
 *   1. User types a prompt in the Composer (shared renderer).
 *   2. IPC bridge translates invoke('agent-run') to HTTP POST.
 *   3. Server creates an AgentEngine and calls engine.run().
 *   4. Engine streams events back (broadcast via WebSocket in production).
 *
 * Mocks the provider HTTP layer (streamFromProvider) so no real API key is
 * needed. Exercises three complete paths:
 *   A. Text-only response (no tools) — simplest happy path.
 *   B. Tool-use loop — engine calls read_file, feeds result back, then answers.
 *   C. Provider error — engine emits error event on failure.
 *
 * Also tests the web IPC handler validation (agent-run channel).
 *
 * Pass criteria:
 *   - Engine emits context + done events for text-only path
 *   - Engine emits tool_call + tool_result + done for tool-use path
 *   - All events carry the correct sessionId
 *   - History is updated after run completes
 *   - IPC handler validates agent-run payloads
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

const SMOKE_ROOT = path.join(os.tmpdir(), 'sa-web-e2e-smoke');
const FIXTURE_FILE = path.join(SMOKE_ROOT, 'web-fixture.txt');
const FIXTURE_CONTENT = 'CERTAIN-4-WEB-E2E-OK';

// ═════════════════════════════════════════════════════════════════════════════
// A. Text-only response — simplest web send path
// ═════════════════════════════════════════════════════════════════════════════

describe('CERTAIN-4A: Web text-only send', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('runs a prompt and emits context + done events with correct sessionId', async () => {
    mockStream([
      { fullContent: 'Hello from the web!', toolCalls: [] }
    ]);

    const engine = new AgentEngine(
      { provider: 'openai', model: 'gpt-4o-mini', apiKey: 'test-key',
        permissionMode: 'full-autonomy', projectRoot: process.cwd() },
      'web-e2e-text'
    );

    const events = await collectEvents(engine, 'Say hello');

    for (const e of events) {
      expect(e.sessionId).toBe('web-e2e-text');
    }

    const contexts = events.filter(e => e.type === 'context');
    expect(contexts.length).toBeGreaterThanOrEqual(1);

    const done = events.filter(e => e.type === 'done');
    expect(done.length).toBe(1);

    const history = (engine as any).history as Array<{ role: string; content: string }>;
    const assistantMsg = history.find((m: any) => m.role === 'assistant');
    expect(assistantMsg).toBeDefined();
    expect(assistantMsg!.content).toBe('Hello from the web!');
  });

  it('completes with no tool calls in the event stream', async () => {
    mockStream([
      { fullContent: 'No tools here.', toolCalls: [] }
    ]);

    const engine = new AgentEngine(
      { provider: 'openai', model: 'gpt-4o-mini', apiKey: 'test-key',
        permissionMode: 'full-autonomy', projectRoot: process.cwd() },
      'web-e2e-notools'
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

describe('CERTAIN-4B: Web tool-use send', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    try { fs.rmSync(SMOKE_ROOT, { recursive: true, force: true }); } catch { /* ok */ }
  });

  it('runs a read_file tool call and completes the loop', async () => {
    fs.mkdirSync(SMOKE_ROOT, { recursive: true });
    fs.writeFileSync(FIXTURE_FILE, FIXTURE_CONTENT, 'utf-8');

    mockStream([
      { fullContent: '', toolCalls: [
        { id: 'tc-web-1', name: 'read_file', args: { path: FIXTURE_FILE } }
      ] },
      { fullContent: `File contains: ${FIXTURE_CONTENT}`, toolCalls: [] }
    ]);

    const engine = new AgentEngine(
      { provider: 'openai', model: 'gpt-4o-mini', apiKey: 'test-key',
        permissionMode: 'full-autonomy', projectRoot: SMOKE_ROOT },
      'web-e2e-tool'
    );

    const events = await collectEvents(engine, 'Read the fixture file');

    const toolCalls = events.filter(e => e.type === 'tool_call');
    const toolResults = events.filter(e => e.type === 'tool_result');
    expect(toolCalls.length).toBeGreaterThanOrEqual(1);
    expect(toolResults.length).toBeGreaterThanOrEqual(1);

    expect(toolCalls[0].toolName).toBe('read_file');
    expect(toolCalls[0].toolArgs?.path).toBe(FIXTURE_FILE);
    expect(toolResults[0].toolResult).toContain(FIXTURE_CONTENT);

    expect(events.map(e => e.type)).toContain('done');
    expect(callIndex).toBe(2);
  });

  it('preserves session id across multi-turn tool loop', async () => {
    fs.mkdirSync(SMOKE_ROOT, { recursive: true });
    fs.writeFileSync(FIXTURE_FILE, 'web-multi-turn', 'utf-8');

    mockStream([
      { fullContent: '', toolCalls: [
        { id: 'tc-web-mt', name: 'read_file', args: { path: FIXTURE_FILE } }
      ] },
      { fullContent: 'Done reading.', toolCalls: [] }
    ]);

    const engine = new AgentEngine(
      { provider: 'openai', model: 'gpt-4o-mini', apiKey: 'test-key',
        permissionMode: 'full-autonomy', projectRoot: SMOKE_ROOT },
      'web-e2e-multiturn'
    );

    const events = await collectEvents(engine, 'Read file');

    for (const e of events) {
      expect(e.sessionId).toBe('web-e2e-multiturn');
    }

    const toolCalls = events.filter(e => e.type === 'tool_call');
    const toolResults = events.filter(e => e.type === 'tool_result');
    expect(toolCalls.length).toBeGreaterThanOrEqual(1);
    expect(toolResults.length).toBeGreaterThanOrEqual(1);
    expect(events.map(e => e.type)).toContain('done');

    const history = (engine as any).history as Array<{ role: string; content: string }>;
    const assistantMsgs = history.filter((m: any) => m.role === 'assistant');
    expect(assistantMsgs.length).toBeGreaterThanOrEqual(2);
    const lastAssistant = assistantMsgs[assistantMsgs.length - 1];
    expect(lastAssistant.content).toContain('Done reading');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// C. History state after run
// ═════════════════════════════════════════════════════════════════════════════

describe('CERTAIN-4C: Web history after send', () => {
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
      'web-e2e-history'
    );

    await collectEvents(engine, 'What is the answer?');

    const history = (engine as any).history as Array<{ role: string; content: string }>;

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
    const tmpFile = path.join(SMOKE_ROOT, 'web-hist-test.txt');
    fs.writeFileSync(tmpFile, 'web-hist-content', 'utf-8');

    mockStream([
      { fullContent: '', toolCalls: [
        { id: 'tc-web-hist', name: 'read_file', args: { path: tmpFile } }
      ] },
      { fullContent: 'Got it', toolCalls: [] }
    ]);

    const engine = new AgentEngine(
      { provider: 'openai', model: 'gpt-4o-mini', apiKey: 'test-key',
        permissionMode: 'full-autonomy', projectRoot: SMOKE_ROOT },
      'web-e2e-toolhist'
    );

    await collectEvents(engine, 'Read file');

    const history = (engine as any).history as Array<{ role: string; content: string }>;
    const toolMsg = history.find((m: any) => m.role === 'tool');
    expect(toolMsg).toBeDefined();
    expect(toolMsg!.content).toContain('web-hist-content');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// D. Error path — provider failure during send
// ═════════════════════════════════════════════════════════════════════════════

describe('CERTAIN-4D: Web send error handling', () => {
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
      'web-e2e-error'
    );

    const events = await collectEvents(engine, 'Hello');

    const errors = events.filter(e => e.type === 'error');
    expect(errors.length).toBe(1);
    expect(errors[0].error).toContain('Provider unavailable');
    expect(errors[0].sessionId).toBe('web-e2e-error');
    expect(events.map(e => e.type)).not.toContain('done');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// E. Web IPC handler validation
// ═════════════════════════════════════════════════════════════════════════════

describe('CERTAIN-4E: Web IPC agent-run validation', () => {
  it('agent-run returns 400 when args is missing', async () => {
    const { handleIpc } = await import('../src/server.js');
    const res: any = {
      statusCode: 200,
      body: undefined,
      status(code: number) { this.statusCode = code; return this; },
      json(obj: any) { this.body = obj; return this; },
      setHeader() { return this; },
      sendFile() { return this; },
      redirect() { return this; }
    };
    await handleIpc({ params: { channel: 'agent-run' }, body: {}, headers: {} } as any, res);
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toContain('requires a payload argument');
  });

  it('agent-run returns 400 when args is not an array', async () => {
    const { handleIpc } = await import('../src/server.js');
    const res: any = {
      statusCode: 200,
      body: undefined,
      status(code: number) { this.statusCode = code; return this; },
      json(obj: any) { this.body = obj; return this; },
      setHeader() { return this; },
      sendFile() { return this; },
      redirect() { return this; }
    };
    await handleIpc({ params: { channel: 'agent-run' }, body: { args: 'bad' }, headers: {} } as any, res);
    expect(res.statusCode).toBe(400);
  });
});
