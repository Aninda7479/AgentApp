import React, { useRef } from 'react';
import { Upload, X, Image as ImageIcon, Sparkles, ArrowRight, Gauge } from 'lucide-react';
import { AttachedReferenceMedia } from '../types';

export interface VideoAttachmentShelfProps {
  firstFrame: AttachedReferenceMedia | null;
  lastFrame: AttachedReferenceMedia | null;
  onChangeFirstFrame: (media: AttachedReferenceMedia | null) => void;
  onChangeLastFrame: (media: AttachedReferenceMedia | null) => void;
  motionScale: number;
  onChangeMotionScale: (val: number) => void;
  onClose: () => void;
}

export const VideoAttachmentShelf: React.FC<VideoAttachmentShelfProps> = ({
  firstFrame,
  lastFrame,
  onChangeFirstFrame,
  onChangeLastFrame,
  motionScale,
  onChangeMotionScale,
  onClose,
}) => {
  const firstInputRef = useRef<HTMLInputElement>(null);
  const lastInputRef = useRef<HTMLInputElement>(null);

  const handleFileUpload = (
    e: React.ChangeEvent<HTMLInputElement>,
    type: 'first_frame' | 'last_frame'
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const dataUrl = event.target?.result as string;
      const media: AttachedReferenceMedia = {
        file,
        dataUrl,
        name: file.name,
        size: file.size,
        type,
      };
      if (type === 'first_frame') {
        onChangeFirstFrame(media);
      } else {
        onChangeLastFrame(media);
      }
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="w-full bg-neutral-900/95 border border-neutral-800 rounded-2xl p-3 shadow-xl backdrop-blur-xl animate-in fade-in slide-in-from-bottom-2 duration-150 mb-2">
      <div className="flex items-center justify-between pb-2 border-b border-neutral-800 mb-3">
        <div className="flex items-center gap-1.5 text-xs font-semibold text-neutral-200">
          <ImageIcon className="w-3.5 h-3.5 text-violet-400" />
          <span>Image-to-Video Keyframes</span>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="p-1 rounded-md text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800 transition-colors"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {/* First Frame Dropzone */}
        <div className="flex flex-col gap-1.5">
          <span className="text-[11px] font-medium text-neutral-400">First Frame (Start Image)</span>
          {firstFrame ? (
            <div className="relative group w-full h-24 rounded-xl overflow-hidden border border-violet-700/60 bg-neutral-950">
              <img src={firstFrame.dataUrl} alt="First Frame" className="w-full h-full object-cover" />
              <button
                type="button"
                onClick={() => onChangeFirstFrame(null)}
                className="absolute top-1.5 right-1.5 p-1 rounded-full bg-black/70 hover:bg-rose-950 text-neutral-300 hover:text-rose-300 transition-colors"
              >
                <X className="w-3.5 h-3.5" />
              </button>
              <div className="absolute bottom-1 left-2 text-[10px] text-neutral-300 bg-black/60 px-1.5 py-0.5 rounded truncate max-w-[80%]">
                {firstFrame.name}
              </div>
            </div>
          ) : (
            <div
              onClick={() => firstInputRef.current?.click()}
              className="flex flex-col items-center justify-center w-full h-24 rounded-xl border border-dashed border-neutral-700 hover:border-violet-500 bg-neutral-950/40 hover:bg-neutral-800/30 cursor-pointer transition-all text-center p-2"
            >
              <Upload className="w-5 h-5 text-neutral-400 mb-1" />
              <span className="text-xs text-neutral-300 font-medium">Upload Start Image</span>
              <span className="text-[10px] text-neutral-500">PNG, JPG, WebP</span>
            </div>
          )}
          <input
            ref={firstInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => handleFileUpload(e, 'first_frame')}
          />
        </div>

        {/* Last Frame Dropzone (Transition) */}
        <div className="flex flex-col gap-1.5">
          <span className="text-[11px] font-medium text-neutral-400">Last Frame (Optional End Image)</span>
          {lastFrame ? (
            <div className="relative group w-full h-24 rounded-xl overflow-hidden border border-violet-700/60 bg-neutral-950">
              <img src={lastFrame.dataUrl} alt="Last Frame" className="w-full h-full object-cover" />
              <button
                type="button"
                onClick={() => onChangeLastFrame(null)}
                className="absolute top-1.5 right-1.5 p-1 rounded-full bg-black/70 hover:bg-rose-950 text-neutral-300 hover:text-rose-300 transition-colors"
              >
                <X className="w-3.5 h-3.5" />
              </button>
              <div className="absolute bottom-1 left-2 text-[10px] text-neutral-300 bg-black/60 px-1.5 py-0.5 rounded truncate max-w-[80%]">
                {lastFrame.name}
              </div>
            </div>
          ) : (
            <div
              onClick={() => lastInputRef.current?.click()}
              className="flex flex-col items-center justify-center w-full h-24 rounded-xl border border-dashed border-neutral-700 hover:border-violet-500 bg-neutral-950/40 hover:bg-neutral-800/30 cursor-pointer transition-all text-center p-2"
            >
              <Upload className="w-5 h-5 text-neutral-400 mb-1" />
              <span className="text-xs text-neutral-300 font-medium">Upload End Image</span>
              <span className="text-[10px] text-neutral-500">Creates smooth AI morph</span>
            </div>
          )}
          <input
            ref={lastInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => handleFileUpload(e, 'last_frame')}
          />
        </div>
      </div>

      {/* Motion Intensity Slider */}
      <div className="flex items-center justify-between gap-4 mt-3 pt-2 border-t border-neutral-800/80">
        <div className="flex items-center gap-1.5 text-xs text-neutral-300 font-medium">
          <Gauge className="w-3.5 h-3.5 text-violet-400" />
          <span>Motion Intensity</span>
        </div>
        <div className="flex items-center gap-3 flex-1 max-w-xs">
          <input
            type="range"
            min="0.1"
            max="1.0"
            step="0.05"
            value={motionScale}
            onChange={(e) => onChangeMotionScale(parseFloat(e.target.value))}
            className="flex-1 h-1.5 bg-neutral-800 rounded-lg appearance-none cursor-pointer accent-violet-500"
          />
          <span className="text-xs font-mono text-neutral-400 w-8 text-right">
            {Math.round(motionScale * 100)}%
          </span>
        </div>
      </div>
    </div>
  );
};
