import React from 'react';
import { Key } from 'lucide-react';

interface TitleBarProps {
  hasOpenAiKey: boolean;
  onOpenProviders: () => void;
  onWindowControl: (action: 'minimize' | 'maximize' | 'close') => void;
}

export const TitleBar: React.FC<TitleBarProps> = ({
  hasOpenAiKey,
  onOpenProviders,
  onWindowControl
}) => (
  <div
    data-testid="title-bar"
    className="h-11 bg-brand-sidebar border-b border-brand-border flex items-center justify-between px-4 select-none drag-window"
    style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
  >
    <div
      className="flex items-center gap-3.5 no-drag-window"
      style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
    >
      <span className="font-semibold text-xs text-brand-textMuted cursor-default">
        SuperAgent Desktop — Codex Clone
      </span>
    </div>

    <div
      className="flex items-center gap-3 no-drag-window"
      style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
    >
      <button
        data-testid="byok-badge-trigger"
        onClick={onOpenProviders}
        className="bg-brand-card hover:bg-brand-popover border border-brand-border text-brand-textMain px-3 py-1.5 rounded-full text-xs cursor-pointer flex items-center gap-1.5 transition-colors font-semibold shadow-sm active:scale-[0.98]"
      >
        <Key size={11} className="text-brand-textMuted" />
        <span>BYOK: {hasOpenAiKey ? 'OpenAI' : 'Configure'}</span>
      </button>

      <div className="flex items-center gap-2 pl-2">
        <button
          data-testid="win-minimize"
          onClick={() => onWindowControl('minimize')}
          className="bg-brand-card border border-brand-border text-brand-textMuted hover:text-brand-textMain cursor-pointer text-sm w-7 h-7 rounded-md flex items-center justify-center transition-colors"
        >
          -
        </button>
        <button
          data-testid="win-maximize"
          onClick={() => onWindowControl('maximize')}
          className="bg-brand-card border border-brand-border text-brand-textMuted hover:text-brand-textMain cursor-pointer text-[10px] w-7 h-7 rounded-md flex items-center justify-center transition-colors"
        >
          ▢
        </button>
        <button
          data-testid="win-close"
          onClick={() => onWindowControl('close')}
          className="bg-brand-card border border-brand-border text-brand-textMuted hover:text-red-500 cursor-pointer text-xs w-7 h-7 rounded-md flex items-center justify-center transition-colors"
        >
          x
        </button>
      </div>
    </div>
  </div>
);
