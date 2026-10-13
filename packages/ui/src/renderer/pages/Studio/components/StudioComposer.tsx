import React, { useState } from 'react';
import {
  Wand2,
  Sparkles,
  Layers,
  Box,
  Image as ImageIcon,
  Cpu,
  Sliders,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  FolderOpen,
} from 'lucide-react';
import {
  ThreeDModelInfo,
  ThreeDModality,
  ThreeDOutputFormat,
  ThreeDProgressEvent,
} from '../../../services/threeDService';
import { StylePresetOption } from './types';

export interface StudioComposerProps {
  prompt: string;
  onPromptChange: (val: string) => void;
  modality: ThreeDModality;
  onModalityChange: (val: ThreeDModality) => void;
  selectedModel: string;
  onSelectedModelChange: (val: string) => void;
  models: ThreeDModelInfo[];
  outputFormat: ThreeDOutputFormat;
  onOutputFormatChange: (val: ThreeDOutputFormat) => void;
  conceptImage: string | null;
  onPickImage?: () => void;
  isGenerating: boolean;
  onGenerate: () => void;
  progress: ThreeDProgressEvent | null;
  triggerToast?: (msg: string, type?: 'info' | 'error') => void;
}

const STYLE_PRESETS: StylePresetOption[] = [
  {
    id: 'cyberpunk-city',
    label: 'Cyberpunk Metropolis',
    category: 'world',
    description: 'Neon-lit skyscrapers, road grid, holographic displays and atmospheric fog',
    promptModifier: 'cyberpunk metropolis city with neon towers, dark asphalt road, glowing antenna spires, volumetric atmospheric fog, futuristic architecture',
  },
  {
    id: 'modern-loft',
    label: 'Modern Loft',
    category: 'world',
    description: 'Executive room with floor-to-ceiling walls, wooden desk, and sleek furniture',
    promptModifier: 'modern minimalist architectural loft interior, polished hardwood floor, executive desk, command console, ambient architectural lighting',
  },
  {
    id: 'scifi-bridge',
    label: 'Sci-Fi Command Deck',
    category: 'world',
    description: 'High-tech spacecraft bridge with central hologram table and displays',
    promptModifier: 'sci-fi spacecraft bridge command deck with central hologram console, metallic walls, hexagonal panels, blue LED status lights',
  },
  {
    id: 'landscape',
    label: 'Mountain Plateau',
    category: 'world',
    description: 'Terraced rocky landscape with grassy plains and crystal water',
    promptModifier: 'mountain terrain plateau with terraced rock formations, grass plateaus, central crystal stream, alpine nature landscape',
  },
  {
    id: 'exo-avatar',
    label: 'Exosuit Android',
    category: 'character',
    description: 'Futuristic humanoid android in titanium armor with glowing core',
    promptModifier: 'futuristic humanoid combat android in titanium ceramic armor plates, glowing chest core, gold optical visor, robotic hero',
  },
  {
    id: 'cad-part',
    label: 'Industrial CAD Part',
    category: 'cad',
    description: 'Mechanical bracket / technical solid ready for 3D printing',
    promptModifier: 'precision mechanical mounting bracket, beveled edges, countersunk bolt holes, high-strength industrial engineering CAD solid',
  },
];

