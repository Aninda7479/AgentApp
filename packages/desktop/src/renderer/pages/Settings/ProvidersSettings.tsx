import React, { useState } from 'react';
import { ProviderConnection, ModelConfig } from './types';
import { ProvidersService } from '../../logic/providers';

/** Props for the providers settings panel. */
interface ProvidersSettingsProps {
  connectedProviders: ProviderConnection[];
  onConnectProvider: (provider: ProviderConnection, models: ModelConfig[]) => void;
  onDisconnectProvider: (providerId: string) => void;
  enrichModel: (raw: any, providerId: string) => ModelConfig;
  /** In-app toast for non-blocking success/info notices (falls back to alert). */
  onToast?: (message: string) => void;
  /** True while the persisted store is still loading — show a skeleton, not empty. */
  bootstrapping?: boolean;
}

export const ProviderLogo: React.FC<{ providerId: string; org?: string; logoUrl?: string; size?: number; className?: string }> = ({
  providerId,
  org,
  logoUrl,
  size = 24,
  className = ''
}) => {
  const [imgError, setImgError] = useState(false);

  const key = (providerId || '').toLowerCase();
  const match = POPULAR_PROVIDERS.find(p => key === p.id || key.startsWith(p.id));
  const targetLogoUrl = logoUrl || match?.logoUrl || (org || match?.org ? `https://github.com/${org || match?.org}.png` : undefined);

  if (!imgError && targetLogoUrl) {
    return (
      <img
        src={targetLogoUrl}
        alt={providerId}
        onError={() => setImgError(true)}
        style={{ width: size, height: size }}
        className={`flex-shrink-0 rounded-md object-contain p-0.5 bg-brand-popover/80 border border-brand-border/40 shadow-sm ${className}`}
      />
    );
  }

  const getBadgeStyleAndIcon = () => {
    if (key.includes('chatgpt') || key.includes('openai')) {
      return {
        bg: 'bg-emerald-600/20 text-emerald-400 border-emerald-500/30',
        svg: (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-full h-full">
            <circle cx="12" cy="12" r="9"/>
            <path d="M12 6v6l4 2"/>
          </svg>
        )
      };
    }
    if (key.includes('claude') || key.includes('anthropic')) {
      return {
        bg: 'bg-amber-600/20 text-amber-400 border-amber-500/30',
        svg: (
          <svg viewBox="0 0 24 24" fill="currentColor" className="w-full h-full">
            <path d="M12 2L14.5 9.5L22 12L14.5 14.5L12 22L9.5 14.5L2 12L9.5 9.5L12 2Z"/>
          </svg>
        )
      };
    }
    if (key.includes('google') || key.includes('gemini') || key.includes('vertex')) {
      return {
        bg: 'bg-blue-600/20 text-blue-400 border-blue-500/30',
        svg: (
          <svg viewBox="0 0 24 24" fill="currentColor" className="w-full h-full">
            <path d="M12 2L15 9L22 12L15 15L12 22L9 15L2 12L9 9L12 2Z"/>
          </svg>
        )
      };
    }
    if (key.includes('deepseek')) {
      return {
        bg: 'bg-cyan-600/20 text-cyan-400 border-cyan-500/30',
        svg: (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-full h-full">
            <path d="M2 12h20M12 2a10 10 0 0 1 10 10M12 22a10 10 0 0 1-10-10"/>
          </svg>
        )
      };
    }
    if (key.includes('omniroute')) {
      return {
        bg: 'bg-indigo-600/20 text-indigo-400 border-indigo-500/30',
        svg: (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-full h-full">
            <circle cx="12" cy="12" r="9"/>
            <path d="M12 3v18M3 12h18"/>
          </svg>
        )
      };
    }
    if (key.includes('ollama')) {
      return {
        bg: 'bg-slate-600/20 text-slate-300 border-slate-500/30',
        svg: (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-full h-full">
            <rect x="4" y="4" width="16" height="16" rx="4"/>
            <circle cx="9" cy="9" r="1.5" fill="currentColor"/>
            <circle cx="15" cy="9" r="1.5" fill="currentColor"/>
            <path d="M8 15h8"/>
          </svg>
        )
      };
    }
    if (key.includes('openrouter')) {
      return {
        bg: 'bg-purple-600/20 text-purple-400 border-purple-500/30',
        svg: (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-full h-full">
            <circle cx="6" cy="6" r="3"/>
            <circle cx="18" cy="18" r="3"/>
            <path d="M8.5 8.5l7 7M6 9v9h9"/>
          </svg>
        )
      };
    }
    if (key.includes('nvidia')) {
      return {
        bg: 'bg-emerald-600/20 text-emerald-400 border-emerald-500/30',
        svg: (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-full h-full">
            <rect x="3" y="3" width="18" height="18" rx="2"/>
            <path d="M8 12h8M12 8v8"/>
          </svg>
        )
      };
    }
    if (key.includes('kimi') || key.includes('moonshot')) {
      return {
        bg: 'bg-fuchsia-600/20 text-fuchsia-400 border-fuchsia-500/30',
        svg: (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-full h-full">
            <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
          </svg>
        )
      };
    }
    if (key.includes('deepinfra')) {
      return {
        bg: 'bg-amber-600/20 text-amber-400 border-amber-500/30',
        svg: (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-full h-full">
            <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
          </svg>
        )
      };
    }
    return {
      bg: 'bg-brand-hover text-brand-textMuted border-brand-border',
      svg: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-full h-full">
          <rect x="4" y="4" width="16" height="16" rx="2"/>
          <rect x="9" y="9" width="6" height="6"/>
          <line x1="9" y1="1" x2="9" y2="4"/>
          <line x1="15" y1="1" x2="15" y2="4"/>
          <line x1="9" y1="20" x2="9" y2="23"/>
          <line x1="15" y1="20" x2="15" y2="23"/>
          <line x1="20" y1="9" x2="23" y2="9"/>
          <line x1="20" y1="15" x2="23" y2="15"/>
          <line x1="1" y1="9" x2="4" y2="9"/>
          <line x1="1" y1="15" x2="4" y2="15"/>
        </svg>
      )
    };
  };

  const badge = getBadgeStyleAndIcon();
  const iconSize = Math.max(12, Math.round(size * 0.55));

  return (
    <div
      style={{ width: size, height: size }}
      className={`flex flex-shrink-0 items-center justify-center rounded-md border p-1 font-mono text-[10px] font-bold ${badge.bg} ${className}`}
      title={providerId}
    >
      <div style={{ width: iconSize, height: iconSize }} className="flex items-center justify-center">
        {badge.svg}
      </div>
    </div>
  );
};

