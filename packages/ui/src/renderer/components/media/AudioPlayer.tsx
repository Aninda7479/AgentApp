import React, { useState, useRef, useEffect } from 'react';

/** Props for the AudioPlayer component. */
export interface AudioPlayerProps {
  src: string;
  title?: string;
  artist?: string;
  coverArtUrl?: string;
  autoPlay?: boolean;
  loop?: boolean;
  onEnded?: () => void;
  onPlay?: () => void;
  onPause?: () => void;
}

/** Audio player with waveform visualization, playback controls, and speed selection. */
export const AudioPlayer: React.FC<AudioPlayerProps> = ({
  src,
  title = 'Untitled Track',
  artist = 'SuperAgent Audio AI',
  coverArtUrl,
  autoPlay = false,
  loop = false,
  onEnded,
  onPlay,
  onPause,
}) => {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [duration, setDuration] = useState<number>(0);
  const [volume, setVolume] = useState<number>(1.0);
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [playbackRate, setPlaybackRate] = useState<number>(1.0);
  const [isLooping, setIsLooping] = useState<boolean>(loop);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [hasError, setHasError] = useState<boolean>(false);

  /**
   * Surface load failures clearly instead of a silent, unplayable player —
   * generated-audio URLs are the most common broken `src` here (mission point 4).
   */
  const handleAudioError = () => {
    setIsLoading(false);
    setHasError(true);
  };
  const handleAudioReady = () => {
    setIsLoading(false);
    setHasError(false);
  };

  useEffect(() => {
    setIsLooping(loop);
  }, [loop]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const updateTime = () => setCurrentTime(audio.currentTime);
    const updateDuration = () => setDuration(audio.duration || 0);
    const handleEnd = () => {
      setIsPlaying(false);
      if (onEnded) onEnded();
    };

    audio.addEventListener('timeupdate', updateTime);
    audio.addEventListener('loadedmetadata', updateDuration);
    audio.addEventListener('ended', handleEnd);

    return () => {
      audio.removeEventListener('timeupdate', updateTime);
      audio.removeEventListener('loadedmetadata', updateDuration);
      audio.removeEventListener('ended', handleEnd);
    };
  }, [onEnded]);

  const togglePlay = () => {
    const audio = audioRef.current;
    if (!audio) return;

    if (isPlaying) {
      audio.pause();
      setIsPlaying(false);
      if (onPause) onPause();
    } else {
      audio.play().then(() => {
        setIsPlaying(true);
        if (onPlay) onPlay();
      }).catch(() => {
        // Handle play error gracefully (e.g. autoplay policy)
      });
    }
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const targetTime = Number(e.target.value);
    setCurrentTime(targetTime);
    if (audioRef.current) {
      audioRef.current.currentTime = targetTime;
    }
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = Number(e.target.value);
    setVolume(val);
    if (audioRef.current) {
      audioRef.current.volume = val;
      if (val === 0) setIsMuted(true);
      else if (isMuted) setIsMuted(false);
    }
  };

  const toggleMute = () => {
    if (!audioRef.current) return;
    if (isMuted) {
      audioRef.current.muted = false;
      setIsMuted(false);
    } else {
      audioRef.current.muted = true;
      setIsMuted(true);
    }
  };

  const handleRateChange = (rate: number) => {
    setPlaybackRate(rate);
    if (audioRef.current) {
      audioRef.current.playbackRate = rate;
    }
  };

  const toggleLoop = () => {
    const nextLoop = !isLooping;
    setIsLooping(nextLoop);
    if (audioRef.current) {
      audioRef.current.loop = nextLoop;
    }
  };

  const formatTime = (seconds: number): string => {
    if (isNaN(seconds) || seconds < 0) return '00:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // Waveform visualization static bar generator seed
  const waveformBars = [40, 65, 30, 80, 95, 50, 75, 35, 90, 60, 45, 85, 70, 30, 100, 55, 80, 40, 65, 90];

  return (
    <div className="w-full max-w-[600px] mx-auto px-2 sm:px-0" data-testid="audio-player">
      <style>{`@keyframes sa-media-spin{to{transform:rotate(360deg)}}.sa-media-spin{animation:sa-media-spin 0.9s linear infinite}`}</style>
      <audio
        ref={audioRef}
        src={src}
        autoPlay={autoPlay}
        loop={isLooping}
        onCanPlay={handleAudioReady}
        onLoadedData={handleAudioReady}
        onError={handleAudioError}
      />

      <div style={styles.card}>
        {hasError && (
          <div style={styles.errorBanner} data-testid="audio-error" role="alert">
            <span style={styles.errorBannerIcon}>⚠</span>
            <span>
              Audio couldn&apos;t be loaded — the source may be unavailable or the URL invalid.
            </span>
          </div>
        )}
        {/* Track Info Header */}
        <div style={styles.trackInfo}>
          <div style={styles.coverArt}>
            {coverArtUrl ? (
              <img src={coverArtUrl} alt={title} style={styles.coverImg} />
            ) : (
              <div style={styles.coverFallback}>🎵</div>
            )}
          </div>
          <div style={styles.details}>
            <div style={styles.trackTitle}>{title}</div>
            <div style={styles.artistName}>{artist}</div>
          </div>
          <div style={styles.badge}>Audio Engine</div>
        </div>

        {/* Waveform Visualizer */}
        <div style={styles.waveformContainer}>
          {waveformBars.map((height, idx) => {
            const progressRatio = duration > 0 ? currentTime / duration : 0;
            const barRatio = idx / waveformBars.length;
            const isActive = barRatio <= progressRatio;
            return (
              <div
                key={idx}
                style={{
                  ...styles.waveformBar,
                  height: `${isPlaying ? Math.max(15, height * (0.6 + Math.sin(idx + currentTime) * 0.4)) : height}%`,
                  backgroundColor: isActive ? 'var(--brand-highlight)' : '#3f3f46',
                }}
              />
            );
          })}
        </div>

        {/* Buffering indicator (hidden once the track is ready) */}
        {isLoading && !hasError && (
          <div style={styles.loadingRow} data-testid="audio-loading">
            <div style={styles.spinner} className="sa-media-spin" aria-hidden="true" />
            <span style={styles.loadingLabel}>Buffering audio…</span>
          </div>
        )}

        {/* Timeline Slider */}
        <div style={styles.timelineGroup}>
          <span style={styles.timeLabel}>{formatTime(currentTime)}</span>
          <input
            type="range"
            min="0"
            max={duration || 100}
            value={currentTime}
            onChange={handleSeek}
            style={styles.timelineSlider}
          />
          <span style={styles.timeLabel}>{formatTime(duration)}</span>
        </div>

        {/* Control Bar */}
        <div style={styles.controlsRow}>
          {/* Playback Controls */}
          <div style={styles.mainControls}>
            <button style={styles.secondaryBtn} onClick={toggleLoop} title="Toggle Loop">
              {isLooping ? '🔂' : '🔁'}
            </button>
            <button style={styles.playBtn} onClick={togglePlay} aria-label={isPlaying ? 'Pause' : 'Play'}>
              {isPlaying ? '⏸' : '▶'}
            </button>
          </div>

          {/* Volume Control */}
          <div style={styles.volumeGroup}>
            <button style={styles.iconBtn} onClick={toggleMute} aria-label="Toggle Mute">
              {isMuted || volume === 0 ? '🔇' : volume < 0.5 ? '🔉' : '🔊'}
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

          {/* Speed Selector */}
          <div style={styles.speedGroup}>
            {[0.5, 1.0, 1.25, 1.5, 2.0].map((rate) => (
              <button
                key={rate}
                style={{
                  ...styles.speedBtn,
                  ...(playbackRate === rate ? styles.activeSpeedBtn : {}),
                }}
                onClick={() => handleRateChange(rate)}
              >
                {rate}x
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  container: {
    width: '100%',
    maxWidth: '600px',
    margin: '0 auto',
  },
  card: {
    backgroundColor: '#121215',
    border: '1px solid #27272a',
    borderRadius: '12px',
    padding: '20px',
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
    boxShadow: '0 8px 30px rgba(0,0,0,0.4)',
  },
  trackInfo: {
    display: 'flex',
    alignItems: 'center',
    gap: '16px',
  },
  coverArt: {
    width: '56px',
    height: '56px',
    borderRadius: '8px',
    overflow: 'hidden',
    backgroundColor: '#18181b',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  coverImg: {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
  },
  coverFallback: {
    fontSize: '1.8rem',
  },
  details: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
  },
  trackTitle: {
    color: '#f4f4f5',
    fontWeight: 600,
    fontSize: '1rem',
  },
  artistName: {
    color: '#a1a1aa',
    fontSize: '0.85rem',
  },
  badge: {
    backgroundColor: '#1e1b4b',
    border: '1px solid #4338ca',
    color: '#c7d2fe',
    padding: '4px 8px',
    borderRadius: '6px',
    fontSize: '0.75rem',
    fontWeight: 600,
  },
  waveformContainer: {
    height: '48px',
    backgroundColor: '#09090b',
    borderRadius: '8px',
    padding: '0 12px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '4px',
    border: '1px solid #1f1f23',
  },
  loadingRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
    padding: '4px 0',
  },
  spinner: {
    width: '18px',
    height: '18px',
    borderRadius: '50%',
    border: '2px solid rgba(255,255,255,0.2)',
    borderTopColor: 'var(--brand-highlight)',
    boxSizing: 'border-box',
  },
  loadingLabel: {
    color: '#a1a1aa',
    fontSize: '0.8rem',
  },
  errorBanner: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    backgroundColor: 'rgba(239,68,68,0.12)',
    border: '1px solid rgba(239,68,68,0.4)',
    color: '#fecaca',
    borderRadius: '8px',
    padding: '10px 12px',
    fontSize: '0.82rem',
    lineHeight: 1.4,
  },
  errorBannerIcon: {
    fontSize: '1rem',
    flexShrink: 0,
  },
  waveformBar: {
    flex: 1,
    borderRadius: '2px',
    transition: 'height 0.15s ease, background-color 0.2s ease',
  },
  timelineGroup: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
  },
  timeLabel: {
    color: '#a1a1aa',
    fontSize: '0.8rem',
    fontFamily: 'monospace',
    minWidth: '42px',
  },
  timelineSlider: {
    flex: 1,
    accentColor: 'var(--brand-highlight)',
    cursor: 'pointer',
  },
  controlsRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '16px',
    paddingTop: '8px',
    borderTop: '1px solid #1f1f23',
  },
  mainControls: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
  },
  playBtn: {
    width: '44px',
    height: '44px',
    borderRadius: '50%',
    backgroundColor: 'var(--brand-highlight)',
    border: 'none',
    color: 'var(--brand-highlight-text, #ffffff)',
    fontSize: '1.2rem',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    boxShadow: '0 4px 12px rgba(0, 0, 0, 0.25)',
  },
  secondaryBtn: {
    background: 'transparent',
    border: '1px solid #3f3f46',
    color: '#a1a1aa',
    borderRadius: '6px',
    padding: '6px 10px',
    fontSize: '1rem',
    cursor: 'pointer',
  },
  volumeGroup: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  iconBtn: {
    background: 'transparent',
    border: 'none',
    color: '#a1a1aa',
    fontSize: '1.1rem',
    cursor: 'pointer',
  },
  volumeSlider: {
    width: '80px',
    accentColor: 'var(--brand-highlight)',
    cursor: 'pointer',
  },
  speedGroup: {
    display: 'flex',
    gap: '4px',
  },
  speedBtn: {
    background: 'transparent',
    border: '1px solid #27272a',
    color: '#a1a1aa',
    fontSize: '0.75rem',
    padding: '4px 6px',
    borderRadius: '4px',
    cursor: 'pointer',
  },
  activeSpeedBtn: {
    backgroundColor: '#27272a',
    borderColor: 'var(--brand-highlight)',
    color: '#ffffff',
    fontWeight: 600,
  },
};
