import React from 'react';
import { X, SlidersHorizontal, Shuffle, Clock, Layers, Sparkles, Wand2 } from 'lucide-react';
import { AdvancedVideoSettingsState } from '../types';

export interface VideoAdvancedSettingsDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  settings: AdvancedVideoSettingsState;
  onChangeSettings: (settings: AdvancedVideoSettingsState) => void;
}

export const VideoAdvancedSettingsDrawer: React.FC<VideoAdvancedSettingsDrawerProps> = ({
  isOpen,
  onClose,
  settings,
  onChangeSettings,
}) => {
  if (!isOpen) return null;

  const update = (partial: Partial<AdvancedVideoSettingsState>) => {
    onChangeSettings({ ...settings, ...partial });
  };

  const generateRandomSeed = () => {
    update({ seed: Math.floor(Math.random() * 2147483647) });
  };

  return (
    <div className="absolute top-0 right-0 bottom-0 w-80 bg-neutral-900 border-l border-neutral-800 shadow-2xl z-40 p-4 flex flex-col justify-between overflow-y-auto custom-scrollbar backdrop-blur-2xl animate-in slide-in-from-right duration-200">
      <div className="flex flex-col gap-4">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-neutral-800">
          <div className="flex items-center gap-2">
            <SlidersHorizontal className="w-4 h-4 text-violet-400" />
            <h3 className="text-xs font-semibold text-neutral-200">Advanced Video Parameters</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-md text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Negative Prompt */}
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium text-neutral-300">Negative Prompt</label>
          <textarea
            value={settings.negativePrompt}
            onChange={(e) => update({ negativePrompt: e.target.value })}
            placeholder="blurry, distorted, artifacts, static, jittery, low quality, oversaturated..."
            rows={2}
            className="w-full bg-neutral-950/80 border border-neutral-800 rounded-xl px-3 py-2 text-xs text-neutral-200 placeholder-neutral-500 outline-none focus:border-violet-600 resize-none"
          />
        </div>

        {/* Frames / Duration */}
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between text-xs">
            <span className="font-medium text-neutral-300">Total Frames</span>
            <span className="font-mono text-neutral-400">
              {settings.numFrames} frames (~{(settings.numFrames / settings.fps).toFixed(1)}s)
            </span>
          </div>
          <input
            type="range"
            min="25"
            max="121"
            step="8"
            value={settings.numFrames}
            onChange={(e) => update({ numFrames: parseInt(e.target.value, 10) })}
            className="w-full h-1.5 bg-neutral-800 rounded-lg appearance-none cursor-pointer accent-violet-500"
          />
        </div>

        {/* Frame Rate (FPS) */}
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium text-neutral-300">Frame Rate (FPS)</label>
          <div className="grid grid-cols-4 gap-1.5">
            {[16, 24, 30, 60].map((fps) => (
              <button
                key={fps}
                type="button"
                onClick={() => update({ fps })}
                className={`py-1.5 text-xs font-medium rounded-lg border transition-all ${
                  settings.fps === fps
                    ? 'bg-neutral-800 border-violet-600 text-white shadow-sm'
                    : 'bg-neutral-950 border-neutral-800 text-neutral-400 hover:text-neutral-200'
                }`}
              >
                {fps} fps
              </button>
            ))}
          </div>
        </div>

        {/* Denoising Steps */}
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between text-xs">
            <span className="font-medium text-neutral-300">Inference Steps</span>
            <span className="font-mono text-neutral-400">{settings.steps} steps</span>
          </div>
          <input
            type="range"
            min="10"
            max="50"
            step="1"
            value={settings.steps}
            onChange={(e) => update({ steps: parseInt(e.target.value, 10) })}
            className="w-full h-1.5 bg-neutral-800 rounded-lg appearance-none cursor-pointer accent-violet-500"
          />
        </div>

        {/* Guidance Scale (CFG) */}
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between text-xs">
            <span className="font-medium text-neutral-300">Guidance Scale (CFG)</span>
            <span className="font-mono text-neutral-400">{settings.cfgScale.toFixed(1)}</span>
          </div>
          <input
            type="range"
            min="1.0"
            max="12.0"
            step="0.5"
            value={settings.cfgScale}
            onChange={(e) => update({ cfgScale: parseFloat(e.target.value) })}
            className="w-full h-1.5 bg-neutral-800 rounded-lg appearance-none cursor-pointer accent-violet-500"
          />
        </div>

        {/* Seed */}
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between text-xs">
            <label className="font-medium text-neutral-300">Generation Seed</label>
            <button
              type="button"
              onClick={generateRandomSeed}
              className="flex items-center gap-1 text-[11px] text-violet-400 hover:text-violet-300"
            >
              <Shuffle className="w-3 h-3" />
              <span>Randomize</span>
            </button>
          </div>
          <input
            type="number"
            value={settings.seed}
            onChange={(e) => update({ seed: parseInt(e.target.value, 10) || 0 })}
            className="w-full bg-neutral-950/80 border border-neutral-800 rounded-xl px-3 py-1.5 text-xs font-mono text-neutral-200 outline-none focus:border-violet-600"
          />
        </div>

        {/* 2x Frame Interpolation Toggle */}
        <div className="flex items-center justify-between p-3 bg-neutral-950/80 border border-neutral-800 rounded-xl mt-1">
          <div className="flex flex-col">
            <span className="text-xs font-medium text-neutral-200">2x Frame Interpolation</span>
            <span className="text-[10px] text-neutral-400">Smoothens video to 60fps via optical flow</span>
          </div>
          <input
            type="checkbox"
            checked={settings.interpolate2x}
            onChange={(e) => update({ interpolate2x: e.target.checked })}
            className="w-4 h-4 rounded bg-neutral-800 border-neutral-700 text-violet-600 focus:ring-0 cursor-pointer"
          />
        </div>
      </div>

      <button
        type="button"
        onClick={onClose}
        className="w-full mt-6 py-2 bg-neutral-800 hover:bg-neutral-700 text-neutral-200 rounded-xl text-xs font-semibold transition-colors"
      >
        Done
      </button>
    </div>
  );
};
