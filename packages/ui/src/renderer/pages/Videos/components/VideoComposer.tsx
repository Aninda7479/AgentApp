import React, { KeyboardEvent, useRef } from 'react';
import {
  Sparkles,
  SlidersHorizontal,
  Video,
  Image as ImageIcon,
  Compass,
  Square,
  RectangleHorizontal,
  RectangleVertical,
} from 'lucide-react';
import { AspectRatioOption } from '../types';
import { CameraMotionPreset } from '../../../services/videoService';

export interface VideoComposerProps {
  prompt: string;
  onChangePrompt: (value: string) => void;
  onGenerate: () => void;
  isGenerating: boolean;
  aspectRatio: AspectRatioOption;
  onChangeAspectRatio: (ratio: AspectRatioOption) => void;
  availableAspectRatios: AspectRatioOption[];
  cameraMotion: CameraMotionPreset;
  onChangeCameraMotion: (motion: CameraMotionPreset) => void;
  onToggleAdvanced: () => void;
  hasReferenceMedia: boolean;
  onToggleShelf: () => void;
}

const CAMERA_PRESETS: { label: string; value: CameraMotionPreset }[] = [
  { label: 'Auto / Static', value: 'Static' },
  { label: 'Pan Left', value: 'PanLeft' },
  { label: 'Pan Right', value: 'PanRight' },
  { label: 'Tilt Up', value: 'TiltUp' },
  { label: 'Tilt Down', value: 'TiltDown' },
  { label: 'Zoom In', value: 'ZoomIn' },
  { label: 'Zoom Out', value: 'ZoomOut' },
  { label: 'Orbit', value: 'OrbitRight' },
  { label: 'Crane Up', value: 'CraneUp' },
];

export const VideoComposer: React.FC<VideoComposerProps> = ({
  prompt,
  onChangePrompt,
  onGenerate,
  isGenerating,
  aspectRatio,
  onChangeAspectRatio,
  availableAspectRatios,
  cameraMotion,
  onChangeCameraMotion,
  onToggleAdvanced,
  hasReferenceMedia,
  onToggleShelf,
}) => {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      if (!isGenerating && prompt.trim()) {
        onGenerate();
      }
    }
  };

  const getAspectIcon = (ratio: AspectRatioOption) => {
    if (ratio.width === ratio.height) return <Square className="w-3.5 h-3.5" />;
    if (ratio.width > ratio.height) return <RectangleHorizontal className="w-3.5 h-3.5" />;
    return <RectangleVertical className="w-3.5 h-3.5" />;
  };

  return (
    <div className="flex flex-col gap-2 p-3 bg-neutral-900/90 border border-neutral-800 rounded-2xl shadow-2xl backdrop-blur-xl transition-all">
      {/* Textarea */}
      <div className="relative">
        <textarea
          ref={textareaRef}
          value={prompt}
          onChange={(e) => onChangePrompt(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Describe the video you want to generate... (e.g. 'Cinematic drone shot soaring through mist-covered emerald mountains at golden hour, 4k ultra-detailed')"
          rows={2}
          disabled={isGenerating}
          className="w-full bg-transparent text-sm text-neutral-100 placeholder-neutral-500 resize-none outline-none focus:ring-0 px-2 py-1 leading-relaxed custom-scrollbar disabled:opacity-50"
        />
      </div>

      {/* Action bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-neutral-800/80">
        {/* Left tools: Aspect ratio, Camera motion, Keyframe shelf, Advanced */}
        <div className="flex flex-wrap items-center gap-1.5">
          {/* Aspect ratio dropdown */}
          <div className="flex items-center bg-neutral-800/60 border border-neutral-700/50 rounded-lg p-0.5">
            {availableAspectRatios.map((ratio) => {
              const isSelected = ratio.label === aspectRatio.label;
              return (
                <button
                  key={ratio.label}
                  type="button"
                  onClick={() => onChangeAspectRatio(ratio)}
                  className={`flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-md transition-all ${
                    isSelected
                      ? 'bg-neutral-700 text-white shadow-sm'
                      : 'text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800/50'
                  }`}
                  title={`${ratio.label} (${ratio.width}x${ratio.height})`}
                >
                  {getAspectIcon(ratio)}
                  <span className="hidden sm:inline">{ratio.label.split(' ')[0]}</span>
                </button>
              );
            })}
          </div>

          {/* Camera motion selector */}
          <div className="flex items-center gap-1 bg-neutral-800/60 border border-neutral-700/50 rounded-lg px-2 py-1 text-xs">
            <Compass className="w-3.5 h-3.5 text-violet-400" />
            <select
              value={cameraMotion}
              onChange={(e) => onChangeCameraMotion(e.target.value as CameraMotionPreset)}
              className="bg-transparent text-neutral-300 text-xs outline-none cursor-pointer pr-1"
            >
              {CAMERA_PRESETS.map((cam) => (
                <option key={cam.value} value={cam.value} className="bg-neutral-900 text-neutral-200">
                  {cam.label}
                </option>
              ))}
            </select>
          </div>

          {/* Keyframe shelf button */}
          <button
            type="button"
            onClick={onToggleShelf}
            className={`flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-lg border transition-all ${
              hasReferenceMedia
                ? 'bg-violet-950/60 border-violet-700 text-violet-300'
                : 'bg-neutral-800/60 border-neutral-700/50 text-neutral-400 hover:text-neutral-200'
            }`}
            title="Attach start / end keyframe images for Image-to-Video"
          >
            <ImageIcon className="w-3.5 h-3.5" />
            <span>Keyframes</span>
          </button>

          {/* Advanced settings button */}
          <button
            type="button"
            onClick={onToggleAdvanced}
            className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium bg-neutral-800/60 hover:bg-neutral-800 border border-neutral-700/50 rounded-lg text-neutral-400 hover:text-neutral-200 transition-all"
            title="Video FPS, frames, steps, CFG scale and motion scale"
          >
            <SlidersHorizontal className="w-3.5 h-3.5" />
            <span className="hidden md:inline">Settings</span>
          </button>
        </div>

        {/* Right tools: Generate CTA */}
        <button
          type="button"
          onClick={onGenerate}
          disabled={isGenerating || !prompt.trim()}
          className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 disabled:from-neutral-800 disabled:to-neutral-800 disabled:text-neutral-500 text-white text-xs font-semibold rounded-xl shadow-lg shadow-violet-950/40 transition-all active:scale-95 cursor-pointer disabled:cursor-not-allowed"
        >
          {isGenerating ? (
            <>
              <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              <span>Generating...</span>
            </>
          ) : (
            <>
              <Sparkles className="w-3.5 h-3.5" />
              <span>Generate Video</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
};
