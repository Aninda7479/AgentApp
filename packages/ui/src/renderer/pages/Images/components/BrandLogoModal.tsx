import React, { useRef } from 'react';
import { Shield, X, Upload, Check, Sliders } from 'lucide-react';
import { BrandLogo } from '../../../BrandLogo';
import { BrandLogoConfig, BrandLogoPlacement } from '../types';

interface BrandLogoModalProps {
  isOpen: boolean;
  onClose: () => void;
  config: BrandLogoConfig;
  onChange: (next: BrandLogoConfig) => void;
}

const PLACEMENTS: { id: BrandLogoPlacement; label: string; x: string; y: string }[] = [
  { id: 'top-left', label: 'Top Left', x: 'left-2', y: 'top-2' },
  { id: 'top-center', label: 'Top Center', x: 'left-1/2 -translate-x-1/2', y: 'top-2' },
  { id: 'top-right', label: 'Top Right', x: 'right-2', y: 'top-2' },
  { id: 'center', label: 'Center', x: 'left-1/2 -translate-x-1/2', y: 'top-1/2 -translate-y-1/2' },
  { id: 'bottom-left', label: 'Bottom Left', x: 'left-2', y: 'bottom-2' },
  { id: 'bottom-center', label: 'Bottom Center', x: 'left-1/2 -translate-x-1/2', y: 'bottom-2' },
  { id: 'bottom-right', label: 'Bottom Right', x: 'right-2', y: 'bottom-2' },
];

export const BrandLogoModal: React.FC<BrandLogoModalProps> = ({
  isOpen,
  onClose,
  config,
  onChange,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (loadEvt) => {
      const dataUrl = loadEvt.target?.result as string;
      if (dataUrl) {
        onChange({
          ...config,
          enabled: true,
          source: 'custom',
          customDataUrl: dataUrl,
          customFileName: file.name,
        });
      }
    };
    reader.readAsDataURL(file);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md bg-brand-card border border-brand-border rounded-2xl shadow-2xl p-5 space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-brand-border/60 pb-3">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-[var(--brand-accent)]/15 text-[var(--brand-accent)]">
              <Shield size={18} />
            </div>
            <div>
              <h2 className="text-sm font-bold text-brand-textMain">Brand Logo & Watermark</h2>
              <p className="text-[11px] text-brand-textMuted">
                Composite your brand mark cleanly on generated artwork
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-brand-textMuted hover:text-brand-textMain hover:bg-brand-hover transition-colors cursor-pointer"
          >
            <X size={16} />
          </button>
        </div>

        {/* Logo Selection Source */}
        <div className="space-y-2">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-brand-textMuted">
            Logo Source
          </div>
          <div className="grid grid-cols-2 gap-2">
            {/* SuperAgent Brand Mark */}
            <button
              onClick={() =>
                onChange({
                  ...config,
                  enabled: true,
                  source: 'superagent',
                })
              }
              className={`p-3 rounded-xl border flex flex-col items-center justify-center gap-2 transition-all cursor-pointer ${
                config.enabled && config.source === 'superagent'
                  ? 'border-[var(--brand-accent)] bg-[var(--brand-accent)]/10 ring-1 ring-[var(--brand-accent)]/30'
                  : 'border-brand-border bg-brand-bg/40 hover:bg-brand-hover'
              }`}
            >
              <BrandLogo size={32} />
              <span className="text-xs font-semibold text-brand-textMain">SuperAgent Mark</span>
            </button>

            {/* Custom Upload */}
            <button
              onClick={() => fileInputRef.current?.click()}
              className={`p-3 rounded-xl border flex flex-col items-center justify-center gap-2 transition-all cursor-pointer ${
                config.enabled && config.source === 'custom'
                  ? 'border-[var(--brand-accent)] bg-[var(--brand-accent)]/10 ring-1 ring-[var(--brand-accent)]/30'
                  : 'border-brand-border bg-brand-bg/40 hover:bg-brand-hover'
              }`}
            >
              {config.customDataUrl ? (
                <img
                  src={config.customDataUrl}
                  alt="Custom logo"
                  className="w-8 h-8 object-contain rounded"
                />
              ) : (
                <Upload size={24} className="text-brand-textMuted" />
              )}
              <span className="text-xs font-semibold text-brand-textMain truncate max-w-[120px]">
                {config.customFileName || 'Upload Custom'}
              </span>
            </button>
            <input
              type="file"
              ref={fileInputRef}
              accept="image/png,image/svg+xml,image/jpeg,image/webp"
              onChange={handleFileUpload}
              className="hidden"
            />
          </div>
        </div>

        {/* 9-Point Placement Grid */}
        <div className="space-y-2">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-brand-textMuted">
            Watermark Position
          </div>
          <div className="relative w-full h-32 rounded-xl bg-brand-bg/80 border border-brand-border p-2">
            {/* Visual Guide Box */}
            <div className="w-full h-full border border-dashed border-brand-border/60 rounded-lg flex items-center justify-center text-[10px] text-brand-textMuted/40 select-none">
              Canvas Frame
            </div>

            {/* Interactive Grid Anchors */}
            {PLACEMENTS.map((p) => {
              const isSelected = config.placement === p.id;
              return (
                <button
                  key={p.id}
                  onClick={() => onChange({ ...config, placement: p.id })}
                  className={`absolute ${p.x} ${p.y} w-7 h-7 rounded-lg flex items-center justify-center transition-all cursor-pointer ${
                    isSelected
                      ? 'bg-[var(--brand-accent)] text-white shadow-md ring-2 ring-[var(--brand-accent)]/40 scale-105'
                      : 'bg-brand-card/90 border border-brand-border text-brand-textMuted hover:text-brand-textMain hover:border-brand-textMuted'
                  }`}
                  title={p.label}
                >
                  <div className={`w-2 h-2 rounded-full ${isSelected ? 'bg-white' : 'bg-brand-textMuted'}`} />
                </button>
              );
            })}
          </div>
        </div>

        {/* Opacity & Scale Sliders */}
        <div className="space-y-3 pt-1">
          <div className="space-y-1">
            <div className="flex justify-between text-xs">
              <span className="text-brand-textMain font-medium">Logo Opacity</span>
              <span className="font-mono text-brand-textMuted">
                {Math.round(config.opacity * 100)}%
              </span>
            </div>
            <input
              type="range"
              min={0.1}
              max={1.0}
              step={0.05}
              value={config.opacity}
              onChange={(e) => onChange({ ...config, opacity: Number(e.target.value) })}
              className="w-full accent-[var(--brand-accent)] cursor-pointer"
            />
          </div>

          <div className="space-y-1">
            <div className="flex justify-between text-xs">
              <span className="text-brand-textMain font-medium">Relative Scale</span>
              <span className="font-mono text-brand-textMuted">
                {Math.round(config.scale * 100)}%
              </span>
            </div>
            <input
              type="range"
              min={0.08}
              max={0.4}
              step={0.02}
              value={config.scale}
              onChange={(e) => onChange({ ...config, scale: Number(e.target.value) })}
              className="w-full accent-[var(--brand-accent)] cursor-pointer"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between pt-2 border-t border-brand-border/60">
          <button
            onClick={() => {
              onChange({ ...config, enabled: false });
              onClose();
            }}
            className="text-xs text-rose-400 hover:text-rose-300 transition-colors cursor-pointer"
          >
            Disable Logo
          </button>
          <button
            onClick={onClose}
            className="ui-btn-primary py-1.5 px-4 text-xs font-semibold"
          >
            Apply Settings
          </button>
        </div>
      </div>
    </div>
  );
};
