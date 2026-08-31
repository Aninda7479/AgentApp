import React from 'react';
import { RefreshCw, Activity, Cpu, Palette } from 'lucide-react';

interface SettingsLoadingProgressBarProps {
  title?: string;
  description?: string;
  isRefreshing?: boolean;
  iconType?: 'text' | 'image' | 'generic';
}

export const SettingsLoadingProgressBar: React.FC<SettingsLoadingProgressBarProps> = ({
  title,
  description,
  isRefreshing = false,
  iconType = 'generic'
}) => {
  const defaultTitle = isRefreshing
    ? 'Refreshing Local Model Configuration...'
    : 'Loading Local AI Model Settings...';

  const defaultDescription = isRefreshing
    ? 'Re-scanning hardware acceleration, VRAM allocation, and local model weights...'
    : 'Probing inference engine status, GPU memory budget, and discovering installed model checkpoints...';

  return (
    <div
      data-testid="settings-loading-progress-bar"
      className="ui-card p-8 border-brand-border bg-brand-card flex flex-col items-center justify-center text-center space-y-4 my-2 animate-fade-in shadow-sm"
      aria-busy="true"
      aria-live="polite"
    >
      <style>{`
        @keyframes settingsProgressIndeterminate {
          0% {
            left: -35%;
            width: 35%;
          }
          50% {
            left: 25%;
            width: 50%;
          }
          100% {
            left: 100%;
            width: 35%;
          }
        }
        .animate-settings-progress {
          position: absolute;
          top: 0;
          bottom: 0;
          border-radius: 9999px;
          background: linear-gradient(90deg, transparent 0%, var(--brand-accent) 50%, var(--brand-accent-strong, #818cf8) 80%, transparent 100%);
          animation: settingsProgressIndeterminate 1.4s ease-in-out infinite;
          box-shadow: 0 0 12px var(--brand-accent-glow, rgba(165, 180, 252, 0.4));
        }
        @media (prefers-reduced-motion: reduce) {
          .animate-settings-progress {
            animation: none !important;
            left: 0 !important;
            width: 100% !important;
          }
        }
      `}</style>

      {/* Top Icon Badge */}
      <div className="relative flex items-center justify-center">
        <div className="w-12 h-12 rounded-2xl bg-[var(--brand-accent-tint)] border border-[var(--brand-accent-border)] flex items-center justify-center text-[var(--brand-accent)] shadow-sm">
          {iconType === 'text' ? (
            <Cpu size={22} className="animate-pulse" />
          ) : iconType === 'image' ? (
            <Palette size={22} className="animate-pulse" />
          ) : (
            <Activity size={22} className="animate-pulse" />
          )}
        </div>
        <div className="absolute -bottom-1 -right-1 bg-brand-bg rounded-full p-1 border border-brand-border text-[var(--brand-accent)]">
          <RefreshCw size={11} className="animate-spin" />
        </div>
      </div>

      {/* Headings */}
      <div className="space-y-1.5 max-w-lg">
        <h3 className="text-base font-semibold text-brand-textMain tracking-tight">
          {title || defaultTitle}
        </h3>
        <p className="text-xs text-brand-textMuted leading-relaxed">
          {description || defaultDescription}
        </p>
      </div>

      {/* Animated Progress Bar */}
      <div className="w-full max-w-md space-y-2 pt-1">
        <div className="w-full h-2 bg-brand-hover/80 rounded-full overflow-hidden relative border border-brand-border/40">
          <div className="animate-settings-progress" />
        </div>
        <div className="flex items-center justify-between text-[11px] text-brand-textMuted px-1 font-mono">
          <span className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-[color:var(--neon-live)] animate-ping" />
            <span>Scanning hardware & runtime</span>
          </span>
          <span className="text-brand-textMuted/70">{isRefreshing ? 'Refreshing...' : 'Loading...'}</span>
        </div>
      </div>
    </div>
  );
};
