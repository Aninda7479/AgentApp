import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AgentEngine, type BestOfNConfig, type AgentEvent } from '../src/providers/ai-engine.js';

/**
 * Phase-2 of orchestration depth (mission point 2): the ENGINE wiring that runs
 * N task-matched models in parallel and merges their outputs. The selection
 * (OrchestratorRouter.selectCandidateModels) and merge (mergeBestOfN) halves are
 * already unit-tested; this suite covers the new AgentEngine.runBestOfN path
 * WITHOUT spending any API budget — streamFromProvider is mocked per candidate,
 * so we exercise the orchestration, fallback, and error-handling logic only.
 */

type StreamResult = {
  fullContent: string;
  toolCalls: Array<{ id: string; name: string; args: Record<string, unknown> }>;
};

const baseConfig = (over: Partial<BestOfNConfig> = {}): BestOfNConfig => ({
  provider: 'openai',
  model: 'gpt-4o-mini',
  apiKey: 'test-key',
  systemPrompt: 'You are a test agent.',
  ...over
});

function collect(events: AgentEvent[]) {
  return {
    types: events.map((e) => e.type),
    bestofn: events.filter((e) => e.type === 'bestofn'),
    errors: events.filter((e) => e.type === 'error'),
    done: events.filter((e) => e.type === 'done')
  };
}

describe('AgentEngine.runBestOfN', () => {
  let streamSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    streamSpy = vi.spyOn(AgentEngine.prototype as any, 'streamFromProvider');
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('merges N candidates via consensus and emits a bestofn + done event', async () => {
    const responses = ['Paris', 'Paris is the capital of France.'];
    let i = 0;
    streamSpy.mockImplementation(async () => ({ fullContent: responses[i++], toolCalls: [] } as StreamResult));

    const events: AgentEvent[] = [];
    await AgentEngine.runBestOfN(
      'What is the capital of France?',
      (e) => events.push(e),
      baseConfig({
        candidates: [
          { provider: 'openai', model: 'gpt-4o-mini', apiKey: 'k1' },
          { provider: 'anthropic', model: 'claude-3-5', apiKey: 'k2' }
        ],
        strategy: 'consensus'
      })
    );

    const c = collect(events);
    expect(c.bestofn).toHaveLength(1);
    const bo = c.bestofn[0];
    expect(bo.strategy).toBe('consensus');
    expect(bo.mergedCount).toBe(2);
    expect(bo.toolFallback).toBeFalsy();
    expect(bo.candidates).toEqual([
      { provider: 'openai', model: 'gpt-4o-mini' },
      { provider: 'anthropic', model: 'claude-3-5' }
    ]);
    // consensus returns longest when candidates differ (not 'first').
    expect(bo.content).toBe('Paris is the capital of France.');
    expect(c.done).toHaveLength(1);
  });

  it('falls back to a single agentic run when a candidate needs tools', async () => {
    const runSpy = vi.spyOn(AgentEngine.prototype, 'run').mockResolvedValue(undefined);
    streamSpy
      .mockResolvedValueOnce({
        fullContent: '',
        toolCalls: [{ id: 't1', name: 'read_file', args: { path: 'x' } }]
      } as StreamResult)
      .mockResolvedValueOnce({ fullContent: 'no tools here', toolCalls: [] } as StreamResult);

    const events: AgentEvent[] = [];
    await AgentEngine.runBestOfN(
      'Read x and summarize it.',
      (e) => events.push(e),
      baseConfig({
        candidates: [
          { provider: 'openai', model: 'gpt-4o-mini', apiKey: 'k1' },
          { provider: 'anthropic', model: 'claude-3-5', apiKey: 'k2' }
        ]
      })
    );

    const c = collect(events);
    expect(c.bestofn[0].toolFallback).toBe(true);
    expect(c.bestofn[0].mergedCount).toBe(0);
    // The lead candidate (first) is re-run as a full agentic loop.
    expect(runSpy).toHaveBeenCalledTimes(1);
    const [leadPrompt, , leadAttach] = runSpy.mock.calls[0];
    expect(leadPrompt).toBe('Read x and summarize it.');
    expect(leadAttach).toBeUndefined();
  });

  it('reports a single error event when every candidate fails', async () => {
    streamSpy.mockRejectedValue(new Error('rate limited'));

    const events: AgentEvent[] = [];
    await AgentEngine.runBestOfN(
      'Do something.',
      (e) => events.push(e),
      baseConfig({
        candidates: [
          { provider: 'openai', model: 'gpt-4o-mini', apiKey: 'k1' },
          { provider: 'anthropic', model: 'claude-3-5', apiKey: 'k2' }
        ]
      })
    );

    const c = collect(events);
    // Exactly one error, not two — the N failures are collapsed.
    expect(c.errors).toHaveLength(1);
    expect(c.errors[0].error).toContain('rate limited');
    expect(c.done).toHaveLength(0);
    expect(c.bestofn).toHaveLength(0);
  });

  it('drops empty/errored candidates and still returns a merged result', async () => {
    const responses: Array<StreamResult | Error> = [
      { fullContent: 'Berlin', toolCalls: [] },
      new Error('boom'),
      { fullContent: 'Berlin', toolCalls: [] }
    ];
    let i = 0;
    streamSpy.mockImplementation(async () => {
      const r = responses[i++];
      if (r instanceof Error) throw r;
      return r as StreamResult;
    });

    const events: AgentEvent[] = [];
    await AgentEngine.runBestOfN(
      'Capital of Germany?',
      (e) => events.push(e),
      baseConfig({
        candidates: [
          { provider: 'openai', model: 'a', apiKey: 'k1' },
          { provider: 'anthropic', model: 'b', apiKey: 'k2' },
          { provider: 'google', model: 'c', apiKey: 'k3' }
        ],
        strategy: 'consensus'
      })
    );

    const c = collect(events);
    expect(c.bestofn).toHaveLength(1);
    // 2 of 3 candidates produced text; consensus over identical "Berlin" → "Berlin".
    expect(c.bestofn[0].mergedCount).toBe(2);
    expect(c.bestofn[0].content).toBe('Berlin');
    expect(c.errors).toHaveLength(0);
  });
});
