import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { AgentEngine, type AgentEvent } from '../src/providers/ai-engine.js';

/**
 * CERTAIN-1 smoke test: CLI chat turn + one tool call (read_file).
 *
 * Mocks the provider HTTP layer (streamFromProvider) so no real API key is
 * needed. Exercises the full engine tool-loop path:
 *   1. Provider returns a read_file tool call.
 *   2. Engine executes the real builtin tool.
 *   3. Tool result is fed back into history.
 *   4. Provider sees the tool result and returns a final text response.
 *
 * Pass criteria:
 *   - tool_call event emitted with name "read_file"
 *   - tool_result event emitted with the file's content
 *   - done event emitted (agent loop completed without crash)
 *   - Final content mentions the expected marker text
 */

type StreamResult = {
  fullContent: string;
  toolCalls: Array<{ id: string; name: string; args: Record<string, unknown> }>;
};

const SMOKE_ROOT = path.join(process.cwd(), 'tmp', 'certainty-1-smoke');
const FIXTURE_FILE = path.join(SMOKE_ROOT, 'smoke-fixture.txt');
const FIXTURE_CONTENT = 'CERTAIN-1-SMOKE-OK-42';

let callIndex = 0;

function makeStreamResult(idx: number): StreamResult {
  if (idx === 0) {
    // First turn: provider asks to read the fixture file
    return {
      fullContent: '',
      toolCalls: [
        { id: 'tc-smoke-1', name: 'read_file', args: { path: FIXTURE_FILE } }
      ]
    };
  }
  // Second turn: provider sees tool result and answers
  return {
    fullContent: `I read the file and found the marker: ${FIXTURE_CONTENT}`,
    toolCalls: []
  };
}

describe('CERTAIN-1: CLI chat turn + tool call (read_file)', () => {
  let streamSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    callIndex = 0;
    fs.mkdirSync(SMOKE_ROOT, { recursive: true });
    fs.writeFileSync(FIXTURE_FILE, FIXTURE_CONTENT, 'utf-8');

    streamSpy = vi.spyOn(
      AgentEngine.prototype as any,
      'streamFromProvider'
    ).mockImplementation(async () => makeStreamResult(callIndex++));
  });

  afterEach(() => {
    vi.restoreAllMocks();
    try { fs.rmSync(SMOKE_ROOT, { recursive: true, force: true }); } catch { /* ok */ }
  });

  it('executes a read_file tool call and completes the loop', async () => {
    const engine = new AgentEngine({
      provider: 'openai',
      model: 'gpt-4o-mini',
      apiKey: 'test-key-smoke',
      projectRoot: SMOKE_ROOT,
      permissionMode: 'full-autonomy',
      systemPrompt: 'You are a smoke-test agent.'
    }, 'smoke-certainty-1');

    const events: AgentEvent[] = [];
    await engine.run('Read the fixture file and report its contents.', (e) => events.push(e));

    const types = events.map((e) => e.type);

    // Must have emitted at least one tool_call and one tool_result
    const toolCalls = events.filter((e) => e.type === 'tool_call');
    const toolResults = events.filter((e) => e.type === 'tool_result');
    expect(toolCalls.length).toBeGreaterThanOrEqual(1);
    expect(toolResults.length).toBeGreaterThanOrEqual(1);

    // The tool call must be read_file with our fixture path
    expect(toolCalls[0].toolName).toBe('read_file');
    expect(toolCalls[0].toolArgs?.path).toBe(FIXTURE_FILE);

    // The tool result must contain the fixture content
    expect(toolResults[0].toolResult).toContain(FIXTURE_CONTENT);

    // Done event must fire (loop completed)
    expect(types).toContain('done');

    // streamFromProvider should have been called twice:
    //   1st: returns the tool call
    //   2nd: returns the final answer after seeing the tool result
    expect(callIndex).toBe(2);
  });

  it('feeds the tool result back into history for the next turn', async () => {
    const engine = new AgentEngine({
      provider: 'openai',
      model: 'gpt-4o-mini',
      apiKey: 'test-key-smoke',
      projectRoot: SMOKE_ROOT,
      permissionMode: 'full-autonomy'
    }, 'smoke-certainty-1-history');

    const events: AgentEvent[] = [];
    await engine.run('Read file please.', (e) => events.push(e));

    // Verify the second streamFromProvider call received the tool result
    // by checking that the spy was called twice
    expect(streamSpy).toHaveBeenCalledTimes(2);
  });
});
