import React, { useState, useEffect } from 'react';
import { DiffService, DiffLine } from '../logic/diff';

/** Props for the DiffViewer component. */
export interface DiffViewerProps {
  originalCode: string;
  modifiedCode: string;
  filename?: string;
  onAccept?: () => void;
  onReject?: () => void;
  onClose?: () => void;
  /** Called when the user accepts a change, so the parent can mark it reviewed. */
  onReview?: (filename: string) => void;
}

/** Side-by-side or unified diff viewer with accept/reject actions. */
export const DiffViewer: React.FC<DiffViewerProps> = ({
  originalCode,
  modifiedCode,
  filename = 'file.txt',
  onAccept,
  onReject,
  onClose,
  onReview
}) => {
  const [viewMode, setViewMode] = useState<'split' | 'unified'>(
    typeof window !== 'undefined' && window.innerWidth < 768 ? 'unified' : 'split'
  );
  // Side-by-side diffs are unreadable on narrow screens — force unified below md.
  const [isNarrow, setIsNarrow] = useState<boolean>(
    typeof window !== 'undefined' ? window.innerWidth < 768 : false
  );
  useEffect(() => {
    const onResize = () => setIsNarrow(window.innerWidth < 768);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  const effectiveViewMode = isNarrow ? 'unified' : viewMode;

  const { lines, additions, deletions } = DiffService.computeDiff(originalCode, modifiedCode);

  const origSplitLines = originalCode.split('\n');
  const modSplitLines = modifiedCode.split('\n');

  return (
    <div className="flex flex-col h-full bg-brand-bg text-brand-textMain">
      {/* Header Toolbar */}
      <div className="min-h-12.5 py-2 bg-brand-sidebar border-b border-brand-border flex items-center justify-between gap-2 flex-wrap px-3 sm:px-5 shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <span className="font-semibold text-sm truncate max-w-[45vw] sm:max-w-none">📄 {filename}</span>
          <span className="text-xs text-[color:var(--neon-constructive)] font-bold">+{additions}</span>
          <span className="text-xs text-[color:var(--neon-destructive)] font-bold">-{deletions}</span>
        </div>
        <div className="flex items-center gap-2.5">
          <button
            data-testid="toggle-view-mode"
            onClick={() => setViewMode(viewMode === 'split' ? 'unified' : 'split')}
            disabled={isNarrow}
            className="hidden sm:block bg-white/5 border border-brand-border text-brand-textMuted hover:text-white rounded-lg px-3 py-1 text-xs cursor-pointer transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Mode: {effectiveViewMode === 'split' ? 'Side-by-Side' : 'Unified'}
          </button>

          {onReject && (
            <button
              data-testid="btn-reject-diff"
              onClick={onReject}
              className="bg-[color:var(--neon-destructive)]/15 border border-[color:var(--neon-destructive)]/30 text-[color:var(--neon-destructive)] rounded-lg px-3.5 py-1.5 text-xs font-bold cursor-pointer hover:bg-[color:var(--neon-destructive)]/25 transition-colors active:scale-[0.97]"
            >
              Reject ✕
            </button>
          )}

          {onAccept && (
            <button
              data-testid="btn-accept-diff"
              onClick={() => {
                onReview?.(filename);
                onAccept();
              }}
              className="bg-[color:var(--neon-constructive)]/15 border border-[color:var(--neon-constructive)]/30 text-[color:var(--neon-constructive)] rounded-lg px-3.5 py-1.5 text-xs font-bold cursor-pointer hover:bg-[color:var(--neon-constructive)]/25 transition-colors active:scale-[0.97]"
            >
              Accept All ✓
            </button>
          )}

          {onClose && (
            <button
              data-testid="btn-close-diff"
              onClick={onClose}
              className="bg-transparent border-none text-brand-textMuted hover:text-white text-base cursor-pointer ml-1.5 p-1 transition-colors"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {/* Main Diff Content */}
      <div className="flex-1 overflow-auto font-mono text-xs md:text-[13px] leading-relaxed">
        {effectiveViewMode === 'split' ? (
          /* ── Split view with proper diff alignment ── */
          <div className="flex min-w-full" data-testid="split-diff-container">
            {/* Left: Original */}
            <div className="flex-1 border-r border-brand-border/50">
              <div className="bg-brand-popover px-3 py-1.5 text-[11px] text-brand-textMuted border-b border-brand-border/50 font-bold uppercase tracking-wider">
                Original Base
              </div>
              {lines.map((item, idx) => {
                if (item.type === 'add') {
                  return (
                    <div key={idx} className="flex bg-brand-bg/60" style={{ height: '22px' }}>
                      <span className="w-10 text-right pr-2 text-[#52525b] select-none text-xs leading-5.5">{''}</span>
                      <span className="flex-1 text-brand-textMuted/30 text-xs leading-5.5 px-2">—</span>
                    </div>
                  );
                }
                const bg = item.type === 'delete' ? 'bg-[color:var(--neon-destructive)]/10' : 'transparent';
                const color = item.type === 'delete' ? 'text-[color:var(--neon-destructive)]' : 'text-brand-textMain';
                return (
                  <div key={idx} className={`flex ${bg}`} style={{ height: '22px' }}>
                    <span className="w-10 text-right pr-2 text-[#52525b] select-none text-xs leading-5.5">{item.origLineNum || ''}</span>
                    <span className={`flex-1 whitespace-pre-wrap text-xs leading-5.5 px-2 truncate ${color}`}>{item.content}</span>
                  </div>
                );
              })}
            </div>

            {/* Right: Modified */}
            <div className="flex-1">
              <div className="bg-brand-popover px-3 py-1.5 text-[11px] text-brand-textMuted border-b border-brand-border/50 font-bold uppercase tracking-wider">
                Modified Proposed
              </div>
              {lines.map((item, idx) => {
                if (item.type === 'delete') {
                  return (
                    <div key={idx} className="flex bg-brand-bg/60" style={{ height: '22px' }}>
                      <span className="w-10 text-right pr-2 text-[#52525b] select-none text-xs leading-5.5">{''}</span>
                      <span className="flex-1 whitespace-pre-wrap text-brand-textMuted/30 text-xs leading-5.5 px-2">—</span>
                    </div>
                  );
                }
                const bg = item.type === 'add' ? 'bg-[color:var(--neon-constructive)]/10' : 'transparent';
                const color = item.type === 'add' ? 'text-[color:var(--neon-constructive)]' : 'text-brand-textMain';
                return (
                  <div key={idx} className={`flex ${bg}`} style={{ height: '22px' }}>
                    <span className="w-10 text-right pr-2 text-[#52525b] select-none text-xs leading-5.5">{item.modLineNum || ''}</span>
                    <span className={`flex-1 whitespace-pre-wrap text-xs leading-5.5 px-2 truncate ${color}`}>{item.content}</span>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          /* ── Unified view ── */
          <div data-testid="unified-diff-container">
            {lines.map((item, idx) => {
              const bg =
                item.type === 'add'
                  ? 'bg-[color:var(--neon-constructive)]/10'
                  : item.type === 'delete'
                  ? 'bg-[color:var(--neon-destructive)]/10'
                  : '';
              const color =
                item.type === 'add'
                  ? 'text-[color:var(--neon-constructive)]'
                  : item.type === 'delete'
                  ? 'text-[color:var(--neon-destructive)]'
                  : 'text-brand-textMain';
              const prefix = item.type === 'add' ? '+' : item.type === 'delete' ? '-' : ' ';

              return (
                <div key={idx} className={`flex ${bg} leading-5.5 px-2`}>
                  <span className="w-8.75 text-right text-[#52525b] pr-1.5 select-none text-xs">{item.origLineNum || ''}</span>
                  <span className="w-8.75 text-right text-[#52525b] pr-3 select-none text-xs">{item.modLineNum || ''}</span>
                  <span className={`w-5 font-bold text-xs ${color}`}>{prefix}</span>
                  <span className={`whitespace-pre-wrap text-xs ${color} flex-1`}>{item.content}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
