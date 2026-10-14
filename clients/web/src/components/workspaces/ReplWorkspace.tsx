import React, { useState } from 'react';
import {
  Code,
  Terminal,
  RotateCcw,
  Play,
  Layers,
  ChevronRight,
  ChevronDown,
  Sparkles,
  Check,
  AlertCircle,
  Search,
} from 'lucide-react';
import {
  DEMO_REPL_ENTRIES,
  DEMO_REPL_SCOPES,
  ReplBufferEntry,
  VariableScopeItem,
} from '../../demoData';

/**
 * Utility to parse raw ANSI escape codes into React styled elements
 */
function parseAnsiToReact(raw: string): React.ReactNode {
  // Simple regex-based ANSI color code splitter
  const parts = raw.split(/(\x1b\[[0-9;]*m)/g);
  let currentColor = '#cbd5e1';
  let isBold = false;

  return parts.map((part, index) => {
    if (part.startsWith('\x1b[')) {
      if (part === '\x1b[0m') {
        currentColor = '#cbd5e1';
        isBold = false;
      } else if (part === '\x1b[32m') {
        currentColor = '#10b981'; // green
      } else if (part === '\x1b[31m') {
        currentColor = '#ef4444'; // red
      } else if (part === '\x1b[33m') {
        currentColor = '#f59e0b'; // amber/yellow
      } else if (part === '\x1b[34m') {
        currentColor = '#3b82f6'; // blue
      } else if (part === '\x1b[35m') {
        currentColor = '#ec4899'; // magenta/purple
      } else if (part === '\x1b[36m') {
        currentColor = '#06b6d4'; // cyan
      } else if (part === '\x1b[1m') {
        isBold = true;
      }
      return null;
    }

    return (
      <span
        key={index}
        style={{
          color: currentColor,
          fontWeight: isBold ? 700 : 400,
        }}
      >
        {part}
      </span>
    );
  });
}

export const ReplWorkspace: React.FC = () => {
  const [entries, setEntries] = useState<ReplBufferEntry[]>(DEMO_REPL_ENTRIES);
  const [scopes, setScopes] = useState<VariableScopeItem[]>(DEMO_REPL_SCOPES);
  const [currentInput, setCurrentInput] = useState('');
  const [expandedScopes, setExpandedScopes] = useState<Record<string, boolean>>({ core: true });
  const [filterQuery, setFilterQuery] = useState('');

  const totalTokens = entries.reduce((acc, curr) => acc + curr.tokenCount, 0);
  const maxTokens = 25000;
  const tokenPercent = Math.min(100, Math.round((totalTokens / maxTokens) * 100));

  const toggleScope = (name: string) => {
    setExpandedScopes((prev) => ({ ...prev, [name]: !prev[name] }));
  };

  const handleExecute = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!currentInput.trim()) return;

    const newEntry: ReplBufferEntry = {
      id: `repl-${Date.now()}`,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
      input: currentInput.trim(),
      rawAnsiOutput: `\x1b[36m=>\x1b[0m \x1b[32m"${currentInput.trim()}"\x1b[0m evaluated in in-process v8 sandbox.`,
      tokenCount: Math.max(12, Math.round(currentInput.length / 3)),
      durationMs: 8,
      status: 'ok',
    };

    setEntries((prev) => [...prev, newEntry]);
    setCurrentInput('');
  };

  const handleResetSession = () => {
    setEntries([]);
    setCurrentInput('');
  };

  const renderScopeItem = (item: VariableScopeItem): React.ReactNode => {
    const isExpanded = !!expandedScopes[item.name];
    const hasChildren = item.children && item.children.length > 0;

    return (
      <div key={item.name} style={{ marginTop: '4px' }}>
        <div
          onClick={() => hasChildren && toggleScope(item.name)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            padding: '3px 6px',
            borderRadius: '4px',
            backgroundColor: '#161b22',
            fontSize: '12px',
            fontFamily: 'monospace',
            cursor: hasChildren ? 'pointer' : 'default',
          }}
        >
          {hasChildren ? (
            isExpanded ? <ChevronDown size={12} color="#94a3b8" /> : <ChevronRight size={12} color="#94a3b8" />
          ) : (
            <span style={{ width: '12px' }} />
          )}

          <span style={{ color: '#58a6ff', fontWeight: 600 }}>{item.name}</span>
          <span style={{ color: '#8b949e', fontSize: '10px' }}>({item.type})</span>
          <span style={{ color: '#94a3b8' }}>:</span>
          <span style={{ color: '#7ee787', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {item.value}
          </span>
          <span
            style={{
              marginLeft: 'auto',
              fontSize: '9px',
              padding: '1px 4px',
              borderRadius: '3px',
              backgroundColor: '#21262d',
              color: '#8b949e',
            }}
          >
            {item.scope}
          </span>
        </div>

        {hasChildren && isExpanded && (
          <div style={{ marginLeft: '16px', borderLeft: '1px solid #30363d', paddingLeft: '6px' }}>
            {item.children!.map((child) => renderScopeItem(child))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        backgroundColor: '#090d16',
        color: '#f8fafc',
        overflow: 'hidden',
      }}
    >
      {/* Top Header & Virtualized Buffer Telemetry */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '10px 20px',
          borderBottom: '1px solid #1e293b',
          backgroundColor: '#0f172a',
          fontSize: '13px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Code size={17} color="#8b5cf6" />
          <span style={{ fontWeight: 600 }}>In-Process Scripting & Execution REPL</span>
          <span
            style={{
              fontSize: '11px',
              padding: '2px 8px',
              borderRadius: '12px',
              backgroundColor: '#1e293b',
              color: '#a855f7',
              border: '1px solid #9333ea',
            }}
          >
            25,000 Token Virtualized Buffer
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          {/* Token Capacity Meter */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '11px', color: '#94a3b8' }}>
              Buffer Usage: {totalTokens} / {maxTokens} tokens ({tokenPercent}%)
            </span>
            <div
              style={{
                width: '100px',
                height: '6px',
                backgroundColor: '#1e293b',
                borderRadius: '3px',
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  width: `${tokenPercent}%`,
                  height: '100%',
                  backgroundColor: tokenPercent > 80 ? '#ef4444' : '#8b5cf6',
                }}
              />
            </div>
          </div>

          <button
            onClick={handleResetSession}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              backgroundColor: '#21262d',
              border: '1px solid #30363d',
              color: '#f85149',
              padding: '4px 10px',
              borderRadius: '6px',
              fontSize: '11px',
              cursor: 'pointer',
              fontWeight: 600,
            }}
          >
            <RotateCcw size={12} /> Reset REPL Session
          </button>
        </div>
      </div>

      {/* Main REPL Stage Layout */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {/* Left Column: Virtualized Buffer with ANSI Color Parser */}
        <div
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            backgroundColor: '#0d1117',
            borderRight: '1px solid #1e293b',
            overflow: 'hidden',
          }}
        >
          {/* Scrollable history log */}
          <div
            style={{
              flex: 1,
              overflowY: 'auto',
              padding: '16px',
              display: 'flex',
              flexDirection: 'column',
              gap: '12px',
              fontFamily: 'Consolas, Monaco, "Courier New", monospace',
              fontSize: '13px',
            }}
          >
            {entries.length === 0 && (
              <div style={{ margin: 'auto', textAlign: 'center', color: '#8b949e' }}>
                <Terminal size={32} color="#8b5cf6" style={{ margin: '0 auto 8px' }} />
                <div>REPL Environment Ready. Enter expressions or scripts below.</div>
              </div>
            )}

            {entries.map((item) => (
              <div
                key={item.id}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '4px',
                  borderBottom: '1px solid #21262d',
                  paddingBottom: '10px',
                }}
              >
                {/* Input row */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#58a6ff' }}>
                  <span style={{ color: '#8b949e', fontSize: '11px' }}>[{item.timestamp}]</span>
                  <span style={{ fontWeight: 700 }}>&gt;</span>
                  <span style={{ color: '#f0f6fc', whiteSpace: 'pre-wrap' }}>{item.input}</span>
                  <span style={{ marginLeft: 'auto', fontSize: '11px', color: '#6e7681' }}>
                    {item.durationMs}ms ({item.tokenCount} tok)
                  </span>
                </div>

                {/* Evaluated ANSI Output */}
                <div
                  style={{
                    backgroundColor: '#161b22',
                    padding: '8px 12px',
                    borderRadius: '6px',
                    lineHeight: '1.5',
                    whiteSpace: 'pre-wrap',
                  }}
                >
                  {parseAnsiToReact(item.rawAnsiOutput)}
                </div>
              </div>
            ))}
          </div>

          {/* Bottom Execution Prompt Composer */}
          <div
            style={{
              padding: '12px 16px',
              borderTop: '1px solid #21262d',
              backgroundColor: '#161b22',
            }}
          >
            <form onSubmit={handleExecute} style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <span style={{ color: '#8b5cf6', fontFamily: 'monospace', fontWeight: 700, fontSize: '16px' }}>&gt;</span>
              <input
                type="text"
                value={currentInput}
                onChange={(e) => setCurrentInput(e.target.value)}
                placeholder="const res = await core.invoke('system-info'); (Press Enter to execute)"
                style={{
                  flex: 1,
                  backgroundColor: '#0d1117',
                  border: '1px solid #30363d',
                  borderRadius: '6px',
                  color: '#f0f6fc',
                  padding: '8px 12px',
                  fontFamily: 'Consolas, Monaco, monospace',
                  fontSize: '13px',
                  outline: 'none',
                }}
              />
              <button
                type="submit"
                style={{
                  backgroundColor: '#238636',
                  border: 'none',
                  color: '#ffffff',
                  padding: '8px 14px',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  fontWeight: 600,
                  fontSize: '12px',
                }}
              >
                <Play size={13} /> Eval
              </button>
            </form>
          </div>
        </div>

        {/* Right Column: Live Variable & Scope Inspector */}
        <div
          style={{
            width: '380px',
            backgroundColor: '#0f172a',
            display: 'flex',
            flexDirection: 'column',
            overflowY: 'auto',
            padding: '16px',
            gap: '12px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ fontSize: '11px', textTransform: 'uppercase', color: '#94a3b8', fontWeight: 700, letterSpacing: '0.05em' }}>
              Live Scope Inspector ({scopes.length} Symbols)
            </div>
            <span
              style={{
                fontSize: '10px',
                padding: '2px 6px',
                borderRadius: '4px',
                backgroundColor: '#1e293b',
                color: '#38bdf8',
              }}
            >
              V8 Engine Context
            </span>
          </div>

          <div
            style={{
              backgroundColor: '#090d16',
              border: '1px solid #1e293b',
              borderRadius: '8px',
              padding: '10px',
              flex: 1,
              overflowY: 'auto',
            }}
          >
            {scopes.map((s) => renderScopeItem(s))}
          </div>
        </div>
      </div>
    </div>
  );
};
