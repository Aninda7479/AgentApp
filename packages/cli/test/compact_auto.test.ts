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
