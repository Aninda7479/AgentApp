import React, { useState } from 'react';

export interface DiffViewerProps {
  originalCode: string;
  modifiedCode: string;
  filename?: string;
  onAccept?: () => void;
  onReject?: () => void;
  onClose?: () => void;
}

interface DiffLine {
  type: 'add' | 'delete' | 'normal';
  content: string;
  origLineNum?: number;
  modLineNum?: number;
}

const computeDiff = (originalCode: string, modifiedCode: string): { lines: DiffLine[]; additions: number; deletions: number } => {
  const origLines = originalCode.split('\n');
  const modLines = modifiedCode.split('\n');
  const diffLines: DiffLine[] = [];
  let additions = 0;
  let deletions = 0;

  let i = 0;
  let j = 0;

  while (i < origLines.length || j < modLines.length) {
    if (i < origLines.length && j < modLines.length) {
      if (origLines[i] === modLines[j]) {
        diffLines.push({
          type: 'normal',
          content: origLines[i],
          origLineNum: i + 1,
          modLineNum: j + 1
        });
        i++;
        j++;
      } else {
        let matched = false;
        for (let k = j + 1; k < Math.min(j + 5, modLines.length); k++) {
          if (origLines[i] === modLines[k]) {
            while (j < k) {
              diffLines.push({
                type: 'add',
                content: modLines[j],
                modLineNum: j + 1
              });
              additions++;
              j++;
            }
            matched = true;
            break;
          }
        }
        if (!matched) {
          diffLines.push({
            type: 'delete',
            content: origLines[i],
            origLineNum: i + 1
          });
          deletions++;
          i++;
        }
      }
    } else if (i < origLines.length) {
      diffLines.push({
        type: 'delete',
        content: origLines[i],
        origLineNum: i + 1
      });
      deletions++;
      i++;
    } else if (j < modLines.length) {
      diffLines.push({
        type: 'add',
        content: modLines[j],
        modLineNum: j + 1
      });
      additions++;
      j++;
    }
  }

  return { lines: diffLines, additions, deletions };
};

export const DiffViewer: React.FC<DiffViewerProps> = ({
  originalCode,
  modifiedCode,
  filename = 'file.txt',
  onAccept,
  onReject,
  onClose
}) => {
  const [viewMode, setViewMode] = useState<'split' | 'unified'>('split');

  const { lines, additions, deletions } = computeDiff(originalCode, modifiedCode);

  const origSplitLines = originalCode.split('\n');
  const modSplitLines = modifiedCode.split('\n');

  return (
    <div className="flex flex-col h-full bg-brand-bg text-brand-textMain">
      {/* Header Toolbar */}
      <div className="h-[50px] bg-brand-sidebar border-b border-brand-border flex items-center justify-between px-5 flex-shrink-0">
        <div className="flex items-center gap-3">
          <span className="font-semibold text-sm">📄 {filename}</span>
          <span className="text-xs text-emerald-400 font-bold">+{additions}</span>
          <span className="text-xs text-red-400 font-bold">-{deletions}</span>
        </div>
        <div className="flex items-center gap-2.5">
          <button
            data-testid="toggle-view-mode"
            onClick={() => setViewMode(viewMode === 'split' ? 'unified' : 'split')}
            className="bg-white/5 border border-brand-border text-brand-textMuted hover:text-white rounded-lg px-3 py-1 text-xs cursor-pointer transition-colors"
          >
            Mode: {viewMode === 'split' ? 'Side-by-Side' : 'Unified'}
          </button>

          {onReject && (
            <button
              data-testid="btn-reject-diff"
              onClick={onReject}
              className="bg-red-900/60 border border-red-800/40 text-red-400 rounded-lg px-3.5 py-1.5 text-xs font-bold cursor-pointer hover:bg-red-800/60 transition-colors active:scale-[0.97]"
            >
              Reject ✕
            </button>
          )}

          {onAccept && (
            <button
              data-testid="btn-accept-diff"
              onClick={onAccept}
              className="bg-emerald-900/60 border border-emerald-800/40 text-emerald-400 rounded-lg px-3.5 py-1.5 text-xs font-bold cursor-pointer hover:bg-emerald-800/60 transition-colors active:scale-[0.97]"
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
        {viewMode === 'split' ? (
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
                      <span className="w-[40px] text-right pr-2 text-[#52525b] select-none text-xs leading-[22px]">{''}</span>
                      <span className="flex-1 text-brand-textMuted/30 text-xs leading-[22px] px-2">—</span>
                    </div>
                  );
                }
                const bg = item.type === 'delete' ? 'bg-red-950/30' : 'transparent';
                const color = item.type === 'delete' ? 'text-red-300' : 'text-brand-textMain';
                return (
                  <div key={idx} className={`flex ${bg}`} style={{ height: '22px' }}>
                    <span className="w-[40px] text-right pr-2 text-[#52525b] select-none text-xs leading-[22px]">{item.origLineNum || ''}</span>
                    <span className={`flex-1 whitespace-pre-wrap text-xs leading-[22px] px-2 truncate ${color}`}>{item.content}</span>
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
                      <span className="w-[40px] text-right pr-2 text-[#52525b] select-none text-xs leading-[22px]">{''}</span>
                      <span className="flex-1 whitespace-pre-wrap text-brand-textMuted/30 text-xs leading-[22px] px-2">—</span>
                    </div>
                  );
                }
                const bg = item.type === 'add' ? 'bg-emerald-950/30' : 'transparent';
                const color = item.type === 'add' ? 'text-emerald-300' : 'text-brand-textMain';
                return (
                  <div key={idx} className={`flex ${bg}`} style={{ height: '22px' }}>
                    <span className="w-[40px] text-right pr-2 text-[#52525b] select-none text-xs leading-[22px]">{item.modLineNum || ''}</span>
                    <span className={`flex-1 whitespace-pre-wrap text-xs leading-[22px] px-2 truncate ${color}`}>{item.content}</span>
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
                  ? 'bg-emerald-950/30'
                  : item.type === 'delete'
                  ? 'bg-red-950/30'
                  : '';
              const color =
                item.type === 'add'
                  ? 'text-emerald-300'
                  : item.type === 'delete'
                  ? 'text-red-300'
                  : 'text-brand-textMain';
              const prefix = item.type === 'add' ? '+' : item.type === 'delete' ? '-' : ' ';

              return (
                <div key={idx} className={`flex ${bg} leading-[22px] px-2`}>
                  <span className="w-[35px] text-right text-[#52525b] pr-1.5 select-none text-xs">{item.origLineNum || ''}</span>
                  <span className="w-[35px] text-right text-[#52525b] pr-3 select-none text-xs">{item.modLineNum || ''}</span>
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
