import React from 'react';
import { Key, ChevronLeft, ChevronRight, Sparkles } from 'lucide-react';

interface TitleBarProps {
  hasOpenAiKey: boolean;
  onOpenProviders: () => void;
  onWindowControl: (action: 'minimize' | 'maximize' | 'close') => void;
  onMenuClick?: (menuName: string) => void;
}

export const TitleBar: React.FC<TitleBarProps> = ({
  hasOpenAiKey,
  onOpenProviders,
  onWindowControl,
  onMenuClick
}) => {
  return (
    <div
      data-testid="title-bar"
      className="h-10 bg-brand-sidebar border-b border-brand-border/40 flex items-center justify-between px-3 select-none drag-window z-30"
      style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
    >
      {/* Left side: Logo, Nav History, and Application Menus */}
      <div
        className="flex items-center gap-3 no-drag-window"
        style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
      >
        {/* App Logo */}
        <div className="flex items-center text-violet-500 hover:text-violet-400 transition-colors">
          <Sparkles className="w-4 h-4 animate-pulse" />
        </div>

        {/* Back / Forward History Navigation */}
        <div className="flex gap-1 text-brand-textMuted select-none border-l border-brand-border/30 pl-3">
          <button
            onClick={() => window.history.back()}
            className="w-5.5 h-5.5 flex items-center justify-center rounded hover:bg-white/5 hover:text-brand-textMain transition-all cursor-pointer"
            title="Go back"
          >
            <ChevronLeft className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => window.history.forward()}
            className="w-5.5 h-5.5 flex items-center justify-center rounded hover:bg-white/5 hover:text-brand-textMain transition-all cursor-pointer"
            title="Go forward"
          >
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* App Menus */}
        <div className="flex items-center gap-0.5 text-brand-textMuted text-[11px] font-medium tracking-wide border-l border-brand-border/30 pl-3">
          {['File', 'Edit', 'View', 'Help'].map((item) => (
            <span
              key={item}
              onClick={() => onMenuClick && onMenuClick(item)}
              className="cursor-pointer px-2 py-1 rounded hover:bg-white/5 hover:text-brand-textMain transition-all duration-150 active:scale-95"
            >
              {item}
            </span>
          ))}
        </div>
      </div>

      {/* Middle side: Window Title label */}
      <div className="text-[11px] text-brand-textMuted/60 font-semibold absolute left-1/2 -translate-x-1/2 pointer-events-none select-none tracking-wider">
        Agent Desktop
      </div>

      {/* Right side: BYOK status pill and custom Window controls */}
      <div
        className="flex items-center gap-3 no-drag-window"
        style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
      >
        {/* <button
          data-testid="byok-badge-trigger"
          onClick={onOpenProviders}
          className="bg-brand-card hover:bg-brand-popover border border-brand-border/80 text-brand-textMain px-3 py-1 rounded-full text-[10px] cursor-pointer flex items-center gap-1 transition-all duration-150 font-semibold shadow-sm active:scale-[0.98]"
        >
          <Key size={10} className="text-brand-textMuted" />
          <span>BYOK: {hasOpenAiKey ? 'OpenAI' : 'Configure'}</span>
        </button> */}

        {/* Custom Window Controls */}
        <div className="flex items-center pl-1">
          {/* Minimize */}
          <button
            data-testid="win-minimize"
            onClick={() => onWindowControl('minimize')}
            className="w-8 h-8 flex items-center justify-center text-brand-textMuted hover:text-brand-textMain hover:bg-white/5 rounded transition-colors cursor-pointer"
            title="Minimize"
          >
            <svg width="10" height="1" viewBox="0 0 10 1" fill="none" xmlns="http://www.w3.org/2000/svg">
              <rect width="10" height="1" rx="0.5" fill="currentColor"/>
            </svg>
          </button>
          
          {/* Maximize */}
          <button
            data-testid="win-maximize"
            onClick={() => onWindowControl('maximize')}
            className="w-8 h-8 flex items-center justify-center text-brand-textMuted hover:text-brand-textMain hover:bg-white/5 rounded transition-colors cursor-pointer"
            title="Maximize"
          >
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none" xmlns="http://www.w3.org/2000/svg">
              <rect x="0.5" y="0.5" width="9" height="9" rx="0.5" stroke="currentColor" strokeWidth="1"/>
            </svg>
          </button>

          {/* Close */}
          <button
            data-testid="win-close"
            onClick={() => onWindowControl('close')}
            className="w-8 h-8 flex items-center justify-center text-brand-textMuted hover:text-white hover:bg-red-500 rounded transition-colors cursor-pointer"
            title="Close"
          >
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M1 1L9 9M9 1L1 9" stroke="currentColor" strokeWidth="1" strokeLinecap="round"/>
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
};
