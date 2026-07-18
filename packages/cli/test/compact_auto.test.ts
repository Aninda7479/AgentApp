import { describe, it, expect } from 'vitest';
import {
  ContextCompressor,
  registerCompactCommand,
  ContextMessage,
  CompactOptions
} from '../src/index.js';
import { SlashCommandRouter } from '../src/index.js';

describe('ContextCompressor auto-compaction helpers', () => {
  const messages: ContextMessage[] = [
    { role: 'system', content: 'You are helpful.' },
    { role: 'user', content: 'a'.repeat(400) }, // ~100 tokens
    { role: 'assistant', content: 'b'.repeat(400) }, // ~100 tokens
    { role: 'user', content: 'c'.repeat(400) } // ~100 tokens
  ];

  it('totalTokens sums per-message estimates', () => {
    // system 'You are helpful.' (16 chars = 4 tokens) + 3 × 100 tokens
    expect(ContextCompressor.totalTokens(messages)).toBe(304);
  });

  it('needsCompaction is false without a positive threshold', () => {
    expect(ContextCompressor.needsCompaction(messages)).toBe(false);
    expect(ContextCompressor.needsCompaction(messages, 0)).toBe(false);
  });

  it('needsCompaction triggers only when over threshold', () => {
    expect(ContextCompressor.needsCompaction(messages, 250)).toBe(true);
    expect(ContextCompressor.needsCompaction(messages, 304)).toBe(false);
    expect(ContextCompressor.needsCompaction(messages, 500)).toBe(false);
  });
});

describe('/compact threshold & status subcommands', () => {
  it('sets the auto-compaction threshold on the shared options', async () => {
    const options: CompactOptions = {};
    let ctxMessages: ContextMessage[] = [
      { role: 'system', content: 'sys' },
      { role: 'user', content: 'hi' }
    ];
    const router = new SlashCommandRouter();
    registerCompactCommand(
      router,
      () => ctxMessages,
      (m) => {
        ctxMessages = m;
      },
      options
    );

    const res = await router.execute('/compact threshold 1000');
    expect(res.success).toBe(true);
    expect(res.output).toContain('threshold set to 1000');
    expect(options.maxTokens).toBe(1000);

    const status = await router.execute('/compact status');
    expect(status.success).toBe(true);
    expect(status.output).toContain('Estimated context:');
    expect(status.output).toContain('1000');
  });

  it('disables auto-compaction with threshold 0', async () => {
    const options: CompactOptions = { maxTokens: 500 };
    const router = new SlashCommandRouter();
    registerCompactCommand(router, () => [], () => {}, options);

    const res = await router.execute('/compact threshold 0');
    expect(res.success).toBe(true);
    expect(options.maxTokens).toBe(0);
    expect(res.output).toContain('disabled');
  });

  it('reports a usage error for a malformed threshold', async () => {
    const router = new SlashCommandRouter();
    registerCompactCommand(router, () => [], () => {}, {});

    const res = await router.execute('/compact threshold abc');
    expect(res.success).toBe(false);
    expect(res.output).toContain('Usage: /compact threshold');
  });
});

describe('ContextCompressor chunked compaction (over-bloated context)', () => {
  it('divides a massively bloated middle into bounded chunks and compacts', async () => {
    // 1 system + 600 large turns (~1k chars each) + 4 recent = 605 messages.
    const big: ContextMessage[] = [{ role: 'system', content: 'You are helpful.' }];
    for (let i = 0; i < 600; i++) {
      big.push({
        role: i % 2 === 0 ? 'user' : 'assistant',
        content: `Turn ${i}: ${'x'.repeat(1000)}`
      });
    }
    const recent = [
      { role: 'user', content: 'Summarize the plan' },
      { role: 'assistant', content: 'Here is the plan.' },
      { role: 'user', content: 'Now implement it' },
      { role: 'assistant', content: 'Implemented.' }
    ];
    const messages = [...big, ...recent];

    const originalCount = messages.length;
    const result = await ContextCompressor.compress(messages, { keepRecentCount: 4 });

    expect(result.summaryAdded).toBe(true);
    // Compaction collapses hundreds of turns into a tiny fixed footprint.
    expect(result.compactedCount).toBeLessThan(20);
    expect(result.compactedCount).toBeLessThan(originalCount);
    expect(result.tokensSaved).toBeGreaterThan(0);
    // The summary is bounded (cannot itself blow past a small context window)
    // even though the input was ~600k tokens.
    expect(result.messages[1].content).toContain('[COMPACTED CONTEXT SUMMARY]');
    expect(result.messages[1].content.length).toBeLessThan(200_000);
    // Recent turns are preserved verbatim.
    expect(result.messages[result.messages.length - 1].content).toBe('Implemented.');
  });

  it('does not break when the middle has thousands of turns (multi-part summary)', async () => {
    const messages: ContextMessage[] = [{ role: 'system', content: 'sys' }];
    for (let i = 0; i < 3000; i++) {
      messages.push({ role: i % 2 === 0 ? 'user' : 'assistant', content: `msg ${i} ${'y'.repeat(500)}` });
    }
    const result = await ContextCompressor.compress(messages, { keepRecentCount: 4 });
    expect(result.summaryAdded).toBe(true);
    // Even with thousands of turns, the compacted list stays small and the
    // summary is capped (maxParts) so it never grows without bound.
    expect(result.compactedCount).toBeLessThan(20);
    expect(result.messages[1].content.length).toBeLessThan(200_000);
  });
});

