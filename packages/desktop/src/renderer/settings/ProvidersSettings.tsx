import React, { useState } from 'react';
import { ProviderConnection, ModelConfig } from './types';

interface ProvidersSettingsProps {
  connectedProviders: ProviderConnection[];
  onConnectProvider: (provider: ProviderConnection, models: ModelConfig[]) => void;
  onDisconnectProvider: (providerId: string) => void;
  enrichModel: (raw: any, providerId: string) => ModelConfig;
}

const ProviderLogo: React.FC<{ providerId: string; org?: string; size?: number }> = ({ providerId, org, size = 24 }) => {
  const [error, setError] = useState(false);

  // Fallback org resolution
  const match = POPULAR_PROVIDERS.find(p => p.id === providerId || providerId.startsWith(p.id));
  const targetOrg = org || match?.org;

  if (error || !targetOrg) {
    return (
      <div style={{
        width: size, height: size, borderRadius: '6px',
        backgroundColor: '#2e2220', color: '#8a8a8a',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: `${size * 0.55}px`, fontWeight: 600, flexShrink: 0
      }}>
        ⚙️
      </div>
    );
  }

  return (
    <img
      src={`https://github.com/${targetOrg}.png`}
      alt={providerId}
      onError={() => setError(true)}
      style={{
        width: size, height: size, borderRadius: '6px',
        objectFit: 'cover', flexShrink: 0
      }}
    />
  );
};

