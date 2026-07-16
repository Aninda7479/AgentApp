import React from 'react';
import {
  Box,
  Image as ImageIcon,
  Layers,
  Maximize2,
  PaintBucket,
  Bone,
  Play,
  CheckCircle2,
  Sliders
} from 'lucide-react';
import { Stage } from './types';

export const STAGES: Stage[] = [
  { id: 1, label: 'Concept Design', Icon: ImageIcon, desc: 'Define your character using descriptive text prompts or upload a reference style/concept image.' },
  { id: 2, label: 'Mesh Generation', Icon: Box, desc: 'Generate high-fidelity 3D mesh geometry from the design concepts using advanced AI models.' },
  { id: 3, label: 'Segmentation', Icon: Layers, desc: 'Split the model mesh automatically into functional sub-components (hair, clothes, body limbs).' },
  { id: 4, label: 'Retopology', Icon: Sliders, desc: 'Optimize the geometric structure to low-poly layout for efficient real-time rendering and storage.' },
  { id: 5, label: 'UV Unwrapping', Icon: Maximize2, desc: 'Flatten the 3D model geometry coordinates into a 2D map texture projection coordinate layout.' },
  { id: 6, label: 'Texture Painting', Icon: PaintBucket, desc: 'Bake textures and paint color profiles, roughness, metalness, and normal maps onto the model.' },
  { id: 7, label: 'Rigging & Skinning', Icon: Bone, desc: 'Generate skeletal rig joints and skin weight distributions for character motion.' },
  { id: 8, label: 'Animation Playback', Icon: Play, desc: 'Apply skeletal animations (Idle, Walk, Wave, Dance) and export to your companion desktop pet.' }
];

interface StageNavigationProps {
  activeStage: number;
  onStageChange: (stage: number) => void;
  shadingMode: 'clay' | 'flat' | 'textured';
  onShadingModeChange: (mode: 'clay' | 'flat' | 'textured') => void;
}

export const StageNavigation: React.FC<StageNavigationProps> = ({
  activeStage,
  onStageChange,
  shadingMode,
  onShadingModeChange
}) => {
  return (
    <nav className="w-[220px] border-r border-[var(--brand-border)]/80 bg-[var(--brand-bg)]/90 flex flex-col p-3 space-y-1.5 z-10 shrink-0 relative">
      <div className="px-2.5 py-1 mb-1 select-none">
        <span className="text-[10px] text-slate-500 uppercase tracking-widest font-bold">Pipeline Stages</span>
      </div>

      <div className="flex-1 flex flex-col space-y-1.5 overflow-y-auto relative custom-scrollbar">
        {STAGES.map((s, index) => {
          const isActive = activeStage === s.id;
          const isCompleted = activeStage > s.id;
          
          return (
            <div key={s.id} className="relative flex flex-col">
              {/* Timeline connector line */}
              {index < STAGES.length - 1 && (
                <div className={`studio-timeline-connector ${isCompleted ? 'completed' : ''}`} />
              )}

              <button
                onClick={() => {
                  onStageChange(s.id);
                  if (s.id >= 6 && shadingMode === 'clay') {
                    onShadingModeChange('flat');
                  }
                }}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-all duration-200 cursor-pointer border relative z-10 ${
                  isActive
                    ? 'bg-gradient-to-r from-sky-950/50 to-sky-900/10 border-sky-500/40 text-white font-semibold shadow-inner'
                    : 'border-transparent text-slate-400 hover:bg-slate-900/60 hover:text-slate-200'
                }`}
              >
                <div
                  className={`w-7 h-7 flex items-center justify-center rounded-lg shrink-0 transition-all ${
                    isActive
                      ? 'bg-sky-500/20 text-sky-400 border border-sky-500/30'
                      : isCompleted
                      ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                      : 'bg-slate-900/80 text-slate-500 border border-slate-800'
                  }`}
                >
                  {isCompleted ? <CheckCircle2 size={14} /> : <s.Icon size={14} />}
                </div>
                <div className="flex flex-col min-w-0">
                  <span className="text-[10px] leading-tight font-medium truncate">{s.label}</span>
                  <span className="text-[8px] text-slate-500 leading-none mt-0.5">Step 0{s.id} of 08</span>
                </div>

                {isActive && (
                  <div className="absolute right-3 w-1.5 h-1.5 rounded-full bg-sky-400 animate-ping" />
                )}
              </button>
            </div>
          );
        })}
      </div>
    </nav>
  );
};
