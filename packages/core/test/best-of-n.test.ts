import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ModelRouter, ModelGovStorage, mergeBestOfN, type BestOfNStrategy } from '../src/index.js';
import type { RouterModel } from '../src/index.js';

/**
 * Phase 1 of orchestration depth (mission point 2): the pure, testable halves
 * of best-of-N / parallel-multi-model routing — candidate selection (top-N by
 * the existing capability-gated, goal-weighted scoring) and result merging.
 * Engine execution wiring (run N models in parallel + aggregator) is a later
 * phase; these primitives are the logic that must be correct first.
 */

const visionModel: RouterModel = {
  id: 'openai-gpt-4-vision', name: 'GPT-4 Vision', providerId: 'openai', enabled: true,
  supportsVision: true, supportsTools: true
};
const plainModel: RouterModel = {
  id: 'openai-gpt-4o-mini', name: 'GPT-4o Mini', providerId: 'openai', enabled: true,
  supportsVision: false, supportsTools: true
};
const coder: RouterModel = {
  id: 'anthropic-claude-tool', name: 'Claude Coder', providerId: 'anthropic', enabled: true,
  supportsVision: false, supportsTools: true
};
const nonTool: RouterModel = {
  id: 'anthropic-claude-plain', name: 'Claude Plain', providerId: 'anthropic', enabled: true,
  supportsVision: false, supportsTools: false
};

describe('ModelRouter.selectCandidateModels (top-N selection)', () => {
  beforeEach(() => {
    vi.spyOn(ModelGovStorage, 'getModelScores').mockReturnValue({
      coding: 50, reasoning: 50, vision: 50, costEfficiency: 50, general: 50
    });
  });
  afterEach(() => vi.restoreAllMocks());

  it('returns the single best model when count is 1 (matches routeModelForTask)', () => {
    const top = ModelRouter.selectCandidateModels('describe this image', [plainModel, visionModel], 1);
    expect(top).toHaveLength(1);
    expect(top[0].model).toBe('gpt-4-vision');
  });

  it('returns the top-N models in ranked order', () => {
    const visionModel2: RouterModel = {
      id: 'anthropic-claude-opus', name: 'Claude Opus', providerId: 'anthropic', enabled: true,
      supportsVision: true, supportsTools: true
    };
    const top = ModelRouter.selectCandidateModels('describe this image', [plainModel, visionModel, visionModel2], 2);
    expect(top).toHaveLength(2);
    // The non-vision model is hard-gated out; the two vision models remain,
    // ranked (here equal scores → stable array order) with vision first.
    expect(top[0].model).toBe('gpt-4-vision');
    expect(top[1].model).toBe('claude-opus');
  });

  it('clamps the result to the pool size when count exceeds available models', () => {
    const top = ModelRouter.selectCandidateModels('summarize this text', [plainModel], 4);
    expect(top).toHaveLength(1);
  });

  it('returns [] for an empty model list', () => {
    expect(ModelRouter.selectCandidateModels('hi', [], 3)).toEqual([]);
  });

  it('hard-gates a vision task to vision-capable models only', () => {
    // plainModel dominates on the generic axis; the gate must still exclude it.
    vi.spyOn(ModelGovStorage, 'getModelScores').mockImplementation((id: string) =>
      id.includes('gpt-4-vision')
        ? { coding: 50, reasoning: 50, vision: 50, costEfficiency: 50 }
        : { coding: 96, reasoning: 96, vision: 96, costEfficiency: 96 }
    );
    const top = ModelRouter.selectCandidateModels('describe this image', [plainModel, visionModel], 2);
    expect(top.every((m) => m.model === 'gpt-4-vision')).toBe(true);
  });

  it('selects tool-capable models for a coding task', () => {
    const top = ModelRouter.selectCandidateModels('write a python function', [nonTool, coder], 2);
    expect(top[0].model).toBe('claude-tool');
    expect(top.some((m) => m.model === 'claude-plain')).toBe(false);
  });
});

describe('mergeBestOfN (result combination)', () => {
  const strategies: BestOfNStrategy[] = ['consensus', 'longest', 'first'];

  it('returns empty string when all candidates are empty', () => {
    for (const s of strategies) expect(mergeBestOfN(['', '   ', null, undefined], s)).toBe('');
  });

  it('returns the single candidate as-is', () => {
    for (const s of strategies) expect(mergeBestOfN(['only answer'], s)).toBe('only answer');
  });

  it("'first' returns the first non-empty candidate", () => {
    expect(mergeBestOfN(['alpha', 'beta', 'gamma'], 'first')).toBe('alpha');
  });

  it("'longest' returns the most complete candidate", () => {
    expect(mergeBestOfN(['short', 'a much longer and more complete answer', 'mid'], 'longest'))
      .toBe('a much longer and more complete answer');
  });

  it("'consensus' picks the majority answer across whitespace/case variation", () => {
    const merged = mergeBestOfN(
      ['The answer is 42.', 'the answer is 42.', 'The answer is 42.', 'completely different'],
      'consensus'
    );
    expect(merged).toBe('The answer is 42.');
  });

  it("'consensus' breaks ties toward the longest candidate", () => {
    const merged = mergeBestOfN(['Short.', 'A longer distinct answer.', 'Short.'], 'consensus');
    // 'Short.' appears twice (majority) → wins over the single longer one.
    expect(merged).toBe('Short.');
  });

  it('handles a no-majority field of distinct answers via longest-on-tie', () => {
    const merged = mergeBestOfN(['one', 'two', 'three'], 'consensus');
    // all distinct (count 1 each); tie-break picks the longest
    expect(merged).toBe('three');
  });
});
