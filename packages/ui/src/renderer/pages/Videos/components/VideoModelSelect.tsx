import React, { useState, useEffect, useRef } from 'react';
import {
  ChevronDown,
  Download,
  Check,
  HardDrive,
  FolderOpen,
  Cpu,
  Sparkles,
  Layers,
  Film,
} from 'lucide-react';
import {
  VideoModelInfo,
  listVideoModels,
  pullVideoModel,
  openVideoModelsDir,
} from '../../../services/videoService';

export interface VideoModelSelectProps {
  selectedModelId: string;
  onSelectModel: (modelId: string) => void;
  triggerToast?: (message: string) => void;
}

export const VideoModelSelect: React.FC<VideoModelSelectProps> = ({
  selectedModelId,
  onSelectModel,
  triggerToast,
}) => {
  const [models, setModels] = useState<VideoModelInfo[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isPulling, setIsPulling] = useState<string | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const fetchModels = async () => {
    try {
      const list = await listVideoModels();
      setModels(list);
      if (list.length > 0 && !selectedModelId) {
        // Default to first downloaded model or default model
        const downloaded = list.find((m) => m.is_downloaded);
        onSelectModel(downloaded ? downloaded.id : list[0].id);
      }
    } catch (err) {
      console.error('Failed to load video models:', err);
    }
  };

  useEffect(() => {
    fetchModels();
    const interval = setInterval(fetchModels, 3000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handlePullModel = async (e: React.MouseEvent, modelId: string) => {
    e.stopPropagation();
    setIsPulling(modelId);
    try {
      await pullVideoModel(modelId);
      if (triggerToast) triggerToast(`Downloading model weights for ${modelId}...`);
      await fetchModels();
    } catch (err: any) {
      if (triggerToast) triggerToast(`Download failed: ${err.message}`);
    } finally {
      setIsPulling(null);
    }
  };

  const handleOpenDir = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await openVideoModelsDir();
    } catch (err) {
      console.error('Failed to open models directory:', err);
    }
  };

  const selectedModel = models.find((m) => m.id === selectedModelId) || models[0];

  const getModalityBadge = (modality: string) => {
    switch (modality) {
      case 'image_to_video':
        return <span className="px-1.5 py-0.5 text-[10px] font-semibold bg-emerald-950/80 text-emerald-400 border border-emerald-800/60 rounded">I2V</span>;
      case 'both':
        return <span className="px-1.5 py-0.5 text-[10px] font-semibold bg-purple-950/80 text-purple-400 border border-purple-800/60 rounded">T2V/I2V</span>;
      default:
        return <span className="px-1.5 py-0.5 text-[10px] font-semibold bg-blue-950/80 text-blue-400 border border-blue-800/60 rounded">T2V</span>;
    }
  };

  return (
    <div className="relative inline-block text-left" ref={dropdownRef}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-3 py-1.5 bg-neutral-900/80 hover:bg-neutral-800/90 border border-neutral-800 hover:border-neutral-700 rounded-xl text-xs text-neutral-200 transition-all cursor-pointer shadow-sm"
      >
        <Film className="w-3.5 h-3.5 text-violet-400" />
        <div className="flex items-center gap-1.5 font-medium">
          <span>{selectedModel ? selectedModel.name : 'Select Video Model'}</span>
          {selectedModel && getModalityBadge(selectedModel.modality)}
        </div>
        <ChevronDown className={`w-3.5 h-3.5 text-neutral-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <div className="absolute left-0 mt-1.5 w-84 bg-neutral-900 border border-neutral-800 rounded-2xl shadow-2xl p-2 z-50 backdrop-blur-xl animate-in fade-in zoom-in-95 duration-100">
          <div className="flex items-center justify-between px-2 py-1.5 border-b border-neutral-800/80 mb-1">
            <span className="text-[11px] font-semibold text-neutral-400 uppercase tracking-wider">
              Curated Video Models
            </span>
            <button
              type="button"
              onClick={handleOpenDir}
              className="flex items-center gap-1 text-[11px] text-neutral-400 hover:text-neutral-200 transition-colors"
              title="Open models folder in file explorer"
            >
              <FolderOpen className="w-3 h-3" />
              <span>Models Folder</span>
            </button>
          </div>

          <div className="flex flex-col gap-1 max-h-72 overflow-y-auto custom-scrollbar">
            {models.map((model) => {
              const isSelected = model.id === selectedModelId;
              const isDownloading = model.is_downloading || isPulling === model.id;

              return (
                <div
                  key={model.id}
                  onClick={() => {
                    onSelectModel(model.id);
                    setIsOpen(false);
                  }}
                  className={`flex items-start justify-between p-2 rounded-xl text-xs transition-all cursor-pointer ${
                    isSelected
                      ? 'bg-neutral-800/90 border border-violet-600/50 text-white'
                      : 'hover:bg-neutral-800/50 text-neutral-300 border border-transparent'
                  }`}
                >
                  <div className="flex flex-col gap-1 pr-2">
                    <div className="flex items-center gap-1.5">
                      <span className="font-semibold">{model.name}</span>
                      {getModalityBadge(model.modality)}
                    </div>
                    <div className="flex items-center gap-2 text-[10px] text-neutral-400">
                      <span className="flex items-center gap-1">
                        <Cpu className="w-3 h-3 text-neutral-500" />
                        {Math.round(model.vram_required_mb / 1024)}GB VRAM
                      </span>
                      <span>•</span>
                      <span>{model.quantization}</span>
                      <span>•</span>
                      <span>{model.default_fps} FPS ({model.default_frames}f)</span>
                    </div>

                    {isDownloading && (
                      <div className="w-full bg-neutral-800 rounded-full h-1.5 mt-1 overflow-hidden">
                        <div
                          className="bg-violet-500 h-1.5 rounded-full transition-all duration-300"
                          style={{ width: `${Math.round((model.download_progress || 0) * 100)}%` }}
                        />
                      </div>
                    )}
                  </div>

                  <div className="flex items-center self-center pl-1">
                    {model.is_downloaded ? (
                      <span className="p-1 rounded-full bg-emerald-950/60 text-emerald-400" title="Downloaded and ready">
                        <Check className="w-3.5 h-3.5" />
                      </span>
                    ) : isDownloading ? (
                      <span className="text-[10px] text-violet-400 font-mono">
                        {Math.round((model.download_progress || 0) * 100)}%
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={(e) => handlePullModel(e, model.id)}
                        className="flex items-center gap-1 px-2 py-1 bg-neutral-800 hover:bg-neutral-700 text-neutral-200 rounded-lg text-[10px] font-medium transition-all"
                        title="Download model weights"
                      >
                        <Download className="w-3 h-3" />
                        <span>Get</span>
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
