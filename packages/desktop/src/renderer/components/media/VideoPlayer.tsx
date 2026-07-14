import React, { useState, useRef, useEffect, useCallback } from 'react';

/** Props for the VideoPlayer component. */
export interface VideoPlayerProps {
  src: string;
  poster?: string;
  title?: string;
  autoPlay?: boolean;
  loop?: boolean;
  onEnded?: () => void;
  onPlay?: () => void;
  onPause?: () => void;
}

/** Video player with overlay controls, fullscreen, PiP, and speed selection. */
export const VideoPlayer: React.FC<VideoPlayerProps> = ({
  src,
  poster,
  title = 'AI Video Stream',
  autoPlay = false,
  loop = false,
  onEnded,
  onPlay,
  onPause,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [duration, setDuration] = useState<number>(0);
  const [volume, setVolume] = useState<number>(1.0);
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [playbackRate, setPlaybackRate] = useState<number>(1.0);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [showControls, setShowControls] = useState<boolean>(true);

  const hideControlsTimer = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const updateTime = () => setCurrentTime(video.currentTime);
    const updateDuration = () => setDuration(video.duration || 0);
    const handleEnd = () => {
      setIsPlaying(false);
      if (onEnded) onEnded();
    };

    video.addEventListener('timeupdate', updateTime);
    video.addEventListener('loadedmetadata', updateDuration);
    video.addEventListener('ended', handleEnd);

    return () => {
      video.removeEventListener('timeupdate', updateTime);
      video.removeEventListener('loadedmetadata', updateDuration);
      video.removeEventListener('ended', handleEnd);
    };
  }, [onEnded]);

  const handleMouseMove = useCallback(() => {
    setShowControls(true);
    if (hideControlsTimer.current) clearTimeout(hideControlsTimer.current);
    hideControlsTimer.current = setTimeout(() => {
      if (isPlaying) {
        setShowControls(false);
      }
    }, 3000);
  }, [isPlaying]);

  const togglePlay = () => {
    const video = videoRef.current;
    if (!video) return;

    if (isPlaying) {
      video.pause();
      setIsPlaying(false);
      if (onPause) onPause();
    } else {
      video.play().then(() => {
        setIsPlaying(true);
        if (onPlay) onPlay();
      }).catch(() => {});
    }
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const targetTime = Number(e.target.value);
    setCurrentTime(targetTime);
    if (videoRef.current) {
      videoRef.current.currentTime = targetTime;
    }
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = Number(e.target.value);
    setVolume(val);
    if (videoRef.current) {
      videoRef.current.volume = val;
      if (val === 0) setIsMuted(true);
      else if (isMuted) setIsMuted(false);
    }
  };

  const toggleMute = () => {
    if (!videoRef.current) return;
    if (isMuted) {
      videoRef.current.muted = false;
      setIsMuted(false);
    } else {
      videoRef.current.muted = true;
      setIsMuted(true);
    }
  };

  const handleRateChange = (rate: number) => {
    setPlaybackRate(rate);
    if (videoRef.current) {
      videoRef.current.playbackRate = rate;
    }
  };

  const toggleFullscreen = () => {
    if (!containerRef.current) return;

    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen?.().then(() => {
        setIsFullscreen(true);
      }).catch(() => {});
    } else {
      document.exitFullscreen?.().then(() => {
        setIsFullscreen(false);
      }).catch(() => {});
    }
  };

  const togglePiP = () => {
    if (!videoRef.current) return;
    if (document.pictureInPictureElement) {
      document.exitPictureInPicture?.().catch(() => {});
    } else {
      videoRef.current.requestPictureInPicture?.().catch(() => {});
    }
  };

  const formatTime = (seconds: number): string => {
    if (isNaN(seconds) || seconds < 0) return '00:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div
      ref={containerRef}
      style={styles.container}
      onMouseMove={handleMouseMove}
      data-testid="video-player"
    >
      <video
        ref={videoRef}
        src={src}
        poster={poster}
        autoPlay={autoPlay}
        loop={loop}
        style={styles.videoElement}
        onClick={togglePlay}
      />

      {/* Title Bar Header */}
      <div
        style={{
          ...styles.headerBar,
          opacity: showControls ? 1 : 0,
          pointerEvents: showControls ? 'auto' : 'none',
        }}
      >
        <span style={styles.title}>{title}</span>
        <span style={styles.badge}>1080p HD</span>
      </div>

      {/* Center Play Button Overlay */}
      {!isPlaying && (
        <div style={styles.centerOverlay} onClick={togglePlay}>
          <button style={styles.bigPlayBtn} aria-label="Play video">
            ▶
          </button>
        </div>
      )}

      {/* Bottom Control Bar */}
      <div
        style={{
          ...styles.controlsBar,
          opacity: showControls ? 1 : 0,
          pointerEvents: showControls ? 'auto' : 'none',
        }}
      >
        {/* Timeline Slider */}
        <div style={styles.timelineContainer}>
          <input
            type="range"
            min="0"
            max={duration || 100}
            value={currentTime}
            onChange={handleSeek}
            style={styles.timelineSlider}
          />
        </div>

        <div style={styles.controlsRow}>
          <div style={styles.leftGroup}>
            <button style={styles.iconBtn} onClick={togglePlay} aria-label={isPlaying ? 'Pause' : 'Play'}>
              {isPlaying ? '⏸' : '▶'}
            </button>
            <span style={styles.timeLabel}>
              {formatTime(currentTime)} / {formatTime(duration)}
            </span>
          </div>

          <div style={styles.rightGroup}>
            {/* Volume */}
            <div style={styles.volumeGroup}>
              <button style={styles.iconBtn} onClick={toggleMute} aria-label="Mute toggle">
                {isMuted || volume === 0 ? '🔇' : '🔊'}
              </button>
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={isMuted ? 0 : volume}
                onChange={handleVolumeChange}
                style={styles.volumeSlider}
              />
            </div>

            {/* Speed dropdown */}
            <select
              value={playbackRate}
              onChange={(e) => handleRateChange(Number(e.target.value))}
              style={styles.selectInput}
              aria-label="Playback speed"
            >
              <option value={0.5}>0.5x</option>
              <option value={1.0}>1.0x</option>
              <option value={1.25}>1.25x</option>
              <option value={1.5}>1.5x</option>
              <option value={2.0}>2.0x</option>
            </select>

            {/* PiP */}
            <button style={styles.iconBtn} onClick={togglePiP} title="Picture-in-Picture">
              📺
            </button>

            {/* Fullscreen */}
            <button style={styles.iconBtn} onClick={toggleFullscreen} title="Toggle Fullscreen">
              {isFullscreen ? '⤦' : '⤢'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  container: {
    position: 'relative',
    width: '100%',
    maxWidth: '800px',
    backgroundColor: '#000000',
    borderRadius: '12px',
    overflow: 'hidden',
    boxShadow: '0 10px 40px rgba(0,0,0,0.6)',
    aspectRatio: '16 / 9',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    margin: '0 auto',
  },
  videoElement: {
    width: '100%',
    height: '100%',
    objectFit: 'contain',
    cursor: 'pointer',
  },
  headerBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: '48px',
    background: 'linear-gradient(to bottom, rgba(0,0,0,0.8), transparent)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '0 16px',
    transition: 'opacity 0.3s ease',
    zIndex: 10,
  },
  title: {
    color: '#ffffff',
    fontWeight: 600,
    fontSize: '0.95rem',
    textShadow: '0 1px 2px rgba(0,0,0,0.8)',
  },
  badge: {
    backgroundColor: 'var(--brand-highlight)',
    color: 'var(--brand-highlight-text, #ffffff)',
    padding: '2px 6px',
    borderRadius: '4px',
    fontSize: '0.7rem',
    fontWeight: 700,
  },
  centerOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.3)',
    cursor: 'pointer',
    zIndex: 5,
  },
  bigPlayBtn: {
    width: '64px',
    height: '64px',
    borderRadius: '50%',
    backgroundColor: 'color-mix(in srgb, var(--brand-highlight) 90%, transparent)',
    border: 'none',
    color: 'var(--brand-highlight-text, #ffffff)',
    fontSize: '1.8rem',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    boxShadow: '0 6px 20px rgba(0,0,0,0.5)',
    transition: 'transform 0.2s',
  },
  controlsBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    background: 'linear-gradient(to top, rgba(0,0,0,0.9), transparent)',
    padding: '12px 16px 8px',
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    transition: 'opacity 0.3s ease',
    zIndex: 10,
  },
  timelineContainer: {
    width: '100%',
  },
  timelineSlider: {
    width: '100%',
    accentColor: 'var(--brand-highlight)',
    cursor: 'pointer',
  },
  controlsRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  leftGroup: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
  },
  rightGroup: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
  },
  iconBtn: {
    background: 'transparent',
    border: 'none',
    color: '#ffffff',
    fontSize: '1.2rem',
    cursor: 'pointer',
    padding: '4px',
  },
  timeLabel: {
    color: '#e4e4e7',
    fontSize: '0.85rem',
    fontFamily: 'monospace',
  },
  volumeGroup: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
  },
  volumeSlider: {
    width: '70px',
    accentColor: 'var(--brand-highlight)',
    cursor: 'pointer',
  },
  selectInput: {
    backgroundColor: '#18181b',
    color: '#ffffff',
    border: '1px solid #3f3f46',
    borderRadius: '4px',
    padding: '2px 6px',
    fontSize: '0.8rem',
  },
};
