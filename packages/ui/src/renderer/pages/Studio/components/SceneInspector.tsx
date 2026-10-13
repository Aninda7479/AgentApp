import React, { useState } from 'react';
import {
  Layers,
  Sliders,
  BarChart2,
  Download,
  Share2,
  Trash2,
  Heart,
  Eye,
  EyeOff,
  Box,
  RotateCcw,
  Sparkles,
} from 'lucide-react';
import { MeshStats, SceneNodeInfo, TransformState } from './types';

export interface SceneInspectorProps {
  stats: MeshStats | null;
  sceneNodes: SceneNodeInfo[];
  modelPosition: TransformState;
  onModelPositionChange: (pos: TransformState) => void;
  modelRotation: TransformState;
  onModelRotationChange: (rot: TransformState) => void;
  modelScale: TransformState;
  onModelScaleChange: (scale: TransformState) => void;
  activeModelUrl: string | null;
  activeModelName?: string;
  onImportToPet?: () => void;
  triggerToast?: (msg: string, type?: 'info' | 'error') => void;
}

export const SceneInspector: React.FC<SceneInspectorProps> = ({
  stats,
  sceneNodes,
  modelPosition,
  onModelPositionChange,
  modelRotation,
  onModelRotationChange,
  modelScale,
  onModelScaleChange,
  activeModelUrl,
  activeModelName = '3D Scene Asset',
  onImportToPet,
  triggerToast,
}) => {
  const [activeTab, setActiveTab] = useState<'hierarchy' | 'transform' | 'stats'>('transform');

  const handleResetTransforms = () => {
    onModelPositionChange({ x: 0, y: 0, z: 0 });
    onModelRotationChange({ x: 0, y: 0, z: 0 });
    onModelScaleChange({ x: 1, y: 1, z: 1 });
    if (triggerToast) triggerToast('Transforms reset to origin.');
  };

  const handleDownload = () => {
    if (!activeModelUrl) {
      if (triggerToast) triggerToast('No model loaded to download.', 'error');
      return;
    }
    const a = document.createElement('a');
    a.href = activeModelUrl;
    a.download = `${activeModelName.replace(/[^a-zA-Z0-9_-]/g, '_')}.glb`;
    a.click();
    if (triggerToast) triggerToast('Model download started.');
  };

  return (
    <aside className="w-72 lg:w-80 flex flex-col border-l border-[var(--brand-border)] bg-[var(--brand-bg)]/95 backdrop-blur-md shrink-0 h-full overflow-hidden select-none z-10">
      {/* ── Top Tabs ── */}
      <div className="flex items-center border-b border-[var(--brand-border)]/60 bg-black/20 p-1 shrink-0">
        <button
          onClick={() => setActiveTab('transform')}
          className={`flex-1 py-1.5 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-all ${
            activeTab === 'transform'
              ? 'bg-sky-500/20 text-sky-300 border border-sky-400/50 shadow-sm'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          <Sliders size={13} />
          <span>Transform</span>
        </button>

        <button
          onClick={() => setActiveTab('hierarchy')}
          className={`flex-1 py-1.5 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-all ${
            activeTab === 'hierarchy'
              ? 'bg-sky-500/20 text-sky-300 border border-sky-400/50 shadow-sm'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          <Layers size={13} />
          <span>Hierarchy</span>
        </button>

        <button
          onClick={() => setActiveTab('stats')}
          className={`flex-1 py-1.5 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-all ${
            activeTab === 'stats'
              ? 'bg-sky-500/20 text-sky-300 border border-sky-400/50 shadow-sm'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          <BarChart2 size={13} />
          <span>Metrics</span>
        </button>
      </div>

      {/* ── Tab Content Container ── */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">
        {/* TAB 1: TRANSFORMS */}
        {activeTab === 'transform' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                Spatial Coordinate Gizmo
              </span>
              <button
                type="button"
                onClick={handleResetTransforms}
                className="text-[10px] text-slate-400 hover:text-white flex items-center gap-1 transition-colors"
              >
                <RotateCcw size={10} />
                <span>Reset</span>
              </button>
            </div>

            {/* Position */}
            <div className="space-y-1.5 p-3 rounded-xl border border-slate-800 bg-slate-900/40">
              <label className="text-[10px] font-bold uppercase tracking-wider text-slate-300">
                Position (Meters)
              </label>
              <div className="grid grid-cols-3 gap-2">
                {(['x', 'y', 'z'] as const).map((axis) => (
                  <div key={axis} className="flex items-center gap-1 bg-slate-900 rounded-lg px-2 py-1 border border-slate-800">
                    <span className="text-[10px] font-bold text-sky-400 uppercase">{axis}</span>
                    <input
                      type="number"
                      step={0.1}
                      value={modelPosition[axis]}
                      onChange={(e) =>
                        onModelPositionChange({
                          ...modelPosition,
                          [axis]: parseFloat(e.target.value) || 0,
                        })
                      }
                      className="w-full bg-transparent text-xs text-white outline-none text-right font-mono"
                    />
                  </div>
                ))}
              </div>
            </div>

            {/* Rotation */}
            <div className="space-y-1.5 p-3 rounded-xl border border-slate-800 bg-slate-900/40">
              <label className="text-[10px] font-bold uppercase tracking-wider text-slate-300">
                Rotation (Degrees)
              </label>
              <div className="grid grid-cols-3 gap-2">
                {(['x', 'y', 'z'] as const).map((axis) => (
                  <div key={axis} className="flex items-center gap-1 bg-slate-900 rounded-lg px-2 py-1 border border-slate-800">
                    <span className="text-[10px] font-bold text-indigo-400 uppercase">{axis}</span>
                    <input
                      type="number"
                      step={5}
                      value={modelRotation[axis]}
                      onChange={(e) =>
                        onModelRotationChange({
                          ...modelRotation,
                          [axis]: parseFloat(e.target.value) || 0,
                        })
                      }
                      className="w-full bg-transparent text-xs text-white outline-none text-right font-mono"
                    />
                  </div>
                ))}
              </div>
            </div>

            {/* Scale */}
            <div className="space-y-1.5 p-3 rounded-xl border border-slate-800 bg-slate-900/40">
              <label className="text-[10px] font-bold uppercase tracking-wider text-slate-300">
                Scale (Multiplier)
              </label>
              <div className="grid grid-cols-3 gap-2">
                {(['x', 'y', 'z'] as const).map((axis) => (
                  <div key={axis} className="flex items-center gap-1 bg-slate-900 rounded-lg px-2 py-1 border border-slate-800">
                    <span className="text-[10px] font-bold text-emerald-400 uppercase">{axis}</span>
                    <input
                      type="number"
                      step={0.1}
                      min={0.01}
                      value={modelScale[axis]}
                      onChange={(e) =>
                        onModelScaleChange({
                          ...modelScale,
                          [axis]: Math.max(0.01, parseFloat(e.target.value) || 1),
                        })
                      }
                      className="w-full bg-transparent text-xs text-white outline-none text-right font-mono"
                    />
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: HIERARCHY */}
        {activeTab === 'hierarchy' && (
          <div className="space-y-2">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
              Scene Graph Primitives ({sceneNodes.length} Nodes)
            </span>
            <div className="space-y-1">
              {sceneNodes.map((node) => (
                <div
                  key={node.id}
                  className="p-2 rounded-lg bg-slate-900/60 border border-slate-800 flex items-center justify-between text-xs text-slate-300 hover:text-white hover:bg-slate-850 transition-colors"
                >
                  <div className="flex items-center gap-2 truncate">
                    <Box size={13} className="text-sky-400 shrink-0" />
                    <span className="truncate font-medium">{node.name}</span>
                  </div>
                  {node.polyCount && (
                    <span className="text-[10px] text-slate-500 font-mono shrink-0">
                      {node.polyCount} polys
                    </span>
                  )}
                </div>
              ))}
              {sceneNodes.length === 0 && (
                <div className="text-center py-8 text-xs text-slate-500">
                  No meshes detected in the active viewport.
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 3: STATISTICS & METRICS */}
        {activeTab === 'stats' && (
          <div className="space-y-3">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
              Geometry & Mesh Analytics
            </span>

            {stats ? (
              <div className="space-y-2">
                <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800 flex items-center justify-between">
                  <span className="text-xs text-slate-400">Total Triangles</span>
                  <span className="text-xs font-bold font-mono text-sky-400">
                    {stats.triangles.toLocaleString()}
                  </span>
                </div>

                <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800 flex items-center justify-between">
                  <span className="text-xs text-slate-400">Vertices Count</span>
                  <span className="text-xs font-bold font-mono text-slate-200">
                    {stats.vertices.toLocaleString()}
                  </span>
                </div>

                <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800 flex items-center justify-between">
                  <span className="text-xs text-slate-400">Draw Calls</span>
                  <span className="text-xs font-bold font-mono text-indigo-400">
                    {stats.drawCalls}
                  </span>
                </div>

                <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800 space-y-1.5">
                  <span className="text-xs text-slate-400 block">Bounding Box Dimensions</span>
                  <div className="grid grid-cols-3 gap-1 text-[11px] font-mono text-slate-300">
                    <div>W: {stats.boundingBox.width}m</div>
                    <div>H: {stats.boundingBox.height}m</div>
                    <div>D: {stats.boundingBox.depth}m</div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-center py-8 text-xs text-slate-500">
                Load a 3D asset to inspect geometry metrics.
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Bottom Action Toolbar ── */}
      <div className="p-4 border-t border-[var(--brand-border)] bg-slate-900/60 shrink-0 space-y-2">
        {onImportToPet && (
          <button
            type="button"
            onClick={onImportToPet}
            className="w-full py-2 rounded-xl bg-pink-600/20 hover:bg-pink-600/30 border border-pink-500/40 text-pink-300 font-semibold text-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer shadow-sm"
          >
            <Heart size={13} className="text-pink-400" />
            <span>Attach to Companion Pet</span>
          </button>
        )}

        <button
          type="button"
          onClick={handleDownload}
          disabled={!activeModelUrl}
          className="w-full py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white font-semibold text-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <Download size={13} />
          <span>Download GLB Asset</span>
        </button>
      </div>
    </aside>
  );
};
