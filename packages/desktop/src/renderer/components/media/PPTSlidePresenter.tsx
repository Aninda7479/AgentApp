import React, { useState, useEffect, useCallback, useRef } from 'react';

/** Data for a single presentation slide. */
export interface SlideData {
  id: string;
  title: string;
  subtitle?: string;
  content?: string[];
  notes?: string;
  bgGradient?: string;
  imageUrl?: string;
}

/** Props for the PPTSlidePresenter component. */
export interface PPTSlidePresenterProps {
  slides: SlideData[];
  initialSlide?: number;
  onSlideChange?: (index: number) => void;
}

const DEFAULT_SLIDES: SlideData[] = [
  {
    id: 'slide-1',
    title: 'SuperAgent Multimodal Platform',
    subtitle: 'Autonomous AI Agent Desktop Framework',
    content: [
      'Next-generation software engineering automation',
      'Unified media suite for Images, Audio, Video, PDF & PPT',
      'Zero-latency electron integration with local execution',
    ],
    notes: 'Introduce the main platform highlights and architectural principles.',
    bgGradient: 'linear-gradient(135deg, #1e1b4b 0%, #311042 100%)',
  },
  {
    id: 'slide-2',
    title: 'Phase 5: Media Engineering Suite',
    subtitle: 'Steps 087 to 091 Capabilities',
    content: [
      'Interactive Image Gallery & Editor with canvas transformations',
      'Custom HTML5 Audio Visualizer & Player',
      'High-performance Embedded Video Player with PiP',
      'Native PDF Document Viewport Renderer',
    ],
    notes: 'Emphasize component decoupling, strict TypeScript types, and unit tests.',
    bgGradient: 'linear-gradient(135deg, #064e3b 0%, #022c22 100%)',
  },
];