export const StudioComposer: React.FC<StudioComposerProps> = ({
  prompt,
  onPromptChange,
  modality,
  onModalityChange,
  selectedModel,
  onSelectedModelChange,
  models,
  outputFormat,
  onOutputFormatChange,
  conceptImage,
  onPickImage,
  isGenerating,
  onGenerate,
  progress,
  triggerToast,
}) => {
  const [isAdvancedOpen, setIsAdvancedOpen] = useState(false);
  const [polyBudget, setPolyBudget] = useState<'low' | 'standard' | 'ultra'>('standard');
  const [textureRes, setTextureRes] = useState<number>(2048);

  const handleApplyPreset = (preset: StylePresetOption) => {
    onPromptChange(preset.promptModifier);
    if (preset.category === 'world') {
      onModalityChange('world_gen');
    } else if (preset.category === 'character') {
      onModalityChange('character_avatar');
    } else if (preset.category === 'cad') {
      onModalityChange('cad_solid');
    } else {
      onModalityChange('text_to_3d');
    }
    if (triggerToast) {
      triggerToast(`Loaded "${preset.label}" preset.`);
    }
  };

  const handleEnhancePrompt = () => {
    if (!prompt.trim()) {
      if (triggerToast) triggerToast('Type a prompt first to enhance.', 'error');
      return;
    }
    const enhanced = `${prompt.trim()}, highly detailed, photorealistic PBR materials, 8k textures, clean manifold geometry, cinematic dramatic lighting`;
    onPromptChange(enhanced);
    if (triggerToast) triggerToast('Prompt enhanced with SOTA spatial keywords.');
  };

  return (
    <aside className="w-80 lg:w-96 flex flex-col border-r border-[var(--brand-border)] bg-[var(--brand-bg)]/95 backdrop-blur-md shrink-0 h-full overflow-hidden select-none z-10">
      {/* ── Mode Selection Pills ── */}
      <div className="p-3 border-b border-[var(--brand-border)]/60 bg-black/20 shrink-0">
        <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1.5 block">
          Spatial Generation Mode
        </label>
        <div className="grid grid-cols-2 gap-1.5">
          <button
            type="button"
            onClick={() => onModalityChange('world_gen')}
            className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-all ${
              modality === 'world_gen'
                ? 'bg-sky-500/20 text-sky-300 border border-sky-400/50 shadow-sm'
                : 'text-slate-400 hover:text-slate-200 border border-transparent hover:bg-slate-800/40'
            }`}
          >
            <Layers size={13} className={modality === 'world_gen' ? 'text-sky-400' : ''} />
            <span>World & Rooms</span>
          </button>

          <button
            type="button"
            onClick={() => onModalityChange('text_to_3d')}
            className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-all ${
              modality === 'text_to_3d'
                ? 'bg-sky-500/20 text-sky-300 border border-sky-400/50 shadow-sm'
                : 'text-slate-400 hover:text-slate-200 border border-transparent hover:bg-slate-800/40'
            }`}
          >
            <Box size={13} className={modality === 'text_to_3d' ? 'text-sky-400' : ''} />
            <span>3D Assets & Props</span>
          </button>

          <button
            type="button"
            onClick={() => onModalityChange('image_to_3d')}
            className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-all ${
              modality === 'image_to_3d'
                ? 'bg-sky-500/20 text-sky-300 border border-sky-400/50 shadow-sm'
                : 'text-slate-400 hover:text-slate-200 border border-transparent hover:bg-slate-800/40'
            }`}
          >
            <ImageIcon size={13} className={modality === 'image_to_3d' ? 'text-sky-400' : ''} />
            <span>Image to 3D</span>
          </button>

          <button
            type="button"
            onClick={() => onModalityChange('cad_solid')}
            className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-all ${
              modality === 'cad_solid'
                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-400/50 shadow-sm'
                : 'text-slate-400 hover:text-slate-200 border border-transparent hover:bg-slate-800/40'
            }`}
          >
            <Cpu size={13} className={modality === 'cad_solid' ? 'text-emerald-400' : ''} />
            <span>CAD / Print Solid</span>
          </button>
        </div>
      </div>

      {/* ── Scrollable Parameters Container ── */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">
        {/* Model Engine Selector */}
        <div className="space-y-1.5">
          <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 flex items-center justify-between">
            <span>3D Engine / Model</span>
            <span className="text-[9px] text-sky-400 font-normal">Pluggable</span>
          </label>
          <div className="relative">
            <select
              value={selectedModel}
              onChange={(e) => onSelectedModelChange(e.target.value)}
              className="w-full rounded-xl border border-[var(--brand-border)] bg-slate-900/90 px-3 py-2 text-xs text-white outline-none focus:border-sky-500 transition-all cursor-pointer"
            >
              {models.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name} {m.is_downloaded ? '✓' : ''}
                </option>
              ))}
              {models.length === 0 && (
                <option value="procedural-world-v1">
                  Procedural Spatial World Kernel (Built-in)
                </option>
              )}
            </select>
          </div>
        </div>

        {/* Image to 3D Input (when active) */}
        {modality === 'image_to_3d' && (
          <div className="space-y-1.5">
            <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
              Reference Concept Image
            </label>
            <div
              onClick={onPickImage}
              className="border-2 border-dashed border-slate-700 hover:border-sky-500/60 rounded-xl p-3 flex flex-col items-center justify-center cursor-pointer transition-all bg-slate-900/40 hover:bg-slate-900/80 text-center"
            >
              {conceptImage ? (
                <div className="relative group w-full flex items-center justify-center">
                  <img
                    src={`file:///${conceptImage.replace(/\\/g, '/')}`}
                    alt="Concept preview"
                    className="max-h-24 rounded-lg object-contain shadow-md"
                  />
                  <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 flex items-center justify-center rounded-lg transition-opacity text-xs font-semibold text-white">
                    Click to change
                  </div>
                </div>
              ) : (
                <>
                  <FolderOpen size={20} className="text-slate-400 mb-1" />
                  <span className="text-xs font-medium text-slate-300">Click to pick reference image</span>
                  <span className="text-[10px] text-slate-500 mt-0.5">PNG, JPG, WEBP</span>
                </>
              )}
            </div>
          </div>
        )}

        {/* Prompt Input */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
              Spatial Description / Prompt
            </label>
            <button
              type="button"
              onClick={handleEnhancePrompt}
              className="text-[10px] text-sky-400 hover:text-sky-300 flex items-center gap-1 font-semibold transition-colors"
            >
              <Wand2 size={11} />
              <span>Enhance</span>
            </button>
          </div>
          <div className="relative">
            <textarea
              rows={4}
              value={prompt}
              onChange={(e) => onPromptChange(e.target.value)}
              placeholder="Describe your 3D world, room, or character in detail (e.g. 'Cyberpunk city street with neon signs and futuristic highrises')..."
              className="w-full rounded-xl border border-[var(--brand-border)] bg-slate-900/90 p-3 text-xs text-white placeholder-slate-500 outline-none focus:border-sky-500 transition-all resize-none font-sans leading-relaxed"
            />
          </div>
        </div>

        {/* Presets Carousel */}
        <div className="space-y-1.5">
          <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1">
            <Sparkles size={11} className="text-amber-400" />
            <span>World & Asset Presets</span>
          </label>
          <div className="grid grid-cols-2 gap-1.5">
            {STYLE_PRESETS.map((preset) => (
              <button
                key={preset.id}
                type="button"
                onClick={() => handleApplyPreset(preset)}
                className="p-2 rounded-xl border border-[var(--brand-border)]/50 bg-slate-900/60 hover:bg-slate-850 hover:border-sky-500/50 text-left transition-all group cursor-pointer"
              >
                <div className="text-xs font-semibold text-slate-200 group-hover:text-sky-300 transition-colors">
                  {preset.label}
                </div>
                <div className="text-[9px] text-slate-400 truncate mt-0.5">
                  {preset.description}
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Output Format Picker */}
        <div className="space-y-1.5">
          <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
            Export Format
          </label>
          <div className="grid grid-cols-4 gap-1">
            {(['glb', 'obj', 'ply', 'stl'] as ThreeDOutputFormat[]).map((fmt) => (
              <button
                key={fmt}
                type="button"
                onClick={() => onOutputFormatChange(fmt)}
                className={`py-1.5 rounded-lg text-xs font-bold uppercase transition-all ${
                  outputFormat === fmt
                    ? 'bg-sky-500/20 text-sky-300 border border-sky-400/50 shadow-sm'
                    : 'text-slate-400 border border-[var(--brand-border)]/40 hover:bg-slate-800'
                }`}
              >
                .{fmt}
              </button>
            ))}
          </div>
        </div>

        {/* Advanced Settings Accordion */}
        <div className="border border-[var(--brand-border)]/60 rounded-xl overflow-hidden bg-slate-900/40">
          <button
            type="button"
            onClick={() => setIsAdvancedOpen(!isAdvancedOpen)}
            className="w-full px-3 py-2.5 flex items-center justify-between text-xs font-semibold text-slate-300 hover:text-white transition-colors"
          >
            <div className="flex items-center gap-1.5">
              <Sliders size={13} className="text-sky-400" />
              <span>Advanced Topology & Quality</span>
            </div>
            {isAdvancedOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>

          {isAdvancedOpen && (
            <div className="p-3 border-t border-[var(--brand-border)]/40 space-y-3 bg-black/20">
              <div className="space-y-1">
                <label className="text-[10px] text-slate-400 font-medium">Polygon Budget</label>
                <div className="grid grid-cols-3 gap-1">
                  {(['low', 'standard', 'ultra'] as const).map((b) => (
                    <button
                      key={b}
                      type="button"
                      onClick={() => setPolyBudget(b)}
                      className={`py-1 rounded-md text-[10px] font-bold uppercase ${
                        polyBudget === b
                          ? 'bg-sky-600 text-white'
                          : 'bg-slate-800 text-slate-400 hover:text-white'
                      }`}
                    >
                      {b}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] text-slate-400 font-medium">PBR Texture Resolution</label>
                <div className="grid grid-cols-3 gap-1">
                  {[1024, 2048, 4096].map((res) => (
                    <button
                      key={res}
                      type="button"
                      onClick={() => setTextureRes(res)}
                      className={`py-1 rounded-md text-[10px] font-bold ${
                        textureRes === res
                          ? 'bg-sky-600 text-white'
                          : 'bg-slate-800 text-slate-400 hover:text-white'
                      }`}
                    >
                      {res}px
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Footer CTA Button & Progress Bar ── */}
      <div className="p-4 border-t border-[var(--brand-border)] bg-slate-900/60 shrink-0 space-y-2">
        {isGenerating && progress && (
          <div className="space-y-1">
            <div className="flex items-center justify-between text-[10px] text-slate-400">
              <span>{progress.message || 'Synthesizing 3D scene...'}</span>
              <span className="font-bold text-sky-400">{Math.round(progress.percentage || 0)}%</span>
            </div>
            <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
              <div
                className="bg-gradient-to-r from-sky-500 to-indigo-500 h-full transition-all duration-300"
                style={{ width: `${progress.percentage || 15}%` }}
              />
            </div>
          </div>
        )}

        <button
          type="button"
          onClick={onGenerate}
          disabled={isGenerating || !prompt.trim()}
          className="w-full py-2.5 rounded-xl bg-gradient-to-r from-sky-500 to-indigo-600 hover:from-sky-400 hover:to-indigo-500 text-white font-bold text-xs shadow-lg shadow-sky-500/20 flex items-center justify-center gap-2 transition-all disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed"
        >
          {isGenerating ? (
            <>
              <RefreshCw size={14} className="animate-spin text-white" />
              <span>Building Spatial Scene...</span>
            </>
          ) : (
            <>
              <Sparkles size={14} className="text-amber-300" />
              <span>{modality === 'world_gen' ? 'Build Spatial World' : 'Generate 3D Asset'}</span>
            </>
          )}
        </button>
      </div>
    </aside>
  );
};
