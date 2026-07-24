/**
 * Chat Sidebar Component (Pure TailwindCSS)
 * Navigation sidebar displaying projects, active chats, queued count badges, and new session creators.
 */

import React, { useState } from 'react';
import { Folder, Plus, Trash2, MessageSquare, ChevronDown, ChevronRight, Settings, Bot } from 'lucide-react';
import { chatStore, useChatStore } from '../stores/chatStore';
import { sessionStore, useSessionStore } from '../stores/sessionStore';
import { ChatRepository } from '../services/ChatRepository';

interface ChatSidebarProps {
  onOpenSettings?: () => void;
}

export const ChatSidebar: React.FC<ChatSidebarProps> = ({ onOpenSettings }) => {
  const projects = useChatStore((s) => s.projects);
  const chats = useChatStore((s) => s.chats);
  const activeChatId = useChatStore((s) => s.activeChatId);
  const activeProject = useChatStore((s) => s.activeProject);

  const [collapsedProjects, setCollapsedProjects] = useState<Record<string, boolean>>({});

  const toggleProject = (name: string) => {
    setCollapsedProjects((prev) => ({ ...prev, [name]: !prev[name] }));
  };

  const handleNewChat = (projName?: string) => {
    ChatRepository.createChat(projName).catch(console.error);
  };

  const handleDeleteChat = (e: React.MouseEvent, chatId: string) => {
    e.stopPropagation();
    ChatRepository.deleteChat(chatId).catch(console.error);
  };

  return (
    <div className="w-64 h-full bg-slate-950/80 border-r border-slate-800/80 flex flex-col justify-between p-3 select-none backdrop-blur-xl">
      {/* Header */}
      <div className="space-y-4">
        <div className="flex items-center justify-between px-2 pt-1">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-xl bg-gradient-to-tr from-cyan-500 to-blue-600 flex items-center justify-center text-white font-bold shadow-md shadow-cyan-500/20">
              <Bot size={16} />
            </div>
            <span className="font-bold text-sm text-slate-100 tracking-wide">SuperAgent</span>
          </div>
          <button
            onClick={() => handleNewChat()}
            className="p-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-800 transition-colors"
            title="New Standalone Chat"
          >
            <Plus size={16} />
          </button>
        </div>

        {/* Project & Chat List */}
        <div className="space-y-3 overflow-y-auto max-h-[calc(100vh-140px)] scrollbar-thin scrollbar-thumb-slate-800 pr-1">
          {/* Projects Group */}
          <div>
            <div className="flex items-center justify-between text-[11px] font-mono font-semibold text-slate-400 uppercase tracking-wider px-2 mb-1.5">
              <span>Projects</span>
            </div>

            {projects.map((proj) => {
              const isCollapsed = collapsedProjects[proj.name];
              const projChats = chats.filter((c) => c.project === proj.name);

              return (
                <div key={proj.name} className="mb-2">
                  <div
                    onClick={() => {
                      chatStore.setActiveProject(proj.name);
                      toggleProject(proj.name);
                    }}
                    className={`flex items-center justify-between px-2 py-1.5 rounded-xl text-xs cursor-pointer transition-colors ${
                      activeProject === proj.name ? 'bg-slate-900 text-cyan-300 font-semibold' : 'text-slate-300 hover:bg-slate-900/60'
                    }`}
                  >
                    <div className="flex items-center gap-2 truncate">
                      {isCollapsed ? <ChevronRight size={14} className="text-slate-400" /> : <ChevronDown size={14} className="text-slate-400" />}
                      <Folder size={14} className="text-cyan-400 shrink-0" />
                      <span className="truncate">{proj.name}</span>
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleNewChat(proj.name);
                      }}
                      className="p-1 hover:text-cyan-400 text-slate-500 rounded"
                      title="New chat in project"
                    >
                      <Plus size={13} />
                    </button>
                  </div>

                  {!isCollapsed && (
                    <div className="pl-4 mt-1 space-y-0.5 border-l border-slate-800/80 ml-3">
                      {projChats.map((c) => {
                        const isRunning = sessionStore.isRunning(c.id);
                        const queueDepth = sessionStore.getQueueDepth(c.id);
                        const isActive = activeChatId === c.id;

                        return (
                          <div
                            key={c.id}
                            onClick={() => ChatRepository.openChat(c.id)}
                            className={`group flex items-center justify-between px-2.5 py-1.5 rounded-xl text-xs cursor-pointer transition-colors ${
                              isActive ? 'bg-cyan-500/10 text-cyan-300 font-semibold border border-cyan-500/20' : 'text-slate-400 hover:bg-slate-900/60 hover:text-slate-200'
                            }`}
                          >
                            <div className="flex items-center gap-2 truncate">
                              <MessageSquare size={13} className={isActive ? 'text-cyan-400' : 'text-slate-400'} />
                              <span className="truncate max-w-[110px]">{c.title || 'Chat'}</span>
                            </div>

                            <div className="flex items-center gap-1">
                              {isRunning && <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />}
                              {queueDepth > 0 && (
                                <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-amber-500/20 text-amber-300 font-mono">
                                  +{queueDepth}
                                </span>
                              )}
                              <button
                                onClick={(e) => handleDeleteChat(e, c.id)}
                                className="opacity-0 group-hover:opacity-100 hover:text-red-400 transition-opacity p-0.5"
                              >
                                <Trash2 size={12} />
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Footer Settings */}
      {onOpenSettings && (
        <div className="pt-2 border-t border-slate-800/80">
          <button
            onClick={onOpenSettings}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-slate-200 hover:bg-slate-900 transition-colors"
          >
            <Settings size={15} />
            <span>Settings & Models</span>
          </button>
        </div>
      )}
    </div>
  );
};
