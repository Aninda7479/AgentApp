import React, { useState, useEffect, useRef } from 'react';
import { ChevronRight, ChevronDown, ChevronLeft, Copy, FileText, FolderOpen, Check, Eye, RotateCcw, Edit, RefreshCw, Trash2 } from 'lucide-react';
import { TrajectoryService } from '../../logic/trajectory';

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
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    TrajectoryService.readLocalImageBase64(filePath).then((base64: string | null) => {
      if (base64) setSrc(base64);
    });
  }, [filePath]);

  if (!src) {
    return (
      <div className="mt-2 w-32 h-20 bg-brand-card animate-pulse rounded-lg border border-brand-border flex items-center justify-center text-[10px] text-brand-textMuted select-none">
        Loading...
      </div>
    );
  }

  return (
    <img
      src={src}
      alt="Attached preview"
      className="mt-2 rounded-lg max-w-full max-h-[220px] object-contain border border-brand-border/60 shadow-sm"
    />
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
}

const WorkedHeader: React.FC<WorkedHeaderProps> = ({
  duration,
  filesExplored,
  foldersExplored,
  editedFiles = [],
  children,
  initialExpanded = false,
  isWorking = false
}) => {
  const [expanded, setExpanded] = useState(isWorking || initialExpanded);

  useEffect(() => {
    if (isWorking) {
      setExpanded(true);
    } else {
      setExpanded(false);
    }
  }, [isWorking]);

  return (
    <div className="flex flex-col gap-1 select-none">
      {/* "Worked for Xs >" toggle */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-1.5 text-brand-textMuted hover:text-brand-textMain text-[12px] font-medium transition-colors w-fit group"
      >
        {expanded ? (
          <ChevronDown size={13} className="text-brand-textMuted group-hover:text-brand-textMain transition-colors" />
        ) : (
          <ChevronRight size={13} className="text-brand-textMuted group-hover:text-brand-textMain transition-colors" />
        )}
        {isWorking ? (
          <span className="flex items-center gap-1.5 text-[color:var(--neon-live)] font-semibold animate-pulse font-sans">
            <span className="w-1.5 h-1.5 rounded-full bg-[color:var(--neon-live)]" />
            <span>Thinking... ({duration})</span>
          </span>
        ) : (
          <span className="font-sans">
            {expanded ? `Thought for ${duration}` : `Thought for ${duration}`}
          </span>
        )}
      </button>

      {/* Collapsible detail pills styled as a chat stream */}
      {expanded && (
        <div className="ml-2.5 pl-4 border-l border-brand-border/40 flex flex-col gap-4 animate-fade-in mt-2 w-full">
          {/* Files + Folders explored chip */}
          {(filesExplored !== undefined || foldersExplored !== undefined) && (
            <button className="flex items-center gap-1.5 text-brand-textMuted hover:text-brand-textMain text-[11px] transition-colors w-fit group">
              <FolderOpen size={11} className="text-brand-textMuted/70" />
              <span>
                Explored{' '}
                {filesExplored !== undefined && (
                  <span className="text-brand-textMain font-semibold">{filesExplored} files</span>
                )}
                {filesExplored !== undefined && foldersExplored !== undefined && ', '}
                {foldersExplored !== undefined && (
                  <span className="text-brand-textMain font-semibold">{foldersExplored} folders</span>
                )}
              </span>
              <ChevronRight size={11} className="text-brand-textMuted/60 group-hover:text-brand-textMain transition-colors" />
            </button>
          )}

          {/* Edited files */}
          {editedFiles.map((ef, i) => (
            <div key={i} className="flex items-center gap-2 text-[11px]">
              <FileText size={11} className="text-brand-textMuted/70 flex-shrink-0" />
              <span className="text-brand-textMuted font-medium">M→</span>
              <span className="text-brand-textMain font-medium font-mono">{ef.name}</span>
              {ef.added > 0 && (
                <span className="text-[color:var(--neon-constructive)] font-semibold">+{ef.added}</span>
              )}
              {ef.removed > 0 && (
                <span className="text-[color:var(--neon-destructive)] font-semibold ml-0.5">-{ef.removed}</span>
              )}
            </div>
          ))}

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

  const handleCopy = () => {
    navigator.clipboard.writeText(content).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
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

  const handleCopy = () => {
    navigator.clipboard.writeText(content).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  return (
    <div className="flex items-center gap-1 mt-3 select-none opacity-0 group-hover:opacity-100 transition-opacity duration-200">
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

// ─── Simple Markdown renderer (lightweight, no deps) ─────────────────────────
const MarkdownText: React.FC<{ content: string; streaming?: boolean }> = ({ content, streaming }) => {
  // Very lightweight inline markdown: bold, code, italic
  const renderLine = (line: string, idx: number) => {
    // Heading
    if (line.startsWith('### ')) {
      return (
        <h3 key={idx} className="font-bold text-brand-textMain text-[14px] mt-3 mb-1">
          {line.slice(4)}
        </h3>
      );
    }
    if (line.startsWith('## ')) {
      return (
        <h2 key={idx} className="font-bold text-brand-textMain text-[15px] mt-3 mb-1">
          {line.slice(3)}
        </h2>
      );
    }
    if (line.startsWith('# ')) {
      return (
        <h1 key={idx} className="font-bold text-brand-textMain text-[16px] mt-4 mb-1">
          {line.slice(2)}
        </h1>
      );
    }
    // Horizontal rule
    if (line.trim() === '---') {
      return <hr key={idx} className="border-brand-border/40 my-3" />;
    }
    // Numbered list
    if (/^\d+\.\s/.test(line)) {
      const match = line.match(/^(\d+)\.\s(.*)/);
      if (match) {
        return (
          <div key={idx} className="flex gap-2 my-0.5">
            <span className="text-brand-textMuted text-[13px] min-w-[1.5rem] text-right select-none">{match[1]}.</span>
            <span className="text-[13px] leading-relaxed">{renderInline(match[2])}</span>
          </div>
        );
      }
    }
    // Bullet list
    if (line.startsWith('- ') || line.startsWith('* ')) {
      return (
        <div key={idx} className="flex gap-2 my-0.5 pl-1">
          <span className="text-brand-textMuted text-[13px] mt-1 select-none">•</span>
          <span className="text-[13px] leading-relaxed">{renderInline(line.slice(2))}</span>
        </div>
      );
    }
    // Empty line
    if (line.trim() === '') {
      return <div key={idx} className="h-2" />;
    }
    // Normal paragraph
    return (
      <p key={idx} className="text-[13px] leading-relaxed">
        {renderInline(line)}
      </p>
    );
  };

  const renderInline = (text: string): React.ReactNode => {
    // Split on code spans, bold, italic
    const parts: React.ReactNode[] = [];
    let remaining = text;
    let keyIdx = 0;

    while (remaining.length > 0) {
      // Inline code
      const codeMatch = remaining.match(/^(.*?)`([^`]+)`(.*)/s);
      if (codeMatch) {
        if (codeMatch[1]) parts.push(<span key={keyIdx++}>{renderBoldItalic(codeMatch[1])}</span>);
        parts.push(
          <code key={keyIdx++} className="font-mono text-[12px] bg-brand-card border border-brand-border/60 px-1.5 py-0.5 rounded text-brand-textMain">
            {codeMatch[2]}
          </code>
        );
        remaining = codeMatch[3];
        continue;
      }
      parts.push(<span key={keyIdx++}>{renderBoldItalic(remaining)}</span>);
      break;
    }
    return parts;
  };

  const renderBoldItalic = (text: string): React.ReactNode => {
    // Bold: **text**
    const parts = text.split(/(\*\*[^*]+\*\*)/g);
    return parts.map((part, i) => {
      if (part.startsWith('**') && part.endsWith('**')) {
        return <strong key={i} className="font-bold text-brand-textMain">{part.slice(2, -2)}</strong>;
      }
      return part;
    });
  };

  const lines = content.split('\n');

  return (
    <div className="text-brand-textMain font-sans text-[14px] leading-[1.7] tracking-[0.01em] break-words">
      {lines.map((line, i) => renderLine(line, i))}
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
    <div className="flex flex-col gap-0 items-end">
      {/* ── User Prompt Bubble (right-aligned, slim card) ─────── */}
      <div className="flex justify-end w-full mt-1">
        <div
          data-testid={`step-user-${turn.userSteps[0]?.id || turnIdx}`}
          className="relative bg-brand-card/40 backdrop-blur-sm border border-brand-border/50 rounded-xl px-3.5 py-2 max-w-[78%] text-right text-brand-textMain text-[13px] leading-relaxed shadow-sm hover:border-brand-border-strong transition-all font-sans"
        >
          {turn.userSteps.map((step, idx) => (
            <div key={step.id} className={idx > 0 ? 'mt-2.5' : ''}>
              {step.content && <div>{step.content}</div>}

              {step.metadata?.mediaPath && step.metadata?.mediaType === 'image' && (
                <LocalImagePreview filePath={step.metadata.mediaPath} />
              )}
              {step.metadata?.mediaPath && step.metadata?.mediaType !== 'image' && (
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
              )}
            </div>
          ))}
        </div>
      </div>

      {/* ── User actions (under the card): Copy · Edit · Delete ──── */}
      <div className="self-end flex items-center gap-0.5 mt-1 mr-0.5 select-none">
        <CopyUserButton content={userContent} />

        {onEditStep && (
          <TrajectoryIconButton
            title="Edit message"
            onClick={() => onEditStep(turn.userSteps[0].id, userContent)}
          >
            <Edit size={13} />
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
        <AgentResponseBlock
          steps={current}
          isLastTurn={isLastTurn}
          streamingStepId={streamingStepId}
          isStreaming={isStreaming && selected === total - 1}
          onViewDiff={onViewDiff}
          onActionClick={onActionClick}
          lastError={lastError}
          onRetryLast={onRetryLast}
          onRegenerate={onRegenerate ? () => onRegenerate(turn.userSteps[0].id, userContent) : undefined}
          initialExpanded={initialExpanded}
        />
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
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
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
      className="flex-1 overflow-y-auto px-4 sm:px-6 pt-6 pb-8 bg-brand-bg scrollbar-thin relative z-10"
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
  // Categorize the steps:
  // Any assistant step that occurs BEFORE the last tool call/result is considered
  // an intermediate thought/explanation (i.e. "Thought Message"), which will be collapsed.
  const lastToolIdx = [...steps].reverse().findIndex(s => s.type === 'tool_call' || s.type === 'tool_result');
  const lastToolAbsoluteIdx = lastToolIdx === -1 ? -1 : steps.length - 1 - lastToolIdx;

  // Interleaved thinking steps (thoughts, tool calls, and intermediate assistant messages)
  const thinkingSteps = steps.filter((s, idx) => {
    if (s.type === 'thought') return true;
    if (s.type === 'tool_call' || s.type === 'tool_result') return true;
    if (s.type === 'assistant' && idx < lastToolAbsoluteIdx) return true;
    return false;
  });

  const toolSteps = steps.filter(s => s.type === 'tool_call' || s.type === 'tool_result');

  const assistantSteps = steps.filter((s, idx) => {
    return s.type === 'assistant' && idx >= lastToolAbsoluteIdx;
  });

  // Compute worked duration & edit stats from metadata
  const duration = thinkingSteps[0]?.metadata?.workedDuration ||
    toolSteps[0]?.metadata?.workedDuration ||
    assistantSteps[0]?.metadata?.workedDuration || '0s';

  const totalFiles: number = toolSteps.reduce((acc, s) => acc + (s.metadata?.filesExplored || 0), 0);
  const totalFolders: number = toolSteps.reduce((acc, s) => acc + (s.metadata?.foldersExplored || 0), 0);

  const editedFiles = toolSteps
    .filter(s => s.metadata?.filename && (s.metadata.addedLines !== undefined || s.metadata.removedLines !== undefined))
    .map(s => ({
      name: s.metadata!.filename!,
      added: s.metadata!.addedLines || 0,
      removed: s.metadata!.removedLines || 0
    }));

  const hasWorkDetails = thinkingSteps.length > 0 || totalFiles > 0 || editedFiles.length > 0;

  // Summed file-change stats for the bottom chip
  const totalAdded = toolSteps.reduce((acc, s) => acc + (s.metadata?.addedLines || 0), 0);
  const totalRemoved = toolSteps.reduce((acc, s) => acc + (s.metadata?.removedLines || 0), 0);
  const changedFilesCount = editedFiles.length;

  return (
    <div className="mb-6 flex flex-col gap-2 group">
      {/* Worked-for collapsible header */}
      {hasWorkDetails && (
        <WorkedHeader
          duration={duration}
          filesExplored={totalFiles > 0 ? totalFiles : undefined}
          foldersExplored={totalFolders > 0 ? totalFolders : undefined}
          editedFiles={editedFiles}
          initialExpanded={initialExpanded}
          isWorking={isStreaming}
        >
          {/* Chronological thinking/tool steps inside the collapsible, styled like a chat thread */}
          {thinkingSteps.map(step => {
            if (step.type === 'thought' || step.type === 'assistant') {
              return (
                <div
                  key={step.id}
                  className="flex flex-col gap-0.5 items-start max-w-[90%] animate-fade-in mb-1"
                >
                  <div className="bg-brand-card/20 border border-brand-border/30 rounded-lg px-3.5 py-2 text-[12px] text-brand-textMuted leading-relaxed font-sans border-l-2 border-l-brand-highlight/40">
                    <MarkdownText content={step.content} />
                  </div>
                </div>
              );
            }

            // Otherwise, it is a tool_call or tool_result
            const isSuccess = step.status === 'success';
            const isError = step.status === 'error';
            return (
              <div
                key={step.id}
                data-testid={`step-tool-${step.id}`}
                className="flex flex-col gap-1 items-start max-w-full w-full animate-fade-in mb-1 font-sans"
              >
                <div className="bg-brand-card/20 border border-brand-border/30 rounded-lg px-3 py-1.5 flex items-center justify-between gap-3 font-mono text-[10.5px] text-brand-textMuted/80 w-full hover:bg-brand-card/30 transition-colors">
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    <span
                      className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                        isSuccess ? 'bg-[color:var(--neon-constructive)]' :
                        isError ? 'bg-[color:var(--neon-destructive)]' : 'bg-[color:var(--neon-live)]'
                      }`}
                    />
                    <span className="text-brand-textMain/90 font-medium font-mono shrink-0">{step.toolName || 'tool'}</span>
                    <span className="text-brand-textMuted/40 select-none">|</span>
                    <span className="text-brand-textMuted/70 truncate font-mono select-all flex-1">
                      {TrajectoryService.summarizeToolContent(step)}
                    </span>
                  </div>
                  <span className={`text-[9px] font-semibold uppercase tracking-wider shrink-0 ${
                    isSuccess ? 'text-[color:var(--neon-constructive)]/80' :
                    isError ? 'text-[color:var(--neon-destructive)]/80' : 'text-[color:var(--neon-live)]/80'
                  }`}>
                    {step.status || 'running'}
                  </span>
                </div>
              </div>
            );
          })}
        </WorkedHeader>
      )}

      {/* ── Assistant text responses ──── */}
      {assistantSteps.map((step, idx) => {
        const isStreamingThis = step.id === streamingStepId;
        const isLast = idx === assistantSteps.length - 1;

        return (
          <div
            key={step.id}
            data-testid={`step-assistant-${step.id}`}
            className="flex flex-col gap-1"
          >
            <MarkdownText content={step.content} streaming={isStreamingThis && isStreaming} />

            {/* What's Next suggestion */}
            {isLast && !isStreaming && step.content.toLowerCase().includes("what") && (
              <div className="mt-1">
                <p className="text-brand-textMuted text-[12px] font-semibold mt-3 mb-1">What's Next?</p>
              </div>
            )}

            {/* Attached media */}
            {step.metadata?.mediaType && (
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

      {/* If the run ended (or errored) with no assistant reply, show a single
          line explaining why this prompt got no response. Surfaces on error OR
          when the run completed without output, so a terminated/failed agent
          never leaves the user staring at a blank turn. */}
      {assistantSteps.length === 0 && (lastError || !isStreaming) && (
        <div className="text-[color:var(--neon-destructive)] bg-[color:var(--neon-destructive)]/10 border border-[color:var(--neon-destructive)]/25 px-4 py-3 rounded-xl text-xs select-none max-w-fit flex flex-col gap-2 mt-1 animate-fade-in font-sans">
          <div className="flex items-center gap-2 font-semibold">
            <span className="w-1.5 h-1.5 rounded-full bg-[color:var(--neon-destructive)] animate-pulse" />
            <span>No response for this prompt</span>
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
      )}

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
        <div className="flex items-center gap-1 mt-1">
          <MessageActions
            content={assistantSteps.map(s => s.content).join('\n\n')}
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
