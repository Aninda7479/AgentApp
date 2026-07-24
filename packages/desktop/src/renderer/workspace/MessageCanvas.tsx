/**
 * Message Canvas Component (Pure TailwindCSS)
 * Displays steps, streaming output, context gauge, and agent controls for a specific chat panel.
 */

import React, { useRef, useEffect } from 'react';
import { Bot, Square, Loader2, RefreshCw, AlertTriangle, ChevronRight } from 'lucide-react';
import { useTrajectory } from '../hooks/useTrajectory';
import { useAgent } from '../hooks/useAgent';
import { StepRenderer } from './StepRenderer';
import { useChatStore } from '../stores/chatStore';

interface MessageCanvasProps {
  chatId: string;
  onClosePanel?: () => void;
}

export const MessageCanvas: React.FC<MessageCanvasProps> = ({ chatId, onClosePanel }) => {
  const steps = useTrajectory(chatId);
  const { isRunning, lastError, contextUsage, stopRun } = useAgent(chatId);
  const chat = useChatStore((s) => s.chats.find((c) => c.id === chatId));
  const activeProject = useChatStore((s) => s.activeProject);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [steps.length, isRunning]);

  return (
    <div className="flex flex-col h-full bg-slate-950/40 border border-slate-800/60 rounded-2xl overflow-hidden shadow-2xl backdrop-blur-xl">
      {/* Panel Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-slate-900/60 border-b border-slate-800/60 select-none">
        <div className="flex items-center gap-1.5 min-w-0 text-slate-400 text-xs">
          <div className="w-2.5 h-2.5 rounded-full bg-cyan-400 shadow-sm shadow-cyan-500/50 shrink-0 mr-1" />
          <span className="hover:text-slate-200 transition-colors">Workspace</span>
          <ChevronRight size={12} className="shrink-0 text-slate-500" />
          <span className="font-medium text-slate-300 truncate max-w-[150px]">{activeProject || 'No Project'}</span>
          <ChevronRight size={12} className="shrink-0 text-slate-500" />
          <span className="font-semibold text-sm text-slate-100 truncate">
            {chat?.title || 'Active Session'}
          </span>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          {contextUsage && (
            <div className="flex items-center gap-1.5 text-xs text-slate-400 font-mono bg-slate-900/80 px-2.5 py-1 rounded-lg border border-slate-800">
              <span>Ctx:</span>
              <span className={contextUsage.pct > 80 ? 'text-amber-400 font-bold' : 'text-cyan-400'}>
                {contextUsage.pct}%
              </span>
            </div>
          )}

          {isRunning && (
            <button
              onClick={stopRun}
              className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/30 transition-colors"
            >
              <Square size={12} className="fill-current" />
              <span>Stop Run</span>
            </button>
          )}

          {onClosePanel && (
            <button
              onClick={onClosePanel}
              className="text-slate-400 hover:text-slate-200 transition-colors p-1 rounded-lg hover:bg-slate-800"
              title="Close Panel"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {/* Messages Scroll Area */}
      <div className="flex-1 overflow-y-auto p-2 space-y-1 scrollbar-thin scrollbar-thumb-slate-800">
        {steps.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center p-8 select-none">
            <div className="w-14 h-14 rounded-2xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-400 mb-4 shadow-lg shadow-cyan-500/10">
              <Bot size={28} />
            </div>
            <h3 className="text-base font-semibold text-slate-200 mb-1">SuperAgent Session Ready</h3>
            <p className="text-xs text-slate-400 max-w-sm">
              Type your task prompt below. SuperAgent will autonomously edit files, run terminal commands, and inspect results.
            </p>
          </div>
        ) : (
          steps.map((step) => <StepRenderer key={step.id} step={step} isWorking={isRunning} />)
        )}

        {isRunning && (
          <div className="flex items-center gap-2.5 px-4 py-2 text-xs font-mono text-cyan-400 animate-pulse">
            <Loader2 size={14} className="animate-spin" />
            <span>Agent executing turn...</span>
          </div>
        )}

        {lastError && (
          <div className="mx-4 my-2 p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-xs text-red-300 flex items-center gap-2">
            <AlertTriangle size={16} className="shrink-0 text-red-400" />
            <span className="break-words">{lastError}</span>
          </div>
        )}

        <div ref={bottomRef} />
      </div>
    </div>
  );
};
