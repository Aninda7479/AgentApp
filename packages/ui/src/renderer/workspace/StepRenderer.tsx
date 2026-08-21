/**
 * Polymorphic Step Renderer Component (Pure TailwindCSS)
 * Clean, minimalistic Trajectory Step Renderer matching the Monolith design system.
 */

import React, { useState } from 'react';
import {
  ChevronRight,
  ChevronDown,
  Terminal,
  CheckCircle2,
  AlertCircle,
  Copy,
  Check,
  Edit3,
  RotateCcw,
  Cpu,
  FileText,
  Image as ImageIcon,
  Music,
  Video as VideoIcon,
  FileCode,
  File,
  Loader2,
} from 'lucide-react';
import type { TrajectoryStep, TrajectoryAttachment } from '../core/types';
import { TrajectoryUtils } from '../services/TrajectoryUtils';

interface StepRendererProps {
  step: TrajectoryStep;
  isWorking?: boolean;
  onUndoStep?: (stepId: string) => void;
  onEditStep?: (stepId: string, newContent: string) => void;
}

function renderAttachmentIcon(mediaType: string) {
  switch (mediaType) {
    case 'image':
      return <ImageIcon size={13} className="text-[color:var(--neon-live)] shrink-0" />;
    case 'video':
      return <VideoIcon size={13} className="text-[color:var(--brand-accent)] shrink-0" />;
    case 'audio':
      return <Music size={13} className="text-pink-400 shrink-0" />;
    case 'pdf':
    case 'ppt':
      return <FileText size={13} className="text-[color:var(--neon-attention)] shrink-0" />;
    case 'code':
      return <FileCode size={13} className="text-[color:var(--neon-constructive)] shrink-0" />;
    default:
      return <File size={13} className="text-[color:var(--brand-text-muted)] shrink-0" />;
  }
}

