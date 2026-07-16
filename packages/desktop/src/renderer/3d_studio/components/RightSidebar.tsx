import React from 'react';
import {
  FolderOpen,
  Layers,
  Move,
  Palette,
  Plus,
  Trash2,
  Box,
  Bone,
  Eye,
  EyeOff
} from 'lucide-react';
import { SavedModel, TransformState } from './types';

const PRESETS = [
  { id: 'preset-1', name: 'Chibi Model v3', img: 'chibi' },
  { id: 'preset-2', name: 'Steampunk Explorer', img: 'steampunk' },
  { id: 'preset-3', name: 'Robot Companion', img: 'robot' },
  { id: 'preset-4', name: 'Cyberpunk Bunny', img: 'bunny' },
  { id: 'preset-5', name: 'Low Poly Hero', img: 'lowpoly' }
];

interface RightSidebarProps {
  rightSidebarTab: 'library' | 'scene' | 'transform' | 'material';
  onRightSidebarTabChange: (tab: 'library' | 'scene' | 'transform' | 'material') => void;
  savedModels: SavedModel[];
  onImportToPet: (path?: string) => void;
  onDeleteModel: (path: string, e: React.MouseEvent) => void;
  onImportExternalModel: () => void;
  selectedPresetId: string;
  onPresetSelect: (presetId: string, name: string) => void;
  visibleNodes: Record<string, boolean>;
  onVisibleNodesChange: (nodes: Record<string, boolean>) => void;
  modelPosition: TransformState;
  onModelPositionChange: (val: TransformState) => void;
  modelRotation: TransformState;
  onModelRotationChange: (val: TransformState) => void;
  modelScale: TransformState;
  onModelScaleChange: (val: TransformState) => void;
  materialColor: string;
  onMaterialColorChange: (val: string) => void;
  materialRoughness: number;
  onMaterialRoughnessChange: (val: number) => void;
  materialMetalness: number;
  onMaterialMetalnessChange: (val: number) => void;
  triggerToast: (msg: string, type?: 'info' | 'error') => void;
}

