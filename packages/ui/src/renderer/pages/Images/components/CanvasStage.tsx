import React, { useRef, useState, useEffect } from 'react';
import {
  Maximize2,
  Minimize2,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Copy,
  Download,
  Trash2,
  Sparkles,
  Check,
  Columns,
  Image as ImageIcon,
  Share2,
  X,
  Activity,
  Clock,
  Zap,
  Loader2,
} from 'lucide-react';
import { GenerationRecord, getImageUrl } from '../../../services/imageService';
import {
  AttachedReferenceImage,
  BrandLogoConfig,
  GenerationStepProgress,
  AspectRatioOption,
} from '../types';

interface CanvasStageProps {
  generating: boolean;
  generationTime: number;
  generationProgress?: GenerationStepProgress | null;
  dimensions?: AspectRatioOption;
  selectedRecord: GenerationRecord | null;
  referenceImage: AttachedReferenceImage | null;
  brandLogo: BrandLogoConfig;
  onCopyImage: (url: string) => void;
  onDeleteRecord: (id: string) => void;
  onRemixPrompt?: (record: GenerationRecord) => void;
  onCancelGeneration?: () => void;
  copied: boolean;
}

export const CanvasStage: React.FC<CanvasStageProps> = ({
  generating,
  generationTime,
  generationProgress,
  dimensions,
  selectedRecord,
  referenceImage,
  brandLogo,
  onCopyImage,
  onDeleteRecord,
  onRemixPrompt,
  onCancelGeneration,
  copied,
}) => {
  // Zoom & Pan state
  const [zoomLevel, setZoomLevel] = useState(1);
  const [compareMode, setCompareMode] = useState(false);
  const [splitPos, setSplitPos] = useState(50); // 0 to 100%
  const isDraggingSplitRef = useRef(false);
  const stageContainerRef = useRef<HTMLDivElement>(null);

  // Auto disable compare mode if no reference image
  useEffect(() => {
    if (!referenceImage && compareMode) {
      setCompareMode(false);
    }
  }, [referenceImage, compareMode]);

  // Client-side canvas logo compositor for lossless download
  const handleExportComposited = async () => {
    if (!selectedRecord) return;
    const imgUrl = getImageUrl(selectedRecord.id);

    try {
      const baseImg = new Image();
      baseImg.crossOrigin = 'anonymous';
      baseImg.src = imgUrl;
      await new Promise((resolve, reject) => {
        baseImg.onload = resolve;
        baseImg.onerror = reject;
      });

      const canvas = document.createElement('canvas');
      canvas.width = baseImg.naturalWidth;
      canvas.height = baseImg.naturalHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      // Draw base diffusion artwork
      ctx.drawImage(baseImg, 0, 0);

      // Draw brand logo if enabled
      if (brandLogo.enabled) {
        let logoImg: HTMLImageElement | null = null;
        if (brandLogo.source === 'custom' && brandLogo.customDataUrl) {
          logoImg = new Image();
          logoImg.src = brandLogo.customDataUrl;
          await new Promise((res) => (logoImg!.onload = res));
        }

        if (logoImg) {
          ctx.globalAlpha = brandLogo.opacity;
          const logoW = canvas.width * brandLogo.scale;
          const logoH = (logoImg.naturalHeight / logoImg.naturalWidth) * logoW;
          const margin = canvas.width * 0.03;

          let x = margin;
          let y = margin;
          switch (brandLogo.placement) {
            case 'top-left':
              x = margin;
              y = margin;
              break;
            case 'top-center':
              x = (canvas.width - logoW) / 2;
              y = margin;
              break;
            case 'top-right':
              x = canvas.width - logoW - margin;
              y = margin;
              break;
            case 'center':
              x = (canvas.width - logoW) / 2;
              y = (canvas.height - logoH) / 2;
              break;
            case 'bottom-left':
              x = margin;
              y = canvas.height - logoH - margin;
              break;
            case 'bottom-center':
              x = (canvas.width - logoW) / 2;
              y = canvas.height - logoH - margin;
              break;
            case 'bottom-right':
            default:
              x = canvas.width - logoW - margin;
              y = canvas.height - logoH - margin;
              break;
          }

          ctx.drawImage(logoImg, x, y, logoW, logoH);
        }
      }

      // Trigger download
      const finalDataUrl = canvas.toDataURL('image/png');
      const a = document.createElement('a');
      a.href = finalDataUrl;
      a.download = `superagent-${selectedRecord.id}.png`;
      a.click();
    } catch (e) {
      console.error('Composite export failed, falling back to direct URL', e);
      const a = document.createElement('a');
      a.href = imgUrl;
      a.download = `superagent-${selectedRecord.id}.png`;
      a.click();
    }
  };

  // Handle A/B split mouse drag
  const handleMouseDownSplit = (e: React.MouseEvent) => {
    e.preventDefault();
    isDraggingSplitRef.current = true;
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDraggingSplitRef.current || !stageContainerRef.current) return;
    const rect = stageContainerRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const pct = Math.max(5, Math.min(95, (x / rect.width) * 100));
    setSplitPos(pct);
  };

  const handleMouseUp = () => {
    isDraggingSplitRef.current = false;
  };

  return (
    <div
      ref={stageContainerRef}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      className="flex-1 flex flex-col min-h-0 bg-brand-bg relative overflow-hidden select-none"
    >
      {/* ── Viewport Area ── */}
      <div className="flex-1 flex items-center justify-center p-4 sm:p-6 min-h-0 overflow-auto relative">
        {generating ? (
          /* Progressive Step-by-Step Generating State */
          <div className="w-full max-w-2xl max-h-[75vh] flex flex-col items-center justify-center space-y-4 animate-in fade-in zoom-in-95 duration-200">
            {/* Step Preview Canvas Container with Aspect Ratio */}
            <div
              className="relative w-full rounded-2xl overflow-hidden shadow-2xl border border-brand-border/80 bg-black/50 flex items-center justify-center"
              style={{
                aspectRatio: `${dimensions?.width || 1024} / ${dimensions?.height || 1024}`,
                maxHeight: '55vh',
                maxWidth: '100%',
              }}
            >
              {generationProgress?.previewDataUrl || generationProgress?.previewUrl ? (
                /* Real Intermediate Step Preview Image */
                <div className="relative w-full h-full flex items-center justify-center overflow-hidden">
                  <img
                    src={generationProgress.previewDataUrl || generationProgress.previewUrl}
                    alt="Denoising step preview"
                    className="w-full h-full object-contain filter contrast-105 transition-all duration-300"
                  />
                  {/* Subtle live scanline shimmer */}
                  <div className="absolute inset-0 pointer-events-none overflow-hidden">
                    <div className="w-full h-1.5 bg-gradient-to-r from-transparent via-[var(--brand-accent)]/80 to-transparent animate-pulse shadow-[0_0_20px_var(--brand-accent)]" />
                  </div>
                </div>
              ) : (
                /* Generative Latent Diffusion Matrix Shimmer */
                <div className="relative w-full h-full flex items-center justify-center overflow-hidden bg-gradient-to-br from-brand-card/70 via-brand-bg/50 to-black/80">
                  <div className="absolute inset-0 opacity-15 bg-[radial-gradient(#a5b4fc_1px,transparent_1px)] [background-size:20px_20px] animate-pulse" />
                  <div className="relative z-10 flex flex-col items-center justify-center p-6 text-center space-y-3">
                    <div className="relative w-16 h-16 rounded-2xl bg-brand-card/90 border border-brand-border flex items-center justify-center text-[var(--brand-accent)] shadow-2xl">
                      <Sparkles size={28} className="animate-spin" />
                      <span className="absolute -top-1 -right-1 flex h-3 w-3">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[color:var(--neon-live)] opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-3 w-3 bg-[color:var(--neon-live)]"></span>
                      </span>
                    </div>
                    <div className="space-y-1">
                      <div className="text-sm font-bold text-brand-textMain">
                        Synthesizing Diffusion Artwork
                      </div>
                      <div className="text-xs text-brand-textMuted max-w-xs truncate">
                        {generationProgress?.phase || 'Calculating latent steps...'}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Glassmorphic Step Progression HUD Pill */}
            <div className="w-full max-w-lg bg-brand-card/90 backdrop-blur-xl border border-brand-border rounded-2xl p-3.5 sm:p-4 shadow-2xl space-y-3">
              {/* Top Row: Step count & Percentage */}
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="relative flex h-2.5 w-2.5 shrink-0">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[color:var(--neon-live)] opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-[color:var(--neon-live)]"></span>
                  </span>
                  <span className="font-bold text-xs sm:text-sm text-brand-textMain truncate">
                    {generationProgress?.step
                      ? `Step ${generationProgress.step} of ${generationProgress.totalSteps || 20}`
                      : 'Preparing Pipeline...'}
                  </span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="px-2 py-0.5 rounded-full text-[11px] font-mono font-bold bg-[var(--brand-accent)]/15 text-[var(--brand-accent)] border border-[var(--brand-accent-border)]">
                    {Math.round(
                      (generationProgress?.progress ||
                        (generationTime > 0 ? Math.min(generationTime * 4, 90) / 100 : 0)) * 100
                    )}%
                  </span>
                </div>
              </div>

              {/* Smooth Animated Progress Bar */}
              <div className="w-full h-2 bg-brand-hover rounded-full overflow-hidden p-0.5 border border-brand-border/40">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-[var(--brand-accent)] via-sky-400 to-[color:var(--neon-constructive)] transition-all duration-300 shadow-[0_0_12px_rgba(165,180,252,0.6)]"
                  style={{
                    width: `${Math.max(
                      4,
                      Math.round(
                        (generationProgress?.progress ||
                          (generationTime > 0 ? Math.min(generationTime * 4, 90) / 100 : 0.04)) * 100
                      )
                    )}%`,
                  }}
                />
              </div>

              {/* Status Message & Live Metrics */}
              <div className="flex items-center justify-between text-[11px] text-brand-textMuted flex-wrap gap-2 pt-0.5">
                <div className="flex items-center gap-1.5 min-w-0 truncate max-w-[200px] sm:max-w-xs">
                  <Activity size={12} className="text-[var(--brand-accent)] shrink-0" />
                  <span className="truncate text-brand-textMain font-medium">
                    {generationProgress?.phase || 'Running local GPU inference...'}
                  </span>
                </div>

                <div className="flex items-center gap-3 shrink-0 font-mono text-[10px]">
                  {generationProgress?.stepTimeMs ? (
                    <span title="Inference speed per step">
                      {(generationProgress.stepTimeMs / 1000).toFixed(2)}s/it
                    </span>
                  ) : null}
                  {generationProgress?.etaSeconds !== undefined && generationProgress.etaSeconds > 0 ? (
                    <span className="text-[var(--brand-accent)]" title="Estimated time remaining">
                      ~{Math.ceil(generationProgress.etaSeconds)}s left
                    </span>
                  ) : (
                    <span>{generationTime}s elapsed</span>
                  )}
                </div>
              </div>

              {/* Cancel Button Action */}
              {onCancelGeneration && (
                <div className="pt-1 border-t border-brand-border/50">
                  <button
                    type="button"
                    onClick={onCancelGeneration}
                    className="w-full py-1 px-2.5 rounded-lg text-xs text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 transition-colors flex items-center justify-center gap-1.5 cursor-pointer font-medium"
                  >
                    <X size={13} />
                    <span>Cancel Generation</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        ) : selectedRecord ? (
          /* Active Image / A-B Split Compare */
          <div
            className="max-w-full max-h-full flex flex-col items-center justify-center space-y-3"
            style={{ transform: `scale(${zoomLevel})`, transition: 'transform 0.15s ease-out' }}
          >
            <div className="relative group rounded-2xl overflow-hidden shadow-2xl border border-brand-border max-h-[70vh] bg-black/40">
              {compareMode && referenceImage ? (
                /* A/B Split Compare View */
                <div className="relative max-h-[70vh] flex items-center justify-center overflow-hidden">
                  {/* Background: Reference Image */}
                  <img
                    src={referenceImage.dataUrl}
                    alt="Reference"
                    className="max-h-[70vh] max-w-full object-contain pointer-events-none"
                  />

                  {/* Foreground: Generated Image with Clip Path */}
                  <div
                    className="absolute inset-0 overflow-hidden"
                    style={{ clipPath: `inset(0 ${100 - splitPos}% 0 0)` }}
                  >
                    <img
                      src={getImageUrl(selectedRecord.id)}
                      alt="Generated"
                      className="max-h-[70vh] max-w-full object-contain pointer-events-none"
                    />
                  </div>

                  {/* Split Divider Handle */}
                  <div
                    className="absolute top-0 bottom-0 w-1 bg-white cursor-ew-resize shadow-[0_0_10px_rgba(0,0,0,0.8)] flex items-center justify-center z-20"
                    style={{ left: `${splitPos}%` }}
                    onMouseDown={handleMouseDownSplit}
                  >
                    <div className="w-6 h-6 rounded-full bg-white text-slate-900 flex items-center justify-center shadow-lg border border-slate-200">
                      <Columns size={12} />
                    </div>
                  </div>

                  {/* Labels */}
                  <div className="absolute top-2 left-2 z-10 px-2 py-0.5 rounded bg-black/60 backdrop-blur text-[10px] text-white font-mono">
                    Before (Ref)
                  </div>
                  <div className="absolute top-2 right-2 z-10 px-2 py-0.5 rounded bg-black/60 backdrop-blur text-[10px] text-white font-mono">
                    After (Generated)
                  </div>
                </div>
              ) : (
                /* Standard Artwork View */
                <div className="relative">
                  <img
                    src={getImageUrl(selectedRecord.id)}
                    alt={selectedRecord.prompt}
                    className="max-h-[70vh] max-w-full object-contain"
                  />

                  {/* Real-time brand logo visual overlay preview */}
                  {brandLogo.enabled && brandLogo.customDataUrl && (
                    <img
                      src={brandLogo.customDataUrl}
                      alt="Brand watermark preview"
                      style={{
                        opacity: brandLogo.opacity,
                        width: `${brandLogo.scale * 100}%`,
                      }}
                      className={`absolute pointer-events-none ${
                        brandLogo.placement === 'top-left'
                          ? 'top-3 left-3'
                          : brandLogo.placement === 'top-center'
                          ? 'top-3 left-1/2 -translate-x-1/2'
                          : brandLogo.placement === 'top-right'
                          ? 'top-3 right-3'
                          : brandLogo.placement === 'center'
                          ? 'top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2'
                          : brandLogo.placement === 'bottom-left'
                          ? 'bottom-3 left-3'
                          : brandLogo.placement === 'bottom-center'
                          ? 'bottom-3 left-1/2 -translate-x-1/2'
                          : 'bottom-3 right-3'
                      }`}
                    />
                  )}
                </div>
              )}

              {/* Floating Action Overlay Toolbar */}
              <div className="absolute top-3 right-3 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity bg-black/70 backdrop-blur-md p-1.5 rounded-xl border border-white/10 shadow-2xl z-30">
                {referenceImage && (
                  <button
                    onClick={() => setCompareMode(!compareMode)}
                    className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                      compareMode
                        ? 'bg-[var(--brand-accent)] text-white'
                        : 'text-white/80 hover:text-white hover:bg-white/10'
                    }`}
                    title="Toggle A/B Split Compare Slider"
                  >
                    <Columns size={14} />
                  </button>
                )}

                {onRemixPrompt && (
                  <button
                    onClick={() => onRemixPrompt(selectedRecord)}
                    className="p-1.5 text-amber-300 hover:text-amber-200 rounded-lg hover:bg-amber-500/20 transition-colors cursor-pointer"
                    title="Remix & Edit Settings"
                  >
                    <Sparkles size={14} />
                  </button>
                )}

                <button
                  onClick={() =>
                    onCopyImage(getImageUrl(selectedRecord.id))
                  }
                  className="p-1.5 text-white/80 hover:text-white rounded-lg hover:bg-white/10 transition-colors cursor-pointer"
                  title="Copy to Clipboard"
                >
                  {copied ? (
                    <Check size={14} className="text-emerald-400" />
                  ) : (
                    <Copy size={14} />
                  )}
                </button>

                <button
                  onClick={handleExportComposited}
                  className="p-1.5 text-white/80 hover:text-white rounded-lg hover:bg-white/10 transition-colors cursor-pointer"
                  title="Download Image (Lossless PNG)"
                >
                  <Download size={14} />
                </button>

                <button
                  onClick={() => onDeleteRecord(selectedRecord.id)}
                  className="p-1.5 text-rose-400 hover:text-rose-300 rounded-lg hover:bg-rose-500/20 transition-colors cursor-pointer"
                  title="Delete generation"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>

            {/* Stage Info Pill */}
            <div className="flex items-center gap-3 text-[11px] text-brand-textMuted bg-brand-card/90 backdrop-blur px-4 py-1.5 rounded-full border border-brand-border shadow-md flex-wrap justify-center">
              <span>
                Model: <strong className="text-brand-textMain">{selectedRecord.model_id}</strong>
              </span>
              <span>
                Dimensions:{' '}
                <strong className="text-brand-textMain">
                  {selectedRecord.width}x{selectedRecord.height}
                </strong>
              </span>
              <span>
                Elapsed:{' '}
                <strong className="text-brand-textMain">
                  {(selectedRecord.generation_time_ms / 1000).toFixed(1)}s
                </strong>
              </span>
              <span>
                Seed:{' '}
                <strong className="text-brand-textMain font-mono">{selectedRecord.seed}</strong>
              </span>
            </div>
          </div>
        ) : (
          /* Empty State */
          <div className="text-center max-w-sm p-8 space-y-3">
            <div className="w-12 h-12 rounded-2xl bg-brand-card border border-brand-border flex items-center justify-center mx-auto text-brand-textMuted shadow-lg">
              <ImageIcon size={24} />
            </div>
            <h3 className="text-sm font-bold text-brand-textMain">Interactive Canvas</h3>
            <p className="text-xs text-brand-textMuted leading-relaxed">
              Describe your vision on the left, attach brand assets or color palettes, and press{' '}
              <strong className="text-brand-textMain">Generate Image</strong> to render.
            </p>
          </div>
        )}
      </div>

      {/* Floating Canvas Zoom Controls (Bottom Right) */}
      {selectedRecord && !generating && (
        <div className="absolute bottom-3 right-4 flex items-center gap-1 bg-brand-card/90 backdrop-blur border border-brand-border p-1 rounded-xl shadow-lg z-20">
          <button
            onClick={() => setZoomLevel((z) => Math.max(0.5, z - 0.25))}
            className="p-1.5 text-brand-textMuted hover:text-brand-textMain rounded-lg hover:bg-brand-hover transition-colors"
            title="Zoom Out"
          >
            <ZoomOut size={13} />
          </button>
          <span className="text-[10px] font-mono px-1 text-brand-textMuted">
            {Math.round(zoomLevel * 100)}%
          </span>
          <button
            onClick={() => setZoomLevel((z) => Math.min(3, z + 0.25))}
            className="p-1.5 text-brand-textMuted hover:text-brand-textMain rounded-lg hover:bg-brand-hover transition-colors"
            title="Zoom In"
          >
            <ZoomIn size={13} />
          </button>
          <button
            onClick={() => setZoomLevel(1)}
            className="p-1.5 text-brand-textMuted hover:text-brand-textMain rounded-lg hover:bg-brand-hover transition-colors"
            title="Fit to Screen (100%)"
          >
            <RotateCcw size={13} />
          </button>
        </div>
      )}
    </div>
  );
};
