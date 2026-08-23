import React from 'react';
import { useChatStore, chatStore } from '../stores/chatStore';
import { useSessionStore } from '../stores/sessionStore';
import { MessageCanvas } from './MessageCanvas';
import { ComposerBar } from './ComposerBar';
import { WorkspaceRightSidebar } from './WorkspaceRightSidebar';
import { AgentOrchestrator } from '../services/AgentOrchestrator';
import type { ComposerOptions, ComposerAttachment, StoredChat } from '../core/types';

interface WorkspaceStageProps {
  activeProject: string;
  onViewDiff: (filename: string, originalCode: string, modifiedCode: string) => void;
  onOpenSettings: () => void;
  onToast: (msg: string) => void;
  onUndoStep?: (stepId: string) => void;
  onEditStep?: (stepId: string, newContent: string) => void;
}

export const WorkspaceStage: React.FC<WorkspaceStageProps> = ({
  activeProject,
  onViewDiff,
  onToast,
  onUndoStep,
  onEditStep,
}) => {
  const activeChatId = useChatStore((s) => s.activeChatId) || 'draft-chat';
  const activeChat = useChatStore((s) => s.chats.find((c) => c.id === activeChatId));
  const isGenerating = useSessionStore((s) => Boolean(s.runningSessions.get(activeChatId)?.isGenerating));
  const steps = activeChat?.steps || [];

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

  const handleAddAgentSession = () => {
    const newChatId = `chat-${Date.now()}`;
    const newChat: StoredChat = {
      id: newChatId,
      title: `Agent ${chatStore.getState().chats.length + 1}`,
      project: activeProject,
      model: activeChat?.model || '',
      timestamp: new Date().toLocaleTimeString(),
      steps: []
    };
    chatStore.setChats([...chatStore.getState().chats, newChat]);
    chatStore.setActiveChatId(newChatId);
    onToast('Launched new parallel agent session');
  };

  return (
    <div className="flex-1 flex min-w-0 min-h-0 relative overflow-hidden h-full">
      {/* Active Chat Panel */}
      <div className="flex-1 overflow-hidden flex flex-col min-h-0 h-full">
        {activeChatId ? (
          <div className="flex-1 flex flex-col min-h-0 h-full relative">
            <div className="flex-1 min-h-0 overflow-hidden">
              <MessageCanvas
                chatId={activeChatId}
                onUndoStep={onUndoStep}
                onEditStep={onEditStep}
                onViewDiff={onViewDiff}
              />
            </div>
            {/* Global composer bar at the bottom */}
            <div className="shrink-0 px-4 pb-4 pt-1">
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

      {/* Tabbed Workspace Right Sidebar */}
      <WorkspaceRightSidebar
        steps={steps}
        isGenerating={isGenerating}
        activeChatId={activeChatId}
        onViewDiff={onViewDiff}
        onAddAgentSession={handleAddAgentSession}
        onSelectChat={(id) => chatStore.setActiveChatId(id)}
      />
    </div>
  );
};