const POPULAR_PROVIDERS = [
  { id: 'omniroute', name: 'OmniRoute Local', org: 'omniroute', logoUrl: 'http://127.0.0.1:20128/favicon.ico', desc: 'OmniRoute Local LLM proxy endpoint (http://127.0.0.1:20128/v1)', defaultUrl: 'http://127.0.0.1:20128/v1' },
  { id: 'ollama', name: 'Ollama', org: 'ollama', logoUrl: 'https://ollama.com/public/ollama.png', desc: 'Local model interface (Ollama runner instance)', defaultUrl: 'http://localhost:11434' },
  { id: 'ollama-cloud', name: 'Ollama Cloud', org: 'ollama', logoUrl: 'https://ollama.com/public/ollama.png', desc: 'Ollama Cloud hosted model inference API', defaultUrl: 'https://api.ollama.com' },
  { id: 'claude', name: 'Claude', org: 'anthropic', logoUrl: 'https://www.anthropic.com/favicon.ico', desc: 'Anthropic Claude Developer API platform', defaultUrl: 'https://api.anthropic.com/v1' },
  { id: 'chatgpt', name: 'ChatGPT', org: 'openai', logoUrl: 'https://openai.com/favicon.ico', desc: 'OpenAI Developer platform API access', defaultUrl: 'https://api.openai.com/v1' },
  { id: 'google', name: 'Google', org: 'google', logoUrl: 'https://www.gstatic.com/lamda/images/gemini_sparkle_v002_d473d53047313d46bf3b1.svg', desc: 'Google Gemini Developer models', defaultUrl: 'https://generativelanguage.googleapis.com' },
  { id: 'vertex', name: 'Vertex API', org: 'googlecloudplatform', logoUrl: 'https://cloud.google.com/favicon.ico', desc: 'Google Cloud Vertex platform integration endpoint', defaultUrl: '' },
  { id: 'deepseek', name: 'DeepSeek', org: 'deepseek-ai', logoUrl: 'https://www.deepseek.com/favicon.ico', desc: 'DeepSeek API endpoints and services', defaultUrl: 'https://api.deepseek.com' },
  { id: 'kimi', name: 'Kimi', org: 'moonshot-ai', logoUrl: 'https://www.moonshot.cn/favicon.ico', desc: 'Moonshot AI developer platform provider', defaultUrl: 'https://api.moonshot.cn/v1' },
  { id: 'openrouter', name: 'OpenRouter', org: 'openrouter-ai', logoUrl: 'https://openrouter.ai/favicon.ico', desc: 'Unified open router endpoint broker', defaultUrl: 'https://openrouter.ai/api/v1' },
  { id: 'nvidia', name: 'NVIDIA', org: 'NVIDIA', logoUrl: 'https://build.nvidia.com/favicon.ico', desc: 'NVIDIA NIM inference microservices (OpenAI-compatible)', defaultUrl: 'https://integrate.api.nvidia.com/v1' },
  { id: 'deepinfra', name: 'DeepInfra', org: 'deepinfra', logoUrl: 'https://deepinfra.com/favicon.ico', desc: 'Low cost serverless inference hosting provider', defaultUrl: 'https://api.deepinfra.com/v1' }
];

