/**
 * Polymorphic Step Renderer Component (Pure TailwindCSS)
 * Renders User, Assistant, Tool Call, Tool Result, and Thought steps seamlessly.
 */

import React, { useState } from 'react';
import { ChevronRight, ChevronDown, Terminal, CheckCircle2, AlertCircle, Copy, Check, Sparkles } from 'lucide-react';
import type { TrajectoryStep } from '../core/types';
import { TrajectoryUtils } from '../services/TrajectoryUtils';

interface StepRendererProps {
  step: TrajectoryStep;
  isWorking?: boolean;
}

export const StepRenderer: React.FC<StepRendererProps> = ({ step, isWorking }) => {
  const [copied, setCopied] = useState(false);
  const [expanded, setExpanded] = useState(true);

  const handleCopy = () => {
    navigator.clipboard.writeText(step.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  if (step.type === 'user') {
    return (
      <div className="flex justify-end my-3 px-4">
        <div className="max-w-[85%] bg-blue-600/90 text-white rounded-2xl px-4 py-3 shadow-md backdrop-blur-sm border border-blue-500/30">
          <div className="text-sm whitespace-pre-wrap break-words">{step.content}</div>
          {step.timestamp && (
            <div className="text-[10px] text-blue-200/70 text-right mt-1 font-mono">{step.timestamp}</div>
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
        <div className="flex-1 bg-slate-900/60 border border-slate-800/80 rounded-2xl p-4 shadow-sm relative backdrop-blur-md">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-cyan-400 tracking-wide uppercase font-mono">Agent Assistant</span>
            <button
              onClick={handleCopy}
              className="text-slate-400 hover:text-slate-200 transition-colors p-1 rounded-md hover:bg-slate-800/60 opacity-0 group-hover:opacity-100"
              title="Copy content"
            >
              {copied ? <Check size={14} className="text-green-400" /> : <Copy size={14} />}
            </button>
          </div>
          <div className="text-sm text-slate-200 leading-relaxed whitespace-pre-wrap break-words font-sans">
            {step.content}
          </div>
          {step.metadata?.workedDuration && (
            <div className="mt-3 text-[11px] text-slate-500 font-mono border-t border-slate-800/50 pt-2 flex justify-between items-center">
              <span>Duration: {step.metadata.workedDuration as string}</span>
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
        <div className="bg-slate-950/70 border border-slate-800/70 rounded-xl overflow-hidden shadow-inner">
          <button
            onClick={() => setExpanded(!expanded)}
            className="w-full flex items-center justify-between px-3 py-2 text-xs font-mono bg-slate-900/40 hover:bg-slate-900/80 transition-colors text-slate-300 select-none"
          >
            <div className="flex items-center gap-2 truncate">
              {expanded ? <ChevronDown size={14} className="text-slate-400" /> : <ChevronRight size={14} className="text-slate-400" />}
              <Terminal size={14} className="text-cyan-400 shrink-0" />
              <span className="font-semibold text-slate-200">{step.toolName || 'tool'}</span>
              <span className="text-slate-500 truncate">{summary}</span>
            </div>
            <div className="flex items-center gap-1.5 shrink-0 ml-2">
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
            <div className="p-3 text-xs font-mono bg-slate-950 text-slate-300 overflow-x-auto whitespace-pre-wrap max-h-60 border-t border-slate-800/40">
              {TrajectoryUtils.stripAnsi(step.content)}
            </div>
          )}
        </div>
      </div>
    );
  }

  if (step.type === 'thought') {
    return (
      <div className="my-2 px-4">
        <div className="bg-slate-900/30 border border-slate-800/40 rounded-xl p-3 text-xs font-mono text-slate-400 italic">
          <div className="flex items-center gap-2 mb-1 text-slate-500 font-semibold not-italic">
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
