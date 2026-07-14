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
      <rect x="2" y="2" width="28" height="28" rx="8" fill="var(--brand-highlight, #a16207)" />
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
          <span className="text-[var(--brand-highlight,#a16207)]">
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
  "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'><rect width='32' height='32' rx='8' fill='%23a16207'/><path d='M11 22L16 10l5 12' stroke='white' stroke-width='2.2' stroke-linecap='round' stroke-linejoin='round' fill='none'/><circle cx='16' cy='22.5' r='1.8' fill='white'/><circle cx='21' cy='10' r='1.8' fill='white'/></svg>";
