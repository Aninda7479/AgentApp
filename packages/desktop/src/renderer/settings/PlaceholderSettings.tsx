import React from 'react';
import { Construction, Sparkles } from 'lucide-react';

interface PlaceholderSettingsProps {
  title: string;
  description: string;
  status: 'live' | 'planned';
  liveLabel?: string;
}

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
              ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-500'
              : 'border-amber-500/30 bg-amber-500/10 text-amber-500'
          }`}
        >
          {isLive ? <Sparkles size={18} /> : <Construction size={18} />}
        </div>
        <div>
          <h1 className="text-2xl font-semibold text-brand-textMain">{title}</h1>
          <p className="text-sm text-brand-textMuted">{description}</p>
        </div>
      </div>

      <div className="rounded-xl border border-brand-border bg-brand-card p-5 shadow-sm">
        <div className="mb-3 flex items-center gap-2">
          <span
            className={`rounded-full px-3 py-1 text-xs font-semibold ${
              isLive
                ? 'border border-emerald-500/30 bg-emerald-500/10 text-emerald-500'
                : 'border border-amber-500/30 bg-amber-500/10 text-amber-600'
            }`}
          >
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
