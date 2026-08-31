import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Cpu,
  Download,
  Trash2,
  RefreshCw,
  CheckCircle2,
  HardDrive,
  Sparkles,
  Zap,
  RotateCcw,
  Search,
  Sliders,
  Image as ImageIcon,
  Activity,
  MemoryStick,
  Settings2,
  X,
  ChevronDown,
  ChevronUp,
  CircleAlert,
  ArrowUpDown,
  Layers,
  Palette,
  Check,
  FolderOpen,
  Info,
  MonitorSmartphone,
} from 'lucide-react';
import { getIpc } from '../../lib/ipc';
import { SystemInfo, normalizeSystemInfo } from '../../logic/systemInfo';
import {
  getEngineStatus,
  installEngine,
  updateEngine,
  rollbackEngine,
  uninstallEngine,
  checkEngineUpdate,
  getHardwareProfile,
  listImageModels,
  pullImageModel,
  deleteImageModel,
  openModelsFolder,
  EngineStatus,
  HardwareProfile,
  ImageModelInfo,
  UpdateInfo,
  GpuBackend,
} from '../../services/imageService';
import { SettingsLoadingProgressBar } from '../../components/SettingsLoadingProgressBar';

interface LocalImageModelSettingsProps {
  onToast?: (message: string) => void;
}

const fmtGB = (n: number): string => (n >= 10 ? Math.round(n).toString() : (Math.round(n * 10) / 10).toString());

