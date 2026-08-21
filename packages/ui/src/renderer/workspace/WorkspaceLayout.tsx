/**
 * Workspace Layout Component (Pure TailwindCSS)
 * Multi-panel side-by-side agent workspace rendering parallel agent runs simultaneously.
 */

import React from 'react';
import { chatStore, useChatStore } from '../stores/chatStore';
import { ChatSidebar } from './ChatSidebar';
import { MessageCanvas } from './MessageCanvas';
import { ComposerBar } from './ComposerBar';
import { AgentOrchestrator } from '../services/AgentOrchestrator';
import type { ComposerOptions, ComposerAttachment } from '../core/types';

interface WorkspaceLayoutProps {
  onOpenSettings?: () => void;
}

export const WorkspaceLayout: React.FC<WorkspaceLayoutProps> = ({ onOpenSettings }) => {
  const activePanels = useChatStore((s) => s.activePanels);
  const activeChatId = useChatStore((s) => s.activeChatId);

  const displayPanels = activePanels.length > 0 ? activePanels : activeChatId ? [activeChatId] : [];

  const handleSendPrompt = (prompt: string, options: ComposerOptions, attachments: ComposerAttachment[]) => {
    if (activeChatId) {
      AgentOrchestrator.sendPrompt(activeChatId, prompt, options, attachments).catch(console.error);
    }
  };

  const handleClosePanel = (chatId: string) => {
    chatStore.closePanel(chatId);
  };

  return (
    <div className="flex h-screen w-screen bg-slate-950 text-slate-100 overflow-hidden font-sans select-none">
      {/* Sidebar */}
      <ChatSidebar onOpenSettings={onOpenSettings} />

      {/* Main Workspace Stage */}
      <div className="flex-1 flex flex-col h-full min-w-0 bg-slate-950/40 relative">
        {/* Parallel Side-by-Side Panels Stage */}
        <div className="flex-1 p-4 overflow-hidden">
          {displayPanels.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-slate-500">
              <p className="text-sm">Select or create a conversation session to get started.</p>
            </div>
          ) : (
            <div className="grid h-full gap-4" style={{ gridTemplateColumns: `repeat(${displayPanels.length}, minmax(0, 1fr))` }}>
              {displayPanels.map((id) => (
                <MessageCanvas key={id} chatId={id} onClosePanel={displayPanels.length > 1 ? () => handleClosePanel(id) : undefined} />
              ))}
            </div>
          )}
        </div>

        {/* Global Input Composer Bar */}
        {activeChatId && (
          <div className="shrink-0 p-2 bg-gradient-to-t from-slate-950 via-slate-950/90 to-transparent">
            <ComposerBar onSend={handleSendPrompt} />
          </div>
        )}
      </div>
    </div>
  );
};
