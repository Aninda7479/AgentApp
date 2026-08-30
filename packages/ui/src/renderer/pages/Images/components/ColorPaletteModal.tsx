import React, { useState } from 'react';
import { Palette, X, Plus, Check, Trash2, Sparkles } from 'lucide-react';
import { ColorPaletteConfig } from '../types';

export const CURATED_PALETTES: ColorPaletteConfig[] = [
  {
    id: 'cyberpunk',
    name: 'Cyberpunk Neon',
    colors: ['#00f5d4', '#7b2cbf', '#ff007f', '#fee440', '#00bbf9'],
    description: 'Electrifying neon hues with deep ultraviolet contrasts',
  },
  {
    id: 'sunset',
    name: 'Sunset Horizon',
    colors: ['#f72585', '#7209b7', '#3a0ca3', '#4361ee', '#4cc9f0'],
    description: 'Golden hour twilight with magenta and rich dusk blues',
  },
  {
    id: 'teal-obsidian',
    name: 'Teal & Obsidian',
    colors: ['#0b0c10', '#1f2833', '#c5c6c7', '#66fcf1', '#45a29e'],
    description: 'High-tech stealth palette with vibrant bioluminescent cyan',
  },
  {
    id: 'pastel-dream',
    name: 'Pastel Dream',
    colors: ['#ffbe0b', '#fb5607', '#ff006e', '#8338ec', '#3a86ff'],
    description: 'Playful, vibrant confectionery gradient tones',
  },
  {
    id: 'earthy-forest',
    name: 'Earthy Moss',
    colors: ['#283618', '#606c38', '#dda15e', '#bc6c25', '#fefae0'],
    description: 'Organic woodland tones with warm amber sunlight',
  },
  {
    id: 'monochrome-noir',
    name: 'Monochrome Noir',
    colors: ['#050505', '#242424', '#555555', '#aaaaaa', '#f5f5f5'],
    description: 'High contrast cinematic black, slate, and pure highlights',
  },
  {
    id: 'warm-copper',
    name: 'Copper & Bronze',
    colors: ['#3d1e11', '#8c4820', '#d97d3e', '#e6a86e', '#fdf3e7'],
    description: 'Industrial metallics, warm terracotta, and gilded patina',
  },
];

interface ColorPaletteModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedPalette: ColorPaletteConfig | null;
  onSelectPalette: (palette: ColorPaletteConfig | null) => void;
}

export const ColorPaletteModal: React.FC<ColorPaletteModalProps> = ({
  isOpen,
  onClose,
  selectedPalette,
  onSelectPalette,
}) => {
  const [customColors, setCustomColors] = useState<string[]>(
    selectedPalette?.id === 'custom' ? selectedPalette.colors : ['#3b82f6', '#8b5cf6', '#ec4899']
  );
  const [newColorHex, setNewColorHex] = useState('#10b981');

  if (!isOpen) return null;

  const handleAddCustomColor = () => {
    if (customColors.length < 8 && !customColors.includes(newColorHex)) {
      setCustomColors([...customColors, newColorHex]);
    }
  };

  const handleRemoveCustomColor = (index: number) => {
    setCustomColors(customColors.filter((_, i) => i !== index));
  };

  const handleApplyCustom = () => {
    if (customColors.length === 0) return;
    onSelectPalette({
      id: 'custom',
      name: 'Custom Swatch',
      colors: customColors,
      description: 'User-defined color harmony',
    });
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg bg-brand-card border border-brand-border rounded-2xl shadow-2xl p-5 space-y-4 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-brand-border/60 pb-3">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-[var(--brand-accent)]/15 text-[var(--brand-accent)]">
              <Palette size={18} />
            </div>
            <div>
              <h2 className="text-sm font-bold text-brand-textMain">Color Palette Harmonizer</h2>
              <p className="text-[11px] text-brand-textMuted">
                Guide your image's lighting, mood, and color distribution
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-brand-textMuted hover:text-brand-textMain hover:bg-brand-hover transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        {/* Curated Palettes List */}
        <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-brand-textMuted px-0.5">
            Curated Color Schemes
          </div>
          <div className="grid grid-cols-1 gap-2">
            {CURATED_PALETTES.map((palette) => {
              const isSelected = selectedPalette?.id === palette.id;
              return (
                <button
                  key={palette.id}
                  onClick={() => {
                    onSelectPalette(palette);
                    onClose();
                  }}
                  className={`flex items-center justify-between p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                    isSelected
                      ? 'border-[var(--brand-accent)] bg-[var(--brand-accent)]/10 ring-1 ring-[var(--brand-accent)]/30'
                      : 'border-brand-border bg-brand-bg/40 hover:bg-brand-hover hover:border-brand-border'
                  }`}
                >
                  <div className="space-y-0.5 pr-2">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-semibold text-brand-textMain">{palette.name}</span>
                      {isSelected && <Check size={13} className="text-[var(--brand-accent)]" />}
                    </div>
                    <div className="text-[10px] text-brand-textMuted">{palette.description}</div>
                  </div>

                  {/* Swatches */}
                  <div className="flex items-center gap-1 shrink-0 p-1 rounded-lg bg-black/30 border border-white/5">
                    {palette.colors.map((c, i) => (
                      <div
                        key={i}
                        className="w-5 h-5 rounded-md shadow-sm border border-white/20"
                        style={{ backgroundColor: c }}
                        title={c}
                      />
                    ))}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Custom Palette Builder */}
        <div className="pt-2 border-t border-brand-border/60 space-y-2">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-brand-textMuted px-0.5">
            Custom Hex Swatch
          </div>

          <div className="flex items-center gap-2">
            <input
              type="color"
              value={newColorHex}
              onChange={(e) => setNewColorHex(e.target.value)}
              className="w-8 h-8 rounded-lg border border-brand-border bg-transparent cursor-pointer"
            />
            <input
              type="text"
              value={newColorHex}
              onChange={(e) => setNewColorHex(e.target.value)}
              className="ui-input py-1 px-2 text-xs font-mono w-24"
              placeholder="#rrggbb"
            />
            <button
              onClick={handleAddCustomColor}
              disabled={customColors.length >= 8}
              className="ui-btn py-1 px-2.5 text-xs flex items-center gap-1"
            >
              <Plus size={13} />
              <span>Add</span>
            </button>
          </div>

          {/* Current custom swatches */}
          <div className="flex items-center gap-2 p-2 rounded-xl bg-brand-bg/60 border border-brand-border">
            {customColors.map((hex, idx) => (
              <div key={idx} className="relative group">
                <div
                  className="w-7 h-7 rounded-lg border border-white/20 shadow-sm"
                  style={{ backgroundColor: hex }}
                  title={hex}
                />
                <button
                  onClick={() => handleRemoveCustomColor(idx)}
                  className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-rose-600 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                  title="Remove color"
                >
                  <X size={10} />
                </button>
              </div>
            ))}

            {customColors.length === 0 && (
              <span className="text-xs text-brand-textMuted italic">No colors added yet</span>
            )}
          </div>
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-between pt-2 border-t border-brand-border/60">
          <button
            onClick={() => {
              onSelectPalette(null);
              onClose();
            }}
            className="text-xs text-rose-400 hover:text-rose-300 transition-colors flex items-center gap-1 cursor-pointer"
          >
            <Trash2 size={13} />
            <span>Clear Palette</span>
          </button>

          <div className="flex items-center gap-2">
            <button onClick={onClose} className="ui-btn py-1.5 px-3 text-xs">
              Cancel
            </button>
            <button onClick={handleApplyCustom} className="ui-btn-primary py-1.5 px-3 text-xs">
              Use Custom Swatch
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
