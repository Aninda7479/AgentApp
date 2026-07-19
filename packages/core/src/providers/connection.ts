import { SettingsStorage } from '../storage/settings-store.js';
import { BYOKProviderManager } from './byok.js';
import { resolveBaseUrl } from './provider-meta.js';
import { capabilityRegistry } from './models.js';

/**
 * A fully-resolved AI connection the engine can actually talk to. This is the
 * single source of truth for "which provider/model/key/baseUrl is active" — it
 * lives in Core so every surface (CLI, Desktop, Web) resolves connections
 * identically. **No default is hardcoded**: the active connection is whatever
 * the user selected, or (only) the single enabled model when exactly one is
 * enabled. Credentials come from Core's persisted settings/BYOK, never from
 * terminal env vars.
 */
export interface ActiveConnection {
  provider: string;
  model: string;
  apiKey: string;
  baseUrl: string;
}

/** Resolves a stored API key for a provider from settings, then BYOK. */
function keyForProvider(provider: string): string {
  const saved = SettingsStorage.loadSettings();
  const p = saved.providers?.find((x) => x.id === provider);
  if (p?.apiKey) return p.apiKey;
  try {
    const byok = new BYOKProviderManager();
    const cfg = byok.getKey(provider);
    if (cfg?.apiKey) return cfg.apiKey;
  } catch {
    /* ignore uninitialized BYOK */
  }
  return '';
}

/** Returns the provider ids that have a stored credential (settings or BYOK). */
function configuredProviders(): string[] {
  const saved = SettingsStorage.loadSettings();
  const ids = new Set<string>();
  for (const p of saved.providers ?? []) {
    if (p.apiKey) ids.add(p.id);
  }
  try {
    for (const cfg of new BYOKProviderManager().getAllConfigs()) {
      if (cfg.apiKey) ids.add(cfg.provider);
    }
  } catch {
    /* ignore uninitialized BYOK */
  }
  return Array.from(ids);
}

/**
 * The set of model ids the user has enabled. Resolution order:
 *   1. `orchestrator.enabledModels` (explicit allowlist).
 *   2. `models` entries whose `enabled` flag is not false.
 *   3. Fallback: any model in the capability registry whose provider has a
 *      configured credential (so it is actually usable).
 * Returns `null` when there is no usable signal (nothing enabled / configured).
 */
function enabledModelCandidates(): string[] | null {
  const saved = SettingsStorage.loadSettings();

  if (saved.orchestrator?.enabledModels && saved.orchestrator.enabledModels.length > 0) {
    return saved.orchestrator.enabledModels;
  }

  if (saved.models && saved.models.length > 0) {
    const enabled = saved.models.filter((m) => m.enabled !== false).map((m) => m.id);
    if (enabled.length > 0) return enabled;
  }

  const providers = configuredProviders();
  if (providers.length === 0) return null;
  const candidates = capabilityRegistry
    .getAllCapabilities()
    .filter((c) => providers.includes(c.provider))
    .map((c) => c.id);
  return candidates.length > 0 ? candidates : null;
}

/** Resolves a connection for an explicit provider/model (used when switching). */
export function resolveConnection(provider: string, model: string): ActiveConnection {
  const saved = SettingsStorage.loadSettings();
  const apiKey = keyForProvider(provider);
  const baseUrl =
    saved.providers?.find((x) => x.id === provider)?.baseUrl || resolveBaseUrl(provider);

  let resolvedModel = model;

  // Clean provider prefix if present (e.g. "openrouter-tencent/hunyuan-a1")
  if (provider && resolvedModel.toLowerCase().startsWith(`${provider.toLowerCase()}-`)) {
    resolvedModel = resolvedModel.slice(provider.length + 1);
  }

  // Resolve display name to model ID if a matching model exists in saved models catalog
  if (saved.models && saved.models.length > 0) {
    const foundInModels = saved.models.find(
      (m) =>
        m.name?.toLowerCase() === resolvedModel.toLowerCase() ||
        m.id?.toLowerCase() === resolvedModel.toLowerCase()
    );
    if (foundInModels && foundInModels.id) {
      let rawId = foundInModels.id;
      const provId = foundInModels.providerId || provider;
      if (provId && rawId.toLowerCase().startsWith(`${provId.toLowerCase()}-`)) {
        rawId = rawId.slice(provId.length + 1);
      }
      resolvedModel = rawId;
    }
  }

  // Fallback lookup in capability registry for display names
  const cap = capabilityRegistry.getAllCapabilities().find(
    (c) =>
      c.name.toLowerCase() === resolvedModel.toLowerCase() ||
      c.id.toLowerCase() === resolvedModel.toLowerCase()
  );
  if (cap) {
    resolvedModel = cap.id;
  }

  return { provider, model: resolvedModel, apiKey, baseUrl };
}

/**
 * Returns the active connection, decided entirely by user configuration in
 * Core (never hardcoded):
 *   1. Explicit provider/model overrides (e.g. CLI `-p`/`-m` flags).
 *   2. The user's last-used model persisted in settings.
 *   3. The single enabled model — but ONLY when exactly one model is enabled.
 *   4. Otherwise there is no default: an empty connection is returned and the
 *      UI must ask the user to choose one (via `/model`).
 */
export function getActiveConnection(provider?: string, model?: string): ActiveConnection {
  if (provider && model && model !== 'default') {
    return resolveConnection(provider, model);
  }

  const saved = SettingsStorage.loadSettings();
  const last = saved.lastUsedModel;
  if (last?.provider && last?.model) {
    return resolveConnection(last.provider, last.model);
  }

  const candidates = enabledModelCandidates();
  if (candidates && candidates.length === 1) {
    const id = candidates[0];
    const cap = capabilityRegistry.getCapability(id);
    const prov = cap?.provider || saved.providers?.find((p) => p.id)?.id || '';
    return resolveConnection(prov, id);
  }

  // No default the system is allowed to assume.
  return { provider: '', model: '', apiKey: '', baseUrl: '' };
}
