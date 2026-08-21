import React from 'react';

interface EmptyStateProps {
  /** Optional lucide icon rendered as the quiet focal mark above the disc. */
  icon?: React.ReactNode;
  /** Short bold line, optional (e.g. "Nothing here yet"). */
  title?: string;
  /** The main message. */
  message: React.ReactNode;
  /** Optional trailing action (button/link) — kept out of the illustration zone. */
  action?: React.ReactNode;
  /** Extra classes for the outer container. */
  className?: string;
  /** Optional testid. */
  testid?: string;
}

/**
 * Atmosphere-register treatment for empty / no-results states (the quiet
 * zones of the product). A single focal disc settling over layered horizon
 * contour bands, with the message beneath. Uses ONLY the product's existing
 * --brand-atmo-* tokens so it reads as the same atmosphere layer already
 * painted behind the app shell — never an ad-hoc hue. Carries no interactive
 * chrome; that stays in the structure register.
 */
export const EmptyState: React.FC<EmptyStateProps> = ({
  icon,
  title,
  message,
  action,
  className = '',
  testid
}) => {
  return (
    <div
      data-testid={testid}
      className={`flex flex-col items-center overflow-hidden rounded-xl border border-dashed border-brand-border bg-brand-card px-6 py-8 text-center ${className}`}
    >
      {/* Illustration zone — Atmosphere register only (decorative). */}
      <div className="pointer-events-none relative mb-4 h-20 w-44" aria-hidden="true">
        {/* Layered horizon contour bands, settling toward the baseline. */}
        <svg
          className="absolute inset-x-0 bottom-0 h-full w-full"
          viewBox="0 0 176 80"
          preserveAspectRatio="none"
          fill="none"
        >
          <path d="M0 52 C44 40 88 60 124 50 C150 43 168 52 176 48 L176 80 L0 80 Z" fill="var(--brand-atmo-1)" />
          <path d="M0 62 C40 52 84 70 128 60 C152 54 168 62 176 58 L176 80 L0 80 Z" fill="var(--brand-atmo-2)" />
          <path d="M0 70 C44 64 88 74 124 70 C150 67 168 72 176 70 L176 80 L0 80 Z" fill="var(--brand-atmo-3)" />
        </svg>
        {/* Focal disc — the eye's landing point, soft accent glow only. */}
        <div
          className="absolute left-1/2 top-1/2 h-11 w-11 -translate-x-1/2 -translate-y-1/2 rounded-full"
          style={{ background: 'radial-gradient(circle, var(--brand-atmo-glow), transparent 70%)' }}
        />
        {/* Concentric contour arcs (contour mode) around the disc. */}
        <svg
          className="absolute left-1/2 top-1/2 h-20 w-20 -translate-x-1/2 -translate-y-1/2"
          viewBox="0 0 80 80"
          fill="none"
          stroke="var(--brand-atmo-3)"
          strokeWidth="1"
        >
          <circle cx="40" cy="40" r="14" />
          <circle cx="40" cy="40" r="22" stroke="var(--brand-atmo-2)" />
        </svg>
        {/* Optional focal mark above the disc. */}
        {icon && (
          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-(--brand-accent)">
            {icon}
          </div>
        )}
      </div>

      {title && (
        <div className="text-sm font-semibold text-brand-textMain">{title}</div>
      )}
      <p className="mt-1 max-w-xs text-xs leading-relaxed text-brand-textMuted">{message}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
};
