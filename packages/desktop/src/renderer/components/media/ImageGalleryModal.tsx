import React, { useState, useEffect, useCallback } from 'react';

/** A single image entry in the gallery. */
export interface ImageItem {
  id: string;
  url: string;
  title?: string;
  description?: string;
  width?: number;
  height?: number;
}

/** CSS filter values applied to the image. */
export interface ImageFilters {
  brightness: number;
  contrast: number;
  saturation: number;
  grayscale: number;
  sepia: number;
  blur: number;
}

/** Rotation, flip, and zoom state for the image. */
export interface ImageTransform {
  rotation: number;
  flipX: boolean;
  flipY: boolean;
  zoom: number;
}

/** Props for the ImageGalleryModal component. */
export interface ImageGalleryModalProps {
  images: ImageItem[];
  initialIndex?: number;
  isOpen: boolean;
  onClose: () => void;
  onSaveImage?: (edited: {
    id: string;
    url: string;
    filters: ImageFilters;
    transform: ImageTransform;
  }) => void;
}

const DEFAULT_FILTERS: ImageFilters = {
  brightness: 100,
  contrast: 100,
  saturation: 100,
  grayscale: 0,
  sepia: 0,
  blur: 0,
};

const DEFAULT_TRANSFORM: ImageTransform = {
  rotation: 0,
  flipX: false,
  flipY: false,
  zoom: 1.0,
};

