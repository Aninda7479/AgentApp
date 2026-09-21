import React, { useState, useEffect, useRef } from 'react';
import { ChevronRight, ChevronDown, ChevronLeft, Copy, FileText, FolderOpen, Check, Eye, RotateCcw, Edit, RefreshCw, Trash2, Loader2, Code2, Play, ExternalLink, Sparkles, Download } from 'lucide-react';
import { TrajectoryService } from '../../logic/trajectory';
import { getIpc } from '../../lib/ipc';
import { ErrorBoundary } from '../../components/ErrorBoundary';
import { copyToClipboard } from '../../util/clipboard';

/** A single step in the agent execution trajectory. */
export interface TrajectoryStep {
  id: string;
  type: 'user' | 'assistant' | 'tool_call' | 'tool_result' | 'thought';
  content: string;
  timestamp?: string;
  status?: 'pending' | 'running' | 'success' | 'error';
  toolName?: string;
  metadata?: {
    filename?: string;
    originalCode?: string;
    modifiedCode?: string;
    mediaType?: 'image' | 'pdf' | 'ppt' | 'audio';
    addedLines?: number;
    removedLines?: number;
    filesExplored?: number;
    foldersExplored?: number;
    workedDuration?: string;
    [key: string]: any;
  };
}

// ─── Local Image Preview ──────────────────────────────────────────────────────
const LocalImagePreview: React.FC<{ filePath: string }> = ({ filePath }) => {
  const isDirectUrl =
    filePath.startsWith('data:') ||
    filePath.startsWith('blob:') ||
    filePath.startsWith('http://') ||
    filePath.startsWith('https://');

  const [src, setSrc] = useState<string | null>(isDirectUrl ? filePath : null);
  const [failed, setFailed] = useState(false);
  const [loading, setLoading] = useState(!isDirectUrl);

  useEffect(() => {
    if (isDirectUrl) {
      setSrc(filePath);
      setLoading(false);
      return;
    }

    let active = true;
    setLoading(true);
    setFailed(false);

    TrajectoryService.readLocalImageBase64(filePath)
      .then((base64: string | null) => {
        if (!active) return;
        if (base64) {
          setSrc(base64);
          setFailed(false);
        } else {
          setFailed(true);
        }
        setLoading(false);
      })
      .catch(() => {
        if (active) {
          setFailed(true);
          setLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [filePath, isDirectUrl]);

  if (src && !failed) {
    return (
      <div className="mt-2 relative group max-w-full overflow-hidden rounded-lg">
        <img
          src={src}
          alt="Attached preview"
          onError={() => setFailed(true)}
          className="rounded-lg max-w-full max-h-[220px] object-contain border border-brand-border/60 shadow-sm bg-black/20"
        />
      </div>
    );
  }

  if (loading) {
    return (
      <div className="mt-2 w-32 h-16 bg-brand-card/60 animate-pulse rounded-lg border border-brand-border/40 flex items-center justify-center gap-1.5 text-[10px] text-brand-textMuted select-none">
        <Loader2 size={12} className="animate-spin text-brand-textMuted" />
        <span>Loading image...</span>
      </div>
    );
  }

  // Graceful fallback when image file cannot be read directly via IPC
  const filename = filePath.split(/[/\\]/).pop() || filePath;
  return (
    <div className="mt-2 p-2 rounded-lg bg-brand-card/40 border border-brand-border/40 flex items-center gap-2 max-w-full text-left">
      <span className="text-sm select-none">🖼️</span>
      <span className="text-[11px] font-mono text-brand-textMuted truncate max-w-[200px]" title={filePath}>
        {filename}
      </span>
    </div>
  );
};

// ─── Worked-for collapsible header ───────────────────────────────────────────
interface WorkedHeaderProps {
  duration: string;
  filesExplored?: number;
  foldersExplored?: number;
  editedFiles?: Array<{ name: string; added: number; removed: number }>;
  children?: React.ReactNode;
  initialExpanded?: boolean;
  isWorking?: boolean;
  isThoughtOnly?: boolean;
}

export const WorkedHeader: React.FC<WorkedHeaderProps> = ({
  duration,
  filesExplored,
  foldersExplored,
  editedFiles = [],
  children,
  initialExpanded = false,
  isWorking = false,
  isThoughtOnly = false,
}) => {
  const [expanded, setExpanded] = useState(isWorking || initialExpanded);
  const userInteractedRef = useRef(false);
  const prevWorkingRef = useRef(isWorking);

  useEffect(() => {
    const wasWorking = prevWorkingRef.current;
    prevWorkingRef.current = isWorking;

    if (isWorking) {
      if (!userInteractedRef.current) {
        setExpanded(true);
      }
    } else if (wasWorking && !isWorking) {
      // Run completed! If user didn't manually toggle this response, auto-collapse adaptively
      if (!userInteractedRef.current) {
        setExpanded(false);
      }
    }
  }, [isWorking]);

  return (
    <div className="flex flex-col gap-1 select-none w-full text-left mb-1 font-sans">
      {/* "Worked for Xs ˅" or "Thought for Xs ˅" toggle */}
      <button
        type="button"
        onClick={() => {
          userInteractedRef.current = true;
          setExpanded((prev) => !prev);
        }}
        className="flex items-center gap-1.5 text-brand-textMuted hover:text-brand-textMain text-[13px] font-medium transition-colors w-fit group cursor-pointer"
      >
        {expanded ? (
          <ChevronDown size={13} className="text-brand-textMuted group-hover:text-brand-textMain transition-colors shrink-0" />
        ) : (
          <ChevronRight size={13} className="text-brand-textMuted group-hover:text-brand-textMain transition-colors shrink-0" />
        )}
        {isWorking ? (
          <span className="flex items-center gap-1.5 text-[color:var(--neon-live)] font-semibold animate-pulse">
            <span className="w-1.5 h-1.5 rounded-full bg-[color:var(--neon-live)]" />
            <span>Thinking... ({duration})</span>
          </span>
        ) : isThoughtOnly ? (
          <span className="font-medium text-brand-textMuted">
            Thought for {duration}
          </span>
        ) : (
          <span className="font-medium text-brand-textMuted">
            Worked for {duration}
          </span>
        )}
      </button>

      {/* Collapsible detail steps */}
      {expanded && (
        <div className="ml-2 pl-3 border-l border-brand-border/40 flex flex-col gap-0.5 animate-fade-in mt-1 w-full text-left">
          {children}
        </div>
      )}
    </div>
  );
};

// ─── File Changed Summary Chip ────────────────────────────────────────────────
interface FileChangedChipProps {
  count: number;
  added: number;
  removed: number;
  onReview?: () => void;
}

const FileChangedChip: React.FC<FileChangedChipProps> = ({ count, added, removed, onReview }) => (
  <div className="flex items-center justify-between gap-3 mt-2">
    <button className="flex items-center gap-2 text-[11px] text-brand-textMuted hover:text-brand-textMain transition-colors group">
      <span>{count} file{count !== 1 ? 's' : ''} changed</span>
      {added > 0 && <span className="text-[color:var(--neon-constructive)] font-semibold">+{added}</span>}
      {removed > 0 && <span className="text-[color:var(--neon-destructive)] font-semibold">-{removed}</span>}
      <ChevronRight size={11} className="text-brand-textMuted/60 group-hover:text-brand-textMain transition-colors" />
    </button>

    {onReview && (
      <button
        onClick={onReview}
        className="flex items-center gap-1.5 text-[11px] text-brand-textMuted hover:text-brand-textMain border border-brand-border hover:border-brand-border-strong px-2.5 py-1 rounded-md transition-all select-none"
      >
        <Eye size={11} />
        <span>Review</span>
      </button>
    )}
  </div>
);

// ─── Icon action button (tooltip on hover) ────────────────────────────────────
interface TrajectoryIconButtonProps {
  title: string;
  onClick: () => void;
  children: React.ReactNode;
  danger?: boolean;
}

/** Small icon-only button that reveals its purpose via a native tooltip on hover. */
const TrajectoryIconButton: React.FC<TrajectoryIconButtonProps> = ({ title, onClick, children, danger }) => (
  <button
    type="button"
    onClick={onClick}
    title={title}
    aria-label={title}
    className={`p-1.5 rounded-md text-brand-textMuted transition-all cursor-pointer border border-transparent hover:bg-[var(--brand-hover)] ${
      danger
        ? 'hover:text-[color:var(--neon-destructive)] hover:border-[color:var(--neon-destructive)]/30'
        : 'hover:text-brand-textMain hover:border-brand-border'
    }`}
  >
    {children}
  </button>
);

// ─── Copy (icon-only) ──────────────────────────────────────────────────────────
const CopyUserButton: React.FC<{ content: string }> = ({ content }) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    const ok = await copyToClipboard(content);
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
  };

  return (
    <TrajectoryIconButton title={copied ? 'Copied!' : 'Copy message'} onClick={handleCopy}>
      {copied ? <Check size={13} className="text-[color:var(--neon-constructive)]" /> : <Copy size={13} />}
    </TrajectoryIconButton>
  );
};

// ─── Action buttons (copy) ────────────────────────────────────────────────────
interface MessageActionsProps {
  content: string;
}

const MessageActions: React.FC<MessageActionsProps> = ({ content }) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    const ok = await copyToClipboard(content);
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
  };

  return (
    <div className="flex items-center gap-1 select-none">
      <button
        onClick={handleCopy}
        title="Copy"
        className="p-1.5 rounded-md text-brand-textMuted hover:text-brand-textMain hover:bg-[var(--brand-hover)] transition-all cursor-pointer"
      >
        {copied ? <Check size={13} className="text-[color:var(--neon-constructive)]" /> : <Copy size={13} />}
      </button>
    </div>
  );
};

