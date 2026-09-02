import React, { useState } from 'react';
import { X, Download, Film, Check, Sparkles } from 'lucide-react';
import { VideoGenerationRecord, exportVideo } from '../../../services/videoService';

export interface VideoExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  record: VideoGenerationRecord | null;
  triggerToast?: (message: string) => void;
}

export const VideoExportModal: React.FC<VideoExportModalProps> = ({
  isOpen,
  onClose,
  record,
  triggerToast,
}) => {
  const [format, setFormat] = useState<'mp4' | 'webm' | 'gif' | 'prores'>('mp4');
  const [scaleFactor, setScaleFactor] = useState<number>(1.0);
  const [speedMultiplier, setSpeedMultiplier] = useState<number>(1.0);
  const [isExporting, setIsExporting] = useState(false);

  if (!isOpen || !record) return null;

  const handleExport = async () => {
    setIsExporting(true);
    try {
      const res = await exportVideo(record.id, {
        format,
        scale_factor: scaleFactor,
        speed_multiplier: speedMultiplier,
      });

      if (triggerToast) {
        triggerToast(`Exported ${res.filename} (${(res.size_bytes / (1024 * 1024)).toFixed(1)} MB)`);
      }

      // Download file to client
      const a = document.createElement('a');
      a.href = res.export_url;
      a.download = res.filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);

      onClose();
    } catch (err: any) {
      if (triggerToast) {
        triggerToast(`Export failed: ${err.message}`);
      }
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-in fade-in">
      <div className="w-full max-w-md bg-neutral-900 border border-neutral-800 rounded-3xl shadow-2xl p-6 relative">
        {/* Close Button */}
        <button
          type="button"
          onClick={onClose}
          className="absolute top-4 right-4 p-1.5 rounded-full text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Title */}
        <div className="flex items-center gap-2 mb-4">
          <Film className="w-5 h-5 text-violet-400" />
          <h3 className="text-sm font-semibold text-neutral-100">Export & Transcode Video</h3>
        </div>

        <div className="flex flex-col gap-4">
          {/* Format Picker */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-neutral-300">Format</label>
            <div className="grid grid-cols-2 gap-2">
              {[
                { id: 'mp4', name: 'MP4 (H.264)', desc: 'Best compatibility' },
                { id: 'webm', name: 'WebM (VP9)', desc: 'Optimized web video' },
                { id: 'gif', name: 'Animated GIF', desc: 'Looping animated image' },
                { id: 'prores', name: 'ProRes 422', desc: 'Master editing quality' },
              ].map((fmt) => (
                <button
                  key={fmt.id}
                  type="button"
                  onClick={() => setFormat(fmt.id as any)}
                  className={`flex flex-col items-start p-2.5 rounded-xl border text-left transition-all ${
                    format === fmt.id
                      ? 'bg-neutral-800 border-violet-600 text-white'
                      : 'bg-neutral-950 border-neutral-800 text-neutral-400 hover:text-neutral-200'
                  }`}
                >
                  <span className="text-xs font-semibold">{fmt.name}</span>
                  <span className="text-[10px] text-neutral-500">{fmt.desc}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Scale Resolution */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-neutral-300">Resolution Scale</label>
            <div className="grid grid-cols-3 gap-2">
              {[
                { val: 1.0, label: '1.0x (Native)' },
                { val: 1.5, label: '1.5x HD' },
                { val: 2.0, label: '2.0x 4K/UHD' },
              ].map((s) => (
                <button
                  key={s.val}
                  type="button"
                  onClick={() => setScaleFactor(s.val)}
                  className={`py-1.5 text-xs font-medium rounded-xl border transition-all ${
                    scaleFactor === s.val
                      ? 'bg-neutral-800 border-violet-600 text-white'
                      : 'bg-neutral-950 border-neutral-800 text-neutral-400 hover:text-neutral-200'
                  }`}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          {/* Speed Multiplier */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-neutral-300">Speed Multiplier</label>
            <div className="grid grid-cols-3 gap-2">
              {[
                { val: 0.5, label: '0.5x Slow' },
                { val: 1.0, label: '1.0x Normal' },
                { val: 2.0, label: '2.0x Fast' },
              ].map((sp) => (
                <button
                  key={sp.val}
                  type="button"
                  onClick={() => setSpeedMultiplier(sp.val)}
                  className={`py-1.5 text-xs font-medium rounded-xl border transition-all ${
                    speedMultiplier === sp.val
                      ? 'bg-neutral-800 border-violet-600 text-white'
                      : 'bg-neutral-950 border-neutral-800 text-neutral-400 hover:text-neutral-200'
                  }`}
                >
                  {sp.label}
                </button>
              ))}
            </div>
          </div>

          {/* Export Action CTA */}
          <button
            type="button"
            onClick={handleExport}
            disabled={isExporting}
            className="flex items-center justify-center gap-2 w-full py-2.5 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white text-xs font-semibold rounded-xl shadow-lg transition-all cursor-pointer mt-2 disabled:opacity-50"
          >
            {isExporting ? (
              <>
                <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                <span>Processing & Transcoding...</span>
              </>
            ) : (
              <>
                <Download className="w-4 h-4" />
                <span>Download {format.toUpperCase()} Video</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
