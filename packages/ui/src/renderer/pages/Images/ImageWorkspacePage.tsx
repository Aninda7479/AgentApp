import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Sparkles,
  ArrowLeft,
  Settings,
  ExternalLink,
  RefreshCw,
  Palette,
  Check,
  Cpu,
  Info,
  Sliders,
  Image as ImageIcon,
} from 'lucide-react';
import {
  generateImage,
  generateImageStream,
  listGenerations,
  deleteGeneration,
  getImageUrl,
  listImageModels,
  getEngineStatus,
  GenerateImageRequest,
  GenerationRecord,
  ImageModelInfo,
  EngineStatus,
  StepProgressEvent,
} from '../../services/imageService';
import {
  AspectRatioOption,
  AttachedReferenceImage,
  BrandLogoConfig,
  ColorPaletteConfig,
  StylePreset,
  AdvancedSettingsState,
  GenerationStepProgress,
} from './types';
import { ImageComposer } from './components/ImageComposer';
import { AttachmentShelf } from './components/AttachmentShelf';
import { AdvancedSettingsDrawer } from './components/AdvancedSettingsDrawer';
import { CanvasStage } from './components/CanvasStage';
import { GalleryFilmstrip } from './components/GalleryFilmstrip';
import { ColorPaletteModal } from './components/ColorPaletteModal';
import { BrandLogoModal } from './components/BrandLogoModal';
import { ImageModelSelect } from './components/ImageModelSelect';

export interface ImageWorkspacePageProps {
  onBack?: () => void;
  onOpenSettings?: () => void;
  triggerToast?: (message: string) => void;
}

export function getAdaptiveAspectRatios(modelId?: string): AspectRatioOption[] {
  const isSd15 =
    modelId?.toLowerCase().includes('sd15') ||
    modelId?.toLowerCase().includes('v1-5') ||
    modelId?.toLowerCase().includes('sd-1-5') ||
    modelId?.toLowerCase().includes('v1.5');

  if (isSd15) {
    return [
      { label: 'Square (1:1)', width: 512, height: 512 },
      { label: 'Landscape (16:9)', width: 768, height: 432 },
      { label: 'Portrait (9:16)', width: 432, height: 768 },
      { label: 'Photo (4:3)', width: 640, height: 480 },
      { label: 'Classic (3:2)', width: 768, height: 512 },
    ];
  }

  // SDXL, SD 3.5, Flux native high-resolution profiles
  return [
    { label: 'Square (1:1)', width: 1024, height: 1024 },
    { label: 'Landscape (16:9)', width: 1024, height: 576 },
    { label: 'Portrait (9:16)', width: 576, height: 1024 },
    { label: 'Photo (4:3)', width: 1024, height: 768 },
    { label: 'Classic (3:2)', width: 1024, height: 680 },
  ];
}

export const ASPECT_RATIOS: AspectRatioOption[] = getAdaptiveAspectRatios('sdxl');

