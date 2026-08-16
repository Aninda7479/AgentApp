import React, { useState, useEffect, useCallback } from 'react';
import {
  Package,
  Play,
  Square,
  ExternalLink,
  FolderOpen,
  RefreshCw,
  Trash2,
  Eye,
  Sparkles,
  ArrowLeft,
  Search,
  Code2,
  Layers,
  Check,
  Copy,
  Sliders,
  X,
  FileCode,
  Globe,
  Terminal,
  Cpu,
  Info,
  Maximize2
} from 'lucide-react';
import { getIpc } from '../../lib/electron';

export interface ArtifactManifest {
  id: string;
  name: string;
  description: string;
  version: string;
  type: 'static' | 'node' | 'python' | string;
  entry: string;
  port?: number;
  logo?: string;
  autoStart?: boolean;
  createdAt?: string;
  tags?: string[];
  windowWidth?: number;
  windowHeight?: number;
  resizable?: boolean;
}

export interface ArtifactRuntimeState {
  id: string;
  manifest: ArtifactManifest;
  status: 'stopped' | 'running' | 'starting' | 'error';
  port?: number;
  actualPort?: number;
  url?: string;
  path: string;
  errorMessage?: string;
}

interface ArtifactsPageProps {
  ipc?: any;
  triggerToast?: (message: string, type?: 'info' | 'error') => void;
  onBack?: () => void;
  onNewChat?: (promptText?: string) => void;
  onOpenSettings?: () => void;
}

