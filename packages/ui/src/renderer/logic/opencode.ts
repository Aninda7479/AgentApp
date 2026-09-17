import { browserSafeFetch } from '../web-fetch.js';

/** OpenCode Zen API base URL */
export const OPENCODE_BASE_URL = 'https://opencode.ai/zen/v1';

/** Model definition item for OpenCode */
export interface OpenCodeModelPreset {
  id: string;
  name: string;
  ctx?: string;
  free?: boolean;
  description?: string;
}

/**
 * Curated high-performance free models hosted on OpenCode Zen gateway.
 * Tested and verified against the live endpoint.
 */
export const OPENCODE_PRESET_MODELS: OpenCodeModelPreset[] = [
  { id: 'big-pickle', name: 'Big Pickle (200k context, reasoning)', ctx: '200k', free: true, description: 'High performance stealth coding and reasoning model with 200k context' },
  { id: 'deepseek-v4-flash-free', name: 'DeepSeek V4 Flash (Free)', ctx: '128k', free: true, description: 'Fast code generation and reasoning model' },
  { id: 'mimo-v2.5-free', name: 'MiMo V2.5 (Free)', ctx: '128k', free: true, description: 'Optimized multi-step coding agent model' },
  { id: 'muse-spark-1.3-contributor-free', name: 'Muse Spark 1.3 (Free)', ctx: '128k', free: true, description: 'Creative coding and reasoning model' },
  { id: 'nemotron-3-ultra-free', name: 'Nemotron 3 Ultra (Free)', ctx: '128k', free: true, description: 'High accuracy instruction following model' },
  { id: 'nemotron-3.5-lightning-free', name: 'Nemotron 3.5 Lightning (Free)', ctx: '128k', free: true, description: 'Ultra-fast response model' },
  { id: 'ling-3.0-flash-fin-free', name: 'Ling 3.0 Flash Fin (Free)', ctx: '128k', free: true, description: 'Fast financial & analytical model' },
  { id: 'union-alpha', name: 'Union Alpha', ctx: '128k', free: true, description: 'Multi-agent consensus coding model' },
  { id: 'claude-sonnet-4-5', name: 'Claude Sonnet 4.5', ctx: '200k', free: false, description: 'Advanced programming model on OpenCode Zen' },
  { id: 'gpt-5.4', name: 'GPT-5.4', ctx: '128k', free: false, description: 'General intelligence coding model' },
  { id: 'gemini-3.8-flash', name: 'Gemini 3.8 Flash', ctx: '1M', free: false, description: 'Massive context ultra-fast model' }
];

/** OpenCode Popular Provider descriptor for settings and onboarding catalogs */
export const OPENCODE_PROVIDER_CONFIG = {
  id: 'opencode',
  name: 'OpenCode',
  org: 'opencode',
  logoUrl: 'https://opencode.ai/favicon.ico',
  desc: 'OpenCode Zen AI gateway with generous free models (Big Pickle, DeepSeek, etc.)',
  defaultUrl: OPENCODE_BASE_URL,
};

/** Generates an affinity session ID header required by OpenCode Zen */
export function generateOpenCodeSessionId(): string {
  const rand = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
  return `sess_${rand}`;
}

/** Builds headers required for calling OpenCode Zen */
export function getOpenCodeHeaders(apiKey?: string): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'x-session-id': generateOpenCodeSessionId(),
    'User-Agent': 'opencode/1.0.0',
  };
  if (apiKey && apiKey.trim().length > 0) {
    headers['Authorization'] = `Bearer ${apiKey.trim()}`;
  }
  return headers;
}

/** Checks whether a model ID represents a free model on OpenCode */
export function isOpenCodeFreeModel(modelId: string): boolean {
  const lower = modelId.toLowerCase();
  if (lower.includes('free') || lower === 'big-pickle' || lower === 'union-alpha') {
    return true;
  }
  return false;
}

/**
 * Fetches live models list from the OpenCode Zen gateway.
 * Falls back to curated presets if offline or network error.
 */
export async function fetchOpenCodeModels(apiKey?: string, baseUrl?: string): Promise<Array<{
  id: string;
  name: string;
  contextLimit?: string;
  description?: string;
  free: boolean;
}>> {
  const targetUrl = (baseUrl && baseUrl.trim().length > 0 ? baseUrl.trim().replace(/\/+$/, '') : OPENCODE_BASE_URL) + '/models';
  try {
    const res = await browserSafeFetch(targetUrl, {
      headers: getOpenCodeHeaders(apiKey),
    });

    if (res.ok) {
      const json = await res.json();
      const list = Array.isArray(json?.data) ? json.data : (Array.isArray(json) ? json : []);
      if (list.length > 0) {
        return list.map((m: { id: string; name?: string; context_length?: number; description?: string }) => {
          const isFree = isOpenCodeFreeModel(m.id);
          const ctx = m.context_length ? `${Math.round(m.context_length / 1024)}k` : (m.id === 'big-pickle' ? '200k' : '128k');
          return {
            id: m.id,
            name: m.name ?? m.id,
            contextLimit: ctx,
            description: m.description ?? (isFree ? 'Free tier model on OpenCode Zen' : 'OpenCode Zen model'),
            free: isFree,
          };
        });
      }
    }
  } catch {
    // Network / offline fallback to static presets
  }

  // Fallback to verified static catalog
  return OPENCODE_PRESET_MODELS.map(p => ({
    id: p.id,
    name: p.name,
    contextLimit: p.ctx,
    description: p.description,
    free: p.free ?? false,
  }));
}
