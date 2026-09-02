import React, { useState, useEffect, useCallback } from 'react';
import {
  Cpu,
  Download,
  Trash2,
  RefreshCw,
  CheckCircle2,
  HardDrive,
  Sparkles,
  Zap,
  FolderOpen,
  Film,
  Layers,
  AlertCircle,
  Video,
} from 'lucide-react';
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

interface LocalVideoModelSettingsProps {
  onToast?: (message: string) => void;
}

export const LocalVideoModelSettings: React.FC<LocalVideoModelSettingsProps> = ({ onToast }) => {
  const notify = (msg: string) => {
    if (onToast) onToast(msg);
  };

  const [hardware, setHardware] = useState<HardwareProfile | null>(null);
  const [engineStatus, setEngineStatus] = useState<VideoEngineStatus>({
    installed: false,
    is_running: false,
    is_downloading: false,
    ffmpeg_ready: false,
  });
  const [models, setModels] = useState<VideoModelInfo[]>([]);
  const [updateInfo, setUpdateInfo] = useState<VideoUpdateInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const [hw, status, modelList, update] = await Promise.all([
        getVideoHardwareProfile(),
        getVideoEngineStatus(),
        listVideoModels(),
        checkVideoEngineUpdate(),
      ]);
      setHardware(hw);
      setEngineStatus(status);
      setModels(modelList);
      setUpdateInfo(update);
    } catch (err) {
      console.error('Failed to load video settings:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 3000);
    return () => clearInterval(interval);
  }, [fetchData]);

  const handleInstallEngine = async (backend?: GpuBackend) => {
    setActionLoading('install_engine');
    try {
      await installVideoEngine(backend);
      notify('Video engine installed successfully.');
      await fetchData();
    } catch (err: any) {
      notify(`Install failed: ${err.message}`);
    } finally {
      setActionLoading(null);
    }
  };

  const handleUninstallEngine = async () => {
    setActionLoading('uninstall_engine');
    try {
      await uninstallVideoEngine();
      notify('Video engine uninstalled.');
      await fetchData();
    } catch (err: any) {
      notify(`Uninstall failed: ${err.message}`);
    } finally {
      setActionLoading(null);
    }
  };

  const handlePullModel = async (modelId: string) => {
    setActionLoading(`pull_${modelId}`);
    try {
      await pullVideoModel(modelId);
      notify(`Downloading weights for ${modelId}...`);
      await fetchData();
    } catch (err: any) {
      notify(`Download error: ${err.message}`);
    } finally {
      setActionLoading(null);
    }
  };

  const handleDeleteModel = async (modelId: string) => {
    setActionLoading(`delete_${modelId}`);
    try {
      await deleteVideoModel(modelId);
      notify(`Model ${modelId} deleted.`);
      await fetchData();
    } catch (err: any) {
      notify(`Delete error: ${err.message}`);
    } finally {
      setActionLoading(null);
    }
  };

  const handleOpenFolder = async () => {
    try {
      await openVideoModelsDir();
    } catch (err) {
      console.error('Failed to open video models folder:', err);
    }
  };

  return (
    <div className="flex flex-col gap-6 max-w-4xl mx-auto p-6 text-neutral-100 animate-in fade-in">
      {/* ── Title & Intro ── */}
      <div className="flex items-center justify-between pb-4 border-b border-neutral-800">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-2xl bg-gradient-to-tr from-violet-600 to-indigo-600 shadow-lg shadow-violet-950/40">
            <Film className="w-6 h-6 text-white" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-white">Local Video Generation Engine</h2>
            <p className="text-xs text-neutral-400">
              Hardware-accelerated Text-to-Video and Image-to-Video diffusion pipeline with FFmpeg support
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={handleOpenFolder}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 rounded-xl text-xs font-medium transition-colors cursor-pointer"
        >
          <FolderOpen className="w-4 h-4 text-neutral-300" />
          <span>Open Models Folder</span>
        </button>
      </div>

      {/* ── Hardware Profile Card ── */}
      <div className="p-5 bg-neutral-900/80 border border-neutral-800 rounded-2xl">
        <h3 className="text-xs font-semibold text-neutral-300 uppercase tracking-wider mb-4 flex items-center gap-2">
          <Cpu className="w-4 h-4 text-violet-400" />
          <span>Hardware & GPU Acceleration</span>
        </h3>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="p-3 bg-neutral-950/80 border border-neutral-800 rounded-xl">
            <span className="text-[11px] text-neutral-500 block mb-1">Detected GPU</span>
            <span className="text-xs font-semibold text-neutral-200 truncate block">
              {hardware?.gpu_name || 'CPU (No discrete GPU)'}
            </span>
          </div>

          <div className="p-3 bg-neutral-950/80 border border-neutral-800 rounded-xl">
            <span className="text-[11px] text-neutral-500 block mb-1">VRAM Available</span>
            <span className="text-xs font-semibold text-neutral-200 block font-mono">
              {hardware?.vram_mb ? `${Math.round(hardware.vram_mb / 1024)} GB VRAM` : 'Shared RAM'}
            </span>
          </div>

          <div className="p-3 bg-neutral-950/80 border border-neutral-800 rounded-xl">
            <span className="text-[11px] text-neutral-500 block mb-1">Recommended Backend</span>
            <span className="text-xs font-semibold text-violet-400 uppercase block">
              {hardware?.recommended_backend || 'CPU'}
            </span>
          </div>

          <div className="p-3 bg-neutral-950/80 border border-neutral-800 rounded-xl">
            <span className="text-[11px] text-neutral-500 block mb-1">FFmpeg Subsystem</span>
            <span
              className={`text-xs font-semibold block flex items-center gap-1 ${
                hardware?.ffmpeg_installed ? 'text-emerald-400' : 'text-amber-400'
              }`}
            >
              {hardware?.ffmpeg_installed ? (
                <>
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Ready ({hardware.ffmpeg_version?.split(' ')[2] || 'System'})</span>
                </>
              ) : (
                <>
                  <AlertCircle className="w-3.5 h-3.5" />
                  <span>Not Found in PATH</span>
                </>
              )}
            </span>
          </div>
        </div>
      </div>

      {/* ── Video Engine Status Card ── */}
      <div className="p-5 bg-neutral-900/80 border border-neutral-800 rounded-2xl flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div
              className={`p-2 rounded-xl ${
                engineStatus.installed ? 'bg-emerald-950/80 text-emerald-400' : 'bg-neutral-800 text-neutral-400'
              }`}
            >
              <Zap className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-semibold text-white">Video Inference Engine</h3>
                <span
                  className={`px-2 py-0.5 text-[10px] font-semibold rounded-full border ${
                    engineStatus.installed
                      ? 'bg-emerald-950/60 border-emerald-800/80 text-emerald-400'
                      : 'bg-neutral-800 border-neutral-700 text-neutral-400'
                  }`}
                >
                  {engineStatus.installed ? `v${engineStatus.version || '0.9.2'} Installed` : 'Not Installed'}
                </span>
              </div>
              <p className="text-xs text-neutral-400 mt-0.5">
                Local binary managing video diffusion latents and temporal attention kernels
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {engineStatus.installed ? (
              <button
                type="button"
                onClick={handleUninstallEngine}
                disabled={actionLoading === 'uninstall_engine'}
                className="px-3 py-1.5 bg-neutral-800 hover:bg-rose-950 hover:text-rose-300 border border-neutral-700 text-neutral-300 text-xs font-medium rounded-xl transition-all cursor-pointer"
              >
                Uninstall
              </button>
            ) : (
              <button
                type="button"
                onClick={() => handleInstallEngine()}
                disabled={actionLoading === 'install_engine'}
                className="flex items-center gap-1.5 px-4 py-2 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white text-xs font-semibold rounded-xl shadow-lg transition-all cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Install Video Engine</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ── Curated Video Model Catalog ── */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-semibold text-neutral-300 uppercase tracking-wider flex items-center gap-2">
            <Layers className="w-4 h-4 text-violet-400" />
            <span>Curated Video Models ({models.length})</span>
          </h3>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {models.map((model) => {
            const isDownloading = model.is_downloading;
            const isDeleting = actionLoading === `delete_${model.id}`;

            return (
              <div
                key={model.id}
                className={`p-4 rounded-2xl border transition-all flex flex-col justify-between ${
                  model.is_downloaded
                    ? 'bg-neutral-900/90 border-neutral-700/80 shadow-md'
                    : 'bg-neutral-900/40 border-neutral-800'
                }`}
              >
                <div>
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div>
                      <h4 className="text-xs font-bold text-white flex items-center gap-1.5">
                        <span>{model.name}</span>
                      </h4>
                      <span className="text-[10px] text-neutral-400 block mt-0.5">
                        {model.modality.toUpperCase()} • {model.quantization} • {model.default_fps} FPS ({model.default_frames} frames)
                      </span>
                    </div>

                    <span className="px-2 py-0.5 bg-neutral-800 border border-neutral-700/60 rounded-md text-[10px] font-mono text-neutral-300">
                      {(model.size_bytes / 1e9).toFixed(1)} GB
                    </span>
                  </div>

                  <div className="flex items-center gap-3 text-[11px] text-neutral-400 mb-3">
                    <span className="flex items-center gap-1">
                      <Cpu className="w-3.5 h-3.5 text-neutral-500" />
                      Min {Math.round(model.vram_required_mb / 1024)}GB VRAM
                    </span>
                  </div>

                  {isDownloading && (
                    <div className="w-full bg-neutral-800 rounded-full h-1.5 mb-3 overflow-hidden">
                      <div
                        className="bg-violet-500 h-1.5 rounded-full transition-all duration-300"
                        style={{ width: `${Math.round((model.download_progress || 0) * 100)}%` }}
                      />
                    </div>
                  )}
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-neutral-800/60">
                  <div className="flex items-center gap-1.5">
                    {model.is_downloaded ? (
                      <span className="flex items-center gap-1 text-[11px] font-medium text-emerald-400">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>Ready</span>
                      </span>
                    ) : (
                      <span className="text-[11px] text-neutral-500">Not Downloaded</span>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    {model.is_downloaded ? (
                      <button
                        type="button"
                        onClick={() => handleDeleteModel(model.id)}
                        disabled={isDeleting}
                        className="p-1.5 rounded-lg text-neutral-400 hover:text-rose-400 hover:bg-neutral-800 transition-colors"
                        title="Delete model weights"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => handlePullModel(model.id)}
                        disabled={isDownloading}
                        className="flex items-center gap-1.5 px-3 py-1 bg-neutral-800 hover:bg-neutral-700 text-neutral-200 text-xs font-medium rounded-xl transition-all cursor-pointer"
                      >
                        <Download className="w-3.5 h-3.5" />
                        <span>Download</span>
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
