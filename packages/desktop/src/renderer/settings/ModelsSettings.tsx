import React, { useState } from 'react';
import { ProviderConnection, ModelConfig } from './types';
import { RefreshCw, ChevronDown } from 'lucide-react';
import { ProvidersService } from '../logic/providers';
import { browserSafeFetch } from '../web-fetch.js';

// Modality chips are capability categories, not state — keep them monochrome
// so the only color in the app is reserved for STATE (Monolith rule).
const MODALITY_STYLES: Record<string, string> = {
  text:  'bg-brand-popover text-brand-textMuted',
  image: 'bg-brand-popover text-brand-textMuted',
  audio: 'bg-brand-popover text-brand-textMuted',
  video: 'bg-brand-popover text-brand-textMuted'
};

const ModalityChip: React.FC<{ type: string; label?: string }> = ({ type, label }) => (
  <span className={`ui-chip ${MODALITY_STYLES[type] ?? 'bg-brand-popover text-brand-textMuted'}`}>
    {label ?? type}
  </span>
);

const Toggle: React.FC<{ enabled: boolean; onToggle: () => void }> = ({ enabled, onToggle }) => (
  <button
    type="button"
    className="ui-toggle"
    aria-checked={enabled}
    onClick={(e) => { e.stopPropagation(); onToggle(); }}
  >
    <span />
  </button>
);

/** Props for the grouped, searchable models list. */
interface ModelsListProps {
  connectedProviders: ProviderConnection[];
  modelsCatalog: ModelConfig[];
  modelSearch: string;
  showFreeOnly?: boolean;
  onToggleModel: (id: string) => void;
}

