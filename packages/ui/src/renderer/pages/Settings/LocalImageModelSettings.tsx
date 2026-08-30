import React, { useState, useEffect, useCallback } from 'react';
import {
  Cpu,
  Download,
  Trash2,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  HardDrive,
  Sparkles,
  Zap,
  RotateCcw,
  Search,
  ExternalLink,
  Sliders,
  Image as ImageIcon,
} from 'lucide-react';
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
  EngineStatus,
  HardwareProfile,
  ImageModelInfo,
  UpdateInfo,
  GpuBackend,
} from '../../services/imageService';

interface LocalImageModelSettingsProps {
  onToast?: (message: string) => void;
}

export const LocalImageModelSettings: React.FC<LocalImageModelSettingsProps> = ({ onToast }) => {
  const notify = (msg: string) => {
    if (onToast) onToast(msg);
  };

  const [engineStatus, setEngineStatus] = useState<EngineStatus>({
    installed: false,
    is_running: false,
    is_downloading: false,
  });
  const [hardware, setHardware] = useState<HardwareProfile | null>(null);
  const [models, setModels] = useState<ImageModelInfo[]>([]);
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedBackend, setSelectedBackend] = useState<GpuBackend | 'auto'>('auto');
  const [filterTab, setFilterTab] = useState<'all' | 'downloaded' | 'available'>('all');

  const refreshData = useCallback(async () => {
    try {
      const [status, hw, modelList, update] = await Promise.all([
        getEngineStatus(),
        getHardwareProfile(),
        listImageModels(),
        checkEngineUpdate(),
      ]);
      setEngineStatus(status);
      setHardware(hw);
      setModels(modelList);
      setUpdateInfo(update);
    } catch (err) {
      console.error('Failed to load image engine settings:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshData();
    // Poll status while downloading engine or model
    const interval = setInterval(() => {
      refreshData();
    }, 2500);
    return () => clearInterval(interval);
  }, [refreshData]);

  const handleInstallEngine = async () => {
    setActionLoading('install');
    try {
      const backend = selectedBackend === 'auto' ? undefined : selectedBackend;
      await installEngine(backend);
      notify('Engine setup initiated. Downloading binary from upstream stable-diffusion.cpp...');
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
      notify('Rolled back to previous engine version.');
      await refreshData();
    } catch (err: any) {
      notify(`Rollback failed: ${err.message}`);
    } finally {
      setActionLoading(null);
    }
  };

  const handleUninstall = async () => {
    if (!window.confirm('Are you sure you want to uninstall the local image engine binary? Your downloaded models will be kept.')) {
      return;
    }
    setActionLoading('uninstall');
    try {
      await uninstallEngine();
      notify('Engine uninstalled.');
      await refreshData();
    } catch (err: any) {
      notify(`Uninstall failed: ${err.message}`);
    } finally {
      setActionLoading(null);
    }
  };

  const handlePullModel = async (modelId: string) => {
    setActionLoading(`pull_${modelId}`);
    try {
      await pullImageModel(modelId);
      notify(`Download started for model ${modelId}. Check progress below.`);
      await refreshData();
    } catch (err: any) {
      notify(`Failed to start download: ${err.message}`);
    } finally {
      setActionLoading(null);
    }
  };

  const handleDeleteModel = async (modelId: string) => {
    if (!window.confirm(`Delete model ${modelId}? This will remove the file from your disk.`)) {
      return;
    }
    setActionLoading(`del_${modelId}`);
    try {
      await deleteImageModel(modelId);
      notify(`Model ${modelId} deleted.`);
      await refreshData();
    } catch (err: any) {
      notify(`Failed to delete model: ${err.message}`);
    } finally {
      setActionLoading(null);
    }
  };

  const filteredModels = models.filter((m) => {
    const matchesSearch =
      m.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      m.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
      m.quantization.toLowerCase().includes(searchQuery.toLowerCase());

    if (!matchesSearch) return false;
    if (filterTab === 'downloaded') return m.is_downloaded;
    if (filterTab === 'available') return !m.is_downloaded;
    return true;
  });

  const formatBytes = (bytes: number) => {
    if (!bytes) return '0 B';
    const gb = bytes / (1024 * 1024 * 1024);
    if (gb >= 1) return `${gb.toFixed(1)} GB`;
    const mb = bytes / (1024 * 1024);
    return `${mb.toFixed(0)} MB`;
  };

  return (
    <div className="space-y-6 pb-12 max-w-5xl">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-xl bg-purple-500/10 text-purple-400 border border-purple-500/20">
            <ImageIcon size={22} />
          </div>
          <div>
            <h1 className="text-xl font-bold text-brand-textMain">Local Image Model</h1>
            <p className="text-xs text-brand-textMuted mt-0.5">
              High-performance local image generation powered by <code className="text-purple-400 font-mono">stable-diffusion.cpp</code> and GGUF quantization. Zero Python required.
            </p>
          </div>
        </div>
      </div>

      {/* Hardware Profile Banner */}
      {hardware && (
        <div className="p-4 rounded-xl bg-brand-surface/60 border border-brand-border/40 backdrop-blur-sm">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-blue-500/10 text-blue-400 border border-blue-500/20">
                <Cpu size={18} />
              </div>
              <div>
                <div className="text-xs font-semibold text-brand-textMain flex items-center gap-2">
                  <span>Detected Hardware:</span>
                  <span className="font-mono text-blue-400">
                    {hardware.gpu_name || 'Generic GPU / CPU'}
                  </span>
                </div>
                <div className="text-[11px] text-brand-textMuted mt-0.5 flex items-center gap-3 flex-wrap">
                  <span>OS: <strong className="text-brand-textMain capitalize">{hardware.os}</strong> ({hardware.arch})</span>
                  {hardware.vram_mb && (
                    <span>VRAM: <strong className="text-brand-textMain">{(hardware.vram_mb / 1024).toFixed(1)} GB</strong></span>
                  )}
                  <span>RAM: <strong className="text-brand-textMain">{(hardware.total_ram_mb / 1024).toFixed(1)} GB</strong></span>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[11px] px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-medium">
                Backend: {hardware.recommended_backend.toUpperCase()}
              </span>
              <span className="text-[11px] px-2.5 py-1 rounded-full bg-purple-500/10 text-purple-400 border border-purple-500/20 font-medium">
                Recommended: {hardware.recommended_model_id}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Engine Status & Management Card */}
      <div className="p-5 rounded-xl bg-brand-surface border border-brand-border/60 shadow-sm space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-2.5">
            <div
              className={`w-2.5 h-2.5 rounded-full ${
                engineStatus.installed ? 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.6)]' : 'bg-amber-400'
              }`}
            />
            <div>
              <h2 className="text-sm font-semibold text-brand-textMain">
                Local Engine: {engineStatus.installed ? 'Ready' : 'Not Installed'}
              </h2>
              <p className="text-[11px] text-brand-textMuted">
                {engineStatus.installed
                  ? `Engine installed: ${engineStatus.version || 'upstream'} (${engineStatus.backend?.toUpperCase() || 'GPU'})`
                  : 'Download the standalone sd-cli binary to enable native local image synthesis.'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {engineStatus.installed ? (
              <>
                {updateInfo && (
                  <button
                    onClick={handleUpdateEngine}
                    disabled={!!actionLoading}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium transition-all shadow-sm cursor-pointer"
                  >
                    <RefreshCw size={13} className={actionLoading === 'update' ? 'animate-spin' : ''} />
                    <span>Update to {updateInfo.latest}</span>
                  </button>
                )}
                <button
                  onClick={handleRollback}
                  disabled={!!actionLoading}
                  className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-brand-surface hover:bg-white/5 text-brand-textMuted hover:text-brand-textMain text-xs border border-brand-border/60 transition-all cursor-pointer"
                  title="Rollback to previous binary backup"
                >
                  <RotateCcw size={12} />
                  <span>Rollback</span>
                </button>
                <button
                  onClick={handleUninstall}
                  disabled={!!actionLoading}
                  className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 text-xs border border-rose-500/30 transition-all cursor-pointer"
                  title="Uninstall engine binary"
                >
                  <Trash2 size={12} />
                  <span>Uninstall</span>
                </button>
              </>
            ) : (
              <button
                onClick={handleInstallEngine}
                disabled={!!actionLoading || engineStatus.is_downloading}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-purple-600 hover:bg-purple-500 text-white text-xs font-semibold transition-all shadow-md cursor-pointer disabled:opacity-50"
              >
                <Download size={14} className={engineStatus.is_downloading ? 'animate-bounce' : ''} />
                <span>{engineStatus.is_downloading ? 'Downloading Engine...' : 'Install Image Engine'}</span>
              </button>
            )}
          </div>
        </div>

        {/* Downloading Progress Bar */}
        {engineStatus.is_downloading && (
          <div className="space-y-1.5 pt-2">
            <div className="flex justify-between text-[11px] text-brand-textMuted">
              <span>Downloading stable-diffusion.cpp binary...</span>
              <span>{Math.round((engineStatus.download_progress || 0) * 100)}%</span>
            </div>
            <div className="w-full h-1.5 bg-brand-surface rounded-full overflow-hidden border border-brand-border/40">
              <div
                className="h-full bg-purple-500 transition-all duration-300 rounded-full"
                style={{ width: `${Math.round((engineStatus.download_progress || 0) * 100)}%` }}
              />
            </div>
          </div>
        )}

        {/* Engine Error Alert */}
        {engineStatus.error && !engineStatus.is_downloading && (
          <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/30 flex items-start gap-2.5 text-xs text-rose-300">
            <AlertCircle size={15} className="text-rose-400 shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="font-semibold text-rose-200">Engine installation failed</p>
              <p className="text-[11px] text-rose-300/80 mt-0.5">{engineStatus.error}</p>
            </div>
            <button
              onClick={handleInstallEngine}
              className="px-2.5 py-1 rounded bg-rose-500/20 hover:bg-rose-500/30 text-rose-200 font-medium text-[11px] transition-all cursor-pointer"
            >
              Retry
            </button>
          </div>
        )}

        {/* Engine Backend Selection Details */}
        <div className="pt-2 border-t border-brand-border/40 flex items-center justify-between text-[11px] text-brand-textMuted flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <Sliders size={13} className="text-brand-textMuted" />
            <span>Target Acceleration Backend:</span>
            <select
              value={selectedBackend}
              onChange={(e) => setSelectedBackend(e.target.value as any)}
              className="bg-brand-surface border border-brand-border/60 rounded px-2 py-0.5 text-xs text-brand-textMain cursor-pointer focus:outline-none focus:border-purple-500"
            >
              <option value="auto">Auto-detect ({hardware?.recommended_backend.toUpperCase() || 'GPU'})</option>
              <option value="cuda">NVIDIA CUDA (Fastest on GeForce/RTX)</option>
              <option value="vulkan">Vulkan (AMD / Intel Arc / NVIDIA Cross-GPU)</option>
              <option value="metal">Apple Silicon Metal</option>
              <option value="cpu">CPU AVX2 (No GPU required)</option>
            </select>
          </div>

          {engineStatus.binary_path && (
            <div className="font-mono text-[10px] text-brand-textMuted/70 truncate max-w-md" title={engineStatus.binary_path}>
              Path: {engineStatus.binary_path}
            </div>
          )}
        </div>
      </div>

      {/* Model Catalog & Downloads Section */}
      <div className="space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h2 className="text-base font-bold text-brand-textMain flex items-center gap-2">
              <span>Image Models (GGUF Quantized)</span>
              <span className="text-xs px-2 py-0.5 rounded-full bg-purple-500/10 text-purple-400 border border-purple-500/20 font-medium">
                {models.filter((m) => m.is_downloaded).length} installed
              </span>
            </h2>
            <p className="text-xs text-brand-textMuted mt-0.5">
              Click to download pre-quantized weights. Models are saved locally to <code className="font-mono text-purple-400">~/.superagent/models/images</code>.
            </p>
          </div>

          {/* Controls: Search & Tabs */}
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-brand-textMuted" />
              <input
                type="text"
                placeholder="Search models..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-8 pr-3 py-1.5 text-xs bg-brand-surface border border-brand-border/60 rounded-lg text-brand-textMain focus:outline-none focus:border-purple-500 w-40 sm:w-52"
              />
            </div>

            <div className="flex p-0.5 rounded-lg bg-brand-surface border border-brand-border/60 text-xs">
              <button
                onClick={() => setFilterTab('all')}
                className={`px-2.5 py-1 rounded-md transition-all cursor-pointer ${
                  filterTab === 'all' ? 'bg-white/10 text-brand-textMain font-medium' : 'text-brand-textMuted'
                }`}
              >
                All
              </button>
              <button
                onClick={() => setFilterTab('downloaded')}
                className={`px-2.5 py-1 rounded-md transition-all cursor-pointer ${
                  filterTab === 'downloaded' ? 'bg-white/10 text-brand-textMain font-medium' : 'text-brand-textMuted'
                }`}
              >
                Installed
              </button>
              <button
                onClick={() => setFilterTab('available')}
                className={`px-2.5 py-1 rounded-md transition-all cursor-pointer ${
                  filterTab === 'available' ? 'bg-white/10 text-brand-textMain font-medium' : 'text-brand-textMuted'
                }`}
              >
                Available
              </button>
            </div>
          </div>
        </div>

        {/* Model Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filteredModels.map((model) => {
            const isRec = hardware?.recommended_model_id === model.id;
            return (
              <div
                key={model.id}
                className={`p-4 rounded-xl border transition-all flex flex-col justify-between ${
                  model.is_downloaded
                    ? 'bg-brand-surface/80 border-purple-500/30 hover:border-purple-500/50 shadow-sm'
                    : 'bg-brand-surface/40 border-brand-border/50 hover:border-brand-border'
                }`}
              >
                <div className="space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="text-sm font-semibold text-brand-textMain">{model.name}</h3>
                        {isRec && (
                          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 flex items-center gap-1">
                            <Zap size={10} />
                            Best Match
                          </span>
                        )}
                        <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-white/5 text-purple-400 border border-purple-500/20">
                          {model.quantization}
                        </span>
                      </div>
                      <div className="text-[11px] text-brand-textMuted mt-1 flex items-center gap-3">
                        <span>Size: <strong className="text-brand-textMain">{formatBytes(model.size_bytes)}</strong></span>
                        <span>Min VRAM: <strong className="text-brand-textMain">{(model.vram_required_mb / 1024).toFixed(0)} GB</strong></span>
                        <span>Steps: <strong className="text-brand-textMain">{model.default_steps}</strong></span>
                      </div>
                    </div>

                    {model.is_downloaded ? (
                      <span className="flex items-center gap-1 text-[11px] font-medium text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
                        <CheckCircle2 size={12} />
                        Ready
                      </span>
                    ) : null}
                  </div>
                </div>

                {/* Progress bar if downloading */}
                {model.is_downloading && (
                  <div className="space-y-1 pt-3">
                    <div className="flex justify-between text-[10px] text-purple-400 font-mono">
                      <span>Downloading model weights...</span>
                      <span>{Math.round((model.download_progress || 0) * 100)}%</span>
                    </div>
                    <div className="w-full h-1.5 bg-brand-surface rounded-full overflow-hidden border border-brand-border/40">
                      <div
                        className="h-full bg-purple-500 transition-all duration-200"
                        style={{ width: `${Math.round((model.download_progress || 0) * 100)}%` }}
                      />
                    </div>
                  </div>
                )}

                {/* Action button */}
                <div className="pt-3 mt-3 border-t border-brand-border/30 flex items-center justify-between">
                  <div className="text-[10px] text-brand-textMuted font-mono truncate max-w-[200px]" title={model.filename}>
                    {model.filename}
                  </div>

                  <div className="flex items-center gap-2">
                    {model.is_downloaded ? (
                      <button
                        onClick={() => handleDeleteModel(model.id)}
                        disabled={actionLoading === `del_${model.id}`}
                        className="flex items-center gap-1 text-xs text-rose-400 hover:text-rose-300 px-2.5 py-1 rounded bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/20 transition-all cursor-pointer"
                      >
                        <Trash2 size={12} />
                        <span>Delete</span>
                      </button>
                    ) : (
                      <button
                        onClick={() => handlePullModel(model.id)}
                        disabled={model.is_downloading || actionLoading === `pull_${model.id}`}
                        className="flex items-center gap-1.5 text-xs text-white bg-purple-600 hover:bg-purple-500 px-3 py-1.5 rounded-lg shadow-sm font-medium transition-all cursor-pointer disabled:opacity-50"
                      >
                        <Download size={13} className={model.is_downloading ? 'animate-bounce' : ''} />
                        <span>{model.is_downloading ? 'Downloading...' : 'Download Model'}</span>
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {filteredModels.length === 0 && (
          <div className="p-8 text-center rounded-xl bg-brand-surface/40 border border-brand-border/40 text-brand-textMuted text-xs">
            No image models match your search query.
          </div>
        )}
      </div>
    </div>
  );
};
