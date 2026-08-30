import React, { useRef } from 'react';
import {
  Sparkles,
  Palette,
  Shield,
  Image as ImageIcon,
  Sliders,
  X,
  Plus,
} from 'lucide-react';
import {
  AttachedReferenceImage,
  BrandLogoConfig,
  ColorPaletteConfig,
  StylePreset,
} from '../types';

export const STYLE_PRESETS: StylePreset[] = [
  {
    id: 'photorealistic',
    label: 'Photorealistic',
    promptSuffix: ', professional studio photography, 8k resolution, raw photo, ultra detailed, cinematic lighting',
    negativeSuffix: ', 3d render, cartoon, anime, illustration, blurry',
    suggestedCfg: 7.0,
    suggestedSteps: 25,
  },
  {
    id: 'anime',
    label: 'Anime / Manga',
    promptSuffix: ', makoto shinkai style, vibrant anime visual, sharp lineart, high quality key visual',
    negativeSuffix: ', photorealistic, 3d, realistic skin texture',
    suggestedCfg: 8.0,
    suggestedSteps: 24,
  },
  {
    id: 'cinematic-3d',
    label: 'Cinematic 3D',
    promptSuffix: ', unreal engine 5, octane render, raytracing, volumetrics, subsurface scattering, 8k',
    negativeSuffix: ', flat 2d, sketch, low poly, noisy',
    suggestedCfg: 7.5,
    suggestedSteps: 28,
  },
  {
    id: 'cyberpunk',
    label: 'Cyberpunk',
    promptSuffix: ', neo-tokyo aesthetics, neon reflections, holographic displays, rain-soaked pavement, volumetric fog',
    negativeSuffix: ', pastel, vintage, rural, natural sunlight',
    suggestedCfg: 7.0,
    suggestedSteps: 24,
  },
  {
    id: 'vintage',
    label: 'Vintage Film',
    promptSuffix: ', 35mm photograph, analog film grain, kodak portra 400, muted nostalgic tones, natural warm light',
    negativeSuffix: ', digital sharpness, sterile, neon, 3d render',
    suggestedCfg: 6.5,
    suggestedSteps: 20,
  },
];

interface AttachmentShelfProps {
  referenceImage: AttachedReferenceImage | null;
  onSetReferenceImage: (img: AttachedReferenceImage | null) => void;
  brandLogo: BrandLogoConfig;
  onOpenBrandLogoModal: () => void;
  onRemoveBrandLogo: () => void;
  selectedPalette: ColorPaletteConfig | null;
  onOpenColorPaletteModal: () => void;
  onRemoveColorPalette: () => void;
  activePreset: StylePreset | null;
  onSelectPreset: (preset: StylePreset | null) => void;
}

