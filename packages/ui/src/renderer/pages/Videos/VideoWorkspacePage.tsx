import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Sparkles,
  ArrowLeft,
  Settings,
  RefreshCw,
  Cpu,
  Film,
  Layers,
} from 'lucide-react';
import {
  generateVideoStream,
  listVideoGenerations,
  deleteVideoGeneration,
  getVideoHardwareProfile,
  getVideoEngineStatus,
  GenerateVideoRequest,
  VideoGenerationRecord,
  VideoProgressEvent,
  HardwareProfile,
  VideoEngineStatus,
  CameraMotionPreset,
} from '../../services/videoService';
import {
  AspectRatioOption,
  AttachedReferenceMedia,
  AdvancedVideoSettingsState,
} from './types';
import { VideoComposer } from './components/VideoComposer';
import { VideoModelSelect } from './components/VideoModelSelect';
import { VideoCanvasStage } from './components/VideoCanvasStage';
import { VideoGalleryFilmstrip } from './components/VideoGalleryFilmstrip';
import { VideoAttachmentShelf } from './components/VideoAttachmentShelf';
import { VideoAdvancedSettingsDrawer } from './components/VideoAdvancedSettingsDrawer';
import { VideoExportModal } from './components/VideoExportModal';

export interface VideoWorkspacePageProps {
  onBack?: () => void;
  onOpenSettings?: () => void;
  triggerToast?: (message: string) => void;
}

export const VIDEO_ASPECT_RATIOS: AspectRatioOption[] = [
  { label: 'Landscape (16:9)', width: 720, height: 480 },
  { label: 'Portrait (9:16)', width: 480, height: 720 },
  { label: 'Square (1:1)', width: 512, height: 512 },
  { label: 'Classic (4:3)', width: 640, height: 480 },
];