const POPULAR_PROVIDERS = [
  { id: 'ollama', name: 'Ollama', org: 'ollama', desc: 'Local model interface (Ollama runner instance)', defaultUrl: 'http://localhost:11434' },
  { id: 'claude', name: 'Claude', org: 'anthropic', desc: 'Anthropic Claude Developer API platform', defaultUrl: 'https://api.anthropic.com/v1' },
  { id: 'chatgpt', name: 'ChatGPT', org: 'openai', desc: 'OpenAI Developer platform API access', defaultUrl: 'https://api.openai.com/v1' },
  { id: 'google', name: 'Google', org: 'google', desc: 'Google Gemini Developer models', defaultUrl: 'https://generativelanguage.googleapis.com' },
  { id: 'vertex', name: 'Vertex API', org: 'googlecloudplatform', desc: 'Google Cloud Vertex platform integration endpoint', defaultUrl: '' },
  { id: 'deepseek', name: 'DeepSeek', org: 'deepseek-ai', desc: 'DeepSeek API endpoints and services', defaultUrl: 'https://api.deepseek.com' },
  { id: 'kimi', name: 'Kimi', org: 'moonshot-ai', desc: 'Moonshot AI developer platform provider', defaultUrl: 'https://api.moonshot.cn/v1' },
  { id: 'openrouter', name: 'OpenRouter', org: 'openrouter-ai', desc: 'Unified open router endpoint broker', defaultUrl: 'https://openrouter.ai/api/v1' },
  { id: 'deepinfra', name: 'DeepInfra', org: 'deepinfra', desc: 'Low cost serverless inference hosting provider', defaultUrl: 'https://api.deepinfra.com/v1' }
];

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
    // If it's a custom provider, generate a unique ID so they can connect multiple custom hosts
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
        rawModels = (data.data ?? []).map((m: any) => ({
          id: m.id, name: m.name ?? m.id,
          contextLimit: m.context_length ? fmtTokens(m.context_length) : undefined,
          description: m.description
        }));
      } else {
        const base = url || 'https://api.openai.com/v1';
        const headers: Record<string, string> = {};
        if (key) headers['Authorization'] = `Bearer ${key}`;
        const res = await fetch(`${base}/models`, { headers });
        if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
        const data = await res.json();
        rawModels = (data.data ?? []).map((m: any) => ({ id: m.id, name: m.id }));
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
    const knownDefaults: Record<string, { id: string; name: string; ctx?: string }[]> = {
      ollama:   [{ id: 'llama3.1:8b', name: 'Llama 3.1 8B' }, { id: 'mistral:7b', name: 'Mistral 7B' }],
      chatgpt:  [{ id: 'gpt-4o', name: 'GPT-4o', ctx: '128k' }, { id: 'gpt-4o-mini', name: 'GPT-4o Mini', ctx: '128k' }, { id: 'o3-mini', name: 'o3-mini', ctx: '200k' }],
      deepseek: [{ id: 'deepseek-chat', name: 'DeepSeek Chat', ctx: '64k' }, { id: 'deepseek-reasoner', name: 'DeepSeek Reasoner', ctx: '64k' }],
      google:   [{ id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash', ctx: '1M' }, { id: 'gemini-1.5-pro', name: 'Gemini 1.5 Pro', ctx: '2M' }, { id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro', ctx: '1M' }],
      claude:   [{ id: 'claude-sonnet-4-5', name: 'Claude Sonnet 4.5', ctx: '200k' }, { id: 'claude-haiku-3-5', name: 'Claude Haiku 3.5', ctx: '200k' }],
      kimi:     [{ id: 'moonshot-v1-128k', name: 'Moonshot v1 128k', ctx: '128k' }, { id: 'moonshot-v1-32k', name: 'Moonshot v1 32k', ctx: '32k' }],
      openrouter: [{ id: 'openrouter/auto', name: 'Auto Router' }]
    };

    const defaults = knownDefaults[modalProviderId];
    if (!defaults) {
      alert('No offline fallback available for this provider. Please connect online to fetch models.');
      return;
    }

    const newConfigs: ModelConfig[] = defaults.map(m =>
      enrichModel({ id: m.id, name: m.name, contextLimit: m.ctx }, modalProviderId)
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

  // Filter visible popular providers (hide already connected ones)
  const visiblePopular = POPULAR_PROVIDERS.filter(
    (p) => !connectedProviders.some((cp) => cp.id === p.id)
  );

  return (
    <div style={{ maxWidth: '780px' }}>
      <h1 style={{ fontSize: '1.6rem', fontWeight: 600, color: '#ffffff', marginBottom: '8px', textAlign: 'left' }}>
        Providers
      </h1>
      <p style={{ fontSize: '0.88rem', color: '#8a8a8a', marginBottom: '28px', textAlign: 'left', lineHeight: '1.5' }}>
        Manage model connections, credentials, and custom endpoint URLs.
      </p>

      {/* Connected Providers List */}
      <div style={{ marginBottom: '32px', textAlign: 'left' }}>
        <div style={{ fontSize: '0.92rem', fontWeight: 600, color: '#ececec', marginBottom: '16px' }}>
          Connected providers
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {connectedProviders.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '30px', border: '1px dashed #2d2321', borderRadius: '12px', color: '#8a8a8a', fontSize: '0.85rem' }}>
              No active API connections. Connect one of the popular providers below.
            </div>
          ) : (
            connectedProviders.map((p) => (
              <div
                key={p.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  backgroundColor: '#1b1412',
                  border: '1px solid #2d2321',
                  borderRadius: '12px',
                  padding: '16px 20px'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <ProviderLogo providerId={p.id} />
                  <span style={{ fontWeight: 600, color: '#ffffff', fontSize: '0.92rem' }}>{p.name}</span>
                  <span
                    style={{
                      fontSize: '0.72rem',
                      backgroundColor: '#251c1a',
                      color: '#ef4444',
                      padding: '2px 8px',
                      borderRadius: '4px',
                      fontWeight: 500
                    }}
                  >
                    {p.type === 'env' ? 'Environment' : p.type === 'key' ? 'API Key' : 'Custom'}
                  </span>
                </div>
                <button
                  onClick={() => onDisconnectProvider(p.id)}
                  style={{
                    backgroundColor: 'transparent',
                    border: 'none',
                    color: '#ffffff',
                    fontWeight: 500,
                    fontSize: '0.88rem',
                    cursor: 'pointer',
                    padding: '4px 8px'
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.color = '#ef4444')}
                  onMouseLeave={(e) => (e.currentTarget.style.color = '#ffffff')}
                >
                  Disconnect
                </button>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Popular Providers Grid */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
          <div style={{ fontSize: '0.92rem', fontWeight: 600, color: '#ececec' }}>Popular providers</div>
          <button
            onClick={() => handleOpenConnectModal('custom', 'Custom Provider', '')}
            style={{
              backgroundColor: '#2a1e1c',
              border: '1px solid #3d2b29',
              borderRadius: '6px',
              color: '#ffffff',
              padding: '6px 14px',
              fontSize: '0.82rem',
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'all 0.15s ease'
            }}
            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#3a2622')}
            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = '#2a1e1c')}
          >
            + Add Custom Provider
          </button>
        </div>
        <div style={{ backgroundColor: '#1b1412', border: '1px solid #2d2321', borderRadius: '12px', overflow: 'hidden' }}>
          {visiblePopular.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '30px', color: '#8a8a8a', fontSize: '0.85rem' }}>
              All popular providers are connected!
            </div>
          ) : (
            visiblePopular.map((p, idx) => (
              <div
                key={p.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '16px 20px',
                  borderBottom: idx === visiblePopular.length - 1 ? 'none' : '1px solid #231c1a'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flex: 1, marginRight: '16px', textAlign: 'left' }}>
                  <ProviderLogo providerId={p.id} org={p.org} size={32} />
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontWeight: 600, color: '#ffffff', fontSize: '0.92rem' }}>{p.name}</span>
                    </div>
                    <div style={{ fontSize: '0.78rem', color: '#8a8a8a', marginTop: '2px' }}>{p.desc}</div>
                  </div>
                </div>
                <button
                  onClick={() => handleOpenConnectModal(p.id, p.name, p.defaultUrl)}
                  style={{
                    backgroundColor: '#2a1e1c',
                    border: '1px solid #3d2b29',
                    borderRadius: '6px',
                    color: '#ffffff',
                    padding: '6px 12px',
                    fontSize: '0.85rem',
                    fontWeight: 500,
                    cursor: 'pointer',
                    whiteSpace: 'nowrap'
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#3a2622')}
                  onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = '#2a1e1c')}
                >
                  + Connect
                </button>
              </div>
            ))
          )}
        </div>
      </div>

      {isModalOpen && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.75)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 3000
          }}
        >
          <div
            style={{
              width: '460px',
              backgroundColor: '#1e1816',
              border: '1px solid #3d2b29',
              borderRadius: '12px',
              padding: '24px',
              boxShadow: '0 10px 30px rgba(0,0,0,0.6)'
            }}
          >
            <h3 style={{ fontSize: '1.2rem', fontWeight: 600, color: '#ffffff', marginBottom: '16px', textAlign: 'left' }}>
              Connect {connectionName}
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', marginBottom: '20px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', textAlign: 'left' }}>
                <label style={{ fontSize: '0.8rem', color: '#8a8a8a' }}>Connection Name</label>
                <input
                  type="text"
                  value={connectionName}
                  onChange={(e) => setConnectionName(e.target.value)}
                  style={{
                    backgroundColor: '#141110',
                    border: '1px solid #2d2321',
                    borderRadius: '6px',
                    padding: '8px 12px',
                    color: '#ffffff',
                    fontSize: '0.9rem',
                    outline: 'none'
                  }}
                />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', textAlign: 'left' }}>
                <label style={{ fontSize: '0.8rem', color: '#8a8a8a' }}>API Key / Token</label>
                <input
                  type="password"
                  placeholder="Enter credential token"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  style={{
                    backgroundColor: '#141110',
                    border: '1px solid #2d2321',
                    borderRadius: '6px',
                    padding: '8px 12px',
                    color: '#ffffff',
                    fontSize: '0.9rem',
                    outline: 'none'
                  }}
                />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', textAlign: 'left' }}>
                <label style={{ fontSize: '0.8rem', color: '#8a8a8a' }}>Base Endpoint URL</label>
                <input
                  type="text"
                  placeholder="Defaults to standard URL if empty"
                  value={baseUrl}
                  onChange={(e) => setBaseUrl(e.target.value)}
                  style={{
                    backgroundColor: '#141110',
                    border: '1px solid #2d2321',
                    borderRadius: '6px',
                    padding: '8px 12px',
                    color: '#ffffff',
                    fontSize: '0.9rem',
                    outline: 'none'
                  }}
                />
              </div>
            </div>

            {errorDetails && (
              <div
                style={{
                  backgroundColor: '#3d1c1a',
                  border: '1px solid #ef4444',
                  borderRadius: '6px',
                  padding: '10px 12px',
                  color: '#ffffff',
                  fontSize: '0.8rem',
                  textAlign: 'left',
                  marginBottom: '16px',
                  lineHeight: '1.4'
                }}
              >
                <strong>Connection Error:</strong> {errorDetails}
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <button
                onClick={handleForceConnect}
                style={{
                  backgroundColor: 'transparent',
                  border: 'none',
                  color: '#8a8a8a',
                  fontSize: '0.8rem',
                  cursor: 'pointer',
                  textDecoration: 'underline'
                }}
              >
                Force Connect (Offline)
              </button>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  onClick={() => setIsModalOpen(false)}
                  style={{
                    backgroundColor: 'transparent',
                    border: '1px solid #2d2321',
                    borderRadius: '6px',
                    color: '#ececec',
                    padding: '6px 14px',
                    fontSize: '0.85rem',
                    cursor: 'pointer'
                  }}
                >
                  Cancel
                </button>
                <button
                  onClick={handleTestConnection}
                  disabled={testingStatus === 'Testing connection...'}
                  style={{
                    backgroundColor: '#3b82f6',
                    border: 'none',
                    borderRadius: '6px',
                    color: '#ffffff',
                    padding: '6px 14px',
                    fontSize: '0.85rem',
                    fontWeight: 500,
                    cursor: 'pointer'
                  }}
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
