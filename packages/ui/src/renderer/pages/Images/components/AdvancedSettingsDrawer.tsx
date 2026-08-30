import React, { useState } from 'react';
import {
  Sliders,
  ChevronDown,
  ChevronUp,
  Dice5,
  RotateCcw,
  Sparkles,
  Layers,
  Cpu,
} from 'lucide-react';
import { AdvancedSettingsState, AttachedReferenceImage } from '../types';

interface AdvancedSettingsDrawerProps {
  settings: AdvancedSettingsState;
  onChangeSettings: (next: AdvancedSettingsState) => void;
  defaultSteps: number;
  defaultCfg: number;
  referenceImage: AttachedReferenceImage | null;
  onChangeRefStrength: (strength: number) => void;
}

const COMMON_NEGATIVES = [
  'blurry',
  'low quality',
  'distorted',
  'watermark',
  'bad anatomy',
  'cropped',
  'deformed eyes',
];

const SAMPLERS = [
  { id: 'euler_a', label: 'Euler A (Fast)' },
  { id: 'euler', label: 'Euler (Standard)' },
  { id: 'dpm++2m', label: 'DPM++ 2M (Detailed)' },
  { id: 'dpm++2m_karras', label: 'DPM++ 2M Karras' },
  { id: 'ddim', label: 'DDIM (Deterministic)' },
];