/** Slide presenter with navigation, auto-play, speaker notes, and thumbnail strip. */
export const PPTSlidePresenter: React.FC<PPTSlidePresenterProps> = ({
  slides = DEFAULT_SLIDES,
  initialSlide = 0,
  onSlideChange,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [currentIndex, setCurrentIndex] = useState<number>(initialSlide);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [showNotes, setShowNotes] = useState<boolean>(false);
  const [isAutoPlaying, setIsAutoPlaying] = useState<boolean>(false);

  const activeSlides = slides.length > 0 ? slides : DEFAULT_SLIDES;

  const goToSlide = useCallback(
    (index: number) => {
      const target = Math.min(Math.max(0, index), activeSlides.length - 1);
      setCurrentIndex(target);
      if (onSlideChange) onSlideChange(target);
    },
    [activeSlides.length, onSlideChange]
  );

  const handleNext = useCallback(() => {
    setCurrentIndex((prev) => {
      const next = (prev + 1) % activeSlides.length;
      if (onSlideChange) onSlideChange(next);
      return next;
    });
  }, [activeSlides.length, onSlideChange]);

  const handlePrev = useCallback(() => {
    setCurrentIndex((prev) => {
      const next = (prev - 1 + activeSlides.length) % activeSlides.length;
      if (onSlideChange) onSlideChange(next);
      return next;
    });
  }, [activeSlides.length, onSlideChange]);

  // Slideshow Auto-play Timer
  useEffect(() => {
    if (!isAutoPlaying) return;
    const interval = setInterval(() => {
      handleNext();
    }, 3500);
    return () => clearInterval(interval);
  }, [isAutoPlaying, handleNext]);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight' || e.key === ' ') {
        handleNext();
      } else if (e.key === 'ArrowLeft') {
        handlePrev();
      } else if (e.key === 'Escape' && isFullscreen) {
        setIsFullscreen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleNext, handlePrev, isFullscreen]);

  const currentSlide = activeSlides[currentIndex] || activeSlides[0];

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

  return (
    <div
      ref={containerRef}
      style={{
        ...styles.container,
        ...(isFullscreen ? styles.fullscreenContainer : {}),
      }}
      data-testid="ppt-slide-presenter"
    >
      {/* Top Controls Bar */}
      <div style={styles.topBar}>
        <div style={styles.barLeft}>
          <span style={styles.presentationBadge}>📊 PPT Presenter</span>
          <span style={styles.slideCounter}>
            Slide {currentIndex + 1} of {activeSlides.length}
          </span>
        </div>

        <div style={styles.barRight}>
          <button
            style={{
              ...styles.barBtn,
              ...(isAutoPlaying ? styles.activeBarBtn : {}),
            }}
            onClick={() => setIsAutoPlaying(!isAutoPlaying)}
            title="Toggle Auto Play Slideshow"
          >
            {isAutoPlaying ? '⏸ Pause Play' : '▶ Auto Play'}
          </button>

          <button
            style={{
              ...styles.barBtn,
              ...(showNotes ? styles.activeBarBtn : {}),
            }}
            onClick={() => setShowNotes(!showNotes)}
            title="Toggle Speaker Notes"
          >
            📝 Speaker Notes
          </button>

          <button style={styles.barBtn} onClick={toggleFullscreen} title="Full Screen Slideshow">
            {isFullscreen ? '⤦ Exit Fullscreen' : '⤢ Present Fullscreen'}
          </button>
        </div>
      </div>

      {/* Main Presentation Viewport */}
      <div style={styles.mainArea}>
        {/* Slide Stage */}
        <div style={styles.stage}>
          <div
            style={{
              ...styles.slideCard,
              background: currentSlide.bgGradient || 'linear-gradient(135deg, #18181b 0%, #09090b 100%)',
            }}
          >
            <div style={styles.slideHeader}>
              <h1 style={styles.slideTitle}>{currentSlide.title}</h1>
              {currentSlide.subtitle && <h3 style={styles.slideSubtitle}>{currentSlide.subtitle}</h3>}
            </div>

            <div style={styles.slideContentBody}>
              {currentSlide.content && (
                <ul style={styles.bulletList}>
                  {currentSlide.content.map((item, idx) => (
                    <li key={idx} style={styles.bulletItem}>
                      <span style={styles.bulletDot}>✦</span>
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              )}

              {currentSlide.imageUrl && (
                <div style={styles.imageContainer}>
                  <img src={currentSlide.imageUrl} alt={currentSlide.title} style={styles.slideImg} />
                </div>
              )}
            </div>

            <div style={styles.slideFooter}>
              <span>SuperAgent AI Deck</span>
              <span>{currentIndex + 1}</span>
            </div>
          </div>
        </div>

        {/* Speaker Notes Drawer */}
        {showNotes && (
          <div style={styles.notesPanel} data-testid="speaker-notes-panel">
            <h4 style={styles.notesTitle}>Speaker Notes</h4>
            <p style={styles.notesContent}>
              {currentSlide.notes || 'No speaker notes recorded for this slide.'}
            </p>
          </div>
        )}
      </div>

      {/* Bottom Carousel / Strip & Nav Controls */}
      <div style={styles.bottomBar}>
        <button style={styles.navArrow} onClick={handlePrev} aria-label="Previous slide">
          ‹
        </button>

        <div style={styles.thumbnailStrip}>
          {activeSlides.map((slide, idx) => (
            <div
              key={slide.id || idx}
              style={{
                ...styles.thumbCard,
                ...(idx === currentIndex ? styles.activeThumbCard : {}),
              }}
              onClick={() => goToSlide(idx)}
            >
              <span style={styles.thumbNum}>{idx + 1}</span>
              <span style={styles.thumbTitle}>{slide.title}</span>
            </div>
          ))}
        </div>

        <button style={styles.navArrow} onClick={handleNext} aria-label="Next slide">
          ›
        </button>
      </div>
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    width: '100%',
    height: '650px',
    backgroundColor: '#121215',
    border: '1px solid #27272a',
    borderRadius: '12px',
    overflow: 'hidden',
    boxShadow: '0 12px 40px rgba(0,0,0,0.5)',
  },
  fullscreenContainer: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    width: '100vw',
    height: '100vh',
    borderRadius: 0,
    border: 'none',
    zIndex: 9999,
  },
  topBar: {
    height: '50px',
    backgroundColor: '#18181b',
    borderBottom: '1px solid #27272a',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '0 20px',
  },
  barLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: '16px',
  },
  presentationBadge: {
    color: 'var(--brand-highlight)',
    fontWeight: 700,
    fontSize: '0.9rem',
  },
  slideCounter: {
    color: '#a1a1aa',
    fontSize: '0.85rem',
  },
  barRight: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
  },
  barBtn: {
    backgroundColor: '#27272a',
    border: '1px solid #3f3f46',
    color: '#f4f4f5',
    padding: '6px 12px',
    borderRadius: '6px',
    fontSize: '0.8rem',
    cursor: 'pointer',
    transition: 'all 0.2s',
  },
  activeBarBtn: {
    backgroundColor: 'var(--brand-highlight)',
    borderColor: 'var(--brand-highlight-border-subtle)',
    color: 'var(--brand-highlight-text, #ffffff)',
    fontWeight: 600,
  },
  mainArea: {
    flex: 1,
    display: 'flex',
    overflow: 'hidden',
    position: 'relative',
    backgroundColor: '#09090b',
  },
  stage: {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '32px',
  },
  slideCard: {
    width: '100%',
    maxWidth: '850px',
    aspectRatio: '16 / 9',
    borderRadius: '16px',
    border: '1px solid rgba(255,255,255,0.1)',
    padding: '48px',
    color: '#ffffff',
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'space-between',
    boxShadow: '0 20px 60px rgba(0,0,0,0.6)',
    position: 'relative',
    overflow: 'hidden',
  },
  slideHeader: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  slideTitle: {
    fontSize: '2.2rem',
    fontWeight: 800,
    letterSpacing: '-0.02em',
    lineHeight: 1.2,
    color: '#ffffff',
  },
  slideSubtitle: {
    fontSize: '1.2rem',
    fontWeight: 400,
    color: '#c7d2fe',
  },
  slideContentBody: {
    flex: 1,
    marginTop: '32px',
    display: 'flex',
    gap: '32px',
  },
  bulletList: {
    listStyle: 'none',
    padding: 0,
    margin: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
    flex: 1,
  },
  bulletItem: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '12px',
    fontSize: '1.1rem',
    lineHeight: 1.5,
    color: '#f4f4f5',
  },
  bulletDot: {
    color: 'var(--brand-highlight)',
    fontSize: '1.2rem',
  },
  imageContainer: {
    width: '280px',
    borderRadius: '12px',
    overflow: 'hidden',
    border: '1px solid rgba(255,255,255,0.2)',
  },
  slideImg: {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
  },
  slideFooter: {
    display: 'flex',
    justifyContent: 'space-between',
    fontSize: '0.8rem',
    color: 'rgba(255,255,255,0.5)',
    borderTop: '1px solid rgba(255,255,255,0.1)',
    paddingTop: '16px',
  },
  notesPanel: {
    width: '280px',
    backgroundColor: '#18181b',
    borderLeft: '1px solid #27272a',
    padding: '20px',
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
  },
  notesTitle: {
    color: '#a1a1aa',
    fontSize: '0.8rem',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
  },
  notesContent: {
    color: '#f4f4f5',
    fontSize: '0.9rem',
    lineHeight: 1.6,
  },
  bottomBar: {
    height: '80px',
    backgroundColor: '#18181b',
    borderTop: '1px solid #27272a',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '0 16px',
    gap: '16px',
  },
  navArrow: {
    backgroundColor: '#27272a',
    border: '1px solid #3f3f46',
    color: '#ffffff',
    width: '36px',
    height: '36px',
    borderRadius: '50%',
    fontSize: '1.4rem',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    flexShrink: 0,
  },
  thumbnailStrip: {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    overflowX: 'auto',
    padding: '4px 0',
  },
  thumbCard: {
    width: '110px',
    height: '60px',
    backgroundColor: '#09090b',
    border: '1px solid #27272a',
    borderRadius: '8px',
    padding: '8px',
    cursor: 'pointer',
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'space-between',
    flexShrink: 0,
    opacity: 0.6,
    transition: 'all 0.2s',
  },
  activeThumbCard: {
    borderColor: 'var(--brand-highlight)',
    opacity: 1,
    backgroundColor: 'var(--brand-highlight-bg-subtle)',
  },
  thumbNum: {
    fontSize: '0.7rem',
    color: 'var(--brand-highlight)',
    fontWeight: 700,
  },
  thumbTitle: {
    fontSize: '0.75rem',
    color: '#ffffff',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
};
