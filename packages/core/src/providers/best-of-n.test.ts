import { describe, it, expect } from 'vitest';
import { mergeBestOfN, type BestOfNStrategy } from './best-of-n.js';

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
    const strategies: BestOfNStrategy[] = ['consensus', 'longest', 'first'];
    for (const s of strategies) {
      expect(mergeBestOfN(['a', 'b'], s).length).toBeGreaterThan(0);
    }
  });
});
