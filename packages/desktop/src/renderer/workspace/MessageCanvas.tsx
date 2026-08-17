/**
 * Message Canvas Component (Pure TailwindCSS)
 * Displays steps, streaming output, context gauge, and agent controls for a specific chat panel.
 */

import React, { useRef, useEffect, useState } from 'react';
import { Bot, Square, Loader2, RefreshCw, AlertTriangle, ChevronRight, ChevronDown } from 'lucide-react';
import { useTrajectory } from '../hooks/useTrajectory';
import { useAgent } from '../hooks/useAgent';
import { TrajectoryCanvas } from '../pages/Workspace/TrajectoryCanvas';
import { chatStore, useChatStore } from '../stores/chatStore';
import { ChatRepository } from '../services/ChatRepository';

interface MessageCanvasProps {
  chatId: string;
  onClosePanel?: () => void;
  onUndoStep?: (stepId: string) => void;
  onEditStep?: (stepId: string, newContent: string) => void;
  onViewDiff?: (filename: string, originalCode: string, modifiedCode: string) => void;
  onRegenerate?: (turnId: string, content: string) => void;
  onRetryLast?: () => void;
}

export const MessageCanvas: React.FC<MessageCanvasProps> = ({
  chatId,
  onClosePanel,
  onUndoStep,
  onEditStep,
  onViewDiff,
  onRegenerate,
  onRetryLast,
}) => {
  const steps = useTrajectory(chatId);
  const { isRunning, lastError, contextUsage, stopRun } = useAgent(chatId);
  const chat = useChatStore((s) => s.chats.find((c) => c.id === chatId));
  const draftProject = useChatStore((s) => s.draftProject);
  const displayProject = chatId === 'draft-chat' ? (draftProject || 'No Project') : (chat?.project || 'No Project');

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Panel Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-[color:var(--brand-card)] border-b border-[color:var(--brand-border)] select-none">
        <div className="flex items-center gap-1.5 min-w-0 text-[color:var(--brand-text-muted)] text-xs">
          <div className="w-2.5 h-2.5 rounded-full bg-[color:var(--neon-live)] shadow-sm shadow-[color:var(--neon-live)]/50 shrink-0 mr-1" />
          <span className="hover:text-[color:var(--brand-text-main)] transition-colors">Workspace</span>
          <ChevronRight size={12} className="shrink-0 text-[color:var(--brand-text-muted)] opacity-60" />
          <span className="px-2 py-0.5 bg-[color:var(--brand-inner-bg)] border border-[color:var(--brand-border)] rounded-md text-[10px] font-medium text-[color:var(--brand-text-main)] truncate max-w-[150px]">
            {displayProject}
          </span>
          <ChevronRight size={12} className="shrink-0 text-[color:var(--brand-text-muted)] opacity-60" />
          <span className="font-semibold text-sm text-[color:var(--brand-text-main)] truncate">
            {chat?.title || 'Active Session'}
          </span>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          {contextUsage && (
            <div className="flex items-center gap-1.5 text-xs text-[color:var(--brand-text-muted)] font-mono bg-[color:var(--brand-inner-bg)] px-2.5 py-1 rounded-lg border border-[color:var(--brand-border)]">
              <span>Ctx:</span>
              <span className={contextUsage.pct > 80 ? 'text-[color:var(--neon-attention)] font-bold' : 'text-[color:var(--neon-live)]'}>
                {contextUsage.pct}%
              </span>
            </div>
          )}

          {isRunning && (
            <button
              onClick={stopRun}
              className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg bg-[color:var(--neon-destructive)]/10 hover:bg-[color:var(--neon-destructive)]/20 text-[color:var(--neon-destructive)] border border-[color:var(--neon-destructive)]/30 transition-colors"
            >
              <Square size={12} className="fill-current" />
              <span>Stop Run</span>
            </button>
          )}

          {onClosePanel && (
            <button
              onClick={onClosePanel}
              className="text-[color:var(--brand-text-muted)] hover:text-[color:var(--brand-text-main)] transition-colors p-1 rounded-lg hover:bg-[color:var(--brand-hover)]"
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
