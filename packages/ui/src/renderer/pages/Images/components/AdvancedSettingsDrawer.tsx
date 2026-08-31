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
  Info,
  HelpCircle,
  Zap,
} from 'lucide-react';
import { AdvancedSettingsState, AttachedReferenceImage } from '../types';
import { Select } from '../../../components/ui/Select';

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

const SAMPLER_OPTIONS = SAMPLERS.map((s) => ({ value: s.id, label: s.label }));

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
          {/* Quick Quality Presets */}
          <div className="space-y-1">
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-brand-textMuted font-medium flex items-center gap-1">
                <Zap size={11} className="text-amber-400" />
                <span>Quick Presets</span>
              </span>
              <span className="text-[10px] text-brand-textMuted font-mono">Steps & Guidance</span>
            </div>
            <div className="grid grid-cols-3 gap-1.5">
              <button
                type="button"
                onClick={() =>
                  onChangeSettings({
                    ...settings,
                    steps: Math.max(8, Math.round(defaultSteps * 0.7)),
                    cfgScale: Math.max(3.5, defaultCfg - 1.0),
                  })
                }
                className="px-2 py-1 rounded-lg text-[11px] bg-brand-card/70 border border-brand-border hover:border-brand-textMuted/50 hover:text-brand-textMain text-brand-textMuted transition-colors cursor-pointer text-center"
              >
                ⚡ Fast Draft
              </button>
              <button
                type="button"
                onClick={() =>
                  onChangeSettings({
                    ...settings,
                    steps: defaultSteps,
                    cfgScale: defaultCfg,
                  })
                }
                className="px-2 py-1 rounded-lg text-[11px] bg-brand-card/70 border border-brand-border hover:border-brand-textMuted/50 hover:text-brand-textMain text-brand-textMuted transition-colors cursor-pointer text-center"
              >
                ⚖️ Balanced
              </button>
              <button
                type="button"
                onClick={() =>
                  onChangeSettings({
                    ...settings,
                    steps: Math.min(50, Math.round(defaultSteps * 1.4)),
                    cfgScale: Math.min(12, defaultCfg + 1.0),
                  })
                }
                className="px-2 py-1 rounded-lg text-[11px] bg-brand-card/70 border border-brand-border hover:border-brand-textMuted/50 hover:text-brand-textMain text-brand-textMuted transition-colors cursor-pointer text-center"
              >
                ✨ Ultra Detail
              </button>
            </div>
          </div>

          {/* Reference Image Denoising Strength (if attached) */}
          {referenceImage && (
            <div className="p-2.5 rounded-lg bg-[var(--brand-accent)]/10 border border-[var(--brand-accent)]/20 space-y-1.5">
              <div className="flex justify-between text-xs">
                <span className="font-semibold text-brand-textMain flex items-center gap-1">
                  <span>Image Influence (Strength)</span>
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
                <span>Subtle Variation (0.2)</span>
                <span>Balanced (0.65)</span>
                <span>Reimagine (0.9)</span>
              </div>
            </div>
          )}

          {/* Steps & CFG Sliders */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <div className="flex justify-between text-xs">
                <span className="text-brand-textMain font-medium" title="Number of denoising iterations">
                  Steps
                </span>
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
              <p className="text-[10px] text-brand-textMuted">
                Denoising passes (FLUX: 4-8, SD: 20-30)
              </p>
            </div>

            <div className="space-y-1">
              <div className="flex justify-between text-xs">
                <span className="text-brand-textMain font-medium" title="Classifier-Free Guidance weight">
                  CFG Scale
                </span>
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
              <p className="text-[10px] text-brand-textMuted">
                Prompt adherence strictness (default ~7.0)
              </p>
            </div>
          </div>

          {/* Sampler Selector */}
          <div className="space-y-1">
            <div className="flex items-center justify-between text-xs">
              <label className="ui-label">Sampling Method</label>
              <span className="text-[10px] text-brand-textMuted">ODE / SDE Solver</span>
            </div>
            <Select
              options={SAMPLER_OPTIONS}
              value={settings.sampler}
              onChange={(value) =>
                onChangeSettings({ ...settings, sampler: value })
              }
              className="w-full text-xs"
            />
          </div>

          {/* Seed Input */}
          <div className="space-y-1">
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium text-brand-textMain">Generation Seed</span>
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
              placeholder="Random seed (leave empty for new result)"
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
            <div className="flex items-center justify-between text-xs">
              <label className="ui-label">Negative Prompt</label>
              <span className="text-[10px] text-brand-textMuted">Suppressed tokens</span>
            </div>
            <textarea
              rows={2}
              placeholder="What to exclude (e.g. blurry, low quality, bad anatomy, cropped)..."
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
