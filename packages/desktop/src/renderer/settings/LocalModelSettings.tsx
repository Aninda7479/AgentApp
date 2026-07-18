import React, { useState, useEffect, useCallback } from 'react';
import {
  Cpu,
  HardDrive,
  Download,
  Trash2,
  RefreshCw,
  Search,
  Check,
  AlertTriangle,
  MemoryStick,
  MonitorSmartphone,
  CircleCheck,
  CircleAlert
} from 'lucide-react';
import { ProviderConnection, ModelConfig } from './types';
import type { SystemInfo } from '../../main/system-info';
import {
  rankModels,
  fetchLiveCatalog,
  RankedModel,
  OllamaCatalogModel
} from '../logic/ollama-catalog';
import {
  isOllamaReachable,
  listInstalled,
  showModel,
  pullModel,
  deleteModel,
  InstalledModel,
  PullProgress,
  DEFAULT_OLLAMA_URL
} from '../logic/ollama-manager';

/** Props for the Local Model (Ollama) settings panel. */
interface LocalModelSettingsProps {
  connectedProviders: ProviderConnection[];
  modelsCatalog: ModelConfig[];
  onConnectProvider: (provider: ProviderConnection, models: ModelConfig[]) => void;
  enrichModel: (raw: any, providerId: string) => ModelConfig;
  onToast?: (message: string) => void;
}