// ─── Streaming Cursor ─────────────────────────────────────────────────────────
const StreamingCursor: React.FC = () => (
  <span
    className="inline-block w-[2px] h-[1.1em] bg-brand-textMain ml-0.5 align-middle animate-[blink_1s_step-end_infinite] rounded-sm"
    style={{ animation: 'blink 0.9s step-end infinite' }}
  />
);

// ─── Thought Copy Button ─────────────────────────────────────────────────────
const ThoughtCopyButton: React.FC<{ content: string }> = ({ content }) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const ok = await copyToClipboard(content);
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
  };

  return (
    <button
      type="button"
      onClick={handleCopy}
      className="text-brand-textMuted hover:text-brand-textMain p-1 rounded hover:bg-brand-card transition-colors cursor-pointer flex items-center gap-1"
      title="Copy reasoning"
    >
      {copied ? <Check size={11} className="text-[color:var(--neon-constructive)]" /> : <Copy size={11} />}
      <span className="text-[10px]">{copied ? 'Copied' : 'Copy'}</span>
    </button>
  );
};

// ─── Expandable Tool Call Card ────────────────────────────────────────────────
// ─── Modern Antigravity-Style Tool Call Card ──────────────────────────────────
interface ToolCallCardProps {
  step: TrajectoryStep;
  isStreaming?: boolean;
  initialExpanded?: boolean;
  onViewDiff?: (file: string, original: string, modified: string) => void;
  onActionClick?: (action: string, data: any) => void;
}

