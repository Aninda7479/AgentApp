import { SettingsStorage } from '../storage/settings-store.js';
import { BYOKProviderManager } from './byok.js';
import { resolveBaseUrl } from './provider-meta.js';

/**
 * A fully-resolved AI connection the engine can actually talk to. This is the
 * single source of truth for "which provider/model/key/baseUrl is active" — it
 * lives in Core so every surface (CLI, Desktop, Web) resolves connections
 * identically and no UI hardcodes a provider, model, or API key.
 */
export interface ActiveConnection {
  provider: string;
  model: string;
  apiKey: string;
  baseUrl: string;
}

/**
 * The application's default connection. Decided ONCE here in Core — UIs must
 * never hardcode a provider, model, or key, nor read terminal env vars for
 * credentials. Keys are sourced from Core's persisted settings/BYOK (set by
 * the app itself), never from the shell.
 */
export const DEFAULT_CONNECTION: ActiveConnection = {
  provider: 'openrouter',
  model: 'tencent/hy3:free',
  apiKey: '',
  baseUrl: 'https://openrouter.ai/api/v1',
};

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

/** Resolves a connection for an explicit provider/model (used when switching). */
export function resolveConnection(provider: string, model: string): ActiveConnection {
  const saved = SettingsStorage.loadSettings();
  const apiKey = keyForProvider(provider);
  const baseUrl =
    saved.providers?.find((x) => x.id === provider)?.baseUrl || resolveBaseUrl(provider);
  return { provider, model, apiKey, baseUrl };
}

/**
 * Returns the active connection. Resolution order (all inside Core):
 *   1. Explicit `provider`/`model` overrides (e.g. CLI `-p`/`-m` flags).
 *   2. The user's last-used model persisted in settings.
 *   3. The Core default connection.
 * API keys come from persisted settings/BYOK, never from terminal env vars.
 */
export function getActiveConnection(provider?: string, model?: string): ActiveConnection {
  const saved = SettingsStorage.loadSettings();
  const last = saved.lastUsedModel;

  const finalProvider = provider || last?.provider || DEFAULT_CONNECTION.provider;
  const finalModel =
    model && model !== 'default'
      ? model
      : last?.model || DEFAULT_CONNECTION.model;

  return resolveConnection(finalProvider, finalModel);
}
