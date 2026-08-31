import React, { useRef } from 'react';
import {
  Sparkles,
  Palette,
  Shield,
  Image as ImageIcon,
  Sliders,
  X,
  Plus,
  UserCheck,
  Layers,
} from 'lucide-react';
import {
  AttachedReferenceImage,
  BrandLogoConfig,
  ColorPaletteConfig,
  StylePreset,
  GuidanceMode,
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
          strength: 0.85,
          guidanceMode: 'face_lock',
        });
      }
    };
    reader.readAsDataURL(file);
  };

  const handleToggleGuidanceMode = () => {
    if (!referenceImage) return;
    const nextMode: GuidanceMode =
      referenceImage.guidanceMode === 'face_lock' ? 'style_pose' : 'face_lock';
    onSetReferenceImage({
      ...referenceImage,
      guidanceMode: nextMode,
      strength: nextMode === 'face_lock' ? 0.85 : 0.65,
    });
  };

  return (
    <div className="space-y-3">
      {/* ── Guidance & Attachments Row ── */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <label className="ui-label">Guidance & Attachments</label>
          {referenceImage && (
            <span className="text-[10px] text-brand-textMuted font-mono">
              {referenceImage.guidanceMode === 'face_lock'
                ? '👤 Face Locked (New Scene)'
                : '🎨 Style & Pose (Img2Img)'}
            </span>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {/* 1. Reference Image Attachment Pill */}
          {referenceImage ? (
            <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-[var(--brand-accent)]/15 border border-[var(--brand-accent)]/30 text-xs text-brand-textMain">
              <img
                src={referenceImage.dataUrl}
                alt="Ref"
                className="w-5 h-5 object-cover rounded shadow-sm"
              />
              <span className="truncate max-w-[90px] text-[11px] font-medium">
                {referenceImage.name}
              </span>

              {/* Mode Switcher Button */}
              <button
                type="button"
                onClick={handleToggleGuidanceMode}
                className={`px-1.5 py-0.5 rounded text-[10px] font-semibold transition-all cursor-pointer flex items-center gap-1 ${
                  referenceImage.guidanceMode === 'face_lock'
                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 hover:bg-emerald-500/30'
                    : 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/40 hover:bg-indigo-500/30'
                }`}
                title="Click to toggle between Face Lock (preserves faces in new scene) and Style/Pose (standard Img2Img)"
              >
                {referenceImage.guidanceMode === 'face_lock' ? (
                  <>
                    <UserCheck size={10} />
                    <span>Face Lock</span>
                  </>
                ) : (
                  <>
                    <Layers size={10} />
                    <span>Style/Pose</span>
                  </>
                )}
              </button>

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
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-brand-bg/60 hover:bg-brand-hover border border-brand-border text-xs text-brand-textMuted hover:text-brand-textMain transition-all cursor-pointer"
                title="Upload reference photo to lock faces or guide generation"
              >
                <UserCheck size={12} className="text-[var(--brand-accent)]" />
                <span>+ Face / Image</span>
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
            <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-indigo-500/15 border border-indigo-500/30 text-xs text-indigo-200">
              <Shield size={12} className="text-indigo-400" />
              <button
                type="button"
                onClick={onOpenBrandLogoModal}
                className="hover:underline cursor-pointer text-[11px] font-medium flex items-center gap-1"
              >
                <span>Logo ({brandLogo.placement.replace('-', ' ')})</span>
              </button>
              <button
                type="button"
                onClick={onRemoveBrandLogo}
                className="p-0.5 hover:text-rose-400 text-indigo-400/70 transition-colors cursor-pointer"
                title="Remove brand logo"
              >
                <X size={12} />
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={onOpenBrandLogoModal}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-brand-bg/60 hover:bg-brand-hover border border-brand-border text-xs text-brand-textMuted hover:text-brand-textMain transition-all cursor-pointer"
              title="Add brand logo watermark and aesthetic guidance"
            >
              <Shield size={12} className="text-indigo-400" />
              <span>+ Brand Logo</span>
            </button>
          )}

          {/* 3. Color Palette Pill */}
          {selectedPalette ? (
            <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-xs text-emerald-200">
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
                type="button"
                onClick={onOpenColorPaletteModal}
                className="hover:underline cursor-pointer text-[11px] font-medium"
              >
                {selectedPalette.name}
              </button>
              <button
                type="button"
                onClick={onRemoveColorPalette}
                className="p-0.5 hover:text-rose-400 text-emerald-400/70 transition-colors cursor-pointer"
                title="Remove color palette"
              >
                <X size={12} />
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={onOpenColorPaletteModal}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-brand-bg/60 hover:bg-brand-hover border border-brand-border text-xs text-brand-textMuted hover:text-brand-textMain transition-all cursor-pointer"
              title="Harmonize mood and lighting with an aesthetic palette"
            >
              <Palette size={12} className="text-emerald-400" />
              <span>+ Palette</span>
            </button>
          )}
        </div>
      </div>

      {/* ── Style Presets Adaptive Flow ── */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-xs">
          <label className="ui-label flex items-center gap-1">
            <Sparkles size={11} className="text-[var(--brand-accent)]" />
            <span>Style Preset</span>
          </label>
          {activePreset && (
            <button
              type="button"
              onClick={() => onSelectPreset(null)}
              className="text-[10px] text-brand-textMuted hover:text-brand-textMain transition-colors cursor-pointer"
            >
              Reset to None
            </button>
          )}
        </div>
        <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={() => onSelectPreset(null)}
            className={`px-2.5 py-1 rounded-lg text-xs transition-all cursor-pointer border ${
              activePreset === null
                ? 'bg-[var(--brand-accent)] text-white border-[var(--brand-accent)] font-medium shadow-sm'
                : 'bg-brand-bg/50 border-brand-border text-brand-textMuted hover:border-brand-border hover:text-brand-textMain'
            }`}
          >
            None
          </button>
          {STYLE_PRESETS.map((preset) => {
            const isSelected = activePreset?.id === preset.id;
            return (
              <button
                key={preset.id}
                type="button"
                onClick={() => onSelectPreset(isSelected ? null : preset)}
                className={`px-2.5 py-1 rounded-lg text-xs transition-all cursor-pointer border ${
                  isSelected
                    ? 'bg-[var(--brand-accent)] text-white border-[var(--brand-accent)] font-medium shadow-sm'
                    : 'bg-brand-bg/50 border-brand-border text-brand-textMuted hover:border-brand-border hover:text-brand-textMain'
                }`}
              >
                {preset.label}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};
