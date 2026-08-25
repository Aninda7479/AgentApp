import React, { useState } from 'react';
import { Camera, Download, Sparkles, Check, Image as ImageIcon } from 'lucide-react';
import type { CompanionAction } from './animations';
import { usePartnerMemory } from '../../stores/partnerMemory';

interface PhotoModeProps {
  onTriggerAction: (action: CompanionAction) => void;
  onSetCameraAngle: (angle: 'portrait' | 'half' | 'full') => void;
}

const PHOTO_POSES: { id: CompanionAction; label: string; emoji: string }[] = [
  { id: 'wave', label: 'Wave Hello', emoji: '👋' },
  { id: 'heart', label: 'Heart Love', emoji: '💖' },
  { id: 'peace', label: 'Peace Sign', emoji: '✌️' },
  { id: 'dance', label: 'Dance Groove', emoji: '💃' },
  { id: 'stretch', label: 'Morning Stretch', emoji: '🤸' },
  { id: 'neko', label: 'Cat Girl Paws', emoji: '🐱' },
  { id: 'salute', label: 'Respect Salute', emoji: '🫡' },
  { id: 'bow', label: 'Polite Bow', emoji: '🙇' },
  { id: 'cheer', label: 'Cheer Pump', emoji: '🎉' },
  { id: 'blush', label: 'Shy Blush', emoji: '😳' },
  { id: 'laugh', label: 'Giggle / Laugh', emoji: '😄' },
  { id: 'listen', label: 'Attentive Listen', emoji: '👂' },
  { id: 'thinking', label: 'Curious Think', emoji: '🤔' },
  { id: 'idle', label: 'Natural Standing', emoji: '🧍' },
];

