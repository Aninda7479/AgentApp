import React, { useState, useEffect, useRef } from 'react';
import { ChevronRight, ChevronDown, Copy, ThumbsUp, ThumbsDown, FileText, FolderOpen, Check, Eye, RotateCcw } from 'lucide-react';

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

function stripAnsi(value: string): string {
  return value.replace(/\u001b\[[0-9;]*m/g, '');
}

function truncatePreview(value: string, maxLength: number = 88): string {
  const normalized = value.replace(/\s+/g, ' ').trim();
  if (!normalized) return '';
  return normalized.length > maxLength
    ? `${normalized.slice(0, maxLength - 3)}...`
    : normalized;
}

function summarizeToolContent(step: TrajectoryStep): string {
  const toolName = step.toolName || 'tool';
  const rawContent = stripAnsi(step.content || '');
  const trimmed = rawContent.trim();

  if (!trimmed) {
    return toolName;
  }

  if (toolName === 'read_file') {
    if (/%PDF-\d\.\d/i.test(trimmed) || /�{2,}/.test(trimmed)) {
      return 'Opened a binary document preview';
    }

    const firstLine = truncatePreview(trimmed.split('\n')[0] || trimmed);
    return firstLine || 'Read file contents';
  }

  if (toolName === 'run_command') {
    const lines = trimmed.split('\n').map(line => line.trim()).filter(Boolean);
    const firstLine = lines[0] || '';
    const commandFailureMatch = firstLine.match(/^Error:\s*Command failed:\s*(.+)$/i);
    if (commandFailureMatch) {
      return `Command failed: ${truncatePreview(commandFailureMatch[1])}`;
    }

    if (/^Error:/i.test(firstLine)) {
      return truncatePreview(firstLine);
    }

    return truncatePreview(firstLine) || 'Executed command';
  }

  return truncatePreview(trimmed);
}

// ─── Local Image Preview ──────────────────────────────────────────────────────
const LocalImagePreview: React.FC<{ filePath: string }> = ({ filePath }) => {
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    const ipc = typeof window !== 'undefined' && (window as any).require
      ? (window as any).require('electron').ipcRenderer
      : null;
    if (ipc) {
      ipc.invoke('read-file-base64', filePath).then((base64: string | null) => {
        if (base64) setSrc(base64);
      });
    }
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
}

const WorkedHeader: React.FC<WorkedHeaderProps> = ({
  duration,
  filesExplored,
  foldersExplored,
  editedFiles = [],
  children,
  initialExpanded = false
}) => {
  const [expanded, setExpanded] = useState(initialExpanded);

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
        <span>Worked for {duration}</span>
      </button>

      {/* Collapsible detail pills */}
      {expanded && (
        <div className="ml-5 flex flex-col gap-1.5 animate-fade-in">
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
              <span className="text-violet-400 font-medium">M→</span>
              <span className="text-brand-textMain font-medium font-mono">{ef.name}</span>
              {ef.added > 0 && (
                <span className="text-emerald-500 font-semibold">+{ef.added}</span>
              )}
              {ef.removed > 0 && (
                <span className="text-red-500 font-semibold ml-0.5">-{ef.removed}</span>
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
      {added > 0 && <span className="text-emerald-500 font-semibold">+{added}</span>}
      {removed > 0 && <span className="text-red-500 font-semibold">-{removed}</span>}
      <ChevronRight size={11} className="text-brand-textMuted/60 group-hover:text-brand-textMain transition-colors" />
    </button>

    {onReview && (
      <button
        onClick={onReview}
        className="flex items-center gap-1.5 text-[11px] text-brand-textMuted hover:text-brand-textMain border border-brand-border hover:border-violet-500/40 px-2.5 py-1 rounded-md transition-all select-none"
      >
        <Eye size={11} />
        <span>Review</span>
      </button>
    )}
  </div>
);

const PromptCopyButton: React.FC<{ content: string }> = ({ content }) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(content).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  return (
    <button
      onClick={handleCopy}
      title="Copy prompt"
      className="flex items-center gap-1 px-2 py-1 rounded-md text-brand-textMuted hover:text-brand-textMain hover:bg-white/5 transition-all cursor-pointer text-[10px]"
    >
      {copied ? <Check size={11} className="text-emerald-400" /> : <Copy size={11} />}
      <span>{copied ? 'Copied' : 'Copy'}</span>
    </button>
  );
};

// ─── Action buttons (copy, thumbs) ────────────────────────────────────────────
interface MessageActionsProps {
  content: string;
  onThumbsUp?: () => void;
  onThumbsDown?: () => void;
}

const MessageActions: React.FC<MessageActionsProps> = ({ content, onThumbsUp, onThumbsDown }) => {
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
        className="p-1.5 rounded-md text-brand-textMuted hover:text-brand-textMain hover:bg-white/5 transition-all cursor-pointer"
      >
        {copied ? <Check size={13} className="text-emerald-400" /> : <Copy size={13} />}
      </button>
      <button
        onClick={onThumbsUp}
        title="Good response"
        className="p-1.5 rounded-md text-brand-textMuted hover:text-emerald-400 hover:bg-emerald-500/5 transition-all cursor-pointer"
      >
        <ThumbsUp size={13} />
      </button>
      <button
        onClick={onThumbsDown}
        title="Bad response"
        className="p-1.5 rounded-md text-brand-textMuted hover:text-red-400 hover:bg-red-500/5 transition-all cursor-pointer"
      >
        <ThumbsDown size={13} />
      </button>
    </div>
  );
};

// ─── Streaming Cursor ─────────────────────────────────────────────────────────
const StreamingCursor: React.FC = () => (
  <span
    className="inline-block w-[2px] h-[1.1em] bg-violet-400 ml-0.5 align-middle animate-[blink_1s_step-end_infinite] rounded-sm"
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
          <code key={keyIdx++} className="font-mono text-[12px] bg-brand-card border border-brand-border/60 px-1.5 py-0.5 rounded text-amber-300">
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
    <div className="text-brand-textMain font-sans leading-relaxed break-words">
      {lines.map((line, i) => renderLine(line, i))}
      {streaming && <StreamingCursor />}
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
      className="flex-1 overflow-y-auto px-4 sm:px-6 py-6 bg-brand-bg scrollbar-thin relative z-10"
    >
      {/* Content column — max width matches Antigravity style */}
      <div className="max-w-[760px] w-full mx-auto flex flex-col gap-0">
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
            initialExpanded={initialExpanded}
          />
        )}

        {/* Render turns */}
        {turns.map((turn, turnIdx) => (
          <div key={turn.userSteps[0]?.id || `turn-${turnIdx}`} className="flex flex-col gap-0">
            {/* ── User Prompt Bubble ─────────────────────────────────── */}
            <div className="flex justify-center mb-6 mt-2">
              <div
                data-testid={`step-user-${turn.userSteps[0]?.id || turnIdx}`}
                className="relative group bg-brand-card border border-brand-border/80 rounded-2xl px-5 py-3 max-w-[88%] text-brand-textMain text-[13px] leading-relaxed shadow-sm hover:border-violet-500/25 transition-all"
              >
                {turn.userSteps.map((step, idx) => (
                  <div key={step.id} className={idx > 0 ? 'mt-2.5' : ''}>
                    {step.content && (
                      <div>{step.content}</div>
                    )}

                    {step.metadata?.mediaPath && step.metadata?.mediaType === 'image' && (
                      <LocalImagePreview filePath={step.metadata.mediaPath} />
                    )}
                    {step.metadata?.mediaPath && step.metadata?.mediaType !== 'image' && (
                      <div className="mt-2.5 p-3 bg-brand-popover/80 border border-brand-border rounded-xl flex items-center justify-between gap-3 select-none">
                        <div className="flex items-center gap-2">
                          <span className="text-lg">📄</span>
                          <span className="text-xs text-brand-textMain font-medium font-sans">
                            {step.metadata.mediaType!.toUpperCase()} Document
                          </span>
                        </div>
                        <button
                          onClick={() => onActionClick && onActionClick('openMedia', step.metadata)}
                          className="bg-white/5 border border-brand-border hover:bg-white/10 text-brand-textMain px-3 py-1 rounded-lg cursor-pointer text-xs font-semibold transition-all"
                        >
                          Open
                        </button>
                      </div>
                    )}
                  </div>
                ))}

                {/* User actions on hover (Copy and Undo) */}
                <div className="flex items-center gap-1 mt-2.5 pt-2 border-t border-brand-border/30 opacity-0 group-hover:opacity-100 transition-opacity duration-200 select-none">
                  {/* Copy Button */}
                  <PromptCopyButton content={turn.userSteps.map(step => step.content).filter(Boolean).join('\n')} />

                  {/* Undo Button */}
                  {onUndoStep && (
                    <button
                      onClick={() => onUndoStep(turn.userSteps[0].id)}
                      title="Undo this prompt and response"
                      className="flex items-center gap-1 px-2 py-1 rounded-md text-brand-textMuted hover:text-red-400 hover:bg-red-500/5 transition-all cursor-pointer text-[10px]"
                    >
                      <RotateCcw size={11} />
                      <span>Undo</span>
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* ── Agent Response Block ───────────────────────────────── */}
            {turn.agentSteps.length > 0 && (
              <AgentResponseBlock
                steps={turn.agentSteps}
                isLastTurn={turnIdx === turns.length - 1}
                streamingStepId={streamingStepId}
                isStreaming={isStreaming && turnIdx === turns.length - 1}
                onViewDiff={onViewDiff}
                onActionClick={onActionClick}
                initialExpanded={initialExpanded}
              />
            )}
          </div>
        ))}

        {/* Streaming dots when agent is thinking but no steps yet in this turn */}
        {isStreaming && turns.length > 0 && turns[turns.length - 1].agentSteps.length === 0 && (
          <div className="flex items-center gap-2 text-brand-textMuted text-[12px] px-1 py-2 mb-4 select-none">
            <span className="flex gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-bounce" style={{ animationDelay: '0ms' }} />
              <span className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-bounce" style={{ animationDelay: '150ms' }} />
              <span className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-bounce" style={{ animationDelay: '300ms' }} />
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
  initialExpanded?: boolean;
}

const AgentResponseBlock: React.FC<AgentResponseBlockProps> = ({
  steps,
  isLastTurn,
  streamingStepId,
  isStreaming,
  onViewDiff,
  onActionClick,
  initialExpanded = false
}) => {
  // Categorize the steps
  const thoughtSteps = steps.filter(s => s.type === 'thought');
  const toolSteps = steps.filter(s => s.type === 'tool_call' || s.type === 'tool_result');
  const assistantSteps = steps.filter(s => s.type === 'assistant');

  // Compute worked duration & edit stats from metadata
  const duration = thoughtSteps[0]?.metadata?.workedDuration ||
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

  const hasWorkDetails = thoughtSteps.length > 0 || toolSteps.length > 0 ||
    totalFiles > 0 || editedFiles.length > 0;

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
        >
          {/* Thought steps inside the collapsible */}
          {thoughtSteps.map(step => (
            <div
              key={step.id}
              className="flex items-start gap-2 text-[11px] text-brand-textMuted/80 italic"
            >
              <span className="text-violet-400/70 mt-0.5 select-none">◈</span>
              <span>{step.content}</span>
            </div>
          ))}

          {/* Tool call details */}
          {toolSteps.map(step => (
            <div
              key={step.id}
              data-testid={`step-tool-${step.id}`}
              className="flex items-center gap-2 text-[11px] text-brand-textMuted"
            >
              <span
                className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                  step.status === 'success' ? 'bg-emerald-500' :
                  step.status === 'error' ? 'bg-red-500' : 'bg-sky-400'
                }`}
              />
              <span className="text-brand-textMuted/80 font-mono flex-shrink-0">{step.toolName || 'tool'}</span>
              <span className="text-brand-textMuted/60 truncate flex-1 min-w-0 max-w-[60vw] sm:max-w-[320px]">{summarizeToolContent(step)}</span>
            </div>
          ))}
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
                  className="bg-violet-600 hover:bg-violet-500 text-white px-3 py-1.5 rounded-lg cursor-pointer text-xs font-semibold transition-all active:scale-[0.97]"
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
                  className="flex items-center gap-1.5 text-[11px] text-brand-textMuted hover:text-sky-400 transition-colors"
                >
                  <Eye size={11} />
                  <span>View diff — {step.metadata.filename}</span>
                </button>
              </div>
            )}
          </div>
        );
      })}

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
        <MessageActions
          content={assistantSteps.map(s => s.content).join('\n\n')}
        />
      )}
    </div>
  );
};
