import { describe, it, expect, vi } from 'vitest';
import { ProvidersService } from './providers';
import { SettingsService } from './settings';
import type { AppContext, ModelConfig, ProviderConnection } from './types';

const mkProvider = (id: string): ProviderConnection => ({
  id,
  name: id,
  type: 'key',
  apiKey: 'k',
  baseUrl: ''
});

const mkModel = (id: string, providerId: string, enabled: boolean): ModelConfig => ({
  id,
  name: id,
  providerId,
  enabled,
  inputModalities: ['text'],
  outputModalities: ['text']
});

/**
 * Builds an AppContext whose state lives in plain closures (mimicking React
 * state) and whose setters accept either a value or an updater function. This
 * lets us assert that ProvidersService mutates the catalog + providers and
 * persists exactly the expected values — no browser required.
 */
function makeCtx() {
  let providers: ProviderConnection[] = [];
  let models: ModelConfig[] = [];
  let persisted: { providers: ProviderConnection[]; models: ModelConfig[] } | null = null;

  const ctx = {
    ipc: { invoke: vi.fn() },
    getConnectedProviders: () => providers,
    getModelsCatalog: () => models,
    getSetupCompleted: () => false,
    setSetupCompleted: vi.fn(),
    setConnectedProviders: ((v: ProviderConnection[] | ((p: ProviderConnection[]) => ProviderConnection[])) =>
      (providers = typeof v === 'function' ? v(providers) : v)) as AppContext['setConnectedProviders'],
    setModelsCatalog: ((v: ModelConfig[] | ((m: ModelConfig[]) => ModelConfig[])) =>
      (models = typeof v === 'function' ? v(models) : v)) as AppContext['setModelsCatalog'],
    persistStore: (p: ProviderConnection[], m: ModelConfig[]) => {
      persisted = { providers: p, models: m };
    }
  } as unknown as AppContext;

  return {
    ctx,
    getProviders: () => providers,
    getModels: () => models,
    getPersisted: () => persisted
  };
}