export const RightSidebar: React.FC<RightSidebarProps> = ({
  rightSidebarTab,
  onRightSidebarTabChange,
  savedModels,
  onImportToPet,
  onDeleteModel,
  onImportExternalModel,
  selectedPresetId,
  onPresetSelect,
  visibleNodes,
  onVisibleNodesChange,
  modelPosition,
  onModelPositionChange,
  modelRotation,
  onModelRotationChange,
  modelScale,
  onModelScaleChange,
  materialColor,
  onMaterialColorChange,
  materialRoughness,
  onMaterialRoughnessChange,
  materialMetalness,
  onMaterialMetalnessChange,
  triggerToast
}) => {
  const applyMaterialPreset = (preset: 'clay' | 'chrome' | 'gold' | 'hologram' | 'plastic') => {
    switch (preset) {
      case 'clay':
        onMaterialColorChange('#94a3b8');
        onMaterialRoughnessChange(0.9);
        onMaterialMetalnessChange(0.0);
        break;
      case 'chrome':
        onMaterialColorChange('#f1f5f9');
        onMaterialRoughnessChange(0.05);
        onMaterialMetalnessChange(0.95);
        break;
      case 'gold':
        onMaterialColorChange('#eab308');
        onMaterialRoughnessChange(0.15);
        onMaterialMetalnessChange(0.85);
        break;
      case 'hologram':
        onMaterialColorChange('#06b6d4');
        onMaterialRoughnessChange(0.2);
        onMaterialMetalnessChange(0.5);
        break;
      case 'plastic':
        onMaterialColorChange('#ef4444');
        onMaterialRoughnessChange(0.4);
        onMaterialMetalnessChange(0.1);
        break;
    }
    triggerToast(`Applied ${preset} material preset.`);
  };

  return (
    <aside className="w-[260px] border-l border-[var(--brand-border)]/80 bg-[var(--brand-bg)]/90 flex flex-col z-10 shrink-0 select-none">
      {/* Side tabs */}
      <div className="flex border-b border-[var(--brand-border)] p-1 bg-slate-950">
        {[
          { id: 'library', Icon: FolderOpen },
          { id: 'scene', Icon: Layers },
          { id: 'transform', Icon: Move },
          { id: 'material', Icon: Palette }
        ].map((tab) => {
          const isSelected = rightSidebarTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => onRightSidebarTabChange(tab.id as any)}
              className={`flex-1 py-2 flex items-center justify-center rounded-lg transition-all cursor-pointer ${
                isSelected
                  ? 'bg-slate-800 text-white border border-slate-700'
                  : 'text-slate-500 hover:text-slate-300'
              }`}
              title={tab.id.toUpperCase()}
            >
              <tab.Icon size={14} />
            </button>
          );
        })}
      </div>

      <div className="flex-1 overflow-y-auto p-4 custom-scrollbar flex flex-col gap-4">
        
        {/* LIBRARY TAB */}
        {rightSidebarTab === 'library' && (
          <div className="flex flex-col gap-3">
            <div className="flex justify-between items-center">
              <span className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">Model History</span>
              <button
                onClick={onImportExternalModel}
                className="p-1 hover:bg-slate-800 rounded text-sky-400 hover:text-sky-300 border border-slate-800 cursor-pointer"
                title="Import external GLTF/GLB"
              >
                <Plus size={12} />
              </button>
            </div>
            
            {savedModels.length === 0 ? (
              <div className="text-[9px] text-slate-500 text-center py-6 border border-dashed border-slate-800 rounded-lg">
                No models generated yet.
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                {savedModels.map((m) => (
                  <div
                    key={m.path}
                    onClick={() => onImportToPet(m.path)}
                    className="rounded-lg p-2.5 border border-slate-800 bg-slate-950/30 hover:bg-slate-900/60 cursor-pointer transition-all flex items-center justify-between group"
                  >
                    <div className="flex flex-col min-w-0">
                      <span className="text-[9px] font-semibold text-slate-300 truncate">{m.name}</span>
                      <div className="flex gap-1.5 items-center mt-1">
                        <span className="text-[7px] bg-slate-800 text-slate-400 px-1 py-0.25 rounded font-mono uppercase">{m.format}</span>
                        <span className="text-[7px] text-slate-500">{(m.size / 1024 / 1024).toFixed(2)} MB</span>
                      </div>
                    </div>
                    <button
                      onClick={(e) => onDeleteModel(m.path, e)}
                      className="p-1 text-slate-600 hover:text-rose-400 hover:bg-rose-500/10 rounded opacity-0 group-hover:opacity-100 transition-all cursor-pointer"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mt-2">Model Templates</div>
            <div className="grid grid-cols-2 gap-2">
              {PRESETS.map((pr) => {
                const isSelected = selectedPresetId === pr.id;
                return (
                  <button
                    key={pr.id}
                    onClick={() => onPresetSelect(pr.id, pr.name)}
                    className={`rounded-lg p-2 border text-left transition-all ${
                      isSelected
                        ? 'border-sky-500 bg-sky-500/20'
                        : 'border-slate-850 bg-slate-950/30 hover:bg-slate-900 cursor-pointer'
                    }`}
                  >
                    <div className={`w-full h-12 rounded bg-gradient-to-br ${
                      pr.img === 'chibi' ? 'from-pink-500/20 to-purple-500/20 border-pink-500/10' :
                      pr.img === 'steampunk' ? 'from-amber-500/20 to-orange-500/20 border-amber-500/10' :
                      pr.img === 'robot' ? 'from-sky-500/20 to-indigo-500/20 border-sky-500/10' :
                      pr.img === 'bunny' ? 'from-purple-500/20 to-indigo-500/20 border-purple-500/10' :
                      'from-emerald-500/20 to-teal-500/20 border-emerald-500/10'
                    } border flex items-center justify-center mb-1.5`}>
                      <Box size={14} className="text-slate-600" />
                    </div>
                    <div className="text-[8px] font-semibold text-slate-300 truncate">{pr.name}</div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* SCENE HIERARCHY TAB */}
        {rightSidebarTab === 'scene' && (
          <div className="flex flex-col gap-2 text-[9px] text-slate-400 font-mono">
            <div className="text-[9px] text-slate-500 font-bold uppercase tracking-widest font-sans mb-1">Mesh Hierarchy</div>
            <div className="flex items-center gap-1.5 text-sky-400"><Layers size={10} /> <span>root_scene</span></div>
            <div className="pl-3 flex items-center gap-1.5 text-slate-300"><Layers size={10} /> <span>Luna_Group</span></div>
            
            {[
              { id: 'head_mesh', label: 'head_mesh', icon: Box },
              { id: 'torso_mesh', label: 'torso_mesh', icon: Box },
              { id: 'skirt_mesh', label: 'skirt_mesh', icon: Box },
              { id: 'hair_clumps', label: 'hair_clumps', icon: Box },
              { id: 'arm_joints_L', label: 'arm_joints_L', icon: Bone },
              { id: 'arm_joints_R', label: 'arm_joints_R', icon: Bone },
              { id: 'leg_joints_L', label: 'leg_joints_L', icon: Bone },
              { id: 'leg_joints_R', label: 'leg_joints_R', icon: Bone }
            ].map((item) => {
              const Icon = item.icon;
              const isVisible = visibleNodes[item.id] !== false;
              return (
                <div key={item.id} className="pl-6 flex items-center justify-between hover:bg-slate-900/50 py-0.5 rounded pr-1 group">
                  <div className="flex items-center gap-1.5 text-slate-500 group-hover:text-slate-300 transition-colors">
                    <Icon size={10} />
                    <span>{item.label}</span>
                  </div>
                  <button
                    onClick={() => {
                      onVisibleNodesChange({
                        ...visibleNodes,
                        [item.id]: !isVisible
                      });
                    }}
                    className="text-slate-600 hover:text-slate-300 transition-colors cursor-pointer"
                  >
                    {isVisible ? <Eye size={10} /> : <EyeOff size={10} className="text-slate-700" />}
                  </button>
                </div>
              );
            })}
          </div>
        )}

        {/* TRANSFORM INSPECTOR TAB */}
        {rightSidebarTab === 'transform' && (
          <div className="flex flex-col gap-4 text-[9px] text-slate-400">
            <div className="text-[9px] text-slate-500 font-bold uppercase tracking-widest mb-1">Transform Inspector</div>
            
            {/* Position Row */}
            <div className="flex flex-col gap-1.5 border-b border-slate-900 pb-3">
              <span className="text-slate-500 font-semibold uppercase tracking-wider text-[8px]">Position</span>
              <div className="grid grid-cols-3 gap-2">
                {['x', 'y', 'z'].map((axis) => (
                  <div key={axis} className="flex items-center bg-slate-950 border border-slate-800 rounded px-1.5 py-1">
                    <span className="text-[8px] text-rose-500 uppercase font-bold mr-1.5">{axis}</span>
                    <input
                      type="number"
                      step="0.05"
                      value={(modelPosition as any)[axis]}
                      onChange={(e) => onModelPositionChange({ ...modelPosition, [axis]: parseFloat(e.target.value) || 0 })}
                      className="w-full bg-transparent border-none text-[9px] outline-none text-slate-300 text-right font-mono"
                    />
                  </div>
                ))}
              </div>
            </div>

            {/* Rotation Row */}
            <div className="flex flex-col gap-1.5 border-b border-slate-900 pb-3">
              <span className="text-slate-500 font-semibold uppercase tracking-wider text-[8px]">Rotation (deg)</span>
              <div className="grid grid-cols-3 gap-2">
                {['x', 'y', 'z'].map((axis) => (
                  <div key={axis} className="flex items-center bg-slate-950 border border-slate-800 rounded px-1.5 py-1">
                    <span className="text-[8px] text-emerald-500 uppercase font-bold mr-1.5">{axis}</span>
                    <input
                      type="number"
                      step="5"
                      value={(modelRotation as any)[axis]}
                      onChange={(e) => onModelRotationChange({ ...modelRotation, [axis]: parseFloat(e.target.value) || 0 })}
                      className="w-full bg-transparent border-none text-[9px] outline-none text-slate-300 text-right font-mono"
                    />
                  </div>
                ))}
              </div>
            </div>

            {/* Scale Row */}
            <div className="flex flex-col gap-1.5 pb-2">
              <span className="text-slate-500 font-semibold uppercase tracking-wider text-[8px]">Scale</span>
              <div className="grid grid-cols-3 gap-2">
                {['x', 'y', 'z'].map((axis) => (
                  <div key={axis} className="flex items-center bg-slate-950 border border-slate-800 rounded px-1.5 py-1">
                    <span className="text-[8px] text-sky-500 uppercase font-bold mr-1.5">{axis}</span>
                    <input
                      type="number"
                      step="0.1"
                      value={(modelScale as any)[axis]}
                      onChange={(e) => onModelScaleChange({ ...modelScale, [axis]: parseFloat(e.target.value) || 1 })}
                      className="w-full bg-transparent border-none text-[9px] outline-none text-slate-300 text-right font-mono"
                    />
                  </div>
                ))}
              </div>
            </div>

            <button
              onClick={() => {
                onModelPositionChange({ x: 0, y: 0, z: 0 });
                onModelRotationChange({ x: 0, y: 0, z: 0 });
                onModelScaleChange({ x: 1, y: 1, z: 1 });
                triggerToast('Transforms reset to default.');
              }}
              className="w-full py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-[8px] uppercase tracking-wider font-semibold cursor-pointer text-center"
            >
              Reset Transforms
            </button>
          </div>
        )}

        {/* MATERIAL EDITOR TAB */}
        {rightSidebarTab === 'material' && (
          <div className="flex flex-col gap-3 text-[9px] text-slate-400">
            <div className="text-[9px] text-slate-500 font-bold uppercase tracking-widest mb-1">Material Editor</div>
            
            {/* Base Color picker */}
            <div className="flex flex-col gap-1.5">
              <span className="text-slate-500 font-semibold uppercase tracking-wider text-[8px]">Base Color</span>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={materialColor}
                  onChange={(e) => onMaterialColorChange(e.target.value)}
                  className="w-8 h-8 rounded border border-slate-800 bg-transparent cursor-pointer"
                />
                <input
                  type="text"
                  value={materialColor}
                  onChange={(e) => onMaterialColorChange(e.target.value)}
                  className="flex-1 bg-slate-950 border border-slate-800 rounded px-2.5 py-1 text-[9px] outline-none text-slate-300 font-mono"
                />
              </div>
            </div>

            {/* Roughness slider */}
            <div className="flex flex-col gap-1.5 mt-1">
              <div className="flex justify-between items-center text-[8px] uppercase tracking-wider font-semibold text-slate-500">
                <span>Roughness</span>
                <span className="font-mono text-slate-400">{materialRoughness.toFixed(2)}</span>
              </div>
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={materialRoughness}
                onChange={(e) => onMaterialRoughnessChange(parseFloat(e.target.value))}
                className="w-full accent-sky-500 bg-slate-950 h-1 rounded-lg outline-none cursor-pointer"
              />
            </div>

            {/* Metalness slider */}
            <div className="flex flex-col gap-1.5 mt-1">
              <div className="flex justify-between items-center text-[8px] uppercase tracking-wider font-semibold text-slate-500">
                <span>Metalness</span>
                <span className="font-mono text-slate-400">{materialMetalness.toFixed(2)}</span>
              </div>
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={materialMetalness}
                onChange={(e) => onMaterialMetalnessChange(parseFloat(e.target.value))}
                className="w-full accent-sky-500 bg-slate-950 h-1 rounded-lg outline-none cursor-pointer"
              />
            </div>

            {/* Material Quick Presets */}
            <div className="flex flex-col gap-1.5 mt-2">
              <span className="text-slate-500 font-semibold uppercase tracking-wider text-[8px]">Material Presets</span>
              <div className="flex flex-col gap-1">
                {(['clay', 'chrome', 'gold', 'hologram', 'plastic'] as const).map(p => (
                  <button
                    key={p}
                    onClick={() => applyMaterialPreset(p)}
                    className="w-full py-1.5 bg-slate-950 hover:bg-slate-900 border border-slate-900 rounded text-slate-400 hover:text-slate-200 text-[8px] uppercase tracking-wider font-mono font-semibold transition-all cursor-pointer"
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Batch operations */}
      <div className="p-3 border-t border-[var(--brand-border)]/80 bg-slate-950 flex items-center justify-between mt-auto">
        <button
          onClick={() => triggerToast('Batch Export queued.')}
          className="w-full py-2 bg-[var(--brand-bg)] hover:bg-[var(--brand-hover)] transition-all rounded-lg text-[8px] font-bold uppercase tracking-wider text-slate-400 hover:text-white border border-[var(--brand-border)] cursor-pointer text-center"
        >
          Batch Export
        </button>
      </div>
    </aside>
  );
};
export default RightSidebar;
