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
  Film,
  Activity,
  MemoryStick,
  Settings2,
  X,
  ChevronDown,
  ChevronUp,
  CircleAlert,
  Layers,
  Check,
  FolderOpen,
  Info,
  MonitorSmartphone,
  Video,
  Compass,
  Play,
} from 'lucide-react';
import { getIpc } from '../../lib/ipc';
import { SystemInfo, normalizeSystemInfo } from '../../logic/systemInfo';
import {
  getVideoEngineStatus,
  installVideoEngine,
  updateVideoEngine,
  rollbackVideoEngine,
  uninstallVideoEngine,
  checkVideoEngineUpdate,
  getVideoHardwareProfile,
  listVideoModels,
  pullVideoModel,
  deleteVideoModel,
  openVideoModelsDir,
  VideoEngineStatus,
  HardwareProfile,
  VideoModelInfo,
  VideoUpdateInfo,
  GpuBackend,
} from '../../services/videoService';
import { SettingsLoadingProgressBar } from '../../components/SettingsLoadingProgressBar';

interface LocalVideoModelSettingsProps {
  onToast?: (message: string) => void;
}

const fmtGB = (n: number): string => (n >= 10 ? Math.round(n).toString() : (Math.round(n * 10) / 10).toString());

const fmtBytes = (bytes: number): string => {
  if (!bytes || bytes <= 0) return '0 B';
  if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(1)} GB`;
  if (bytes >= 1e6) return `${(bytes / 1e6).toFixed(0)} MB`;
  return `${bytes} B`;
};

export const LocalVideoModelSettings: React.FC<LocalVideoModelSettingsProps> = ({ onToast }) => {
  const notify = (msg: string) => {
    if (onToast) onToast(msg);
  };

  // State
  const [systemInfo, setSystemInfo] = useState<SystemInfo | null>(null);
  const [engineStatus, setEngineStatus] = useState<VideoEngineStatus>({
    installed: false,
    is_running: false,
    is_downloading: false,
    ffmpeg_ready: false,
  });
  const [hardware, setHardware] = useState<HardwareProfile | null>(null);
  const [models, setModels] = useState<VideoModelInfo[]>([]);
  const [updateInfo, setUpdateInfo] = useState<VideoUpdateInfo | null>(null);

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
        getVideoEngineStatus(),
        getVideoHardwareProfile(),
        listVideoModels(),
        ipc?.invoke('system-info').catch(() => null),
      ]);
      setEngineStatus(status);
      setHardware(hw);
      setModels(modelList);
      if (sys) setSystemInfo(normalizeSystemInfo(sys));

      if (checkUpdate) {
        checkVideoEngineUpdate()
          .then((update) => setUpdateInfo(update))
          .catch(() => {});
      }
    } catch (err) {
      console.error('Failed to load video engine settings:', err);
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
        getVideoEngineStatus(),
        listVideoModels(),
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
      await installVideoEngine(backend);
      notify('Video engine installation initiated.');
      await refreshData();
    } catch (err: any) {
      notify(`Error installing video engine: ${err.message}`);
    } finally {
      setActionLoading(null);
    }
  };

  const handleUpdateEngine = async () => {
    setActionLoading('update');
    try {
      const update = await checkVideoEngineUpdate();
      if (update && update.latest && update.latest !== engineStatus.version) {
        await updateVideoEngine();
        notify(`Downloading and applying Video Engine update to v${update.latest}...`);
      } else {
        notify(`Video Engine is already up to date (${engineStatus.version ? `v${engineStatus.version}` : 'latest build'}).`);
      }
      await refreshData();
    } catch (err: any) {
      notify(`Update check failed: ${err.message}`);
    } finally {
      setActionLoading(null);
    }
  };


  const handleRollback = async () => {
    setActionLoading('rollback');
    try {
      await rollbackVideoEngine();
      notify('Successfully rolled back to previous video engine binary.');
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
      await uninstallVideoEngine();
      notify('Video engine uninstalled successfully.');
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
      notify(`This video model is incompatible with your system architecture.`);
      return;
    }
    if (storageFreeGB !== undefined && modelSizeGB !== undefined && storageFreeGB < modelSizeGB + 1.0) {
      notify(`Insufficient disk space: Video model requires ~${fmtGB(modelSizeGB)} GB, but only ${fmtGB(storageFreeGB)} GB is available on ${storageMount}.`);
      return;
    }
    if (memoryWarning) {
      notify(`Memory note: ${memoryWarning}`);
    }
    setActionLoading(`pull_${modelId}`);
    try {
      await pullVideoModel(modelId);
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
      await deleteVideoModel(modelId);
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
      await openVideoModelsDir();
      notify('Opened video models folder in file explorer.');
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
      const hasEnoughDisk = storageFreeGB !== undefined ? storageFreeGB >= modelSizeGB + 1.0 : true;

      let fitLabel = 'Fits GPU (Optimal Match)';
      let fitColor = 'text-[color:var(--neon-constructive)] bg-[color:var(--neon-constructive)]/15 border-[color:var(--neon-constructive)]/25';
      let isSupported = true;
      let memoryWarning: string | undefined;

      if (model.family === 'hunyuan_video') {
        if (isIntelMac) {
          fitLabel = 'Incompatible with Intel Mac CPU/iGPU';
          fitColor = 'text-[color:var(--neon-destructive)] bg-[color:var(--neon-destructive)]/15 border-[color:var(--neon-destructive)]/30';
          isSupported = false;
          memoryWarning = 'HunyuanVideo requires Apple Silicon or ≥ 16 GB NVIDIA CUDA GPU.';
        } else if (totalRamGB < 32 && (!hardware?.vram_mb || hardware.vram_mb < 16384)) {
          fitLabel = 'Heavy Model (Requires ≥ 16 GB VRAM)';
          fitColor = 'text-amber-400 bg-amber-500/15 border-amber-500/25';
          memoryWarning = `HunyuanVideo requires ~16 GB VRAM. System has ${fmtGB(effectiveVram / 1024)} GB effective VRAM.`;
        } else if (isRecommended) {
          fitLabel = 'Recommended Cinema-Quality Match';
          fitColor = 'text-[color:var(--neon-constructive)] bg-[color:var(--neon-constructive)]/20 border-[color:var(--neon-constructive)]/40 font-semibold';
        }
      } else if (model.family === 'wan2_1') {
        if (model.id.includes('14b') && (!hardware?.vram_mb || hardware.vram_mb < 12288) && !isAppleSilicon) {
          fitLabel = 'High VRAM (Needs ≥ 12 GB)';
          fitColor = 'text-amber-400 bg-amber-500/15 border-amber-500/25';
          memoryWarning = 'Wan 2.1 14B requires ~12 GB VRAM for full GPU offloading.';
        } else if (isRecommended) {
          fitLabel = 'Recommended for your Hardware';
          fitColor = 'text-[color:var(--neon-constructive)] bg-[color:var(--neon-constructive)]/20 border-[color:var(--neon-constructive)]/40 font-semibold';
        } else if (fitsGpu) {
          fitLabel = 'Runs on GPU (Fast & SOTA)';
          fitColor = 'text-[color:var(--neon-constructive)] bg-[color:var(--neon-constructive)]/15 border-[color:var(--neon-constructive)]/25';
        } else {
          fitLabel = 'Offloads to System RAM';
          fitColor = 'text-amber-400 bg-amber-500/15 border-amber-500/25';
        }
      } else if (model.family === 'ltx_video') {
        if (isRecommended) {
          fitLabel = 'Recommended (Real-time 24 FPS)';
          fitColor = 'text-[color:var(--neon-constructive)] bg-[color:var(--neon-constructive)]/20 border-[color:var(--neon-constructive)]/40 font-semibold';
        } else if (fitsGpu) {
          fitLabel = 'Runs on GPU / High Speed';
          fitColor = 'text-[color:var(--neon-constructive)] bg-[color:var(--neon-constructive)]/15 border-[color:var(--neon-constructive)]/25';
        } else {
          fitLabel = 'Offloads to System RAM';
          fitColor = 'text-amber-400 bg-amber-500/15 border-amber-500/25';
        }
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
        if (storeTagFilter === 'animatediff') return model.family === 'animate_diff';
        if (storeTagFilter === 'wan') return model.family === 'wan2_1';
        if (storeTagFilter === 'ltx') return model.family === 'ltx_video';
        if (storeTagFilter === 'cog') return model.family === 'cog_video_x';
        if (storeTagFilter === 'svd') return model.family === 'stable_video_diffusion';
        if (storeTagFilter === 'hunyuan') return model.family === 'hunyuan_video';
        if (storeTagFilter === 'i2v') return model.modality === 'image_to_video' || model.modality === 'both';
        if (storeTagFilter === 't2v') return model.modality === 'text_to_video' || model.modality === 'both';
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
            <Film size={24} className="text-[var(--brand-accent)]" />
            Local Video Model
          </h1>
          <p className="mt-1 text-sm text-brand-textMuted sm:text-base">
            Generate high-resolution video clips, camera trajectories, and keyframe animations 100% locally on your GPU.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setStoreOpen(true)}
            disabled={isLoading}
            className="ui-btn-primary flex items-center gap-1.5 shadow-sm disabled:opacity-50"
          >
            <Sparkles size={15} />
            Explore & Download Video Models
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
          title={isRefreshing ? 'Refreshing Local Video Engine...' : 'Loading Video Engine & Hardware Budget...'}
          description="Scanning diffusion.cpp binaries, video DiT weights, VRAM allocation, and CUDA/Metal acceleration..."
          isRefreshing={isRefreshing}
          iconType="image"
        />
      ) : (
        <>
          {/* ── Status Banner (Installation State) ────────────────────────── */}
          {!engineStatus.installed ? (
            <div className="ui-card p-6 border-l-4 border-l-[color:var(--neon-attention)] bg-brand-card/90">
              <div className="flex items-start gap-4">
                <CircleAlert size={24} className="text-[color:var(--neon-attention)] flex-shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <h2 className="text-base font-semibold text-brand-textMain">
                    Video generation engine is not initialized on this system
                  </h2>
                  <p className="mt-1 text-xs sm:text-sm text-brand-textMuted">
                    SuperAgent utilizes a hardware-accelerated C++ Diffusion Transformer (DiT) inference engine with FFmpeg integration. Zero external Python servers or proprietary clouds required.
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
                          : `Install Video Engine (${hardware?.recommended_backend.toUpperCase() || 'Auto'})`}
                      </span>
                    </button>

                    <span className="text-xs text-brand-textMuted">
                      Hardware-optimized binary with temporal attention kernels.
                    </span>
                  </div>

                  {/* Downloading Progress Bar */}
                  {engineStatus.is_downloading && (
                    <div className="space-y-1.5 pt-3 max-w-md">
                      <div className="flex justify-between text-[11px] text-brand-textMuted">
                        <span>Downloading standalone video engine binary...</span>
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
                    Video Engine is Ready
                    {engineStatus.version && (
                      <span className="ui-chip bg-brand-popover text-brand-textMuted">
                        v{engineStatus.version}
                      </span>
                    )}
                    <span className="ui-badge bg-[color:var(--neon-constructive)]/15 text-[color:var(--neon-constructive)]">
                      {engineStatus.backend ? engineStatus.backend.toUpperCase() : 'GPU'} Acceleration
                    </span>
                    {hardware?.ffmpeg_installed && (
                      <span className="ui-badge bg-blue-950/80 text-blue-400 border border-blue-800/60">
                        FFmpeg Subsystem Ready
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-brand-textMuted mt-0.5">
                    Host: <code className="text-brand-textMain">localhost:1469</code> · {installedModels.length} model{installedModels.length !== 1 ? 's' : ''} installed
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
                <span className="ui-label font-semibold text-brand-textMain">Hardware & Video Diffusion Budget</span>
              </div>
              {hardware?.gpu_name && (
                <span className="ui-badge bg-[color:var(--neon-constructive)]/15 text-[color:var(--neon-constructive)] font-medium">
                  Accelerated Video Pipeline
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
                  (hardware?.vram_mb && hardware.vram_mb >= 14336) || ((hardware?.total_ram_mb || 0) >= 32768 && hardware?.arch === 'aarch64')
                    ? 'High VRAM (Full 14B / Hunyuan)'
                    : (hardware?.vram_mb && hardware.vram_mb >= 8192)
                    ? 'Medium VRAM (LTX / Wan 1.3B)'
                    : (hardware?.vram_mb && hardware.vram_mb >= 6144)
                    ? '6 GB VRAM (Wan 1.3B / CogVideo)'
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
                value={hardware?.recommended_model_id ? hardware.recommended_model_id.toUpperCase() : 'WAN 2.1 1.3B'}
                sub="Auto-matched for your hardware"
              />
            </div>

            {/* FFmpeg Status & AI Accelerator */}
            <div className="mt-3.5 flex flex-wrap items-center justify-between gap-2 pt-3 border-t border-brand-border text-xs text-brand-textMuted">
              <div className="flex items-center gap-2">
                <Video size={14} className="text-[var(--brand-accent)]" />
                <span>
                  FFmpeg Status:{' '}
                  <strong className={hardware?.ffmpeg_installed ? 'text-[color:var(--neon-constructive)]' : 'text-amber-400'}>
                    {hardware?.ffmpeg_installed ? `Installed (${hardware.ffmpeg_version?.split(' ')[2] || 'System'})` : 'Not Found'}
                  </strong>
                </span>
              </div>
              {(hardware?.npu_detected || systemInfo?.npuTpu?.detected) && (
                <div className="flex items-center gap-1.5">
                  <MonitorSmartphone size={14} className="text-[var(--brand-accent)]" />
                  <span>
                    NPU:{' '}
                    <strong className="text-brand-textMain">
                      {hardware?.npu_label || systemInfo?.npuTpu?.label || 'AI Boost'}
                    </strong>
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* ── Collapsible Engine Settings ─────────────────────────────────── */}
          {settingsOpen && (
            <div className="ui-card p-5 border-[var(--brand-accent-border)] bg-brand-card space-y-4">
              <div className="flex items-center justify-between border-b border-brand-border pb-3">
                <div className="flex items-center gap-2">
                  <Sliders size={16} className="text-[var(--brand-accent)]" />
                  <h2 className="text-sm font-semibold text-brand-textMain">Video Engine Parameters & Lifecycle</h2>
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
                    {engineStatus.binary_path || 'Managed in ~/.superagent/bin/video_engine/'}
                  </div>
                  <span className="text-[11px] text-brand-textMuted mt-1 block">
                    Pre-configured standalone binary runner.
                  </span>
                </div>
              </div>

              <div className="flex items-center justify-between pt-3 border-t border-brand-border flex-wrap gap-2">
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleUpdateEngine}
                    disabled={actionLoading === 'update'}
                    className="ui-btn text-xs flex items-center gap-1"
                  >
                    <RefreshCw size={13} className={actionLoading === 'update' ? 'animate-spin' : ''} />
                    Check / Update Engine
                  </button>
                  <button
                    onClick={handleRollback}
                    disabled={actionLoading === 'rollback'}
                    className="ui-btn text-xs flex items-center gap-1"
                  >
                    <RotateCcw size={13} />
                    Rollback
                  </button>
                </div>
                <button
                  onClick={handleUninstall}
                  disabled={actionLoading === 'uninstall'}
                  className="ui-btn text-xs text-[color:var(--neon-destructive)] hover:bg-[color:var(--neon-destructive)]/10"
                >
                  Uninstall Video Engine
                </button>
              </div>
            </div>
          )}

          {/* ── Installed Video Models ─────────────────────────────────────── */}
          <div className="space-y-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <Layers size={16} className="text-[var(--brand-accent)]" />
                <h2 className="text-sm font-semibold text-brand-textMain">
                  Installed Video Models ({installedModels.length})
                </h2>
              </div>
              <div className="flex items-center gap-2">
                <div className="relative">
                  <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-brand-textMuted" />
                  <input
                    type="text"
                    value={searchInstalled}
                    onChange={(e) => setSearchInstalled(e.target.value)}
                    placeholder="Filter installed..."
                    className="ui-input text-xs pl-8 pr-3 py-1 w-44 sm:w-56"
                  />
                </div>
                <button
                  onClick={() => setStoreOpen(true)}
                  className="ui-btn-primary text-xs flex items-center gap-1 shadow-sm"
                >
                  <Download size={13} />
                  Add Video Model
                </button>
              </div>
            </div>

            {installedModels.length === 0 ? (
              <div className="ui-card p-8 text-center border-dashed">
                <Film size={32} className="mx-auto text-brand-textMuted mb-2 opacity-50" />
                <h3 className="text-sm font-medium text-brand-textMain">No video models installed yet</h3>
                <p className="text-xs text-brand-textMuted mt-1 max-w-sm mx-auto">
                  Download a curated video diffusion model to start synthesizing video clips locally on your GPU.
                </p>
                <button
                  onClick={() => setStoreOpen(true)}
                  className="ui-btn-primary text-xs mt-4 inline-flex items-center gap-1.5"
                >
                  <Sparkles size={14} />
                  Explore Curated Models
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {installedModels.map((model) => {
                  const isDeleting = actionLoading === `del_${model.id}`;
                  const isRecommended = hardware?.recommended_model_id === model.id;

                  return (
                    <div
                      key={model.id}
                      className={`ui-card p-4 relative group flex flex-col justify-between transition-all hover:border-brand-border-strong ${
                        isRecommended ? 'border-[var(--brand-accent-border)] ring-1 ring-[var(--brand-accent)]/20' : ''
                      }`}
                    >
                      <div>
                        <div className="flex items-start justify-between gap-2 mb-2">
                          <div>
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <h3 className="text-xs font-bold text-brand-textMain">{model.name}</h3>
                              {isRecommended && (
                                <span className="ui-badge bg-[color:var(--neon-constructive)]/15 text-[color:var(--neon-constructive)] text-[10px]">
                                  Best Match
                                </span>
                              )}
                            </div>
                            <span className="text-[11px] text-brand-textMuted mt-0.5 block">
                              {model.modality.toUpperCase()} · {model.quantization} · {model.default_fps} FPS ({model.default_frames}f)
                            </span>
                          </div>
                        </div>

                        <div className="space-y-1 my-3 text-xs text-brand-textMuted">
                          <div className="flex justify-between">
                            <span>VRAM Requirement</span>
                            <span className="font-mono text-brand-textMain">{Math.round(model.vram_required_mb / 1024)} GB</span>
                          </div>
                          <div className="flex justify-between">
                            <span>Size on Disk</span>
                            <span className="font-mono text-brand-textMain">{fmtBytes(model.size_bytes)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span>Default Steps</span>
                            <span className="font-mono text-brand-textMain">{model.default_steps} steps</span>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center justify-between pt-2.5 border-t border-brand-border/60">
                        <div className="flex items-center gap-1 text-[11px] text-[color:var(--neon-constructive)] font-medium">
                          <CheckCircle2 size={13} />
                          <span>{model.companion_model_ids && model.companion_model_ids.length > 0 ? (model.is_bundle_ready ? 'Bundle Ready' : 'Ready') : 'Downloaded'}</span>
                        </div>
                        <button
                          onClick={() => setDeleteConfirmModal(model.id)}
                          disabled={isDeleting}
                          className="ui-btn-ghost text-xs text-[color:var(--neon-destructive)] p-1.5 hover:bg-[color:var(--neon-destructive)]/10"
                          title="Delete model weights"
                        >
                          <Trash2 size={13} />
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

      {/* ── Explore & Download Model Store Modal ─────────────────────────── */}
      {storeOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm animate-in fade-in">
          <div className="w-full max-w-4xl max-h-[90vh] bg-brand-bg border border-brand-border rounded-2xl shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95">
            {/* Modal Header */}
            <div className="flex items-center justify-between p-4 border-b border-brand-border bg-brand-card">
              <div className="flex items-center gap-2">
                <Sparkles size={18} className="text-[var(--brand-accent)]" />
                <div>
                  <h2 className="text-sm font-bold text-brand-textMain">Curated Video Model Catalog</h2>
                  <p className="text-xs text-brand-textMuted">
                    Optimized GGUF/Diffusers quantization weights verified for consumer GPUs
                  </p>
                </div>
              </div>
              <button
                onClick={() => setStoreOpen(false)}
                className="ui-btn-ghost p-1.5 text-brand-textMuted hover:text-brand-textMain"
              >
                <X size={16} />
              </button>
            </div>

            {/* Filters Bar */}
            <div className="p-3 border-b border-brand-border bg-brand-bg flex flex-wrap items-center justify-between gap-2.5 text-xs">
              <div className="flex items-center gap-1 flex-wrap">
                {[
                  { id: 'all', label: 'All Models' },
                  { id: 'animatediff', label: 'AnimateDiff' },
                  { id: 'wan', label: 'Wan 2.1' },
                  { id: 'ltx', label: 'LTX-Video' },
                  { id: 'cog', label: 'CogVideoX' },
                  { id: 'svd', label: 'SVD' },
                  { id: 'hunyuan', label: 'HunyuanVideo' },
                  { id: 'i2v', label: 'Image-to-Video' },
                ].map((tag) => (

                  <button
                    key={tag.id}
                    onClick={() => setStoreTagFilter(tag.id)}
                    className={`px-2.5 py-1 rounded-lg border transition-all ${
                      storeTagFilter === tag.id
                        ? 'bg-brand-card border-[var(--brand-accent)] text-brand-textMain font-semibold shadow-sm'
                        : 'bg-transparent border-transparent text-brand-textMuted hover:text-brand-textMain'
                    }`}
                  >
                    {tag.label}
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-2">
                <label className="flex items-center gap-1.5 cursor-pointer text-brand-textMuted hover:text-brand-textMain">
                  <input
                    type="checkbox"
                    checked={storeRunnableOnly}
                    onChange={(e) => setStoreRunnableOnly(e.target.checked)}
                    className="rounded bg-brand-bg border-brand-border text-[var(--brand-accent)]"
                  />
                  <span>Runs on your GPU</span>
                </label>
                <div className="relative">
                  <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-brand-textMuted" />
                  <input
                    type="text"
                    value={storeSearch}
                    onChange={(e) => setStoreSearch(e.target.value)}
                    placeholder="Search models..."
                    className="ui-input text-xs pl-8 pr-3 py-1 w-40"
                  />
                </div>
              </div>
            </div>

            {/* Catalog Grid */}
            <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                {filteredStore.map(({ model, isRecommended, fitsGpu, modelSizeGB, hasEnoughDisk, isSupported, memoryWarning, fitLabel, fitColor }) => {
                  const isDownloading = model.is_downloading;
                  const isDownloaded = model.is_downloaded;

                  return (
                    <div
                      key={model.id}
                      className={`ui-card p-4 flex flex-col justify-between transition-all ${
                        isDownloaded ? 'bg-brand-card/90 border-brand-border' : 'bg-brand-card/50 border-brand-border/70 hover:border-brand-border-strong'
                      }`}
                    >
                      <div>
                        {/* Title & Badge */}
                        <div className="flex items-start justify-between gap-2 mb-2">
                          <div>
                            <h3 className="text-xs font-bold text-brand-textMain">{model.name}</h3>
                            <span className="text-[11px] text-brand-textMuted block mt-0.5">
                              {model.modality.toUpperCase()} · {model.quantization} · {model.default_fps} FPS ({model.default_frames} frames)
                            </span>
                          </div>
                          <span className="font-mono text-xs text-brand-textMain px-2 py-0.5 bg-brand-bg border border-brand-border rounded">
                            {fmtBytes(model.size_bytes)}
                          </span>
                        </div>

                        {/* Fit Badge */}
                        <div className={`text-[11px] px-2 py-1 rounded-lg border my-2 inline-flex items-center gap-1.5 ${fitColor}`}>
                          <Sparkles size={12} />
                          <span>{fitLabel}</span>
                        </div>

                        {/* Specs */}
                        <div className="grid grid-cols-2 gap-2 text-[11px] text-brand-textMuted my-2">
                          <div>VRAM Required: <strong className="text-brand-textMain">{Math.round(model.vram_required_mb / 1024)} GB</strong></div>
                          <div>Inference Steps: <strong className="text-brand-textMain">{model.default_steps}</strong></div>
                        </div>

                        {/* Progress Bar */}
                        {isDownloading && (
                          <div className="space-y-1 my-2">
                            <div className="flex justify-between text-[10px] text-brand-textMuted">
                              <span>Downloading weights...</span>
                              <span className="font-mono">{Math.round((model.download_progress || 0) * 100)}%</span>
                            </div>
                            <div className="w-full h-1.5 bg-brand-hover rounded-full overflow-hidden">
                              <div
                                className="h-full rounded-full bg-[var(--brand-accent)] transition-all duration-300"
                                style={{ width: `${Math.round((model.download_progress || 0) * 100)}%` }}
                              />
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Action */}
                      <div className="pt-3 border-t border-brand-border/60 flex items-center justify-between mt-2">
                        <span className="text-[11px] text-brand-textMuted">
                          {isDownloaded ? 'Ready in studio' : hasEnoughDisk ? 'Direct download' : 'Low disk space'}
                        </span>

                        {isDownloaded ? (
                          <div className="flex items-center gap-1 text-xs font-semibold text-[color:var(--neon-constructive)]">
                            <CheckCircle2 size={14} />
                            <span>Downloaded</span>
                          </div>
                        ) : (
                          <button
                            onClick={() => handlePullModel(model.id, modelSizeGB, isSupported, memoryWarning)}
                            disabled={isDownloading || !isSupported}
                            className="ui-btn-primary text-xs flex items-center gap-1 px-3 py-1.5 disabled:opacity-50"
                          >
                            <Download size={13} />
                            <span>{isDownloading ? 'Downloading...' : 'Download Model'}</span>
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Delete Confirmation Modal ────────────────────────────────────── */}
      {deleteConfirmModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm animate-in fade-in">
          <div className="w-full max-w-md bg-brand-bg border border-brand-border rounded-2xl p-5 shadow-2xl space-y-4">
            <h3 className="text-sm font-bold text-brand-textMain">Confirm Model Deletion</h3>
            <p className="text-xs text-brand-textMuted leading-relaxed">
              Are you sure you want to delete <strong className="text-brand-textMain">{deleteConfirmModal}</strong> from your local storage? You will need to re-download the weights to use it again.
            </p>
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                onClick={() => setDeleteConfirmModal(null)}
                className="ui-btn text-xs"
              >
                Cancel
              </button>
              <button
                onClick={() => handleDeleteModel(deleteConfirmModal)}
                className="ui-btn text-xs text-[color:var(--neon-destructive)] bg-[color:var(--neon-destructive)]/10 hover:bg-[color:var(--neon-destructive)]/20"
              >
                Delete Weights
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

interface StatCardProps {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub: string;
}

const StatCard: React.FC<StatCardProps> = ({ icon, label, value, sub }) => (
  <div className="ui-card p-3 bg-brand-bg/60 border-brand-border flex flex-col justify-between">
    <div className="flex items-center gap-1.5 text-brand-textMuted text-[11px] mb-1">
      {icon}
      <span>{label}</span>
    </div>
    <div className="text-xs font-bold text-brand-textMain truncate">{value}</div>
    <div className="text-[10px] text-brand-textMuted mt-1 truncate">{sub}</div>
  </div>
);
