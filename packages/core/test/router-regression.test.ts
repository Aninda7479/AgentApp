import { describe, it, expect } from 'vitest';
import { ModelRouter } from '../src/index.js';

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
