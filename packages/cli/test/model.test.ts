import { describe, it, expect } from 'vitest';
import { ModelCapabilityRegistry } from '@superagent/core';
import { ModelSwitcher, handleModelCommand } from '../src/commands/model.js';
import type { SessionContext } from '../src/types.js';

function makeContext(): SessionContext {
  const capabilityRegistry = new ModelCapabilityRegistry();
  // A dynamically-connected custom OpenAI-compatible endpoint, e.g. a local
  // ComfyUI / self-hosted gateway. Its id follows the `custom-<ts>` convention
  // documented in provider-meta.ts.
  capabilityRegistry.registerCapability({
    id: 'my-custom-model',
    name: 'My Custom Model',
    provider: 'custom-1719500000',
    contextWindow: 32000,
    maxOutputTokens: 4096,
    supportsVision: false,
    supportsTools: true,
    supportsReasoning: false
  });

  return {
    activeProvider: 'openai',
    activeModel: 'gpt-4o',
    capabilityRegistry
  } as unknown as SessionContext;
}

describe('ModelSwitcher.switchProvider', () => {
  it('accepts a registry-known provider and selects its first model', () => {
    const ctx = makeContext();
    const res = ModelSwitcher.switchProvider(ctx, 'openai');

    expect(res.success).toBe(true);
    expect(ctx.activeProvider).toBe('openai');
    expect(ctx.activeModel).toBe('gpt-4o');
  });

  it('accepts a connected custom provider id (custom-*) and switches to it', () => {
    const ctx = makeContext();
    const res = ModelSwitcher.switchProvider(ctx, 'custom-1719500000');

    expect(res.success).toBe(true);
    expect(ctx.activeProvider).toBe('custom-1719500000');
    // The registry has a model for this custom provider, so it is auto-selected.
    expect(ctx.activeModel).toBe('my-custom-model');
  });

  it('rejects an unknown provider id', () => {
    const ctx = makeContext();
    const res = ModelSwitcher.switchProvider(ctx, 'definitely-not-a-provider');

    expect(res.success).toBe(false);
    expect(res.message).toMatch(/not a supported provider/i);
  });
});

describe('handleModelCommand provider routing', () => {
  it('/model provider custom-<id> switches without error', () => {
    const ctx = makeContext();
    const res = handleModelCommand(['provider', 'custom-1719500000'], ctx);

    expect(res.success).toBe(true);
    expect(ctx.activeProvider).toBe('custom-1719500000');
  });
});