export const AttachmentShelf: React.FC<AttachmentShelfProps> = ({
  referenceImage,
  onSetReferenceImage,
  brandLogo,
  onOpenBrandLogoModal,
  onRemoveBrandLogo,
  selectedPalette,
  onOpenColorPaletteModal,
  onRemoveColorPalette,
  activePreset,
  onSelectPreset,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (loadEvt) => {
      const dataUrl = loadEvt.target?.result as string;
      if (dataUrl) {
        onSetReferenceImage({
          name: file.name,
          dataUrl,
          sizeBytes: file.size,
          strength: 0.65,
        });
      }
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="space-y-2">
      {/* ── Active Attachments Pill Row ── */}
      <div className="flex flex-wrap items-center gap-1.5">
        {/* 1. Reference Image Attachment Pill */}
        {referenceImage ? (
          <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-[var(--brand-accent)]/15 border border-[var(--brand-accent)]/30 text-xs text-brand-textMain">
            <img
              src={referenceImage.dataUrl}
              alt="Ref"
              className="w-4 h-4 object-cover rounded"
            />
            <span className="truncate max-w-[100px] text-[11px] font-medium">
              {referenceImage.name}
            </span>
            <span className="text-[10px] text-brand-textMuted font-mono">
              ({Math.round(referenceImage.strength * 100)}%)
            </span>
            <button
              onClick={() => onSetReferenceImage(null)}
              className="p-0.5 hover:text-rose-400 text-brand-textMuted transition-colors cursor-pointer"
              title="Remove reference image"
            >
              <X size={12} />
            </button>
          </div>
        ) : (
          <>
            <button
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-brand-bg/60 hover:bg-brand-hover border border-brand-border text-[11px] text-brand-textMuted hover:text-brand-textMain transition-all cursor-pointer"
              title="Upload reference image for img2img guidance"
            >
              <ImageIcon size={12} className="text-[var(--brand-accent)]" />
              <span>+ Image</span>
            </button>
            <input
              type="file"
              ref={fileInputRef}
              accept="image/*"
              onChange={handleFileSelect}
              className="hidden"
            />
          </>
        )}

        {/* 2. Brand Logo Pill */}
        {brandLogo.enabled ? (
          <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-indigo-500/15 border border-indigo-500/30 text-xs text-indigo-200">
            <Shield size={12} className="text-indigo-400" />
            <button
              onClick={onOpenBrandLogoModal}
              className="hover:underline cursor-pointer text-[11px] font-medium flex items-center gap-1"
            >
              <span>Logo ({brandLogo.placement.replace('-', ' ')})</span>
            </button>
            <button
              onClick={onRemoveBrandLogo}
              className="p-0.5 hover:text-rose-400 text-indigo-400/70 transition-colors cursor-pointer"
              title="Remove brand logo"
            >
              <X size={12} />
            </button>
          </div>
        ) : (
          <button
            onClick={onOpenBrandLogoModal}
            className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-brand-bg/60 hover:bg-brand-hover border border-brand-border text-[11px] text-brand-textMuted hover:text-brand-textMain transition-all cursor-pointer"
            title="Add brand logo watermark and aesthetic guidance"
          >
            <Shield size={12} className="text-indigo-400" />
            <span>+ Brand Logo</span>
          </button>
        )}

        {/* 3. Color Palette Pill */}
        {selectedPalette ? (
          <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-xs text-emerald-200">
            <div className="flex items-center -space-x-1">
              {selectedPalette.colors.slice(0, 3).map((hex, i) => (
                <div
                  key={i}
                  className="w-2.5 h-2.5 rounded-full border border-black/40"
                  style={{ backgroundColor: hex }}
                />
              ))}
            </div>
            <button
              onClick={onOpenColorPaletteModal}
              className="hover:underline cursor-pointer text-[11px] font-medium"
            >
              {selectedPalette.name}
            </button>
            <button
              onClick={onRemoveColorPalette}
              className="p-0.5 hover:text-rose-400 text-emerald-400/70 transition-colors cursor-pointer"
              title="Remove color palette"
            >
              <X size={12} />
            </button>
          </div>
        ) : (
          <button
            onClick={onOpenColorPaletteModal}
            className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-brand-bg/60 hover:bg-brand-hover border border-brand-border text-[11px] text-brand-textMuted hover:text-brand-textMain transition-all cursor-pointer"
            title="Harmonize mood and lighting with an aesthetic palette"
          >
            <Palette size={12} className="text-emerald-400" />
            <span>+ Palette</span>
          </button>
        )}
      </div>

      {/* ── Style Presets Quick Chips ── */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
        <span className="text-[10px] text-brand-textMuted uppercase font-semibold tracking-wider shrink-0 mr-0.5">
          Style:
        </span>
        {STYLE_PRESETS.map((preset) => {
          const isSelected = activePreset?.id === preset.id;
          return (
            <button
              key={preset.id}
              onClick={() => onSelectPreset(isSelected ? null : preset)}
              className={`px-2 py-0.5 rounded-full text-[11px] whitespace-nowrap transition-all cursor-pointer border ${
                isSelected
                  ? 'bg-[var(--brand-accent)] text-white border-[var(--brand-accent)] font-medium shadow-sm'
                  : 'bg-brand-card/40 border-brand-border/80 text-brand-textMuted hover:text-brand-textMain hover:border-brand-border'
              }`}
            >
              {preset.label}
            </button>
          );
        })}
      </div>
    </div>
  );
};