export const StepRenderer: React.FC<StepRendererProps> = ({ step, isWorking, onUndoStep, onEditStep }) => {
  const [copied, setCopied] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState(step.content);

  const handleCopy = () => {
    navigator.clipboard.writeText(step.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const modelName = step.model || step.metadata?.model;
  const attachments: TrajectoryAttachment[] = step.metadata?.attachments || [];

  if (step.type === 'user') {
    return (
      <div className="flex justify-end my-2 px-4 group">
        <div className="flex flex-col items-end max-w-[80%]">
          {/* Action Toolbar on Hover */}
          {!isEditing && (
            <div className="flex items-center gap-1 mb-1 opacity-0 group-hover:opacity-100 transition-opacity bg-[color:var(--brand-card)] border border-[color:var(--brand-border)] rounded-lg p-0.5 shadow-sm">
              <button
                onClick={handleCopy}
                className="text-[color:var(--brand-text-muted)] hover:text-[color:var(--brand-text-main)] transition-colors p-1 rounded hover:bg-[color:var(--brand-hover)]"
                title="Copy prompt"
              >
                {copied ? <Check size={12} className="text-[color:var(--neon-constructive)]" /> : <Copy size={12} />}
              </button>
              {onEditStep && (
                <button
                  onClick={() => setIsEditing(true)}
                  className="text-[color:var(--brand-text-muted)] hover:text-[color:var(--brand-text-main)] transition-colors p-1 rounded hover:bg-[color:var(--brand-hover)]"
                  title="Edit prompt"
                >
                  <Edit3 size={12} />
                </button>
              )}
              {onUndoStep && (
                <button
                  onClick={() => onUndoStep(step.id)}
                  className="text-[color:var(--brand-text-muted)] hover:text-[color:var(--neon-destructive)] transition-colors p-1 rounded hover:bg-[color:var(--brand-hover)]"
                  title="Rollback to just before this prompt"
                >
                  <RotateCcw size={12} />
                </button>
              )}
            </div>
          )}

          {isEditing ? (
            <div className="w-full min-w-[320px] bg-[color:var(--brand-card)] border border-[color:var(--brand-border)] rounded-xl p-3 shadow-xl">
              <textarea
                value={editContent}
                onChange={(e) => setEditContent(e.target.value)}
                className="w-full bg-[color:var(--brand-inner-bg)] border border-[color:var(--brand-border)] rounded-lg p-2 text-xs font-sans text-[color:var(--brand-text-main)] focus:outline-none focus:border-[color:var(--brand-accent)] min-h-[85px] resize-y"
              />
              <div className="flex justify-end gap-2 mt-2">
                <button
                  onClick={() => {
                    setIsEditing(false);
                    setEditContent(step.content);
                  }}
                  className="px-2.5 py-1 text-xs font-semibold rounded bg-[color:var(--brand-card)] hover:bg-[color:var(--brand-hover)] text-[color:var(--brand-text-main)] border border-[color:var(--brand-border)] transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    setIsEditing(false);
                    if (onEditStep && editContent.trim() && editContent !== step.content) {
                      onEditStep(step.id, editContent.trim());
                    }
                  }}
                  className="px-2.5 py-1 text-xs font-semibold rounded bg-[color:var(--brand-highlight)] hover:bg-[color:var(--brand-highlight-hover)] text-[color:var(--brand-highlight-text)] transition-colors"
                >
                  Save & Resend
                </button>
              </div>
            </div>
          ) : (
            <div className="bg-[color:var(--brand-card)]/80 text-[color:var(--brand-text-main)] rounded-xl px-4 py-2.5 shadow-sm backdrop-blur-sm border border-[color:var(--brand-border)]/70 w-full space-y-2 text-right">
              {/* Attachments Pills */}
              {attachments.length > 0 && (
                <div className="flex flex-wrap gap-1.5 pb-1 border-b border-[color:var(--brand-border)] justify-end">
                  {attachments.map((att, idx) => (
                    <div
                      key={idx}
                      className="flex items-center gap-1 px-2 py-0.5 bg-[color:var(--brand-inner-bg)] border border-[color:var(--brand-border)] rounded-md text-xs text-[color:var(--brand-text-main)]"
                    >
                      {renderAttachmentIcon(att.mediaType)}
                      <span className="font-mono truncate max-w-[180px]">{att.name}</span>
                    </div>
                  ))}
                </div>
              )}

              <div className="text-sm whitespace-pre-wrap break-words text-right">{step.content}</div>

              <div className="text-xs text-[color:var(--brand-text-muted)] mt-1 font-mono flex items-center justify-end gap-2 flex-wrap">
                {modelName && (
                  <span className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-[color:var(--brand-inner-bg)] text-[color:var(--brand-text-muted)] border border-[color:var(--brand-border)] text-[9px]">
                    <Cpu size={10} />
                    <span>{modelName}</span>
                  </span>
                )}
                {(step.metadata?.sandboxMode === 'sandboxed' || step.metadata?.sandboxMode === 'full') && (
                  <span className={`px-1 rounded-sm text-[8px] font-semibold uppercase tracking-wider ${
                    step.metadata.sandboxMode === 'sandboxed'
                      ? 'bg-emerald-950/60 text-emerald-400 border border-emerald-500/20'
                      : 'bg-red-950/60 text-red-400 border border-red-500/20'
                  }`}>
                    {step.metadata.sandboxMode === 'sandboxed' ? 'Sandboxed' : 'Full Access'}
                  </span>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  if (step.type === 'assistant') {
    return (
      <div className="flex flex-col gap-1 my-3 px-4 group">
        <div className="text-sm text-[color:var(--brand-text-main)] leading-relaxed whitespace-pre-wrap break-words font-sans">
          {step.content}
        </div>
        <div className="flex items-center justify-between mt-1 text-xs text-[color:var(--brand-text-muted)] font-mono">
          <div className="flex items-center gap-2">
            {step.metadata?.workedDuration && (
              <span className="italic">Thought for {step.metadata.workedDuration as string}</span>
            )}
            {modelName && (
              <span className="px-1.5 py-0.5 rounded bg-[color:var(--brand-card)] text-[color:var(--brand-text-muted)] border border-[color:var(--brand-border)] text-[9px]">
                {modelName}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <button
              onClick={handleCopy}
              className="text-[color:var(--brand-text-muted)] hover:text-[color:var(--brand-text-main)] p-1 rounded hover:bg-[color:var(--brand-hover)]"
              title="Copy content"
            >
              {copied ? <Check size={13} className="text-[color:var(--neon-constructive)]" /> : <Copy size={13} />}
            </button>
            {onUndoStep && (
              <button
                onClick={() => onUndoStep(step.id)}
                className="text-[color:var(--brand-text-muted)] hover:text-[color:var(--neon-destructive)] p-1 rounded hover:bg-[color:var(--brand-hover)]"
                title="Rollback conversation to this step"
              >
                <RotateCcw size={13} />
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (step.type === 'tool_call' || step.type === 'tool_result') {
    const summary = TrajectoryUtils.summarizeToolContent(step);
    const isError = step.status === 'error';
    const isRunning = step.status === 'running';
    const toolArgs = (step.metadata?.toolArgs as any) || {};
    const commandLine = step.metadata?.command || toolArgs?.CommandLine || toolArgs?.command;
    const cwd = step.metadata?.cwd || toolArgs?.Cwd || toolArgs?.cwd;

    return (
      <div className="my-1.5 px-4">
        <div className="bg-[color:var(--brand-card)]/40 border border-[color:var(--brand-border)]/60 rounded-lg overflow-hidden transition-colors hover:border-[color:var(--brand-border-strong)]">
          <button
            onClick={() => setExpanded(!expanded)}
            className="w-full flex items-center justify-between px-3 py-2 text-xs font-mono bg-transparent text-[color:var(--brand-text-main)] select-none"
          >
            <div className="flex items-center gap-2 truncate">
              {expanded ? <ChevronDown size={13} className="text-[color:var(--brand-text-muted)]" /> : <ChevronRight size={13} className="text-[color:var(--brand-text-muted)]" />}
              <span className="font-semibold text-[color:var(--brand-text-main)]">{step.toolName || 'tool'}</span>
              <span className="text-[color:var(--brand-text-muted)]/50">|</span>
              <span className="text-[color:var(--brand-text-muted)] truncate text-xs">{summary}</span>
            </div>
            <div className="flex items-center gap-1.5 shrink-0 ml-2">
              {isRunning ? (
                <Loader2 size={13} className="animate-spin text-[color:var(--neon-live)]" />
              ) : isError ? (
                <AlertCircle size={13} className="text-[color:var(--neon-destructive)]" />
              ) : (
                <CheckCircle2 size={13} className="text-[color:var(--neon-constructive)]" />
              )}
            </div>
          </button>
          {expanded && (
            <div className="p-3 text-xs font-mono bg-[color:var(--brand-inner-bg)]/80 text-[color:var(--brand-text-muted)] border-t border-[color:var(--brand-border)] space-y-2">
              {cwd && (
                <div className="pb-1 text-xs text-[color:var(--brand-text-muted)] flex items-center gap-1.5">
                  <span className="text-[color:var(--brand-text-muted)] font-semibold">Directory:</span>
                  <span className="text-[color:var(--brand-text-main)] font-mono">{cwd}</span>
                </div>
              )}
              {commandLine && (
                <div className="pb-1 text-xs text-[color:var(--brand-text-muted)] flex items-center gap-1.5">
                  <span className="text-[color:var(--brand-text-muted)] font-semibold">Command:</span>
                  <code className="text-[color:var(--brand-text-main)] bg-[color:var(--brand-card)] px-1.5 py-0.5 rounded font-mono">{commandLine}</code>
                </div>
              )}
              {Object.keys(toolArgs).length > 0 && !commandLine && (
                <div className="text-xs">
                  <span className="text-[color:var(--brand-text-muted)] font-semibold block mb-1">Parameters:</span>
                  <pre className="text-[color:var(--brand-text-main)] bg-[color:var(--brand-card)] p-2 rounded overflow-x-auto text-[11px]">
                    {JSON.stringify(toolArgs, null, 2)}
                  </pre>
                </div>
              )}
              {step.content && (
                <div className="overflow-x-auto whitespace-pre-wrap max-h-60 text-[11px] bg-[color:var(--brand-card)] p-2 rounded text-[color:var(--brand-text-main)]">
                  {TrajectoryUtils.stripAnsi(step.content)}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    );
  }

  if (step.type === 'thought') {
    return (
      <div className="my-1.5 px-4">
        <div className="bg-[color:var(--brand-card)]/30 border border-[color:var(--brand-border)]/40 rounded-lg p-2.5 text-xs font-mono text-[color:var(--brand-text-muted)] italic">
          <div className="flex items-center gap-2 mb-1 not-italic font-semibold text-[color:var(--brand-text-muted)]">
            <span className="w-1.5 h-1.5 rounded-full bg-[color:var(--neon-live)] animate-pulse" />
            <span>Agent Thinking...</span>
          </div>
          <div>{step.content}</div>
        </div>
      </div>
    );
  }

  return null;
};