export const ToolCallCard: React.FC<ToolCallCardProps> = ({
  step,
  isStreaming = false,
  initialExpanded = false,
  onViewDiff,
  onActionClick,
}) => {
  const [expanded, setExpanded] = useState(initialExpanded);
  const userInteractedRef = useRef(false);
  const prevRunningRef = useRef(false);
  const details = TrajectoryService.parseToolDetails(step);

  const isSuccess = step.status === 'success';
  const isError = step.status === 'error';
  // Loading circle fix: only active while streaming and status is running and content not yet received
  const isRunning = isStreaming && (step.status === 'running' || (!step.status && !step.content));

  // Auto-expand currently active live tool call; auto-collapse on success if not manually toggled
  useEffect(() => {
    const wasRunning = prevRunningRef.current;
    prevRunningRef.current = isRunning;

    if (isRunning) {
      if (!userInteractedRef.current) {
        setExpanded(true);
      }
    } else if (wasRunning && !isRunning) {
      if (!userInteractedRef.current && !isError) {
        setExpanded(false);
      }
    }
  }, [isRunning, isError]);

  const handleOpenDiff = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!onViewDiff) return;
    const input = step.metadata?.toolInput || {};
    const meta = step.metadata || {};
    const filename = meta.filename || input.TargetFile || input.AbsolutePath || input.path || details.targetName;
    const original = meta.originalCode || input.TargetContent || '';
    const modified = meta.modifiedCode || input.ReplacementContent || TrajectoryService.normalizeContent(step.content) || '';
    onViewDiff(filename, original, modified);
  };

  return (
    <div className="flex flex-col gap-1 w-full text-left font-sans select-none animate-fade-in my-0.5">
      {/* ── Row Item ──── */}
      <div
        onClick={() => {
          userInteractedRef.current = true;
          setExpanded(!expanded);
        }}
        className="flex items-center justify-between gap-2 px-1.5 py-1 rounded-lg hover:bg-brand-card/50 transition-colors cursor-pointer group w-full"
      >
        <div className="flex items-center gap-2 min-w-0 flex-1 text-[13px] text-brand-textMain leading-snug">
          {/* Action toggle arrow or live spinner */}
          {isRunning ? (
            <Loader2 size={13} className="text-[color:var(--neon-live)] animate-spin shrink-0" />
          ) : expanded ? (
            <ChevronDown size={13} className="text-brand-textMuted group-hover:text-brand-textMain shrink-0 transition-colors" />
          ) : (
            <ChevronRight size={13} className="text-brand-textMuted/70 group-hover:text-brand-textMain shrink-0 transition-colors" />
          )}

          {/* Action label (Analyzed / Edited / Ran / Searched / Thought) */}
          <span className="text-brand-textMuted font-medium shrink-0">
            {details.actionLabel}
          </span>

          {/* Language / Tool icon badge */}
          {details.icon && (
            <span className="text-[13px] shrink-0">{details.icon}</span>
          )}

          {/* Target filename / command / query */}
          {details.targetName && (
            <span className="font-mono text-brand-textMain font-medium truncate max-w-[300px] sm:max-w-[480px]">
              {details.targetName}
            </span>
          )}
          {step.toolName && (
            <span className="hidden text-[0px]" aria-hidden="true">{step.toolName}</span>
          )}

          {/* Line range highlight (e.g. #L50-180) */}
          {details.lineRange && (
            <span className="text-brand-textMuted/70 text-[12px] font-mono shrink-0">
              {details.lineRange}
            </span>
          )}

          {/* Diff stats (+10 -0) */}
          {details.diffStats && (
            <span className="flex items-center gap-1 font-mono text-[12px] font-semibold shrink-0">
              {details.diffStats.added > 0 && (
                <span className="text-[color:var(--neon-constructive)]">+{details.diffStats.added}</span>
              )}
              {details.diffStats.removed > 0 && (
                <span className="text-[color:var(--neon-destructive)]">-{details.diffStats.removed}</span>
              )}
            </span>
          )}
        </div>

        {/* Action pills (e.g. Open Diff on hover) */}
        <div className="flex items-center gap-1.5 shrink-0">
          {details.category === 'edit' && onViewDiff && (
            <button
              type="button"
              onClick={handleOpenDiff}
              className="px-2 py-0.5 rounded text-[10px] font-semibold bg-brand-card hover:bg-brand-hover border border-brand-border text-brand-textMain transition-all cursor-pointer select-none opacity-80 group-hover:opacity-100"
              title="Open Diff Viewer"
            >
              Open Diff
            </button>
          )}

          {isError && (
            <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-red-500/10 text-red-400 border border-red-500/20 uppercase tracking-wider">
              Failed
            </span>
          )}
        </div>
      </div>

      {/* ── Expanded Content ──── */}
      {expanded && (
        <div className="ml-5 pl-2 border-l border-brand-border/40 my-1 w-full max-w-full animate-fade-in text-left">
          {details.category === 'command' ? (
            /* Terminal Box Output (matching Image 3) */
            <div className="w-full bg-[#0d1117] rounded-lg border border-slate-800/80 p-3 select-text font-mono text-xs text-slate-200 shadow-inner">
              <div className="text-slate-400 font-semibold mb-2 text-[11px] flex items-center justify-between">
                <span>
                  {details.cwd ? `...\\${details.cwd.split(/[/\\]/).pop()} > ` : '> '}
                  <span className="text-cyan-300">{details.commandLine || details.targetName}</span>
                </span>
                {step.content && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      copyToClipboard(step.content);
                    }}
                    className="text-slate-500 hover:text-slate-200 text-[10px] p-1 rounded hover:bg-slate-800 transition-colors cursor-pointer"
                    title="Copy output"
                  >
                    <Copy size={11} />
                  </button>
                )}
              </div>
              {step.content ? (
                <pre className="whitespace-pre-wrap leading-relaxed text-slate-300 text-[11px] overflow-x-auto max-h-72 scrollbar-thin">
                  {TrajectoryService.stripAnsi(step.content)}
                </pre>
              ) : isRunning ? (
                <div className="flex items-center gap-2 text-slate-500 italic text-[11px] py-1">
                  <Loader2 size={12} className="animate-spin text-cyan-400" />
                  <span>Executing command...</span>
                </div>
              ) : (
                <div className="text-slate-500 italic text-[11px]">Command completed with no output.</div>
              )}
            </div>
          ) : details.category === 'thought' ? (
            /* Thought Block - Wrappable, Scrollable & Optimized */
            <div className="bg-brand-card/30 border border-brand-border/40 rounded-lg p-3 text-[12px] text-brand-textMuted leading-relaxed font-sans border-l-2 border-l-brand-highlight/60 break-words [overflow-wrap:anywhere] select-text animate-fade-in">
              <div className="flex items-center justify-between pb-2 mb-2 border-b border-brand-border/20 text-[11px] font-mono select-none">
                <span className="flex items-center gap-1.5 text-brand-textMuted font-medium">
                  <span className="text-[12px]">💡</span>
                  <span>Reasoning Process</span>
                  {isRunning && (
                    <span className="flex items-center gap-1 text-[color:var(--neon-live)] ml-1 animate-pulse">
                      <span className="w-1.5 h-1.5 rounded-full bg-[color:var(--neon-live)]" />
                      <span>Thinking...</span>
                    </span>
                  )}
                </span>
                {step.content && <ThoughtCopyButton content={TrajectoryService.normalizeContent(step.content)} />}
              </div>
              <div className="max-h-80 overflow-y-auto scrollbar-thin pr-1 break-words [overflow-wrap:anywhere] whitespace-pre-wrap font-mono text-[11.5px] leading-relaxed text-brand-textMuted/90">
                {TrajectoryService.normalizeContent(step.content)}
              </div>
            </div>
          ) : (
            /* File / Tool Generic Output */
            <div className="bg-brand-card/20 border border-brand-border/30 rounded-lg p-2.5 space-y-2 text-left">
              {step.metadata?.toolInput && (
                <div>
                  <div className="text-[9px] font-semibold uppercase tracking-wider text-brand-textMuted/50 mb-1">Parameters</div>
                  <pre className="text-[10px] font-mono text-brand-textMuted/80 bg-brand-bg/60 rounded p-2 overflow-x-auto max-h-36 whitespace-pre-wrap break-all select-text">
                    {typeof step.metadata.toolInput === 'string'
                      ? step.metadata.toolInput
                      : JSON.stringify(step.metadata.toolInput, null, 2)}
                  </pre>
                </div>
              )}
              {step.content && (
                <div>
                  <div className="text-[9px] font-semibold uppercase tracking-wider text-brand-textMuted/50 mb-1">Result</div>
                  <pre className="text-[10px] font-mono text-brand-textMuted/80 bg-brand-bg/60 rounded p-2 overflow-x-auto max-h-48 whitespace-pre-wrap break-all select-text">
                    {TrajectoryService.stripAnsi(step.content).slice(0, 3000)}
                    {TrajectoryService.normalizeContent(step.content).length > 3000 && (
                      <span className="text-brand-textMuted/40">... ({TrajectoryService.normalizeContent(step.content).length} chars)</span>
                    )}
                  </pre>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// ─── Interactive Artifact Card & Code Block Component ─────────────────────────
interface InteractiveArtifactCardProps {
  content: string;
  language?: string;
  artifactId?: string;
  title?: string;
}

const InteractiveArtifactCard: React.FC<InteractiveArtifactCardProps> = ({
  content,
  language = 'html',
  artifactId = 'app',
  title = 'Interactive Web App',
}) => {
  const isWebHtml = language.toLowerCase() === 'html' || content.includes('<!DOCTYPE html>') || content.includes('<html') || content.includes('<script') || content.includes('<style');
  const [activeTab, setActiveTab] = useState<'preview' | 'code'>(isWebHtml ? 'preview' : 'code');
  const [copied, setCopied] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const cleanId = artifactId.toLowerCase().replace(/[^a-z0-9_-]/g, '-').replace(/^-+|-+$/g, '') || 'app';
  const displayTitle = title || (isWebHtml ? 'Interactive Web App / Game' : `${language.toUpperCase()} Code`);

  const handleCopy = async () => {
    const ok = await copyToClipboard(content);
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleSaveToArtifacts = async () => {
    const ipc = getIpc();
    if (!ipc) return;
    setSaving(true);
    try {
      await ipc.invoke('artifact:create', {
        id: cleanId,
        name: displayTitle,
        description: 'Created from SuperAgent Standalone Chat',
        type: 'web',
        entry: 'index.html',
        files: {
          'index.html': content,
        },
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      console.error('[ArtifactCard] Failed to save artifact:', err);
    } finally {
      setSaving(false);
    }
  };

  const handleOpenExternal = () => {
    try {
      const blob = new Blob([content], { type: 'text/html' });
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank');
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (err) {
      console.error('[ArtifactCard] Failed to open in new tab:', err);
    }
  };

  return (
    <div className="my-3 rounded-xl border border-brand-border/80 bg-brand-card shadow-md overflow-hidden animate-fade-in">
      {/* Header bar */}
      <div className="px-3.5 py-2.5 bg-brand-popover/60 border-b border-brand-border/60 flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2 min-w-0">
          <span className="p-1 rounded-md bg-brand-highlight/20 text-brand-highlight text-xs">
            {isWebHtml ? '🎮' : '📄'}
          </span>
          <span className="text-xs font-bold text-brand-textMain truncate">
            {displayTitle}
          </span>
          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-brand-card border border-brand-border/60 text-brand-textMuted uppercase">
            {language}
          </span>
        </div>

        {/* Tab & Action buttons */}
        <div className="flex items-center gap-1.5 flex-wrap">
          {isWebHtml && (
            <div className="flex items-center bg-brand-card p-0.5 rounded-lg border border-brand-border/40 text-[11px]">
              <button
                type="button"
                onClick={() => setActiveTab('preview')}
                className={`px-2.5 py-1 rounded-md font-medium transition-all cursor-pointer flex items-center gap-1 ${
                  activeTab === 'preview'
                    ? 'bg-brand-highlight text-brand-highlight-text font-semibold shadow-xs'
                    : 'text-brand-textMuted hover:text-brand-textMain'
                }`}
              >
                <Play size={11} />
                <span>Live App</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('code')}
                className={`px-2.5 py-1 rounded-md font-medium transition-all cursor-pointer flex items-center gap-1 ${
                  activeTab === 'code'
                    ? 'bg-brand-highlight text-brand-highlight-text font-semibold shadow-xs'
                    : 'text-brand-textMuted hover:text-brand-textMain'
                }`}
              >
                <Code2 size={11} />
                <span>Code</span>
              </button>
            </div>
          )}

          {isWebHtml && (
            <button
              type="button"
              onClick={handleSaveToArtifacts}
              disabled={saving || saved}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer border ${
                saved
                  ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                  : 'bg-brand-card hover:bg-[color:var(--brand-hover-strong)] text-brand-textMain border-brand-border/60'
              }`}
              title="Save directly to ~/.superagent/artifacts"
            >
              {saved ? <Check size={12} className="text-emerald-400" /> : <Download size={12} />}
              <span>{saved ? 'Saved!' : saving ? 'Saving...' : 'Save to Gallery'}</span>
            </button>
          )}

          {isWebHtml && (
            <button
              type="button"
              onClick={handleOpenExternal}
              className="p-1.5 rounded-lg text-brand-textMuted hover:text-brand-textMain hover:bg-[color:var(--brand-hover-strong)] transition-colors cursor-pointer border border-brand-border/40"
              title="Open in new window"
            >
              <ExternalLink size={12} />
            </button>
          )}

          <button
            type="button"
            onClick={handleCopy}
            className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium text-brand-textMuted hover:text-brand-textMain hover:bg-[color:var(--brand-hover-strong)] transition-colors cursor-pointer border border-brand-border/40"
            title="Copy code"
          >
            {copied ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
            <span>{copied ? 'Copied' : 'Copy'}</span>
          </button>
        </div>
      </div>

      {/* Body Content */}
      <div className="p-3 bg-brand-bg/50">
        {activeTab === 'preview' && isWebHtml ? (
          <div className="w-full h-84 rounded-lg overflow-hidden border border-brand-border/60 bg-white shadow-inner">
            <iframe
              srcDoc={content}
              sandbox="allow-scripts allow-forms allow-modals allow-same-origin"
              className="w-full h-full border-0"
              title={displayTitle}
            />
          </div>
        ) : (
          <pre className="text-xs font-mono text-brand-textMain bg-brand-card/80 p-3.5 rounded-lg border border-brand-border/40 overflow-x-auto max-h-80 overflow-y-auto leading-relaxed whitespace-pre select-text">
            <code>{content}</code>
          </pre>
        )}
      </div>
    </div>
  );
};

// ─── Markdown Table & Inline Formatting Helpers ──────────────────────────────
export function splitTableRow(line: string): string[] {
  let trimmed = line.trim();
  if (trimmed.startsWith('|')) {
    trimmed = trimmed.substring(1);
  }
  if (trimmed.endsWith('|')) {
    trimmed = trimmed.substring(0, trimmed.length - 1);
  }

  const cells: string[] = [];
  let current = '';
  let inCode = false;

  for (let i = 0; i < trimmed.length; i++) {
    const char = trimmed[i];
    if (char === '`') {
      inCode = !inCode;
      current += char;
    } else if (char === '\\' && i + 1 < trimmed.length && trimmed[i + 1] === '|') {
      current += '|';
      i++; // skip escaped pipe
    } else if (char === '|' && !inCode) {
      cells.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  cells.push(current.trim());
  return cells;
}

export function isDelimiterRow(line: string): boolean {
  if (!line.includes('-')) return false;
  const cells = splitTableRow(line);
  if (cells.length === 0) return false;
  return cells.every((c) => /^:?-{1,}:?$/.test(c.trim()));
}

export function getColumnAlignments(delimiterLine: string): Array<'left' | 'center' | 'right'> {
  const cells = splitTableRow(delimiterLine);
  return cells.map((cell) => {
    const trimmed = cell.trim();
    const startColon = trimmed.startsWith(':');
    const endColon = trimmed.endsWith(':');
    if (startColon && endColon) return 'center';
    if (endColon) return 'right';
    return 'left';
  });
}

export function formatTableAsMarkdown(headers: string[], rows: string[][]): string {
  const headerLine = `| ${headers.join(' | ')} |`;
  const delimiterLine = `| ${headers.map(() => '---').join(' | ')} |`;
  const rowLines = rows.map((r) => `| ${headers.map((_, i) => r[i] ?? '').join(' | ')} |`);
  return [headerLine, delimiterLine, ...rowLines].join('\n');
}

export const renderFormattedText = (text: string, baseKey: string | number): React.ReactNode => {
  const tokenRegex = /(\[[^\]]+\]\([^\s)]+\)|\*\*[^*]+\*\*|\*[^*]+\*)/g;
  const parts = text.split(tokenRegex);
  return parts.map((part, i) => {
    const key = `${baseKey}-${i}`;
    if (part.startsWith('[') && part.includes('](') && part.endsWith(')')) {
      const linkMatch = part.match(/^\[([^\]]+)\]\(([^\s)]+)\)$/);
      if (linkMatch) {
        return (
          <a
            key={key}
            href={linkMatch[2]}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[color:var(--brand-highlight)] hover:underline font-medium break-all"
          >
            {linkMatch[1]}
          </a>
        );
      }
    }
    if (part.startsWith('**') && part.endsWith('**') && part.length >= 4) {
      return (
        <strong key={key} className="font-bold text-brand-textMain">
          {part.slice(2, -2)}
        </strong>
      );
    }
    if (part.startsWith('*') && part.endsWith('*') && part.length >= 2) {
      return (
        <em key={key} className="italic text-brand-textMain/90">
          {part.slice(1, -1)}
        </em>
      );
    }
    return part;
  });
};

export const renderInline = (text: string): React.ReactNode => {
  const parts: React.ReactNode[] = [];
  let remaining = text;
  let keyIdx = 0;

  while (remaining.length > 0) {
    const codeMatch = remaining.match(/^(.*?)`([^`]+)`(.*)/s);
    if (codeMatch) {
      if (codeMatch[1]) parts.push(<span key={keyIdx++}>{renderFormattedText(codeMatch[1], keyIdx)}</span>);
      parts.push(
        <code
          key={keyIdx++}
          className="font-mono text-[12px] bg-brand-card/90 border border-brand-border/60 px-1.5 py-0.5 rounded text-brand-textMain break-all"
        >
          {codeMatch[2]}
        </code>
      );
      remaining = codeMatch[3];
      continue;
    }
    parts.push(<span key={keyIdx++}>{renderFormattedText(remaining, keyIdx)}</span>);
    break;
  }
  return parts;
};

export interface ParsedTableBlock {
  type: 'table';
  headers: string[];
  alignments: ('left' | 'center' | 'right')[];
  rows: string[][];
}

export interface ParsedLineBlock {
  type: 'line';
  line: string;
}

export type ParsedBlock = ParsedTableBlock | ParsedLineBlock;

export function parseBlocksFromLines(lines: string[]): ParsedBlock[] {
  const blocks: ParsedBlock[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    // Check if line is a table header followed by a delimiter row
    if (trimmed.includes('|') && i + 1 < lines.length) {
      const nextTrimmed = lines[i + 1].trim();
      if (isDelimiterRow(nextTrimmed)) {
        const headers = splitTableRow(trimmed);
        const alignments = getColumnAlignments(nextTrimmed);
        if (headers.length > 0 && alignments.length > 0) {
          const rows: string[][] = [];
          let j = i + 2;
          while (j < lines.length) {
            const bodyLine = lines[j].trim();
            if (bodyLine === '' || !bodyLine.includes('|')) {
              break;
            }
            rows.push(splitTableRow(bodyLine));
            j++;
          }

          blocks.push({
            type: 'table',
            headers,
            alignments,
            rows,
          });

          i = j;
          continue;
        }
      }
    }

    blocks.push({
      type: 'line',
      line,
    });
    i++;
  }

  return blocks;
}

export const MarkdownTable: React.FC<{
  headers: string[];
  alignments: ('left' | 'center' | 'right')[];
  rows: string[][];
}> = ({ headers, alignments, rows }) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    const md = formatTableAsMarkdown(headers, rows);
    const ok = await copyToClipboard(md);
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
  };

  return (
    <div className="my-3 w-full rounded-xl border border-brand-border/60 bg-brand-card/30 shadow-xs overflow-hidden select-text animate-fade-in group/table">
      {/* Top bar with count & copy button */}
      <div className="flex items-center justify-between px-3.5 py-1.5 bg-brand-card/70 border-b border-brand-border/40 select-none text-[11px] text-brand-textMuted">
        <div className="flex items-center gap-1.5">
          <span className="text-[12px] opacity-70">📋</span>
          <span className="font-medium tracking-wide">
            {rows.length} {rows.length === 1 ? 'item' : 'items'}
          </span>
        </div>
        <button
          type="button"
          onClick={handleCopy}
          className="flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-medium text-brand-textMuted hover:text-brand-textMain hover:bg-brand-hover transition-colors cursor-pointer"
          title="Copy table as Markdown"
        >
          {copied ? (
            <Check size={11} className="text-[color:var(--neon-constructive)]" />
          ) : (
            <Copy size={11} />
          )}
          <span>{copied ? 'Copied!' : 'Copy table'}</span>
        </button>
      </div>

      <div className="overflow-x-auto scrollbar-thin max-w-full">
        <table className="w-full text-left border-collapse text-[13px] font-sans whitespace-normal">
          <thead className="bg-brand-card/50 border-b border-brand-border/60 text-brand-textMain select-none">
            <tr>
              {headers.map((h, i) => {
                const align = alignments[i] || 'left';
                const alignClass =
                  align === 'center' ? 'text-center' : align === 'right' ? 'text-right' : 'text-left';
                return (
                  <th
                    key={i}
                    className={`px-3.5 py-2.5 font-semibold text-[12.5px] text-brand-textMain border-r border-brand-border/20 last:border-r-0 ${alignClass}`}
                  >
                    {renderInline(h)}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody className="divide-y divide-brand-border/25">
            {rows.map((row, rIdx) => (
              <tr
                key={rIdx}
                className="hover:bg-brand-hover/30 transition-colors even:bg-brand-card/10"
              >
                {headers.map((_, cIdx) => {
                  const cellContent = row[cIdx] ?? '';
                  const align = alignments[cIdx] || 'left';
                  const alignClass =
                    align === 'center' ? 'text-center' : align === 'right' ? 'text-right' : 'text-left';
                  return (
                    <td
                      key={cIdx}
                      className={`px-3.5 py-2.5 text-[13px] ${cIdx === 0 ? 'font-medium text-brand-textMain' : 'text-brand-textMain/90'} leading-relaxed align-top border-r border-brand-border/15 last:border-r-0 ${alignClass}`}
                    >
                      {renderInline(cellContent)}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

// ─── Markdown Renderer with Code & Artifact Block Support ──────────────────────
const MarkdownText: React.FC<{ content: string; streaming?: boolean }> = ({ content, streaming }) => {
  // Parse multi-line blocks (code blocks, artifact tags, and text)
  const renderBlocks = () => {
    const blocks: React.ReactNode[] = [];
    let remaining = content;
    let blockIdx = 0;

    // First, process any <artifact ...>...</artifact> tags
    const artifactRegex = /<artifact(?:\s+id="([^"]*)")?(?:\s+title="([^"]*)")?[^>]*>([\s\S]*?)<\/artifact>/gi;
    let match: RegExpExecArray | null;
    let lastIndex = 0;

    while ((match = artifactRegex.exec(content)) !== null) {
      const precedingText = content.slice(lastIndex, match.index);
      if (precedingText.trim()) {
        blocks.push(renderTextAndCodeFences(precedingText, blockIdx++));
      }
      const artifactId = match[1] || 'app';
      const title = match[2] || 'Interactive App';
      const innerContent = match[3].trim();
      blocks.push(
        <ErrorBoundary name="Interactive Artifact" compact key={`art-eb-${blockIdx}`}>
          <InteractiveArtifactCard
            key={`art-${blockIdx++}`}
            content={innerContent}
            language="html"
            artifactId={artifactId}
            title={title}
          />
        </ErrorBoundary>
      );
      lastIndex = match.index + match[0].length;
    }

    if (lastIndex < content.length) {
      const trailingText = content.slice(lastIndex);
      if (trailingText.trim()) {
        blocks.push(renderTextAndCodeFences(trailingText, blockIdx++));
      }
    }

    if (blocks.length === 0) {
      blocks.push(renderTextAndCodeFences(content, 0));
    }

    return blocks;
  };

  const renderTextAndCodeFences = (text: string, baseIdx: number) => {
    const elements: React.ReactNode[] = [];
    const fenceRegex = /```([a-zA-Z0-9_-]*)\n([\s\S]*?)```/g;
    let lastIdx = 0;
    let m: RegExpExecArray | null;
    let subIdx = 0;

    while ((m = fenceRegex.exec(text)) !== null) {
      const before = text.slice(lastIdx, m.index);
      if (before.trim()) {
        elements.push(renderParagraphs(before, `${baseIdx}-${subIdx++}`));
      }
      const lang = m[1] || 'text';
      const code = m[2];
      elements.push(
        <ErrorBoundary name="Code Artifact" compact key={`code-eb-${baseIdx}-${subIdx}`}>
          <InteractiveArtifactCard
            key={`code-${baseIdx}-${subIdx++}`}
            content={code}
            language={lang}
            artifactId="app"
            title={lang.toLowerCase() === 'html' ? 'Interactive App' : `${lang.toUpperCase()} Code`}
          />
        </ErrorBoundary>
      );
      lastIdx = m.index + m[0].length;
    }

    if (lastIdx < text.length) {
      const after = text.slice(lastIdx);
      if (after.trim()) {
        elements.push(renderParagraphs(after, `${baseIdx}-${subIdx++}`));
      }
    }

    if (elements.length === 0) {
      return renderParagraphs(text, `${baseIdx}-0`);
    }

    return <React.Fragment key={`frag-${baseIdx}`}>{elements}</React.Fragment>;
  };

  const renderParagraphs = (text: string, keyPrefix: string) => {
    const lines = text.split('\n');
    const blocks = parseBlocksFromLines(lines);

    return (
      <div key={`p-${keyPrefix}`} className="text-brand-textMain font-sans text-[14px] leading-[1.7] tracking-[0.01em] break-words w-full text-left">
        {blocks.map((block, idx) => {
          if (block.type === 'table') {
            return (
              <MarkdownTable
                key={`tbl-${keyPrefix}-${idx}`}
                headers={block.headers}
                alignments={block.alignments}
                rows={block.rows}
              />
            );
          }
          return renderLine(block.line, idx);
        })}
      </div>
    );
  };

  const renderLine = (line: string, idx: number) => {
    // Heading
    if (line.startsWith('### ')) {
      return (
        <h3 key={idx} className="font-bold text-brand-textMain text-[14px] mt-3 mb-1 w-full text-left break-words">
          {line.slice(4)}
        </h3>
      );
    }
    if (line.startsWith('## ')) {
      return (
        <h2 key={idx} className="font-bold text-brand-textMain text-[15px] mt-3 mb-1 w-full text-left break-words">
          {line.slice(3)}
        </h2>
      );
    }
    if (line.startsWith('# ')) {
      return (
        <h1 key={idx} className="font-bold text-brand-textMain text-[16px] mt-4 mb-1 w-full text-left break-words">
          {line.slice(2)}
        </h1>
      );
    }
    // Horizontal rule
    if (line.trim() === '---') {
      return <hr key={idx} className="border-brand-border/40 my-3 w-full" />;
    }
    // Blockquote
    if (line.startsWith('> ')) {
      return (
        <blockquote key={idx} className="border-l-2 border-brand-border-strong/80 pl-3 my-1.5 text-brand-textMuted italic text-[13px] leading-relaxed">
          {renderInline(line.slice(2))}
        </blockquote>
      );
    }
    // Numbered list
    if (/^\d+\.\s/.test(line)) {
      const match = line.match(/^(\d+)\.\s(.*)/);
      if (match) {
        return (
          <div key={idx} className="flex gap-2 my-0.5 w-full text-left items-start">
            <span className="text-brand-textMuted text-[13px] min-w-[1.5rem] shrink-0 text-left select-none">{match[1]}.</span>
            <span className="text-[13px] leading-relaxed break-words flex-1 text-left">{renderInline(match[2])}</span>
          </div>
        );
      }
    }
    // Bullet list
    if (line.startsWith('- ') || line.startsWith('* ')) {
      return (
        <div key={idx} className="flex gap-2 my-0.5 pl-1 w-full text-left items-start">
          <span className="text-brand-textMuted text-[13px] mt-1 shrink-0 select-none">•</span>
          <span className="text-[13px] leading-relaxed break-words flex-1 text-left">{renderInline(line.slice(2))}</span>
        </div>
      );
    }
    // Empty line
    if (line.trim() === '') {
      return <div key={idx} className="h-2" />;
    }
    // Normal paragraph
    return (
      <p key={idx} className="text-[13px] leading-relaxed break-words whitespace-pre-wrap w-full text-left">
        {renderInline(line)}
      </p>
    );
  };

  return (
    <div className="flex flex-col gap-1 w-full text-left overflow-hidden break-words">
      {renderBlocks()}
      {streaming && <StreamingCursor />}
    </div>
  );
};


// ─── Response history grouping ────────────────────────────────────────────────
/**
 * Splits a turn's flat agent steps into separate responses, grouped by their
 * `metadata.regenerationSeq` (consecutive runs of the same seq = one response).
 * The canvas renders only the SELECTED response and offers arrow navigation
 * between alternatives, with an x/n counter.
 */
function splitResponses(steps: TrajectoryStep[]): TrajectoryStep[][] {
  const groups: TrajectoryStep[][] = [];
  let lastSeq: number | null = null;
  for (const s of steps) {
    const seq = s.metadata?.regenerationSeq ?? 0;
    if (groups.length === 0 || seq !== lastSeq) {
      groups.push([]);
      lastSeq = seq;
    }
    groups[groups.length - 1].push(s);
  }
  return groups;
}


// ─── Turn block (user card + response history) ────────────────────────────────
interface AgentTurn {
  userSteps: TrajectoryStep[];
  agentSteps: TrajectoryStep[];
}

interface TurnBlockProps {
  turn: AgentTurn;
  turnIdx: number;
  isStreaming: boolean;
  isLastTurn: boolean;
  streamingStepId: string | null;
  onViewDiff?: (file: string, original: string, modified: string) => void;
  onActionClick?: (action: string, data: any) => void;
  onUndoStep?: (stepId: string) => void;
  onEditStep?: (stepId: string, content: string) => void;
  onRegenerate?: (turnId: string, content: string) => void;
  lastError?: string;
  onRetryLast?: () => void;
  initialExpanded?: boolean;
}

const TurnBlock: React.FC<TurnBlockProps> = ({
  turn,
  turnIdx,
  isStreaming,
  isLastTurn,
  streamingStepId,
  onViewDiff,
  onActionClick,
  onUndoStep,
  onEditStep,
  onRegenerate,
  lastError,
  onRetryLast,
  initialExpanded
}) => {
  const userContent = turn.userSteps.map((s) => s.content).filter(Boolean).join('\n');
  const responses = splitResponses(turn.agentSteps);
  const [selected, setSelected] = useState(Math.max(0, responses.length - 1));

  // Always surface the newest response (e.g. right after a regeneration).
  useEffect(() => {
    setSelected(Math.max(0, responses.length - 1));
  }, [responses.length]);

  const total = responses.length;
  const current = responses[selected] || [];

  return (
    <div className="flex flex-col gap-0 w-full group/user">
      {/* ── User Prompt Bubble (right-aligned, distinct card) ─────── */}
      <div className="flex justify-end w-full mt-1">
        <div
          data-testid={`step-user-${turn.userSteps[0]?.id || turnIdx}`}
          className="relative bg-brand-card/70 backdrop-blur-sm border border-brand-border/60 rounded-xl px-3.5 py-2 max-w-[85%] text-left text-brand-textMain text-[13px] leading-relaxed shadow-sm hover:border-brand-border-strong transition-all font-sans break-words"
        >
          {turn.userSteps.map((step, idx) => (
            <div key={step.id} className={idx > 0 ? 'mt-2.5' : ''}>
              {step.content && <div className="break-words">{TrajectoryService.normalizeContent(step.content)}</div>}

              {step.metadata?.mediaPath && step.metadata?.mediaType === 'image' && (
                <ErrorBoundary name="Image Preview" compact>
                  <LocalImagePreview filePath={step.metadata.mediaPath} />
                </ErrorBoundary>
              )}
              {step.metadata?.mediaPath && step.metadata?.mediaType !== 'image' && (
                <ErrorBoundary name="Media Document" compact>
                  <div className="mt-2.5 p-3 bg-brand-popover/80 border border-brand-border rounded-xl flex items-center justify-between gap-3 select-none text-left">
                    <div className="flex items-center gap-2">
                      <span className="text-lg">📄</span>
                      <span className="text-xs text-brand-textMain font-medium font-sans">
                        {step.metadata.mediaType!.toUpperCase()} Document
                      </span>
                    </div>
                    <button
                      onClick={() => onActionClick && onActionClick('openMedia', step.metadata)}
                      className="bg-[var(--brand-hover)] border border-brand-border hover:bg-[var(--brand-hover-strong)] text-brand-textMain px-3 py-1 rounded-lg cursor-pointer text-xs font-semibold transition-all"
                    >
                      Open
                    </button>
                  </div>
                </ErrorBoundary>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* ── User actions (under the card): Copy · Edit · Delete · Regenerate ──── */}
      <div className="self-end flex items-center gap-0.5 mt-1 mr-0.5 select-none opacity-0 group-hover/user:opacity-100 transition-opacity duration-200">
        <CopyUserButton content={userContent} />

        {onEditStep && (
          <TrajectoryIconButton
            title="Edit message"
            onClick={() => onEditStep(turn.userSteps[0].id, userContent)}
          >
            <Edit size={13} />
          </TrajectoryIconButton>
        )}

        {onRegenerate && (
          <TrajectoryIconButton
            title="Regenerate response"
            onClick={() => onRegenerate(turn.userSteps[0].id, userContent)}
          >
            <RefreshCw size={13} />
          </TrajectoryIconButton>
        )}

        {onUndoStep && (
          <TrajectoryIconButton
            title="Delete prompt and response"
            danger
            onClick={() => onUndoStep(turn.userSteps[0].id)}
          >
            <Trash2 size={13} />
          </TrajectoryIconButton>
        )}
      </div>

      {/* ── Agent Response Block (selected regeneration) ──────── */}
      {(current.length > 0 || (isLastTurn && (lastError || !isStreaming))) && (
        <div className="w-full text-left mt-2">
          <AgentResponseBlock
            steps={current}
            isLastTurn={isLastTurn}
            streamingStepId={streamingStepId}
            isStreaming={isStreaming && isLastTurn && selected === total - 1}
            onViewDiff={onViewDiff}
            onActionClick={onActionClick}
            lastError={lastError}
            onRetryLast={onRetryLast}
            onRegenerate={onRegenerate ? () => onRegenerate(turn.userSteps[0].id, userContent) : undefined}
            initialExpanded={initialExpanded}
          />
        </div>
      )}

      {/* ── Regeneration history nav (arrows + x/n) ────────────── */}
      {total > 1 && (
        <div className="self-start flex items-center gap-1.5 mt-1.5 px-1 text-brand-textMuted select-none">
          <button
            type="button"
            onClick={() => setSelected((s) => Math.max(0, s - 1))}
            disabled={selected === 0}
            title="Previous response"
            aria-label="Previous response"
            className="p-1 rounded-md border border-brand-border text-brand-textMuted hover:text-brand-textMain hover:bg-[var(--brand-hover)] disabled:opacity-30 disabled:cursor-not-allowed transition-all cursor-pointer"
          >
            <ChevronLeft size={13} />
          </button>
          <span className="text-[11px] font-mono text-brand-textMain min-w-[28px] text-center tabular-nums">
            {selected + 1}/{total}
          </span>
          <button
            type="button"
            onClick={() => setSelected((s) => Math.min(total - 1, s + 1))}
            disabled={selected === total - 1}
            title="Next response"
            aria-label="Next response"
            className="p-1 rounded-md border border-brand-border text-brand-textMuted hover:text-brand-textMain hover:bg-[var(--brand-hover)] disabled:opacity-30 disabled:cursor-not-allowed transition-all cursor-pointer"
          >
            <ChevronRight size={13} />
          </button>
        </div>
      )}
    </div>
  );
};


// ─── Main TrajectoryCanvas ────────────────────────────────────────────────────

/** Props for the TrajectoryCanvas component. */
export interface TrajectoryCanvasProps {
  steps: TrajectoryStep[];
  isStreaming?: boolean;
  onViewDiff?: (file: string, original: string, modified: string) => void;
  onActionClick?: (action: string, data: any) => void;
  onUndoStep?: (stepId: string) => void;
  /** Loads a user message back into the composer so it can be edited and re-sent. */
  onEditStep?: (stepId: string, content: string) => void;
  /** Last error recorded on the active chat, surfaced in the failed-response card. */
  lastError?: string;
  /** Re-sends the last user prompt (when the response failed). */
  onRetryLast?: () => void;
  /** Regenerates the agent's response for the current turn (turnId + prompt). */
  onRegenerate?: (turnId: string, content: string) => void;
  children?: React.ReactNode;
  initialExpanded?: boolean;
}

/** Canvas that renders the agent's execution trajectory with turn grouping. */
export const TrajectoryCanvas: React.FC<TrajectoryCanvasProps> = ({
  steps,
  isStreaming = false,
  onViewDiff,
  onActionClick,
  onUndoStep,
  onEditStep,
  lastError,
  onRetryLast,
  onRegenerate,
  children,
  initialExpanded = false
}) => {
  const bottomRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when new steps arrive or streaming
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'auto', block: 'end' });
  }, [steps.length, isStreaming]);

  // Group consecutive non-user steps into "agent turns"
  interface AgentTurn {
    userSteps: TrajectoryStep[];
    agentSteps: TrajectoryStep[];
  }

  const initialAgentSteps: TrajectoryStep[] = [];
  const turns: AgentTurn[] = [];
  let pendingAgentSteps: TrajectoryStep[] = [];
  let currentUserSteps: TrajectoryStep[] = [];

  for (const step of steps) {
    if (step.type === 'user') {
      if (currentUserSteps.length > 0 && pendingAgentSteps.length > 0) {
        turns.push({ userSteps: [...currentUserSteps], agentSteps: [...pendingAgentSteps] });
        pendingAgentSteps = [];
        currentUserSteps = [step];
      } else {
        currentUserSteps.push(step);
      }
    } else {
      if (currentUserSteps.length > 0) {
        pendingAgentSteps.push(step);
      } else {
        initialAgentSteps.push(step);
      }
    }
  }
  if (currentUserSteps.length > 0) {
    turns.push({ userSteps: [...currentUserSteps], agentSteps: [...pendingAgentSteps] });
  }

  // Last assistant step being streamed
  const lastAssistantIdx = [...steps].reverse().findIndex(s => s.type === 'assistant');
  const streamingStepId = isStreaming && lastAssistantIdx !== -1
    ? steps[steps.length - 1 - lastAssistantIdx]?.id
    : null;

  return (
    <div
      data-testid="trajectory-canvas"
      className="flex-1 overflow-y-auto px-4 sm:px-6 pt-6 pb-8 workspace-canvas scrollbar-thin relative z-10"
    >
      {/* Content column — max width matches Antigravity style */}
      <div className="max-w-[820px] w-full mx-auto flex flex-col gap-0">
        {children}

        {/* Empty state */}
        {steps.length === 0 && !children && (
          <div
            data-testid="empty-state"
            className="text-center text-brand-textMuted mt-24 text-sm select-none"
          >
            No agent execution trajectory yet. Type a prompt below to start!
          </div>
        )}

        {/* Render initial agent steps before any user prompts */}
        {initialAgentSteps.length > 0 && (
          <AgentResponseBlock
            steps={initialAgentSteps}
            isLastTurn={turns.length === 0}
            streamingStepId={streamingStepId}
            isStreaming={isStreaming && turns.length === 0}
            onViewDiff={onViewDiff}
            onActionClick={onActionClick}
            lastError={lastError}
            onRetryLast={onRetryLast}
            onRegenerate={onRegenerate ? () => onRegenerate('', '') : undefined}
            initialExpanded={initialExpanded}
          />
        )}

        {/* Render turns */}
        {turns.map((turn, turnIdx) => (
          <TurnBlock
            key={turn.userSteps[0]?.id || `turn-${turnIdx}`}
            turn={turn}
            turnIdx={turnIdx}
            isStreaming={isStreaming}
            isLastTurn={turnIdx === turns.length - 1}
            streamingStepId={streamingStepId}
            onViewDiff={onViewDiff}
            onActionClick={onActionClick}
            onUndoStep={onUndoStep}
            onEditStep={onEditStep}
            onRegenerate={onRegenerate}
            lastError={lastError}
            onRetryLast={onRetryLast}
            initialExpanded={initialExpanded}
          />
        ))}

        {/* Streaming dots when agent is thinking but no steps yet in this turn */}
        {isStreaming && turns.length > 0 && turns[turns.length - 1].agentSteps.length === 0 && (
          <div className="flex items-center gap-2 text-brand-textMuted text-[12px] px-1 py-2 mb-4 select-none">
            <span className="flex gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-brand-textMuted animate-bounce" style={{ animationDelay: '0ms' }} />
              <span className="w-1.5 h-1.5 rounded-full bg-brand-textMuted animate-bounce" style={{ animationDelay: '150ms' }} />
              <span className="w-1.5 h-1.5 rounded-full bg-brand-textMuted animate-bounce" style={{ animationDelay: '300ms' }} />
            </span>
            <span>Thinking...</span>
          </div>
        )}

        <div ref={bottomRef} />
      </div>
    </div>
  );
};


// ─── Agent Response Block ─────────────────────────────────────────────────────

interface AgentResponseBlockProps {
  steps: TrajectoryStep[];
  isLastTurn: boolean;
  streamingStepId: string | null;
  isStreaming: boolean;
  onViewDiff?: (file: string, original: string, modified: string) => void;
  onActionClick?: (action: string, data: any) => void;
  /** Last error recorded on the active chat, surfaced in the failed-response card. */
  lastError?: string;
  /** Re-sends the last user prompt (when the response failed). */
  onRetryLast?: () => void;
  /** Regenerates the agent's response for the current turn. */
  onRegenerate?: () => void;
  initialExpanded?: boolean;
}

const AgentResponseBlock: React.FC<AgentResponseBlockProps> = ({
  steps,
  isLastTurn,
  streamingStepId,
  isStreaming,
  onViewDiff,
  onActionClick,
  lastError,
  onRetryLast,
  onRegenerate,
  initialExpanded = false
}) => {
  // Categorize the steps into thinking (thoughts, tools, pre-tool explanations) and assistant steps.
  // Uses TrajectoryService.categorizeTurnSteps to ensure substantive assistant messages are never
  // swallowed into thinking when tool calls are logged late or interleaved.
  const { baseThinkingSteps, rawAssistantSteps, toolSteps } = TrajectoryService.categorizeTurnSteps(steps);

  // Extract model reasoning (<think> tags) out of assistant steps into separate thought steps
  const synthesizedThoughtSteps: TrajectoryStep[] = [];
  const assistantSteps = rawAssistantSteps.map((step) => {
    const parsed = TrajectoryService.parseThinkingContent(step.content);
    const isStreamingThis = step.id === streamingStepId;

    if (parsed.thinking) {
      synthesizedThoughtSteps.push({
        id: `thought-${step.id}`,
        type: 'thought',
        content: parsed.thinking,
        status: isStreamingThis && isStreaming && parsed.isThinkingActive ? 'running' : 'success',
        metadata: {
          ...step.metadata,
          workedDuration: step.metadata?.workedDuration || '1s',
        },
      });
    }

    return {
      ...step,
      content: parsed.mainContent,
      isThinkingActive: parsed.isThinkingActive,
    };
  });

  const thinkingSteps = [...baseThinkingSteps, ...synthesizedThoughtSteps];

  // Compute worked duration & edit stats from metadata
  const duration = thinkingSteps[0]?.metadata?.workedDuration ||
    toolSteps[0]?.metadata?.workedDuration ||
    rawAssistantSteps[0]?.metadata?.workedDuration || '0s';

  const totalFiles: number = toolSteps.reduce((acc, s) => acc + (s.metadata?.filesExplored || 0), 0);
  const totalFolders: number = toolSteps.reduce((acc, s) => acc + (s.metadata?.foldersExplored || 0), 0);

  const editedFiles = toolSteps
    .filter(s => s.metadata?.filename && (s.metadata.addedLines !== undefined || s.metadata.removedLines !== undefined))
    .map(s => ({
      name: s.metadata!.filename!,
      added: s.metadata!.addedLines || 0,
      removed: s.metadata!.removedLines || 0
    }));

  const isThoughtOnly = toolSteps.length === 0 && totalFiles === 0 && editedFiles.length === 0;
  const hasWorkDetails = thinkingSteps.length > 0 || totalFiles > 0 || editedFiles.length > 0 || isStreaming;

  // Summed file-change stats for the bottom chip
  const totalAdded = toolSteps.reduce((acc, s) => acc + (s.metadata?.addedLines || 0), 0);
  const totalRemoved = toolSteps.reduce((acc, s) => acc + (s.metadata?.removedLines || 0), 0);
  const changedFilesCount = editedFiles.length;

  return (
    <div className="mb-6 flex flex-col gap-2 group w-full text-left items-start">
      {/* Worked-for collapsible header */}
      {hasWorkDetails && (
        <WorkedHeader
          duration={duration}
          filesExplored={totalFiles > 0 ? totalFiles : undefined}
          foldersExplored={totalFolders > 0 ? totalFolders : undefined}
          editedFiles={editedFiles}
          initialExpanded={initialExpanded}
          isWorking={isStreaming}
          isThoughtOnly={isThoughtOnly}
        >
          {/* Chronological thinking/tool steps inside the collapsible */}
          {thinkingSteps.map((step, stepIdx) => (
            <ErrorBoundary name={step.toolName ? `Tool: ${step.toolName}` : 'Tool Card'} compact key={step.id || `step-${stepIdx}`}>
              <ToolCallCard
                step={step}
                isStreaming={isStreaming}
                onViewDiff={onViewDiff}
                onActionClick={onActionClick}
              />
            </ErrorBoundary>
          ))}
        </WorkedHeader>
      )}

      {/* File changed summary chip */}
      {changedFilesCount > 0 && (
        <FileChangedChip
          count={changedFilesCount}
          added={totalAdded}
          removed={totalRemoved}
          onReview={
            onViewDiff && editedFiles[0]
              ? () => {
                  const firstEdited = toolSteps.find(s => s.metadata?.filename === editedFiles[0].name);
                  if (firstEdited?.metadata?.filename) {
                    onViewDiff(
                      firstEdited.metadata.filename,
                      firstEdited.metadata.originalCode || '',
                      firstEdited.metadata.modifiedCode || ''
                    );
                  }
                }
              : undefined
          }
        />
      )}

      {/* ── Assistant text responses ──── */}
      {assistantSteps.map((step, idx) => {
        const isStreamingThis = step.id === streamingStepId;
        const isLast = idx === assistantSteps.length - 1;
        const contentStr = TrajectoryService.normalizeContent(step.content);
        const hasText = Boolean(contentStr && contentStr.trim().length > 0);

        // While actively thinking during streaming and no text has been produced yet,
        // do not render an empty assistant bubble in chat.
        if (!hasText && isStreamingThis && step.isThinkingActive) {
          return null;
        }

        return (
          <div
            key={step.id}
            data-testid={`step-assistant-${step.id}`}
            className="flex flex-col gap-1 w-full text-left"
          >
            <MarkdownText content={contentStr} streaming={isStreamingThis && isStreaming && !step.isThinkingActive} />

            {/* What's Next suggestion */}
            {isLast && !isStreaming && contentStr.toLowerCase().includes("what") && (
              <div className="mt-1">
                <p className="text-brand-textMuted text-[12px] font-semibold mt-3 mb-1">What's Next?</p>
              </div>
            )}

            {/* Attached media */}
            {step.metadata?.mediaType && (
              <ErrorBoundary name="Generated Asset" compact>
                <div className="mt-3 p-3.5 bg-brand-popover border border-brand-border rounded-xl flex items-center justify-between gap-3 select-none">
                  <span className="text-xs text-brand-textMain font-medium">
                    🎨 Generated Asset ({step.metadata.mediaType.toUpperCase()})
                  </span>
                  <button
                    onClick={() => onActionClick && onActionClick('openMedia', step.metadata)}
                    className="bg-brand-highlight hover:bg-brand-highlight-hover text-brand-highlight-text px-3 py-1.5 rounded-lg cursor-pointer text-xs font-semibold transition-all active:scale-[0.97]"
                  >
                    Open
                  </button>
                </div>
              </ErrorBoundary>
            )}

            {/* File diff viewer button */}
            {step.metadata?.filename && (
              <div className="mt-2 flex gap-2">
                <button
                  data-testid={`view-diff-btn-${step.id}`}
                  onClick={() =>
                    onViewDiff &&
                    onViewDiff(
                      step.metadata!.filename!,
                      step.metadata!.originalCode || '',
                      step.metadata!.modifiedCode || ''
                    )
                  }
                  className="flex items-center gap-1.5 text-[11px] text-brand-textMuted hover:text-[color:var(--neon-live)] transition-colors"
                >
                  <Eye size={11} />
                  <span>View diff — {step.metadata.filename}</span>
                </button>
              </div>
            )}
          </div>
        );
      })}

      {/* Surface error when a run fails (whether mid-stream with partial steps or before producing any output),
          or surface an explanatory note if the run completed with no assistant output. */}
      {(() => {
        // An agent responded if it produced text, executed tools, or reasoned in thoughts.
        // Prevents false 'No response' errors for reasoning models (e.g. DeepSeek-R1) or tool-only turns.
        const hasAssistantResponse =
          assistantSteps.some((s) => s.content && s.content.trim().length > 0) ||
          toolSteps.length > 0 ||
          thinkingSteps.length > 0;
        if (!lastError && (hasAssistantResponse || isStreaming)) return null;

        return (
          <div className="text-[color:var(--neon-destructive)] bg-[color:var(--neon-destructive)]/10 border border-[color:var(--neon-destructive)]/25 px-4 py-3 rounded-xl text-xs select-none max-w-fit flex flex-col gap-2 mt-1 animate-fade-in font-sans">
            <div className="flex items-center gap-2 font-semibold">
              <span className="w-1.5 h-1.5 rounded-full bg-[color:var(--neon-destructive)] animate-pulse" />
              <span>{lastError ? (hasAssistantResponse ? 'Run interrupted by error' : 'No response for this prompt') : 'No response for this prompt'}</span>
            </div>
            {lastError ? (
              <div className="text-[color:var(--neon-destructive)]/90 leading-relaxed">{lastError}</div>
            ) : (
              <div className="text-brand-textMuted">The agent finished without producing a reply. Check the provider connection and try again.</div>
            )}
            {onRetryLast && (
              <button
                onClick={onRetryLast}
                className="self-start flex items-center gap-1.5 mt-1 px-3 py-1.5 rounded-lg border border-[color:var(--neon-destructive)]/40 text-[color:var(--neon-destructive)] hover:bg-[color:var(--neon-destructive)]/15 transition-colors cursor-pointer text-xs font-semibold"
              >
                <RotateCcw size={12} />
                <span>Retry</span>
              </button>
            )}
          </div>
        );
      })()}

      {/* File changed summary chip (if tool edits happened) */}
      {changedFilesCount > 0 && !isStreaming && (
        <FileChangedChip
          count={changedFilesCount}
          added={totalAdded}
          removed={totalRemoved}
          onReview={
            editedFiles.length > 0 && onViewDiff
              ? () => {
                  const firstEdit = toolSteps.find(s => s.metadata?.filename);
                  if (firstEdit) {
                    onViewDiff(
                      firstEdit.metadata!.filename!,
                      firstEdit.metadata!.originalCode || '',
                      firstEdit.metadata!.modifiedCode || ''
                    );
                  }
                }
              : undefined
          }
        />
      )}

      {/* Action buttons row */}
      {assistantSteps.length > 0 && !isStreaming && (
        <div className="flex items-center gap-1 mt-1 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
          <MessageActions
            content={assistantSteps.map(s => s.content).filter(Boolean).join('\n\n')}
          />
          {onRegenerate && (
            <TrajectoryIconButton
              title="Regenerate response"
              onClick={onRegenerate}
            >
              <RefreshCw size={13} />
            </TrajectoryIconButton>
          )}
        </div>
      )}
    </div>
  );
};
