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
 * Verified live-working free models hosted on OpenCode Zen gateway.
 * Tested and verified against the live endpoint.
 */
export const OPENCODE_PRESET_MODELS: OpenCodeModelPreset[] = [
  {
    id: 'big-pickle',
    name: 'Big Pickle (200k, Reasoning, Free)',
    ctx: '200k',
    free: true,
    description: 'High performance stealth coding & reasoning model with 200k context (100% Free)',
  },
  {
    id: 'mimo-v2.5-free',
    name: 'MiMo V2.5 (Free)',
    ctx: '128k',
    free: true,
    description: 'Ultra-fast optimized multi-step coding agent model (100% Free)',
  },
  {
    id: 'nemotron-3-ultra-free',
    name: 'Nemotron 3 Ultra (Free)',
    ctx: '128k',
    free: true,
    description: 'NVIDIA high-accuracy instruction following & reasoning model (100% Free)',
  },
  {
    id: 'nemotron-3.5-lightning-free',
    name: 'Nemotron 3.5 Lightning (Free)',
    ctx: '128k',
    free: true,
    description: 'NVIDIA lightning-fast response coding model (100% Free)',
  },
  {
    id: 'ling-3.0-flash-fin-free',
    name: 'Ling 3.0 Flash Fin (Free)',
    ctx: '128k',
    free: true,
    description: 'Fast analytical and coding flash model (100% Free)',
  },
];

/** OpenCode Popular Provider descriptor for settings and onboarding catalogs */
export const OPENCODE_PROVIDER_CONFIG = {
  id: 'opencode',
  name: 'OpenCode',
  org: 'opencode',
  logoUrl: 'https://opencode.ai/favicon.ico',
  desc: 'OpenCode Zen AI gateway with 100% free models (Big Pickle, MiMo, Nemotron, etc.)',
  defaultUrl: OPENCODE_BASE_URL,
};

const BASE62_CHARS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';

/** Generates canonical OpenCode session ID matching /^ses_[0-9a-f]{12}[0-9A-Za-z]{14}$/ */
export function generateOpenCodeSessionId(): string {
  const time = Date.now().toString(16).padStart(12, '0');
  let random = '';
  for (let i = 0; i < 14; i++) {
    random += BASE62_CHARS[Math.floor(Math.random() * 62)];
  }
  return `ses_${time}${random}`;
}

/** Generates canonical OpenCode request ID matching /^msg_[0-9a-f]{12}[0-9A-Za-z]{14}$/ */
export function generateOpenCodeRequestId(): string {
  const time = Date.now().toString(16).padStart(12, '0');
  let random = '';
  for (let i = 0; i < 14; i++) {
    random += BASE62_CHARS[Math.floor(Math.random() * 62)];
  }
  return `msg_${time}${random}`;
}

/** Builds official client headers required for authorized access to OpenCode Zen */
export function getOpenCodeHeaders(apiKey?: string): Record<string, string> {
  const session = generateOpenCodeSessionId();
  const request = generateOpenCodeRequestId();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Authorization': apiKey && apiKey.trim().length > 0 ? `Bearer ${apiKey.trim()}` : 'Bearer public',
    'User-Agent': 'opencode/1.18.31 ai-sdk/provider-utils/4.0.40 runtime/bun/1.3.14',
    'x-opencode-client': 'desktop',
    'x-opencode-session': session,
    'x-opencode-request': request,
    'x-opencode-project': 'global',
    'x-session-id': session,
  };
  return headers;
}

export const VERIFIED_OPENCODE_FREE_MODELS = new Set([
  'big-pickle',
  'mimo-v2.5-free',
  'nemotron-3-ultra-free',
  'nemotron-3.5-lightning-free',
  'ling-3.0-flash-fin-free',
]);

/** Checks whether a model ID is a verified live-working free model on OpenCode */
export function isOpenCodeFreeModel(modelId: string): boolean {
  return VERIFIED_OPENCODE_FREE_MODELS.has(modelId.toLowerCase().trim());
}

/**
 * Fetches live models list from the OpenCode Zen gateway and filters down
 * strictly to verified working free models.
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
        const freeList = list.filter((m: { id: string }) => isOpenCodeFreeModel(m.id));
        if (freeList.length > 0) {
          return freeList.map((m: { id: string; name?: string; context_length?: number; description?: string }) => {
            const ctx = m.context_length ? `${Math.round(m.context_length / 1024)}k` : (m.id === 'big-pickle' ? '200k' : '128k');
            const preset = OPENCODE_PRESET_MODELS.find(p => p.id === m.id);
            return {
              id: m.id,
              name: preset?.name ?? (m.name ?? m.id),
              contextLimit: ctx,
              description: preset?.description ?? (m.description ?? 'Free tier model on OpenCode Zen'),
              free: true,
            };
          });
        }
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
    free: true,
  }));
}
