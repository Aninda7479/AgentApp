/**
 * PeekingTaskDeck — Floating overlay card anchored above the ComposerBar.
 * Displays currently running background tasks, shell commands, Telegram uploads,
 * active agent timers/sleeps, and queued prompts.
 *
 * Automatically hides completely when no tasks or queues are active.
 */

import React, { useState, useEffect } from 'react';
import {
  Terminal,
  Clock,
  X,
  Loader2,
  ChevronDown,
  ChevronUp,
  Trash2,
  Layers,
} from 'lucide-react';
import { sessionStore, useSessionStore } from '../../stores/sessionStore';
import { useChatStore } from '../../stores/chatStore';

interface PeekingTaskDeckProps {
  chatId?: string;
}

export const PeekingTaskDeck: React.FC<PeekingTaskDeckProps> = ({ chatId: propChatId }) => {
  const activeChatId = useChatStore((s) => propChatId || s.activeChatId);
  const [now, setNow] = useState(Date.now());
  const [isExpanded, setIsExpanded] = useState(true);

  // Subscribe to sessionStore changes
  const sessionState = useSessionStore((s) => {
    if (!activeChatId) return null;
    const session = s.runningSessions.get(activeChatId);
    const queue = s.queues.get(activeChatId) || [];
    return {
      activeTask: session?.activeTask || null,
      isGenerating: session?.isGenerating || false,
      startedAt: session?.startedAt,
      queue,
    };
  });

  // Tick every 1 second while there is an active task or timer to update elapsed/remaining time
  const hasActiveTask = Boolean(sessionState?.activeTask);
  const hasQueue = (sessionState?.queue.length || 0) > 0;

  useEffect(() => {
    if (!hasActiveTask && !hasQueue) return;
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [hasActiveTask, hasQueue]);

  // "When those things are done, don't show anything else"
  if (!activeChatId || !sessionState || (!hasActiveTask && !hasQueue)) {
    return null;
  }

  const { activeTask, queue } = sessionState;

  const handleCancelQueue = () => {
    sessionStore.clearQueue(activeChatId);
  };

  const handleRemoveQueuedItem = (index: number) => {
    sessionStore.removeQueuedItem(activeChatId, index);
  };

  // Compute elapsed time
  const elapsedSecs = activeTask?.startedAt
    ? Math.max(0, Math.floor((now - activeTask.startedAt) / 1000))
    : 0;

  // Compute timer countdown
  const timerTotal = activeTask?.totalSeconds || 0;
  const timerRemaining = Math.max(0, timerTotal - elapsedSecs);
  const timerPct = timerTotal > 0 ? Math.min(100, Math.max(0, ((timerTotal - timerRemaining) / timerTotal) * 100)) : 0;

  return (
    <div
      data-testid="peeking-task-deck"
      className="w-full mb-2 animate-in slide-in-from-bottom-2 fade-in duration-200"
    >
      <div className="bg-slate-900/95 border border-slate-700/80 rounded-2xl shadow-2xl backdrop-blur-xl overflow-hidden transition-all duration-200">
        {/* Header Bar */}
        <div className="flex items-center justify-between px-3.5 py-2 bg-slate-950/60 border-b border-slate-800/80 select-none">
          <div className="flex items-center gap-2 min-w-0">
            {/* Live activity pulsing dot */}
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-cyan-500" />
            </span>

            <span className="text-xs font-semibold text-slate-200 flex items-center gap-1.5">
              <Layers size={13} className="text-cyan-400" />
              <span>Active Processing Deck</span>
            </span>

            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded-full bg-cyan-950 text-cyan-300 border border-cyan-800/50">
              {hasActiveTask && hasQueue
                ? `1 running · ${queue.length} queued`
                : hasActiveTask
                ? '1 task running'
                : `${queue.length} prompt${queue.length > 1 ? 's' : ''} queued`}
            </span>
          </div>

          <div className="flex items-center gap-1">
            {hasQueue && (
              <button
                type="button"
                onClick={handleCancelQueue}
                title="Cancel all queued prompts"
                className="flex items-center gap-1 px-2 py-0.5 rounded-lg text-[11px] font-medium text-red-400 hover:text-red-300 hover:bg-red-500/10 border border-red-500/20 transition-colors cursor-pointer mr-1"
              >
                <Trash2 size={11} />
                <span>Cancel Queue</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => setIsExpanded(!isExpanded)}
              aria-label={isExpanded ? 'Collapse task details' : 'Expand task details'}
              className="p-1 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors cursor-pointer"
            >
              {isExpanded ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
            </button>
          </div>
        </div>

        {/* Expandable Deck Content */}
        {isExpanded && (
          <div className="p-2.5 flex flex-col gap-2">
            {/* Active Task Row */}
            {activeTask && (
              <div className="flex flex-col gap-1.5 p-2 rounded-xl bg-slate-950/80 border border-slate-800/80">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    {activeTask.type === 'timer' ? (
                      <Clock size={14} className="text-amber-400 animate-pulse shrink-0" />
                    ) : activeTask.type === 'command' ? (
                      <Terminal size={14} className="text-emerald-400 shrink-0" />
                    ) : (
                      <Loader2 size={14} className="text-cyan-400 animate-spin shrink-0" />
                    )}

                    <span className="text-xs font-semibold text-slate-100 truncate">
                      {activeTask.type === 'timer'
                        ? 'Agent Sleep Timer'
                        : activeTask.name === 'run_command'
                        ? 'Shell Command Executing'
                        : activeTask.name === 'telegram'
                        ? 'Telegram Media Delivery'
                        : `Running: ${activeTask.name}`}
                    </span>
                  </div>

                  <span className="text-[11px] font-mono text-slate-400 shrink-0">
                    {activeTask.type === 'timer' ? (
                      <span className="text-amber-300 font-bold">{timerRemaining}s left</span>
                    ) : (
                      <span>{elapsedSecs}s elapsed</span>
                    )}
                  </span>
                </div>

                {/* Task Details / Snippet */}
                {activeTask.detail && (
                  <div className="text-[11px] font-mono text-slate-300 bg-slate-900/90 px-2 py-1 rounded-lg border border-slate-800 truncate max-w-full">
                    {activeTask.type === 'command' ? `$ ${activeTask.detail}` : activeTask.detail}
                  </div>
                )}

                {/* Progress bar for timer */}
                {activeTask.type === 'timer' && timerTotal > 0 && (
                  <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden mt-0.5">
                    <div
                      className="bg-gradient-to-r from-amber-500 to-amber-300 h-full transition-all duration-1000 ease-linear rounded-full"
                      style={{ width: `${timerPct}%` }}
                    />
                  </div>
                )}
              </div>
            )}

            {/* Queued Prompts Section */}
            {hasQueue && (
              <div className="flex flex-col gap-1">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 px-1">
                  Queued to Run Next ({queue.length})
                </span>
                <div className="flex flex-col gap-1 max-h-32 overflow-y-auto scrollbar-thin scrollbar-thumb-slate-800">
                  {queue.map((item, idx) => (
                    <div
                      key={idx}
                      className="flex items-center justify-between gap-2 px-2 py-1.5 rounded-xl bg-slate-950/60 border border-slate-800 text-xs text-slate-300 hover:border-slate-700 transition-colors group"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-[10px] font-mono text-cyan-400 font-bold shrink-0">
                          #{idx + 1}
                        </span>
                        <span className="truncate text-slate-200">
                          {item.prompt || '(Empty prompt)'}
                        </span>
                      </div>

                      <button
                        type="button"
                        onClick={() => handleRemoveQueuedItem(idx)}
                        title="Remove prompt from queue"
                        className="opacity-60 group-hover:opacity-100 hover:text-red-400 p-0.5 rounded transition-opacity cursor-pointer shrink-0"
                      >
                        <X size={12} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