/** Modal with image gallery, editing transforms, filters, and filmstrip navigation. */
export const ImageGalleryModal: React.FC<ImageGalleryModalProps> = ({
  images,
  initialIndex = 0,
  isOpen,
  onClose,
  onSaveImage,
}) => {
  const [currentIndex, setCurrentIndex] = useState<number>(initialIndex);
  const [filters, setFilters] = useState<ImageFilters>(DEFAULT_FILTERS);
  const [transform, setTransform] = useState<ImageTransform>(DEFAULT_TRANSFORM);
  const [activeTab, setActiveTab] = useState<'view' | 'edit'>('view');
  const [imgError, setImgError] = useState<boolean>(false);

  // The broken-image state is per-image: reset it whenever the active image changes.
  useEffect(() => {
    setImgError(false);
  }, [currentIndex]);

  useEffect(() => {
    if (initialIndex >= 0 && initialIndex < images.length) {
      setCurrentIndex(initialIndex);
    }
  }, [initialIndex, images.length]);

  const resetEdits = useCallback(() => {
    setFilters({ ...DEFAULT_FILTERS });
    setTransform({ ...DEFAULT_TRANSFORM });
  }, []);

  const handleNext = useCallback(() => {
    if (images.length === 0) return;
    setCurrentIndex((prev) => (prev + 1) % images.length);
    resetEdits();
  }, [images.length, resetEdits]);

  const handlePrev = useCallback(() => {
    if (images.length === 0) return;
    setCurrentIndex((prev) => (prev - 1 + images.length) % images.length);
    resetEdits();
  }, [images.length, resetEdits]);

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      } else if (e.key === 'ArrowRight') {
        handleNext();
      } else if (e.key === 'ArrowLeft') {
        handlePrev();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose, handleNext, handlePrev]);

  if (!isOpen || images.length === 0) {
    return null;
  }

  const currentImage = images[currentIndex] || images[0];

  const handleRotate = (direction: 'cw' | 'ccw') => {
    setTransform((prev) => ({
      ...prev,
      rotation: direction === 'cw' ? (prev.rotation + 90) % 360 : (prev.rotation - 90 + 360) % 360,
    }));
  };

  const handleFlip = (axis: 'x' | 'y') => {
    setTransform((prev) => ({
      ...prev,
      flipX: axis === 'x' ? !prev.flipX : prev.flipX,
      flipY: axis === 'y' ? !prev.flipY : prev.flipY,
    }));
  };

  const handleZoom = (delta: number) => {
    setTransform((prev) => {
      const newZoom = Math.min(Math.max(prev.zoom + delta, 0.5), 3.0);
      return { ...prev, zoom: Number(newZoom.toFixed(2)) };
    });
  };

  const handleFilterChange = (key: keyof ImageFilters, value: number) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
  };

  const handleSave = () => {
    if (onSaveImage && currentImage) {
      onSaveImage({
        id: currentImage.id,
        url: currentImage.url,
        filters: { ...filters },
        transform: { ...transform },
      });
    }
  };

  const filterStyle = `brightness(${filters.brightness}%) contrast(${filters.contrast}%) saturate(${filters.saturation}%) grayscale(${filters.grayscale}%) sepia(${filters.sepia}%) blur(${filters.blur}px)`;
  const transformStyle = `scale(${transform.zoom}) rotate(${transform.rotation}deg) scaleX(${transform.flipX ? -1 : 1}) scaleY(${transform.flipY ? -1 : 1})`;

  return (
    <div style={styles.overlay} data-testid="image-gallery-modal">
      <div style={styles.modalContent}>
        {/* Header */}
        <div style={styles.header}>
          <div style={styles.titleGroup}>
            <span style={styles.title}>{currentImage.title || `Image ${currentIndex + 1}`}</span>
            <span style={styles.counter}>
              {currentIndex + 1} / {images.length}
            </span>
          </div>
          <div style={styles.headerActions}>
            <div style={styles.tabGroup}>
              <button
                style={{
                  ...styles.tabBtn,
                  ...(activeTab === 'view' ? styles.activeTabBtn : {}),
                }}
                onClick={() => setActiveTab('view')}
              >
                View
              </button>
              <button
                style={{
                  ...styles.tabBtn,
                  ...(activeTab === 'edit' ? styles.activeTabBtn : {}),
                }}
                onClick={() => setActiveTab('edit')}
              >
                Edit & Filters
              </button>
            </div>
            <button style={styles.closeBtn} onClick={onClose} aria-label="Close modal">
              ✕
            </button>
          </div>
        </div>

        {/* Body Container */}
        <div style={styles.body}>
          {/* Main Viewport */}
          <div style={styles.viewport}>
            <button
              style={{ ...styles.navBtn, left: 16 }}
              onClick={handlePrev}
              aria-label="Previous image"
            >
              ‹
            </button>
            <div style={styles.imageWrapper}>
              <img
                src={currentImage.url}
                alt={currentImage.title || 'Gallery item'}
                style={{
                  ...styles.image,
                  filter: filterStyle,
                  transform: transformStyle,
                }}
                onLoad={() => setImgError(false)}
                onError={() => setImgError(true)}
              />
              {imgError && (
                <div style={styles.imgErrorOverlay} data-testid="image-error" role="alert">
                  <div style={styles.imgErrorIcon}>🖼️</div>
                  <div style={styles.imgErrorTitle}>Image failed to load</div>
                  <div style={styles.imgErrorHint}>
                    {currentImage.title || 'This image'} may be unavailable or the URL may be invalid.
                  </div>
                </div>
              )}
            </div>
            <button
              style={{ ...styles.navBtn, right: 16 }}
              onClick={handleNext}
              aria-label="Next image"
            >
              ›
            </button>
          </div>

          {/* Edit Toolbar Sidebar */}
          {activeTab === 'edit' && (
            <div style={styles.sidebar} data-testid="edit-sidebar">
              <h4 style={styles.sidebarHeading}>Transforms</h4>
              <div style={styles.controlRow}>
                <button style={styles.actionBtn} onClick={() => handleRotate('ccw')}>
                  ↺ Rotate Left
                </button>
                <button style={styles.actionBtn} onClick={() => handleRotate('cw')}>
                  ↻ Rotate Right
                </button>
              </div>
              <div style={styles.controlRow}>
                <button style={styles.actionBtn} onClick={() => handleFlip('x')}>
                  ⇄ Flip H
                </button>
                <button style={styles.actionBtn} onClick={() => handleFlip('y')}>
                  ⇅ Flip V
                </button>
              </div>
              <div style={styles.controlRow}>
                <button style={styles.actionBtn} onClick={() => handleZoom(-0.25)}>
                  - Zoom Out
                </button>
                <span style={styles.zoomLabel}>{Math.round(transform.zoom * 100)}%</span>
                <button style={styles.actionBtn} onClick={() => handleZoom(0.25)}>
                  + Zoom In
                </button>
              </div>

              <h4 style={{ ...styles.sidebarHeading, marginTop: 16 }}>Filters</h4>
              <div style={styles.sliderGroup}>
                <label style={styles.sliderLabel}>Brightness: {filters.brightness}%</label>
                <input
                  type="range"
                  min="0"
                  max="200"
                  value={filters.brightness}
                  onChange={(e) => handleFilterChange('brightness', Number(e.target.value))}
                  style={styles.slider}
                />
              </div>
              <div style={styles.sliderGroup}>
                <label style={styles.sliderLabel}>Contrast: {filters.contrast}%</label>
                <input
                  type="range"
                  min="0"
                  max="200"
                  value={filters.contrast}
                  onChange={(e) => handleFilterChange('contrast', Number(e.target.value))}
                  style={styles.slider}
                />
              </div>
              <div style={styles.sliderGroup}>
                <label style={styles.sliderLabel}>Grayscale: {filters.grayscale}%</label>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={filters.grayscale}
                  onChange={(e) => handleFilterChange('grayscale', Number(e.target.value))}
                  style={styles.slider}
                />
              </div>
              <div style={styles.sliderGroup}>
                <label style={styles.sliderLabel}>Sepia: {filters.sepia}%</label>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={filters.sepia}
                  onChange={(e) => handleFilterChange('sepia', Number(e.target.value))}
                  style={styles.slider}
                />
              </div>
              <div style={styles.sliderGroup}>
                <label style={styles.sliderLabel}>Blur: {filters.blur}px</label>
                <input
                  type="range"
                  min="0"
                  max="10"
                  value={filters.blur}
                  onChange={(e) => handleFilterChange('blur', Number(e.target.value))}
                  style={styles.slider}
                />
              </div>

              <div style={styles.sidebarFooter}>
                <button style={styles.resetBtn} onClick={resetEdits}>
                  Reset All
                </button>
                {onSaveImage && (
                  <button style={styles.saveBtn} onClick={handleSave}>
                    Save Changes
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Bottom Filmstrip Carousel */}
        <div style={styles.filmstrip}>
          {images.map((img, idx) => (
            <div
              key={img.id || idx}
              style={{
                ...styles.thumbnail,
                ...(idx === currentIndex ? styles.activeThumbnail : {}),
              }}
              onClick={() => {
                setCurrentIndex(idx);
                resetEdits();
              }}
            >
              <img src={img.url} alt={img.title || `Thumb ${idx}`} style={styles.thumbImg} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  overlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
    backdropFilter: 'blur(8px)',
  },
  modalContent: {
    width: '90vw',
    height: '85vh',
    backgroundColor: '#121215',
    border: '1px solid #27272a',
    borderRadius: '12px',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    boxShadow: '0 20px 50px rgba(0,0,0,0.5)',
  },
  header: {
    height: '54px',
    borderBottom: '1px solid #27272a',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '0 20px',
    backgroundColor: '#18181b',
  },
  titleGroup: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
  },
  title: {
    color: '#f4f4f5',
    fontWeight: 600,
    fontSize: '1rem',
  },
  counter: {
    color: '#a1a1aa',
    fontSize: '0.85rem',
  },
  headerActions: {
    display: 'flex',
    alignItems: 'center',
    gap: '16px',
  },
  tabGroup: {
    display: 'flex',
    background: '#09090b',
    borderRadius: '6px',
    padding: '2px',
  },
  tabBtn: {
    background: 'transparent',
    border: 'none',
    color: '#a1a1aa',
    padding: '6px 12px',
    fontSize: '0.85rem',
    borderRadius: '4px',
    cursor: 'pointer',
  },
  activeTabBtn: {
    background: '#27272a',
    color: '#ffffff',
    fontWeight: 600,
  },
  closeBtn: {
    background: 'transparent',
    border: 'none',
    color: '#a1a1aa',
    fontSize: '1.2rem',
    cursor: 'pointer',
  },
  body: {
    flex: 1,
    display: 'flex',
    overflow: 'hidden',
    position: 'relative',
  },
  viewport: {
    flex: 1,
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    backgroundColor: '#09090b',
  },
  imageWrapper: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    maxWidth: '100%',
    maxHeight: '100%',
    transition: 'transform 0.2s ease-out',
  },
  image: {
    maxWidth: '100%',
    maxHeight: '70vh',
    objectFit: 'contain',
    transition: 'filter 0.2s ease, transform 0.2s ease',
  },
  imgErrorOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '6px',
    padding: '24px',
    textAlign: 'center',
    backgroundColor: 'rgba(9, 9, 11, 0.85)',
    borderRadius: '8px',
  },
  imgErrorIcon: {
    fontSize: '2rem',
    lineHeight: 1,
    opacity: 0.7,
  },
  imgErrorTitle: {
    color: '#f4f4f5',
    fontWeight: 600,
    fontSize: '0.95rem',
  },
  imgErrorHint: {
    color: '#a1a1aa',
    fontSize: '0.8rem',
    maxWidth: '320px',
  },
  navBtn: {
    position: 'absolute',
    top: '50%',
    transform: 'translateY(-50%)',
    backgroundColor: 'rgba(24, 24, 27, 0.7)',
    border: '1px solid #3f3f46',
    color: '#ffffff',
    width: '40px',
    height: '40px',
    borderRadius: '50%',
    fontSize: '1.5rem',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    zIndex: 10,
  },
  sidebar: {
    width: '280px',
    backgroundColor: '#18181b',
    borderLeft: '1px solid #27272a',
    padding: '16px',
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
    overflowY: 'auto',
  },
  sidebarHeading: {
    color: '#f4f4f5',
    fontSize: '0.85rem',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    marginBottom: '4px',
  },
  controlRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  actionBtn: {
    flex: 1,
    backgroundColor: '#27272a',
    border: '1px solid #3f3f46',
    color: '#f4f4f5',
    padding: '6px 10px',
    borderRadius: '6px',
    fontSize: '0.8rem',
    cursor: 'pointer',
  },
  zoomLabel: {
    color: '#a1a1aa',
    fontSize: '0.85rem',
    minWidth: '45px',
    textAlign: 'center',
  },
  sliderGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
  },
  sliderLabel: {
    color: '#a1a1aa',
    fontSize: '0.8rem',
  },
  slider: {
    accentColor: 'var(--brand-highlight)',
  },
  sidebarFooter: {
    marginTop: 'auto',
    display: 'flex',
    gap: '8px',
    paddingTop: '12px',
    borderTop: '1px solid #27272a',
  },
  resetBtn: {
    flex: 1,
    backgroundColor: 'transparent',
    border: '1px solid #3f3f46',
    color: '#a1a1aa',
    padding: '8px',
    borderRadius: '6px',
    fontSize: '0.85rem',
    cursor: 'pointer',
  },
  saveBtn: {
    flex: 1,
    backgroundColor: 'var(--brand-highlight)',
    border: 'none',
    color: 'var(--brand-highlight-text, #ffffff)',
    padding: '8px',
    borderRadius: '6px',
    fontWeight: 600,
    fontSize: '0.85rem',
    cursor: 'pointer',
  },
  filmstrip: {
    height: '70px',
    backgroundColor: '#18181b',
    borderTop: '1px solid #27272a',
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    padding: '0 16px',
    overflowX: 'auto',
  },
  thumbnail: {
    width: '50px',
    height: '50px',
    borderRadius: '6px',
    overflow: 'hidden',
    border: '2px solid transparent',
    cursor: 'pointer',
    flexShrink: 0,
    opacity: 0.6,
    transition: 'all 0.2s',
  },
  activeThumbnail: {
    borderColor: 'var(--brand-highlight)',
    opacity: 1,
  },
  thumbImg: {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
  },
};
