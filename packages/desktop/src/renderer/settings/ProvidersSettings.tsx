import React, { useState } from 'react';
import { ProviderConnection, ModelConfig } from './types';
import { ProvidersService } from '../logic/providers';

/** Props for the providers settings panel. */
interface ProvidersSettingsProps {
  connectedProviders: ProviderConnection[];
  onConnectProvider: (provider: ProviderConnection, models: ModelConfig[]) => void;
  onDisconnectProvider: (providerId: string) => void;
  enrichModel: (raw: any, providerId: string) => ModelConfig;
}

const ProviderLogo: React.FC<{ providerId: string; org?: string; size?: number }> = ({ providerId, org, size = 24 }) => {
  const [error, setError] = useState(false);

  const match = POPULAR_PROVIDERS.find(p => p.id === providerId || providerId.startsWith(p.id));
  const targetOrg = org || match?.org;

  if (error || !targetOrg) {
    return (
      <div style={{ width: size, height: size }} className="flex flex-shrink-0 items-center justify-center rounded-md bg-brand-hover text-[0.6em] font-semibold text-brand-textMuted">
        ⚙️
      </div>
    );
  }

  return (
    <img
      src={`https://github.com/${targetOrg}.png`}
      alt={providerId}
      onError={() => setError(true)}
      style={{ width: size, height: size }}
      className="flex-shrink-0 rounded-md object-cover"
    />
  );
};

const POPULAR_PROVIDERS = [
  { id: 'ollama', name: 'Ollama', org: 'ollama', desc: 'Local model interface (Ollama runner instance)', defaultUrl: 'http://localhost:11434' },
  { id: 'ollama-cloud', name: 'Ollama Cloud', org: 'ollama', desc: 'Ollama Cloud hosted model inference API', defaultUrl: 'https://api.ollama.com' },
  { id: 'claude', name: 'Claude', org: 'anthropic', desc: 'Anthropic Claude Developer API platform', defaultUrl: 'https://api.anthropic.com/v1' },
  { id: 'chatgpt', name: 'ChatGPT', org: 'openai', desc: 'OpenAI Developer platform API access', defaultUrl: 'https://api.openai.com/v1' },
  { id: 'google', name: 'Google', org: 'google', desc: 'Google Gemini Developer models', defaultUrl: 'https://generativelanguage.googleapis.com' },
  { id: 'vertex', name: 'Vertex API', org: 'googlecloudplatform', desc: 'Google Cloud Vertex platform integration endpoint', defaultUrl: '' },
  { id: 'deepseek', name: 'DeepSeek', org: 'deepseek-ai', desc: 'DeepSeek API endpoints and services', defaultUrl: 'https://api.deepseek.com' },
  { id: 'kimi', name: 'Kimi', org: 'moonshot-ai', desc: 'Moonshot AI developer platform provider', defaultUrl: 'https://api.moonshot.cn/v1' },
  { id: 'openrouter', name: 'OpenRouter', org: 'openrouter-ai', desc: 'Unified open router endpoint broker', defaultUrl: 'https://openrouter.ai/api/v1' },
  { id: 'nvidia', name: 'NVIDIA', org: 'NVIDIA', desc: 'NVIDIA NIM inference microservices (OpenAI-compatible)', defaultUrl: 'https://integrate.api.nvidia.com/v1' },
  { id: 'deepinfra', name: 'DeepInfra', org: 'deepinfra', desc: 'Low cost serverless inference hosting provider', defaultUrl: 'https://api.deepinfra.com/v1' }
];