export const AdvancedSettingsDrawer: React.FC<AdvancedSettingsDrawerProps> = ({
  settings,
  onChangeSettings,
  defaultSteps,
  defaultCfg,
  referenceImage,
  onChangeRefStrength,
}) => {
  const [isOpen, setIsOpen] = useState(false);

  // Count how many values differ from base defaults
  let customizedCount = 0;
  if (settings.steps !== defaultSteps) customizedCount++;
  if (Math.abs(settings.cfgScale - defaultCfg) > 0.1) customizedCount++;
  if (settings.seed !== null) customizedCount++;
  if (settings.negativePrompt.trim().length > 0) customizedCount++;
  if (settings.sampler !== 'euler_a') customizedCount++;
  if (settings.mode !== 'auto') customizedCount++;

  const handleRandomSeed = () => {
    onChangeSettings({
      ...settings,
      seed: Math.floor(Math.random() * 2147483647),
    });
  };

  const handleResetDefaults = () => {
    onChangeSettings({
      ...settings,
      steps: defaultSteps,
      cfgScale: defaultCfg,
      seed: null,
      sampler: 'euler_a',
      negativePrompt: '',
      mode: 'auto',
    });
  };

  const handleToggleNegativeChip = (chip: string) => {
    const current = settings.negativePrompt;
    if (current.includes(chip)) {
      const updated = current
        .replace(new RegExp(`(^|,\\s*)${chip}`, 'gi'), '')
        .replace(/^,\s*/, '')
        .trim();
      onChangeSettings({ ...settings, negativePrompt: updated });
    } else {
      const updated = current.trim() ? `${current.trim()}, ${chip}` : chip;
      onChangeSettings({ ...settings, negativePrompt: updated });
    }
  };

  return (
    <div className="border border-brand-border rounded-xl bg-brand-card/50 overflow-hidden transition-all">
      {/* ── Single-Click Accordion Header ── */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full px-3 py-2.5 flex items-center justify-between hover:bg-brand-hover/40 transition-colors cursor-pointer text-left select-none"
      >
        <div className="flex items-center gap-2">
          <Sliders size={14} className="text-[var(--brand-accent)]" />
          <span className="text-xs font-semibold text-brand-textMain">Advanced Settings</span>
          {customizedCount > 0 && (
            <span className="px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-[var(--brand-accent)]/20 text-[var(--brand-accent)] border border-[var(--brand-accent)]/30">
              {customizedCount} active
            </span>
          )}
        </div>

        <div className="flex items-center gap-2 text-brand-textMuted">
          <span className="text-[11px] font-mono">
            {settings.steps} steps / CFG {settings.cfgScale.toFixed(1)}
          </span>
          {isOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </div>
      </button>

      {/* ── Collapsible Content Panel ── */}
      {isOpen && (
        <div className="p-3 border-t border-brand-border/60 space-y-3.5 bg-brand-bg/30 animate-in fade-in duration-150">
          {/* Reference Image Denoising Strength (if attached) */}
          {referenceImage && (
            <div className="p-2 rounded-lg bg-[var(--brand-accent)]/10 border border-[var(--brand-accent)]/20 space-y-1">
              <div className="flex justify-between text-xs">
                <span className="font-semibold text-brand-textMain">
                  Image Influence (Strength)
                </span>
                <span className="font-mono text-[var(--brand-accent)] font-bold">
                  {referenceImage.strength.toFixed(2)}
                </span>
              </div>
              <input
                type="range"
                min={0.1}
                max={0.95}
                step={0.05}
                value={referenceImage.strength}
                onChange={(e) => onChangeRefStrength(Number(e.target.value))}
                className="w-full accent-[var(--brand-accent)] cursor-pointer"
              />
              <div className="flex justify-between text-[10px] text-brand-textMuted">
                <span>Subtle Variation</span>
                <span>Complete Reimagine</span>
              </div>
            </div>
          )}

          {/* Steps & CFG Sliders */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <div className="flex justify-between text-xs">
                <span className="text-brand-textMain font-medium">Steps</span>
                <span className="font-mono text-brand-textMuted">{settings.steps}</span>
              </div>
              <input
                type="range"
                min={1}
                max={50}
                value={settings.steps}
                onChange={(e) =>
                  onChangeSettings({ ...settings, steps: Number(e.target.value) })
                }
                className="w-full accent-[var(--brand-accent)] cursor-pointer"
              />
            </div>

            <div className="space-y-1">
              <div className="flex justify-between text-xs">
                <span className="text-brand-textMain font-medium">CFG Scale</span>
                <span className="font-mono text-brand-textMuted">
                  {settings.cfgScale.toFixed(1)}
                </span>
              </div>
              <input
                type="range"
                min={1.0}
                max={15.0}
                step={0.5}
                value={settings.cfgScale}
                onChange={(e) =>
                  onChangeSettings({ ...settings, cfgScale: Number(e.target.value) })
                }
                className="w-full accent-[var(--brand-accent)] cursor-pointer"
              />
            </div>
          </div>

          {/* Sampler Selector */}
          <div className="space-y-1">
            <label className="ui-label">Sampling Method</label>
            <select
              value={settings.sampler}
              onChange={(e) =>
                onChangeSettings({ ...settings, sampler: e.target.value })
              }
              className="ui-select w-full text-xs"
            >
              {SAMPLERS.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>

          {/* Seed Input */}
          <div className="space-y-1">
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium text-brand-textMain">Seed</span>
              <button
                type="button"
                onClick={handleRandomSeed}
                className="flex items-center gap-1 text-[11px] text-[var(--brand-accent)] hover:underline cursor-pointer"
              >
                <Dice5 size={12} />
                <span>Randomize</span>
              </button>
            </div>
            <input
              type="number"
              placeholder="Random (leave empty or click dice)"
              value={settings.seed !== null ? settings.seed : ''}
              onChange={(e) =>
                onChangeSettings({
                  ...settings,
                  seed: e.target.value ? Number(e.target.value) : null,
                })
              }
              className="ui-input w-full p-2 text-xs font-mono placeholder:text-brand-textMuted/40"
            />
          </div>

          {/* Negative Prompt */}
          <div className="space-y-1.5">
            <label className="ui-label">Negative Prompt</label>
            <textarea
              rows={2}
              placeholder="What to exclude from the image (e.g. blurry, low quality, artifacts)..."
              value={settings.negativePrompt}
              onChange={(e) =>
                onChangeSettings({ ...settings, negativePrompt: e.target.value })
              }
              className="ui-input w-full p-2 text-xs resize-none placeholder:text-brand-textMuted/50"
            />
            {/* Quick 1-click exclusion chips */}
            <div className="flex flex-wrap gap-1">
              {COMMON_NEGATIVES.map((tag) => {
                const isActive = settings.negativePrompt.includes(tag);
                return (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => handleToggleNegativeChip(tag)}
                    className={`px-1.5 py-0.5 rounded text-[10px] border transition-colors cursor-pointer ${
                      isActive
                        ? 'bg-rose-500/20 text-rose-300 border-rose-500/40'
                        : 'bg-brand-bg/50 text-brand-textMuted border-brand-border hover:text-brand-textMain'
                    }`}
                  >
                    {isActive ? `✕ ${tag}` : `+ ${tag}`}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Reset Button */}
          {customizedCount > 0 && (
            <div className="pt-1 flex justify-end">
              <button
                type="button"
                onClick={handleResetDefaults}
                className="text-[11px] text-brand-textMuted hover:text-brand-textMain flex items-center gap-1 cursor-pointer"
              >
                <RotateCcw size={11} />
                <span>Reset to Model Defaults</span>
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