const fmtGB = (n: number): string => (n >= 10 ? Math.round(n).toString() : (Math.round(n * 10) / 10).toString());
const fmtBytes = (bytes: number): string => {
  if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(1)} GB`;
  if (bytes >= 1e6) return `${(bytes / 1e6).toFixed(0)} MB`;
  return `${bytes} B`;
};

// Modality chips are capability categories — keep them monochrome (Monolith rule).
const MODALITY_STYLES: Record<string, string> = {
  text: 'bg-brand-popover text-brand-textMuted',
  image: 'bg-brand-popover text-brand-textMuted',
  audio: 'bg-brand-popover text-brand-textMuted',
  video: 'bg-brand-popover text-brand-textMuted'
};
const ModalityChip: React.FC<{ type: string }> = ({ type }) => (
  <span className={`ui-chip ${MODALITY_STYLES[type] ?? 'bg-brand-popover text-brand-textMuted'}`}>{type}</span>
);

const FIT_BADGE: Record<RankedModel['fit'], { label: string; cls: string }> = {
  best: { label: 'Best performance', cls: 'bg-[color:var(--neon-constructive)]/15 text-[color:var(--neon-constructive)]' },
  runnable: { label: 'Runnable', cls: 'bg-brand-popover text-brand-textMuted' },
  'too-large': { label: 'Too large', cls: 'bg-[color:var(--neon-attention)]/15 text-[color:var(--neon-attention)]' }
};

export const LocalModelSettings: React.FC<LocalModelSettingsProps> = ({
  onConnectProvider,
  enrichModel,
  onToast
}) => {
  const notify = (message: string) => {
    if (onToast) onToast(message);
    else console.log('[local-model]', message);
  };

  const [systemInfo, setSystemInfo] = useState<SystemInfo | null>(null);
  const [systemLoading, setSystemLoading] = useState(true);
  const [ollamaReachable, setOllamaReachable] = useState<boolean | null>(null);
  const [installed, setInstalled] = useState<InstalledModel[]>([]);
  const [ranked, setRanked] = useState<RankedModel[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [catalogFailed, setCatalogFailed] = useState(false);
  const [catalogProgress, setCatalogProgress] = useState<{ done: number; total: number }>({
    done: 0,
    total: 0
  });
  const [search, setSearch] = useState('');
  const [runnableOnly, setRunnableOnly] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [pulling, setPulling] = useState<Record<string, PullProgress>>({});
  const [working, setWorking] = useState<Set<string>>(new Set());

  const installedSet = new Set(installed.map((m) => m.name));

  const loadSystemInfo = useCallback(async () => {
    setSystemLoading(true);
    try {
      const ipc =
        typeof window !== 'undefined' && (window as any).require
          ? (window as any).require('electron').ipcRenderer
          : null;
      const info = (await ipc?.invoke('system-info')) as SystemInfo | null;
      setSystemInfo(info ?? null);
    } catch {
      setSystemInfo(null);
    } finally {
      setSystemLoading(false);
    }
  }, []);

  const syncToSuperAgent = useCallback(
    async (list: InstalledModel[]) => {
      try {
        const enriched: ModelConfig[] = [];
        for (const m of list) {
          let showCtx: string | undefined;
          let inputMod: string[] | undefined;
          let outputMod: string[] | undefined;
          try {
            const info = await showModel(m.name);
            showCtx = info.contextLimit;
            inputMod = info.inputModalities;
            outputMod = info.outputModalities;
          } catch {
            /* show failed — fall back to catalog-less enrichment */
          }
          const desc = [
            m.parameterSize ? `${m.parameterSize}` : '',
            m.quantLevel ? `quant ${m.quantLevel}` : '',
            showCtx ? `ctx ${showCtx}` : ''
          ]
            .filter(Boolean)
            .join(' · ');
          const raw = {
            id: m.name,
            name: m.name,
            contextLimit: showCtx,
            outputLimit: undefined as string | undefined,
            description: desc || undefined,
            free: true,
            inputModalities: inputMod,
            outputModalities: outputMod
          };
          enriched.push(enrichModel(raw, 'ollama'));
        }
        onConnectProvider(
          {
            id: 'ollama',
            name: 'Ollama',
            type: 'custom',
            apiKey: '',
            baseUrl: DEFAULT_OLLAMA_URL
          },
          enriched
        );
      } catch (err: any) {
        console.error('[local-model] sync failed:', err);
      }
    },
    [enrichModel, onConnectProvider]
  );

  const checkOllama = useCallback(async () => {
    const reachable = await isOllamaReachable();
    setOllamaReachable(reachable);
    if (reachable) {
      const list = await listInstalled();
      setInstalled(list);
      await syncToSuperAgent(list);
    } else {
      setInstalled([]);
    }
  }, [syncToSuperAgent]);

  const loadCatalog = useCallback(async () => {
    setCatalogLoading(true);
    setCatalogFailed(false);
    try {
      const catalog = await fetchLiveCatalog((done, total) => setCatalogProgress({ done, total }));
      setRanked(rankModels(catalog, systemInfo));
      if (catalog.length === 0) setCatalogFailed(true);
    } catch {
      setRanked([]);
      setCatalogFailed(true);
    } finally {
      setCatalogLoading(false);
    }
  }, [systemInfo]);

  useEffect(() => {
    loadSystemInfo();
  }, [loadSystemInfo]);

  useEffect(() => {
    checkOllama();
  }, [checkOllama]);

  useEffect(() => {
    loadCatalog();
  }, [loadCatalog]);

  // Re-rank whenever hardware resolves (or after a refresh) against the current catalog.
  const refreshAll = async () => {
    await loadSystemInfo();
    await checkOllama();
    await loadCatalog();
  };

  const toggleExpand = (name: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  const handlePull = async (model: OllamaCatalogModel) => {
    setWorking((w) => new Set(w).add(model.name));
    setPulling((p) => ({ ...p, [model.name]: { status: 'starting', completed: 0, total: 0, percent: 0 } }));
    try {
      await pullModel(model.name, (prog) => {
        setPulling((p) => ({ ...p, [model.name]: prog }));
      });
      notify(`Downloaded ${model.name}`);
      await checkOllama();
    } catch (err: any) {
      notify(`Download failed: ${err.message || err}`);
    } finally {
      setWorking((w) => {
        const next = new Set(w);
        next.delete(model.name);
        return next;
      });
      setPulling((p) => {
        const next = { ...p };
        delete next[model.name];
        return next;
      });
    }
  };

  const handleDelete = async (name: string) => {
    setWorking((w) => new Set(w).add(name));
    try {
      await deleteModel(name);
      notify(`Deleted ${name}`);
      await checkOllama();
    } catch (err: any) {
      notify(`Delete failed: ${err.message || err}`);
    } finally {
      setWorking((w) => {
        const next = new Set(w);
        next.delete(name);
        return next;
      });
    }
  };

  const filtered = ranked.filter((r) => {
    if (runnableOnly && r.fit === 'too-large') return false;
    if (search) {
      const q = search.toLowerCase();
      const m = r.model;
      return (
        m.name.toLowerCase().includes(q) ||
        m.family.toLowerCase().includes(q) ||
        m.description.toLowerCase().includes(q) ||
        m.tags.some((t) => t.includes(q))
      );
    }
    return true;
  });

  const bestCount = ranked.filter((r) => r.fit === 'best').length;
  const runnableCount = ranked.filter((r) => r.fit === 'runnable').length;
  const tooLargeCount = ranked.filter((r) => r.fit === 'too-large').length;

  return (
    <div className="mx-auto w-full max-w-3xl">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-outfit text-2xl font-semibold tracking-tight text-brand-textMain sm:text-3xl">
            Local Models
          </h1>
          <p className="mt-1 text-sm text-brand-textMuted sm:text-base">
            Run AI models on your own hardware with Ollama — discover, download, and manage them here.
          </p>
        </div>
        <button onClick={refreshAll} className="ui-btn-primary" title="Re-detect hardware and Ollama status">
          <RefreshCw size={14} /> Refresh
        </button>
      </div>

      {/* ── System overview ─────────────────────────────────────────────── */}
      <div className="ui-card mb-6 p-5">
        <div className="mb-3 flex items-center gap-2">
          <Cpu size={16} className="text-brand-textMuted" />
          <span className="ui-label">Your system</span>
          {systemInfo?.isUnifiedMemory && (
            <span className="ui-badge muted">Unified Memory (Apple Silicon)</span>
          )}
        </div>
        {systemLoading || !systemInfo ? (
          <div className="flex flex-col gap-2" aria-busy="true">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="h-3.5 w-full max-w-md animate-pulse rounded bg-brand-hover" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Stat icon={<Cpu size={14} />} label="CPU" value={systemInfo.cpuBrand} sub={`${systemInfo.cpuCores} cores · ${systemInfo.cpuSpeedGHz} GHz`} />
            <Stat icon={<MemoryStick size={14} />} label="RAM" value={`${fmtGB(systemInfo.ramGB)} GB`} sub={`${fmtGB(systemInfo.ramFreeGB)} GB free`} />
            <div className="sm:col-span-2">
              <div className="ui-label mb-1.5">GPU{systemInfo.gpus.length !== 1 ? 's' : ''}</div>
              {systemInfo.gpus.length === 0 ? (
                <div className="text-xs text-brand-textMuted">No discrete GPU detected (CPU-only inference)</div>
              ) : (
                <div className="flex flex-col gap-1.5">
                  {systemInfo.gpus.map((g, i) => (
                    <div key={i} className="flex items-center justify-between gap-2 text-xs">
                      <span className="text-brand-textMain">{g.model}</span>
                      <span className="text-brand-textMuted">
                        {g.vramGB > 0 ? `${g.vramGB} GB vRAM` : 'shared memory'}
                      </span>
                    </div>
                  ))}
                  <div className="mt-1 text-[11px] text-brand-textMuted">
                    Usable for inference: <span className="text-brand-textMain">{fmtGB(systemInfo.vramBudgetGB)} GB</span>
                    {systemInfo.isUnifiedMemory ? ' (unified)' : ' (largest GPU)'}
                  </div>
                </div>
              )}
            </div>
            <div className="sm:col-span-2">
              <div className="ui-label mb-1.5 flex items-center gap-1.5">
                <HardDrive size={12} /> Storage
              </div>
              <div className="flex flex-col gap-1.5">
                {systemInfo.storage.map((s, i) => (
                  <div key={i} className="flex items-center justify-between gap-2 text-xs">
                    <span className="text-brand-textMain">
                      {s.mount} {s.type !== 'unknown' && <span className="text-brand-textMuted">· {s.type}</span>}
                    </span>
                    <span className="text-brand-textMuted">{fmtGB(s.freeGB)} GB free / {fmtGB(s.sizeGB)} GB</span>
                  </div>
                ))}
              </div>
            </div>
            <Stat
              icon={<MonitorSmartphone size={14} />}
              label="NPU / TPU"
              value={systemInfo.npuTpu.detected ? systemInfo.npuTpu.label : 'Not detected'}
              sub={systemInfo.npuTpu.detected ? 'informational' : 'CPU/GPU used for inference'}
            />
          </div>
        )}
      </div>

      {/* ── Ollama status ───────────────────────────────────────────────── */}
      <div
        className={`ui-card mb-6 flex items-center gap-3 p-4 ${
          ollamaReachable ? 'border-[var(--brand-accent-border)]' : ''
        }`}
      >
        {ollamaReachable === null ? (
          <span className="text-sm text-brand-textMuted">Checking Ollama…</span>
        ) : ollamaReachable ? (
          <>
            <CircleCheck size={18} className="text-[color:var(--neon-constructive)]" />
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold text-brand-textMain">Ollama is running</div>
              <div className="text-xs text-brand-textMuted">
                {installed.length} model{installed.length !== 1 ? 's' : ''} installed locally
              </div>
            </div>
          </>
        ) : (
          <>
            <CircleAlert size={18} className="text-[color:var(--neon-attention)]" />
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold text-brand-textMain">Ollama not detected</div>
              <div className="text-xs text-brand-textMuted">
                Install Ollama to run models locally.{' '}
                <a
                  href="https://ollama.com/download"
                  target="_blank"
                  rel="noreferrer"
                  className="underline hover:text-brand-textMain"
                >
                  Download Ollama
                </a>
              </div>
            </div>
          </>
        )}
      </div>

      {/* ── Recommendation summary + controls ──────────────────────────── */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2 text-[11px]">
          <span className="ui-badge bg-[color:var(--neon-constructive)]/15 text-[color:var(--neon-constructive)]">
            {bestCount} best
          </span>
          <span className="ui-badge bg-brand-popover text-brand-textMuted">{runnableCount} runnable</span>
          <span className="ui-badge bg-[color:var(--neon-attention)]/15 text-[color:var(--neon-attention)]">
            {tooLargeCount} too large
          </span>
        </div>
        <div className="ui-input flex items-center gap-2 border-transparent bg-brand-card">
          <Search size={14} className="flex-shrink-0 text-brand-textMuted" />
          <input
            type="text"
            placeholder="Search models"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full border-none bg-transparent text-sm text-brand-textMain outline-none placeholder:text-brand-textMuted/50"
          />
          <button
            onClick={() => setRunnableOnly((v) => !v)}
            className={`ui-chip transition-colors ${
              runnableOnly
                ? 'bg-[color:var(--neon-constructive)]/15 text-[color:var(--neon-constructive)]'
                : 'bg-brand-popover text-brand-textMuted hover:text-brand-textMain'
            }`}
            title="Show only models that fit your hardware"
          >
            Runnable only
          </button>
        </div>
      </div>

      {/* ── Model list ──────────────────────────────────────────────────── */}
      {catalogLoading ? (
        <div className="flex flex-col gap-2">
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="ui-card h-16 animate-pulse bg-brand-hover/40" />
          ))}
          {catalogProgress.total > 0 && (
            <div className="text-center text-[11px] text-brand-textMuted">
              Scanning ollama.com… {catalogProgress.done}/{catalogProgress.total} models
            </div>
          )}
        </div>
      ) : filtered.length === 0 ? (
        <div className="ui-card px-6 py-10 text-center text-sm text-brand-textMuted">
          {catalogFailed
            ? 'Couldn’t load the model list from ollama.com. Check your connection and press Refresh.'
            : 'No models match your search.'}
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {filtered.map(({ model, fit, reason, needGB, storageWarning }) => {
            const isInstalled = installedSet.has(model.name);
            const isExpanded = expanded.has(model.name);
            const prog = pulling[model.name];
            const isWorking = working.has(model.name);
            const badge = FIT_BADGE[fit];
            return (
              <div key={model.name} className="ui-card overflow-hidden">
                <div className="flex items-center gap-3 p-3.5">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-semibold text-brand-textMain">{model.family}</span>
                      <span className="ui-chip bg-brand-popover text-brand-textMuted">{model.params}</span>
                      <span className={`ui-badge ${badge.cls}`}>{badge.label}</span>
                      {isInstalled && (
                        <span className="ui-badge constructive">
                          <Check size={10} /> Installed
                        </span>
                      )}
                      {storageWarning && (
                        <span className="ui-badge" title="May not fit on your largest free disk">
                          <AlertTriangle size={10} /> Low disk
                        </span>
                      )}
                    </div>
                    <div className="mt-0.5 text-[11px] text-brand-textMuted">{reason}</div>
                  </div>
                  <div className="flex flex-shrink-0 items-center gap-2">
                    {isInstalled ? (
                      <button
                        onClick={() => handleDelete(model.name)}
                        disabled={isWorking}
                        className="ui-btn-ghost text-[color:var(--neon-destructive)] hover:bg-[color:var(--neon-destructive)]/10"
                        title="Delete from this machine"
                      >
                        <Trash2 size={14} /> Delete
                      </button>
                    ) : (
                      <button
                        onClick={() => handlePull(model)}
                        disabled={isWorking || !ollamaReachable || fit === 'too-large'}
                        className="ui-btn-primary disabled:opacity-40"
                        title={
                          fit === 'too-large'
                            ? 'This model likely will not fit your hardware'
                            : ollamaReachable
                            ? `Download ${model.name}`
                            : 'Start Ollama to download'
                        }
                      >
                        {prog ? <RefreshCw size={14} className="animate-spin" /> : <Download size={14} />}
                        {prog ? `${prog.percent >= 0 ? prog.percent : '…'}%` : 'Download'}
                      </button>
                    )}
                    <button
                      onClick={() => toggleExpand(model.name)}
                      className="ui-btn"
                      aria-expanded={isExpanded}
                      title="Details"
                    >
                      Details
                    </button>
                  </div>
                </div>

                {prog && prog.total > 0 && (
                  <div className="px-3.5 pb-3">
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-brand-hover">
                      <div
                        className="h-full rounded-full bg-[var(--brand-accent)] transition-all"
                        style={{ width: `${prog.percent}%` }}
                      />
                    </div>
                    <div className="mt-1 text-[10px] text-brand-textMuted">
                      {fmtBytes(prog.completed)} / {fmtBytes(prog.total)} — {prog.status}
                    </div>
                  </div>
                )}

                {isExpanded && (
                  <div className="border-t border-brand-border bg-brand-bg/40 px-4 py-4">
                    <p className="mb-3 text-xs leading-relaxed text-brand-textMuted">{model.description}</p>
                    <div className="flex flex-wrap gap-5">
                      <Detail label="Parameters" value={model.params} />
                      <Detail label="Download size" value={`~${fmtGB(model.diskGB)} GB`} />
                      <Detail
                        label="Context window"
                        value={model.contextK > 0 ? formatContextPretty(model.contextK) : 'N/A (embedding)'}
                      />
                      <Detail label="Needs (~RAM/VRAM)" value={`~${needGB} GB`} />
                      <div>
                        <div className="ui-label mb-1.5">Input</div>
                        <div className="flex flex-wrap gap-1.5">
                          {model.inputModalities.map((m) => (
                            <ModalityChip key={m} type={m} />
                          ))}
                        </div>
                      </div>
                      <div>
                        <div className="ui-label mb-1.5">Output</div>
                        <div className="flex flex-wrap gap-1.5">
                          {model.outputModalities.map((m) => (
                            <ModalityChip key={m} type={m} />
                          ))}
                        </div>
                      </div>
                      {model.tags.length > 0 && (
                        <div>
                          <div className="ui-label mb-1.5">Tags</div>
                          <div className="flex flex-wrap gap-1.5">
                            {model.tags.map((t) => (
                              <span key={t} className="ui-chip bg-brand-popover text-brand-textMuted">
                                {t}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                    <div className="mt-3 text-[11px] text-brand-textMuted">
                      Ollama tag: <code className="rounded bg-brand-bg px-1">{model.name}</code>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <p className="mt-6 text-center text-[11px] text-brand-textMuted">
        Models are downloaded and run by Ollama on your machine. Installed models are added to the
        “Ollama” provider and the Models list automatically.
      </p>
    </div>
  );
};

const formatContextPretty = (tokens: number): string => {
  if (tokens >= 1_000_000) return `${Math.round(tokens / 1_000_000)}M`;
  if (tokens >= 1_000) return `${Math.round(tokens / 1_000)}k`;
  return String(tokens);
};

const Detail: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div>
    <div className="ui-label mb-1.5">{label}</div>
    <span className="text-sm font-medium text-brand-textMain">{value}</span>
  </div>
);

const Stat: React.FC<{ icon: React.ReactNode; label: string; value: string; sub?: string }> = ({
  icon,
  label,
  value,
  sub
}) => (
  <div>
    <div className="ui-label mb-1.5 flex items-center gap-1.5">
      {icon} {label}
    </div>
    <div className="text-sm font-medium text-brand-textMain">{value}</div>
    {sub && <div className="mt-0.5 text-[11px] text-brand-textMuted">{sub}</div>}
  </div>
);

export default LocalModelSettings;