describe('ProvidersService', () => {
  it('connect() populates the models catalog AND the providers list, and persists both', () => {
    const { ctx, getProviders, getModels, getPersisted } = makeCtx();
    ProvidersService.connect(ctx, mkProvider('omniroute'), [
      mkModel('omniroute-auto', 'omniroute', true),
      mkModel('omniroute-llama3.3', 'omniroute', true)
    ]);

    expect(getProviders()).toHaveLength(1);
    expect(getModels()).toHaveLength(2);
    expect(getModels().every((m) => m.providerId === 'omniroute')).toBe(true);
    const persisted = getPersisted();
    expect(persisted?.providers).toHaveLength(1);
    expect(persisted?.models).toHaveLength(2);
  });

  it('connect() replaces a provider with the same id (no duplicate)', () => {
    const { ctx, getProviders, getModels } = makeCtx();
    ProvidersService.connect(ctx, mkProvider('ollama'), [mkModel('a', 'ollama', true)]);
    ProvidersService.connect(ctx, mkProvider('ollama'), [
      mkModel('b', 'ollama', true),
      mkModel('c', 'ollama', true)
    ]);

    expect(getProviders()).toHaveLength(1);
    // Old models for that provider are dropped, new ones replace them.
    expect(getModels().map((m) => m.id).sort()).toEqual(['b', 'c']);
  });

  it('disconnect() removes the provider and all of its models', () => {
    const { ctx, getProviders, getModels } = makeCtx();
    ProvidersService.connect(ctx, mkProvider('ollama'), [mkModel('a', 'ollama', true)]);
    ProvidersService.connect(ctx, mkProvider('openrouter'), [mkModel('or-1', 'openrouter', true)]);
    ProvidersService.disconnect(ctx, 'ollama');

    expect(getProviders().map((p) => p.id)).toEqual(['openrouter']);
    expect(getModels().map((m) => m.id)).toEqual(['or-1']);
  });

  it('toggleModel() flips only the targeted model and persists', () => {
    const { ctx, getModels, getPersisted } = makeCtx();
    ProvidersService.connect(ctx, mkProvider('ollama'), [
      mkModel('a', 'ollama', true),
      mkModel('b', 'ollama', false)
    ]);

    ProvidersService.toggleModel(ctx, 'b');
    expect(getModels().find((m) => m.id === 'b')?.enabled).toBe(true);
    expect(getModels().find((m) => m.id === 'a')?.enabled).toBe(true); // untouched

    ProvidersService.toggleModel(ctx, 'a');
    expect(getModels().find((m) => m.id === 'a')?.enabled).toBe(false);
    expect(getPersisted()?.models.find((m) => m.id === 'a')?.enabled).toBe(false);
  });

  it('autoDetect() appends only new providers + their models', () => {
    const { ctx, getProviders, getModels } = makeCtx();
    ProvidersService.connect(ctx, mkProvider('ollama'), [mkModel('a', 'ollama', true)]);

    // Simulate the main-process returning one already-known + one new provider.
    (ctx.ipc as any).invoke = vi.fn().mockResolvedValue([
      { id: 'ollama', name: 'Ollama', type: 'env', apiKey: '', baseUrl: '', models: [{ id: 'x', name: 'X' }] },
      { id: 'openrouter', name: 'OpenRouter', type: 'env', apiKey: '', baseUrl: '', models: [{ id: 'or-1', name: 'OR1' }] }
    ]);

    // autoDetect is async; we only assert the synchronous branch by pre-seeding
    // detected via the ipc mock and awaiting.
    return ProvidersService.autoDetect(ctx, getProviders(), getModels(), [], []).then(() => {
      expect(getProviders().map((p) => p.id).sort()).toEqual(['ollama', 'openrouter']);
      // ollama's detected model is ignored (already stored); openrouter's added
      // with provider-prefixed ids ("openrouter-or-1"). Original "a" remains.
      expect(getModels().map((m) => m.id).sort()).toEqual(['a', 'openrouter-or-1']);
    });
  });

  it('connectBatch() connects multiple providers and models atomically without losing any', () => {
    const { ctx, getProviders, getModels, getPersisted } = makeCtx();
    (ctx as any).setSetupCompleted = vi.fn();

    ProvidersService.connectBatch(ctx, [
      {
        provider: mkProvider('ollama'),
        models: [mkModel('ollama-llama3', 'ollama', true)]
      },
      {
        provider: mkProvider('chatgpt'),
        models: [mkModel('chatgpt-gpt4o', 'chatgpt', true), mkModel('chatgpt-o1', 'chatgpt', true)]
      },
      {
        provider: mkProvider('claude'),
        models: [mkModel('claude-sonnet', 'claude', true)]
      }
    ]);

    expect(getProviders()).toHaveLength(3);
    expect(getProviders().map((p) => p.id)).toEqual(['ollama', 'chatgpt', 'claude']);
    expect(getModels()).toHaveLength(4);
    expect(getPersisted()?.providers).toHaveLength(3);
    expect(getPersisted()?.models).toHaveLength(4);
  });

  it('connect() preserves enabled: true state of existing models when incoming model defaults to disabled', () => {
    const { ctx, getModels } = makeCtx();
    // Initial connect with enabled models
    ProvidersService.connect(ctx, mkProvider('ollama'), [
      mkModel('ollama-llama3', 'ollama', true),
      mkModel('ollama-tinyllama', 'ollama', false)
    ]);

    expect(getModels().find((m) => m.id === 'ollama-llama3')?.enabled).toBe(true);

    // Refresh / re-sync where all incoming models default to enabled: false
    ProvidersService.connect(ctx, mkProvider('ollama'), [
      mkModel('ollama-llama3', 'ollama', false),
      mkModel('ollama-tinyllama', 'ollama', false),
      mkModel('ollama-mistral', 'ollama', false)
    ]);

    expect(getModels().find((m) => m.id === 'ollama-llama3')?.enabled).toBe(true);
    expect(getModels().find((m) => m.id === 'ollama-tinyllama')?.enabled).toBe(false);
    expect(getModels().find((m) => m.id === 'ollama-mistral')?.enabled).toBe(false);
  });

  it('connectBatch() preserves enabled: true state of existing models', () => {
    const { ctx, getModels } = makeCtx();
    ProvidersService.connect(ctx, mkProvider('ollama'), [
      mkModel('ollama-llama3', 'ollama', true)
    ]);

    ProvidersService.connectBatch(ctx, [
      {
        provider: mkProvider('ollama'),
        models: [
          mkModel('ollama-llama3', 'ollama', false),
          mkModel('ollama-qwen', 'ollama', false)
        ]
      }
    ]);

    expect(getModels().find((m) => m.id === 'ollama-llama3')?.enabled).toBe(true);
    expect(getModels().find((m) => m.id === 'ollama-qwen')?.enabled).toBe(false);
  });
});

describe('SettingsService', () => {
  it('readInto() does NOT overwrite non-empty modelsCatalog or connectedProviders with stale settings', async () => {
    const { ctx, getModels, getProviders } = makeCtx();
    // Pre-populate with live state (e.g. loaded from store.json)
    ProvidersService.connect(ctx, mkProvider('ollama'), [
      mkModel('ollama-llama3', 'ollama', true)
    ]);

    // Stale settings.json returning empty/different/disabled models
    (ctx.ipc as any).invoke = vi.fn().mockResolvedValue({
      providers: [mkProvider('ollama'), mkProvider('stale-prov')],
      models: [mkModel('ollama-llama3', 'ollama', false), mkModel('stale-model', 'stale', false)]
    });

    await SettingsService.readInto(ctx);

    // Live catalog and providers must be untouched
    expect(getProviders().map((p) => p.id)).toEqual(['ollama']);
    expect(getModels().find((m) => m.id === 'ollama-llama3')?.enabled).toBe(true);
    expect(getModels().find((m) => m.id === 'stale-model')).toBeUndefined();
  });

  it('readInto() populates models and providers when current lists are empty (first boot fallback)', async () => {
    const { ctx, getModels, getProviders } = makeCtx();

    (ctx.ipc as any).invoke = vi.fn().mockResolvedValue({
      providers: [mkProvider('ollama')],
      models: [mkModel('ollama-llama3', 'ollama', true)]
    });

    await SettingsService.readInto(ctx);

    expect(getProviders().map((p) => p.id)).toEqual(['ollama']);
    expect(getModels().map((m) => m.id)).toEqual(['ollama-llama3']);
  });
});