// Providers that can function without an API key (local / self-hosted). Every
// other popular/known provider needs a credential, so "Add Without Testing"
// must not create a provider that can never actually send a request.
const KEYLESS_PROVIDER_IDS = new Set(['ollama', 'omniroute', 'custom']);

/**
 * Browser-safe fetch for provider connectivity tests. Shared with the other
 * settings screens via ../web-fetch so the web/VPS build routes every provider
 * call through the server-side proxy instead of hitting CORS in the browser.
 */
import { browserSafeFetch } from '../../web-fetch.js';

/** Manages provider connections: list connected providers, connect new ones via modal, and test endpoints. */
export const ProvidersSettings: React.FC<ProvidersSettingsProps> = ({
  connectedProviders,
  onConnectProvider,
  onDisconnectProvider,
  enrichModel,
  onToast,
  bootstrapping = false
}) => {
  const notify = (message: string) => {
    if (onToast) onToast(message);
    else alert(message);
  };
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalProviderId, setModalProviderId] = useState('');
  const [connectionName, setConnectionName] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [baseUrl, setBaseUrl] = useState('');
  const [testingStatus, setTestingStatus] = useState('');
  const [errorDetails, setErrorDetails] = useState('');

  const handleOpenConnectModal = (pId: string, pName: string, defaultUrl: string) => {
    const id = pId === 'custom' ? `custom-${Date.now()}` : pId;
    setModalProviderId(id);
    setConnectionName(pName);
    setBaseUrl(defaultUrl);
    setApiKey('');
    setTestingStatus('');
    setErrorDetails('');
    setIsModalOpen(true);
  };

  const handleTestConnection = async () => {
    setTestingStatus('Testing connection...');
    setErrorDetails('');
    try {
      let rawModels: any[] = [];
      const key = apiKey.trim();
      const url = baseUrl.trim();

      // Validate the Base Endpoint URL up front so a typos/malformed value
      // surfaces as a friendly message instead of a raw fetch/JSON-parse error.
      if (url) {
        let parsed: URL | null = null;
        try {
          parsed = new URL(url);
        } catch {
          parsed = null;
        }
        if (!parsed || (parsed.protocol !== 'http:' && parsed.protocol !== 'https:')) {
          throw new Error('That Base Endpoint URL looks invalid. Use a full http(s) URL (e.g. https://api.openai.com/v1).');
        }
      }

      const fmtTokens = (n: number): string => {
        if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 1)}M`;
        if (n >= 1_000) return `${(n / 1_000).toFixed(0)}k`;
        return String(n);
      };

      if (modalProviderId === 'ollama') {
        const res = await browserSafeFetch(`${url || 'http://localhost:11434'}/api/tags`);
        if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
        const data = await res.json();
        rawModels = (data.models ?? []).map((m: any) => ({
          id: m.name, name: m.name,
          contextLimit: m.details?.parameter_size
        }));
      } else if (modalProviderId === 'chatgpt') {
        const base = url || 'https://api.openai.com/v1';
        const res = await browserSafeFetch(`${base}/models`, { headers: { Authorization: `Bearer ${key}` } });
        if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
        const data = await res.json();
        rawModels = (data.data ?? []).map((m: any) => ({ id: m.id, name: m.id }));
      } else if (modalProviderId === 'deepseek') {
        const base = url || 'https://api.deepseek.com';
        const res = await browserSafeFetch(`${base}/models`, { headers: { Authorization: `Bearer ${key}` } });
        if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
        const data = await res.json();
        rawModels = (data.data ?? []).map((m: any) => ({ id: m.id, name: m.id }));
      } else if (modalProviderId === 'deepinfra') {
        const base = url || 'https://api.deepinfra.com/v1';
        const res = await browserSafeFetch(`${base}/models`, { headers: { Authorization: `Bearer ${key}` } });
        if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
        const data = await res.json();
        const list = Array.isArray(data) ? data : (data.data ?? []);
        rawModels = list.map((m: any) => ({
          id: m.model_name ?? m.id ?? m,
          name: m.model_name ?? m.id ?? m,
          apiType: m.type ?? m.model_type ?? undefined
        }));
      } else if (modalProviderId === 'google') {
        const res = await browserSafeFetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${key}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
        const data = await res.json();
        rawModels = (data.models ?? []).map((m: any) => ({
          id: m.name.replace('models/', ''),
          name: m.displayName || m.name.replace('models/', ''),
          description: m.description,
          contextLimit: m.inputTokenLimit ? fmtTokens(m.inputTokenLimit) : undefined,
          outputLimit: m.outputTokenLimit ? fmtTokens(m.outputTokenLimit) : undefined
        }));
      } else if (modalProviderId === 'claude') {
        const base = url || 'https://api.anthropic.com/v1';
        const res = await browserSafeFetch(`${base}/models`, {
          headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01' }
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
        const data = await res.json();
        rawModels = (data.data ?? []).map((m: any) => ({ id: m.id, name: m.display_name ?? m.id }));
      } else if (modalProviderId === 'kimi') {
        const base = url || 'https://api.moonshot.cn/v1';
        const res = await browserSafeFetch(`${base}/models`, { headers: { Authorization: `Bearer ${key}` } });
        if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
        const data = await res.json();
        rawModels = (data.data ?? []).map((m: any) => ({ id: m.id, name: m.id }));
      } else if (modalProviderId === 'openrouter') {
        const res = await browserSafeFetch('https://openrouter.ai/api/v1/models', {
          headers: { Authorization: `Bearer ${key}` }
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
        const data = await res.json();
        rawModels = (data.data ?? []).map((m: any) => {
          const free = ProvidersService.detectFree(m.id, m.name ?? m.id, m.pricing);
          let pricing: any;
          if (!free && m.pricing) {
            const per1M = (s: string) => {
              const n = parseFloat(s);
              return Number.isFinite(n) ? `$${(n * 1_000_000).toFixed(2)}` : String(s);
            };
            pricing = { inputPer1M: per1M(m.pricing.prompt), outputPer1M: per1M(m.pricing.completion) };
          }
          return {
            id: m.id, name: m.name ?? m.id,
            contextLimit: m.context_length ? fmtTokens(m.context_length) : undefined,
            description: m.description,
            free, pricing
          };
        });
      } else if (modalProviderId === 'nvidia') {
        const base = url || 'https://integrate.api.nvidia.com/v1';
        const res = await browserSafeFetch(`${base}/models`, { headers: { Authorization: `Bearer ${key}` } });
        if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
        const data = await res.json();
        rawModels = (data.data ?? []).map((m: any) => ({
          id: m.id, name: m.name ?? m.id,
          contextLimit: m.context_length ? fmtTokens(m.context_length) : undefined,
          description: m.description,
          free: ProvidersService.detectFree(m.id, m.name ?? m.id, m.pricing)
        }));
      } else if (modalProviderId === 'ollama-cloud') {
        const base = url.replace(/\/+$/, '');
        const authHeaders: Record<string, string> = {};
        if (key) authHeaders['Authorization'] = `Bearer ${key}`;

        const res = await browserSafeFetch(`${base}/api/tags`, { headers: authHeaders });
        if (!res.ok) throw new Error(`Ollama Cloud API error [${res.status}]: ${res.statusText}`);
        const data = await res.json();
        rawModels = (data.models ?? []).map((m: any) => ({
          id: m.name,
          name: m.name,
          contextLimit: m.details?.parameter_size ? `~${m.details.parameter_size}` : undefined
        }));

        if (!rawModels?.length) {
          throw new Error('Ollama Cloud returned no models. Verify the endpoint is reachable.');
        }

        if (!key) {
          setTestingStatus('Connected (no API key — model listing only, chat will fail without a key)');
        }
      } else {
        const defaultUrl = POPULAR_PROVIDERS.find(p => p.id === modalProviderId)?.defaultUrl || 'https://api.openai.com/v1';
        let base = (url || defaultUrl).replace(/\/+$/, '');
        const headers: Record<string, string> = {};
        if (key) headers['Authorization'] = `Bearer ${key}`;

        let res: Response | null = null;
        try {
          res = await browserSafeFetch(`${base}/models`, { headers });
        } catch (fetchErr: any) {
          // If localhost failed, automatically try 127.0.0.1 fallback for local servers
          if (base.includes('localhost')) {
            const altBase = base.replace('localhost', '127.0.0.1');
            try {
              res = await browserSafeFetch(`${altBase}/models`, { headers });
              base = altBase;
            } catch {
              throw new Error(`Could not reach ${connectionName || modalProviderId} on ${base}. Ensure the local server is running, or use "Add Without Testing".`);
            }
          } else {
            throw new Error(`Could not reach ${connectionName || modalProviderId} on ${base}. Ensure the server is online or check your network connection.`);
          }
        }

        if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
        const data = await res.json();
        rawModels = (data.data ?? []).map((m: any) => ({
          id: m.id, name: m.id,
          free: ProvidersService.detectFree(m.id, m.id, m.pricing)
        }));
      }

      if (rawModels.length === 0) throw new Error('Connection succeeded but no models were returned.');

      const newConfigs: ModelConfig[] = rawModels.map(m => enrichModel(m, modalProviderId));
      const defaultUrl = POPULAR_PROVIDERS.find(p => p.id === modalProviderId)?.defaultUrl || '';

      onConnectProvider({
        id: modalProviderId,
        name: connectionName || modalProviderId,
        type: key ? 'key' : 'custom',
        apiKey: key,
        baseUrl: url || defaultUrl
      }, newConfigs);

      notify(`Connected to ${connectionName} — ${rawModels.length} models imported.`);
      setIsModalOpen(false);
    } catch (e: any) {
      console.error(e);
      const msg = e.message || String(e);
      const cleanMsg = msg === 'Failed to fetch' || msg === 'fetch failed'
        ? `Could not reach ${connectionName || modalProviderId} at ${baseUrl || 'the endpoint'}. Make sure OmniRoute is running locally, or click "Add Without Testing".`
        : msg;
      setErrorDetails(cleanMsg);
      setTestingStatus('Connection failed');
    }
  };

  const handleForceConnect = () => {
    const knownDefaults: Record<string, { id: string; name: string; ctx?: string; free?: boolean }[]> = {
      omniroute: [
        { id: 'oc/big-pickle', name: 'Big Pickle (OpenCode)', ctx: '200k', free: true },
        { id: 'omniroute-auto', name: 'OmniRoute Auto Router', ctx: '128k', free: true },
        { id: 'llama-3.3-70b', name: 'Llama 3.3 70B', ctx: '128k', free: true }
      ],
      ollama:   [{ id: 'llama3.1:8b', name: 'Llama 3.1 8B' }, { id: 'mistral:7b', name: 'Mistral 7B' }],
      chatgpt:  [{ id: 'gpt-4o', name: 'GPT-4o', ctx: '128k' }, { id: 'gpt-4o-mini', name: 'GPT-4o Mini', ctx: '128k' }, { id: 'o3-mini', name: 'o3-mini', ctx: '200k' }],
      deepseek: [{ id: 'deepseek-chat', name: 'DeepSeek Chat', ctx: '64k' }, { id: 'deepseek-reasoner', name: 'DeepSeek Reasoner', ctx: '64k' }],
      google:   [{ id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash', ctx: '1M' }, { id: 'gemini-1.5-pro', name: 'Gemini 1.5 Pro', ctx: '2M' }, { id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro', ctx: '1M' }],
      claude:   [{ id: 'claude-sonnet-4-5', name: 'Claude Sonnet 4.5', ctx: '200k' }, { id: 'claude-haiku-3-5', name: 'Claude Haiku 3.5', ctx: '200k' }],
      kimi:     [{ id: 'moonshot-v1-128k', name: 'Moonshot v1 128k', ctx: '128k' }, { id: 'moonshot-v1-32k', name: 'Moonshot v1 32k', ctx: '32k' }],
      openrouter: [{ id: 'openrouter/auto', name: 'Auto Router' }],
      nvidia: [
        { id: 'llama-3.1-nemotron-70b-instruct', name: 'Llama 3.1 Nemotron 70B Instruct', ctx: '128k', free: true },
        { id: 'llama-3.3-nemotron-super-49b-v1', name: 'Llama 3.3 Nemotron Super 49B', ctx: '128k', free: true },
        { id: 'llama-3.1-8b-instruct', name: 'Llama 3.1 8B Instruct', ctx: '128k', free: true }
      ],
      'ollama-cloud': [
        { id: 'deepseek-v4-pro', name: 'DeepSeek V4 Pro', ctx: '128k' },
        { id: 'gemma4:31b', name: 'Gemma 4 31B', ctx: '128k' },
        { id: 'gpt-oss:20b', name: 'GPT-OSS 20B', ctx: '128k' },
        { id: 'qwen3.5:397b', name: 'Qwen 3.5 397B', ctx: '128k' }
      ]
    };

    const defaults = knownDefaults[modalProviderId];
    if (!defaults) {
      notify('No preset models are available for this provider. Connect online to fetch its model list.');
      return;
    }

    // Don't create a provider that can never send a request: key-required
    // providers must have a credential before being added without a test.
    if (!KEYLESS_PROVIDER_IDS.has(modalProviderId) && !apiKey.trim()) {
      setErrorDetails('This provider needs an API key before it can be added. Enter your key, or use "Test & Connect" to verify the connection first.');
      notify('Enter an API key before adding this provider without a test — a provider added with no key can’t send any requests.');
      return;
    }

    const newConfigs: ModelConfig[] = defaults.map(m =>
      enrichModel({ id: m.id, name: m.name, contextLimit: m.ctx, free: m.free }, modalProviderId)
    );

    const defaultUrl = POPULAR_PROVIDERS.find(p => p.id === modalProviderId)?.defaultUrl || '';

    onConnectProvider({
      id: modalProviderId,
      name: connectionName || modalProviderId,
      type: apiKey ? 'key' : 'custom',
      apiKey,
      baseUrl: baseUrl || defaultUrl
    }, newConfigs);

    notify(`Added ${defaults.length} known model(s) for ${connectionName} without testing the connection.`);
    setIsModalOpen(false);
  };

  const visiblePopular = POPULAR_PROVIDERS.filter(
    (p) => !connectedProviders.some((cp) => cp.id === p.id)
  );

  // Resolve a friendly display name for a connected provider: when the user
  // leaves the connection-name blank it defaults to the raw id (e.g. "claude"),
  // so show the catalog's human label ("Claude") instead. A user-set custom
  // name is always preserved.
  const displayName = (p: { id: string; name: string }) =>
    p.name && p.name !== p.id
      ? p.name
      : POPULAR_PROVIDERS.find((x) => x.id === p.id)?.name ?? p.name;

  // Convey credential status, not just provider category. Previously a cloud
  // provider connected without a key read as "Custom", so users couldn't tell
  // which providers actually held credentials. API Key / Env var = has
  // credentials; Local = self-hosted (no key needed); No key = missing creds.
  const credStatus = (
    p: { id: string; type: string }
  ): { label: string; tone: 'constructive' | 'muted' | 'attention' } => {
    if (p.type === 'key') return { label: 'API Key', tone: 'constructive' };
    if (p.type === 'env') return { label: 'Env var', tone: 'constructive' };
    if (KEYLESS_PROVIDER_IDS.has(p.id)) return { label: 'Local', tone: 'muted' };
    return { label: 'No key', tone: 'attention' };
  };

  return (
    <div className="mx-auto w-full max-w-3xl text-left">
      <h1 className="font-outfit text-2xl font-semibold tracking-tight text-brand-textMain sm:text-3xl">
        Providers
      </h1>
      <p className="mb-7 mt-2 text-sm leading-relaxed text-brand-textMuted sm:text-base">
        Manage model connections, credentials, and custom endpoint URLs.
      </p>

      {/* Connected Providers List */}
      <section className="mb-8">
        <h3 className="ui-label mb-3">Connected providers</h3>
        {bootstrapping ? (
          <div className="flex flex-col gap-2" aria-busy="true" aria-label="Loading connections">
            {[0, 1].map((i) => (
              <div key={i} className="ui-card flex items-center gap-3 p-3.5 sm:p-4">
                <div className="h-6 w-6 flex-shrink-0 animate-pulse rounded-md bg-brand-hover" />
                <div className="h-3.5 w-40 animate-pulse rounded bg-brand-hover" />
                <div className="ml-auto h-3.5 w-16 animate-pulse rounded bg-brand-hover" />
              </div>
            ))}
          </div>
        ) : connectedProviders.length === 0 ? (
          <div className="ui-card px-6 py-10 text-center text-sm text-brand-textMuted">
            No active API connections. Connect one of the popular providers below.
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {connectedProviders.map((p) => (
              <div key={p.id} className="ui-card flex items-center justify-between gap-3 p-3.5 sm:p-4">
                <div className="flex min-w-0 items-center gap-3">
                  <ProviderLogo providerId={p.id} />
                  <span className="truncate text-sm font-semibold text-brand-textMain">{displayName(p)}</span>
                  <span className={`ui-badge ${credStatus(p).tone}`}>{credStatus(p).label}</span>
                </div>
                <button
                  onClick={() => onDisconnectProvider(p.id)}
                  className="ui-btn-ghost text-[color:var(--neon-destructive)] hover:bg-[color:var(--neon-destructive)]/10"
                >
                  Disconnect
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Popular Providers */}
      <section>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h3 className="ui-label">Popular providers</h3>
          <button onClick={() => handleOpenConnectModal('custom', 'Custom Provider', '')} className="ui-btn">
            + Add Custom Provider
          </button>
        </div>

        {visiblePopular.length === 0 ? (
          <div className="ui-card px-6 py-10 text-center text-sm text-brand-textMuted">
            All popular providers are connected!
          </div>
        ) : (
          <div className="ui-card overflow-hidden">
            {visiblePopular.map((p, idx) => (
              <div
                key={p.id}
                className={`flex items-center justify-between gap-3 p-3.5 sm:p-4 ${
                  idx === visiblePopular.length - 1 ? '' : 'border-b border-brand-border'
                }`}
              >
                <div className="flex min-w-0 items-center gap-3">
                  <ProviderLogo providerId={p.id} org={p.org} size={32} />
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold text-brand-textMain">{p.name}</div>
                    <div className="truncate text-xs text-brand-textMuted">{p.desc}</div>
                  </div>
                </div>
                <button
                  onClick={() => handleOpenConnectModal(p.id, p.name, p.defaultUrl)}
                  className="ui-btn-primary flex-shrink-0"
                >
                  + Connect
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Connect modal */}
      {isModalOpen && (
        <div
          className="ui-modal-backdrop"
          onMouseDown={(e) => { if (e.target === e.currentTarget) setIsModalOpen(false); }}
        >
          <div className="ui-modal p-5 sm:p-6">
            <div className="mb-4 flex items-center gap-3 text-left">
              <ProviderLogo providerId={modalProviderId} size={32} />
              <h3 className="font-outfit text-lg font-semibold text-brand-textMain">
                Connect {connectionName}
              </h3>
            </div>

            <div className="flex flex-col gap-3.5">
              <div className="flex flex-col gap-1 text-left">
                <label className="ui-label" htmlFor="connect-name">Connection Name</label>
                <input
                  id="connect-name"
                  type="text"
                  value={connectionName}
                  onChange={(e) => setConnectionName(e.target.value)}
                  className="ui-input"
                />
              </div>
              <div className="flex flex-col gap-1 text-left">
                <label className="ui-label" htmlFor="connect-key">API Key / Token</label>
                <input
                  id="connect-key"
                  type="password"
                  placeholder="Enter credential token"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  className="ui-input"
                />
              </div>
              <div className="flex flex-col gap-1 text-left">
                <label className="ui-label" htmlFor="connect-url">Base Endpoint URL</label>
                <input
                  id="connect-url"
                  type="text"
                  placeholder="Defaults to standard URL if empty"
                  value={baseUrl}
                  onChange={(e) => setBaseUrl(e.target.value)}
                  className="ui-input"
                />
              </div>
            </div>

            {errorDetails && (
              <div className="ui-state-banner destructive mt-4 px-3 py-2 text-xs leading-relaxed">
                <strong>Connection Error:</strong> {errorDetails}
              </div>
            )}

            {!KEYLESS_PROVIDER_IDS.has(modalProviderId) && !apiKey.trim() && (
              <p className="mt-3 text-[11px] leading-snug text-brand-textMuted">
                Enter an API key above to add {connectionName || modalProviderId} without testing — a provider with no key can’t send requests.
              </p>
            )}
            <div className="mt-5 flex items-center justify-between gap-3">
              <button
                onClick={handleForceConnect}
                disabled={!KEYLESS_PROVIDER_IDS.has(modalProviderId) && !apiKey.trim()}
                title="Add this provider's known models without testing the connection"
                className="ui-btn-ghost text-xs underline-offset-2 hover:underline disabled:opacity-40 disabled:no-underline disabled:cursor-not-allowed"
              >
                Add Without Testing
              </button>
              <div className="flex gap-2">
                <button onClick={() => setIsModalOpen(false)} className="ui-btn">
                  Cancel
                </button>
                <button
                  onClick={handleTestConnection}
                  disabled={testingStatus === 'Testing connection...'}
                  className="ui-btn-primary"
                >
                  {testingStatus === 'Testing connection...' ? 'Testing...' : 'Test & Connect'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
