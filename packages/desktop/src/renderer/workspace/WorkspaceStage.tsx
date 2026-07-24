/**
 * Workspace Stage Component (Pure TailwindCSS)
 * Renders a clean, single-panel agent workspace for the active chat session.
 */

import React from 'react';
import { useChatStore } from '../stores/chatStore';
import { MessageCanvas } from './MessageCanvas';
import { ComposerBar } from './ComposerBar';
import { AgentOrchestrator } from '../services/AgentOrchestrator';
import type { ComposerOptions, ComposerAttachment } from '../core/types';

interface WorkspaceStageProps {
  activeProject: string;
  onViewDiff: (filename: string, originalCode: string, modifiedCode: string) => void;
  onOpenSettings: () => void;
  onToast: (msg: string) => void;
}

export const WorkspaceStage: React.FC<WorkspaceStageProps> = ({
  activeProject,
  onToast,
}) => {
  const activeChatId = useChatStore((s) => s.activeChatId) || 'draft-chat';

  const handleSendPrompt = (prompt: string, options: ComposerOptions, attachments: ComposerAttachment[]) => {
    if (activeChatId) {
      AgentOrchestrator.sendPrompt(activeChatId, prompt, options, attachments)
        .then(() => {
          onToast('Agent run started');
        })
        .catch((err) => {
          onToast(`Error: ${err.message || err}`);
        });
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full min-w-0 relative">

      {/* Active Chat Panel */}
      <div className="flex-1 overflow-hidden flex flex-col min-h-0">
        {activeChatId ? (
          <div className="flex-1 flex flex-col min-h-0 relative space-y-2">
            <div className="flex-1 min-h-0">
              <MessageCanvas chatId={activeChatId} />
            </div>
            {/* Global composer bar at the bottom */}
            <div className="shrink-0">
              <ComposerBar
                onSend={(prompt, options, attachments) => handleSendPrompt(prompt, options, attachments)}
              />
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-slate-500 select-none">
            <p className="text-sm">Select or create a conversation to get started.</p>
          </div>
        )}
      </div>
    </div>
  );
};