export const ArtifactsPage: React.FC<ArtifactsPageProps> = ({
  ipc: propIpc,
  triggerToast,
  onBack,
  onNewChat,
  onOpenSettings,
}) => {
  const ipc = propIpc || getIpc();

  const [artifacts, setArtifacts] = useState<ArtifactRuntimeState[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [search, setSearch] = useState<string>('');
  const [selectedType, setSelectedType] = useState<string>('all');
  const [selectedStatus, setSelectedStatus] = useState<string>('all');
  const [actionLoading, setActionLoading] = useState<Record<string, boolean>>({});
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Live in-app sandbox preview modal state
  const [previewArtifact, setPreviewArtifact] = useState<ArtifactRuntimeState | null>(null);
  const [previewTab, setPreviewTab] = useState<'preview' | 'manifest' | 'entry'>('preview');
  const [previewKey, setPreviewKey] = useState<number>(0);
  const [entryCode, setEntryCode] = useState<string>('');
  const [loadingEntry, setLoadingEntry] = useState<boolean>(false);

  const fetchArtifacts = useCallback(async () => {
    if (!ipc) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const list = await ipc.invoke('artifact:list');
      if (Array.isArray(list)) {
        setArtifacts(list);
      } else {
        setArtifacts([]);
      }
    } catch (err: any) {
      console.error('[Artifacts] Failed to fetch artifacts:', err);
      triggerToast?.('Failed to load artifacts', 'error');
    } finally {
      setLoading(false);
    }
  }, [ipc, triggerToast]);

  useEffect(() => {
    fetchArtifacts();
  }, [fetchArtifacts]);

  const handleStartArtifact = async (art: ArtifactRuntimeState) => {
    if (!ipc) return;
    setActionLoading((prev) => ({ ...prev, [art.id]: true }));
    try {
      await ipc.invoke('artifact:start', art.id);
      triggerToast?.(`Started "${art.manifest.name}"`);
      await fetchArtifacts();
    } catch (err: any) {
      console.error('[Artifacts] Failed to start artifact:', err);
      triggerToast?.(err.message || 'Failed to start artifact', 'error');
    } finally {
      setActionLoading((prev) => ({ ...prev, [art.id]: false }));
    }
  };

  const handleStopArtifact = async (art: ArtifactRuntimeState) => {
    if (!ipc) return;
    setActionLoading((prev) => ({ ...prev, [art.id]: true }));
    try {
      await ipc.invoke('artifact:stop', art.id);
      triggerToast?.(`Stopped "${art.manifest.name}"`);
      await fetchArtifacts();
    } catch (err: any) {
      console.error('[Artifacts] Failed to stop artifact:', err);
      triggerToast?.(err.message || 'Failed to stop artifact', 'error');
    } finally {
      setActionLoading((prev) => ({ ...prev, [art.id]: false }));
    }
  };

  const handleLaunchExternal = async (art: ArtifactRuntimeState) => {
    if (!ipc) return;
    try {
      await ipc.invoke('artifact:open', art.id);
    } catch (err: any) {
      console.error('[Artifacts] Failed to launch artifact:', err);
      triggerToast?.('Could not open artifact in OS window', 'error');
    }
  };

  const handleDeleteArtifact = async (art: ArtifactRuntimeState) => {
    if (!ipc) return;
    const confirmed = window.confirm(`Are you sure you want to delete "${art.manifest.name}" (${art.id})? This cannot be undone.`);
    if (!confirmed) return;

    setActionLoading((prev) => ({ ...prev, [art.id]: true }));
    try {
      await ipc.invoke('artifact:delete', art.id);
      triggerToast?.(`Deleted "${art.manifest.name}"`);
      if (previewArtifact?.id === art.id) {
        setPreviewArtifact(null);
      }
      await fetchArtifacts();
    } catch (err: any) {
      console.error('[Artifacts] Failed to delete artifact:', err);
      triggerToast?.('Failed to delete artifact', 'error');
    } finally {
      setActionLoading((prev) => ({ ...prev, [art.id]: false }));
    }
  };

  const handleOpenStorageFolder = async () => {
    if (!ipc) return;
    try {
      await ipc.invoke('artifact:openFolder');
      triggerToast?.('Opened ~/.superagent/artifacts folder');
    } catch (err: any) {
      console.error('[Artifacts] Failed to open folder:', err);
      triggerToast?.('Failed to open artifacts directory', 'error');
    }
  };

  const handleEnsureSeeds = async () => {
    if (!ipc) return;
    try {
      await ipc.invoke('artifact:ensureSeeds');
      triggerToast?.('Starter micro-apps created in ~/.superagent/artifacts');
      await fetchArtifacts();
    } catch (err: any) {
      console.error('[Artifacts] Failed to create seed artifacts:', err);
      triggerToast?.('Could not initialize starter apps', 'error');
    }
  };

  const handleCopyPath = (text: string, id: string) => {
    if (navigator?.clipboard) {
      navigator.clipboard.writeText(text);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
      triggerToast?.('Copied path to clipboard');
    }
  };

  // Open Live Preview modal
  const handleOpenPreview = async (art: ArtifactRuntimeState) => {
    let currentArt = art;
    if (art.status !== 'running' && ipc) {
      setActionLoading((prev) => ({ ...prev, [art.id]: true }));
      try {
        const started = await ipc.invoke('artifact:start', art.id);
        if (started && started.status === 'running') {
          currentArt = { ...art, ...started };
          setArtifacts((prev) => prev.map((a) => (a.id === art.id ? currentArt : a)));
        }
      } catch (e) {
        console.warn('[Artifacts] Auto-start on preview failed:', e);
      } finally {
        setActionLoading((prev) => ({ ...prev, [art.id]: false }));
      }
    }

    setPreviewArtifact(currentArt);
    setPreviewTab('preview');
    setPreviewKey((k) => k + 1);

    // Try loading entry file content for code tab
    if (ipc && currentArt.path && currentArt.manifest.entry) {
      setLoadingEntry(true);
      try {
        const entryFullPath = `${currentArt.path}/${currentArt.manifest.entry}`.replace(/\\/g, '/');
        const content = await ipc.invoke('read-file-base64', entryFullPath).catch(() => null);
        if (content) {
          try {
            const decoded = atob(content);
            setEntryCode(decoded);
          } catch {
            setEntryCode(content);
          }
        } else {
          setEntryCode(`// Entry file: ${currentArt.manifest.entry}\n// Located at: ${currentArt.path}`);
        }
      } catch {
        setEntryCode(`// File path: ${currentArt.path}/${currentArt.manifest.entry}`);
      } finally {
        setLoadingEntry(false);
      }
    }
  };

  // Filtering
  const filteredArtifacts = artifacts.filter((art) => {
    const q = search.toLowerCase().trim();
    const nameMatch = art.manifest.name?.toLowerCase().includes(q) || false;
    const descMatch = art.manifest.description?.toLowerCase().includes(q) || false;
    const idMatch = art.id?.toLowerCase().includes(q) || false;
    const tagMatch = art.manifest.tags?.some((t) => t.toLowerCase().includes(q)) || false;
    const matchesSearch = !q || nameMatch || descMatch || idMatch || tagMatch;

    const matchesType =
      selectedType === 'all' ||
      (selectedType === 'static' && (art.manifest.type === 'static' || art.manifest.type === 'web')) ||
      (selectedType === 'node' && art.manifest.type === 'node') ||
      (selectedType === 'python' && art.manifest.type === 'python');

    const matchesStatus =
      selectedStatus === 'all' ||
      (selectedStatus === 'running' && art.status === 'running') ||
      (selectedStatus === 'stopped' && (art.status === 'stopped' || art.status === 'error'));

    return matchesSearch && matchesType && matchesStatus;
  });

  const runningCount = artifacts.filter((a) => a.status === 'running').length;

  const getTypeBadge = (type: string) => {
    const t = (type || 'static').toLowerCase();
    if (t === 'python') {
      return (
        <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-md bg-amber-500/10 text-amber-400 border border-amber-500/20">
          <Terminal className="w-3 h-3" /> Python
        </span>
      );
    }
    if (t === 'node') {
      return (
        <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
          <Cpu className="w-3 h-3" /> Node.js
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-md bg-sky-500/10 text-sky-400 border border-sky-500/20">
        <Globe className="w-3 h-3" /> Web / HTML
      </span>
    );
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-brand-bg min-h-0 relative select-none overflow-hidden">
      {/* ── Top Atmospheric Header ── */}
      <div
        className="flex-shrink-0 flex flex-col sm:flex-row sm:items-center justify-between p-4 md:px-6 md:py-4 border-b border-brand-border/40 gap-4 bg-brand-bg/50 backdrop-blur-md z-10"
        style={{ backgroundImage: 'radial-gradient(135% 160% at 0% 0%, var(--brand-atmo-glow) 0%, transparent 52%)' }}
      >
        <div className="flex items-center gap-3">
          {onBack && (
            <button
              onClick={onBack}
              className="p-2 rounded-lg bg-[color:var(--brand-hover)] border border-brand-border/40 hover:bg-[color:var(--brand-hover-strong)] text-brand-textMuted hover:text-brand-textMain transition-all cursor-pointer"
              title="Return to Workspace"
              aria-label="Back"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
          )}

          <div className="p-2 rounded-xl bg-brand-highlight-bg-subtle border border-brand-highlight-border-subtle text-brand-textMain">
            <Package className="w-5 h-5" />
          </div>

          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base md:text-lg font-bold text-brand-textMain leading-tight">
                Artifacts & Micro-Apps
              </h1>
              <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-[color:var(--brand-hover-strong)] text-brand-textMuted border border-brand-border/40">
                {artifacts.length} {artifacts.length === 1 ? 'App' : 'Apps'}
              </span>
              {runningCount > 0 && (
                <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  {runningCount} Running
                </span>
              )}
            </div>
            <p className="text-[11px] text-brand-textMuted flex items-center gap-1.5 mt-0.5">
              <span>Installed at <code className="font-mono text-brand-textMain/80">~/.superagent/artifacts</code></span>
            </p>
          </div>
        </div>

        {/* Header Action Buttons */}
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={handleEnsureSeeds}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-[color:var(--brand-hover)] border border-brand-border/40 hover:bg-[color:var(--brand-hover-strong)] text-brand-textMain transition-all cursor-pointer"
            title="Create starter apps (Calculator & Scratchpad)"
          >
            <Sparkles className="w-3.5 h-3.5 text-amber-400" />
            <span>Seed Starter Apps</span>
          </button>

          <button
            onClick={handleOpenStorageFolder}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-[color:var(--brand-hover)] border border-brand-border/40 hover:bg-[color:var(--brand-hover-strong)] text-brand-textMain transition-all cursor-pointer"
            title="Open ~/.superagent/artifacts in OS File Explorer"
          >
            <FolderOpen className="w-3.5 h-3.5 text-brand-textMuted" />
            <span>Open Folder</span>
          </button>

          <button
            onClick={fetchArtifacts}
            disabled={loading}
            className={`p-2 rounded-lg bg-[color:var(--brand-hover)] border border-brand-border/40 hover:bg-[color:var(--brand-hover-strong)] text-brand-textMuted hover:text-brand-textMain transition-all cursor-pointer ${
              loading ? 'opacity-50 cursor-not-allowed' : ''
            }`}
            title="Refresh Artifacts list"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* ── Filter & Search Toolbar ── */}
      <div className="flex-shrink-0 px-4 md:px-6 py-3 border-b border-brand-border/40 bg-brand-bg/40 flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between">
        {/* Search Input */}
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-brand-textMuted/60" />
          <input
            type="text"
            placeholder="Search artifacts by name, description, tags, or id..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-8 py-1.5 rounded-lg bg-brand-card border border-brand-border/50 text-xs text-brand-textMain placeholder-brand-textMuted/50 focus:outline-none focus:border-brand-border-strong transition-colors"
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 p-0.5 rounded text-brand-textMuted hover:text-brand-textMain"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Filter Pills */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1 md:pb-0">
          <div className="flex items-center gap-1 bg-brand-card p-1 rounded-lg border border-brand-border/40">
            {['all', 'static', 'node', 'python'].map((t) => (
              <button
                key={t}
                onClick={() => setSelectedType(t)}
                className={`px-2.5 py-1 rounded-md text-[11px] font-medium capitalize transition-all cursor-pointer ${
                  selectedType === t
                    ? 'bg-brand-highlight text-brand-highlight-text font-semibold shadow-xs'
                    : 'text-brand-textMuted hover:text-brand-textMain hover:bg-[color:var(--brand-hover)]'
                }`}
              >
                {t === 'all' ? 'All Types' : t === 'static' ? 'Web/HTML' : t}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-1 bg-brand-card p-1 rounded-lg border border-brand-border/40">
            {['all', 'running', 'stopped'].map((s) => (
              <button
                key={s}
                onClick={() => setSelectedStatus(s)}
                className={`px-2.5 py-1 rounded-md text-[11px] font-medium capitalize transition-all cursor-pointer ${
                  selectedStatus === s
                    ? 'bg-brand-highlight text-brand-highlight-text font-semibold shadow-xs'
                    : 'text-brand-textMuted hover:text-brand-textMain hover:bg-[color:var(--brand-hover)]'
                }`}
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Main Content Area: Cards Grid or Empty State ── */}
      <div className="flex-1 overflow-y-auto p-4 md:p-6">
        {loading && artifacts.length === 0 ? (
          <div className="h-64 flex flex-col items-center justify-center text-center">
            <RefreshCw className="w-6 h-6 text-brand-textMuted animate-spin mb-3" />
            <p className="text-sm font-medium text-brand-textMain">Loading micro-apps...</p>
            <p className="text-xs text-brand-textMuted">Scanning ~/.superagent/artifacts</p>
          </div>
        ) : filteredArtifacts.length === 0 ? (
          /* Empty / Zero-results State */
          <div className="max-w-xl mx-auto py-12 px-6 rounded-2xl bg-brand-card/50 border border-brand-border/40 text-center my-6">
            <div className="w-12 h-12 rounded-2xl bg-brand-highlight-bg-subtle border border-brand-highlight-border-subtle text-brand-textMain flex items-center justify-center mx-auto mb-4">
              <Package className="w-6 h-6" />
            </div>

            {artifacts.length === 0 ? (
              <>
                <h3 className="text-base font-semibold text-brand-textMain mb-1">
                  No Artifacts Installed
                </h3>
                <p className="text-xs text-brand-textMuted leading-relaxed mb-6 max-w-md mx-auto">
                  Artifacts are interactive, self-contained micro-applications (calculators, dashboards, games, scrapers, tools) stored in <code className="font-mono text-brand-textMain/80">~/.superagent/artifacts</code>.
                </p>

                <div className="flex items-center justify-center gap-3 flex-wrap mb-8">
                  <button
                    onClick={handleEnsureSeeds}
                    className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold bg-brand-highlight text-brand-highlight-text hover:bg-brand-highlight-hover transition-all shadow-md cursor-pointer"
                  >
                    <Sparkles className="w-4 h-4" />
                    <span>Install Starter Apps</span>
                  </button>

                  <button
                    onClick={handleOpenStorageFolder}
                    className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-medium bg-brand-card border border-brand-border/60 text-brand-textMain hover:bg-[color:var(--brand-hover)] transition-all cursor-pointer"
                  >
                    <FolderOpen className="w-4 h-4 text-brand-textMuted" />
                    <span>Explore Folder</span>
                  </button>
                </div>

                <div className="text-left bg-brand-popover/40 border border-brand-border/40 rounded-xl p-4">
                  <h4 className="text-xs font-semibold text-brand-textMain mb-2 flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                    <span>Ask the AI Agent to build artifacts for you:</span>
                  </h4>
                  <div className="space-y-1.5">
                    {[
                      'Build me a Pomodoro Timer micro-app with sound alerts',
                      'Create a Kanban task board artifact with local storage',
                      'Build a scientific unit converter micro-app',
                    ].map((prompt, idx) => (
                      <button
                        key={idx}
                        onClick={() => onNewChat?.(prompt)}
                        className="w-full text-left text-xs p-2 rounded-lg bg-[color:var(--brand-hover)] hover:bg-[color:var(--brand-hover-strong)] text-brand-textMuted hover:text-brand-textMain transition-colors flex items-center justify-between group cursor-pointer"
                      >
                        <span>"{prompt}"</span>
                        <ArrowLeft className="w-3 h-3 rotate-180 opacity-0 group-hover:opacity-100 transition-opacity" />
                      </button>
                    ))}
                  </div>
                </div>
              </>
            ) : (
              <>
                <h3 className="text-base font-semibold text-brand-textMain mb-1">
                  No matching artifacts found
                </h3>
                <p className="text-xs text-brand-textMuted mb-4">
                  Try adjusting your search query or filter options.
                </p>
                <button
                  onClick={() => {
                    setSearch('');
                    setSelectedType('all');
                    setSelectedStatus('all');
                  }}
                  className="px-3 py-1.5 rounded-lg bg-brand-card border border-brand-border/60 text-xs text-brand-textMain hover:bg-[color:var(--brand-hover)] transition-colors cursor-pointer"
                >
                  Clear filters
                </button>
              </>
            )}
          </div>
        ) : (
          /* Cards Grid */
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {filteredArtifacts.map((art) => {
              const isRunning = art.status === 'running';
              const isLoadingAction = actionLoading[art.id];

              return (
                <div
                  key={art.id}
                  className={`group relative rounded-2xl bg-brand-card border transition-all duration-200 flex flex-col overflow-hidden shadow-sm hover:shadow-md ${
                    isRunning
                      ? 'border-emerald-500/30 bg-gradient-to-b from-emerald-950/10 to-brand-card'
                      : 'border-brand-border/60 hover:border-brand-border-strong'
                  }`}
                >
                  {/* Card Top Header */}
                  <div className="p-4 pb-3 flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3 min-w-0">
                      <div className="w-10 h-10 rounded-xl bg-brand-popover border border-brand-border/60 flex items-center justify-center text-lg flex-shrink-0 shadow-xs">
                        {art.manifest.logo ? (
                          <span className="text-base">{art.manifest.logo}</span>
                        ) : art.manifest.type === 'python' ? (
                          '🐍'
                        ) : art.manifest.type === 'node' ? (
                          '🟩'
                        ) : (
                          '⚡'
                        )}
                      </div>

                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <h3 className="text-sm font-bold text-brand-textMain truncate">
                            {art.manifest.name || art.id}
                          </h3>
                          {art.manifest.version && (
                            <span className="text-[10px] font-mono text-brand-textMuted px-1.5 py-0.2 rounded bg-brand-popover border border-brand-border/40">
                              v{art.manifest.version}
                            </span>
                          )}
                        </div>
                        <span className="text-[11px] font-mono text-brand-textMuted/60 truncate block mt-0.5">
                          id: {art.id}
                        </span>
                      </div>
                    </div>

                    {/* Status Pill */}
                    <div className="flex-shrink-0">
                      {isRunning ? (
                        <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 shadow-xs">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                          Running {art.actualPort || art.manifest.port ? `(:${art.actualPort || art.manifest.port})` : ''}
                        </span>
                      ) : (
                        <span className="inline-flex items-center text-[10px] font-medium px-2 py-0.5 rounded-full bg-brand-popover text-brand-textMuted/80 border border-brand-border/40">
                          Stopped
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Card Description */}
                  <div className="px-4 py-1 flex-1">
                    <p className="text-xs text-brand-textMuted line-clamp-2 leading-relaxed">
                      {art.manifest.description || 'No description provided.'}
                    </p>

                    {/* Type & Tags */}
                    <div className="flex items-center gap-1.5 flex-wrap mt-3">
                      {getTypeBadge(art.manifest.type)}
                      {art.manifest.entry && (
                        <span className="text-[10px] font-mono text-brand-textMuted/70 bg-brand-popover px-1.5 py-0.5 rounded border border-brand-border/40">
                          {art.manifest.entry}
                        </span>
                      )}
                      {art.manifest.tags?.slice(0, 2).map((tag, i) => (
                        <span
                          key={i}
                          className="text-[10px] text-brand-textMuted/60 bg-[color:var(--brand-hover)] px-1.5 py-0.5 rounded"
                        >
                          #{tag}
                        </span>
                      ))}
                    </div>

                    {/* Live URL Pill (Click to copy / open) */}
                    {(art.url || art.actualPort || art.manifest.port) && (
                      <div className="mt-2.5 flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg bg-brand-inner-bg/80 border border-brand-border/40 text-[11px] font-mono">
                        <span className="text-brand-textMuted flex items-center gap-1.5 truncate">
                          <span className={`w-1.5 h-1.5 rounded-full ${isRunning ? 'bg-emerald-400 animate-pulse' : 'bg-slate-500'}`} />
                          <span className="text-brand-textMain/90 truncate">{art.url || `http://127.0.0.1:${art.actualPort || art.manifest.port || 3080}`}</span>
                        </span>
                        <button
                          onClick={() => handleCopyPath(art.url || `http://127.0.0.1:${art.actualPort || art.manifest.port || 3080}`, `url-${art.id}`)}
                          className="text-brand-textMuted hover:text-brand-textMain flex items-center gap-1 hover:underline cursor-pointer"
                          title="Copy HTTP URL"
                        >
                          {copiedId === `url-${art.id}` ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Card Bottom Actions Toolbar */}
                  <div className="p-3 mt-3 border-t border-brand-border/40 bg-brand-popover/30 flex items-center justify-between gap-2">
                    {/* Primary Launch & Preview */}
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => handleOpenPreview(art)}
                        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-brand-highlight text-brand-highlight-text hover:bg-brand-highlight-hover transition-all cursor-pointer shadow-xs"
                        title="Interactive in-app sandbox preview"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        <span>Preview</span>
                      </button>

                      <button
                        onClick={() => handleLaunchExternal(art)}
                        className="flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs font-medium bg-brand-card hover:bg-[color:var(--brand-hover-strong)] text-brand-textMain border border-brand-border/40 transition-colors cursor-pointer"
                        title="Open in external browser or OS window"
                      >
                        <ExternalLink className="w-3.5 h-3.5 text-brand-textMuted" />
                        <span>Launch</span>
                      </button>
                    </div>

                    {/* Runtime & Utility Actions */}
                    <div className="flex items-center gap-1">
                      {/* Run / Stop Toggle */}
                      {isRunning ? (
                        <button
                          onClick={() => handleStopArtifact(art)}
                          disabled={isLoadingAction}
                          className="p-1.5 rounded-lg text-rose-400 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/20 transition-colors cursor-pointer"
                          title="Stop process"
                        >
                          <Square className="w-3.5 h-3.5 fill-current" />
                        </button>
                      ) : (
                        <button
                          onClick={() => handleStartArtifact(art)}
                          disabled={isLoadingAction}
                          className="p-1.5 rounded-lg text-emerald-400 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/20 transition-colors cursor-pointer"
                          title="Start process"
                        >
                          <Play className="w-3.5 h-3.5 fill-current" />
                        </button>
                      )}

                      {/* Copy Path */}
                      <button
                        onClick={() => handleCopyPath(art.path, art.id)}
                        className="p-1.5 rounded-lg text-brand-textMuted hover:text-brand-textMain hover:bg-[color:var(--brand-hover-strong)] transition-colors cursor-pointer"
                        title="Copy folder path"
                      >
                        {copiedId === art.id ? (
                          <Check className="w-3.5 h-3.5 text-emerald-400" />
                        ) : (
                          <Copy className="w-3.5 h-3.5" />
                        )}
                      </button>

                      {/* Delete */}
                      <button
                        onClick={() => handleDeleteArtifact(art)}
                        disabled={isLoadingAction}
                        className="p-1.5 rounded-lg text-brand-textMuted hover:text-rose-400 hover:bg-rose-500/10 transition-colors cursor-pointer"
                        title="Delete artifact"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Interactive In-App Sandbox Preview Modal ── */}
      {previewArtifact && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
          <div className="w-full max-w-4xl h-[85vh] flex flex-col rounded-2xl bg-brand-card border border-brand-border-strong shadow-2xl overflow-hidden">
            {/* Modal Header */}
            <div className="px-4 py-3 border-b border-brand-border/60 bg-brand-popover/70 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-brand-card border border-brand-border flex items-center justify-center text-sm shadow-xs">
                  {previewArtifact.manifest.logo || '⚡'}
                </div>
                <div>
                  <h3 className="text-sm font-bold text-brand-textMain flex items-center gap-2">
                    <span>{previewArtifact.manifest.name}</span>
                    <span className="text-[10px] font-mono font-normal text-brand-textMuted">
                      (~/.superagent/artifacts/{previewArtifact.id})
                    </span>
                  </h3>
                </div>
              </div>

              {/* Header Right Actions */}
              <div className="flex items-center gap-2">
                <div className="flex items-center bg-brand-card p-0.5 rounded-lg border border-brand-border/40">
                  <button
                    onClick={() => setPreviewTab('preview')}
                    className={`px-2.5 py-1 rounded-md text-xs font-medium transition-all cursor-pointer ${
                      previewTab === 'preview'
                        ? 'bg-brand-highlight text-brand-highlight-text font-semibold'
                        : 'text-brand-textMuted hover:text-brand-textMain'
                    }`}
                  >
                    Live App
                  </button>
                  <button
                    onClick={() => setPreviewTab('manifest')}
                    className={`px-2.5 py-1 rounded-md text-xs font-medium transition-all cursor-pointer ${
                      previewTab === 'manifest'
                        ? 'bg-brand-highlight text-brand-highlight-text font-semibold'
                        : 'text-brand-textMuted hover:text-brand-textMain'
                    }`}
                  >
                    manifest.json
                  </button>
                  <button
                    onClick={() => setPreviewTab('entry')}
                    className={`px-2.5 py-1 rounded-md text-xs font-medium transition-all cursor-pointer ${
                      previewTab === 'entry'
                        ? 'bg-brand-highlight text-brand-highlight-text font-semibold'
                        : 'text-brand-textMuted hover:text-brand-textMain'
                    }`}
                  >
                    Source
                  </button>
                </div>

                <button
                  onClick={() => setPreviewKey((k) => k + 1)}
                  className="p-1.5 rounded-lg text-brand-textMuted hover:text-brand-textMain hover:bg-[color:var(--brand-hover-strong)] transition-colors cursor-pointer"
                  title="Reload frame"
                >
                  <RefreshCw className="w-4 h-4" />
                </button>

                <button
                  onClick={() => handleLaunchExternal(previewArtifact)}
                  className="p-1.5 rounded-lg text-brand-textMuted hover:text-brand-textMain hover:bg-[color:var(--brand-hover-strong)] transition-colors cursor-pointer"
                  title="Open in external browser window"
                >
                  <ExternalLink className="w-4 h-4" />
                </button>

                <button
                  onClick={() => setPreviewArtifact(null)}
                  className="p-1.5 rounded-lg text-brand-textMuted hover:text-brand-textMain hover:bg-[color:var(--brand-hover-strong)] transition-colors cursor-pointer"
                  title="Close preview"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Modal Body */}
            <div className="flex-1 bg-brand-inner-bg relative overflow-hidden flex flex-col">
              {/* Browser Address Bar */}
              {previewTab === 'preview' && (
                <div className="px-4 py-1.5 bg-brand-card/90 border-b border-brand-border/40 flex items-center justify-between gap-2 text-xs font-mono">
                  <div className="flex items-center gap-2 flex-1 min-w-0 bg-brand-inner-bg px-3 py-1 rounded-md border border-brand-border/40">
                    <span className="text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                      HTTP
                    </span>
                    <span className="text-brand-textMain/90 truncate">
                      {previewArtifact.url || `http://127.0.0.1:${previewArtifact.actualPort || previewArtifact.manifest.port || 3080}`}
                    </span>
                  </div>
                  <button
                    onClick={() =>
                      handleCopyPath(
                        previewArtifact.url || `http://127.0.0.1:${previewArtifact.actualPort || previewArtifact.manifest.port || 3080}`,
                        'modal-url'
                      )
                    }
                    className="p-1.5 rounded-md hover:bg-[color:var(--brand-hover)] text-brand-textMuted hover:text-brand-textMain transition-colors cursor-pointer"
                    title="Copy live URL"
                  >
                    {copiedId === 'modal-url' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  </button>
                </div>
              )}

              {previewTab === 'preview' ? (
                <iframe
                  key={previewKey}
                  title={previewArtifact.manifest.name}
                  src={
                    previewArtifact.url
                      ? String(previewArtifact.url)
                      : `/api/artifacts/${previewArtifact.id}/view/`
                  }
                  sandbox="allow-scripts allow-forms allow-modals allow-same-origin"
                  className="w-full h-full border-none bg-slate-950"
                />
              ) : previewTab === 'manifest' ? (
                <div className="flex-1 p-4 overflow-y-auto font-mono text-xs text-brand-textMain bg-brand-card">
                  <div className="flex items-center justify-between mb-2 pb-2 border-b border-brand-border/40">
                    <span className="text-brand-textMuted">manifest.json</span>
                    <button
                      onClick={() =>
                        handleCopyPath(
                          JSON.stringify(previewArtifact.manifest, null, 2),
                          'manifest-copy'
                        )
                      }
                      className="flex items-center gap-1 px-2 py-1 rounded bg-[color:var(--brand-hover)] hover:bg-[color:var(--brand-hover-strong)] text-brand-textMuted hover:text-brand-textMain text-[11px] transition-colors"
                    >
                      {copiedId === 'manifest-copy' ? (
                        <Check className="w-3 h-3 text-emerald-400" />
                      ) : (
                        <Copy className="w-3 h-3" />
                      )}
                      <span>Copy JSON</span>
                    </button>
                  </div>
                  <pre className="p-4 rounded-xl bg-brand-bg border border-brand-border/40 overflow-x-auto text-emerald-400">
                    {JSON.stringify(previewArtifact.manifest, null, 2)}
                  </pre>
                </div>
              ) : (
                <div className="flex-1 p-4 overflow-y-auto font-mono text-xs text-brand-textMain bg-brand-card">
                  <div className="flex items-center justify-between mb-2 pb-2 border-b border-brand-border/40">
                    <span className="text-brand-textMuted">
                      {previewArtifact.manifest.entry || 'index.html'}
                    </span>
                    <button
                      onClick={() => handleCopyPath(entryCode, 'entry-copy')}
                      className="flex items-center gap-1 px-2 py-1 rounded bg-[color:var(--brand-hover)] hover:bg-[color:var(--brand-hover-strong)] text-brand-textMuted hover:text-brand-textMain text-[11px] transition-colors"
                    >
                      {copiedId === 'entry-copy' ? (
                        <Check className="w-3 h-3 text-emerald-400" />
                      ) : (
                        <Copy className="w-3 h-3" />
                      )}
                      <span>Copy Source</span>
                    </button>
                  </div>
                  {loadingEntry ? (
                    <div className="p-8 text-center text-brand-textMuted">Loading source code...</div>
                  ) : (
                    <pre className="p-4 rounded-xl bg-brand-bg border border-brand-border/40 overflow-x-auto whitespace-pre-wrap leading-relaxed text-sky-300">
                      {entryCode}
                    </pre>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
