import React, { useState } from 'react';
import { Play, Trash2, RotateCcw, Film } from 'lucide-react';
import { VideoGenerationRecord, getVideoThumbnailUrl, getVideoUrl } from '../../../services/videoService';

export interface VideoGalleryFilmstripProps {
  generations: VideoGenerationRecord[];
  selectedId: string | null;
  onSelectGeneration: (record: VideoGenerationRecord) => void;
  onDeleteGeneration: (id: string) => void;
  onReusePrompt: (record: VideoGenerationRecord) => void;
}

export const VideoGalleryFilmstrip: React.FC<VideoGalleryFilmstripProps> = ({
  generations,
  selectedId,
  onSelectGeneration,
  onDeleteGeneration,
  onReusePrompt,
}) => {
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  if (generations.length === 0) {
    return null;
  }

  return (
    <div className="w-full bg-neutral-900/80 border-t border-neutral-800 p-2.5 backdrop-blur-md">
      <div className="flex items-center justify-between px-2 mb-2">
        <div className="flex items-center gap-1.5 text-xs font-semibold text-neutral-400">
          <Film className="w-3.5 h-3.5 text-violet-400" />
          <span>Generations History ({generations.length})</span>
        </div>
      </div>

      <div className="flex items-center gap-2.5 overflow-x-auto custom-scrollbar pb-1 px-1">
        {generations.map((record) => {
          const isSelected = record.id === selectedId;
          const isHovered = record.id === hoveredId;

          return (
            <div
              key={record.id}
              onClick={() => onSelectGeneration(record)}
              onMouseEnter={() => setHoveredId(record.id)}
              onMouseLeave={() => setHoveredId(null)}
              className={`group relative flex-shrink-0 w-36 h-22 rounded-xl overflow-hidden border cursor-pointer transition-all bg-neutral-950 ${
                isSelected
                  ? 'border-violet-500 shadow-lg shadow-violet-950/50 scale-102 ring-2 ring-violet-500/30'
                  : 'border-neutral-800 hover:border-neutral-700 opacity-80 hover:opacity-100'
              }`}
            >
              {/* Thumbnail or mini video preview on hover */}
              {isHovered ? (
                <video
                  src={getVideoUrl(record.id)}
                  loop
                  muted
                  playsInline
                  onCanPlay={(e) => {
                    const p = e.currentTarget.play();
                    if (p !== undefined) {
                      p.catch(() => {});
                    }
                  }}
                  onError={(e) => {
                    (e.target as HTMLElement).style.display = 'none';
                  }}
                  className="w-full h-full object-cover"
                />
              ) : (
                <img
                  src={getVideoThumbnailUrl(record.id)}
                  alt={record.prompt}
                  className="w-full h-full object-cover"
                  onError={(e) => {
                    // Fallback to solid bg if thumbnail unavailable
                    (e.target as HTMLElement).style.display = 'none';
                  }}
                />
              )}


              {/* Duration Badge */}
              <div className="absolute bottom-1 right-1 px-1.5 py-0.5 rounded bg-black/70 backdrop-blur-sm text-[9px] font-mono text-neutral-300">
                {Math.round(record.duration_seconds)}s
              </div>

              {/* Hover Overlay Controls */}
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-between p-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-[9px] text-neutral-300 font-medium truncate max-w-[80px]">
                    {record.model_id.split('-')[0]}
                  </span>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onDeleteGeneration(record.id);
                    }}
                    className="p-1 rounded bg-black/60 hover:bg-rose-950/80 text-neutral-400 hover:text-rose-400 transition-colors"
                    title="Delete generation"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>

                <div className="flex items-center justify-between">
                  <p className="text-[9px] text-neutral-200 line-clamp-1 flex-1 pr-1 font-sans">
                    {record.prompt}
                  </p>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onReusePrompt(record);
                    }}
                    className="p-1 rounded bg-black/60 hover:bg-neutral-800 text-neutral-400 hover:text-neutral-200 transition-colors"
                    title="Reuse prompt & settings"
                  >
                    <RotateCcw className="w-3 h-3" />
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
