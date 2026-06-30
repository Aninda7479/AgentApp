import React, { useState } from 'react';
import { ProviderConnection, ModelConfig } from './types';

const MODALITY_COLORS: Record<string, { bg: string; text: string; icon: string }> = {
  text:  { bg: '#1e2d1e', text: '#4ade80', icon: '📝' },
  image: { bg: '#1e1e2d', text: '#818cf8', icon: '🖼' },
  audio: { bg: '#2d1e2d', text: '#e879f9', icon: '🎵' },
  video: { bg: '#2d1a1a', text: '#f87171', icon: '🎬' },
};

const ModalityChip: React.FC<{ type: string; label?: string }> = ({ type, label }) => {
  const c = MODALITY_COLORS[type] ?? { bg: '#2d2321', text: '#8a8a8a', icon: '?' };
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: '4px',
      backgroundColor: c.bg, color: c.text,
      padding: '2px 8px', borderRadius: '999px',
      fontSize: '0.72rem', fontWeight: 500
    }}>
      {c.icon} {label ?? type}
    </span>
  );
};

const Toggle: React.FC<{ enabled: boolean; onToggle: () => void }> = ({ enabled, onToggle }) => (
  <div
    onClick={(e) => { e.stopPropagation(); onToggle(); }}
    style={{
      flexShrink: 0, width: '40px', height: '22px', borderRadius: '11px',
      backgroundColor: enabled ? '#3b82f6' : '#2d2321',
      padding: '2px', cursor: 'pointer',
      transition: 'background-color 0.2s ease',
      display: 'flex', alignItems: 'center',
      justifyContent: enabled ? 'flex-end' : 'flex-start'
    }}
  >
    <div style={{ width: '18px', height: '18px', borderRadius: '50%', backgroundColor: '#ffffff', boxShadow: '0 2px 4px rgba(0,0,0,0.3)' }} />
  </div>
);

interface ModelsListProps {
  connectedProviders: ProviderConnection[];
  modelsCatalog: ModelConfig[];
  modelSearch: string;
  onToggleModel: (id: string) => void;
}

