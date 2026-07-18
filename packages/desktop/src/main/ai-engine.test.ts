import { describe, it, expect } from 'vitest';
import { AgentEngine } from './ai-engine';

/**
 * Tests for the engine's live context-usage estimate + auto-compaction, which
 * back the workspace gauge and the desktop `/compact` command.
 */

function makeEngine(messages: Array<{ role: 'system' | 'user' | 'assistant' | 'tool'; content: string }>) {
  const engine = new AgentEngine(
    { provider: 'openai', apiKey: 'test', model: 'gpt-4o', projectRoot: process.cwd(), contextWindow: 8000 },
    'sess-test'
  );
  // Seed the private history directly so we can assert on usage/compaction
  // without performing a network round-trip.
  (engine as unknown as { history: typeof messages }).history = messages.map((m) => ({ ...m }));
  return engine;
}

describe('AgentEngine context usage + compaction', () => {
  it('estimateContextUsage reports used/limit/pct against the configured window', () => {
    const engine = makeEngine([
      { role: 'system', content: 'You are helpful.' },
      { role: 'user', content: 'a'.repeat(4000) }, // ~1000 tokens
      { role: 'assistant', content: 'b'.repeat(4000) } // ~1000 tokens
    ]);
    const u = engine.estimateContextUsage();
    expect(u.limit).toBe(8000);
    expect(u.used).toBeGreaterThan(0);
    expect(u.pct).toBeGreaterThan(0);
    expect(u.pct).toBeLessThanOrEqual(100);
  });

  it('compactHistory shrinks a bloated history and reduces token usage', () => {
    const big: Array<{ role: 'system' | 'user' | 'assistant' | 'tool'; content: string }> = [
      { role: 'system', content: 'System instructions for the agent.' }
    ];
    for (let i = 0; i < 200; i++) {
      big.push({
        role: i % 2 === 0 ? 'user' : 'assistant',
        content: `Turn ${i}: ${'x'.repeat(1500)}` // a long, bloated turn
      });
    }
    const engine = makeEngine(big);
    const before = engine.estimateContextUsage();

    const result = engine.compactHistory();
    const after = engine.estimateContextUsage();

    expect(result.tokensAfter).toBeLessThan(result.tokensBefore);
    expect(after.used).toBeLessThan(before.used);
    // The compacted history is dramatically shorter than the raw one.
    const hist = (engine as unknown as { history: unknown[] }).history;
    expect(hist.length).toBeLessThan(big.length / 2);
    // Leading system message + a single summary + recent turns.
    expect(hist[0]).toMatchObject({ role: 'system' });
  });

  it('compactHistory is a no-op (and safe) on a tiny history', () => {
    const engine = makeEngine([
      { role: 'system', content: 'sys' },
      { role: 'user', content: 'hi' },
      { role: 'assistant', content: 'hello' }
    ]);
    const result = engine.compactHistory();
    expect(result.tokensBefore).toBe(result.tokensAfter);
    const hist = (engine as unknown as { history: unknown[] }).history;
    expect(hist.length).toBe(3);
  });
});
