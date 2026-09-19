/**
 * PeekingTaskDeck — Floating overlay card anchored above the ComposerBar.
 * Displays currently running background tasks, shell commands, Telegram uploads,
 * active agent timers/sleeps, and queued prompts.
 *
 * Automatically hides completely when no tasks or queues are active.
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  Loader2,
  Clock,
  Terminal,
  Trash2,
  ChevronDown,
  ChevronUp,
  X,
  Layers
} from 'lucide-react';
import { sessionStore, useSessionStore } from '../../stores/sessionStore';
import { useChatStore } from '../../stores/chatStore';
import type { QueuedRunItem } from '../../core/types';

const EMPTY_QUEUE: QueuedRunItem[] = [];

interface PeekingTaskDeckProps {
  chatId?: string;
}

export const PeekingTaskDeck: React.FC<PeekingTaskDeckProps> = ({ chatId: propChatId }) => {
  const storeChatId = useChatStore((s) => s.activeChatId);
  const activeChatId = propChatId || storeChatId;
  const [now, setNow] = useState(Date.now());
  const [isExpanded, setIsExpanded] = useState(true);

  // Subscribe to sessionStore changes using referentially stable selectors
  const session = useSessionStore(
    useCallback((s) => (activeChatId ? s.runningSessions.get(activeChatId) : undefined), [activeChatId])
  );
  const queueItems = useSessionStore(
    useCallback((s) => (activeChatId ? s.queues.get(activeChatId) : undefined), [activeChatId])
  );

  const activeTask = session?.activeTask || null;
  const queue = queueItems || EMPTY_QUEUE;

  // Tick every 1 second while there is an active task or timer to update elapsed/remaining time
  const hasActiveTask = Boolean(activeTask);
  const hasQueue = queue.length > 0;

  useEffect(() => {
    if (!hasActiveTask && !hasQueue) return;
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [hasActiveTask, hasQueue]);

  // "When those things are done, don't show anything else"
  if (!activeChatId || (!hasActiveTask && !hasQueue)) {
    return null;
  }

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

  const formatTaskDetail = (detail?: string): string => {
    if (!detail) return '';
    if (detail.includes('[object Object]')) {
      const cleaned = detail.replace(/\[object Object\](, )?/g, '').trim();
      return cleaned.replace(/:$/, '').trim() || 'Active request parameters...';
    }
    return detail;
  };

  const displayDetail = formatTaskDetail(activeTask?.detail);

  return (
    <div
      data-testid="peeking-task-deck"
      className="w-full border-b border-brand-border/60 animate-in slide-in-from-bottom-2 fade-in duration-200 overflow-hidden bg-brand-card/60 backdrop-blur-sm"
    >
      {/* Header Bar */}
      <div className="flex items-center justify-between px-3.5 sm:px-4 py-2 bg-brand-inner-bg/40 border-b border-brand-border/50 select-none">
        <div className="flex items-center gap-2 min-w-0">
          {/* Live activity pulsing dot */}
          <span className="relative flex h-2 w-2 shrink-0">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-cyan-500" />
          </span>

          <span className="text-xs font-semibold text-brand-textMain flex items-center gap-1.5 shrink-0">
            <Layers size={13} className="text-cyan-400" />
            <span>Active Processing Deck</span>
          </span>

          <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 font-medium truncate">
            {hasActiveTask && hasQueue
              ? `1 running · ${queue.length} queued`
              : hasActiveTask
              ? (activeTask?.type === 'timer' ? `1 timer · ${timerRemaining}s left` : '1 task running')
              : `${queue.length} prompt${queue.length > 1 ? 's' : ''} queued`}
          </span>
        </div>

        <div className="flex items-center gap-1 shrink-0">
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
            className="p-1 rounded-lg text-brand-textMuted hover:text-brand-textMain hover:bg-brand-hover transition-colors cursor-pointer"
          >
            {isExpanded ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
          </button>
        </div>
      </div>

      {/* Expandable Deck Content */}
      {isExpanded && (
        <div className="p-2.5 sm:p-3 flex flex-col gap-2 bg-brand-card/30">
          {/* Active Task Row */}
          {activeTask && (
            <div className="flex flex-col gap-1.5 p-2.5 rounded-xl bg-brand-inner-bg/60 border border-brand-border/60">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  {activeTask.type === 'timer' ? (
                    <Clock size={14} className="text-amber-400 animate-pulse shrink-0" />
                  ) : activeTask.type === 'command' ? (
                    <Terminal size={14} className="text-emerald-400 shrink-0" />
                  ) : (
                    <Loader2 size={14} className="text-cyan-400 animate-spin shrink-0" />
                  )}

                  <span className="text-xs font-semibold text-brand-textMain truncate">
                    {activeTask.type === 'timer'
                      ? 'Agent Sleep Timer'
                      : activeTask.name === 'run_command'
                      ? 'Shell Command Executing'
                      : activeTask.name === 'telegram'
                      ? 'Telegram Media Delivery'
                      : `Running: ${activeTask.name}`}
                  </span>
                </div>

                <span className="text-[11px] font-mono text-brand-textMuted shrink-0">
                  {activeTask.type === 'timer' ? (
                    <span className="text-amber-300 font-bold">{timerRemaining}s left</span>
                  ) : (
                    <span>{elapsedSecs}s elapsed</span>
                  )}
                </span>
              </div>

              {/* Task Details / Snippet */}
              {displayDetail && (
                <div className="text-[11px] font-mono text-brand-textMuted bg-brand-card/80 px-2.5 py-1.5 rounded-lg border border-brand-border/50 truncate max-w-full">
                  {activeTask.type === 'command' ? `$ ${displayDetail}` : displayDetail}
                </div>
              )}

              {/* Progress bar for timer */}
              {activeTask.type === 'timer' && timerTotal > 0 && (
                <div className="w-full bg-brand-card h-1.5 rounded-full overflow-hidden mt-0.5 border border-brand-border/40">
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
              <span className="text-[10px] font-semibold uppercase tracking-wider text-brand-textMuted px-1">
                Queued to Run Next ({queue.length})
              </span>
              <div className="flex flex-col gap-1 max-h-32 overflow-y-auto scrollbar-thin scrollbar-thumb-brand-borderStrong">
                {queue.map((item, idx) => (
                  <div
                    key={idx}
                    className="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-xl bg-brand-inner-bg/50 border border-brand-border/60 text-xs text-brand-textMain hover:border-brand-borderStrong transition-colors group"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-[10px] font-mono text-cyan-400 font-bold shrink-0">
                        #{idx + 1}
                      </span>
                      <span className="truncate text-brand-textMain">
                        {item.prompt || '(Empty prompt)'}
                      </span>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleRemoveQueuedItem(idx)}
                      title="Remove prompt from queue"
                      className="opacity-60 group-hover:opacity-100 text-brand-textMuted hover:text-red-400 p-0.5 rounded transition-opacity cursor-pointer shrink-0"
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
  );
};