export const VideoWorkspacePage: React.FC<VideoWorkspacePageProps> = ({
  onBack,
  onOpenSettings,
  triggerToast,
}) => {
  const notify = (msg: string) => {
    if (triggerToast) triggerToast(msg);
  };

  // ── Generation State ──
  const [prompt, setPrompt] = useState('');
  const [selectedModel, setSelectedModel] = useState<string>('');
  const [aspectRatio, setAspectRatio] = useState<AspectRatioOption>(VIDEO_ASPECT_RATIOS[0]);
  const [cameraMotion, setCameraMotion] = useState<CameraMotionPreset>('Static');
  const [isGenerating, setIsGenerating] = useState(false);
  const [progressEvent, setProgressEvent] = useState<VideoProgressEvent | null>(null);

  // ── Attachments (Keyframes) ──
  const [firstFrame, setFirstFrame] = useState<AttachedReferenceMedia | null>(null);
  const [lastFrame, setLastFrame] = useState<AttachedReferenceMedia | null>(null);
  const [motionScale, setMotionScale] = useState(0.8);
  const [isShelfOpen, setIsShelfOpen] = useState(false);

  // ── Advanced Settings ──
  const [isAdvancedOpen, setIsAdvancedOpen] = useState(false);
  const [advancedSettings, setAdvancedSettings] = useState<AdvancedVideoSettingsState>({
    numFrames: 81,
    fps: 16,
    steps: 30,
    cfgScale: 6.0,
    seed: Math.floor(Math.random() * 100000),
    isRandomSeed: true,
    motionScale: 0.8,
    interpolate2x: false,
    negativePrompt: 'blurry, distorted, artifacts, static, jittery, low quality',
  });

  // ── History & Active Record ──
  const [generations, setGenerations] = useState<VideoGenerationRecord[]>([]);
  const [currentRecord, setCurrentRecord] = useState<VideoGenerationRecord | null>(null);
  const [isExportOpen, setIsExportOpen] = useState(false);

  // ── Hardware & Engine Status ──
  const [hardware, setHardware] = useState<HardwareProfile | null>(null);
  const [engineStatus, setEngineStatus] = useState<VideoEngineStatus | null>(null);

  const abortControllerRef = useRef<AbortController | null>(null);

  const fetchGenerations = async () => {
    try {
      const list = await listVideoGenerations();
      setGenerations(list);
      if (list.length > 0 && !currentRecord) {
        setCurrentRecord(list[0]);
      }
    } catch (err) {
      console.error('Failed to load video generations:', err);
    }
  };

  const fetchStatus = async () => {
    try {
      const [hw, status] = await Promise.all([
        getVideoHardwareProfile(),
        getVideoEngineStatus(),
      ]);
      setHardware(hw);
      setEngineStatus(status);
    } catch (err) {
      console.error('Failed to load video system status:', err);
    }
  };

  useEffect(() => {
    fetchGenerations();
    fetchStatus();
  }, []);

  const handleGenerate = async () => {
    if (!prompt.trim() || isGenerating) return;

    setIsGenerating(true);
    setProgressEvent(null);
    abortControllerRef.current = new AbortController();

    const seed = advancedSettings.isRandomSeed
      ? Math.floor(Math.random() * 2147483647)
      : advancedSettings.seed;

    const req: GenerateVideoRequest = {
      prompt: prompt.trim(),
      negative_prompt: advancedSettings.negativePrompt || undefined,
      model_id: selectedModel || undefined,
      mode: 'local',
      width: aspectRatio.width,
      height: aspectRatio.height,
      num_frames: advancedSettings.numFrames,
      fps: advancedSettings.fps,
      steps: advancedSettings.steps,
      cfg_scale: advancedSettings.cfgScale,
      seed,
      motion_scale: motionScale,
      camera_motion: cameraMotion !== 'Static' ? cameraMotion : undefined,
      init_image: firstFrame?.dataUrl,
      last_image: lastFrame?.dataUrl,
      interpolate_2x: advancedSettings.interpolate2x,
    };

    try {
      const resp = await generateVideoStream(
        req,
        (prog) => setProgressEvent(prog),
        abortControllerRef.current.signal
      );

      notify('Video generated successfully!');
      await fetchGenerations();

      const newRecord: VideoGenerationRecord = {
        id: resp.id,
        created_at: resp.created_at,
        prompt: resp.prompt,
        negative_prompt: resp.negative_prompt,
        model_id: resp.model_id,
        source: resp.source,
        width: resp.width,
        height: resp.height,
        num_frames: resp.num_frames,
        fps: resp.fps,
        duration_seconds: resp.duration_seconds,
        steps: resp.steps,
        cfg_scale: resp.cfg_scale,
        seed: resp.seed,
        generation_time_ms: resp.generation_time_ms,
        video_filename: `${resp.id}.mp4`,
        thumbnail_filename: `${resp.id}.jpg`,
      };

      setCurrentRecord(newRecord);
    } catch (err: any) {
      if (err.message && !err.message.includes('canceled')) {
        notify(`Generation error: ${err.message}`);
      }
    } finally {
      setIsGenerating(false);
      setProgressEvent(null);
      abortControllerRef.current = null;
    }
  };

  const handleDeleteGeneration = async (id: string) => {
    try {
      await deleteVideoGeneration(id);
      notify('Deleted generation.');
      const updated = generations.filter((g) => g.id !== id);
      setGenerations(updated);
      if (currentRecord?.id === id) {
        setCurrentRecord(updated[0] || null);
      }
    } catch (err: any) {
      notify(`Delete failed: ${err.message}`);
    }
  };

  const handleReusePrompt = (record: VideoGenerationRecord) => {
    setPrompt(record.prompt);
    if (record.model_id) setSelectedModel(record.model_id);
    if (record.negative_prompt) {
      setAdvancedSettings((prev) => ({ ...prev, negativePrompt: record.negative_prompt || '' }));
    }
    notify('Loaded prompt & parameters into composer.');
  };

  return (
    <div className="flex flex-col h-full w-full bg-neutral-950 text-neutral-100 overflow-hidden select-none relative">
      {/* ── Top Header Navigation Bar ── */}
      <header className="flex items-center justify-between px-4 py-2.5 bg-neutral-900/90 border-b border-neutral-800/80 backdrop-blur-xl z-30">
        <div className="flex items-center gap-3">
          {onBack && (
            <button
              type="button"
              onClick={onBack}
              className="p-1.5 rounded-xl hover:bg-neutral-800 text-neutral-400 hover:text-neutral-200 transition-colors cursor-pointer"
              title="Back"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
          )}

          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-tr from-violet-600 to-indigo-600 flex items-center justify-center shadow-md shadow-violet-950/50">
              <Film className="w-4 h-4 text-white" />
            </div>
            <h1 className="text-sm font-semibold text-neutral-100 hidden sm:inline">
              Video Studio
            </h1>
          </div>

          <div className="h-4 w-px bg-neutral-800 mx-1 hidden sm:block" />

          {/* Model Selector Dropdown */}
          <VideoModelSelect
            selectedModelId={selectedModel}
            onSelectModel={setSelectedModel}
            triggerToast={triggerToast}
          />
        </div>

        {/* Right Tools: Hardware Badge, Settings */}
        <div className="flex items-center gap-2">
          {hardware && (
            <div
              className="hidden md:flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-neutral-800/60 border border-neutral-700/40 text-[11px] text-neutral-400"
              title={`${hardware.gpu_name || 'CPU Backend'} (${hardware.vram_mb ? Math.round(hardware.vram_mb / 1024) + ' GB VRAM' : 'System RAM'})`}
            >
              <Cpu className="w-3.5 h-3.5 text-violet-400" />
              <span className="font-medium text-neutral-300">
                {hardware.gpu_name ? hardware.gpu_name.split(' ')[0] : 'CPU'}
              </span>
              {hardware.vram_mb && (
                <span className="text-[10px] text-neutral-500">
                  {Math.round(hardware.vram_mb / 1024)}GB
                </span>
              )}
            </div>
          )}

          {onOpenSettings && (
            <button
              type="button"
              onClick={onOpenSettings}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-neutral-800/60 hover:bg-neutral-800 border border-neutral-700/40 text-neutral-300 hover:text-white text-xs font-medium transition-colors cursor-pointer"
              title="Open Local Video Model Settings"
            >
              <Settings className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Engine Settings</span>
            </button>
          )}
        </div>
      </header>

      {/* ── Main Canvas Stage ── */}
      <main className="flex-1 flex flex-col min-h-0 relative">
        <VideoCanvasStage
          currentRecord={currentRecord}
          isGenerating={isGenerating}
          progressEvent={progressEvent}
          onOpenExportModal={() => setIsExportOpen(true)}
          triggerToast={triggerToast}
        />

        {/* Drawer: Advanced Settings */}
        <VideoAdvancedSettingsDrawer
          isOpen={isAdvancedOpen}
          onClose={() => setIsAdvancedOpen(false)}
          settings={advancedSettings}
          onChangeSettings={setAdvancedSettings}
        />
      </main>

      {/* ── Bottom Composer & Shelf Area ── */}
      <footer className="w-full max-w-4xl mx-auto px-4 pb-3 z-20">
        {isShelfOpen && (
          <VideoAttachmentShelf
            firstFrame={firstFrame}
            lastFrame={lastFrame}
            onChangeFirstFrame={setFirstFrame}
            onChangeLastFrame={setLastFrame}
            motionScale={motionScale}
            onChangeMotionScale={setMotionScale}
            onClose={() => setIsShelfOpen(false)}
          />
        )}

        <VideoComposer
          prompt={prompt}
          onChangePrompt={setPrompt}
          onGenerate={handleGenerate}
          isGenerating={isGenerating}
          aspectRatio={aspectRatio}
          onChangeAspectRatio={setAspectRatio}
          availableAspectRatios={VIDEO_ASPECT_RATIOS}
          cameraMotion={cameraMotion}
          onChangeCameraMotion={setCameraMotion}
          onToggleAdvanced={() => setIsAdvancedOpen(!isAdvancedOpen)}
          hasReferenceMedia={Boolean(firstFrame || lastFrame)}
          onToggleShelf={() => setIsShelfOpen(!isShelfOpen)}
        />
      </footer>

      {/* ── Filmstrip History ── */}
      <VideoGalleryFilmstrip
        generations={generations}
        selectedId={currentRecord?.id || null}
        onSelectGeneration={setCurrentRecord}
        onDeleteGeneration={handleDeleteGeneration}
        onReusePrompt={handleReusePrompt}
      />

      {/* ── Video Export Modal ── */}
      <VideoExportModal
        isOpen={isExportOpen}
        onClose={() => setIsExportOpen(false)}
        record={currentRecord}
        triggerToast={triggerToast}
      />
    </div>
  );
};
