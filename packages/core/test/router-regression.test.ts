import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ModelRouter, ModelGovStorage } from '../src/index.js';

/**
 * Regression tests for model-id routing.
 *
 * The desktop UI builds catalog model ids in `${providerId}-${modelId}` form
 * (see `enrichModel`) and the router recovers the provider-native model id by
 * stripping that single prefix. A malformed id that carries a *second* prefix
 * (e.g. `nvidia-nvidia/llama-3.1-...`) must never be produced, because the
 * router only strips the first prefix and would hand NVIDIA an invalid
 * `nvidia/llama-3.1-...` id.
 */
describe('ModelRouter.routeModelForTask id integrity', () => {
  const models = [
    { id: 'nvidia-llama-3.1-nemotron-70b-instruct', name: 'Llama 3.1 Nemotron 70B Instruct', providerId: 'nvidia', enabled: true }
  ];

  it('recovers the canonical provider-native id for a correct catalog id', () => {
    const route = ModelRouter.routeModelForTask('summarize this text', models);
    expect(route).not.toBeNull();
    expect(route!.provider).toBe('nvidia');
    expect(route!.model).toBe('llama-3.1-nemotron-70b-instruct');
  });

  it('does NOT leave a second provider prefix after stripping', () => {
    const route = ModelRouter.routeModelForTask('summarize this text', models);
    expect(route!.model).not.toContain('/');
    expect(route!.model).not.toMatch(/^nvidia-/);
  });

  it('produces a provider-native id with no stray provider prefix', () => {
    // The desktop UI builds ids as `${providerId}-${modelId}` (see enrichModel).
    // After the NVIDIA knownDefaults fix, the catalog id for a force-connected
    // NVIDIA model is e.g. `nvidia-llama-3.1-nemotron-70b-instruct` and must
    // route to the clean native id `llama-3.1-nemotron-70b-instruct`.
    const route = ModelRouter.routeModelForTask('summarize this text', models);
    expect(route!.model).toBe('llama-3.1-nemotron-70b-instruct');
    expect(route!.model.startsWith('nvidia-')).toBe(false);
    expect(route!.model.includes('/')).toBe(false);
  });
});

/**
 * Capability-aware routing (mission point 2): for a vision task the router
 * should prefer a model that actually supports vision, even when its generic
 * capability score is comparable to a non-vision model. When no per-model
 * capability flags are supplied, behaviour must be unchanged.
 */
describe('ModelRouter.routeModelForTask capability-awareness', () => {
  const visionModel = {
    id: 'openai-gpt-4-vision', name: 'GPT-4 Vision', providerId: 'openai', enabled: true,
    supportsVision: true, supportsTools: true
  };
  const plainModel = {
    id: 'openai-gpt-4o-mini', name: 'GPT-4o Mini', providerId: 'openai', enabled: true,
    supportsVision: false, supportsTools: true
  };

  beforeEach(() => {
    // Pin the score engine so the test is deterministic: both models get the
    // same generic scores, isolating the capability multiplier's effect.
    vi.spyOn(ModelGovStorage, 'getModelScores').mockReturnValue({
      coding: 50, reasoning: 50, vision: 50, costEfficiency: 50, general: 50
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('prefers a vision-capable model for an image task', () => {
    const route = ModelRouter.routeModelForTask('describe this image', [plainModel, visionModel]);
    expect(route!.model).toBe('gpt-4-vision');
  });

  it('stays with the plain model for an image task when no capability flags are given', () => {
    const noCaps = [
      { id: 'openai-gpt-4o-mini', name: 'GPT-4o Mini', providerId: 'openai', enabled: true },
      { id: 'openai-gpt-4-vision', name: 'GPT-4 Vision', providerId: 'openai', enabled: true }
    ];
    const route = ModelRouter.routeModelForTask('describe this image', noCaps as any);
    // Without capability data the router can't boost, so the tie breaks on the
    // stable sort order (first model) — unchanged legacy behaviour.
    expect(route!.model).toBe('gpt-4o-mini');
  });

  it('prefers a tool-capable model for a coding task', () => {
    const coder = {
      id: 'anthropic-claude-tool', name: 'Claude Coder', providerId: 'anthropic', enabled: true,
      supportsVision: false, supportsTools: true
    };
    const nonTool = {
      id: 'anthropic-claude-no-tool', name: 'Claude Plain', providerId: 'anthropic', enabled: true,
      supportsVision: false, supportsTools: false
    };
    const route = ModelRouter.routeModelForTask('write a python function', [nonTool, coder]);
    expect(route!.model).toBe('claude-tool');
  });
});
