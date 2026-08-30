import React, { useState, useEffect, useCallback } from 'react';
import {
  Sparkles,
  ArrowLeft,
  Settings,
  ExternalLink,
  RefreshCw,
  Palette,
  Check,
} from 'lucide-react';
import {
  generateImage,
  listGenerations,
  deleteGeneration,
  getImageUrl,
  listImageModels,
  getEngineStatus,
  GenerateImageRequest,
  GenerationRecord,
  ImageModelInfo,
  EngineStatus,
} from '../../services/imageService';
import {
  AspectRatioOption,
  AttachedReferenceImage,
  BrandLogoConfig,
  ColorPaletteConfig,
  StylePreset,
  AdvancedSettingsState,
} from './types';
import { ImageComposer } from './components/ImageComposer';
import { AttachmentShelf } from './components/AttachmentShelf';
import { AdvancedSettingsDrawer } from './components/AdvancedSettingsDrawer';
import { CanvasStage } from './components/CanvasStage';
import { GalleryFilmstrip } from './components/GalleryFilmstrip';
import { ColorPaletteModal } from './components/ColorPaletteModal';
import { BrandLogoModal } from './components/BrandLogoModal';

export interface ImageWorkspacePageProps {
  onBack?: () => void;
  onOpenSettings?: () => void;
  triggerToast?: (message: string) => void;
}

export const ASPECT_RATIOS: AspectRatioOption[] = [
  { label: 'Square (1:1)', width: 1024, height: 1024 },
  { label: 'Landscape (16:9)', width: 1280, height: 720 },
  { label: 'Portrait (9:16)', width: 720, height: 1280 },
  { label: 'Photo (4:3)', width: 1024, height: 768 },
  { label: 'Classic (3:2)', width: 1024, height: 682 },
];

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
  const [dimensions, setDimensions] = useState<AspectRatioOption>(ASPECT_RATIOS[0]);

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

      const downloaded = modelsList.find((m) => m.is_downloaded);
      if (downloaded && !selectedModel) {
        setSelectedModel(downloaded.id);
        setAdvanced((prev) => ({
          ...prev,
          steps: downloaded.default_steps,
          cfgScale: downloaded.default_cfg,
        }));
      } else if (!selectedModel && modelsList.length > 0) {
        setSelectedModel(modelsList[0].id);
      }

      if (gens.length > 0 && !selectedRecord) {
        setSelectedRecord(gens[0]);
      }
    } catch (err) {
      console.error('Failed to load image workspace data:', err);
    }
  }, [selectedModel, selectedRecord]);

  useEffect(() => {
    loadData();
  }, [loadData]);

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
                  strength: 0.65,
                });
                notify('Image pasted as Reference Image');
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

  // Main Generate Image handler
  const handleGenerate = async () => {
    if (!prompt.trim()) {
      notify('Please enter a prompt');
      return;
    }

    // Build synthesized prompt with style preset and color palette
    let effectivePrompt = prompt.trim();
    if (activePreset) {
      effectivePrompt += activePreset.promptSuffix;
    }
    if (selectedPalette && selectedPalette.colors.length > 0) {
      effectivePrompt += `, color palette inspired by ${selectedPalette.name} with harmonic tones (${selectedPalette.colors.join(', ')})`;
    }

    let effectiveNegative = advanced.negativePrompt.trim();
    if (activePreset?.negativeSuffix) {
      effectiveNegative = effectiveNegative
        ? `${effectiveNegative}${activePreset.negativeSuffix}`
        : activePreset.negativeSuffix.replace(/^,\s*/, '');
    }

    setGenerating(true);
    setGenerationTime(0);
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
      };

      const res = await generateImage(req);
      notify(`Image generated in ${(res.generation_time_ms / 1000).toFixed(1)}s!`);

      const gens = await listGenerations();
      setHistory(gens);
      if (gens.length > 0) {
        setSelectedRecord(gens[0]);
      }
    } catch (err: any) {
      notify(err.message || 'Generation failed');
    } finally {
      clearInterval(timer);
      setGenerating(false);
    }
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

  const handleCopyImage = async (imgUrl: string) => {
    try {
      const res = await fetch(imgUrl);
      const blob = await res.blob();
      await navigator.clipboard.write([
        new ClipboardItem({ [blob.type]: blob }),
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
      <div className="h-12 border-b border-brand-border/60 px-4 flex items-center justify-between shrink-0 bg-brand-card/50 backdrop-blur-md">
        <div className="flex items-center gap-3">
          {onBack && (
            <button
              onClick={onBack}
              className="ui-btn-ghost p-1.5 text-brand-textMuted hover:text-brand-textMain cursor-pointer"
              title="Back"
            >
              <ArrowLeft size={16} />
            </button>
          )}
          <div className="flex items-center gap-2">
            <Palette size={18} className="text-[var(--brand-accent)]" />
            <h1 className="text-sm font-bold text-brand-textMain">Image Workspace</h1>
          </div>

          <div className="h-4 w-px bg-brand-border mx-1" />

          {/* Engine status indicator */}
          <div className="flex items-center gap-2 text-xs">
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

        <div className="flex items-center gap-2">
          {/* Mode Selector */}
          <div className="flex p-0.5 rounded-lg bg-brand-bg border border-brand-border text-xs">
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
              className="ui-btn flex items-center gap-1.5 text-xs"
              title="Open Local Image Model settings to manage engine and download weights"
            >
              <Settings size={13} />
              <span>Models & Engine</span>
            </button>
          )}
        </div>
      </div>

      {/* ── Main Studio Split ── */}
      <div className="flex-1 flex flex-col md:flex-row min-h-0 overflow-hidden">
        {/* Left: Adaptive Control Panel & Composer */}
        <div className="w-full md:w-88 lg:w-96 border-r border-brand-border flex flex-col shrink-0 bg-brand-card/30 overflow-y-auto p-4 space-y-4">
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
                  onClick={onOpenSettings}
                  className="text-[10px] text-[var(--brand-accent)] hover:underline flex items-center gap-0.5 cursor-pointer"
                >
                  <span>Catalog</span>
                  <ExternalLink size={9} />
                </button>
              )}
            </label>
            <select
              value={selectedModel}
              onChange={(e) => handleModelChange(e.target.value)}
              className="ui-select w-full"
            >
              {models.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name} ({m.quantization}){' '}
                  {m.is_downloaded ? '✓ [Installed]' : '⬇ [Not Downloaded]'}
                </option>
              ))}
            </select>
          </div>

          {/* 4. Aspect Ratio Chips */}
          <div className="space-y-1.5">
            <label className="ui-label">Aspect Ratio</label>
            <div className="grid grid-cols-2 gap-1.5">
              {ASPECT_RATIOS.map((ratio) => {
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

          {/* 6. Primary Generate Button */}
          <div className="pt-1">
            <button
              onClick={handleGenerate}
              disabled={generating || !prompt.trim()}
              className="ui-btn-primary w-full py-2.5 px-4 font-semibold text-xs shadow-sm flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer"
            >
              {generating ? (
                <>
                  <RefreshCw size={14} className="animate-spin" />
                  <span>Synthesizing ({generationTime}s)...</span>
                </>
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
        <CanvasStage
          generating={generating}
          generationTime={generationTime}
          selectedRecord={selectedRecord}
          referenceImage={referenceImage}
          brandLogo={brandLogo}
          onCopyImage={handleCopyImage}
          onDeleteRecord={handleDelete}
          onRemixPrompt={handleRemix}
          copied={copied}
        />
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