const ModelsList: React.FC<ModelsListProps> = ({ connectedProviders, modelsCatalog, modelSearch, showFreeOnly, onToggleModel }) => {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [collapsedProviders, setCollapsedProviders] = useState<Set<string>>(new Set());

  const toggleProvider = (providerId: string) => {
    setCollapsedProviders(prev => {
      const next = new Set(prev);
      if (next.has(providerId)) next.delete(providerId);
      else next.add(providerId);
      return next;
    });
  };

  if (connectedProviders.length === 0) {
    return (
      <div className="ui-card px-6 py-10 text-center text-sm text-brand-textMuted">
        No models available. Connect a provider in the “Providers” tab first.
      </div>
    );
  }

  return (
    <div>
      {connectedProviders.map(prov => {
        const models = [...modelsCatalog]
          .filter(m =>
            m.providerId === prov.id &&
            (!modelSearch || m.name.toLowerCase().includes(modelSearch.toLowerCase())) &&
            (!showFreeOnly || m.free === true)
          )
          .sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()));
        if (models.length === 0) return null;

        const collapsed = collapsedProviders.has(prov.id);

        return (
          <div key={prov.id} className="mb-6">
            <button
              type="button"
              onClick={() => toggleProvider(prov.id)}
              className="mb-2.5 flex items-center gap-2 text-left text-[11px] font-semibold uppercase tracking-wider text-brand-textMuted transition-colors hover:text-brand-textMain"
            >
              <ChevronDown size={14} className={`transition-transform ${collapsed ? '-rotate-90' : ''}`} />
              <span>{prov.name}</span>
              <span className="font-normal normal-case tracking-normal text-brand-textMuted/60">
                {models.length} model{models.length !== 1 ? 's' : ''}
              </span>
            </button>

            {!collapsed && (
              <div className="ui-card overflow-hidden">
                {models.map((model, idx) => {
                  const isExpanded = expandedId === model.id;
                  const hasIn  = (model.inputModalities  ?? []).length > 0;
                  const hasOut = (model.outputModalities ?? []).length > 0;
                  const p = model.pricing;

                  return (
                    <div key={model.id} className={idx === models.length - 1 ? '' : 'border-b border-brand-border'}>
                      <button
                        type="button"
                        onClick={() => setExpandedId(isExpanded ? null : model.id)}
                        className={`flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors ${
                          isExpanded ? 'bg-brand-popover' : 'hover:bg-brand-popover/50'
                        }`}
                      >
                        <div className="flex min-w-0 flex-col gap-1.5">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-sm font-medium text-brand-textMain">{model.name}</span>
                            {model.free && (
                              <span className="ui-chip bg-[color:var(--neon-constructive)]/12 text-[color:var(--neon-constructive)]">Free</span>
                            )}
                            {hasIn && (model.inputModalities ?? []).map(m => <ModalityChip key={m} type={m} />)}
                          </div>
                          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-brand-textMuted">
                            {model.contextLimit && (
                              <span>ctx: <span className="text-brand-textMain">{model.contextLimit}</span></span>
                            )}
                            {p?.inputPer1M ? (
                              <span>in: <span className="text-brand-textMain">{p.inputPer1M}/1M</span></span>
                            ) : model.contextLimit == null && !hasIn && (
                              <span>pricing: N/A</span>
                            )}
                            {p?.outputPer1M && (
                              <span>out: <span className="text-brand-textMain">{p.outputPer1M}/1M</span></span>
                            )}
                            {model.caching && (
                              <span className="rounded bg-[color:var(--neon-constructive)]/12 px-1.5 py-0.5 text-[color:var(--neon-constructive)]">⚡ caching</span>
                            )}
                          </div>
                        </div>

                        <div className="flex shrink-0 items-center gap-3">
                          <ChevronDown size={14} className={`text-brand-textMuted transition-transform ${isExpanded ? '' : 'rotate-180'}`} />
                          <Toggle enabled={model.enabled} onToggle={() => onToggleModel(model.id)} />
                        </div>
                      </button>

                      {isExpanded && (
                        <div className="border-t border-brand-border bg-brand-bg/40 px-4 py-4">
                          {model.description && (
                            <p className="mb-3 text-xs leading-relaxed text-brand-textMuted">{model.description}</p>
                          )}

                          <div className="flex flex-wrap gap-5">
                            {hasIn && (
                              <div>
                                <div className="ui-label mb-1.5">Input</div>
                                <div className="flex flex-wrap gap-1.5">
                                  {(model.inputModalities ?? []).map(m => <ModalityChip key={m} type={m} />)}
                                </div>
                              </div>
                            )}
                            {hasOut && (
                              <div>
                                <div className="ui-label mb-1.5">Output</div>
                                <div className="flex flex-wrap gap-1.5">
                                  {(model.outputModalities ?? []).map(m => <ModalityChip key={m} type={m} />)}
                                </div>
                              </div>
                            )}
                            <div>
                              <div className="ui-label mb-1.5">Context Window</div>
                              <span className="text-sm font-medium text-brand-textMain">{model.contextLimit ?? 'N/A'}</span>
                            </div>
                            {model.outputLimit && (
                              <div>
                                <div className="ui-label mb-1.5">Max Output</div>
                                <span className="text-sm font-medium text-brand-textMain">{model.outputLimit}</span>
                              </div>
                            )}
                            <div>
                              <div className="ui-label mb-1.5">Caching</div>
                              <span className={`text-sm font-medium ${model.caching ? 'text-[color:var(--neon-constructive)]' : 'text-brand-textMuted'}`}>
                                {model.caching ? '✓ Supported' : '✗ Not supported'}
                              </span>
                            </div>
                          </div>

                          {p ? (
                            <div className="mt-4">
                              <div className="ui-label mb-2">Pricing (per 1M tokens)</div>
                              <div className="flex flex-wrap gap-2.5">
                                {p.inputPer1M && (
                                  <div className="ui-card bg-brand-card px-3 py-2">
                                    <div className="text-[10px] uppercase tracking-wide text-brand-textMuted">Input</div>
                                    <div className="text-sm font-semibold text-brand-textMain">{p.inputPer1M}</div>
                                  </div>
                                )}
                                {p.outputPer1M && (
                                  <div className="ui-card bg-brand-card px-3 py-2">
                                    <div className="text-[10px] uppercase tracking-wide text-brand-textMuted">Output</div>
                                    <div className="text-sm font-semibold text-brand-textMain">{p.outputPer1M}</div>
                                  </div>
                                )}
                                {p.cachedInputPer1M && (
                                  <div className="ui-card bg-brand-card px-3 py-2">
                                    <div className="text-[10px] uppercase tracking-wide text-brand-textMuted">Cached Input</div>
                                    <div className="text-sm font-semibold text-(--brand-accent)">{p.cachedInputPer1M}</div>
                                  </div>
                                )}
                              </div>
                            </div>
                          ) : model.free ? (
                            <p className="mt-3 text-xs text-[color:var(--neon-constructive)]">🆓 This model is free to use.</p>
                          ) : (
                            <p className="mt-3 text-xs text-brand-textMuted">Pricing not published by this provider.</p>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};

/** Props for the models settings panel. */
interface ModelsSettingsProps {
  connectedProviders: ProviderConnection[];
  modelsCatalog: ModelConfig[];
  onConnectProvider: (provider: ProviderConnection, models: ModelConfig[]) => void;
  onToggleModel: (modelId: string) => void;
  enrichModel: (raw: any, providerId: string) => ModelConfig;
}

/** Displays the model catalog with search, per-model toggles, and a refresh-all button. */
export const ModelsSettings: React.FC<ModelsSettingsProps> = ({
  connectedProviders,
  modelsCatalog,
  onConnectProvider,
  onToggleModel,
  enrichModel
}) => {
  const [modelSearch, setModelSearch] = useState('');
  const [showFreeOnly, setShowFreeOnly] = useState(false);
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
          const res = await browserSafeFetch(`${url || 'http://localhost:11434'}/api/tags`);
          if (res.ok) {
            const d = await res.json();
            rawModels = (d.models ?? []).map((m: any) => ({ id: m.name, name: m.name, contextLimit: m.details?.parameter_size }));
          }
        } else if (prov.id === 'chatgpt') {
          const res = await browserSafeFetch(`${url || 'https://api.openai.com/v1'}/models`, { headers: { Authorization: `Bearer ${key}` } });
          if (res.ok) { const d = await res.json(); rawModels = (d.data ?? []).map((m: any) => ({ id: m.id, name: m.id })); }
        } else if (prov.id === 'deepseek') {
          const res = await browserSafeFetch(`${url || 'https://api.deepseek.com'}/models`, { headers: { Authorization: `Bearer ${key}` } });
          if (res.ok) { const d = await res.json(); rawModels = (d.data ?? []).map((m: any) => ({ id: m.id, name: m.id })); }
        } else if (prov.id === 'deepinfra') {
          const res = await browserSafeFetch(`${url || 'https://api.deepinfra.com/v1'}/models`, { headers: { Authorization: `Bearer ${key}` } });
          if (res.ok) {
            const d = await res.json();
            const list = Array.isArray(d) ? d : (d.data ?? []);
            rawModels = list.map((m: any) => ({ id: m.model_name ?? m.id ?? m, name: m.model_name ?? m.id ?? m, apiType: m.type ?? m.model_type ?? undefined }));
          }
        } else if (prov.id === 'google') {
          const res = await browserSafeFetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${key}`);
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
          const res = await browserSafeFetch(`${url || 'https://api.anthropic.com/v1'}/models`, { headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01' } });
          if (res.ok) { const d = await res.json(); rawModels = (d.data ?? []).map((m: any) => ({ id: m.id, name: m.display_name ?? m.id })); }
        } else if (prov.id === 'kimi') {
          const res = await browserSafeFetch(`${url || 'https://api.moonshot.cn/v1'}/models`, { headers: { Authorization: `Bearer ${key}` } });
          if (res.ok) { const d = await res.json(); rawModels = (d.data ?? []).map((m: any) => ({ id: m.id, name: m.id })); }
        } else if (prov.id === 'openrouter') {
          const res = await browserSafeFetch('https://openrouter.ai/api/v1/models', { headers: { Authorization: `Bearer ${key}` } });
          if (res.ok) {
            const d = await res.json();
            rawModels = (d.data ?? []).map((m: any) => {
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
                description: m.description, free, pricing
              };
            });
          }
        } else if (prov.id === 'nvidia') {
          const base = url || 'https://integrate.api.nvidia.com/v1';
          const res = await browserSafeFetch(`${base}/models`, { headers: { Authorization: `Bearer ${key}` } });
          if (res.ok) {
            const d = await res.json();
            rawModels = (d.data ?? []).map((m: any) => ({
              id: m.id, name: m.name ?? m.id,
              contextLimit: m.context_length ? fmtTokens(m.context_length) : undefined,
              description: m.description,
              free: ProvidersService.detectFree(m.id, m.name ?? m.id, m.pricing)
            }));
          }
        } else if (prov.id === 'ollama-cloud') {
          const base = url.replace(/\/+$/, '');
          const headers: Record<string, string> = {};
          if (key) headers['Authorization'] = `Bearer ${key}`;
          const res = await browserSafeFetch(`${base}/api/tags`, { headers });
          if (res.ok) {
            const d = await res.json();
            rawModels = (d.models ?? []).map((m: any) => ({
              id: m.name, name: m.name,
              contextLimit: m.details?.parameter_size ? `~${m.details.parameter_size}` : undefined
            }));
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
    <div className="mx-auto w-full max-w-3xl">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-outfit text-2xl font-semibold tracking-tight text-brand-textMain sm:text-3xl">
          Models
        </h1>
        <button
          onClick={handleRefreshAllModels}
          disabled={refreshing || connectedProviders.length === 0}
          title={connectedProviders.length === 0 ? 'Connect a provider first' : 'Re-fetch models from all providers'}
          className="ui-btn-primary disabled:opacity-40"
        >
          <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} />
          {refreshing ? (refreshStatus || 'Refreshing...') : 'Refresh all'}
        </button>
      </div>

      <div className="ui-input mb-6 flex items-center gap-2 border-transparent bg-brand-card">
        <span className="text-brand-textMuted">🔍</span>
        <input
          data-testid="model-catalog-search"
          type="text"
          placeholder="Search models"
          value={modelSearch}
          onChange={(e) => setModelSearch(e.target.value)}
          className="w-full border-none bg-transparent text-sm text-brand-textMain outline-none placeholder:text-brand-textMuted/50"
        />
        <button
          data-testid="model-free-filter"
          onClick={() => setShowFreeOnly((v) => !v)}
          className={`ui-chip transition-colors ${
            showFreeOnly
              ? 'bg-[color:var(--neon-constructive)]/15 text-[color:var(--neon-constructive)]'
              : 'bg-brand-popover text-brand-textMuted hover:text-brand-textMain'
          }`}
          title="Show only free models"
        >
          Free{showFreeOnly ? ' ✓' : ''}
        </button>
      </div>

      <ModelsList
        connectedProviders={connectedProviders}
        modelsCatalog={modelsCatalog}
        modelSearch={modelSearch}
        showFreeOnly={showFreeOnly}
        onToggleModel={onToggleModel}
      />
    </div>
  );
};
