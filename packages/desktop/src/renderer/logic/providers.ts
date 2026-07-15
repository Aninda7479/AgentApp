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
   */
  static connect(ctx: AppContext, provider: ProviderConnection, newModels: ModelConfig[]): void {
    ctx.setConnectedProviders((prev) => {
      const next = [...prev.filter((p) => p.id !== provider.id), provider];
      ctx.setModelsCatalog((prevM) => {
        const nextM = [...prevM.filter((m) => m.providerId !== provider.id), ...newModels];
        ctx.persistStore(next, nextM);
        return nextM;
      });
      return next;
    });
  }

  /**
   * Disconnects a provider and removes all of its models, then persists.
   */
  static disconnect(ctx: AppContext, providerId: string): void {
    ctx.setConnectedProviders((prev) => {
      const next = prev.filter((p) => p.id !== providerId);
      ctx.setModelsCatalog((prevM) => {
        const nextM = prevM.filter((m) => m.providerId !== providerId);
        ctx.persistStore(next, nextM);
        return nextM;
      });
      return next;
    });
  }

  /**
   * Toggles a model's enabled/disabled state and persists.
   */
  static toggleModel(ctx: AppContext, modelId: string): void {
    ctx.setModelsCatalog((prev) => {
      const next = prev.map((m) => (m.id === modelId ? { ...m, enabled: !m.enabled } : m));
      ctx.setConnectedProviders((p) => {
        ctx.persistStore(p, next);
        return p;
      });
      return next;
    });
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
          enabled: false,
          contextLimit: 'n/a'
        });
      }
    }

    if (newProviders.length) {
      ctx.setConnectedProviders((prev) => {
        const next = [...prev, ...newProviders];
        ctx.setModelsCatalog((prevM) => {
          const nextM = [...prevM, ...newModels];
          ctx.persistStore(next, nextM, finalProjects, finalChats);
          return nextM;
        });
        return next;
      });
    }
  }
}
