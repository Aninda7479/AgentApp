import { describe, it, expect } from 'vitest';
import { capabilityRegistry } from './models.js';

/**
 * Guards the OpenRouter free-tier model roster.
 *
 * OpenRouter rotates its `:free` models frequently; a stale ID silently fails
 * at runtime when a user picks a "free" model that no longer exists. These
 * tests pin the verified-current IDs (cross-checked against
 * https://openrouter.ai/collections/free-models on 2026-07-20) and assert that
 * previously-removed IDs are no longer advertised.
 */
describe('ModelCapabilityRegistry — OpenRouter free models', () => {
  const EXPECTED_FREE = [
    'openrouter/free',
    'openai/gpt-oss-20b:free',
    'google/gemma-4-31b-it:free',
    'nvidia/nemotron-nano-12b-v2-vl:free',
    'cohere/north-mini-code:free',
    'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free'
  ];

  const REMOVED_FREE = [
    'meta-llama/llama-3.3-70b-instruct:free',
    'google/gemini-2.0-flash-exp:free',
    'deepseek/deepseek-r1:free'
  ];

  it('registers the verified current free models', () => {
    for (const id of EXPECTED_FREE) {
      const cap = capabilityRegistry.getCapability(id);
      expect(cap, `expected free model ${id} to be registered`).toBeDefined();
      expect(cap?.provider).toBe('openrouter');
      expect(cap?.accessStatus).toBe('available');
    }
  });

  it('no longer advertises removed free models', () => {
    for (const id of REMOVED_FREE) {
      expect(
        capabilityRegistry.getCapability(id),
        `stale free model ${id} should have been removed`
      ).toBeUndefined();
    }
  });

  it('exposes the openrouter/free auto-router with vision + tool support', () => {
    const cap = capabilityRegistry.getCapability('openrouter/free');
    expect(cap).toBeDefined();
    expect(cap?.supportsTools).toBe(true);
    expect(cap?.supportsVision).toBe(true);
  });
});
