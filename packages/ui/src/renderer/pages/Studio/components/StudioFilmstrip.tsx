import React from 'react';
import { Box, Trash2, Clock, Sparkles } from 'lucide-react';
import { ThreeDGenerationRecord } from '../../../services/threeDService';

export interface StudioFilmstripProps {
  generations: ThreeDGenerationRecord[];
  activeId: string | null;
  onSelect: (record: ThreeDGenerationRecord) => void;
  onDelete: (id: string, e: React.MouseEvent) => void;
}

export const StudioFilmstrip: React.FC<StudioFilmstripProps> = ({
  generations,
  activeId,
  onSelect,
  onDelete,
}) => {
  if (generations.length === 0) return null;

  return (
    <div className="h-24 w-full border-t border-[var(--brand-border)] bg-[var(--brand-bg)]/90 backdrop-blur-md px-4 py-2 flex items-center gap-3 overflow-x-auto custom-scrollbar shrink-0 select-none z-10">
      <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400 shrink-0 pr-2 border-r border-slate-800">
        <Sparkles size={12} className="text-sky-400" />
        <span>3D History ({generations.length})</span>
      </div>

      <div className="flex items-center gap-2.5 h-full">
        {generations.map((rec) => {
          const isSelected = activeId === rec.id;
          return (
            <div
              key={rec.id}
              onClick={() => onSelect(rec)}
              className={`h-full w-48 rounded-xl p-2 flex flex-col justify-between border cursor-pointer transition-all relative group shrink-0 ${
                isSelected
                  ? 'border-sky-400 bg-sky-500/10 shadow-lg shadow-sky-500/10'
                  : 'border-slate-800/80 bg-slate-900/60 hover:bg-slate-850 hover:border-slate-700'
              }`}
            >
              <div className="flex items-center justify-between gap-1">
                <span className="text-xs font-semibold text-slate-200 truncate leading-snug">
                  {rec.prompt}
                </span>
                <button
                  type="button"
                  onClick={(e) => onDelete(rec.id, e)}
                  className="opacity-0 group-hover:opacity-100 p-1 text-slate-400 hover:text-rose-400 rounded transition-all shrink-0"
                  title="Delete generation"
                >
                  <Trash2 size={12} />
                </button>
              </div>

              <div className="flex items-center justify-between text-[10px] text-slate-400 font-mono">
                <span className="px-1.5 py-0.5 rounded bg-slate-800 uppercase text-[9px] font-bold text-sky-300">
                  {rec.format}
                </span>
                {rec.poly_count ? (
                  <span>{(rec.poly_count / 1000).toFixed(1)}k polys</span>
                ) : (
                  <span>{new Date(rec.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
