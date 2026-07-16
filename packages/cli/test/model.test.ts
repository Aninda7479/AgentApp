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

describe('ModelSwitcher.switchModel custom-identifier fallback', () => {
  it('flags a mistyped model as not-found and suggests the close registry match', () => {
    const ctx = makeContext();
    // 'gpt-4o-min' is a truncation typo of the registry model 'GPT-4o Mini'.
    const res = ModelSwitcher.switchModel(ctx, 'gpt-4o-min');

    // A custom identifier is still valid, so success stays true — but the
    // message must no longer pretend the switch was a clean registry match.
    expect(res.success).toBe(true);
    expect(res.message).toMatch(/not found in registry/i);
    expect(res.message).toMatch(/did you mean/i);
    expect(ctx.activeModel).toBe('gpt-4o-min');
  });

  it('sets a genuine custom identifier without a false suggestion', () => {
    const ctx = makeContext();
    const res = ModelSwitcher.switchModel(ctx, 'my-comfyui-lora-model');

    expect(res.message).toMatch(/not found in registry/i);
    expect(res.message).not.toMatch(/did you mean/i);
    expect(ctx.activeModel).toBe('my-comfyui-lora-model');
  });
});
