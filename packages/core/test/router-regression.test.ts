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

/**
 * Capability *exclusion* (hard gate), not just the 1.1x/1.12x boost: a
 * non-capable model must never win a vision/tool task when a capable one is in
 * the pool, even if it scores higher on the generic axis. These guard the fix
 * that turned the boost into an actual candidate filter.
 */
describe('ModelRouter.routeModelForTask capability exclusion', () => {
  const visionModel = {
    id: 'openai-gpt-4-vision', name: 'GPT-4 Vision', providerId: 'openai', enabled: true,
    supportsVision: true, supportsTools: true
  };
  const plainModel = {
    id: 'deepseek-chat', name: 'DeepSeek Chat', providerId: 'deepseek', enabled: true,
    supportsVision: false, supportsTools: true
  };

  beforeEach(() => {
    // Make plainModel dominate on the generic axis so the boost alone would NOT
    // save us — only the hard filter can route the vision task correctly.
    vi.spyOn(ModelGovStorage, 'getModelScores').mockImplementation((id: string) => {
      if (id.includes('gpt-4-vision')) return { coding: 50, reasoning: 50, vision: 50, costEfficiency: 50 };
      return { coding: 96, reasoning: 96, vision: 96, costEfficiency: 96 };
    });
  });

  afterEach(() => vi.restoreAllMocks());

  it('never routes a vision task to a non-vision model when a capable one is available', () => {
    const route = ModelRouter.routeModelForTask('describe this image', [plainModel, visionModel]);
    expect(route!.model).toBe('gpt-4-vision');
  });

  it('falls back to the full pool for a vision task when no vision model is present', () => {
    const onlyPlain = { id: 'deepseek-chat', name: 'DeepSeek Chat', providerId: 'deepseek', enabled: true, supportsVision: false, supportsTools: true };
    const route = ModelRouter.routeModelForTask('describe this image', [onlyPlain]);
    // No vision-capable model in the pool → must not crash or return null; it
    // falls back to the only available model (provider prefix is stripped).
    expect(route).not.toBeNull();
    expect(route!.provider).toBe('deepseek');
    expect(route!.model).toBe('chat');
  });

  it('never routes a coding task to a tool-less model when a tool-capable one is available', () => {
    const toolLess = { id: 'openai-reasoner', name: 'Reasoner', providerId: 'openai', enabled: true, supportsVision: false, supportsTools: false };
    const toolModel = { id: 'anthropic-claude-tool', name: 'Claude Coder', providerId: 'anthropic', enabled: true, supportsVision: false, supportsTools: true };
    const route = ModelRouter.routeModelForTask('write a python function', [toolLess, toolModel]);
    expect(route!.model).toBe('claude-tool');
  });
});
