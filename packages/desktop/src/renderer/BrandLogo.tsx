import React from 'react';

interface BrandLogoProps {
  /** Pixel size of the glyph. */
  size?: number;
  className?: string;
  /** "glyph" = icon only; "wordmark" = icon + "SuperAgent" text. */
  variant?: 'glyph' | 'wordmark';
  title?: string;
}

/**
 * Shared SuperAgent brand mark. A single gradient source of truth used by the
 * desktop app (TitleBar), the web SPA, and the standalone auth pages.
 * The SVG is self-contained (inline gradient) so it renders identically in
 * React and in raw HTML (login/account) without external assets.
 */
export const BrandLogo: React.FC<BrandLogoProps> = ({
  size = 22,
  className = '',
  variant = 'glyph',
  title = 'SuperAgent'
}) => {
  const gradId = 'sa-brand-grad';

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
        <linearGradient id={gradId} x1="0" y1="0" x2="32" y2="32" gradientUnits="userSpaceOnUse">
          <stop stopColor="#8b5cf6" />
          <stop offset="0.5" stopColor="#6366f1" />
          <stop offset="1" stopColor="#38bdf8" />
        </linearGradient>
      </defs>
      <rect x="2" y="2" width="28" height="28" rx="8" fill={`url(#${gradId})`} />
      {/* Stylized "A" / orbit mark */}
      <path d="M11 22L16 10l5 12" stroke="#ffffff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <circle cx="16" cy="22.5" r="1.8" fill="#ffffff" />
      <circle cx="21" cy="10" r="1.8" fill="#ffffff" opacity="0.9" />
    </svg>
  );

  if (variant === 'wordmark') {
    return (
      <span className={`inline-flex items-center gap-2 ${className}`}>
        {glyph}
        <span className="font-outfit font-bold tracking-tight text-brand-textMain text-[15px]">
          Super
          <span className="bg-gradient-to-r from-violet-400 to-sky-400 bg-clip-text text-transparent">
            Agent
          </span>
        </span>
      </span>
    );
  }

  return glyph;
};

/** Inline SVG favicon as a data URI (single gradient source, no external file). */
export const BRAND_FAVICON =
  "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'><defs><linearGradient id='g' x1='0' y1='0' x2='32' y2='32'><stop stop-color='%238b5cf6'/><stop offset='1' stop-color='%2338bdf8'/></linearGradient></defs><rect width='32' height='32' rx='8' fill='url(%23g)'/><path d='M11 22L16 10l5 12' stroke='white' stroke-width='2.2' stroke-linecap='round' stroke-linejoin='round' fill='none'/><circle cx='16' cy='22.5' r='1.8' fill='white'/><circle cx='21' cy='10' r='1.8' fill='white'/></svg>";
