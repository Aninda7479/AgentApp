import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { getIpc } from '../../lib/ipc';
import {
  Cpu,
  HardDrive,
  Download,
  Trash2,
  RefreshCw,
  Search,
  Check,
  MemoryStick,
  MonitorSmartphone,
  CircleAlert,
  Play,
  Settings2,
  Copy,
  Sparkles,
  X,
  ChevronDown,
  ChevronUp,
  Zap,
  CheckCheck,
  Terminal,
  Layers,
  Activity,
  Sliders,
  ArrowUpDown,
  Eye,
  Brain,
  Wrench,
  Code
} from 'lucide-react';
import { ProviderConnection, ModelConfig } from './types';
import { SystemInfo, normalizeSystemInfo } from '../../logic/systemInfo';
import {
  rankModels,
  fetchLiveCatalog,
  parseParamBillions,
  RankedModel,
  OllamaCatalogModel
} from '../../logic/ollama-catalog';
import {
  checkOllamaStatus,
  startOllamaService,
  loadOllamaSettings,
  saveOllamaSettings,
  listInstalled,
  listRunningModels,
  showModel,
  pullModel,
  deleteModel,
  InstalledModel,
  RunningModelInfo,
  PullProgress,
  OllamaStatusResult,
  OllamaSettingsConfig,
  DEFAULT_OLLAMA_SETTINGS,
  DEFAULT_OLLAMA_URL
} from '../../logic/ollama-manager';
import { SettingsLoadingProgressBar } from '../../components/SettingsLoadingProgressBar';

/** Props for the Local Model (Ollama) settings panel. */
interface LocalModelSettingsProps {
  connectedProviders: ProviderConnection[];
  modelsCatalog: ModelConfig[];
  onConnectProvider: (provider: ProviderConnection, models: ModelConfig[]) => void;
  enrichModel: (raw: any, providerId: string) => ModelConfig;
  onToast?: (message: string) => void;
}

