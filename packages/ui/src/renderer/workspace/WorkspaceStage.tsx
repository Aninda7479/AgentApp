import React, { useState, useMemo, useEffect } from 'react';
import { Sparkles, Terminal, Code2, Wrench } from 'lucide-react';
import { useChatStore, chatStore, type ChatStoreState } from '../stores/chatStore';
import { useSessionStore, type SessionStoreState } from '../stores/sessionStore';
import { MessageCanvas } from './MessageCanvas';
import { ComposerBar } from './ComposerBar';
import { ProjectPicker } from './ProjectPicker';
import { WorkspaceRightSidebar } from './WorkspaceRightSidebar';
import { BrandLogo } from '../BrandLogo';
import { AgentOrchestrator } from '../services/AgentOrchestrator';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { AuthService, type AuthStatus } from '../services/AuthService';
import { getIpc } from '../lib/ipc';
import type { ComposerOptions, ComposerAttachment, StoredChat } from '../core/types';
import type { TrajectoryStep } from '../pages/Workspace/TrajectoryCanvas';

interface WorkspaceStageProps {
  activeProject: string;
  onViewDiff: (filename: string, originalCode: string, modifiedCode: string) => void;
  onOpenSettings: () => void;
  onToast: (msg: string) => void;
  onUndoStep?: (stepId: string) => void;
  onEditStep?: (stepId: string, newContent: string) => void;
}

const PROMPT_SUGGESTIONS = [
  {
    icon: <Sparkles className="w-3.5 h-3.5 text-amber-400 shrink-0" />,
    label: 'Scaffold new project',
    prompt: 'Scaffold a modern full-stack web application with TypeScript, Tailwind CSS, and clean modular structure.',
  },
  {
    icon: <Terminal className="w-3.5 h-3.5 text-emerald-400 shrink-0" />,
    label: 'Debug & fix issues',
    prompt: 'Inspect the current codebase for errors, run tests/checks, and fix any breaking bugs.',
  },
  {
    icon: <Code2 className="w-3.5 h-3.5 text-cyan-400 shrink-0" />,
    label: 'Explore architecture',
    prompt: 'Explain the high-level architecture, module dependencies, and entrypoints of this project.',
  },
  {
    icon: <Wrench className="w-3.5 h-3.5 text-purple-400 shrink-0" />,
    label: 'Write unit tests',
    prompt: 'Write automated unit tests for key utilities and services to verify edge cases and coverage.',
  },
];

