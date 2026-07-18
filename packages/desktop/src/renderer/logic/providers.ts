/**
 * `ProvidersService` — manages AI provider connections (connect / disconnect /
 * toggle model) and the startup auto-detection of providers that ship with API
 * keys in the environment. All mutations persist through `ctx.persistStore`.
 */
import type { AppContext, ModelConfig, ProviderConnection, StoredChat, StoredProject } from './types';

export class ProvidersService {
  /**
   * Connects a new provider: replaces any existing entry with the same id, merges
   * its models (replacing that provider's previous models), and persists.
   *
   * Computation is done from the current context state (via the ctx getters)
   * and the resulting arrays are applied with flat, top-level state setters.
   * The previous implementation nested `setModelsCatalog` *inside* the
   * `setConnectedProviders` updater — a side effect inside a reducer, which can
   * be dropped or double-run (React StrictMode) and is the likely cause of the
   * catalog sometimes not populating after a connect (composer stays disabled).
   */
  static connect(ctx: AppContext, provider: ProviderConnection, newModels: ModelConfig[]): void {
    const nextProviders = [
      ...ctx.getConnectedProviders().filter((p) => p.id !== provider.id),
      provider
    ];
    const nextModels = [
      ...ctx.getModelsCatalog().filter((m) => m.providerId !== provider.id),
      ...newModels
    ];
    ctx.setConnectedProviders(nextProviders);
    ctx.setModelsCatalog(nextModels);
    ctx.persistStore(nextProviders, nextModels);
  }

  /**
   * Disconnects a provider and removes all of its models, then persists.
   */
  static disconnect(ctx: AppContext, providerId: string): void {
    const nextProviders = ctx.getConnectedProviders().filter((p) => p.id !== providerId);
    const nextModels = ctx.getModelsCatalog().filter((m) => m.providerId !== providerId);
    ctx.setConnectedProviders(nextProviders);
    ctx.setModelsCatalog(nextModels);
    ctx.persistStore(nextProviders, nextModels);
  }

  /**
   * Detects whether a model is free to use. Best-effort heuristics:
   *  - the id or name carries a `free` marker (e.g. OpenRouter's `:free` suffix), or
   *  - a pricing object is present and both the input and output costs parse to zero.
   * Some providers (e.g. NVIDIA) don't expose pricing in their model-listing API,
   * so only the name/id marker applies there.
   */
  static detectFree(
    id: string,
    name: string,
    pricing?: { prompt?: string; completion?: string; input?: string; output?: string }
  ): boolean {
    const hay = `${id} ${name}`.toLowerCase();
    if (hay.includes('free')) return true;
    if (pricing) {
      const isZero = (s?: string) => s == null || /^\s*\$?\s*0(\.0+)?\s*$/.test(s);
      const inZero = isZero(pricing.prompt ?? pricing.input);
      const outZero = isZero(pricing.completion ?? pricing.output);
      if (inZero && outZero) return true;
    }
    return false;
  }

  /**
   * Toggles a model's enabled/disabled state and persists. Flat updates only
   * (no nested setState).
   */
  static toggleModel(ctx: AppContext, modelId: string): void {
    const next = ctx
      .getModelsCatalog()
      .map((m) => (m.id === modelId ? { ...m, enabled: !m.enabled } : m));
    ctx.setModelsCatalog(next);
    ctx.persistStore(ctx.getConnectedProviders(), next);
  }

  /**
   * At startup, asks the main process to auto-detect providers that have API
   * keys configured in the environment and adds any not already stored. Each
   * detected provider's models are appended (disabled by default). Persists the
   * merged result. Failures are swallowed — auto-detect is best-effort.
   */
  static async autoDetect(
    ctx: AppContext,
    loadedProviders: ProviderConnection[],
    _loadedModels: ModelConfig[],
    finalProjects: StoredProject[],
    finalChats: StoredChat[]
  ): Promise<void> {
    const storedIds = new Set(loadedProviders.map((p) => p.id));

    let detected: Array<{
      id: string;
      name: string;
      type: 'env' | 'key' | 'custom';
      apiKey: string;
      baseUrl: string;
      models: Array<{ id: string; name: string }>;
    }> = [];

    try {
      detected = (await ctx.ipc?.invoke('auto-detect-providers')) || [];
    } catch {
      return; // auto-detect failed silently
    }
    if (!Array.isArray(detected)) return;

    const newProviders: ProviderConnection[] = [];
    const newModels: ModelConfig[] = [];

    for (const d of detected) {
      if (storedIds.has(d.id)) continue;
      newProviders.push({ id: d.id, name: d.name, type: d.type, apiKey: d.apiKey, baseUrl: d.baseUrl });
      for (const m of d.models) {
        newModels.push({
          id: `${d.id}-${m.id}`,
          name: m.name,
          providerId: d.id,
          enabled: true,
          contextLimit: 'n/a'
        });
      }
    }

    if (newProviders.length) {
      const nextProviders = [...ctx.getConnectedProviders(), ...newProviders];
      const nextModels = [...ctx.getModelsCatalog(), ...newModels];
      ctx.setConnectedProviders(nextProviders);
      ctx.setModelsCatalog(nextModels);
      ctx.persistStore(nextProviders, nextModels, finalProjects, finalChats);
    }
  }
}