const fmtBytes = (bytes: number): string => {
  if (!bytes || bytes <= 0) return '0 B';
  if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(1)} GB`;
  if (bytes >= 1e6) return `${(bytes / 1e6).toFixed(0)} MB`;
  return `${bytes} B`;
};

export const LocalImageModelSettings: React.FC<LocalImageModelSettingsProps> = ({ onToast }) => {
  const notify = (msg: string) => {
    if (onToast) onToast(msg);
  };

  // State
  const [systemInfo, setSystemInfo] = useState<SystemInfo | null>(null);
  const [engineStatus, setEngineStatus] = useState<EngineStatus>({
    installed: false,
    is_running: false,
    is_downloading: false,
  });
  const [hardware, setHardware] = useState<HardwareProfile | null>(null);
  const [models, setModels] = useState<ImageModelInfo[]>([]);
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);

  const [loading, setLoading] = useState(true);
  const [statusLoading, setStatusLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // Settings & Engine Collapsible
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [selectedBackend, setSelectedBackend] = useState<GpuBackend | 'auto'>('auto');

  // OS Tab for Install Guide
  const [activeOsTab, setActiveOsTab] = useState<'windows' | 'macos' | 'linux'>('windows');

  // Model Store Modal State
  const [storeOpen, setStoreOpen] = useState(false);
  const [storeSearch, setStoreSearch] = useState('');
  const [storeTagFilter, setStoreTagFilter] = useState<string>('all');
  const [storeSortBy, setStoreSortBy] = useState<'top-match' | 'steps-asc' | 'download-asc' | 'vram-asc'>('top-match');
  const [storeRunnableOnly, setStoreRunnableOnly] = useState(false);

  // Search in installed models
  const [searchInstalled, setSearchInstalled] = useState('');

  // Delete confirm modal
  const [deleteConfirmModal, setDeleteConfirmModal] = useState<string | null>(null);

  // Detect OS
  useEffect(() => {
    if (hardware?.os) {
      const os = hardware.os.toLowerCase();
      if (os.includes('win')) setActiveOsTab('windows');
      else if (os.includes('mac') || os.includes('darwin')) setActiveOsTab('macos');
      else setActiveOsTab('linux');
    }
  }, [hardware?.os]);

  const refreshData = useCallback(async (checkUpdate: boolean = false) => {
    setStatusLoading(true);
    try {
      const ipc = getIpc();
      const [status, hw, modelList, sys] = await Promise.all([
        getEngineStatus(),
        getHardwareProfile(),
        listImageModels(),
        ipc?.invoke('system-info').catch(() => null),
      ]);
      setEngineStatus(status);
      setHardware(hw);
      setModels(modelList);
      if (sys) setSystemInfo(normalizeSystemInfo(sys));

      if (checkUpdate) {
        checkEngineUpdate()
          .then((update) => setUpdateInfo(update))
          .catch(() => {});
      }
    } catch (err) {
      console.error('Failed to load image engine settings:', err);
    } finally {
      setLoading(false);
      setStatusLoading(false);
    }
  }, []);

  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    try {
      await refreshData(true);
    } finally {
      setIsRefreshing(false);
    }
  }, [refreshData]);

  const pollDownloadProgress = useCallback(async () => {
    try {
      const [status, modelList] = await Promise.all([
        getEngineStatus(),
        listImageModels(),
      ]);
      setEngineStatus(status);
      setModels(modelList);
    } catch {}
  }, []);

  useEffect(() => {
    refreshData(true);
  }, [refreshData]);

  // Only poll when actively downloading engine or models
  const isDownloadingAny = engineStatus.is_downloading || models.some((m) => m.is_downloading);
  useEffect(() => {
    if (!isDownloadingAny) return;

    const interval = setInterval(() => {
      pollDownloadProgress();
    }, 2000);
    return () => clearInterval(interval);
  }, [isDownloadingAny, pollDownloadProgress]);

  // Actions
  const handleInstallEngine = async () => {
    setActionLoading('install');
    try {
      const backend = selectedBackend === 'auto' ? undefined : selectedBackend;
      await installEngine(backend);
      notify('Engine installation initiated from upstream stable-diffusion.cpp releases.');
      await refreshData();
    } catch (err: any) {
      notify(`Error installing engine: ${err.message}`);
    } finally {
      setActionLoading(null);
    }
  };

  const handleUpdateEngine = async () => {
    setActionLoading('update');
    try {
      await updateEngine();
      notify('Updating engine to latest version...');
      await refreshData();
    } catch (err: any) {
      notify(`Update failed: ${err.message}`);
    } finally {
      setActionLoading(null);
    }
  };

  const handleRollback = async () => {
    setActionLoading('rollback');
    try {
      await rollbackEngine();
      notify('Successfully rolled back to previous engine binary.');
      await refreshData();
    } catch (err: any) {
      notify(`Rollback failed: ${err.message}`);
    } finally {
      setActionLoading(null);
    }
  };

  const handleUninstall = async () => {
    setActionLoading('uninstall');
    try {
      await uninstallEngine();
      notify('Engine uninstalled successfully.');
      await refreshData();
    } catch (err: any) {
      notify(`Uninstall failed: ${err.message}`);
    } finally {
      setActionLoading(null);
    }
  };

  // Storage information from systemInfo or hardware profile
  const storageFreeGB = systemInfo?.storage && systemInfo.storage.length > 0
    ? systemInfo.storage[0].freeGB
    : hardware?.storage_free_gb;
  const storageTotalGB = systemInfo?.storage && systemInfo.storage.length > 0
    ? systemInfo.storage[0].sizeGB
    : hardware?.storage_total_gb;
  const storageMount = systemInfo?.storage && systemInfo.storage.length > 0
    ? systemInfo.storage[0].mount
    : hardware?.storage_mount || 'System Disk';

  const handlePullModel = async (
    modelId: string,
    modelSizeGB?: number,
    isSupported: boolean = true,
    memoryWarning?: string
  ) => {
    if (!isSupported) {
      notify(`This model is incompatible with your system architecture. We recommend installing Stable Diffusion 1.5.`);
      return;
    }
    if (storageFreeGB !== undefined && modelSizeGB !== undefined && storageFreeGB < modelSizeGB + 0.5) {
      notify(`Insufficient disk space: Model requires ~${fmtGB(modelSizeGB)} GB, but only ${fmtGB(storageFreeGB)} GB is available on ${storageMount}.`);
      return;
    }
    if (memoryWarning) {
      notify(`Memory note: ${memoryWarning}`);
    }
    setActionLoading(`pull_${modelId}`);
    try {
      await pullImageModel(modelId);
      notify(`Download started for ${modelId}. Check progress bar.`);
      await refreshData();
    } catch (err: any) {
      notify(`Download failed: ${err.message}`);
    } finally {
      setActionLoading(null);
    }
  };

  const handleDeleteModel = async (modelId: string) => {
    setActionLoading(`del_${modelId}`);
    try {
      await deleteImageModel(modelId);
      notify(`Model ${modelId} deleted from local storage.`);
      setDeleteConfirmModal(null);
      await refreshData();
    } catch (err: any) {
      notify(`Delete failed: ${err.message}`);
    } finally {
      setActionLoading(null);
    }
  };

  const handleOpenFolder = async () => {
    try {
      await openModelsFolder();
      notify('Opened image models folder in file explorer.');
    } catch (err: any) {
      notify(`Failed to open folder: ${err.message}`);
    }
  };

  // Installed models list filtered by search
  const installedModels = useMemo(() => {
    return models
      .filter((m) => m.is_downloaded)
      .filter((m) => {
        if (!searchInstalled.trim()) return true;
        const q = searchInstalled.toLowerCase();
        return (
          m.name.toLowerCase().includes(q) ||
          m.id.toLowerCase().includes(q) ||
          m.quantization.toLowerCase().includes(q)
        );
      });
  }, [models, searchInstalled]);

  // Model catalog with hardware fitness analysis
  const catalogWithFit = useMemo(() => {
    const isMac = hardware?.os?.toLowerCase().includes('mac') || hardware?.os?.toLowerCase().includes('darwin');
    const isAppleSilicon = isMac && hardware?.arch === 'aarch64';
    const isIntelMac = isMac && hardware?.arch !== 'aarch64';

    const effectiveVram = isAppleSilicon
      ? Math.round((hardware?.total_ram_mb || 16384) * 0.75)
      : (hardware?.vram_mb || 2048);

    const availableRamGB = systemInfo?.ramFreeGB !== undefined
      ? systemInfo.ramFreeGB
      : hardware?.available_ram_mb
      ? hardware.available_ram_mb / 1024
      : undefined;
    const totalRamGB = (hardware?.total_ram_mb || 16384) / 1024;

    return models.map((model) => {
      const needVram = model.vram_required_mb;
      const fitsGpu = effectiveVram >= needVram;
      const isRecommended = hardware?.recommended_model_id === model.id;
      const modelSizeGB = model.size_bytes / (1024 * 1024 * 1024);
      const hasEnoughDisk = storageFreeGB !== undefined ? storageFreeGB >= modelSizeGB + 0.5 : true;

      let fitLabel = 'Fits GPU (Optimal Match)';
      let fitColor = 'text-[color:var(--neon-constructive)] bg-[color:var(--neon-constructive)]/15 border-[color:var(--neon-constructive)]/25';
      let isSupported = true;
      let memoryWarning: string | undefined;

      if (model.family === 'flux') {
        if (isIntelMac) {
          fitLabel = 'Incompatible with Intel Mac CPU/iGPU';
          fitColor = 'text-[color:var(--neon-destructive)] bg-[color:var(--neon-destructive)]/15 border-[color:var(--neon-destructive)]/30';
          isSupported = false;
          memoryWarning = 'FLUX.1 requires Apple Silicon (M1/M2/M3/M4) or a dedicated NVIDIA CUDA GPU.';
        } else if (totalRamGB < 16) {
          fitLabel = 'Requires ≥ 16 GB RAM (High Memory)';
          fitColor = 'text-amber-400 bg-amber-500/15 border-amber-500/25';
          memoryWarning = `System has ${fmtGB(totalRamGB)} GB RAM. FLUX.1 requires ~9 GB of free RAM to generate images.`;
        } else if (availableRamGB !== undefined && availableRamGB < 7.5) {
          fitLabel = 'High Memory (Needs ~9 GB Free RAM)';
          fitColor = 'text-amber-400 bg-amber-500/15 border-amber-500/25';
          memoryWarning = `Only ${fmtGB(availableRamGB)} GB RAM currently free. Close background applications before generating.`;
        } else if (isRecommended) {
          fitLabel = 'Recommended for your Hardware';
          fitColor = 'text-[color:var(--neon-constructive)] bg-[color:var(--neon-constructive)]/20 border-[color:var(--neon-constructive)]/40 font-semibold';
        }
      } else if (model.family === 'sdxl') {
        if (isIntelMac) {
          fitLabel = 'Heavy on CPU (SD 1.5 Recommended)';
          fitColor = 'text-amber-400 bg-amber-500/15 border-amber-500/25';
        } else if (!fitsGpu) {
          fitLabel = 'Offloads to System RAM (Slower)';
          fitColor = 'text-amber-400 bg-amber-500/15 border-amber-500/25';
        } else if (isRecommended) {
          fitLabel = 'Recommended for your Hardware';
          fitColor = 'text-[color:var(--neon-constructive)] bg-[color:var(--neon-constructive)]/20 border-[color:var(--neon-constructive)]/40 font-semibold';
        } else {
          fitLabel = 'Runs on GPU';
          fitColor = 'text-brand-textMain bg-brand-popover border-brand-border';
        }
      } else if (model.family === 'sd15') {
        fitLabel = isRecommended ? 'Recommended (Fast & Lightweight)' : 'Runs on GPU / Fast';
        fitColor = isRecommended
          ? 'text-[color:var(--neon-constructive)] bg-[color:var(--neon-constructive)]/20 border-[color:var(--neon-constructive)]/40 font-semibold'
          : 'text-brand-textMain bg-brand-popover border-brand-border';
      } else if (!fitsGpu) {
        fitLabel = 'Offloads to System RAM (Slower)';
        fitColor = 'text-amber-400 bg-amber-500/15 border-amber-500/25';
      } else if (isRecommended) {
        fitLabel = 'Recommended for your Hardware';
        fitColor = 'text-[color:var(--neon-constructive)] bg-[color:var(--neon-constructive)]/20 border-[color:var(--neon-constructive)]/40 font-semibold';
      } else {
        fitLabel = 'Runs on GPU';
        fitColor = 'text-brand-textMain bg-brand-popover border-brand-border';
      }

      return {
        model,
        fitsGpu,
        isRecommended,
        modelSizeGB,
        hasEnoughDisk,
        isSupported,
        memoryWarning,
        fitLabel,
        fitColor,
      };
    });
  }, [models, hardware, storageFreeGB, systemInfo]);

  // Filtered store models
  const filteredStore = useMemo(() => {
    let list = [...catalogWithFit];

    if (storeTagFilter !== 'all') {
      list = list.filter(({ model }) => {
        if (storeTagFilter === 'flux') return model.family === 'flux';
        if (storeTagFilter === 'sdxl') return model.family === 'sdxl';
        if (storeTagFilter === 'sd35') return model.family === 'sd35';
        if (storeTagFilter === 'sd15') return model.family === 'sd15';
        return true;
      });
    }

    if (storeSearch.trim()) {
      const q = storeSearch.toLowerCase();
      list = list.filter(
        ({ model }) =>
          model.name.toLowerCase().includes(q) ||
          model.id.toLowerCase().includes(q) ||
          model.quantization.toLowerCase().includes(q)
      );
    }

    if (storeRunnableOnly) {
      list = list.filter(({ fitsGpu }) => fitsGpu);
    }

    // Sort
    list.sort((a, b) => {
      if (storeSortBy === 'top-match') {
        if (a.isRecommended) return -1;
        if (b.isRecommended) return 1;
        return a.model.vram_required_mb - b.model.vram_required_mb;
      }
      if (storeSortBy === 'steps-asc') return a.model.default_steps - b.model.default_steps;
      if (storeSortBy === 'download-asc') return a.model.size_bytes - b.model.size_bytes;
      if (storeSortBy === 'vram-asc') return a.model.vram_required_mb - b.model.vram_required_mb;
      return 0;
    });

    return list;
  }, [catalogWithFit, storeTagFilter, storeSearch, storeRunnableOnly, storeSortBy]);

  const isLoading = loading || isRefreshing;

  return (
    <div className="space-y-6 max-w-5xl pb-12">
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-brand-textMain sm:text-2xl flex items-center gap-2.5">
            <Palette size={24} className="text-[var(--brand-accent)]" />
            Local Image Model
          </h1>
          <p className="mt-1 text-sm text-brand-textMuted sm:text-base">
            Synthesize high-fidelity images and artwork 100% locally on your GPU or CPU with complete privacy.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setStoreOpen(true)}
            disabled={isLoading}
            className="ui-btn-primary flex items-center gap-1.5 shadow-sm disabled:opacity-50"
          >
            <Sparkles size={15} />
            Explore & Download Models
          </button>
          <button
            onClick={handleOpenFolder}
            disabled={isLoading}
            className="ui-btn flex items-center gap-1.5 disabled:opacity-50"
            title="Open models directory in file manager"
          >
            <FolderOpen size={14} />
            Models Folder
          </button>
          <button
            onClick={handleRefresh}
            disabled={isLoading}
            className="ui-btn flex items-center gap-1.5 disabled:opacity-50"
            title="Refresh hardware status and models"
          >
            <RefreshCw size={14} className={isLoading ? 'animate-spin' : ''} />
            Refresh
          </button>
        </div>
      </div>

      {/* ── Main Content Area ───────────────────────────────────────────── */}
      {isLoading ? (
        <SettingsLoadingProgressBar
          title={isRefreshing ? 'Refreshing Local Image Engine...' : 'Loading Image Engine & Hardware Budget...'}
          description="Scanning stable-diffusion.cpp binaries, local model weights, VRAM allocation, and CUDA/Metal acceleration..."
          isRefreshing={isRefreshing}
          iconType="image"
        />
      ) : (
        <>
          {/* ── Status Banner (Installation & Daemon Running State) ─────────── */}
      {!engineStatus.installed ? (
        <div className="ui-card p-6 border-l-4 border-l-[color:var(--neon-attention)] bg-brand-card/90">
          <div className="flex items-start gap-4">
            <CircleAlert size={24} className="text-[color:var(--neon-attention)] flex-shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <h2 className="text-base font-semibold text-brand-textMain">
                Image generation engine is not installed on this system
              </h2>
              <p className="mt-1 text-xs sm:text-sm text-brand-textMuted">
                SuperAgent uses a native, high-performance <code className="text-brand-textMain font-mono">stable-diffusion.cpp</code> inference engine with GGUF quantization. Zero Python, Conda, or external servers required.
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
                  Windows (CUDA / Vulkan / CPU)
                </button>
                <button
                  onClick={() => setActiveOsTab('macos')}
                  className={`pb-2 transition-colors ${
                    activeOsTab === 'macos'
                      ? 'border-b-2 border-[var(--brand-accent)] text-brand-textMain font-semibold'
                      : 'text-brand-textMuted hover:text-brand-textMain'
                  }`}
                >
                  macOS (Apple Silicon Metal)
                </button>
                <button
                  onClick={() => setActiveOsTab('linux')}
                  className={`pb-2 transition-colors ${
                    activeOsTab === 'linux'
                      ? 'border-b-2 border-[var(--brand-accent)] text-brand-textMain font-semibold'
                      : 'text-brand-textMuted hover:text-brand-textMain'
                  }`}
                >
                  Linux (CUDA / Vulkan)
                </button>
              </div>

              <div className="mt-4 flex flex-wrap items-center gap-3">
                <button
                  onClick={handleInstallEngine}
                  disabled={actionLoading === 'install' || engineStatus.is_downloading}
                  className="ui-btn-primary flex items-center gap-1.5 shadow-sm disabled:opacity-50"
                >
                  <Download size={14} className={engineStatus.is_downloading ? 'animate-bounce' : ''} />
                  <span>
                    {engineStatus.is_downloading
                      ? `Downloading Engine (${Math.round((engineStatus.download_progress || 0) * 100)}%)...`
                      : `Install Image Engine (${hardware?.recommended_backend.toUpperCase() || 'Auto'})`}
                  </span>
                </button>

                <span className="text-xs text-brand-textMuted">
                  Pre-compiled binary from official upstream GitHub releases (~15 MB).
                </span>
              </div>

              {/* Downloading Progress Bar */}
              {engineStatus.is_downloading && (
                <div className="space-y-1.5 pt-3 max-w-md">
                  <div className="flex justify-between text-[11px] text-brand-textMuted">
                    <span>Downloading standalone sd-cli binary...</span>
                    <span className="font-mono">{Math.round((engineStatus.download_progress || 0) * 100)}%</span>
                  </div>
                  <div className="w-full h-1.5 bg-brand-hover rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full bg-[var(--brand-accent)] transition-all duration-300"
                      style={{ width: `${Math.round((engineStatus.download_progress || 0) * 100)}%` }}
                    />
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      ) : (
        /* Engine Installed Banner */
        <div className="ui-card p-4 bg-brand-card border-brand-border flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className="relative flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[color:var(--neon-constructive)] opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3 w-3 bg-[color:var(--neon-constructive)]"></span>
            </div>
            <div>
              <div className="text-sm font-semibold text-brand-textMain flex items-center gap-2 flex-wrap">
                Image Engine is Ready
                {engineStatus.version && (
                  <span className="ui-chip bg-brand-popover text-brand-textMuted">
                    {engineStatus.version}
                  </span>
                )}
                <span className="ui-badge bg-[color:var(--neon-constructive)]/15 text-[color:var(--neon-constructive)]">
                  {engineStatus.backend ? engineStatus.backend.toUpperCase() : 'GPU'} Acceleration
                </span>
              </div>
              <div className="text-xs text-brand-textMuted mt-0.5">
                Host: <code className="text-brand-textMain">localhost:1469</code> · {installedModels.length} model{installedModels.length !== 1 ? 's' : ''} installed
                {engineStatus.binary_path && ` · Binary ready`}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setSettingsOpen((v) => !v)}
              className="ui-btn flex items-center gap-1.5 text-xs"
            >
              <Settings2 size={14} />
              Engine Configuration
              {settingsOpen ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
            </button>
          </div>
        </div>
      )}

      {/* ── System Hardware & Inference Budget ───────────────────────────── */}
      <div className="ui-card p-5">
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Activity size={16} className="text-[var(--brand-accent)]" />
            <span className="ui-label font-semibold text-brand-textMain">Hardware & Diffusion Budget</span>
          </div>
          {hardware?.gpu_name && (
            <span className="ui-badge bg-[color:var(--neon-constructive)]/15 text-[color:var(--neon-constructive)] font-medium">
              Accelerated Pipeline
            </span>
          )}
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <StatCard
            icon={<Cpu size={15} />}
            label="GPU Acceleration"
            value={hardware?.gpu_name || (hardware?.recommended_backend === 'metal' ? 'Apple Silicon GPU' : 'System Graphics')}
            sub={`Backend: ${hardware?.recommended_backend.toUpperCase() || 'AUTO'} · ${hardware?.arch || 'x64'}`}
          />
          <StatCard
            icon={<Zap size={15} />}
            label="VRAM Capacity"
            value={
              (hardware?.os?.toLowerCase().includes('mac') || hardware?.os?.toLowerCase().includes('darwin')) && hardware?.arch === 'aarch64'
                ? `${fmtGB(((hardware.total_ram_mb || 16384) * 0.75) / 1024)} GB Unified`
                : hardware?.vram_mb
                ? `${fmtGB(hardware.vram_mb / 1024)} GB Dedicated`
                : 'Shared / CPU RAM'
            }
            sub={
              (hardware?.vram_mb && hardware.vram_mb >= 8192) || ((hardware?.total_ram_mb || 0) >= 16384 && hardware?.arch === 'aarch64')
                ? 'High VRAM (Full FLUX & SDXL)'
                : (hardware?.vram_mb && hardware.vram_mb >= 6144)
                ? 'Medium VRAM (SDXL / SD 3.5)'
                : (hardware?.vram_mb && hardware.vram_mb >= 4096)
                ? '4 GB VRAM (SD 1.5 Fast / SDXL Paged)'
                : 'Lightweight models recommended'
            }
          />
          <StatCard
            icon={<MemoryStick size={15} />}
            label="System RAM"
            value={`${fmtGB((hardware?.total_ram_mb || 16384) / 1024)} GB Total`}
            sub="System working memory"
          />
          <StatCard
            icon={<HardDrive size={15} />}
            label="Storage"
            value={
              storageFreeGB !== undefined
                ? `${fmtGB(storageFreeGB)} GB Free`
                : 'Available'
            }
            sub={
              storageTotalGB !== undefined
                ? `${storageMount} (${fmtGB(storageTotalGB)} GB total)`
                : 'System Disk'
            }
          />
          <StatCard
            icon={<Sparkles size={15} />}
            label="Recommended Model"
            value={hardware?.recommended_model_id ? hardware.recommended_model_id.toUpperCase() : 'SD 1.5'}
            sub="Auto-matched for your hardware"
          />
        </div>

        {(hardware?.npu_detected || systemInfo?.npuTpu?.detected) && (
          <div className="mt-3.5 flex items-center gap-2 rounded bg-brand-bg/60 px-3 py-1.5 border border-brand-border text-xs text-brand-textMuted">
            <MonitorSmartphone size={14} className="text-[var(--brand-accent)]" />
            <span>
              AI Accelerator Detected:{' '}
              <strong className="text-brand-textMain">
                {hardware?.npu_label || systemInfo?.npuTpu?.label || 'Intel AI Boost (NPU)'}
              </strong>
            </span>
          </div>
        )}
      </div>

      {/* ── Collapsible Engine Settings ─────────────────────────────────── */}
      {settingsOpen && (
        <div className="ui-card p-5 border-[var(--brand-accent-border)] bg-brand-card space-y-4">
          <div className="flex items-center justify-between border-b border-brand-border pb-3">
            <div className="flex items-center gap-2">
              <Sliders size={16} className="text-[var(--brand-accent)]" />
              <h2 className="text-sm font-semibold text-brand-textMain">Engine Parameters & Lifecycle</h2>
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
              <label className="ui-label mb-1">Target Acceleration Backend</label>
              <select
                value={selectedBackend}
                onChange={(e) => setSelectedBackend(e.target.value as any)}
                className="ui-select w-full"
              >
                <option value="auto">Auto-detect ({hardware?.recommended_backend.toUpperCase() || 'GPU'})</option>
                <option value="cuda">NVIDIA CUDA (GeForce / RTX / Quadro)</option>
                <option value="vulkan">Vulkan (AMD Radeon / Intel Arc / Cross-GPU)</option>
                <option value="metal">Apple Silicon Metal</option>
                <option value="cpu">CPU AVX2 (Universal)</option>
              </select>
              <span className="text-[11px] text-brand-textMuted mt-1 block">
                Select your preferred hardware pipeline variant.
              </span>
            </div>

            <div>
              <label className="ui-label mb-1">Binary Path on Disk</label>
              <div className="ui-input font-mono text-[11px] truncate text-brand-textMuted bg-brand-bg select-all">
                {engineStatus.binary_path || 'Not installed'}
              </div>
              <span className="text-[11px] text-brand-textMuted mt-1 block">
                Managed in <code>~/.superagent/engines/sd-cpp/</code>
              </span>
            </div>
          </div>

          <div className="pt-2 border-t border-brand-border flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2">
              {updateInfo && (
                <button
                  onClick={handleUpdateEngine}
                  disabled={actionLoading === 'update'}
                  className="ui-btn-primary text-xs flex items-center gap-1.5"
                >
                  <RefreshCw size={13} className={actionLoading === 'update' ? 'animate-spin' : ''} />
                  Update Engine to {updateInfo.latest}
                </button>
              )}
              <button
                onClick={handleRollback}
                disabled={actionLoading === 'rollback'}
                className="ui-btn text-xs flex items-center gap-1.5"
                title="Rollback to previous binary backup"
              >
                <RotateCcw size={13} />
                Rollback
              </button>
              <button
                onClick={handleUninstall}
                disabled={actionLoading === 'uninstall'}
                className="ui-btn-ghost text-[color:var(--neon-destructive)] hover:bg-[color:var(--neon-destructive)]/10 text-xs flex items-center gap-1.5"
                title="Uninstall engine binary"
              >
                <Trash2 size={13} />
                Uninstall Engine
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Installed Models Section ────────────────────────────────────── */}
      <div className="space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-2">
            <h2 className="text-base font-semibold text-brand-textMain">Installed Image Models</h2>
            <span className="ui-chip bg-brand-popover text-brand-textMuted">
              {installedModels.length} installed
            </span>
          </div>

          <div className="flex items-center gap-2">
            <div className="ui-input flex items-center gap-2 w-48 sm:w-64 bg-brand-bg px-2.5 py-1">
              <Search size={13} className="text-brand-textMuted flex-shrink-0" />
              <input
                type="text"
                placeholder="Filter installed models…"
                value={searchInstalled}
                onChange={(e) => setSearchInstalled(e.target.value)}
                className="w-full border-none bg-transparent text-xs text-brand-textMain outline-none placeholder:text-brand-textMuted/50"
              />
              {searchInstalled && (
                <button onClick={() => setSearchInstalled('')} className="text-brand-textMuted hover:text-brand-textMain">
                  <X size={12} />
                </button>
              )}
            </div>

            <button
              onClick={() => setStoreOpen(true)}
              className="ui-btn-primary flex items-center gap-1.5 text-xs shadow-sm"
            >
              <Download size={13} />
              Add Model
            </button>
          </div>
        </div>

        {/* Empty State when no models are downloaded */}
        {installedModels.length === 0 ? (
          <div className="ui-card p-8 text-center space-y-3">
            <div className="w-12 h-12 rounded-xl bg-brand-hover flex items-center justify-center mx-auto text-brand-textMuted">
              <ImageIcon size={24} />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-brand-textMain">No local image models installed yet</h3>
              <p className="text-xs text-brand-textMuted max-w-sm mx-auto mt-1">
                Explore the catalog of GGUF and Safetensors models (such as SDXL, SD 1.5, or FLUX.1) or drop files directly into your models directory.
              </p>
            </div>
            <div className="flex items-center justify-center gap-2 pt-1">
              <button
                onClick={() => setStoreOpen(true)}
                className="ui-btn-primary inline-flex items-center gap-1.5 text-xs shadow-sm"
              >
                <Sparkles size={14} />
                Explore Model Catalog
              </button>
              <button
                onClick={handleOpenFolder}
                className="ui-btn inline-flex items-center gap-1.5 text-xs"
              >
                <FolderOpen size={14} />
                Open Models Folder
              </button>
            </div>
          </div>
        ) : (
          /* Grid of Installed Model Cards */
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {installedModels.map((m) => {
              const isPulling = m.is_downloading;
              return (
                <div key={m.id} className="ui-card p-4 space-y-3 border-brand-border">
                  <div className="flex items-start justify-between gap-2">
                    <div className="space-y-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-sm text-brand-textMain truncate">{m.name}</span>
                        <span className="ui-chip bg-brand-popover text-brand-textMuted text-[10px]">
                          {m.quantization}
                        </span>
                      </div>
                      <div className="text-[11px] text-brand-textMuted flex items-center gap-2.5 flex-wrap">
                        <span>Size: <strong className="text-brand-textMain">{fmtBytes(m.size_bytes)}</strong></span>
                        <span>VRAM: <strong className="text-brand-textMain">{(m.vram_required_mb / 1024).toFixed(0)} GB</strong></span>
                        <span>Steps: <strong className="text-brand-textMain">{m.default_steps}</strong></span>
                      </div>
                    </div>

                    <span className="ui-badge bg-[color:var(--neon-constructive)]/15 text-[color:var(--neon-constructive)] flex items-center gap-1 shrink-0">
                      <Check size={11} /> Ready
                    </span>
                  </div>

                  {m.local_path && (
                    <div className="font-mono text-[10px] text-brand-textMuted/70 truncate bg-brand-bg px-2 py-1 rounded border border-brand-border/40">
                      {m.filename}
                    </div>
                  )}

                  {/* Progress bar if updating / redownloading */}
                  {isPulling && (
                    <div className="space-y-1">
                      <div className="flex justify-between text-[11px] text-brand-textMuted">
                        <span>Updating model weights...</span>
                        <span className="font-mono">{Math.round((m.download_progress || 0) * 100)}%</span>
                      </div>
                      <div className="w-full h-1.5 bg-brand-hover rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full bg-[var(--brand-accent)] transition-all"
                          style={{ width: `${Math.round((m.download_progress || 0) * 100)}%` }}
                        />
                      </div>
                    </div>
                  )}

                  {/* Error display */}
                  {m.error && (
                    <div className="p-2 rounded-lg bg-[color:var(--neon-destructive)]/10 border border-[color:var(--neon-destructive)]/20 text-[11px] text-[color:var(--neon-destructive)] flex items-center gap-1.5">
                      <CircleAlert size={13} className="shrink-0" />
                      <span className="truncate">{m.error}</span>
                    </div>
                  )}

                  <div className="pt-2 border-t border-brand-border flex items-center justify-end">
                    <button
                      onClick={() => setDeleteConfirmModal(m.id)}
                      className="ui-btn-ghost text-[color:var(--neon-destructive)] hover:bg-[color:var(--neon-destructive)]/10 text-xs px-2.5 py-1 flex items-center gap-1"
                      title="Delete model from disk"
                    >
                      <Trash2 size={13} />
                      Delete
                    </button>
                  </div>
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
          <div className="ui-card flex flex-col h-full max-h-[88vh] w-full max-w-3xl overflow-hidden shadow-2xl border border-brand-border">
            {/* Store Header */}
            <div className="p-4 sm:p-5 border-b border-brand-border flex items-center justify-between gap-4">
              <div>
                <h3 className="text-lg font-semibold text-brand-textMain flex items-center gap-2">
                  <Sparkles size={18} className="text-[var(--brand-accent)]" />
                  Image Model Catalog
                </h3>
                <p className="text-xs text-brand-textMuted mt-0.5">
                  Browse and install GGUF-quantized and Safetensors diffusion models with hardware-adaptive sizing.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleOpenFolder}
                  className="ui-btn flex items-center gap-1.5 text-xs"
                  title="Open folder to drop local models"
                >
                  <FolderOpen size={13} />
                  Drop Files
                </button>
                <button
                  onClick={() => setStoreOpen(false)}
                  className="ui-btn-ghost p-1.5 text-brand-textMuted hover:text-brand-textMain rounded-lg"
                >
                  <X size={18} />
                </button>
              </div>
            </div>

            {/* Store Controls */}
            <div className="p-4 border-b border-brand-border bg-brand-card/50 flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap gap-1.5 text-xs">
                {[
                  { id: 'all', label: 'All' },
                  { id: 'sdxl', label: 'SDXL (High-Res)' },
                  { id: 'sd15', label: 'SD 1.5 & 2.1 (Fast)' },
                  { id: 'sd35', label: 'SD 3.5 (DiT)' },
                  { id: 'flux', label: 'FLUX.1 (Flow)' },
                ].map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => setStoreTagFilter(tab.id)}
                    className={`ui-chip transition-colors ${
                      storeTagFilter === tab.id
                        ? 'bg-[var(--brand-accent)] text-white font-medium'
                        : 'bg-brand-popover text-brand-textMuted hover:text-brand-textMain'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
                <div className="flex items-center gap-1.5 bg-brand-bg px-2.5 py-1 rounded-lg border border-brand-border text-xs">
                  <ArrowUpDown size={13} className="text-brand-textMuted flex-shrink-0" />
                  <select
                    value={storeSortBy}
                    onChange={(e) => setStoreSortBy(e.target.value as any)}
                    className="bg-transparent border-none text-xs text-brand-textMain outline-none cursor-pointer"
                  >
                    <option value="top-match">Top Match & Quality</option>
                    <option value="steps-asc">Fastest (Fewest Steps)</option>
                    <option value="download-asc">Download Size (Smallest First)</option>
                    <option value="vram-asc">VRAM (Lowest First)</option>
                  </select>
                </div>

                <div className="ui-input flex items-center gap-2 flex-1 sm:w-48 bg-brand-bg px-2.5 py-1">
                  <Search size={13} className="text-brand-textMuted flex-shrink-0" />
                  <input
                    type="text"
                    placeholder="Search models…"
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
                  title="Filter to models that fit your available GPU VRAM"
                >
                  Fits Hardware Only
                </button>
              </div>
            </div>

            {/* Store Model List */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {filteredStore.length === 0 ? (
                <div className="py-12 text-center text-xs text-brand-textMuted">
                  No image models match your search criteria.
                </div>
              ) : (
                filteredStore.map(({ model, isRecommended, modelSizeGB, hasEnoughDisk, isSupported, memoryWarning, fitLabel, fitColor }) => {
                  const isInstalled = model.is_downloaded;
                  const isPulling = model.is_downloading;

                  return (
                    <div
                      key={model.id}
                      className={`ui-card overflow-hidden p-3.5 border transition-all ${
                        isRecommended
                          ? 'border-[var(--brand-accent-border)] bg-[var(--brand-accent)]/[0.02]'
                          : 'border-brand-border'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1 space-y-1.5">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-semibold text-sm text-brand-textMain">{model.name}</span>
                            <span className="ui-chip bg-brand-popover text-brand-textMuted text-[10px]">
                              {model.quantization}
                            </span>
                            <span className="ui-chip bg-brand-popover text-brand-textMuted text-[10px]">
                              {fmtBytes(model.size_bytes)}
                            </span>

                            {/* Fit Badge */}
                            <span className={`ui-badge text-[10px] font-medium border ${fitColor}`}>
                              {fitLabel}
                            </span>

                            {/* Storage Warning Badge */}
                            {!hasEnoughDisk && (
                              <span className="ui-badge text-[10px] font-medium border text-[color:var(--neon-destructive)] bg-[color:var(--neon-destructive)]/15 border-[color:var(--neon-destructive)]/30 flex items-center gap-1">
                                <HardDrive size={10} />
                                Low Storage (~{fmtGB(modelSizeGB)} GB needed)
                              </span>
                            )}
                          </div>

                          <div className="text-xs text-brand-textMuted flex items-center gap-3 flex-wrap">
                            <span>VRAM Needed: <strong className="text-brand-textMain">{(model.vram_required_mb / 1024).toFixed(0)} GB</strong></span>
                            <span>Default Steps: <strong className="text-brand-textMain">{model.default_steps}</strong></span>
                            <span>Default CFG: <strong className="text-brand-textMain">{model.default_cfg}</strong></span>
                          </div>

                          {memoryWarning && isSupported && (
                            <div className="text-[11px] text-amber-400/90 flex items-center gap-1.5 pt-0.5">
                              <CircleAlert size={12} className="shrink-0" />
                              <span>{memoryWarning}</span>
                            </div>
                          )}
                        </div>

                        {/* Action buttons */}
                        <div className="flex items-center gap-2 shrink-0">
                          {isInstalled ? (
                            <span className="ui-badge bg-[color:var(--neon-constructive)]/15 text-[color:var(--neon-constructive)] flex items-center gap-1 text-xs">
                              <Check size={12} /> Installed
                            </span>
                          ) : (
                            <button
                              onClick={() => handlePullModel(model.id, modelSizeGB, isSupported, memoryWarning)}
                              disabled={isPulling || !hasEnoughDisk || !isSupported || actionLoading === `pull_${model.id}`}
                              className={`flex items-center gap-1.5 text-xs shadow-sm disabled:opacity-50 ${
                                !isSupported
                                  ? 'ui-btn-ghost text-brand-textMuted border border-brand-border cursor-not-allowed'
                                  : !hasEnoughDisk
                                  ? 'ui-btn-ghost text-[color:var(--neon-destructive)] border border-[color:var(--neon-destructive)]/30'
                                  : 'ui-btn-primary'
                              }`}
                              title={
                                !isSupported
                                  ? memoryWarning || 'Incompatible with current hardware architecture'
                                  : !hasEnoughDisk
                                  ? `Insufficient disk space: Needs ~${fmtGB(modelSizeGB)} GB, but only ${fmtGB(storageFreeGB || 0)} GB is free on ${storageMount}`
                                  : memoryWarning
                                  ? `Notice: ${memoryWarning}`
                                  : 'Install model'
                              }
                            >
                              <Download size={13} className={isPulling ? 'animate-bounce' : ''} />
                              <span>
                                {isPulling
                                  ? 'Downloading...'
                                  : !isSupported
                                  ? 'Incompatible'
                                  : !hasEnoughDisk
                                  ? 'Low Disk Space'
                                  : 'Install'}
                              </span>
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Download progress */}
                      {isPulling && (
                        <div className="border-t border-brand-border bg-brand-bg/40 px-3 py-2 mt-3 -mx-3.5 -mb-3.5">
                          <div className="h-1.5 w-full overflow-hidden rounded-full bg-brand-hover">
                            <div
                              className="h-full rounded-full bg-[var(--brand-accent)] transition-all"
                              style={{ width: `${Math.round((model.download_progress || 0) * 100)}%` }}
                            />
                          </div>
                          <div className="mt-1 flex justify-between text-[11px] text-brand-textMuted">
                            <span>Downloading weights from HuggingFace...</span>
                            <span className="font-mono">{Math.round((model.download_progress || 0) * 100)}%</span>
                          </div>
                        </div>
                      )}

                      {/* Error display */}
                      {model.error && (
                        <div className="mt-2.5 p-2 rounded-lg bg-[color:var(--neon-destructive)]/10 border border-[color:var(--neon-destructive)]/20 text-[11px] text-[color:var(--neon-destructive)] flex items-center gap-1.5">
                          <CircleAlert size={13} className="shrink-0" />
                          <span className="truncate">{model.error}</span>
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>

            {/* Store Footer tip */}
            <div className="p-3 border-t border-brand-border bg-brand-bg/40 text-[11px] text-brand-textMuted flex items-center justify-between gap-3">
              <div className="flex items-center gap-1.5">
                <Info size={13} className="text-[var(--brand-accent)] shrink-0" />
                <span>You can also drop any Civitai / Hugging Face <code>.gguf</code> or <code>.safetensors</code> file directly into your local models folder.</span>
              </div>
              <button
                onClick={handleOpenFolder}
                className="text-brand-textMain hover:underline font-medium shrink-0 cursor-pointer"
              >
                Open Folder
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Delete Confirmation Modal ────────────────────────────────────── */}
      {deleteConfirmModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-150">
          <div className="ui-card p-5 max-w-sm w-full space-y-4 shadow-2xl border border-brand-border">
            <div className="flex items-center gap-3 text-[color:var(--neon-destructive)]">
              <Trash2 size={20} />
              <h3 className="text-base font-semibold text-brand-textMain">Delete Image Model?</h3>
            </div>
            <p className="text-xs text-brand-textMuted">
              Are you sure you want to delete <code className="text-brand-textMain font-semibold">{deleteConfirmModal}</code> from your local storage? You can download it again at any time.
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setDeleteConfirmModal(null)}
                className="ui-btn text-xs"
              >
                Cancel
              </button>
              <button
                onClick={() => handleDeleteModel(deleteConfirmModal)}
                disabled={actionLoading === `del_${deleteConfirmModal}`}
                className="ui-btn-primary bg-[color:var(--neon-destructive)] hover:bg-[color:var(--neon-destructive)]/90 text-white text-xs flex items-center gap-1"
              >
                {actionLoading === `del_${deleteConfirmModal}` ? (
                  <RefreshCw size={13} className="animate-spin" />
                ) : (
                  <Trash2 size={13} />
                )}
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

export default LocalImageModelSettings;
