import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  Play,
  Pause,
  RotateCcw,
  SkipBack,
  SkipForward,
  Maximize2,
  Download,
  Share2,
  Sliders,
  Sparkles,
  Layers,
  Film,
  Clock,
  Gauge,
  Repeat,
} from 'lucide-react';
import { VideoGenerationRecord, VideoProgressEvent, getVideoUrl } from '../../../services/videoService';

export interface VideoCanvasStageProps {
  currentRecord: VideoGenerationRecord | null;
  isGenerating: boolean;
  progressEvent: VideoProgressEvent | null;
  onOpenExportModal: () => void;
  triggerToast?: (message: string) => void;
}

export const VideoCanvasStage: React.FC<VideoCanvasStageProps> = ({
  currentRecord,
  isGenerating,
  progressEvent,
  onOpenExportModal,
  triggerToast,
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playbackRate, setPlaybackRate] = useState(1.0);
  const [isLooping, setIsLooping] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [mediaError, setMediaError] = useState<string | null>(null);

  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.playbackRate = playbackRate;
      videoRef.current.loop = isLooping;
    }
  }, [playbackRate, isLooping]);

  useEffect(() => {
    setIsPlaying(false);
    setCurrentTime(0);
    setMediaError(null);
  }, [currentRecord?.id]);

  const togglePlay = useCallback(() => {
    if (!videoRef.current) return;
    if (videoRef.current.paused || videoRef.current.ended) {
      const p = videoRef.current.play();
      if (p !== undefined) {
        p.then(() => {
          setIsPlaying(true);
          setMediaError(null);
        }).catch((err: any) => {
          console.warn('Video play interrupted or unsupported:', err);
          setIsPlaying(false);
          if (err.name === 'NotSupportedError' || err.message?.includes('no supported sources')) {
            setMediaError('Unable to play video: file format or stream is not supported by the browser.');
          }
        });
      }
    } else {
      videoRef.current.pause();
      setIsPlaying(false);
    }
  }, []);


  const handleTimeUpdate = () => {
    if (videoRef.current) {
      setCurrentTime(videoRef.current.currentTime);
    }
  };

  const handleLoadedMetadata = () => {
    if (videoRef.current) {
      setDuration(videoRef.current.duration || currentRecord?.duration_seconds || 0);
    }
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const time = parseFloat(e.target.value);
    if (videoRef.current) {
      videoRef.current.currentTime = time;
      setCurrentTime(time);
    }
  };

  const stepFrame = (forward: boolean) => {
    if (!videoRef.current) return;
    const fps = currentRecord?.fps || 16;
    const frameDuration = 1 / fps;
    const newTime = forward
      ? Math.min(videoRef.current.currentTime + frameDuration, duration)
      : Math.max(videoRef.current.currentTime - frameDuration, 0);

    videoRef.current.currentTime = newTime;
    setCurrentTime(newTime);
  };

  const toggleFullscreen = () => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen().catch((err) => {
        console.error('Fullscreen error:', err);
      });
      setIsFullscreen(true);
    } else {
      document.exitFullscreen();
      setIsFullscreen(false);
    }
  };

  const formatTimecode = (sec: number) => {
    const mins = Math.floor(sec / 60);
    const secs = Math.floor(sec % 60);
    const ms = Math.floor((sec % 1) * 100);
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}.${String(ms).padStart(2, '0')}`;
  };

  const currentFrame = Math.floor(currentTime * (currentRecord?.fps || 16));
  const totalFrames = currentRecord?.num_frames || Math.floor(duration * (currentRecord?.fps || 16)) || 0;

  return (
    <div
      ref={containerRef}
      className="relative flex-1 flex flex-col items-center justify-center bg-neutral-950 overflow-hidden select-none"
    >
      {/* ── Main Viewport ── */}
      <div className="relative w-full h-full flex items-center justify-center p-4">
        {isGenerating ? (
          // ── Generation Progress Screen ──
          <div className="flex flex-col items-center justify-center max-w-md w-full p-8 bg-neutral-900/90 border border-neutral-800 rounded-3xl shadow-2xl backdrop-blur-2xl text-center animate-in fade-in zoom-in-95">
            <div className="relative mb-6">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-violet-600 to-indigo-600 flex items-center justify-center shadow-lg shadow-violet-900/40">
                <Film className="w-8 h-8 text-white animate-pulse" />
              </div>
              <div className="absolute -inset-2 rounded-3xl border border-violet-500/30 animate-ping opacity-25" />
            </div>

            <h3 className="text-base font-semibold text-neutral-100 mb-1">
              Generating Video Latents
            </h3>
            <p className="text-xs text-neutral-400 capitalize mb-4">
              {progressEvent?.phase ? progressEvent.phase.replace(/_/g, ' ') : 'Preparing neural pipeline...'}
            </p>

            {/* Progress bar */}
            <div className="w-full bg-neutral-800 rounded-full h-2 mb-3 overflow-hidden">
              <div
                className="bg-gradient-to-r from-violet-500 to-indigo-500 h-2 rounded-full transition-all duration-300"
                style={{ width: `${Math.round((progressEvent?.progress || 0.05) * 100)}%` }}
              />
            </div>

            {/* Progress Metrics */}
            <div className="flex items-center justify-between w-full text-[11px] text-neutral-400 font-mono">
              <span>{Math.round((progressEvent?.progress || 0.05) * 100)}%</span>
              {progressEvent?.step !== undefined && progressEvent.total_steps > 0 && (
                <span>Step {progressEvent.step}/{progressEvent.total_steps}</span>
              )}
              {progressEvent?.eta_seconds !== undefined && progressEvent.eta_seconds > 0 && (
                <span className="text-neutral-500">ETA ~{Math.round(progressEvent.eta_seconds)}s</span>
              )}
            </div>
          </div>
        ) : currentRecord ? (
          // ── Active Video Player ──
          <div className="relative max-w-full max-h-full flex items-center justify-center">
            {mediaError ? (
              <div className="p-8 rounded-2xl bg-neutral-900/90 border border-neutral-800 text-center max-w-md">
                <Film className="w-10 h-10 text-amber-500 mx-auto mb-3 opacity-80" />
                <h4 className="text-sm font-semibold text-neutral-200">Video Playback Notice</h4>
                <p className="text-xs text-neutral-400 mt-1">{mediaError}</p>
              </div>
            ) : (
              <>
                <video
                  ref={videoRef}
                  src={getVideoUrl(currentRecord.id)}
                  onClick={togglePlay}
                  onPlay={() => setIsPlaying(true)}
                  onPause={() => setIsPlaying(false)}
                  onEnded={() => setIsPlaying(false)}
                  onTimeUpdate={handleTimeUpdate}
                  onLoadedMetadata={handleLoadedMetadata}
                  onError={(e) => {
                    console.warn('Video failed to load for record:', currentRecord.id, e);
                    setIsPlaying(false);
                    setMediaError('Video media source could not be decoded or loaded.');
                  }}
                  className="max-h-[70vh] rounded-2xl shadow-2xl border border-neutral-800/80 cursor-pointer object-contain"
                  playsInline
                />

                {/* Floating Play Indicator when paused */}
                {!isPlaying && (
                  <button
                    type="button"
                    onClick={togglePlay}
                    className="absolute p-4 rounded-full bg-neutral-900/80 hover:bg-neutral-900 text-white border border-neutral-700/80 shadow-2xl backdrop-blur-md transition-all hover:scale-105 active:scale-95 cursor-pointer"
                  >
                    <Play className="w-8 h-8 fill-white ml-0.5" />
                  </button>
                )}
              </>
            )}
          </div>

        ) : (
          // ── Empty State ──
          <div className="flex flex-col items-center justify-center text-center p-8 max-w-sm">
            <div className="p-4 rounded-2xl bg-neutral-900/60 border border-neutral-800 mb-4 text-neutral-500">
              <Film className="w-10 h-10" />
            </div>
            <h3 className="text-sm font-semibold text-neutral-200 mb-1">Video Canvas Ready</h3>
            <p className="text-xs text-neutral-400 leading-relaxed">
              Enter a prompt or attach an image below to generate your first AI video.
            </p>
          </div>
        )}
      </div>

      {/* ── Bottom Video Controls Bar ── */}
      {currentRecord && !isGenerating && (
        <div className="w-full max-w-4xl px-4 pb-4">
          <div className="flex flex-col gap-2 p-3 bg-neutral-900/90 border border-neutral-800 rounded-2xl shadow-2xl backdrop-blur-xl">
            {/* Timeline Scrubber */}
            <div className="flex items-center gap-3">
              <span className="text-[11px] font-mono text-neutral-400 min-w-16">
                {formatTimecode(currentTime)}
              </span>
              <input
                type="range"
                min="0"
                max={duration || currentRecord.duration_seconds || 1}
                step="0.01"
                value={currentTime}
                onChange={handleSeek}
                className="flex-1 h-1.5 bg-neutral-800 rounded-lg appearance-none cursor-pointer accent-violet-500 hover:accent-violet-400"
              />
              <span className="text-[11px] font-mono text-neutral-400 min-w-16 text-right">
                {formatTimecode(duration || currentRecord.duration_seconds || 0)}
              </span>
            </div>

            {/* Playback Controls & Actions */}
            <div className="flex items-center justify-between pt-1">
              {/* Left: Play/Pause, Frame step, Loop */}
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={togglePlay}
                  className="p-2 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-200 transition-all cursor-pointer"
                  title={isPlaying ? 'Pause (Space)' : 'Play (Space)'}
                >
                  {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 fill-current" />}
                </button>

                <button
                  type="button"
                  onClick={() => stepFrame(false)}
                  className="p-2 rounded-lg bg-neutral-800/60 hover:bg-neutral-800 text-neutral-400 hover:text-neutral-200 transition-all cursor-pointer"
                  title="Previous Frame"
                >
                  <SkipBack className="w-3.5 h-3.5" />
                </button>

                <button
                  type="button"
                  onClick={() => stepFrame(true)}
                  className="p-2 rounded-lg bg-neutral-800/60 hover:bg-neutral-800 text-neutral-400 hover:text-neutral-200 transition-all cursor-pointer"
                  title="Next Frame"
                >
                  <SkipForward className="w-3.5 h-3.5" />
                </button>

                <button
                  type="button"
                  onClick={() => setIsLooping(!isLooping)}
                  className={`p-2 rounded-lg border transition-all cursor-pointer ${
                    isLooping
                      ? 'bg-violet-950/60 border-violet-800 text-violet-300'
                      : 'bg-neutral-800/60 border-neutral-700/40 text-neutral-400 hover:text-neutral-200'
                  }`}
                  title={isLooping ? 'Loop Enabled' : 'Loop Disabled'}
                >
                  <Repeat className="w-3.5 h-3.5" />
                </button>

                {/* Frame Counter Tag */}
                <div className="hidden sm:flex items-center px-2 py-1 bg-neutral-800/60 border border-neutral-700/40 rounded-lg text-[10px] font-mono text-neutral-400 ml-1">
                  Frame {currentFrame}/{totalFrames} ({currentRecord.fps}fps)
                </div>
              </div>

              {/* Right: Playback Speed, Export, Fullscreen */}
              <div className="flex items-center gap-2">
                {/* Speed selector */}
                <div className="flex items-center bg-neutral-800/60 border border-neutral-700/40 rounded-lg p-0.5 text-xs">
                  {[0.5, 1.0, 2.0].map((rate) => (
                    <button
                      key={rate}
                      type="button"
                      onClick={() => setPlaybackRate(rate)}
                      className={`px-2 py-0.5 text-[11px] font-medium rounded-md transition-all ${
                        playbackRate === rate
                          ? 'bg-neutral-700 text-white'
                          : 'text-neutral-400 hover:text-neutral-200'
                      }`}
                    >
                      {rate}x
                    </button>
                  ))}
                </div>

                {/* Export Modal CTA */}
                <button
                  type="button"
                  onClick={onOpenExportModal}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 text-neutral-200 rounded-xl text-xs font-medium transition-all cursor-pointer"
                  title="Export to MP4, WebM, GIF or ProRes"
                >
                  <Download className="w-3.5 h-3.5 text-violet-400" />
                  <span>Export</span>
                </button>

                {/* Fullscreen */}
                <button
                  type="button"
                  onClick={toggleFullscreen}
                  className="p-2 rounded-lg bg-neutral-800/60 hover:bg-neutral-800 text-neutral-400 hover:text-neutral-200 transition-all cursor-pointer"
                  title="Fullscreen"
                >
                  <Maximize2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
