import React, { useId } from 'react';

interface BrandLogoProps {
  /** Pixel size of the glyph. */
  size?: number;
  className?: string;
  /** "glyph" = icon only; "wordmark" = icon + "SuperAgent" text. */
  variant?: 'glyph' | 'wordmark';
  title?: string;
}

/**
 * Shared SuperAgent brand mark — the "layered atmosphere" motif: a single warm
 * disc (sun) over horizontally layered mountain silhouettes, rendered flat with
 * no photographic texture. One clear focal element (the disc), calm and
 * contemplative, consistent with the app's art direction.
 *
 * The scene is intentionally self-contained (inline gradients + fixed warm
 * palette) so it renders identically in the React renderer (desktop + web SPA)
 * and in the raw HTML auth pages without external assets or theme coupling.
 * Only the frame stroke reads a theme token (--brand-border-strong), so the
 * edge adapts to dark/light while the branded "window" stays constant.
 */
export const BrandLogo: React.FC<BrandLogoProps> = ({
  size = 22,
  className = '',
  variant = 'glyph',
  title = 'SuperAgent'
}) => {
  // Unique IDs per instance so multiple marks on one page don't share gradients.
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  const skyId = `sa-sky-${uid}`;
  const glowId = `sa-glow-${uid}`;
  const clipId = `sa-clip-${uid}`;

  const glyph = (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      role="img"
      aria-label={title}
    >
      <defs>
        <linearGradient id={skyId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#9ec7bd" />
          <stop offset="48%" stopColor="#dce6cf" />
          <stop offset="100%" stopColor="#f3cda4" />
        </linearGradient>
        <radialGradient id={glowId} cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#fff4dd" stopOpacity="0.85" />
          <stop offset="100%" stopColor="#fff4dd" stopOpacity="0" />
        </radialGradient>
        <clipPath id={clipId}>
          <rect x="2" y="2" width="28" height="28" rx="8" />
        </clipPath>
      </defs>

      {/* Sky — the atmosphere backdrop. */}
      <rect x="2" y="2" width="28" height="28" rx="8" fill={`url(#${skyId})`} />

      <g clipPath={`url(#${clipId})`}>
        {/* Soft halo around the disc. */}
        <circle cx="16" cy="12.5" r="8.5" fill={`url(#${glowId})`} />
        {/* Focal disc (sun). */}
        <circle cx="16" cy="12.5" r="4.4" fill="#fff2d8" />
        {/* Contemplative bird-flock marks. */}
        <path
          d="M19.4 9.2 q1 -1 2 0 q1 -1 2 0"
          stroke="#ffffff"
          strokeOpacity="0.7"
          strokeWidth="0.9"
          strokeLinecap="round"
          fill="none"
        />
        <path
          d="M23.6 11 q0.8 -0.8 1.6 0 q0.8 -0.8 1.6 0"
          stroke="#ffffff"
          strokeOpacity="0.55"
          strokeWidth="0.8"
          strokeLinecap="round"
          fill="none"
        />
        {/* Layered mountains — depth via flat, deepening silhouettes (back→front). */}
        <path d="M2 21 C8 17 13 20 18 18 C23 16 27 19 30 18 L30 30 L2 30 Z" fill="#93b6ab" />
        <path d="M2 24 C7 21 12 24 17 22 C22 20 27 23 30 22 L30 30 L2 30 Z" fill="#5f8a7e" />
        <path d="M2 27 C6 25 11 27 16 26 C21 25 26 27 30 26 L30 30 L2 30 Z" fill="#2f5147" />
      </g>

      {/* Frame — theme-adaptive edge. */}
      <rect
        x="2"
        y="2"
        width="28"
        height="28"
        rx="8"
        fill="none"
        stroke="var(--brand-border-strong, rgba(255,255,255,0.13))"
        strokeWidth="1"
      />
    </svg>
  );

  if (variant === 'wordmark') {
    return (
      <span className={`inline-flex items-center gap-2 ${className}`}>
        {glyph}
        <span className="font-outfit font-bold tracking-tight text-brand-textMain text-[15px]">
          Super
          <span className="text-brand-textMuted">
            Agent
          </span>
        </span>
      </span>
    );
  }

  return glyph;
};