/** Manages provider connections: list connected providers, connect new ones via modal, and test endpoints. */
export const ProvidersSettings: React.FC<ProvidersSettingsProps> = ({
  connectedProviders,
  onConnectProvider,
  onDisconnectProvider,
  enrichModel
}) => {
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

      const fmtTokens = (n: number): string => {
        if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 1)}M`;
        if (n >= 1_000) return `${(n / 1_000).toFixed(0)}k`;
        return String(n);
      };

      if (modalProviderId === 'ollama') {
        const res = await fetch(`${url || 'http://localhost:11434'}/api/tags`);
        if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
        const data = await res.json();
        rawModels = (data.models ?? []).map((m: any) => ({
          id: m.name, name: m.name,
          contextLimit: m.details?.parameter_size
        }));
      } else if (modalProviderId === 'chatgpt') {
        const base = url || 'https://api.openai.com/v1';
        const res = await fetch(`${base}/models`, { headers: { Authorization: `Bearer ${key}` } });
        if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
        const data = await res.json();
        rawModels = (data.data ?? []).map((m: any) => ({ id: m.id, name: m.id }));
      } else if (modalProviderId === 'deepseek') {
        const base = url || 'https://api.deepseek.com';
        const res = await fetch(`${base}/models`, { headers: { Authorization: `Bearer ${key}` } });
        if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
        const data = await res.json();
        rawModels = (data.data ?? []).map((m: any) => ({ id: m.id, name: m.id }));
      } else if (modalProviderId === 'deepinfra') {
        const base = url || 'https://api.deepinfra.com/v1';
        const res = await fetch(`${base}/models`, { headers: { Authorization: `Bearer ${key}` } });
        if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
        const data = await res.json();
        const list = Array.isArray(data) ? data : (data.data ?? []);
        rawModels = list.map((m: any) => ({
          id: m.model_name ?? m.id ?? m,
          name: m.model_name ?? m.id ?? m,
          apiType: m.type ?? m.model_type ?? undefined
        }));
      } else if (modalProviderId === 'google') {
        const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${key}`);
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
        const res = await fetch(`${base}/models`, {
          headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01' }
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
        const data = await res.json();
        rawModels = (data.data ?? []).map((m: any) => ({ id: m.id, name: m.display_name ?? m.id }));
      } else if (modalProviderId === 'kimi') {
        const base = url || 'https://api.moonshot.cn/v1';
        const res = await fetch(`${base}/models`, { headers: { Authorization: `Bearer ${key}` } });
        if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
        const data = await res.json();
        rawModels = (data.data ?? []).map((m: any) => ({ id: m.id, name: m.id }));
      } else if (modalProviderId === 'openrouter') {
        const res = await fetch('https://openrouter.ai/api/v1/models', {
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
        const res = await fetch(`${base}/models`, { headers: { Authorization: `Bearer ${key}` } });
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

        const res = await fetch(`${base}/api/tags`, { headers: authHeaders });
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
        const base = url || 'https://api.openai.com/v1';
        const headers: Record<string, string> = {};
        if (key) headers['Authorization'] = `Bearer ${key}`;
        const res = await fetch(`${base}/models`, { headers });
        if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
        const data = await res.json();
        rawModels = (data.data ?? []).map((m: any) => ({
          id: m.id, name: m.id,
          free: ProvidersService.detectFree(m.id, m.id, m.pricing)
        }));
      }

      if (rawModels.length === 0) throw new Error('Connection succeeded but no models were returned.');

      const newConfigs: ModelConfig[] = rawModels.map(m => enrichModel(m, modalProviderId));

      onConnectProvider({
        id: modalProviderId,
        name: connectionName || modalProviderId,
        type: key ? 'key' : 'custom',
        apiKey: key,
        baseUrl: url
      }, newConfigs);

      alert(`✅ Connected to ${connectionName} — ${rawModels.length} models imported.`);
      setIsModalOpen(false);
    } catch (e: any) {
      console.error(e);
      setErrorDetails(e.message || String(e));
      setTestingStatus('Connection failed');
    }
  };

  const handleForceConnect = () => {
    const knownDefaults: Record<string, { id: string; name: string; ctx?: string; free?: boolean }[]> = {
      ollama:   [{ id: 'llama3.1:8b', name: 'Llama 3.1 8B' }, { id: 'mistral:7b', name: 'Mistral 7B' }],
      chatgpt:  [{ id: 'gpt-4o', name: 'GPT-4o', ctx: '128k' }, { id: 'gpt-4o-mini', name: 'GPT-4o Mini', ctx: '128k' }, { id: 'o3-mini', name: 'o3-mini', ctx: '200k' }],
      deepseek: [{ id: 'deepseek-chat', name: 'DeepSeek Chat', ctx: '64k' }, { id: 'deepseek-reasoner', name: 'DeepSeek Reasoner', ctx: '64k' }],
      google:   [{ id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash', ctx: '1M' }, { id: 'gemini-1.5-pro', name: 'Gemini 1.5 Pro', ctx: '2M' }, { id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro', ctx: '1M' }],
      claude:   [{ id: 'claude-sonnet-4-5', name: 'Claude Sonnet 4.5', ctx: '200k' }, { id: 'claude-haiku-3-5', name: 'Claude Haiku 3.5', ctx: '200k' }],
      kimi:     [{ id: 'moonshot-v1-128k', name: 'Moonshot v1 128k', ctx: '128k' }, { id: 'moonshot-v1-32k', name: 'Moonshot v1 32k', ctx: '32k' }],
      openrouter: [{ id: 'openrouter/auto', name: 'Auto Router' }],
      nvidia: [
        { id: 'nvidia/llama-3.1-nemotron-70b-instruct', name: 'Llama 3.1 Nemotron 70B Instruct', ctx: '128k', free: true },
        { id: 'nvidia/llama-3.3-nemotron-super-49b-v1', name: 'Llama 3.3 Nemotron Super 49B', ctx: '128k', free: true },
        { id: 'meta/llama-3.1-8b-instruct', name: 'Llama 3.1 8B Instruct', ctx: '128k', free: true }
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
      alert('No offline fallback available for this provider. Please connect online to fetch models.');
      return;
    }

    const newConfigs: ModelConfig[] = defaults.map(m =>
      enrichModel({ id: m.id, name: m.name, contextLimit: m.ctx, free: m.free }, modalProviderId)
    );

    onConnectProvider({
      id: modalProviderId,
      name: connectionName || modalProviderId,
      type: apiKey ? 'key' : 'custom',
      apiKey,
      baseUrl
    }, newConfigs);

    alert(`Offline fallback: added ${defaults.length} known model(s) for ${connectionName}.`);
    setIsModalOpen(false);
  };

  const visiblePopular = POPULAR_PROVIDERS.filter(
    (p) => !connectedProviders.some((cp) => cp.id === p.id)
  );

  const typeLabel = (type: string) =>
    type === 'env' ? 'Environment' : type === 'key' ? 'API Key' : 'Custom';

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
        {connectedProviders.length === 0 ? (
          <div className="ui-card px-6 py-10 text-center text-sm text-brand-textMuted">
            No active API connections. Connect one of the popular providers below.
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {connectedProviders.map((p) => (
              <div key={p.id} className="ui-card flex items-center justify-between gap-3 p-3.5 sm:p-4">
                <div className="flex min-w-0 items-center gap-3">
                  <ProviderLogo providerId={p.id} />
                  <span className="truncate text-sm font-semibold text-brand-textMain">{p.name}</span>
                  <span className="ui-badge bg-brand-popover text-brand-textMuted">{typeLabel(p.type)}</span>
                </div>
                <button
                  onClick={() => onDisconnectProvider(p.id)}
                  className="ui-btn-ghost text-red-400 hover:bg-red-500/10 hover:text-red-300"
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
            <h3 className="mb-4 text-left font-outfit text-lg font-semibold text-brand-textMain">
              Connect {connectionName}
            </h3>

            <div className="flex flex-col gap-3.5">
              <div className="flex flex-col gap-1 text-left">
                <label className="ui-label">Connection Name</label>
                <input
                  type="text"
                  value={connectionName}
                  onChange={(e) => setConnectionName(e.target.value)}
                  className="ui-input"
                />
              </div>
              <div className="flex flex-col gap-1 text-left">
                <label className="ui-label">API Key / Token</label>
                <input
                  type="password"
                  placeholder="Enter credential token"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  className="ui-input"
                />
              </div>
              <div className="flex flex-col gap-1 text-left">
                <label className="ui-label">Base Endpoint URL</label>
                <input
                  type="text"
                  placeholder="Defaults to standard URL if empty"
                  value={baseUrl}
                  onChange={(e) => setBaseUrl(e.target.value)}
                  className="ui-input"
                />
              </div>
            </div>

            {errorDetails && (
              <div className="mt-4 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs leading-relaxed text-red-300">
                <strong>Connection Error:</strong> {errorDetails}
              </div>
            )}

            <div className="mt-5 flex items-center justify-between gap-3">
              <button
                onClick={handleForceConnect}
                className="ui-btn-ghost text-xs underline-offset-2 hover:underline"
              >
                Force Connect (Offline)
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