const fmtGB = (n: number): string => (n >= 10 ? Math.round(n).toString() : (Math.round(n * 10) / 10).toString());
export const fmtSizeGB = (n: number): string => {
  if (!n || n <= 0) return '0 GB';
  if (n >= 1000) return `${(n / 1024).toFixed(1)} TB`;
  if (n >= 10) return `${Math.round(n)} GB`;
  if (n < 0.5) return `${Math.round(n * 1024)} MB`;
  return `${Math.round(n * 10) / 10} GB`;
};
const fmtBytes = (bytes: number): string => {
  if (!bytes || bytes <= 0) return '0 B';
  if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(1)} GB`;
  if (bytes >= 1e6) return `${(bytes / 1e6).toFixed(0)} MB`;
  return `${bytes} B`;
};

const CONTEXT_OPTIONS = [
  { label: '2k (Fast / Low Memory)', value: '2k' },
  { label: '4k (Standard)', value: '4k' },
  { label: '8k (Balanced)', value: '8k' },
  { label: '16k (Extended)', value: '16k' },
  { label: '32k (Deep Context)', value: '32k' },
  { label: '64k (Large Codebase)', value: '64k' },
  { label: '128k (Max Context)', value: '128k' }
];

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
  const [ollamaStatus, setOllamaStatus] = useState<OllamaStatusResult>({
    installed: false,
    running: false,
    baseUrl: DEFAULT_OLLAMA_URL
  });
  const [statusLoading, setStatusLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const [installed, setInstalled] = useState<InstalledModel[]>([]);
  const [runningModels, setRunningModels] = useState<RunningModelInfo[]>([]);
  const [ollamaSettings, setOllamaSettings] = useState<OllamaSettingsConfig>(DEFAULT_OLLAMA_SETTINGS);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const [catalog, setCatalog] = useState<OllamaCatalogModel[]>([]);
  const [ranked, setRanked] = useState<RankedModel[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [storeOpen, setStoreOpen] = useState(false);
  const [storeSearch, setStoreSearch] = useState('');
  const [storeTagFilter, setStoreTagFilter] = useState<string>('all');
  const [storeRunnableOnly, setStoreRunnableOnly] = useState(false);
  const [storeSortBy, setStoreSortBy] = useState<'top-match' | 'params-desc' | 'params-asc' | 'download-asc' | 'memory-asc'>('top-match');

  const [searchInstalled, setSearchInstalled] = useState('');
  const [pulling, setPulling] = useState<Record<string, PullProgress>>({});
  const [working, setWorking] = useState<Set<string>>(new Set());
  const [startingService, setStartingService] = useState(false);
  const [deleteConfirmModal, setDeleteConfirmModal] = useState<string | null>(null);
  const [copiedCmd, setCopiedCmd] = useState<string | null>(null);

  // Detect OS for tailored installation guides
  const detectedOs = useMemo(() => {
    const raw = (systemInfo?.os_name || (typeof navigator !== 'undefined' ? navigator.userAgent : '')).toLowerCase();
    if (raw.includes('mac') || raw.includes('darwin')) return 'macos';
    if (raw.includes('win')) return 'windows';
    return 'linux';
  }, [systemInfo?.os_name]);

  const [activeOsTab, setActiveOsTab] = useState<'windows' | 'macos' | 'linux'>('windows');

  useEffect(() => {
    setActiveOsTab(detectedOs);
  }, [detectedOs]);

  const loadSystemInfo = useCallback(async () => {
    setSystemLoading(true);
    try {
      const ipc = getIpc();
      const info = await ipc?.invoke('system-info');
      setSystemInfo(normalizeSystemInfo(info));
    } catch {
      setSystemInfo(normalizeSystemInfo(null));
    } finally {
      setSystemLoading(false);
    }
  }, []);

  const loadSettingsData = useCallback(async () => {
    try {
      const cfg = await loadOllamaSettings();
      setOllamaSettings(cfg);
    } catch {}
  }, []);

  const onConnectProviderRef = useRef(onConnectProvider);
  onConnectProviderRef.current = onConnectProvider;

  const enrichModelRef = useRef(enrichModel);
  enrichModelRef.current = enrichModel;

  const lastSyncedSignatureRef = useRef<string>('');

  const syncToSuperAgent = useCallback(
    async (list: InstalledModel[], settingsCfg: OllamaSettingsConfig) => {
      try {
        const sig = `${settingsCfg.baseUrl}:${list.map((m) => `${m.name}:${m.contextLimit}:${m.temperature}`).join(',')}`;
        if (sig === lastSyncedSignatureRef.current) {
          return;
        }
        lastSyncedSignatureRef.current = sig;

        const enriched: ModelConfig[] = [];
        for (const m of list) {
          let showCtx: string | undefined;
          let inputMod: string[] | undefined;
          let outputMod: string[] | undefined;
          try {
            const info = await showModel(m.name, settingsCfg.baseUrl);
            showCtx = info.contextLimit;
            inputMod = info.inputModalities;
            outputMod = info.outputModalities;
          } catch {}

          const customCtx = settingsCfg.modelContextOverrides?.[m.name] || showCtx || settingsCfg.defaultContextLimit;
          const desc = [
            m.parameterSize ? `${m.parameterSize}` : '',
            m.quantLevel ? `quant ${m.quantLevel}` : '',
            customCtx ? `ctx ${customCtx}` : ''
          ]
            .filter(Boolean)
            .join(' · ');

          const raw = {
            id: m.name,
            name: m.name,
            contextLimit: customCtx,
            outputLimit: undefined as string | undefined,
            description: desc || undefined,
            free: true,
            inputModalities: inputMod,
            outputModalities: outputMod
          };
          enriched.push(enrichModelRef.current(raw, 'ollama'));
        }
        onConnectProviderRef.current(
          {
            id: 'ollama',
            name: 'Ollama',
            type: 'custom',
            apiKey: '',
            baseUrl: settingsCfg.baseUrl || DEFAULT_OLLAMA_URL
          },
          enriched
        );
      } catch (err: any) {
        console.error('[local-model] sync failed:', err);
      }
    },
    []
  );

  const checkStatusAndModels = useCallback(async () => {
    setStatusLoading(true);
    try {
      const status = await checkOllamaStatus(ollamaSettings.baseUrl);
      setOllamaStatus(status);

      // Always list installed models (works via daemon or native disk scan when offline)
      const list = await listInstalled(status.baseUrl);
      let running: RunningModelInfo[] = [];
      if (status.running) {
        running = await listRunningModels(status.baseUrl);
      }

      const runningSet = new Map(running.map((r) => [r.name, r]));
      const combined = list.map((m) => {
        const run = runningSet.get(m.name) || runningSet.get(m.name + ':latest');
        return {
          ...m,
          isRunning: Boolean(run),
          vramBytes: run?.sizeVram,
          contextLimit: ollamaSettings.modelContextOverrides?.[m.name] || ollamaSettings.defaultContextLimit,
          temperature: ollamaSettings.modelTemperatureOverrides?.[m.name] ?? ollamaSettings.defaultTemperature
        };
      });

      setInstalled(combined);
      setRunningModels(running);
      if (combined.length > 0) {
        await syncToSuperAgent(combined, ollamaSettings);
      }
    } catch {
      // Keep existing list on transient errors
    } finally {
      setStatusLoading(false);
    }
  }, [ollamaSettings.baseUrl, ollamaSettings.defaultContextLimit, ollamaSettings.defaultTemperature, ollamaSettings.modelContextOverrides, ollamaSettings.modelTemperatureOverrides, syncToSuperAgent]);

  const loadCatalogData = useCallback(async () => {
    setCatalogLoading(true);
    try {
      const cat = await fetchLiveCatalog();
      setCatalog(cat);
      setRanked(rankModels(cat, systemInfo));
    } catch {
      setRanked([]);
    } finally {
      setCatalogLoading(false);
    }
  }, [systemInfo]);

  useEffect(() => {
    loadSystemInfo();
    loadSettingsData();
  }, [loadSystemInfo, loadSettingsData]);

  useEffect(() => {
    checkStatusAndModels();
  }, [checkStatusAndModels]);

  useEffect(() => {
    if (catalog.length > 0) {
      setRanked(rankModels(catalog, systemInfo));
    }
  }, [catalog, systemInfo]);

  const refreshAll = async () => {
    setIsRefreshing(true);
    try {
      await Promise.all([
        loadSystemInfo(),
        loadSettingsData(),
        checkStatusAndModels(),
        catalog.length > 0 ? loadCatalogData() : Promise.resolve()
      ]);
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleStartOllama = async () => {
    setStartingService(true);
    try {
      const res = await startOllamaService();
      if (res.running) {
        notify('Ollama service started successfully.');
        await checkStatusAndModels();
      } else {
        notify(`Failed to start Ollama: ${res.error || 'Check if Ollama is running in your terminal.'}`);
      }
    } catch (err: any) {
      notify(`Could not start Ollama: ${err.message || err}`);
    } finally {
      setStartingService(false);
    }
  };

  const handlePull = async (model: OllamaCatalogModel) => {
    setWorking((w) => new Set(w).add(model.name));
    setPulling((p) => ({ ...p, [model.name]: { status: 'starting', completed: 0, total: 0, percent: 0 } }));
    try {
      await pullModel(model.name, (prog) => {
        setPulling((p) => ({ ...p, [model.name]: prog }));
      }, ollamaStatus.baseUrl);
      notify(`Successfully downloaded ${model.name}`);
      await checkStatusAndModels();
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
      await deleteModel(name, ollamaStatus.baseUrl);
      notify(`Deleted model ${name}`);
      setDeleteConfirmModal(null);
      await checkStatusAndModels();
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

  const handleModelContextChange = async (modelName: string, ctx: string) => {
    const updated: OllamaSettingsConfig = {
      ...ollamaSettings,
      modelContextOverrides: {
        ...(ollamaSettings.modelContextOverrides || {}),
        [modelName]: ctx
      }
    };
    setOllamaSettings(updated);
    await saveOllamaSettings(updated);
    notify(`Updated context limit for ${modelName} to ${ctx}`);
    await syncToSuperAgent(installed, updated);
  };

  const handleModelTempChange = async (modelName: string, temp: number) => {
    const updated: OllamaSettingsConfig = {
      ...ollamaSettings,
      modelTemperatureOverrides: {
        ...(ollamaSettings.modelTemperatureOverrides || {}),
        [modelName]: temp
      }
    };
    setOllamaSettings(updated);
    await saveOllamaSettings(updated);
  };

  const handleSaveGlobalSettings = async (patch: Partial<OllamaSettingsConfig>) => {
    const updated = { ...ollamaSettings, ...patch };
    setOllamaSettings(updated);
    await saveOllamaSettings(updated);
    notify('Ollama engine settings saved.');
    await checkStatusAndModels();
  };

  const copyToClipboard = (text: string, label: string) => {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(text);
      setCopiedCmd(label);
      notify(`Copied ${label} to clipboard`);
      setTimeout(() => setCopiedCmd(null), 2000);
    }
  };

  const installedSet = new Set(installed.map((m) => m.name));

  const filteredInstalled = installed.filter((m) => {
    if (!searchInstalled) return true;
    const q = searchInstalled.toLowerCase();
    return m.name.toLowerCase().includes(q) || (m.family && m.family.toLowerCase().includes(q));
  });

  const filteredStore = useMemo(() => {
    const list = ranked.filter((r) => {
      if (storeRunnableOnly && r.fit === 'too-large') return false;
      if (storeTagFilter !== 'all') {
        if (storeTagFilter === 'thinking') {
          if (!r.model.tags.includes('thinking') && !r.model.tags.includes('reasoning')) return false;
        } else if (!r.model.tags.includes(storeTagFilter as any)) {
          return false;
        }
      }
      if (storeSearch) {
        const q = storeSearch.toLowerCase();
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

    if (storeSortBy === 'top-match') {
      return list; // Preserves enhanced top match & hardware-efficiency ranking
    }

    const copy = [...list];
    if (storeSortBy === 'params-desc') {
      copy.sort((a, b) => parseParamBillions(b.model.params) - parseParamBillions(a.model.params));
    } else if (storeSortBy === 'params-asc') {
      copy.sort((a, b) => parseParamBillions(a.model.params) - parseParamBillions(b.model.params));
    } else if (storeSortBy === 'download-asc') {
      copy.sort((a, b) => a.model.diskGB - b.model.diskGB);
    } else if (storeSortBy === 'memory-asc') {
      copy.sort((a, b) => a.needGB - b.needGB);
    }
    return copy;
  }, [ranked, storeRunnableOnly, storeTagFilter, storeSearch, storeSortBy]);

  const isLoading = systemLoading || statusLoading || isRefreshing;

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6">
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-outfit text-2xl font-semibold tracking-tight text-brand-textMain sm:text-3xl flex items-center gap-2.5">
            <Cpu className="text-[var(--brand-accent)]" size={26} />
            Local AI Models (Ollama)
          </h1>
          <p className="mt-1 text-sm text-brand-textMuted sm:text-base">
            Execute state-of-the-art open-source LLMs 100% locally on your device with complete privacy.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              if (catalog.length === 0) loadCatalogData();
              setStoreOpen(true);
            }}
            disabled={isLoading}
            className="ui-btn-primary flex items-center gap-1.5 shadow-sm disabled:opacity-50"
          >
            <Sparkles size={15} />
            Explore & Download Models
          </button>
          <button
            onClick={refreshAll}
            disabled={isLoading}
            className="ui-btn flex items-center gap-1.5 disabled:opacity-50"
            title="Refresh hardware, status and models"
          >
            <RefreshCw size={14} className={isLoading ? 'animate-spin' : ''} />
            Refresh
          </button>
        </div>
      </div>

      {/* ── Main Content Area ───────────────────────────────────────────── */}
      {isLoading ? (
        <SettingsLoadingProgressBar
          title={isRefreshing ? 'Refreshing Local AI Models...' : 'Loading Local AI Models & Hardware Profile...'}
          description="Probing Ollama daemon, scanning installed model weights, GPU acceleration, and system memory limits..."
          isRefreshing={isRefreshing}
          iconType="text"
        />
      ) : (
        <>
          {/* ── Status Banner (Installation & Daemon Running State) ─────────── */}
      {!ollamaStatus.installed ? (
        <div className="ui-card p-6 border-l-4 border-l-[color:var(--neon-attention)] bg-brand-card/90">
          <div className="flex items-start gap-4">
            <CircleAlert size={24} className="text-[color:var(--neon-attention)] flex-shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <h2 className="text-base font-semibold text-brand-textMain">Ollama is not installed on this system</h2>
              <p className="mt-1 text-xs sm:text-sm text-brand-textMuted">
                Ollama runs LLMs locally on your GPU, Apple Silicon, or CPU. Install it once to unlock free local model execution.
              </p>

              {/* OS Tabs */}
              <div className="mt-4 border-b border-brand-border flex gap-4 text-xs font-medium">
                <button
                  onClick={() => setActiveOsTab('windows')}
                  className={`pb-2 transition-colors ${
                    activeOsTab === 'windows'
                      ? 'border-b-2 border-[var(--brand-accent)] text-brand-textMain font-semibold'
                      : 'text-brand-textMuted hover:text-brand-textMain'
                  }`}
                >
                  Windows (x64 / ARM)
                </button>
                <button
                  onClick={() => setActiveOsTab('macos')}
                  className={`pb-2 transition-colors ${
                    activeOsTab === 'macos'
                      ? 'border-b-2 border-[var(--brand-accent)] text-brand-textMain font-semibold'
                      : 'text-brand-textMuted hover:text-brand-textMain'
                  }`}
                >
                  macOS (Apple Silicon & Intel)
                </button>
                <button
                  onClick={() => setActiveOsTab('linux')}
                  className={`pb-2 transition-colors ${
                    activeOsTab === 'linux'
                      ? 'border-b-2 border-[var(--brand-accent)] text-brand-textMain font-semibold'
                      : 'text-brand-textMuted hover:text-brand-textMain'
                  }`}
                >
                  Linux
                </button>
              </div>

              <div className="mt-4">
                {activeOsTab === 'windows' && (
                  <div className="space-y-3 text-xs">
                    <div className="flex flex-wrap items-center gap-3">
                      <a
                        href="https://ollama.com/download/OllamaSetup.exe"
                        target="_blank"
                        rel="noreferrer"
                        className="ui-btn-primary flex items-center gap-1.5"
                      >
                        <Download size={14} /> Download Windows Installer (.exe)
                      </a>
                      <span className="text-brand-textMuted">or via Terminal:</span>
                    </div>
                    <div className="flex items-center justify-between rounded bg-brand-bg px-3 py-2 border border-brand-border font-mono text-[11px] text-brand-textMain">
                      <code>winget install Ollama.Ollama</code>
                      <button
                        onClick={() => copyToClipboard('winget install Ollama.Ollama', 'winget command')}
                        className="ui-btn-ghost p-1 text-brand-textMuted hover:text-brand-textMain"
                        title="Copy command"
                      >
                        {copiedCmd === 'winget command' ? <Check size={13} className="text-[color:var(--neon-constructive)]" /> : <Copy size={13} />}
                      </button>
                    </div>
                  </div>
                )}

                {activeOsTab === 'macos' && (
                  <div className="space-y-3 text-xs">
                    <div className="flex flex-wrap items-center gap-3">
                      <a
                        href="https://ollama.com/download/Ollama-darwin.zip"
                        target="_blank"
                        rel="noreferrer"
                        className="ui-btn-primary flex items-center gap-1.5"
                      >
                        <Download size={14} /> Download macOS App (.zip)
                      </a>
                      <span className="text-brand-textMuted">or via Homebrew:</span>
                    </div>
                    <div className="flex items-center justify-between rounded bg-brand-bg px-3 py-2 border border-brand-border font-mono text-[11px] text-brand-textMain">
                      <code>brew install ollama</code>
                      <button
                        onClick={() => copyToClipboard('brew install ollama', 'brew command')}
                        className="ui-btn-ghost p-1 text-brand-textMuted hover:text-brand-textMain"
                        title="Copy command"
                      >
                        {copiedCmd === 'brew command' ? <Check size={13} className="text-[color:var(--neon-constructive)]" /> : <Copy size={13} />}
                      </button>
                    </div>
                  </div>
                )}

                {activeOsTab === 'linux' && (
                  <div className="space-y-3 text-xs">
                    <div className="text-brand-textMuted">Run the official one-line install command:</div>
                    <div className="flex items-center justify-between rounded bg-brand-bg px-3 py-2 border border-brand-border font-mono text-[11px] text-brand-textMain">
                      <code>curl -fsSL https://ollama.com/install.sh | sh</code>
                      <button
                        onClick={() => copyToClipboard('curl -fsSL https://ollama.com/install.sh | sh', 'curl script')}
                        className="ui-btn-ghost p-1 text-brand-textMuted hover:text-brand-textMain"
                        title="Copy command"
                      >
                        {copiedCmd === 'curl script' ? <Check size={13} className="text-[color:var(--neon-constructive)]" /> : <Copy size={13} />}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      ) : !ollamaStatus.running ? (
        <div className="ui-card p-5 border-l-4 border-l-[color:var(--neon-attention)] bg-brand-card/90">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <CircleAlert size={22} className="text-[color:var(--neon-attention)]" />
              <div>
                <div className="text-sm font-semibold text-brand-textMain flex items-center gap-2">
                  Ollama is installed but the service is stopped
                  {ollamaStatus.version && <span className="ui-chip bg-brand-popover text-brand-textMuted">v{ollamaStatus.version}</span>}
                </div>
                <div className="text-xs text-brand-textMuted mt-0.5">
                  Start the Ollama daemon to download models, manage settings, and begin local inference.
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={handleStartOllama}
                disabled={startingService}
                className="ui-btn-primary flex items-center gap-1.5 shadow-sm"
              >
                {startingService ? <RefreshCw size={14} className="animate-spin" /> : <Play size={14} />}
                {startingService ? 'Starting Ollama…' : 'Start Ollama Service'}
              </button>
              <button
                onClick={() => copyToClipboard('ollama serve', 'ollama serve')}
                className="ui-btn flex items-center gap-1 text-xs"
                title="Copy terminal command"
              >
                <Terminal size={13} />
                <code>ollama serve</code>
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="ui-card p-4 flex flex-wrap items-center justify-between gap-3 border-[var(--brand-accent-border)] bg-brand-card/70">
          <div className="flex items-center gap-3">
            <div className="relative flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[color:var(--neon-constructive)] opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3 w-3 bg-[color:var(--neon-constructive)]"></span>
            </div>
            <div>
              <div className="text-sm font-semibold text-brand-textMain flex items-center gap-2">
                Ollama is Running
                {ollamaStatus.version && <span className="ui-chip bg-brand-popover text-brand-textMuted">v{ollamaStatus.version}</span>}
                <span className="ui-badge bg-[color:var(--neon-constructive)]/15 text-[color:var(--neon-constructive)]">Online</span>
              </div>
              <div className="text-xs text-brand-textMuted mt-0.5">
                Host: <code className="text-brand-textMain">{ollamaStatus.baseUrl}</code> · {installed.length} model{installed.length !== 1 ? 's' : ''} installed
                {runningModels.length > 0 && ` · ${runningModels.length} active in memory`}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setSettingsOpen((v) => !v)}
              className="ui-btn flex items-center gap-1.5 text-xs"
            >
              <Settings2 size={14} />
              Ollama Engine Settings
              {settingsOpen ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
            </button>
          </div>
        </div>
      )}

      {/* ── System Hardware & Adaptive Resource Summary ─────────────────── */}
      <div className="ui-card p-5">
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Activity size={16} className="text-[var(--brand-accent)]" />
            <span className="ui-label font-semibold text-brand-textMain">Hardware & Inference Budget</span>
          </div>
          {systemInfo?.isUnifiedMemory && (
            <span className="ui-badge bg-[color:var(--neon-constructive)]/15 text-[color:var(--neon-constructive)] font-medium">
              Unified Memory (Apple Silicon)
            </span>
          )}
        </div>

        {systemLoading || !systemInfo ? (
          <div className="flex flex-col gap-2" aria-busy="true">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-4 w-full max-w-md animate-pulse rounded bg-brand-hover" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              icon={<Cpu size={15} />}
              label="CPU"
              value={systemInfo.cpuBrand || 'System CPU'}
              sub={`${systemInfo.cpuCores || 4} cores · ${systemInfo.cpuSpeedGHz || 2.4} GHz · ${systemInfo.arch || 'x64'}`}
            />
            <StatCard
              icon={<MemoryStick size={15} />}
              label="RAM Capacity"
              value={`${fmtGB(systemInfo.ramGB || 16)} GB Total`}
              sub={`${fmtGB(systemInfo.ramFreeGB || 8)} GB Available / Free`}
              highlight={systemInfo.ramFreeGB < 4 ? 'text-[color:var(--neon-attention)]' : undefined}
            />
            <StatCard
              icon={<Zap size={15} />}
              label={systemInfo.isUnifiedMemory ? 'Unified GPU Budget' : 'GPU / VRAM'}
              value={
                systemInfo.isUnifiedMemory
                  ? `${fmtGB(systemInfo.vramBudgetGB)} GB Usable`
                  : systemInfo.gpus.length > 0
                  ? `${systemInfo.gpus[0].model}`
                  : 'CPU-only inference'
              }
              sub={
                systemInfo.isUnifiedMemory
                  ? 'Shared high-bandwidth RAM'
                  : systemInfo.gpus.length > 0
                  ? `${fmtGB(systemInfo.vramBudgetGB)} GB Dedicated VRAM`
                  : 'Offloads to system RAM'
              }
            />
            <StatCard
              icon={<HardDrive size={15} />}
              label="Storage"
              value={
                systemInfo.storage.length > 0
                  ? `${fmtGB(systemInfo.storage[0].freeGB)} GB Free`
                  : 'Available'
              }
              sub={
                systemInfo.storage.length > 0
                  ? `${systemInfo.storage[0].mount} (${fmtGB(systemInfo.storage[0].sizeGB)} GB total)`
                  : 'System Disk'
              }
            />
          </div>
        )}

        {systemInfo?.npuTpu?.detected && (
          <div className="mt-3.5 flex items-center gap-2 rounded bg-brand-bg/60 px-3 py-1.5 border border-brand-border text-xs text-brand-textMuted">
            <MonitorSmartphone size={14} className="text-[var(--brand-accent)]" />
            <span>AI Accelerator Detected: <strong className="text-brand-textMain">{systemInfo.npuTpu.label}</strong></span>
          </div>
        )}
      </div>

      {/* ── Collapsible Ollama Engine Settings ───────────────────────────── */}
      {settingsOpen && (
        <div className="ui-card p-5 border-[var(--brand-accent-border)] bg-brand-card space-y-4">
          <div className="flex items-center justify-between border-b border-brand-border pb-3">
            <div className="flex items-center gap-2">
              <Sliders size={16} className="text-[var(--brand-accent)]" />
              <h2 className="text-sm font-semibold text-brand-textMain">Ollama Engine Parameters</h2>
            </div>
            <button
              onClick={() => setSettingsOpen(false)}
              className="ui-btn-ghost p-1 text-brand-textMuted hover:text-brand-textMain"
            >
              <X size={15} />
            </button>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="ui-label mb-1">Host / Server URL</label>
              <input
                type="text"
                value={ollamaSettings.baseUrl}
                onChange={(e) => setOllamaSettings((s) => ({ ...s, baseUrl: e.target.value }))}
                placeholder="http://localhost:11434"
                className="ui-input w-full"
              />
              <span className="text-[11px] text-brand-textMuted mt-1 block">
                Standard local endpoint is <code>http://localhost:11434</code>
              </span>
            </div>

            <div>
              <label className="ui-label mb-1">Default Context Limit (num_ctx)</label>
              <select
                value={ollamaSettings.defaultContextLimit}
                onChange={(e) => handleSaveGlobalSettings({ defaultContextLimit: e.target.value })}
                className="ui-select w-full"
              >
                {CONTEXT_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
              <span className="text-[11px] text-brand-textMuted mt-1 block">
                Higher context requires more RAM/VRAM during long agent discussions.
              </span>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="ui-label">Default Temperature</label>
                <span className="text-xs font-mono font-medium text-brand-textMain">
                  {ollamaSettings.defaultTemperature.toFixed(2)}
                </span>
              </div>
              <input
                type="range"
                min="0.0"
                max="1.0"
                step="0.05"
                value={ollamaSettings.defaultTemperature}
                onChange={(e) => handleSaveGlobalSettings({ defaultTemperature: parseFloat(e.target.value) })}
                className="w-full cursor-pointer accent-[var(--brand-accent)]"
              />
              <div className="flex justify-between text-[10px] text-brand-textMuted mt-0.5">
                <span>0.0 (Precise/Code)</span>
                <span>0.7 (Balanced)</span>
                <span>1.0 (Creative)</span>
              </div>
            </div>

            <div>
              <label className="ui-label mb-1">Keep-Alive Duration in Memory</label>
              <select
                value={ollamaSettings.keepAlive}
                onChange={(e) => handleSaveGlobalSettings({ keepAlive: e.target.value })}
                className="ui-select w-full"
              >
                <option value="5m">5 Minutes (Standard)</option>
                <option value="15m">15 Minutes</option>
                <option value="30m">30 Minutes</option>
                <option value="1h">1 Hour</option>
                <option value="-1">Infinite (Keep always loaded in VRAM)</option>
                <option value="0">0 (Unload immediately after response)</option>
              </select>
              <span className="text-[11px] text-brand-textMuted mt-1 block">
                Controls how long models stay cached in VRAM after each message.
              </span>
            </div>
          </div>
        </div>
      )}

      {/* ── Installed Models Section (Main Ollama Controller) ───────────── */}
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Layers size={17} className="text-[var(--brand-accent)]" />
            <h2 className="text-lg font-semibold text-brand-textMain">
              Installed Models ({installed.length})
            </h2>
          </div>
          <div className="flex items-center gap-2">
            <div className="ui-input flex items-center gap-2 border-transparent bg-brand-card px-2.5 py-1">
              <Search size={13} className="text-brand-textMuted" />
              <input
                type="text"
                placeholder="Search installed…"
                value={searchInstalled}
                onChange={(e) => setSearchInstalled(e.target.value)}
                className="w-36 sm:w-48 border-none bg-transparent text-xs text-brand-textMain outline-none placeholder:text-brand-textMuted/50"
              />
              {searchInstalled && (
                <button onClick={() => setSearchInstalled('')} className="text-brand-textMuted hover:text-brand-textMain">
                  <X size={12} />
                </button>
              )}
            </div>
          </div>
        </div>

        {installed.length === 0 ? (
          <div className="ui-card px-6 py-12 text-center border-dashed">
            <Cpu size={32} className="mx-auto text-brand-textMuted/60 mb-3" />
            <h3 className="text-sm font-semibold text-brand-textMain">No local models installed yet</h3>
            <p className="mt-1 text-xs text-brand-textMuted max-w-sm mx-auto">
              Download models from the Ollama library to start running local AI inference on your hardware.
            </p>
            <div className="mt-5 flex justify-center gap-3">
              <button
                onClick={() => {
                  if (catalog.length === 0) loadCatalogData();
                  setStoreOpen(true);
                }}
                disabled={!ollamaStatus.running}
                className="ui-btn-primary flex items-center gap-1.5"
              >
                <Download size={14} /> Explore Available Models
              </button>
            </div>
          </div>
        ) : filteredInstalled.length === 0 ? (
          <div className="ui-card p-6 text-center text-sm text-brand-textMuted">
            No installed models match "{searchInstalled}".
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3">
            {filteredInstalled.map((model) => {
              const isWorking = working.has(model.name);
              const isPulling = pulling[model.name];

              return (
                <div
                  key={model.name}
                  className={`ui-card overflow-hidden transition-all ${
                    model.isRunning ? 'border-[var(--brand-accent-border)] shadow-sm' : ''
                  }`}
                >
                  <div className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="min-w-0 flex-1 space-y-1.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold text-sm text-brand-textMain">{model.name}</span>
                        {model.parameterSize && (
                          <span className="ui-chip bg-brand-popover text-brand-textMuted font-medium">
                            {model.parameterSize}
                          </span>
                        )}
                        {model.quantLevel && (
                          <span className="ui-chip bg-brand-popover text-brand-textMuted text-[10px]">
                            {model.quantLevel}
                          </span>
                        )}
                        {model.isRunning && (
                          <span className="ui-badge bg-[color:var(--neon-constructive)]/15 text-[color:var(--neon-constructive)] flex items-center gap-1">
                            <Zap size={10} /> Active in VRAM ({fmtBytes(model.vramBytes || 0)})
                          </span>
                        )}
                        <span className="ui-badge muted text-[11px]">{fmtBytes(model.sizeBytes)}</span>
                      </div>

                      {/* Context Limit & Temperature Controls */}
                      <div className="flex flex-wrap items-center gap-4 text-xs pt-1">
                        <div className="flex items-center gap-1.5">
                          <span className="text-brand-textMuted">Context:</span>
                          <select
                            value={model.contextLimit || ollamaSettings.defaultContextLimit}
                            onChange={(e) => handleModelContextChange(model.name, e.target.value)}
                            className="ui-select text-xs py-0.5 px-2 h-7"
                          >
                            {CONTEXT_OPTIONS.map((opt) => (
                              <option key={opt.value} value={opt.value}>
                                {opt.label}
                              </option>
                            ))}
                          </select>
                        </div>

                        <div className="flex items-center gap-2">
                          <span className="text-brand-textMuted">Temp:</span>
                          <input
                            type="range"
                            min="0.0"
                            max="1.0"
                            step="0.05"
                            value={model.temperature ?? ollamaSettings.defaultTemperature}
                            onChange={(e) => handleModelTempChange(model.name, parseFloat(e.target.value))}
                            className="w-20 cursor-pointer accent-[var(--brand-accent)] h-1"
                            title={`Temperature: ${(model.temperature ?? ollamaSettings.defaultTemperature).toFixed(2)}`}
                          />
                          <span className="font-mono text-[11px] text-brand-textMain">
                            {(model.temperature ?? ollamaSettings.defaultTemperature).toFixed(2)}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-2 flex-shrink-0 self-end sm:self-center">
                      <button
                        onClick={() => setDeleteConfirmModal(model.name)}
                        disabled={isWorking}
                        className="ui-btn-ghost text-[color:var(--neon-destructive)] hover:bg-[color:var(--neon-destructive)]/10 text-xs px-2.5 py-1.5 flex items-center gap-1"
                        title="Delete model from disk"
                      >
                        <Trash2 size={13} />
                        Delete
                      </button>
                    </div>
                  </div>

                  {isPulling && (
                    <div className="border-t border-brand-border bg-brand-bg/40 px-4 py-2.5">
                      <div className="h-1.5 w-full overflow-hidden rounded-full bg-brand-hover">
                        <div
                          className="h-full rounded-full bg-[var(--brand-accent)] transition-all"
                          style={{ width: `${isPulling.percent >= 0 ? isPulling.percent : 100}%` }}
                        />
                      </div>
                      <div className="mt-1 flex justify-between text-[11px] text-brand-textMuted">
                        <span>{isPulling.status}</span>
                        <span>{isPulling.percent >= 0 ? `${isPulling.percent}%` : 'Updating…'}</span>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
      </>
      )}

      {/* ── Model Store Modal / Drawer (Popup to prevent page bloat) ───── */}
      {storeOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-150">
          <div className="ui-card flex flex-col h-full max-h-[85vh] w-full max-w-3xl overflow-hidden shadow-2xl border border-brand-border">
            {/* Store Header */}
            <div className="p-4 sm:p-5 border-b border-brand-border flex items-center justify-between gap-4">
              <div>
                <h3 className="text-lg font-semibold text-brand-textMain flex items-center gap-2">
                  <Sparkles size={18} className="text-[var(--brand-accent)]" />
                  Ollama Model Catalog
                </h3>
                <p className="text-xs text-brand-textMuted mt-0.5">
                  Browse and install models with hardware-adaptive sizing optimized for your device.
                </p>
              </div>
              <button
                onClick={() => setStoreOpen(false)}
                className="ui-btn-ghost p-1.5 text-brand-textMuted hover:text-brand-textMain rounded-lg"
              >
                <X size={18} />
              </button>
            </div>

            {/* Store Controls */}
            <div className="p-4 border-b border-brand-border bg-brand-card/50 flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap gap-1.5 text-xs">
                {[
                  { id: 'all', label: 'All' },
                  { id: 'tools', label: 'Tools', icon: Wrench },
                  { id: 'thinking', label: 'Thinking', icon: Brain },
                  { id: 'vision', label: 'Vision', icon: Eye },
                  { id: 'embedding', label: 'Embedding', icon: Layers },
                  { id: 'code', label: 'Code', icon: Code },
                  { id: 'chat', label: 'Chat', icon: Zap }
                ].map((tab) => {
                  const Icon = tab.icon;
                  return (
                    <button
                      key={tab.id}
                      onClick={() => setStoreTagFilter(tab.id)}
                      className={`ui-chip transition-colors flex items-center gap-1.5 ${
                        storeTagFilter === tab.id
                          ? 'bg-[var(--brand-accent)] text-white font-medium'
                          : 'bg-brand-popover text-brand-textMuted hover:text-brand-textMain'
                      }`}
                    >
                      {Icon && <Icon size={12} />}
                      {tab.label}
                    </button>
                  );
                })}
              </div>

              <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
                <div className="flex items-center gap-1.5 bg-brand-bg px-2.5 py-1 rounded-lg border border-brand-border text-xs">
                  <ArrowUpDown size={13} className="text-brand-textMuted flex-shrink-0" />
                  <select
                    value={storeSortBy}
                    onChange={(e) => setStoreSortBy(e.target.value as any)}
                    className="bg-transparent border-none text-xs text-brand-textMain outline-none cursor-pointer"
                  >
                    <option value="top-match">Top Match & Efficiency</option>
                    <option value="params-desc">Parameters (Largest First)</option>
                    <option value="params-asc">Parameters (Smallest First)</option>
                    <option value="download-asc">Download Size (Smallest First)</option>
                    <option value="memory-asc">Memory Needed (Lowest First)</option>
                  </select>
                </div>

                <div className="ui-input flex items-center gap-2 flex-1 sm:w-52 bg-brand-bg px-2.5 py-1">
                  <Search size={13} className="text-brand-textMuted flex-shrink-0" />
                  <input
                    type="text"
                    placeholder="Search catalog…"
                    value={storeSearch}
                    onChange={(e) => setStoreSearch(e.target.value)}
                    className="w-full border-none bg-transparent text-xs text-brand-textMain outline-none placeholder:text-brand-textMuted/50"
                  />
                  {storeSearch && (
                    <button onClick={() => setStoreSearch('')} className="text-brand-textMuted hover:text-brand-textMain">
                      <X size={12} />
                    </button>
                  )}
                </div>
                <button
                  onClick={() => setStoreRunnableOnly((v) => !v)}
                  className={`ui-chip text-xs transition-colors whitespace-nowrap ${
                    storeRunnableOnly
                      ? 'bg-[color:var(--neon-constructive)]/15 text-[color:var(--neon-constructive)] font-semibold'
                      : 'bg-brand-popover text-brand-textMuted hover:text-brand-textMain'
                  }`}
                  title="Filter to models that fit your available RAM / GPU"
                >
                  Fits Hardware Only
                </button>
              </div>
            </div>

            {/* Store Model List */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {catalogLoading ? (
                <div className="py-12 text-center space-y-3">
                  <RefreshCw size={24} className="animate-spin mx-auto text-[var(--brand-accent)]" />
                  <div className="text-xs text-brand-textMuted">Loading Ollama catalog…</div>
                </div>
              ) : filteredStore.length === 0 ? (
                <div className="py-12 text-center text-xs text-brand-textMuted">
                  No models match your search criteria.
                </div>
              ) : (
                filteredStore.map(({ model, fit, reason, needGB, isHardwareRecommended }) => {
                  const isInstalled = installedSet.has(model.name);
                  const isPulling = pulling[model.name];
                  const isWorking = working.has(model.name);

                  return (
                    <div
                      key={model.name}
                      className={`ui-card overflow-hidden p-3.5 border transition-all ${
                        isHardwareRecommended
                          ? 'border-[var(--brand-accent-border)] bg-[var(--brand-accent)]/[0.02]'
                          : 'border-brand-border'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1 space-y-1.5">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-semibold text-sm text-brand-textMain">{model.family}</span>
                            <span className="ui-chip bg-brand-popover text-brand-textMuted">{model.params}</span>
                            
                            {/* Capability Tags: Tools, Thinking, Vision, Embedding */}
                            {model.tags.includes('tools') && (
                              <span className="ui-badge bg-amber-500/15 text-amber-400 border border-amber-500/25 flex items-center gap-1 text-[11px] font-medium">
                                <Wrench size={10} /> Tools
                              </span>
                            )}
                            {(model.tags.includes('thinking') || model.tags.includes('reasoning')) && (
                              <span className="ui-badge bg-emerald-500/15 text-emerald-400 border border-emerald-500/25 flex items-center gap-1 text-[11px] font-medium">
                                <Brain size={10} /> Thinking
                              </span>
                            )}
                            {model.tags.includes('vision') && (
                              <span className="ui-badge bg-cyan-500/15 text-cyan-400 border border-cyan-500/25 flex items-center gap-1 text-[11px] font-medium">
                                <Eye size={10} /> Vision
                              </span>
                            )}
                            {model.tags.includes('embedding') && (
                              <span className="ui-badge bg-purple-500/15 text-purple-400 border border-purple-500/25 flex items-center gap-1 text-[11px] font-medium">
                                <Layers size={10} /> Embedding
                              </span>
                            )}
                            {model.tags.includes('code') && (
                              <span className="ui-badge bg-blue-500/15 text-blue-400 border border-blue-500/25 flex items-center gap-1 text-[11px] font-medium">
                                <Code size={10} /> Code
                              </span>
                            )}

                            {isHardwareRecommended && (
                              <span className="ui-badge bg-[var(--brand-accent)]/15 text-[var(--brand-accent)] font-semibold flex items-center gap-1">
                                <Sparkles size={11} /> Top Match
                              </span>
                            )}
                            
                            {fit === 'best' && !isHardwareRecommended && (
                              <span className="ui-badge bg-[color:var(--neon-constructive)]/15 text-[color:var(--neon-constructive)] font-semibold flex items-center gap-1">
                                <Check size={11} /> Best Performance
                              </span>
                            )}
                            {fit === 'runnable' && (
                              <span className="ui-badge bg-[color:var(--neon-constructive)]/15 text-[color:var(--neon-constructive)] font-medium flex items-center gap-1">
                                <Zap size={11} /> Runnable
                              </span>
                            )}
                            {fit === 'quantized' && (
                              <>
                                <span className="ui-badge bg-amber-500/15 text-amber-400 border border-amber-500/30 font-medium flex items-center gap-1 text-[11px]">
                                  <Sliders size={11} /> Quantized Runnable
                                </span>
                                {(systemInfo?.vramBudgetGB ?? 0) > 0 && needGB > (systemInfo?.vramBudgetGB ?? 0) && (
                                  <span className="ui-badge bg-orange-500/15 text-orange-400 border border-orange-500/30 font-medium flex items-center gap-1 text-[11px]">
                                    <CircleAlert size={10} /> VRAM Overflow
                                  </span>
                                )}
                              </>
                            )}
                            {fit === 'too-large' && (
                              <span className="ui-badge bg-[color:var(--neon-attention)]/15 text-[color:var(--neon-attention)] border border-[color:var(--neon-attention)]/30 font-semibold flex items-center gap-1">
                                <CircleAlert size={11} /> Memory Overflow
                              </span>
                            )}

                            {isInstalled && (
                              <span className="ui-badge bg-[color:var(--neon-constructive)]/15 text-[color:var(--neon-constructive)] flex items-center gap-1">
                                <Check size={11} /> Installed
                              </span>
                            )}
                          </div>

                          <p className="text-xs text-brand-textMuted leading-relaxed line-clamp-2">
                            {model.description}
                          </p>

                          {/* Parameters vs Download Size vs Memory Needed Comparison Badges */}
                          <div className="flex flex-wrap items-center gap-2 pt-0.5">
                            <span className="ui-chip bg-brand-bg border border-brand-border/60 text-brand-textMain font-mono font-medium text-[11px] flex items-center gap-1">
                              ⚡ {model.params} Parameters
                            </span>
                            {model.isCloud ? (
                              <span className="ui-chip bg-blue-500/10 border border-blue-500/30 text-blue-400 font-mono text-[11px] flex items-center gap-1">
                                ☁️ Cloud Hosted
                              </span>
                            ) : (
                              <span className="ui-chip bg-brand-bg border border-brand-border/60 text-brand-textMuted font-mono text-[11px] flex items-center gap-1">
                                ⬇️ ~{fmtSizeGB(model.diskGB)} Download
                              </span>
                            )}
                            {model.isCloud ? (
                              <span className="ui-chip bg-blue-500/10 border border-blue-500/30 text-blue-400 font-mono text-[11px] flex items-center gap-1">
                                🧠 Remote Inference
                              </span>
                            ) : (
                              <span className="ui-chip bg-brand-bg border border-brand-border/60 text-brand-textMuted font-mono text-[11px] flex items-center gap-1">
                                🧠 ~{fmtSizeGB(needGB)} Memory
                              </span>
                            )}
                          </div>

                          <div className="flex flex-wrap items-center gap-3 text-[11px] text-brand-textMuted pt-0.5">
                            <span>Tag: <code className="text-brand-textMain">{model.name}</code></span>
                            <span className="text-brand-textMain font-medium">{reason}</span>
                          </div>
                        </div>

                        {/* Store Action Button */}
                        <div className="flex-shrink-0">
                          {isInstalled ? (
                            <span className="ui-badge bg-[color:var(--neon-constructive)]/10 text-[color:var(--neon-constructive)] px-3 py-1.5 flex items-center gap-1 font-medium text-xs">
                              <CheckCheck size={14} /> Downloaded
                            </span>
                          ) : (
                            <button
                              onClick={() => handlePull(model)}
                              disabled={isWorking || !ollamaStatus.running || fit === 'too-large'}
                              className="ui-btn-primary flex items-center gap-1.5 text-xs px-3 py-1.5 disabled:opacity-40"
                              title={
                                !ollamaStatus.running
                                  ? 'Start Ollama to download'
                                  : fit === 'too-large'
                                  ? 'Exceeds system memory'
                                  : fit === 'quantized'
                                  ? `Download ${model.name} (Runs quantized with CPU offload)`
                                  : `Download ${model.name}`
                              }
                            >
                              {isPulling ? (
                                <RefreshCw size={13} className="animate-spin" />
                              ) : (
                                <Download size={13} />
                              )}
                              {isPulling
                                ? `${isPulling.percent >= 0 ? isPulling.percent + '%' : 'Downloading…'}`
                                : 'Download'}
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Pull Progress Bar */}
                      {isPulling && (
                        <div className="mt-3 pt-2 border-t border-brand-border">
                          <div className="h-1.5 w-full overflow-hidden rounded-full bg-brand-hover">
                            <div
                              className="h-full rounded-full bg-[var(--brand-accent)] transition-all"
                              style={{ width: `${isPulling.percent >= 0 ? isPulling.percent : 100}%` }}
                            />
                          </div>
                          <div className="mt-1 flex justify-between text-[10px] text-brand-textMuted">
                            <span>{isPulling.status}</span>
                            <span>
                              {isPulling.total > 0
                                ? `${fmtBytes(isPulling.completed)} / ${fmtBytes(isPulling.total)} (${isPulling.percent}%)`
                                : isPulling.status}
                            </span>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>

            {/* Store Footer */}
            <div className="p-3.5 border-t border-brand-border bg-brand-card/70 flex items-center justify-between text-xs text-brand-textMuted">
              <span>{filteredStore.length} models available in Ollama Library</span>
              <button
                onClick={() => setStoreOpen(false)}
                className="ui-btn px-4 py-1.5 text-xs font-medium"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Delete Confirmation Modal ────────────────────────────────────── */}
      {deleteConfirmModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="ui-card p-5 max-w-sm w-full space-y-4 shadow-2xl border border-brand-border animate-in fade-in duration-150">
            <div className="flex items-center gap-3 text-[color:var(--neon-destructive)]">
              <Trash2 size={20} />
              <h3 className="text-base font-semibold text-brand-textMain">Delete Local Model?</h3>
            </div>
            <p className="text-xs text-brand-textMuted">
              Are you sure you want to delete <code className="text-brand-textMain font-semibold">{deleteConfirmModal}</code> from your local Ollama storage? You can download it again at any time.
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setDeleteConfirmModal(null)}
                className="ui-btn text-xs"
              >
                Cancel
              </button>
              <button
                onClick={() => handleDelete(deleteConfirmModal)}
                disabled={working.has(deleteConfirmModal)}
                className="ui-btn-primary bg-[color:var(--neon-destructive)] hover:bg-[color:var(--neon-destructive)]/90 text-white text-xs flex items-center gap-1"
              >
                {working.has(deleteConfirmModal) ? <RefreshCw size={13} className="animate-spin" /> : <Trash2 size={13} />}
                Confirm Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const StatCard: React.FC<{
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
  highlight?: string;
}> = ({ icon, label, value, sub, highlight }) => (
  <div className="rounded-lg bg-brand-bg/40 border border-brand-border p-3 space-y-1">
    <div className="flex items-center gap-1.5 text-xs text-brand-textMuted">
      <span className="text-[var(--brand-accent)]">{icon}</span>
      <span>{label}</span>
    </div>
    <div className={`text-sm font-semibold text-brand-textMain truncate ${highlight || ''}`}>
      {value}
    </div>
    {sub && <div className="text-[11px] text-brand-textMuted truncate">{sub}</div>}
  </div>
);

export default LocalModelSettings;
