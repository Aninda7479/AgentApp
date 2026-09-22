/**
 * Message Canvas Component (Pure TailwindCSS)
 * Displays steps, streaming output, context gauge, and agent controls for a specific chat panel.
 */

import React, { useRef, useEffect, useState } from 'react';
import { Bot, Square, Loader2, RefreshCw, AlertTriangle, ChevronRight, ChevronDown, FileCode2 } from 'lucide-react';
import { useTrajectory } from '../hooks/useTrajectory';
import { useAgent } from '../hooks/useAgent';
import { TrajectoryCanvas } from '../pages/Workspace/TrajectoryCanvas';
import { chatStore, useChatStore } from '../stores/chatStore';
import { ChatRepository } from '../services/ChatRepository';
import { IpcBridge } from '../core/ipc';

interface MessageCanvasProps {
  chatId: string;
  onClosePanel?: () => void;
  onUndoStep?: (stepId: string) => void;
  onEditStep?: (stepId: string, newContent: string) => void;
  onViewDiff?: (filename: string, originalCode: string, modifiedCode: string) => void;
  onRegenerate?: (turnId: string, content: string) => void;
  onRetryLast?: () => void;
  onToggleRightSidebar?: () => void;
  modifiedFilesCount?: number;
}

export const MessageCanvas: React.FC<MessageCanvasProps> = ({
  chatId,
  onClosePanel,
  onUndoStep,
  onEditStep,
  onViewDiff,
  onRegenerate,
  onRetryLast,
  onToggleRightSidebar,
  modifiedFilesCount = 0,
}) => {
  const steps = useTrajectory(chatId);
  const { isRunning, lastError, contextUsage, stopRun } = useAgent(chatId);
  const chat = useChatStore((s) => s.chats.find((c) => c.id === chatId));
  const draftProject = useChatStore((s) => s.draftProject);
  const displayProject = chatId === 'draft-chat' ? (draftProject || 'No Project') : (chat?.project || 'No Project');

  // Lazy-load steps from disk when opening a chat whose steps are not resident
  useEffect(() => {
    if (chatId && chatId !== 'draft-chat' && steps.length === 0) {
      IpcBridge.readChatSteps(chatId)
        .then((diskSteps) => {
          if (diskSteps && diskSteps.length > 0) {
            if (chatStore.getSteps(chatId).length === 0) {
              chatStore.setSteps(chatId, diskSteps);
            }
          }
        })
        .catch(() => {});
    }
  }, [chatId, steps.length]);

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Panel Header — on mobile, the unified TitleBar replaces this */}
      <div className="hidden lg:flex items-center justify-between px-3 py-2.5 sm:px-4 sm:py-3 bg-brand-inner-bg/90 backdrop-blur-xs border-b border-brand-border/40 select-none gap-2">
        <div className="flex items-center gap-1.5 min-w-0 text-[color:var(--brand-text-muted)] text-xs">
          <div className="w-2.5 h-2.5 rounded-full bg-[color:var(--neon-live)] shadow-sm shadow-[color:var(--neon-live)]/50 shrink-0 mr-0.5" />
          <span className="hidden sm:inline hover:text-[color:var(--brand-text-main)] transition-colors">Workspace</span>
          {displayProject && displayProject !== 'No Project' && (
            <>
              <ChevronRight size={12} className="hidden sm:inline shrink-0 text-[color:var(--brand-text-muted)] opacity-60" />
              <span className="hidden sm:inline text-[color:var(--brand-text-muted)] truncate max-w-[140px]">
                {displayProject}
              </span>
            </>
          )}
          <ChevronRight size={12} className="shrink-0 text-[color:var(--brand-text-muted)] opacity-60" />
          <span className="font-semibold text-xs sm:text-sm text-[color:var(--brand-text-main)] truncate">
            {chat?.title || 'Active Session'}
          </span>
        </div>

        <div className="flex items-center gap-1.5 sm:gap-3 shrink-0">
          {contextUsage && (
            <div className="flex items-center gap-1 text-[11px] sm:text-xs text-[color:var(--brand-text-muted)] font-mono bg-[color:var(--brand-inner-bg)] px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-lg border border-[color:var(--brand-border)]">
              <span>Ctx:</span>
              <span className={contextUsage.pct > 80 ? 'text-[color:var(--neon-attention)] font-bold' : 'text-[color:var(--neon-live)]'}>
                {contextUsage.pct}%
              </span>
            </div>
          )}

          {isRunning && (
            <button
              onClick={stopRun}
              className="flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 sm:px-3 sm:py-1.5 rounded-lg bg-[color:var(--neon-destructive)]/10 hover:bg-[color:var(--neon-destructive)]/20 text-[color:var(--neon-destructive)] border border-[color:var(--neon-destructive)]/30 transition-colors cursor-pointer"
            >
              <Square size={12} className="fill-current" />
              <span className="hidden sm:inline">Stop</span>
            </button>
          )}

          {onToggleRightSidebar && (
            <button
              onClick={onToggleRightSidebar}
              className="relative flex items-center gap-1 text-xs font-medium px-2 py-1.5 rounded-lg text-brand-textMuted hover:text-brand-textMain hover:bg-brand-hover border border-transparent hover:border-brand-border/60 transition-colors cursor-pointer lg:hidden"
              title="Toggle Overview & Inspector"
              aria-label="Toggle Overview & Inspector"
            >
              <FileCode2 size={16} />
              {modifiedFilesCount > 0 && (
                <span className="px-1.5 py-0.2 rounded-full bg-brand-primary text-[9px] font-bold text-brand-bg">
                  {modifiedFilesCount}
                </span>
              )}
            </button>
          )}

          {onClosePanel && (
            <button
              onClick={onClosePanel}
              className="text-[color:var(--brand-text-muted)] hover:text-[color:var(--brand-text-main)] transition-colors p-1 rounded-lg hover:bg-[color:var(--brand-hover)] cursor-pointer"
              title="Close Panel"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {/* Trajectory Canvas */}
      <div className="flex-1 overflow-hidden flex flex-col min-h-0 relative">
        <TrajectoryCanvas
          steps={steps}
          isStreaming={isRunning}
          lastError={lastError}
          onUndoStep={onUndoStep}
          onEditStep={onEditStep}
          onViewDiff={onViewDiff}
          onRegenerate={onRegenerate}
          onRetryLast={onRetryLast}
        />
      </div>
    </div>
  );
};
