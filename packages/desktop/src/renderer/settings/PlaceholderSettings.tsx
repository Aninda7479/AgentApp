import React from 'react';
import { Construction, Sparkles } from 'lucide-react';

/** Props for the placeholder settings panel. */
interface PlaceholderSettingsProps {
  title: string;
  description: string;
  status: 'live' | 'planned';
  liveLabel?: string;
}

/** Placeholder settings panel indicating a feature is live or under construction. */
export const PlaceholderSettings: React.FC<PlaceholderSettingsProps> = ({
  title,
  description,
  status,
  liveLabel
}) => {
  const isLive = status === 'live';

  return (
    <div className="max-w-[720px] text-left">
      <div className="mb-3 flex items-center gap-3">
        <div
          className={`flex h-10 w-10 items-center justify-center rounded-xl border ${
            isLive
              ? 'border-[var(--neon-constructive)]/30 bg-[var(--neon-constructive)]/10 text-[var(--neon-constructive)]'
              : 'border-[var(--neon-attention)]/30 bg-[var(--neon-attention)]/10 text-[var(--neon-attention)]'
          }`}
        >
          {isLive ? <Sparkles size={18} /> : <Construction size={18} />}
        </div>
        <div>
          <h1 className="font-outfit text-2xl font-semibold tracking-tight text-brand-textMain sm:text-3xl">{title}</h1>
          <p className="mt-1 text-sm text-brand-textMuted">{description}</p>
        </div>
      </div>

      <div className="settings-section">
        <div className="mb-3 flex items-center gap-2">
          <span className="settings-pill" style={isLive ? undefined : { background: 'var(--neon-attention)', color: '#0a0a0c', borderColor: 'transparent' }}>
            {isLive ? 'Available' : 'Under Construction'}
          </span>
          {liveLabel && <span className="text-xs text-brand-textMuted">{liveLabel}</span>}
        </div>

        <p className="text-sm leading-6 text-brand-textMuted">
          {isLive
            ? 'This capability is already available in the app. Use the linked screen name in the sidebar to manage it.'
            : 'The navigation entry is in place, but the underlying workflow has not been built yet.'}
        </p>
      </div>
    </div>
  );
};