export const ImageWorkspacePage: React.FC<ImageWorkspacePageProps> = ({
  onBack,
  onOpenSettings,
  triggerToast,
}) => {
  const notify = (msg: string) => {
    if (triggerToast) triggerToast(msg);
  };

  // ── Core Generation Inputs ──
  const [prompt, setPrompt] = useState('');
  const [selectedModel, setSelectedModel] = useState<string>('');
  const [dimensions, setDimensions] = useState<AspectRatioOption>(ASPECT_RATIOS[1]); // Default 16:9 Landscape

  // ── Attachments ──
  const [referenceImage, setReferenceImage] = useState<AttachedReferenceImage | null>(null);
  const [brandLogo, setBrandLogo] = useState<BrandLogoConfig>({
    enabled: false,
    source: 'superagent',
    placement: 'bottom-right',
    opacity: 0.85,
    scale: 0.18,
  });
  const [selectedPalette, setSelectedPalette] = useState<ColorPaletteConfig | null>(null);
  const [activePreset, setActivePreset] = useState<StylePreset | null>(null);

  // ── Modals ──
  const [isColorModalOpen, setIsColorModalOpen] = useState(false);
  const [isLogoModalOpen, setIsLogoModalOpen] = useState(false);

  // ── Advanced Settings ──
  const [advanced, setAdvanced] = useState<AdvancedSettingsState>({
    steps: 20,
    cfgScale: 7.0,
    seed: null,
    sampler: 'euler_a',
    negativePrompt: '',
    mode: 'auto',
  });

  // ── Backend / Gallery State ──
  const [models, setModels] = useState<ImageModelInfo[]>([]);
  const [engineStatus, setEngineStatus] = useState<EngineStatus | null>(null);
  const [history, setHistory] = useState<GenerationRecord[]>([]);
  const [selectedRecord, setSelectedRecord] = useState<GenerationRecord | null>(null);

  const [generating, setGenerating] = useState(false);
  const [generationTime, setGenerationTime] = useState(0);
  const [generationProgress, setGenerationProgress] = useState<GenerationStepProgress | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const [mobileView, setMobileView] = useState<'controls' | 'canvas'>('controls');
  const [copied, setCopied] = useState(false);

  // Load models, engine status, and generations
  const loadData = useCallback(async () => {
    try {
      const [modelsList, status, gens] = await Promise.all([
        listImageModels(),
        getEngineStatus(),
        listGenerations(),
      ]);
      setModels(modelsList);
      setEngineStatus(status);
      setHistory(gens);

      const downloaded = modelsList.filter((m) => m.is_downloaded);
      if (downloaded.length > 0) {
        // Prioritize SDXL / high-quality model for best facial fidelity, else first downloaded
        setSelectedModel((prev) => {
          if (!prev || !downloaded.some((m) => m.id === prev)) {
            const preferred =
              downloaded.find((m) => m.id.toLowerCase().includes('sdxl') || m.family === 'sdxl') ||
              downloaded[0];
            setAdvanced((adv) => ({
              ...adv,
              steps: preferred.default_steps,
              cfgScale: preferred.default_cfg,
            }));
            const ratios = getAdaptiveAspectRatios(preferred.id);
            setDimensions(ratios[1] || ratios[0]); // Default 16:9 Landscape
            return preferred.id;
          }
          return prev;
        });
      } else {
        setSelectedModel('');
      }

      if (gens.length > 0 && !selectedRecord) {
        setSelectedRecord(gens[0]);
      }
    } catch (err) {
      console.error('Failed to load image workspace data:', err);
    }
  }, [selectedRecord]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Poll if any download is in progress
  const isDownloadingAny =
    (engineStatus?.is_downloading ?? false) || models.some((m) => m.is_downloading);
  useEffect(() => {
    if (!isDownloadingAny) return;
    const interval = setInterval(() => {
      loadData();
    }, 2500);
    return () => clearInterval(interval);
  }, [isDownloadingAny, loadData]);

  // Model selection handler
  const handleModelChange = (modelId: string) => {
    setSelectedModel(modelId);
    const m = models.find((item) => item.id === modelId);
    if (m) {
      setAdvanced((prev) => ({
        ...prev,
        steps: m.default_steps,
        cfgScale: m.default_cfg,
      }));
    }
    const ratios = getAdaptiveAspectRatios(modelId);
    setDimensions((prev) => {
      const match = ratios.find((r) => r.label === prev.label) || ratios[1] || ratios[0];
      return match;
    });
  };

  // 1-Click Remix past generation
  const handleRemix = (record: GenerationRecord) => {
    setPrompt(record.prompt);
    if (record.negative_prompt) {
      setAdvanced((prev) => ({ ...prev, negativePrompt: record.negative_prompt || '' }));
    }
    const matchedRatio = ASPECT_RATIOS.find(
      (r) => r.width === record.width && r.height === record.height
    );
    if (matchedRatio) setDimensions(matchedRatio);
    if (record.model_id) setSelectedModel(record.model_id);
    if (record.steps) setAdvanced((prev) => ({ ...prev, steps: record.steps }));
    if (record.cfg_scale) setAdvanced((prev) => ({ ...prev, cfgScale: record.cfg_scale }));
    if (record.seed) setAdvanced((prev) => ({ ...prev, seed: record.seed }));
    if (typeof window !== 'undefined' && window.innerWidth < 768) {
      setMobileView('controls');
    }
    notify('Loaded generation parameters into composer');
  };

  // Clipboard paste listener (Ctrl+V / Cmd+V image paste)
  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;

      for (let i = 0; i < items.length; i++) {
        if (items[i].type.startsWith('image/')) {
          const file = items[i].getAsFile();
          if (file) {
            const reader = new FileReader();
            reader.onload = (loadEvt) => {
              const dataUrl = loadEvt.target?.result as string;
              if (dataUrl) {
                setReferenceImage({
                  name: file.name || 'Pasted Reference',
                  dataUrl,
                  sizeBytes: file.size,
                  strength: 0.85,
                  guidanceMode: 'face_lock',
                });
                notify('Image pasted with Face Lock active');
              }
            };
            reader.readAsDataURL(file);
            break;
          }
        }
      }
    };

    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, []);

  // Main Generate Image handler with real-time step streaming
  const handleGenerate = async () => {
    if (!prompt.trim()) {
      notify('Please enter a prompt');
      return;
    }

    const downloadedModels = models.filter((m) => m.is_downloaded);
    if (downloadedModels.length === 0 || !selectedModel) {
      notify('No local image models installed. Please download a model from Settings before generating.');
      return;
    }

    if (engineStatus && !engineStatus.installed) {
      notify('Image generation engine is not installed. Please install it in Settings.');
      return;
    }

    // Auto-switch to Canvas tab on mobile/compact view
    if (typeof window !== 'undefined' && window.innerWidth < 768) {
      setMobileView('canvas');
    }

    // Build synthesized prompt with style preset and color palette
    let effectivePrompt = prompt.trim();
    if (activePreset) {
      // In Face Lock mode, avoid injecting "studio photography" into outdoor / non-studio scenes
      let suffix = activePreset.promptSuffix;
      if (referenceImage?.guidanceMode === 'face_lock' && activePreset.id === 'photorealistic') {
        suffix = ', raw photo, ultra detailed, 8k resolution, natural lighting, sharp focus';
      }
      effectivePrompt += suffix;
    }
    if (selectedPalette && selectedPalette.colors.length > 0) {
      effectivePrompt += `, color palette inspired by ${selectedPalette.name} with harmonic tones (${selectedPalette.colors.join(', ')})`;
    }

    // Universal high-quality negative prompt baseline to prevent distorted faces and deformed anatomy
    const qualityNegative = 'distorted faces, blurry eyes, bad anatomy, deformed fingers, extra limbs, low resolution, artifacts';
    let effectiveNegative = advanced.negativePrompt.trim();
    if (!effectiveNegative) {
      effectiveNegative = qualityNegative;
    } else if (!effectiveNegative.toLowerCase().includes('distorted faces')) {
      effectiveNegative = `${effectiveNegative}, ${qualityNegative}`;
    }

    if (activePreset?.negativeSuffix) {
      effectiveNegative = `${effectiveNegative}${activePreset.negativeSuffix}`;
    }

    // In Face Lock mode, automatically suppress formal studio clothing if generating a custom scene
    if (referenceImage?.guidanceMode === 'face_lock') {
      const faceLockNegatives = 'suit, tuxedo, tie, blazer, formal wear, indoor, studio, dark background, watch';
      effectiveNegative = `${effectiveNegative}, ${faceLockNegatives}`;
    }

    setGenerating(true);
    setGenerationTime(0);
    setGenerationProgress({
      step: 0,
      totalSteps: advanced.steps,
      progress: 0,
      phase: 'Initializing engine & loading model...',
      elapsedSeconds: 0,
    });

    abortControllerRef.current = new AbortController();

    const timer = setInterval(() => {
      setGenerationTime((prev) => prev + 1);
    }, 1000);

    try {
      const req: GenerateImageRequest = {
        prompt: effectivePrompt,
        negative_prompt: effectiveNegative || undefined,
        model_id: selectedModel || undefined,
        mode: advanced.mode,
        width: dimensions.width,
        height: dimensions.height,
        steps: advanced.steps,
        cfg_scale: advanced.cfgScale,
        seed: advanced.seed !== null ? advanced.seed : undefined,
        sampler: advanced.sampler,
        init_image: referenceImage?.dataUrl,
        strength: referenceImage ? referenceImage.strength : undefined,
        guidance_mode: referenceImage?.guidanceMode,
      };

      const res = await generateImageStream(
        req,
        (prog: StepProgressEvent) => {
          setGenerationProgress({
            step: prog.step,
            totalSteps: prog.total_steps,
            progress: prog.progress,
            phase: prog.phase,
            stepTimeMs: prog.step_time_ms,
            etaSeconds: prog.eta_seconds,
            elapsedSeconds: prog.elapsed_seconds,
            previewDataUrl: prog.preview_data_url,
          });
        },
        abortControllerRef.current.signal
      );

      notify(`Image generated in ${(res.generation_time_ms / 1000).toFixed(1)}s!`);

      const gens = await listGenerations();
      setHistory(gens);
      if (gens.length > 0) {
        setSelectedRecord(gens[0]);
      }
    } catch (err: any) {
      if (err.message === 'Generation cancelled' || err.name === 'AbortError') {
        notify('Generation cancelled');
      } else {
        notify(err.message || 'Generation failed');
      }
    } finally {
      clearInterval(timer);
      setGenerating(false);
      setGenerationProgress(null);
      abortControllerRef.current = null;
    }
  };

  const handleCancelGeneration = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    setGenerating(false);
    setGenerationProgress(null);
    notify('Generation cancelled');
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteGeneration(id);
      notify('Generation deleted');
      const gens = history.filter((g) => g.id !== id);
      setHistory(gens);
      if (selectedRecord?.id === id) {
        setSelectedRecord(gens[0] || null);
      }
    } catch (err: any) {
      notify(`Delete failed: ${err.message}`);
    }
  };

  const handleCopyImage = async (url: string) => {
    try {
      const resp = await fetch(url);
      const blob = await resp.blob();
      await navigator.clipboard.write([
        new ClipboardItem({
          [blob.type]: blob,
        }),
      ]);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      notify('Image copied to clipboard');
    } catch {
      notify('Failed to copy image to clipboard');
    }
  };

  const currentModel = models.find((m) => m.id === selectedModel);
  const defaultSteps = currentModel?.default_steps || 20;
  const defaultCfg = currentModel?.default_cfg || 7.0;

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-brand-bg select-none">
      {/* ── Top Bar ── */}
      <div className="h-12 border-b border-brand-border/60 px-3 sm:px-4 flex items-center justify-between shrink-0 bg-brand-card/50 backdrop-blur-md gap-2">
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          {onBack && (
            <button
              onClick={onBack}
              className="ui-btn-ghost p-1.5 text-brand-textMuted hover:text-brand-textMain cursor-pointer shrink-0"
              title="Back"
            >
              <ArrowLeft size={16} />
            </button>
          )}
          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            <Palette size={18} className="text-[var(--brand-accent)]" />
            <h1 className="text-xs sm:text-sm font-bold text-brand-textMain truncate">
              Image Workspace
            </h1>
          </div>

          <div className="hidden sm:block h-4 w-px bg-brand-border mx-1" />

          {/* Engine status indicator */}
          <div className="hidden sm:flex items-center gap-2 text-xs shrink-0">
            <div
              className={`w-2 h-2 rounded-full ${
                engineStatus?.installed
                  ? 'bg-[color:var(--neon-constructive)]'
                  : 'bg-[color:var(--neon-attention)]'
              }`}
            />
            <span className="text-brand-textMuted text-[11px]">
              Engine: {engineStatus?.installed ? 'Local Ready' : 'Setup Required'}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          {/* Responsive Mobile / Tablet Tab Switcher (< md) */}
          <div className="flex md:hidden p-0.5 rounded-lg bg-brand-bg border border-brand-border text-xs">
            <button
              onClick={() => setMobileView('controls')}
              className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors ${
                mobileView === 'controls'
                  ? 'bg-[var(--brand-accent)] text-white'
                  : 'text-brand-textMuted hover:text-brand-textMain'
              }`}
            >
              Parameters
            </button>
            <button
              onClick={() => setMobileView('canvas')}
              className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors flex items-center gap-1 ${
                mobileView === 'canvas'
                  ? 'bg-[var(--brand-accent)] text-white'
                  : 'text-brand-textMuted hover:text-brand-textMain'
              }`}
            >
              <span>Canvas</span>
              {generating && (
                <span className="w-1.5 h-1.5 rounded-full bg-[color:var(--neon-live)] animate-ping" />
              )}
            </button>
          </div>

          {/* Mode Selector */}
          <div className="hidden sm:flex p-0.5 rounded-lg bg-brand-bg border border-brand-border text-xs">
            {(['auto', 'local', 'cloud'] as const).map((m) => (
              <button
                key={m}
                onClick={() => setAdvanced({ ...advanced, mode: m })}
                className={`ui-chip transition-colors capitalize ${
                  advanced.mode === m
                    ? 'bg-[var(--brand-accent)] text-white font-medium'
                    : 'bg-transparent text-brand-textMuted hover:text-brand-textMain'
                }`}
              >
                {m}
              </button>
            ))}
          </div>

          {onOpenSettings && (
            <button
              onClick={onOpenSettings}
              className="ui-btn flex items-center gap-1.5 text-xs py-1.5 px-2 sm:px-3 cursor-pointer"
              title="Open Local Image Model settings to manage engine and download weights"
            >
              <Settings size={13} />
              <span className="hidden sm:inline">Models & Engine</span>
            </button>
          )}
        </div>
      </div>

      {/* ── Main Studio Split ── */}
      <div className="flex-1 flex flex-col md:flex-row min-h-0 overflow-hidden">
        {/* Left: Adaptive Control Panel & Composer */}
        <div
          className={`w-full md:w-88 lg:w-96 border-r border-brand-border flex flex-col shrink-0 bg-brand-card/30 min-h-0 h-full overflow-hidden ${
            mobileView === 'controls' ? 'flex' : 'hidden md:flex'
          }`}
        >
          {/* ── Scrollable Parameters Body ── */}
          <div className="flex-1 overflow-y-auto min-h-0 p-3.5 sm:p-4 space-y-4 custom-scrollbar">
            {/* 1. Prompt Composer */}
            <ImageComposer
              prompt={prompt}
              onChangePrompt={setPrompt}
              onGenerate={handleGenerate}
              generating={generating}
            />

            {/* 2. Unified Attachment Shelf (Ref Image, Brand Logo, Color Palette, Presets) */}
            <AttachmentShelf
              referenceImage={referenceImage}
              onSetReferenceImage={setReferenceImage}
              brandLogo={brandLogo}
              onOpenBrandLogoModal={() => setIsLogoModalOpen(true)}
              onRemoveBrandLogo={() => setBrandLogo({ ...brandLogo, enabled: false })}
              selectedPalette={selectedPalette}
              onOpenColorPaletteModal={() => setIsColorModalOpen(true)}
              onRemoveColorPalette={() => setSelectedPalette(null)}
              activePreset={activePreset}
              onSelectPreset={setActivePreset}
            />

            {/* 3. Model Selector */}
            <div className="space-y-1.5">
              <label className="ui-label flex items-center justify-between">
                <span>Model</span>
                {onOpenSettings && (
                  <button
                    type="button"
                    onClick={onOpenSettings}
                    className="text-[10px] text-[var(--brand-accent)] hover:underline flex items-center gap-0.5 cursor-pointer"
                  >
                    <span>Catalog</span>
                    <ExternalLink size={9} />
                  </button>
                )}
              </label>
              <ImageModelSelect
                models={models}
                selectedModelId={selectedModel}
                onSelectModel={handleModelChange}
                onOpenSettings={onOpenSettings}
                engineStatus={engineStatus}
              />
            </div>

            {/* 4. Aspect Ratio Chips */}
            <div className="space-y-1.5">
              <label className="ui-label">Aspect Ratio</label>
              <div className="grid grid-cols-2 gap-1.5">
                {getAdaptiveAspectRatios(selectedModel).map((ratio) => {
                  const isSel = dimensions.label === ratio.label;
                  return (
                    <button
                      key={ratio.label}
                      onClick={() => setDimensions(ratio)}
                      className={`px-2.5 py-1.5 rounded-lg text-left text-xs transition-all cursor-pointer border ${
                        isSel
                          ? 'bg-[var(--brand-accent)]/15 border-[var(--brand-accent-border)] text-brand-textMain font-medium'
                          : 'bg-brand-bg/40 border-brand-border text-brand-textMuted hover:border-brand-border hover:text-brand-textMain'
                      }`}
                    >
                      <div className="truncate">{ratio.label}</div>
                      <div className="text-[10px] text-brand-textMuted font-mono">
                        {ratio.width}x{ratio.height}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 5. Single-Click Advanced Settings Drawer */}
            <AdvancedSettingsDrawer
              settings={advanced}
              onChangeSettings={setAdvanced}
              defaultSteps={defaultSteps}
              defaultCfg={defaultCfg}
              referenceImage={referenceImage}
              onChangeRefStrength={(strength) =>
                referenceImage && setReferenceImage({ ...referenceImage, strength })
              }
            />

            {/* 6. Active Model & Hardware Info Card */}
            {currentModel && (
              <div className="rounded-xl border border-brand-border/60 bg-brand-bg/40 p-3 space-y-2 text-xs">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="font-semibold text-brand-textMain flex items-center gap-1.5">
                    <Cpu size={12} className="text-[var(--brand-accent)]" />
                    <span>Model Architecture</span>
                  </span>
                  <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-brand-card border border-brand-border text-brand-textMuted">
                    {currentModel.family.toUpperCase()}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-[11px] text-brand-textMuted">
                  <div className="flex flex-col">
                    <span className="text-[10px]">Format</span>
                    <span className="font-medium text-brand-textMain font-mono">
                      {currentModel.quantization}
                    </span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-[10px]">VRAM Recommended</span>
                    <span className="font-medium text-brand-textMain font-mono">
                      {(currentModel.vram_required_mb / 1024).toFixed(1)} GB
                    </span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-[10px]">Optimal Steps</span>
                    <span className="font-medium text-brand-textMain font-mono">
                      {currentModel.default_steps} steps
                    </span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-[10px]">Default CFG</span>
                    <span className="font-medium text-brand-textMain font-mono">
                      {currentModel.default_cfg.toFixed(1)}
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* ── Fixed Pinned Bottom Generate Action Bar ── */}
          <div className="p-3.5 sm:p-4 border-t border-brand-border bg-brand-card/85 backdrop-blur-md shrink-0 shadow-lg">
            <button
              onClick={handleGenerate}
              disabled={generating || !prompt.trim()}
              className="ui-btn-primary w-full py-2.5 px-4 font-semibold text-xs shadow-md flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer"
            >
              {generating ? (
                <div className="flex items-center gap-1.5 min-w-0">
                  <RefreshCw size={13} className="animate-spin shrink-0" />
                  <span className="truncate">
                    {generationProgress?.step
                      ? `Step ${generationProgress.step}/${generationProgress.totalSteps || advanced.steps} (${Math.round((generationProgress.progress || 0) * 100)}%)`
                      : `Synthesizing (${generationTime}s)...`}
                  </span>
                </div>
              ) : (
                <>
                  <Sparkles size={14} />
                  <span>Generate Image</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Center: Interactive Canvas Stage */}
        <div
          className={`flex-1 flex flex-col min-h-0 h-full overflow-hidden ${
            mobileView === 'canvas' ? 'flex' : 'hidden md:flex'
          }`}
        >
          <CanvasStage
            generating={generating}
            generationTime={generationTime}
            generationProgress={generationProgress}
            dimensions={dimensions}
            selectedRecord={selectedRecord}
            referenceImage={referenceImage}
            brandLogo={brandLogo}
            onCopyImage={handleCopyImage}
            onDeleteRecord={handleDelete}
            onRemixPrompt={handleRemix}
            onCancelGeneration={handleCancelGeneration}
            copied={copied}
          />
        </div>
      </div>

      {/* ── Bottom: Gallery Strip ── */}
      <GalleryFilmstrip
        history={history}
        selectedRecord={selectedRecord}
        onSelectRecord={setSelectedRecord}
        onDeleteRecord={handleDelete}
        onRemixPrompt={handleRemix}
      />

      {/* ── Modals ── */}
      <ColorPaletteModal
        isOpen={isColorModalOpen}
        onClose={() => setIsColorModalOpen(false)}
        selectedPalette={selectedPalette}
        onSelectPalette={setSelectedPalette}
      />

      <BrandLogoModal
        isOpen={isLogoModalOpen}
        onClose={() => setIsLogoModalOpen(false)}
        config={brandLogo}
        onChange={setBrandLogo}
      />
    </div>
  );
};

export default ImageWorkspacePage;
