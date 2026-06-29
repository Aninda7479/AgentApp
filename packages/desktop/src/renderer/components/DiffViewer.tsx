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

export const DiffViewer: React.FC<DiffViewerProps> = ({
  originalCode,
  modifiedCode,
  filename = 'file.txt',
  onAccept,
  onReject,
  onClose
}) => {
  const [viewMode, setViewMode] = useState<'split' | 'unified'>('split');

  // Simple line-by-line diff algorithm for GUI visualization
  const computeDiff = (): { lines: DiffLine[]; additions: number; deletions: number } => {
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
          // Look ahead to match
          let matched = false;
          for (let k = j + 1; k < Math.min(j + 5, modLines.length); k++) {
            if (origLines[i] === modLines[k]) {
              // Additions
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

  const { lines, additions, deletions } = computeDiff();

  const origSplitLines = originalCode.split('\n');
  const modSplitLines = modifiedCode.split('\n');
  const maxLines = Math.max(origSplitLines.length, modSplitLines.length);

  return (
    <div
      data-testid="diff-viewer"
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        backgroundColor: '#09090b',
        color: '#f4f4f5'
      }}
    >
      {/* Header Toolbar */}
      <div
        style={{
          height: '50px',
          backgroundColor: '#121215',
          borderBottom: '1px solid #27272a',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 20px'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span style={{ fontWeight: 600, fontSize: '0.95rem' }}>📄 {filename}</span>
          <span style={{ fontSize: '0.8rem', color: '#10b981', fontWeight: 600 }}>+{additions}</span>
          <span style={{ fontSize: '0.8rem', color: '#ef4444', fontWeight: 600 }}>-{deletions}</span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          {/* View Mode Switch */}
          <button
            data-testid="toggle-view-mode"
            onClick={() => setViewMode(viewMode === 'split' ? 'unified' : 'split')}
            style={{
              backgroundColor: '#1a1a1e',
              border: '1px solid #3f3f46',
              color: '#a1a1aa',
              borderRadius: '6px',
              padding: '4px 10px',
              fontSize: '0.8rem',
              cursor: 'pointer'
            }}
          >
            Mode: {viewMode === 'split' ? 'Side-by-Side' : 'Unified'}
          </button>

          {onReject && (
            <button
              data-testid="btn-reject-diff"
              onClick={onReject}
              style={{
                backgroundColor: '#7f1d1d',
                border: 'none',
                color: '#fca5a5',
                borderRadius: '6px',
                padding: '6px 14px',
                fontSize: '0.85rem',
                fontWeight: 600,
                cursor: 'pointer'
              }}
            >
              Reject ✕
            </button>
          )}

          {onAccept && (
            <button
              data-testid="btn-accept-diff"
              onClick={onAccept}
              style={{
                backgroundColor: '#064e3b',
                border: 'none',
                color: '#6ee7b7',
                borderRadius: '6px',
                padding: '6px 14px',
                fontSize: '0.85rem',
                fontWeight: 600,
                cursor: 'pointer'
              }}
            >
              Accept All ✓
            </button>
          )}

          {onClose && (
            <button
              data-testid="btn-close-diff"
              onClick={onClose}
              style={{
                backgroundColor: 'transparent',
                border: 'none',
                color: '#a1a1aa',
                fontSize: '1.2rem',
                cursor: 'pointer',
                marginLeft: '8px'
              }}
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {/* Main Diff Content Area */}
      <div style={{ flex: 1, overflow: 'auto', fontFamily: 'monospace', fontSize: '0.85rem' }}>
        {viewMode === 'split' ? (
          /* Side by side view */
          <div style={{ display: 'flex', minWidth: '100%' }} data-testid="split-diff-container">
            {/* Left Column: Original */}
            <div style={{ flex: 1, borderRight: '1px solid #27272a' }}>
              <div
                style={{
                  backgroundColor: '#18181b',
                  padding: '6px 12px',
                  fontSize: '0.75rem',
                  color: '#a1a1aa',
                  borderBottom: '1px solid #27272a'
                }}
              >
                Original Base
              </div>
              {Array.from({ length: maxLines }).map((_, idx) => {
                const line = origSplitLines[idx];
                const isLinePresent = line !== undefined;
                return (
                  <div
                    key={`orig-${idx}`}
                    style={{
                      display: 'flex',
                      backgroundColor: isLinePresent ? '#09090b' : '#121215',
                      lineHeight: '20px'
                    }}
                  >
                    <span
                      style={{
                        width: '40px',
                        paddingRight: '8px',
                        textAlign: 'right',
                        color: '#52525b',
                        userSelect: 'none'
                      }}
                    >
                      {isLinePresent ? idx + 1 : ''}
                    </span>
                    <span style={{ paddingLeft: '8px', whiteSpace: 'pre-wrap', flex: 1, color: '#d4d4d8' }}>
                      {line || ''}
                    </span>
                  </div>
                );
              })}
            </div>

            {/* Right Column: Modified */}
            <div style={{ flex: 1 }}>
              <div
                style={{
                  backgroundColor: '#18181b',
                  padding: '6px 12px',
                  fontSize: '0.75rem',
                  color: '#a1a1aa',
                  borderBottom: '1px solid #27272a'
                }}
              >
                Modified Proposed
              </div>
              {Array.from({ length: maxLines }).map((_, idx) => {
                const line = modSplitLines[idx];
                const isLinePresent = line !== undefined;
                return (
                  <div
                    key={`mod-${idx}`}
                    style={{
                      display: 'flex',
                      backgroundColor: isLinePresent ? '#06281e' : '#121215',
                      lineHeight: '20px'
                    }}
                  >
                    <span
                      style={{
                        width: '40px',
                        paddingRight: '8px',
                        textAlign: 'right',
                        color: '#52525b',
                        userSelect: 'none'
                      }}
                    >
                      {isLinePresent ? idx + 1 : ''}
                    </span>
                    <span style={{ paddingLeft: '8px', whiteSpace: 'pre-wrap', flex: 1, color: '#a7f3d0' }}>
                      {line || ''}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          /* Unified view */
          <div data-testid="unified-diff-container">
            {lines.map((item, idx) => {
              const bg =
                item.type === 'add'
                  ? 'rgba(6, 78, 59, 0.4)'
                  : item.type === 'delete'
                  ? 'rgba(127, 29, 29, 0.4)'
                  : 'transparent';
              const color =
                item.type === 'add'
                  ? '#6ee7b7'
                  : item.type === 'delete'
                  ? '#fca5a5'
                  : '#d4d4d8';
              const prefix = item.type === 'add' ? '+' : item.type === 'delete' ? '-' : ' ';

              return (
                <div
                  key={idx}
                  style={{
                    display: 'flex',
                    backgroundColor: bg,
                    lineHeight: '20px',
                    padding: '0 8px'
                  }}
                >
                  <span
                    style={{
                      width: '35px',
                      textAlign: 'right',
                      color: '#52525b',
                      paddingRight: '6px',
                      userSelect: 'none'
                    }}
                  >
                    {item.origLineNum || ''}
                  </span>
                  <span
                    style={{
                      width: '35px',
                      textAlign: 'right',
                      color: '#52525b',
                      paddingRight: '12px',
                      userSelect: 'none'
                    }}
                  >
                    {item.modLineNum || ''}
                  </span>
                  <span style={{ width: '20px', color: color, fontWeight: 'bold' }}>{prefix}</span>
                  <span style={{ whiteSpace: 'pre-wrap', color: color, flex: 1 }}>{item.content}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
