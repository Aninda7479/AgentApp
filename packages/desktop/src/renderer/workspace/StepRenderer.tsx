/**
 * Polymorphic Step Renderer Component (Pure TailwindCSS)
 * Renders User, Assistant, Tool Call, Tool Result, and Thought steps seamlessly.
 */

import React, { useState } from 'react';
import { ChevronRight, ChevronDown, Terminal, CheckCircle2, AlertCircle, Copy, Check, Sparkles, Edit3, RotateCcw } from 'lucide-react';
import type { TrajectoryStep } from '../core/types';
import { TrajectoryUtils } from '../services/TrajectoryUtils';

interface StepRendererProps {
  step: TrajectoryStep;
  isWorking?: boolean;
  onUndoStep?: (stepId: string) => void;
  onEditStep?: (stepId: string, newContent: string) => void;
}

export const StepRenderer: React.FC<StepRendererProps> = ({ step, isWorking, onUndoStep, onEditStep }) => {
  const [copied, setCopied] = useState(false);
  const [expanded, setExpanded] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState(step.content);

  const handleCopy = () => {
    navigator.clipboard.writeText(step.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  if (step.type === 'user') {
    return (
      <div className="flex justify-end my-3 px-4 group">
        <div className="flex flex-col items-end max-w-[85%]">
          {/* Action Toolbar on Hover */}
          {!isEditing && (
            <div className="flex items-center gap-1 mb-1 opacity-0 group-hover:opacity-100 transition-opacity bg-brand-bg/85 border border-brand-border rounded-lg p-0.5 shadow-sm">
              <button
                onClick={handleCopy}
                className="text-brand-textMuted hover:text-cyan-400 transition-colors p-1 rounded hover:bg-brand-card/60"
                title="Copy prompt"
              >
                {copied ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
              </button>
              {onEditStep && (
                <button
                  onClick={() => setIsEditing(true)}
                  className="text-brand-textMuted hover:text-cyan-400 transition-colors p-1 rounded hover:bg-brand-card/60"
                  title="Edit prompt"
                >
                  <Edit3 size={12} />
                </button>
              )}
              {onUndoStep && (
                <button
                  onClick={() => onUndoStep(step.id)}
                  className="text-brand-textMuted hover:text-red-400 transition-colors p-1 rounded hover:bg-brand-card/60"
                  title="Rollback to just before this prompt"
                >
                  <RotateCcw size={12} />
                </button>
              )}
            </div>
          )}

          {isEditing ? (
            <div className="w-full min-w-[320px] bg-slate-900 border border-brand-border rounded-xl p-3 shadow-xl">
              <textarea
                value={editContent}
                onChange={(e) => setEditContent(e.target.value)}
                className="w-full bg-slate-950 border border-brand-border rounded-lg p-2 text-xs font-sans text-brand-textMain focus:outline-none focus:border-cyan-500 min-h-[85px] resize-y"
              />
              <div className="flex justify-end gap-2 mt-2">
                <button
                  onClick={() => {
                    setIsEditing(false);
                    setEditContent(step.content);
                  }}
                  className="px-2.5 py-1 text-[11px] font-semibold rounded bg-brand-card hover:bg-brand-hover text-brand-textMain border border-brand-border transition-colors"
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
                  className="px-2.5 py-1 text-[11px] font-semibold rounded bg-cyan-600 hover:bg-cyan-500 text-white transition-colors"
                >
                  Save & Resend
                </button>
              </div>
            </div>
          ) : (
            <div className="bg-blue-600/90 text-white rounded-2xl px-4 py-3 shadow-md backdrop-blur-sm border border-blue-500/30 w-full">
              <div className="text-sm whitespace-pre-wrap break-words">{step.content}</div>
              <div className="text-[10px] text-blue-200/70 text-right mt-1 font-mono flex items-center justify-end gap-2">
                {(step.metadata?.sandboxMode === 'sandboxed' || step.metadata?.sandboxMode === 'full') && (
                  <span className={`px-1 rounded-sm text-[8px] font-semibold uppercase tracking-wider ${
                    step.metadata.sandboxMode === 'sandboxed'
                      ? 'bg-emerald-950/60 text-emerald-400 border border-emerald-500/20'
                      : 'bg-red-950/60 text-red-400 border border-red-500/20'
                  }`}>
                    {step.metadata.sandboxMode === 'sandboxed' ? 'Sandboxed' : 'Full Access'}
                  </span>
                )}
                {step.timestamp && <span>{step.timestamp}</span>}
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  if (step.type === 'assistant') {
    return (
      <div className="flex gap-3 my-4 px-4 group">
        <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-cyan-500 to-blue-600 flex items-center justify-center text-white shrink-0 shadow-lg shadow-cyan-500/20">
          <Sparkles size={16} />
        </div>
        <div className="flex-1 bg-brand-card/60 border border-brand-border rounded-2xl p-4 shadow-sm relative backdrop-blur-md">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-cyan-400 tracking-wide uppercase font-mono">Agent Assistant</span>
            <div className="flex items-center gap-1">
              <button
                onClick={handleCopy}
                className="text-brand-textMuted hover:text-brand-textMain transition-colors p-1 rounded-md hover:bg-brand-hover opacity-0 group-hover:opacity-100 animate-fade-in"
                title="Copy content"
              >
                {copied ? <Check size={14} className="text-green-400" /> : <Copy size={14} />}
              </button>
              {onUndoStep && (
                <button
                  onClick={() => onUndoStep(step.id)}
                  className="text-brand-textMuted hover:text-red-400 transition-colors p-1 rounded-md hover:bg-brand-hover opacity-0 group-hover:opacity-100 animate-fade-in"
                  title="Rollback conversation to this step"
                >
                  <RotateCcw size={14} />
                </button>
              )}
            </div>
          </div>
          <div className="text-sm text-brand-textMain leading-relaxed whitespace-pre-wrap break-words font-sans">
            {step.content}
          </div>
          {(step.metadata?.workedDuration || step.metadata?.sandboxMode || step.timestamp) && (
            <div className="mt-3 text-[11px] text-brand-textMuted font-mono border-t border-brand-border pt-2 flex justify-between items-center">
              <div className="flex items-center gap-2">
                {step.metadata?.workedDuration && <span>Duration: {step.metadata.workedDuration as string}</span>}
                {(step.metadata?.sandboxMode === 'sandboxed' || step.metadata?.sandboxMode === 'full') && (
                  <span className={`px-1.5 py-0.5 rounded-md border text-[9px] font-semibold ${
                    step.metadata.sandboxMode === 'sandboxed'
                      ? 'bg-emerald-950/30 text-emerald-400 border-emerald-500/20'
                      : 'bg-red-950/30 text-red-400 border-red-500/20'
                  }`}>
                    {step.metadata.sandboxMode === 'sandboxed' ? 'Sandboxed' : 'Full Access'}
                  </span>
                )}
              </div>
              {step.timestamp && <span>{step.timestamp}</span>}
            </div>
          )}
        </div>
      </div>
    );
  }

  if (step.type === 'tool_call' || step.type === 'tool_result') {
    const summary = TrajectoryUtils.summarizeToolContent(step);
    const isError = step.status === 'error';

    return (
      <div className="my-2 px-4">
        <div className="bg-brand-bg/60 border border-brand-border rounded-xl overflow-hidden shadow-inner">
          <button
            onClick={() => setExpanded(!expanded)}
            className="w-full flex items-center justify-between px-3 py-2 text-xs font-mono bg-brand-card/40 hover:bg-brand-card/80 transition-colors text-brand-textMain select-none"
          >
            <div className="flex items-center gap-2 truncate">
              {expanded ? <ChevronDown size={14} className="text-brand-textMuted" /> : <ChevronRight size={14} className="text-brand-textMuted" />}
              <Terminal size={14} className="text-cyan-400 shrink-0" />
              <span className="font-semibold text-brand-textMain">{step.toolName || 'tool'}</span>
              <span className="text-brand-textMuted truncate">{summary}</span>
            </div>
            <div className="flex items-center gap-1.5 shrink-0 ml-2">
              {(step.metadata?.sandboxMode === 'sandboxed' || step.metadata?.sandboxMode === 'full') && (
                <span className={`px-1.5 py-0.5 rounded text-[9px] font-semibold ${
                  step.metadata.sandboxMode === 'sandboxed'
                    ? 'bg-emerald-950/40 text-emerald-400 border border-emerald-500/20'
                    : 'bg-red-950/40 text-red-400 border border-red-500/20'
                }`}>
                  {step.metadata.sandboxMode === 'sandboxed' ? 'Sandboxed' : 'Full Access'}
                </span>
              )}
              {step.status === 'running' ? (
                <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
              ) : isError ? (
                <AlertCircle size={14} className="text-red-400" />
              ) : (
                <CheckCircle2 size={14} className="text-emerald-400" />
              )}
            </div>
          </button>
          {expanded && (
            <div className="p-3 text-xs font-mono bg-brand-bg/85 text-brand-textMuted border-t border-brand-border">
              {(() => {
                const toolArgs = step.metadata?.toolArgs as any;
                const commandLine = toolArgs?.CommandLine || toolArgs?.command;
                const cwd = toolArgs?.Cwd || toolArgs?.cwd;
                return (
                  <>
                    {cwd && (
                      <div className="mb-2 pb-2 border-b border-brand-border/40 text-[11px] text-brand-textMuted flex items-center gap-1.5">
                        <span className="text-cyan-400/80">Directory:</span>
                        <span className="text-brand-textMain font-semibold select-all">{cwd}</span>
                      </div>
                    )}
                    {commandLine && (
                      <div className="mb-2 pb-2 border-b border-brand-border/40 text-[11px] text-brand-textMuted flex items-center gap-1.5">
                        <span className="text-cyan-400/80">Command:</span>
                        <code className="text-brand-textMain bg-brand-card/60 px-1 py-0.5 rounded select-all font-semibold">{commandLine}</code>
                      </div>
                    )}
                    <div className="overflow-x-auto whitespace-pre-wrap max-h-60 mt-2">
                      {TrajectoryUtils.stripAnsi(step.content)}
                    </div>
                  </>
                );
              })()}
            </div>
          )}
        </div>
      </div>
    );
  }

  if (step.type === 'thought') {
    return (
      <div className="my-2 px-4">
        <div className="bg-brand-card/30 border border-brand-border rounded-xl p-3 text-xs font-mono text-brand-textMuted italic">
          <div className="flex items-center gap-2 mb-1 text-brand-textMuted font-semibold not-italic">
            <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-ping" />
            <span>Agent Thinking...</span>
          </div>
          <div>{step.content}</div>
        </div>
      </div>
    );
  }

  return null;
};