export const WorkspaceStage: React.FC<WorkspaceStageProps> = ({
  activeProject,
  onViewDiff,
  onToast,
  onUndoStep,
  onEditStep,
}) => {
  const [isRightSidebarOpenMobile, setIsRightSidebarOpenMobile] = useState(false);
  const [ownerName, setOwnerName] = useState<string>(() => {
    const auth = AuthService.getStatus();
    return auth?.ownerName || '';
  });
  const [composerPrompt, setComposerPrompt] = useState<string>('');

  useEffect(() => {
    const handler = () => setIsRightSidebarOpenMobile((prev) => !prev);
    window.addEventListener('toggle-mobile-right-sidebar', handler);
    window.addEventListener('toggle-right-sidebar', handler);
    return () => {
      window.removeEventListener('toggle-mobile-right-sidebar', handler);
      window.removeEventListener('toggle-right-sidebar', handler);
    };
  }, []);

  useEffect(() => {
    const ipcRenderer = getIpc();
    if (ipcRenderer) {
      ipcRenderer.invoke('settings-read').then((s: any) => {
        const name =
          s?.general?.ownerName ||
          s?.ownerName ||
          s?.webApp?.ownerName ||
          s?.branding?.ownerName ||
          s?.general?.hostOwnerName;
        if (name) {
          setOwnerName(name);
        }
      }).catch(() => {});
    }
    const unsub = AuthService.subscribe((status: AuthStatus) => {
      if (status.ownerName) {
        setOwnerName(status.ownerName);
      }
    });
    return unsub;
  }, []);

  const activeChatId = useChatStore((s: ChatStoreState) => s.activeChatId) || 'draft-chat';
  const activeChat = useChatStore((s: ChatStoreState) => s.chats.find((c: StoredChat) => c.id === activeChatId));
  const draftProject = useChatStore((s: ChatStoreState) => s.draftProject);
  const currentProject = activeProject || draftProject || '';
  const isGenerating = useSessionStore((s: SessionStoreState) => Boolean(s.runningSessions.get(activeChatId)?.isGenerating));
  const steps = activeChat?.steps || [];

  const greeting = useMemo(() => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 18) return 'Good afternoon';
    return 'Good evening';
  }, []);

  const userDisplayName = useMemo(() => {
    if (ownerName && ownerName.trim() && ownerName.trim() !== 'SuperAgent User') {
      return ownerName.trim();
    }
    return 'Developer';
  }, [ownerName]);

  const modifiedFilesCount = useMemo(() => {
    const fileSet = new Set<string>();
    steps.forEach((step: TrajectoryStep) => {
      if (step.metadata?.diff?.filename) {
        fileSet.add(step.metadata.diff.filename);
      }
    });
    return fileSet.size;
  }, [steps]);

  const handleSendPrompt = (prompt: string, options: ComposerOptions, attachments: ComposerAttachment[]) => {
    if (activeChatId) {
      AgentOrchestrator.sendPrompt(activeChatId, prompt, options, attachments)
        .then(() => {
          onToast('Agent run started');
        })
        .catch((err: unknown) => {
          const msg = err instanceof Error ? err.message : String(err);
          onToast(`Error: ${msg}`);
        });
    }
  };

  const handleAddAgentSession = () => {
    const newChatId = `chat-${Date.now()}`;
    const newChat: StoredChat = {
      id: newChatId,
      title: `Agent ${chatStore.getState().chats.length + 1}`,
      project: currentProject,
      model: activeChat?.model || '',
      timestamp: new Date().toLocaleTimeString(),
      steps: []
    };
    chatStore.setChats([...chatStore.getState().chats, newChat]);
    chatStore.setActiveChatId(newChatId);
    onToast('Launched new parallel agent session');
  };

  return (
    <div className="flex-1 flex min-w-0 min-h-0 relative overflow-hidden h-full bg-brand-inner-bg">
      {/* Active Chat Panel */}
      <div className="flex-1 w-full min-w-0 overflow-hidden flex flex-col min-h-0 h-full">
        {activeChatId ? (
          steps.length === 0 ? (
            <div className="flex-1 flex flex-col justify-center items-center px-4 py-8 max-w-3xl mx-auto w-full min-h-0 overflow-y-auto select-none">
              <div className="w-full flex flex-col items-center text-center mb-6 sm:mb-8 animate-in fade-in slide-in-from-bottom-2 duration-300">
                {/* Brand icon / subtle glow */}
                <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-2xl bg-brand-card/80 border border-brand-border/60 flex items-center justify-center mb-4 text-brand-highlight shadow-sm">
                  <BrandLogo size={28} />
                </div>

                <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-brand-textMain mb-2">
                  {greeting}, <span className="text-brand-highlight font-bold">{userDisplayName}</span>
                </h1>
                <p className="text-xs sm:text-sm text-brand-textMuted max-w-md">
                  What would you like to build or automate today?
                </p>

                {/* Project selector pill before chat composer */}
                <div className="mt-4 flex items-center gap-2">
                  <span className="text-xs text-brand-textMuted">Project:</span>
                  <ProjectPicker
                    variant="pill"
                    selectedProject={currentProject}
                    onSelectProject={(proj: string) => {
                      chatStore.setDraftProject(proj);
                      chatStore.setActiveProject(proj);
                    }}
                  />
                </div>
              </div>

              {/* Centered Composer */}
              <div className="w-full max-w-2xl sm:max-w-3xl">
                <ComposerBar
                  initialPrompt={composerPrompt}
                  onSend={(prompt: string, options: ComposerOptions, attachments: ComposerAttachment[]) => {
                    setComposerPrompt('');
                    handleSendPrompt(prompt, options, attachments);
                  }}
                />
              </div>

              {/* Starter Prompt Suggestion Chips */}
              <div className="mt-6 w-full max-w-2xl sm:max-w-3xl flex flex-wrap items-center justify-center gap-2">
                {PROMPT_SUGGESTIONS.map((item, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => setComposerPrompt(item.prompt)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium bg-brand-card/70 hover:bg-brand-hover text-brand-textMuted hover:text-brand-textMain border border-brand-border/50 hover:border-brand-border transition-all cursor-pointer shadow-2xs"
                  >
                    {item.icon}
                    <span>{item.label}</span>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="flex-1 flex flex-col min-h-0 h-full relative">
              <div className="flex-1 min-h-0 overflow-hidden">
                <ErrorBoundary name="Message Canvas" resetKeys={[activeChatId]}>
                  <MessageCanvas
                    chatId={activeChatId}
                    onUndoStep={onUndoStep}
                    onEditStep={onEditStep}
                    onViewDiff={onViewDiff}
                    onToggleRightSidebar={() => setIsRightSidebarOpenMobile((prev) => !prev)}
                    modifiedFilesCount={modifiedFilesCount}
                  />
                </ErrorBoundary>
              </div>
              {/* Global composer bar at the bottom */}
              <div className="shrink-0 px-2.5 pb-2 pt-1 sm:px-4 sm:pb-4">
                <ComposerBar
                  onSend={(prompt: string, options: ComposerOptions, attachments: ComposerAttachment[]) => handleSendPrompt(prompt, options, attachments)}
                />
              </div>
            </div>
          )
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-slate-500 select-none">
            <p className="text-sm">Select or create a conversation to get started.</p>
          </div>
        )}
      </div>

      {/* Tabbed Workspace Right Sidebar */}
      <ErrorBoundary name="Workspace Sidebar" resetKeys={[activeChatId]}>
        <WorkspaceRightSidebar
          steps={steps}
          isGenerating={isGenerating}
          activeChatId={activeChatId}
          onViewDiff={onViewDiff}
          onAddAgentSession={handleAddAgentSession}
          onSelectChat={(id: string) => chatStore.setActiveChatId(id)}
          isMobileOpen={isRightSidebarOpenMobile}
          onMobileClose={() => setIsRightSidebarOpenMobile(false)}
        />
      </ErrorBoundary>
    </div>
  );
};

