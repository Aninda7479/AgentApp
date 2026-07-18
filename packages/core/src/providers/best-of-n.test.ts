import { describe, it, expect } from 'vitest';
import { mergeBestOfN, synthesizeEnsemble, type BestOfNStrategy } from './best-of-n.js';

/**
 * Unit tests for the deterministic best-of-N merge half of parallel
 * multi-model orchestration (mission point #2). These strategies need no
 * model call, so they are exercised directly — no live provider required.
 */

describe('mergeBestOfN', () => {
  it('returns empty string when there are no candidates', () => {
    expect(mergeBestOfN([])).toBe('');
    expect(mergeBestOfN([null, undefined, '   '])).toBe('');
  });

  it('returns the single candidate unchanged (whitespace trimmed)', () => {
    expect(mergeBestOfN(['  only answer  '])).toBe('only answer');
  });

  it("'first' returns the first non-empty candidate", () => {
    const out = mergeBestOfN(['answer one', 'answer two', 'answer three'], 'first');
    expect(out).toBe('answer one');
  });

  it("'longest' returns the longest non-empty candidate", () => {
    const out = mergeBestOfN(['short', 'a much longer and more complete answer', 'mid'], 'longest');
    expect(out).toBe('a much longer and more complete answer');
  });

  it("'consensus' picks the majority candidate (whitespace/case insensitive)", () => {
    const out = mergeBestOfN([
      'The answer is 42.',
      '  the ANSWER is 42.  ',
      'the answer is 42.',
      'something else entirely'
    ]);
    expect(out).toBe('The answer is 42.');
  });

  it("'consensus' breaks ties toward the longest candidate", () => {
    const out = mergeBestOfN(['short', 'short', 'longer answer', 'longer answer']);
    // Two equally-counted normalized groups ("short" x2, "longer answer" x2);
    // tie resolved to the longest -> "longer answer".
    expect(out).toBe('longer answer');
  });

  it('ignores null/undefined/empty entries before applying a strategy', () => {
    const out = mergeBestOfN([null, '', '   ', 'kept'], 'first');
    expect(out).toBe('kept');
  });

  it('defaults to the consensus strategy', () => {
    const out = mergeBestOfN(['same', 'same', 'different']);
    expect(out).toBe('same');
  });

  it('counts consensus whitespace/case insensitively', () => {
    // All three normalize to "bob"; the consensus key is the trimmed/cased
    // form, so they count as one group and the first is returned.
    const responses = ['  bob  ', 'bob', '  BOB  '] as Array<string | null | undefined>;
    const out = mergeBestOfN(responses);
    expect(out).toBe('bob');
  });
});

// Sanity check that the strategy union is the documented set.
describe('BestOfNStrategy', () => {
  it('accepts exactly the documented strategies', () => {
    const strategies: BestOfNStrategy[] = ['consensus', 'longest', 'first', 'synthesize'];
    for (const s of strategies) {
      expect(synthesizeEnsemble(['a', 'b'], s).text.length).toBeGreaterThan(0);
    }
  });
});

describe('synthesizeEnsemble (bias-resistance merge)', () => {
  it('reports unanimous agreement with the collapsed text', () => {
    const r = synthesizeEnsemble(['  same answer  ', 'same answer', 'Same   Answer']);
    expect(r.agreement).toBe(1);
    expect(r.text).toBe('same answer');
    expect(r.clusters).toBe(1);
    expect(r.total).toBe(3);
    expect(r.winnerVotes).toBe(3);
  });

  it('reports partial agreement and keeps the majority text under consensus', () => {
    const r = synthesizeEnsemble(['answer A', 'answer A', 'answer B']);
    expect(r.agreement).toBeCloseTo(2 / 3);
    expect(r.text).toBe('answer A');
    expect(r.clusters).toBe(2);
    expect(r.winnerVotes).toBe(2);
  });

  it('consensus collapses to the most-voted / longest answer (backward-compatible)', () => {
    const r = synthesizeEnsemble(['Paris', 'Paris is the capital of France.'], 'consensus');
    expect(r.agreement).toBeCloseTo(0.5);
    expect(r.clusters).toBe(2);
    expect(r.text).toBe('Paris is the capital of France.');
  });

  it("synthesize surfaces divergent perspectives as a multi-view (bias-resistance)", () => {
    const r = synthesizeEnsemble(['view one', 'view two', 'view three'], 'synthesize');
    expect(r.agreement).toBeCloseTo(1 / 3);
    expect(r.clusters).toBe(3);
    expect(r.text).toContain('Perspective 1:');
    expect(r.text).toContain('Perspective 2:');
    expect(r.text).toContain('Perspective 3:');
  });

  it('still honors first / longest strategies while returning metadata', () => {
    const first = synthesizeEnsemble(['short', 'a much longer and more complete answer', 'mid'], 'first');
    expect(first.text).toBe('short');
    const longest = synthesizeEnsemble(['short', 'a much longer and more complete answer', 'mid'], 'longest');
    expect(longest.text).toBe('a much longer and more complete answer');
    expect(longest.agreement).toBeCloseTo(1 / 3);
    expect(longest.winnerVotes).toBe(1);
  });

  it('handles empty and single candidates without throwing', () => {
    expect(synthesizeEnsemble([]).text).toBe('');
    expect(synthesizeEnsemble([null, '', '   ']).text).toBe('');
    const single = synthesizeEnsemble(['only']);
    expect(single.text).toBe('only');
    expect(single.agreement).toBe(1);
    expect(single.clusters).toBe(1);
  });
});
