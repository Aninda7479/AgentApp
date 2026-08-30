import React, { useState, useEffect, useCallback } from 'react';
import {
  Image as ImageIcon,
  Sparkles,
  Download,
  Copy,
  Trash2,
  Dice5,
  Settings,
  ChevronDown,
  ChevronUp,
  Maximize2,
  RefreshCw,
  Zap,
  HardDrive,
  Cpu,
  Layers,
  ArrowLeft,
  Sliders,
  Check,
  ExternalLink,
  Palette,
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

interface ImageWorkspacePageProps {
  onBack?: () => void;
  onOpenSettings?: () => void;
  triggerToast?: (message: string) => void;
}

const ASPECT_RATIOS = [
  { label: 'Square (1:1)', width: 1024, height: 1024 },
  { label: 'Landscape (16:9)', width: 1280, height: 720 },
  { label: 'Portrait (9:16)', width: 720, height: 1280 },
  { label: 'Photo (4:3)', width: 1024, height: 768 },
  { label: 'Classic (3:2)', width: 1024, height: 682 },
];

const SAMPLE_PROMPTS = [
  'A cybernetic cyberpunk detective looking over a rainy neo-Tokyo skyline, neon reflections, 8k cinematic lighting',
  'A serene Japanese zen garden with cherry blossom petals falling into a koi pond at dawn, photorealistic',
  'A high-tech laboratory with glowing quantum holographic computer interfaces, hyperrealistic detail',
  'An astronaut standing on a crimson alien planet gazing at a massive swirling ringed gas giant, unreal engine 5',
];

export const ImageWorkspacePage: React.FC<ImageWorkspacePageProps> = ({
  onBack,
  onOpenSettings,
  triggerToast,
}) => {
  const notify = (msg: string) => {
    if (triggerToast) triggerToast(msg);
  };

  // State
  const [prompt, setPrompt] = useState('');
  const [negativePrompt, setNegativePrompt] = useState('');
  const [showNegative, setShowNegative] = useState(false);
  const [selectedModel, setSelectedModel] = useState<string>('');
  const [dimensions, setDimensions] = useState(ASPECT_RATIOS[0]);
  const [steps, setSteps] = useState(20);
  const [cfgScale, setCfgScale] = useState(7.0);
  const [seed, setSeed] = useState<number | null>(null);
  const [mode, setMode] = useState<'local' | 'cloud' | 'auto'>('auto');

  const [models, setModels] = useState<ImageModelInfo[]>([]);
  const [engineStatus, setEngineStatus] = useState<EngineStatus | null>(null);
  const [history, setHistory] = useState<GenerationRecord[]>([]);
  const [selectedRecord, setSelectedRecord] = useState<GenerationRecord | null>(null);

  const [generating, setGenerating] = useState(false);
  const [generationTime, setGenerationTime] = useState(0);
  const [copied, setCopied] = useState(false);

  // Load initial data
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

      // Auto-select first downloaded model if available
      const downloaded = modelsList.find((m) => m.is_downloaded);
      if (downloaded && !selectedModel) {
        setSelectedModel(downloaded.id);
        setSteps(downloaded.default_steps);
        setCfgScale(downloaded.default_cfg);
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

  // Update steps and CFG when selected model changes
  const handleModelChange = (modelId: string) => {
    setSelectedModel(modelId);
    const m = models.find((item) => item.id === modelId);
    if (m) {
      setSteps(m.default_steps);
      setCfgScale(m.default_cfg);
    }
  };

  const handleRandomSeed = () => {
    setSeed(Math.floor(Math.random() * 2147483647));
  };

  const handleGenerate = async () => {
    if (!prompt.trim()) {
      notify('Please enter a prompt');
      return;
    }

    setGenerating(true);
    setGenerationTime(0);
    const timer = setInterval(() => {
      setGenerationTime((prev) => prev + 1);
    }, 1000);

    try {
      const req: GenerateImageRequest = {
        prompt: prompt.trim(),
        negative_prompt: showNegative && negativePrompt.trim() ? negativePrompt.trim() : undefined,
        model_id: selectedModel || undefined,
        mode,
        width: dimensions.width,
        height: dimensions.height,
        steps,
        cfg_scale: cfgScale,
        seed: seed !== null ? seed : undefined,
      };

      const res = await generateImage(req);
      notify(`Image generated in ${(res.generation_time_ms / 1000).toFixed(1)}s!`);

      // Refresh gallery and select new image
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

  const hasDownloadedModel = models.some((m) => m.is_downloaded);

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-brand-bg select-none">
      {/* ── Top Bar ── */}
      <div className="h-12 border-b border-brand-border/60 px-4 flex items-center justify-between shrink-0 bg-brand-card/50 backdrop-blur-md">
        <div className="flex items-center gap-3">
          {onBack && (
            <button
              onClick={onBack}
              className="ui-btn-ghost p-1.5 text-brand-textMuted hover:text-brand-textMain"
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
                engineStatus?.installed ? 'bg-[color:var(--neon-constructive)]' : 'bg-[color:var(--neon-attention)]'
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
            <button
              onClick={() => setMode('auto')}
              className={`ui-chip transition-colors ${
                mode === 'auto' ? 'bg-[var(--brand-accent)] text-white font-medium' : 'bg-transparent text-brand-textMuted hover:text-brand-textMain'
              }`}
            >
              Auto
            </button>
            <button
              onClick={() => setMode('local')}
              className={`ui-chip transition-colors ${
                mode === 'local' ? 'bg-[var(--brand-accent)] text-white font-medium' : 'bg-transparent text-brand-textMuted hover:text-brand-textMain'
              }`}
            >
              Local (GGUF)
            </button>
            <button
              onClick={() => setMode('cloud')}
              className={`ui-chip transition-colors ${
                mode === 'cloud' ? 'bg-[var(--brand-accent)] text-white font-medium' : 'bg-transparent text-brand-textMuted hover:text-brand-textMain'
              }`}
            >
              Cloud
            </button>
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

      {/* ── Main Studio Grid ── */}
      <div className="flex-1 flex flex-col md:flex-row min-h-0 overflow-hidden">
        {/* Left: Controls Panel */}
        <div className="w-full md:w-84 lg:w-96 border-r border-brand-border flex flex-col shrink-0 bg-brand-card/30 overflow-y-auto p-4 space-y-4">
          {/* Prompt input */}
          <div className="space-y-1.5">
            <label className="ui-label flex items-center justify-between">
              <span>Prompt</span>
              <Sparkles size={13} className="text-[var(--brand-accent)]" />
            </label>
            <textarea
              rows={3}
              placeholder="Describe the image you want to generate in rich visual detail..."
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              className="ui-input w-full p-2.5 text-xs resize-none transition-all placeholder:text-brand-textMuted/50"
            />
          </div>

          {/* Negative Prompt toggle */}
          <div className="space-y-1.5">
            <button
              onClick={() => setShowNegative(!showNegative)}
              className="flex items-center gap-1 text-[11px] text-brand-textMuted hover:text-brand-textMain transition-colors cursor-pointer"
            >
              {showNegative ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
              <span>Negative Prompt</span>
            </button>
            {showNegative && (
              <textarea
                rows={2}
                placeholder="What to exclude (e.g. blurry, low quality, artifacts)..."
                value={negativePrompt}
                onChange={(e) => setNegativePrompt(e.target.value)}
                className="ui-input w-full p-2 text-xs resize-none transition-all placeholder:text-brand-textMuted/50"
              />
            )}
          </div>

          {/* Model Selector */}
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
                  {m.name} ({m.quantization}) {m.is_downloaded ? '✓ [Installed]' : '⬇ [Not Downloaded]'}
                </option>
              ))}
            </select>
          </div>

          {/* Aspect Ratio / Dimensions */}
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
                        ? 'bg-[var(--brand-accent)]/10 border-[var(--brand-accent-border)] text-brand-textMain font-medium'
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

          {/* Steps & CFG Sliders */}
          <div className="space-y-3 pt-1 border-t border-brand-border">
            <div className="space-y-1">
              <div className="flex justify-between text-xs">
                <span className="text-brand-textMain font-medium">Steps</span>
                <span className="font-mono text-brand-textMuted">{steps}</span>
              </div>
              <input
                type="range"
                min={1}
                max={50}
                value={steps}
                onChange={(e) => setSteps(Number(e.target.value))}
                className="w-full accent-[var(--brand-accent)] cursor-pointer"
              />
            </div>

            <div className="space-y-1">
              <div className="flex justify-between text-xs">
                <span className="text-brand-textMain font-medium">CFG Scale</span>
                <span className="font-mono text-brand-textMuted">{cfgScale.toFixed(1)}</span>
              </div>
              <input
                type="range"
                min={1.0}
                max={15.0}
                step={0.5}
                value={cfgScale}
                onChange={(e) => setCfgScale(Number(e.target.value))}
                className="w-full accent-[var(--brand-accent)] cursor-pointer"
              />
            </div>
          </div>

          {/* Seed Input */}
          <div className="space-y-1.5 pt-1 border-t border-brand-border">
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium text-brand-textMain">Seed</span>
              <button
                onClick={handleRandomSeed}
                className="flex items-center gap-1 text-[11px] text-[var(--brand-accent)] hover:underline transition-colors cursor-pointer"
              >
                <Dice5 size={12} />
                <span>Randomize</span>
              </button>
            </div>
            <input
              type="number"
              placeholder="Random (leave empty or click dice)"
              value={seed !== null ? seed : ''}
              onChange={(e) => setSeed(e.target.value ? Number(e.target.value) : null)}
              className="ui-input w-full p-2 text-xs font-mono placeholder:text-brand-textMuted/40"
            />
          </div>

          {/* Generate Button */}
          <div className="pt-2">
            <button
              onClick={handleGenerate}
              disabled={generating || !prompt.trim()}
              className="ui-btn-primary w-full py-2.5 px-4 font-semibold text-xs shadow-sm flex items-center justify-center gap-2 disabled:opacity-50"
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

        {/* Center: Stage Canvas & Preview */}
        <div className="flex-1 flex flex-col min-h-0 bg-brand-bg relative overflow-hidden">
          <div className="flex-1 flex items-center justify-center p-6 min-h-0 overflow-auto">
            {generating ? (
              <div className="text-center space-y-4 max-w-sm">
                <div className="relative w-20 h-20 mx-auto">
                  <div className="absolute inset-0 rounded-2xl bg-[var(--brand-accent)]/15 animate-ping" />
                  <div className="relative w-20 h-20 rounded-2xl bg-brand-card border border-brand-border flex items-center justify-center text-[var(--brand-accent)] shadow-xl">
                    <Sparkles size={32} className="animate-pulse" />
                  </div>
                </div>
                <div>
                  <h3 className="text-base font-semibold text-brand-textMain">Synthesizing Pixels</h3>
                  <p className="text-xs text-brand-textMuted mt-1">
                    Running diffusion on {dimensions.width}x{dimensions.height} with {steps} steps ({generationTime}s)
                  </p>
                </div>
              </div>
            ) : selectedRecord ? (
              <div className="max-w-full max-h-full flex flex-col items-center justify-center space-y-3">
                <div className="relative group rounded-xl overflow-hidden shadow-xl border border-brand-border max-h-[70vh] bg-black/40">
                  <img
                    src={getImageUrl(selectedRecord.id)}
                    alt={selectedRecord.prompt}
                    className="max-h-[70vh] max-w-full object-contain"
                  />

                  {/* Hover Overlay Toolbar */}
                  <div className="absolute top-3 right-3 flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity bg-black/60 backdrop-blur-md p-1.5 rounded-xl border border-white/10 shadow-lg">
                    <button
                      onClick={() => handleCopyImage(getImageUrl(selectedRecord.id))}
                      className="p-1.5 text-white/80 hover:text-white rounded-lg hover:bg-white/10 transition-colors cursor-pointer"
                      title="Copy Image"
                    >
                      {copied ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
                    </button>
                    <a
                      href={getImageUrl(selectedRecord.id)}
                      download={`superagent-${selectedRecord.id}.png`}
                      className="p-1.5 text-white/80 hover:text-white rounded-lg hover:bg-white/10 transition-colors cursor-pointer"
                      title="Download PNG"
                    >
                      <Download size={14} />
                    </a>
                    <button
                      onClick={() => handleDelete(selectedRecord.id)}
                      className="p-1.5 text-rose-400 hover:text-rose-300 rounded-lg hover:bg-rose-500/20 transition-colors cursor-pointer"
                      title="Delete image"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>

                {/* Info Bar */}
                <div className="flex items-center gap-3 text-[11px] text-brand-textMuted bg-brand-card/80 px-4 py-1.5 rounded-full border border-brand-border flex-wrap justify-center">
                  <span>Model: <strong className="text-brand-textMain">{selectedRecord.model_id}</strong></span>
                  <span>Dimensions: <strong className="text-brand-textMain">{selectedRecord.width}x{selectedRecord.height}</strong></span>
                  <span>Elapsed: <strong className="text-brand-textMain">{(selectedRecord.generation_time_ms / 1000).toFixed(1)}s</strong></span>
                  <span>Seed: <strong className="text-brand-textMain font-mono">{selectedRecord.seed}</strong></span>
                </div>
              </div>
            ) : (
              /* Empty State */
              <div className="text-center max-w-md p-8 space-y-4">
                <div className="w-12 h-12 rounded-xl bg-brand-hover flex items-center justify-center mx-auto text-brand-textMuted">
                  <ImageIcon size={24} />
                </div>
                <div>
                  <h2 className="text-base font-semibold text-brand-textMain">Local Image Workspace</h2>
                  <p className="text-xs text-brand-textMuted mt-1">
                    {!hasDownloadedModel
                      ? 'Download your first quantized model (such as FLUX.1 Schnell or SDXL) in Settings -> Local Image Model to generate local images.'
                      : 'Type a prompt on the left or try one of the starter templates below to begin generating artwork.'}
                  </p>
                </div>

                {!hasDownloadedModel && onOpenSettings && (
                  <button
                    onClick={onOpenSettings}
                    className="ui-btn-primary inline-flex items-center gap-1.5 text-xs shadow-sm mt-1"
                  >
                    <Sparkles size={14} />
                    Open Model Catalog
                  </button>
                )}

                {/* Sample Prompt Suggestions */}
                <div className="space-y-2 text-left pt-2">
                  <span className="text-[11px] font-semibold text-brand-textMuted uppercase tracking-wider">
                    Starter Prompts
                  </span>
                  {SAMPLE_PROMPTS.map((p, idx) => (
                    <button
                      key={idx}
                      onClick={() => setPrompt(p)}
                      className="w-full text-left p-2 rounded-lg bg-brand-card hover:bg-brand-hover border border-brand-border text-xs text-brand-textMuted hover:text-brand-textMain transition-all cursor-pointer truncate"
                    >
                      "{p}"
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* ── Bottom: Gallery Strip ── */}
          {history.length > 0 && (
            <div className="h-24 border-t border-brand-border p-2.5 bg-brand-card/40 shrink-0 flex items-center gap-2 overflow-x-auto">
              <span className="text-[10px] font-semibold uppercase text-brand-textMuted tracking-wider shrink-0 px-2">
                History ({history.length})
              </span>
              {history.map((record) => {
                const isSelected = selectedRecord?.id === record.id;
                return (
                  <button
                    key={record.id}
                    onClick={() => setSelectedRecord(record)}
                    className={`relative w-18 h-18 rounded-lg overflow-hidden shrink-0 border transition-all cursor-pointer ${
                      isSelected
                        ? 'border-[var(--brand-accent)] ring-2 ring-[var(--brand-accent)]/30'
                        : 'border-brand-border opacity-70 hover:opacity-100 hover:border-brand-border'
                    }`}
                  >
                    <img
                      src={getImageUrl(record.id)}
                      alt={record.prompt}
                      className="w-full h-full object-cover"
                    />
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ImageWorkspacePage;
