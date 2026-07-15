/**
 * provider-meta.ts — Canonical registry of every model provider supported by
 * SuperAgent.
 *
 * Agent providers group into a small number of *API families* that share a
 * wire protocol:
 *   - `openai`    → OpenAI-compatible Chat Completions API (Bearer auth)
 *   - `anthropic` → Anthropic Messages API (x-api-key auth)
 *   - `gemini`    → Google Generative Language API (x-goog-api-key auth)
 *   - `ollama`    → Ollama native local API
 *
 * Every provider id used in the UI (openrouter, kimi, claude, google, chatgpt,
 * vertex, …) is mapped here to one of those families together with its default
 * base URL. Routing logic (AgentEngine + ProviderAdapter factory) consults this
 * module instead of maintaining a hardcoded list, so adding a provider is a
 * one-line change.
 */

export type ProviderFamily = 'openai' | 'anthropic' | 'gemini' | 'ollama';

export interface ProviderMeta {
  /** Canonical provider id (matches UI/connection ids). */
  id: string;
  /** Human readable name. */
  name: string;
  /** API protocol family this provider speaks. */
  family: ProviderFamily;
  /**
   * Default base URL with no trailing slash. Empty means the user must supply
   * a `baseUrl` (e.g. Vertex AI or a self-hosted custom endpoint).
   */
  defaultBaseUrl: string;
}

const REGISTRY: Record<string, ProviderMeta> = {
  // ── OpenAI-compatible (chat/completions, Bearer) ──────────────────────────
  openai:     { id: 'openai',     name: 'OpenAI',               family: 'openai', defaultBaseUrl: 'https://api.openai.com/v1' },
  chatgpt:    { id: 'chatgpt',    name: 'OpenAI (ChatGPT)',     family: 'openai', defaultBaseUrl: 'https://api.openai.com/v1' },
  deepseek:   { id: 'deepseek',   name: 'DeepSeek',             family: 'openai', defaultBaseUrl: 'https://api.deepseek.com/v1' },
  deepinfra:  { id: 'deepinfra',  name: 'DeepInfra',            family: 'openai', defaultBaseUrl: 'https://api.deepinfra.com/v1/openai' },
  openrouter: { id: 'openrouter', name: 'OpenRouter',           family: 'openai', defaultBaseUrl: 'https://openrouter.ai/api/v1' },
  kimi:       { id: 'kimi',       name: 'Kimi (Moonshot)',      family: 'openai', defaultBaseUrl: 'https://api.moonshot.cn/v1' },
  moonshot:   { id: 'moonshot',   name: 'Moonshot AI',          family: 'openai', defaultBaseUrl: 'https://api.moonshot.cn/v1' },
  mistral:    { id: 'mistral',    name: 'Mistral AI',           family: 'openai', defaultBaseUrl: 'https://api.mistral.ai/v1' },
  grok:       { id: 'grok',       name: 'xAI Grok',             family: 'openai', defaultBaseUrl: 'https://api.x.ai/v1' },
  perplexity: { id: 'perplexity', name: 'Perplexity',           family: 'openai', defaultBaseUrl: 'https://api.perplexity.ai' },
  nvidia:     { id: 'nvidia',     name: 'NVIDIA',               family: 'openai', defaultBaseUrl: 'https://integrate.api.nvidia.com/v1' },
  vertex:     { id: 'vertex',     name: 'Google Vertex AI',     family: 'openai', defaultBaseUrl: '' },
  custom:     { id: 'custom',     name: 'Custom Endpoint',      family: 'openai', defaultBaseUrl: '' },

  // ── Anthropic Messages API ────────────────────────────────────────────────
  anthropic:  { id: 'anthropic',  name: 'Anthropic',            family: 'anthropic', defaultBaseUrl: 'https://api.anthropic.com' },
  claude:     { id: 'claude',     name: 'Anthropic Claude',     family: 'anthropic', defaultBaseUrl: 'https://api.anthropic.com' },

  // ── Google Generative Language API ────────────────────────────────────────
  gemini:     { id: 'gemini',     name: 'Google Gemini',        family: 'gemini', defaultBaseUrl: 'https://generativelanguage.googleapis.com' },
  google:     { id: 'google',     name: 'Google Gemini',        family: 'gemini', defaultBaseUrl: 'https://generativelanguage.googleapis.com' },

  // ── Ollama (local) ───────────────────────────────────────────────────────
  ollama:       { id: 'ollama',     name: 'Ollama (Local)',       family: 'ollama', defaultBaseUrl: 'http://localhost:11434' },
  'ollama-cloud': { id: 'ollama-cloud', name: 'Ollama Cloud',       family: 'ollama', defaultBaseUrl: 'https://api.ollama.com' }
};

/** All provider ids known to the system. */
export const SUPPORTED_PROVIDERS: string[] = Object.keys(REGISTRY);

/** Returns provider metadata for a known id (case-insensitive), else undefined. */
export function getProviderMeta(id: string): ProviderMeta | undefined {
  return REGISTRY[id.toLowerCase()];
}

/**
 * Resolves the API family for any provider id. Unknown ids and ids prefixed
 * with `custom` (e.g. `custom-1719500000`) default to the OpenAI-compatible
 * family since most self-hosted / BYO endpoints implement that protocol.
 */
export function resolveProviderFamily(id: string): ProviderFamily {
  const meta = getProviderMeta(id);
  if (meta) return meta.family;
  if (id.toLowerCase().startsWith('custom')) return 'openai';
  return 'openai';
}

/** Returns the registered default base URL for a provider, or '' if none. */
export function getProviderDefaultBaseUrl(id: string): string {
  const meta = getProviderMeta(id);
  if (meta && meta.defaultBaseUrl) return meta.defaultBaseUrl.replace(/\/+$/, '');
  return '';
}

/**
 * Resolves the base URL to use for a request:
 *   1. An explicitly provided `baseUrl` wins (trimmed, no trailing slash).
 *   2. Otherwise the provider's registered default.
 *   3. Otherwise a generic OpenAI endpoint as a last resort.
 */
export function resolveBaseUrl(id: string, provided?: string): string {
  if (provided && provided.trim()) return provided.trim().replace(/\/+$/, '');
  const def = getProviderDefaultBaseUrl(id);
  if (def) return def;
  return 'https://api.openai.com/v1';
}