const ModelsList: React.FC<ModelsListProps> = ({ connectedProviders, modelsCatalog, modelSearch, onToggleModel }) => {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  if (connectedProviders.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '40px', border: '1px dashed #2d2321', borderRadius: '12px', color: '#8a8a8a' }}>
        No models available. Connect a provider in the &ldquo;Providers&rdquo; tab first.
      </div>
    );
  }

  return (
    <div>
      {connectedProviders.map(prov => {
        const models = [...modelsCatalog]
          .filter(m =>
            m.providerId === prov.id &&
            (!modelSearch || m.name.toLowerCase().includes(modelSearch.toLowerCase()))
          )
          .sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()));
        if (models.length === 0) return null;

        return (
          <div key={prov.id} style={{ marginBottom: '28px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px', fontSize: '0.85rem', fontWeight: 600, color: '#6b6b6b', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              <span style={{ color: '#ef4444' }}>✦</span>
              <span>{prov.name}</span>
              <span style={{ marginLeft: '4px', fontSize: '0.75rem', fontWeight: 400, color: '#4b4b4b' }}>{models.length} model{models.length !== 1 ? 's' : ''}</span>
            </div>

            <div style={{ backgroundColor: '#1b1412', border: '1px solid #2d2321', borderRadius: '12px', overflow: 'hidden' }}>
              {models.map((model, idx) => {
                const isExpanded = expandedId === model.id;
                const hasIn  = (model.inputModalities  ?? []).length > 0;
                const hasOut = (model.outputModalities ?? []).length > 0;
                const p = model.pricing;

                return (
                  <div key={model.id} style={{ borderBottom: idx === models.length - 1 ? 'none' : '1px solid #231c1a' }}>
                    <div
                      onClick={() => setExpandedId(isExpanded ? null : model.id)}
                      style={{
                        display: 'flex', alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '14px 20px', cursor: 'pointer',
                        transition: 'background-color 0.15s ease',
                        backgroundColor: isExpanded ? '#201918' : 'transparent',
                      }}
                      onMouseEnter={e => { if (!isExpanded) e.currentTarget.style.backgroundColor = '#1e1614'; }}
                      onMouseLeave={e => { if (!isExpanded) e.currentTarget.style.backgroundColor = 'transparent'; }}
                    >
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                          <span style={{ fontWeight: 500, fontSize: '0.92rem', color: '#ffffff' }}>{model.name}</span>
                          {hasIn && (model.inputModalities ?? []).map(m => <ModalityChip key={m} type={m} />)}
                        </div>
                        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
                          {model.contextLimit && (
                            <span style={{ fontSize: '0.74rem', color: '#6b6b6b' }}>ctx: <span style={{ color: '#9a9a9a' }}>{model.contextLimit}</span></span>
                          )}
                          {p?.inputPer1M ? (
                            <span style={{ fontSize: '0.74rem', color: '#6b6b6b' }}>in: <span style={{ color: '#a3e6c0' }}>{p.inputPer1M}/1M</span></span>
                          ) : model.contextLimit == null && !hasIn && (
                            <span style={{ fontSize: '0.74rem', color: '#4b4b4b' }}>pricing: N/A</span>
                          )}
                          {p?.outputPer1M && (
                            <span style={{ fontSize: '0.74rem', color: '#6b6b6b' }}>out: <span style={{ color: '#fca5a5' }}>{p.outputPer1M}/1M</span></span>
                          )}
                          {model.caching && (
                            <span style={{ fontSize: '0.72rem', backgroundColor: '#1a2d1a', color: '#4ade80', padding: '1px 6px', borderRadius: '4px' }}>⚡ caching</span>
                          )}
                        </div>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexShrink: 0 }}>
                        <span style={{ fontSize: '0.75rem', color: '#4b4b4b', userSelect: 'none' }}>{isExpanded ? '▲' : '▼'}</span>
                        <Toggle enabled={model.enabled} onToggle={() => onToggleModel(model.id)} />
                      </div>
                    </div>

                    {isExpanded && (
                      <div style={{ padding: '0 20px 16px 20px', borderTop: '1px solid #2a1e1c', backgroundColor: '#1a1210' }}>
                        {model.description && (
                          <p style={{ fontSize: '0.8rem', color: '#7a7a7a', margin: '12px 0 10px', lineHeight: 1.5 }}>{model.description}</p>
                        )}

                        <div style={{ display: 'flex', gap: '24px', flexWrap: 'wrap', marginTop: model.description ? 0 : '12px' }}>
                          {hasIn && (
                            <div>
                              <div style={{ fontSize: '0.72rem', color: '#5a5a5a', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Input</div>
                              <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap' }}>
                                {(model.inputModalities ?? []).map(m => <ModalityChip key={m} type={m} />)}
                              </div>
                            </div>
                          )}
                          {hasOut && (
                            <div>
                              <div style={{ fontSize: '0.72rem', color: '#5a5a5a', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Output</div>
                              <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap' }}>
                                {(model.outputModalities ?? []).map(m => <ModalityChip key={m} type={m} />)}
                              </div>
                            </div>
                          )}
                          <div>
                            <div style={{ fontSize: '0.72rem', color: '#5a5a5a', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Context Window</div>
                            <span style={{ fontSize: '0.85rem', color: '#cccccc', fontWeight: 500 }}>{model.contextLimit ?? 'N/A'}</span>
                          </div>
                          {model.outputLimit && (
                            <div>
                              <div style={{ fontSize: '0.72rem', color: '#5a5a5a', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Max Output</div>
                              <span style={{ fontSize: '0.85rem', color: '#cccccc', fontWeight: 500 }}>{model.outputLimit}</span>
                            </div>
                          )}
                          <div>
                            <div style={{ fontSize: '0.72rem', color: '#5a5a5a', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Caching</div>
                            <span style={{ fontSize: '0.85rem', color: model.caching ? '#4ade80' : '#ef4444', fontWeight: 500 }}>{model.caching ? '✓ Supported' : '✗ Not supported'}</span>
                          </div>
                        </div>

                        {p && (
                          <div style={{ marginTop: '14px' }}>
                            <div style={{ fontSize: '0.72rem', color: '#5a5a5a', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Pricing (per 1M tokens)</div>
                            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                              {p.inputPer1M && (
                                <div style={{ backgroundColor: '#1a2520', border: '1px solid #2a3a2a', borderRadius: '8px', padding: '8px 14px' }}>
                                  <div style={{ fontSize: '0.7rem', color: '#4b7b5a', marginBottom: '2px' }}>Input</div>
                                  <div style={{ fontSize: '0.9rem', fontWeight: 600, color: '#a3e6c0' }}>{p.inputPer1M}</div>
                                </div>
                              )}
                              {p.outputPer1M && (
                                <div style={{ backgroundColor: '#251a1a', border: '1px solid #3a2a2a', borderRadius: '8px', padding: '8px 14px' }}>
                                  <div style={{ fontSize: '0.7rem', color: '#7b4b4b', marginBottom: '2px' }}>Output</div>
                                  <div style={{ fontSize: '0.9rem', fontWeight: 600, color: '#fca5a5' }}>{p.outputPer1M}</div>
                                </div>
                              )}
                              {p.cachedInputPer1M && (
                                <div style={{ backgroundColor: '#1a1a25', border: '1px solid #2a2a3a', borderRadius: '8px', padding: '8px 14px' }}>
                                  <div style={{ fontSize: '0.7rem', color: '#4b4b7b', marginBottom: '2px' }}>Cached Input</div>
                                  <div style={{ fontSize: '0.9rem', fontWeight: 600, color: '#818cf8' }}>{p.cachedInputPer1M}</div>
                                </div>
                              )}
                            </div>
                          </div>
                        )}
                        {!p && (
                          <p style={{ fontSize: '0.78rem', color: '#4b4b4b', marginTop: '12px' }}>Pricing not published by this provider.</p>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
};

interface ModelsSettingsProps {
  connectedProviders: ProviderConnection[];
  modelsCatalog: ModelConfig[];
  onConnectProvider: (provider: ProviderConnection, models: ModelConfig[]) => void;
  onToggleModel: (modelId: string) => void;
  enrichModel: (raw: any, providerId: string) => ModelConfig;
}

export const ModelsSettings: React.FC<ModelsSettingsProps> = ({
  connectedProviders,
  modelsCatalog,
  onConnectProvider,
  onToggleModel,
  enrichModel
}) => {
  const [modelSearch, setModelSearch] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [refreshStatus, setRefreshStatus] = useState('');

  const fmtTokens = (n: number): string => {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 1)}M`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(0)}k`;
    return String(n);
  };

  const handleRefreshAllModels = async () => {
    if (refreshing || connectedProviders.length === 0) return;
    setRefreshing(true);

    const enabledIds = new Set(modelsCatalog.filter(m => m.enabled).map(m => m.id));

    for (const prov of connectedProviders) {
      setRefreshStatus(`Refreshing ${prov.name}...`);
      try {
        const key = prov.apiKey.trim();
        const url = prov.baseUrl.trim();
        let rawModels: any[] = [];

        if (prov.id === 'ollama') {
          const res = await fetch(`${url || 'http://localhost:11434'}/api/tags`);
          if (res.ok) {
            const d = await res.json();
            rawModels = (d.models ?? []).map((m: any) => ({ id: m.name, name: m.name, contextLimit: m.details?.parameter_size }));
          }
        } else if (prov.id === 'chatgpt') {
          const res = await fetch(`${url || 'https://api.openai.com/v1'}/models`, { headers: { Authorization: `Bearer ${key}` } });
          if (res.ok) { const d = await res.json(); rawModels = (d.data ?? []).map((m: any) => ({ id: m.id, name: m.id })); }
        } else if (prov.id === 'deepseek') {
          const res = await fetch(`${url || 'https://api.deepseek.com'}/models`, { headers: { Authorization: `Bearer ${key}` } });
          if (res.ok) { const d = await res.json(); rawModels = (d.data ?? []).map((m: any) => ({ id: m.id, name: m.id })); }
        } else if (prov.id === 'deepinfra') {
          const res = await fetch(`${url || 'https://api.deepinfra.com/v1'}/models`, { headers: { Authorization: `Bearer ${key}` } });
          if (res.ok) {
            const d = await res.json();
            const list = Array.isArray(d) ? d : (d.data ?? []);
            rawModels = list.map((m: any) => ({ id: m.model_name ?? m.id ?? m, name: m.model_name ?? m.id ?? m, apiType: m.type ?? m.model_type ?? undefined }));
          }
        } else if (prov.id === 'google') {
          const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${key}`);
          if (res.ok) {
            const d = await res.json();
            rawModels = (d.models ?? []).map((m: any) => ({
              id: m.name.replace('models/', ''), name: m.displayName || m.name.replace('models/', ''),
              description: m.description,
              contextLimit: m.inputTokenLimit ? fmtTokens(m.inputTokenLimit) : undefined,
              outputLimit: m.outputTokenLimit ? fmtTokens(m.outputTokenLimit) : undefined
            }));
          }
        } else if (prov.id === 'claude') {
          const res = await fetch(`${url || 'https://api.anthropic.com/v1'}/models`, { headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01' } });
          if (res.ok) { const d = await res.json(); rawModels = (d.data ?? []).map((m: any) => ({ id: m.id, name: m.display_name ?? m.id })); }
        } else if (prov.id === 'kimi') {
          const res = await fetch(`${url || 'https://api.moonshot.cn/v1'}/models`, { headers: { Authorization: `Bearer ${key}` } });
          if (res.ok) { const d = await res.json(); rawModels = (d.data ?? []).map((m: any) => ({ id: m.id, name: m.id })); }
        } else if (prov.id === 'openrouter') {
          const res = await fetch('https://openrouter.ai/api/v1/models', { headers: { Authorization: `Bearer ${key}` } });
          if (res.ok) {
            const d = await res.json();
            rawModels = (d.data ?? []).map((m: any) => ({ id: m.id, name: m.name ?? m.id, contextLimit: m.context_length ? fmtTokens(m.context_length) : undefined, description: m.description }));
          }
        }

        if (rawModels.length > 0) {
          const freshModels = rawModels.map(m => {
            const enriched = enrichModel(m, prov.id);
            return { ...enriched, enabled: enabledIds.has(enriched.id) };
          });
          onConnectProvider(prov, freshModels);
        }
      } catch {
        // Skip failing provider
      }
    }

    setRefreshStatus('');
    setRefreshing(false);
  };

  return (
    <div style={{ maxWidth: '780px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' }}>
        <h1 style={{ fontSize: '1.6rem', fontWeight: 600, color: '#ffffff', margin: 0 }}>Models</h1>
        <button
          onClick={handleRefreshAllModels}
          disabled={refreshing || connectedProviders.length === 0}
          title={connectedProviders.length === 0 ? 'Connect a provider first' : 'Re-fetch models from all providers'}
          style={{
            display: 'flex', alignItems: 'center', gap: '6px',
            backgroundColor: refreshing ? '#1e1614' : '#2a1e1c',
            border: '1px solid #3d2b29',
            borderRadius: '8px', color: refreshing ? '#6b6b6b' : '#ffffff',
            fontSize: '0.85rem', fontWeight: 500,
            padding: '8px 14px', cursor: refreshing || connectedProviders.length === 0 ? 'not-allowed' : 'pointer',
            transition: 'all 0.15s ease', opacity: connectedProviders.length === 0 ? 0.4 : 1
          }}
          onMouseEnter={e => { if (!refreshing && connectedProviders.length > 0) e.currentTarget.style.backgroundColor = '#3a2622'; }}
          onMouseLeave={e => { if (!refreshing) e.currentTarget.style.backgroundColor = refreshing ? '#1e1614' : '#2a1e1c'; }}
        >
          <span style={{ display: 'inline-block', animation: refreshing ? 'spin 1s linear infinite' : 'none' }}>↻</span>
          {refreshing ? (refreshStatus || 'Refreshing...') : 'Refresh all'}
        </button>
      </div>
      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>

      <div
        style={{
          backgroundColor: '#1b1412',
          border: '1px solid #2d2321',
          borderRadius: '8px',
          display: 'flex',
          alignItems: 'center',
          padding: '10px 16px',
          marginBottom: '24px'
        }}
      >
        <span style={{ color: '#8a8a8a', marginRight: '8px' }}>🔍</span>
        <input
          data-testid="model-catalog-search"
          type="text"
          placeholder="Search models"
          value={modelSearch}
          onChange={(e) => setModelSearch(e.target.value)}
          style={{
            background: 'transparent',
            border: 'none',
            outline: 'none',
            color: '#ffffff',
            fontSize: '0.9rem',
            flex: 1
          }}
        />
      </div>

      <ModelsList
        connectedProviders={connectedProviders}
        modelsCatalog={modelsCatalog}
        modelSearch={modelSearch}
        onToggleModel={onToggleModel}
      />
    </div>
  );
};