export const PhotoMode: React.FC<PhotoModeProps> = ({ onTriggerAction, onSetCameraAngle }) => {
  const memory = usePartnerMemory();
  const [selectedPose, setSelectedPose] = useState<CompanionAction>('wave');
  const [selectedAngle, setSelectedAngle] = useState<'portrait' | 'half' | 'full'>('full');
  const [isCapturing, setIsCapturing] = useState(false);
  const [downloadSuccess, setDownloadSuccess] = useState(false);

  const handlePoseChange = (poseId: CompanionAction) => {
    setSelectedPose(poseId);
    onTriggerAction(poseId);
  };

  const handleAngleChange = (angle: 'portrait' | 'half' | 'full') => {
    setSelectedAngle(angle);
    onSetCameraAngle(angle);
  };

  const handleCaptureScreenshot = () => {
    setIsCapturing(true);
    setDownloadSuccess(false);

    setTimeout(() => {
      try {
        const canvas = document.querySelector('canvas') as HTMLCanvasElement;
        if (!canvas) {
          alert('Could not find 3D canvas element.');
          setIsCapturing(false);
          return;
        }

        // Create composite canvas with nice branded frame/watermark
        const captureCanvas = document.createElement('canvas');
        captureCanvas.width = canvas.width;
        captureCanvas.height = canvas.height;
        const ctx = captureCanvas.getContext('2d');

        if (ctx) {
          // Draw the 3D WebGL render
          ctx.drawImage(canvas, 0, 0);

          // Add companion watermark badge in bottom right
          const padding = 20;
          const bannerText = `${memory.companionName} & ${memory.userNickname}`;
          const subText = `SuperAgent Companion • ${new Date().toLocaleDateString()}`;

          ctx.font = 'bold 16px sans-serif';
          const textWidth = ctx.measureText(bannerText).width;
          const bgW = Math.max(textWidth, 200) + 30;
          const bgH = 50;
          const bgX = captureCanvas.width - bgW - padding;
          const bgY = captureCanvas.height - bgH - padding;

          // Semi-transparent rounded backdrop
          ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
          ctx.strokeStyle = 'rgba(99, 102, 241, 0.5)';
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.roundRect ? ctx.roundRect(bgX, bgY, bgW, bgH, 12) : ctx.rect(bgX, bgY, bgW, bgH);
          ctx.fill();
          ctx.stroke();

          // Title
          ctx.fillStyle = '#ffffff';
          ctx.font = 'bold 14px sans-serif';
          ctx.fillText(bannerText, bgX + 15, bgY + 22);

          // Subtitle
          ctx.fillStyle = '#94a3b8';
          ctx.font = '10px sans-serif';
          ctx.fillText(subText, bgX + 15, bgY + 38);

          // Export to PNG download
          const url = captureCanvas.toDataURL('image/png');
          const link = document.createElement('a');
          link.download = `${memory.companionName}_Photo_${Date.now()}.png`;
          link.href = url;
          link.click();

          setDownloadSuccess(true);
          setTimeout(() => setDownloadSuccess(false), 3000);
        }
      } catch (err) {
        console.error('[PhotoMode] Capture failed', err);
      } finally {
        setIsCapturing(false);
      }
    }, 200);
  };

  return (
    <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4 text-slate-100 select-none scrollbar-none">
      {/* Studio Header Card */}
      <div className="rounded-3xl bg-gradient-to-br from-cyan-950/40 via-blue-900/30 to-slate-900/60 border border-cyan-500/30 p-5 shadow-xl backdrop-blur-xl">
        <div className="flex items-center gap-2 mb-1">
          <Camera size={16} className="text-cyan-400" />
          <h2 className="text-sm font-bold text-slate-100">3D Photo Studio</h2>
        </div>
        <p className="text-xs text-slate-300 mb-4">
          Frame your companion, choose a signature pose, and capture high-resolution snapshots.
        </p>

        {/* Capture Snapshot Action Button */}
        <button
          onClick={handleCaptureScreenshot}
          disabled={isCapturing}
          className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl bg-gradient-to-r from-cyan-500 via-indigo-500 to-pink-500 hover:from-cyan-400 hover:to-pink-400 text-white font-extrabold text-xs shadow-lg shadow-cyan-500/20 transition-all cursor-pointer disabled:opacity-50"
        >
          {downloadSuccess ? (
            <>
              <Check size={16} className="text-emerald-300" />
              <span>Snapshot Saved!</span>
            </>
          ) : (
            <>
              <Camera size={16} />
              <span>{isCapturing ? 'Snapping Photo...' : 'Capture Photo Snapshot'}</span>
            </>
          )}
        </button>
      </div>

      {/* Camera Angle Selector */}
      <div className="rounded-2xl bg-slate-900/40 border border-slate-800/80 p-4 backdrop-blur-md">
        <h3 className="text-xs font-bold text-slate-200 mb-2">Camera Angle Framing</h3>
        <div className="grid grid-cols-3 gap-2">
          {(['portrait', 'half', 'full'] as const).map(angle => (
            <button
              key={angle}
              onClick={() => handleAngleChange(angle)}
              className={`py-2 rounded-xl text-xs font-semibold border transition-all capitalize cursor-pointer
                ${selectedAngle === angle
                  ? 'bg-cyan-500/20 border-cyan-500 text-cyan-200 ring-1 ring-cyan-400'
                  : 'bg-slate-900/80 border-slate-800 text-slate-400 hover:text-slate-200'}`}
            >
              {angle === 'portrait' ? 'Face Close-Up' : angle === 'half' ? 'Half Body' : 'Full Standing'}
            </button>
          ))}
        </div>
      </div>

      {/* Signature Poses Grid */}
      <div className="rounded-2xl bg-slate-900/40 border border-slate-800/80 p-4 backdrop-blur-md">
        <h3 className="text-xs font-bold text-slate-200 mb-2.5">Companion Pose</h3>
        <div className="grid grid-cols-3 gap-2">
          {PHOTO_POSES.map(p => (
            <button
              key={p.id}
              onClick={() => handlePoseChange(p.id)}
              className={`flex flex-col items-center gap-1 p-2.5 rounded-xl border transition-all cursor-pointer
                ${selectedPose === p.id
                  ? 'bg-indigo-600/30 border-indigo-500 text-indigo-100 ring-1 ring-indigo-400 shadow-md'
                  : 'bg-slate-900/60 border-slate-800 text-slate-400 hover:text-slate-200 hover:bg-slate-800'}`}
            >
              <span className="text-xl">{p.emoji}</span>
              <span className="text-[10px] font-medium truncate max-w-full">{p.label}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};
