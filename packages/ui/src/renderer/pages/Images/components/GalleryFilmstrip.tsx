import React from 'react';
import { Trash2, Sparkles, Image as ImageIcon } from 'lucide-react';
import { GenerationRecord } from '../../../services/imageService';

interface GalleryFilmstripProps {
  history: GenerationRecord[];
  selectedRecord: GenerationRecord | null;
  onSelectRecord: (record: GenerationRecord) => void;
  onDeleteRecord: (id: string) => void;
  onRemixPrompt: (record: GenerationRecord) => void;
}

export const GalleryFilmstrip: React.FC<GalleryFilmstripProps> = ({
  history,
  selectedRecord,
  onSelectRecord,
  onDeleteRecord,
  onRemixPrompt,
}) => {
  if (history.length === 0) return null;

  return (
    <div className="h-24 border-t border-brand-border px-4 py-2 bg-brand-card/40 shrink-0 flex items-center gap-2.5 overflow-x-auto select-none">
      <div className="flex flex-col justify-center shrink-0 pr-2 border-r border-brand-border/60">
        <span className="text-[10px] font-bold uppercase tracking-wider text-brand-textMuted">
          Gallery
        </span>
        <span className="text-xs font-mono font-semibold text-brand-textMain">
          {history.length} {history.length === 1 ? 'item' : 'items'}
        </span>
      </div>

      <div className="flex items-center gap-2 overflow-x-auto py-1">
        {history.map((record) => {
          const isSelected = selectedRecord?.id === record.id;
          return (
            <div
              key={record.id}
              className="relative group shrink-0"
            >
              <button
                type="button"
                onClick={() => onSelectRecord(record)}
                className={`relative w-18 h-18 rounded-xl overflow-hidden shrink-0 border transition-all cursor-pointer block ${
                  isSelected
                    ? 'border-[var(--brand-accent)] ring-2 ring-[var(--brand-accent)]/40 shadow-md scale-102'
                    : 'border-brand-border/80 opacity-75 hover:opacity-100 hover:border-brand-border'
                }`}
                title={record.prompt}
              >
                <img
                  src={`/api/images/generations/${record.id}/file`}
                  alt={record.prompt}
                  className="w-full h-full object-cover"
                />
              </button>

              {/* Quick Actions Hover Badge */}
              <div className="absolute -top-1.5 -right-1.5 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity z-10">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onRemixPrompt(record);
                  }}
                  className="w-5 h-5 rounded-full bg-amber-500 text-slate-950 flex items-center justify-center shadow hover:scale-110 transition-transform cursor-pointer"
                  title="Remix prompt and settings"
                >
                  <Sparkles size={10} />
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDeleteRecord(record.id);
                  }}
                  className="w-5 h-5 rounded-full bg-rose-600 text-white flex items-center justify-center shadow hover:scale-110 transition-transform cursor-pointer"
                  title="Delete generation"
                >
                  <Trash2 size={10} />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
