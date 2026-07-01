import React, { useState } from 'react';
import { StoredProject, StoredChat } from '../types';
import {
  Plus,
  Search,
  Clock,
  Plug,
  Folder,
  MessageSquare,
  Trash2,
  ChevronRight,
  PanelLeftClose,
  Settings,
  ChevronLeft,
} from 'lucide-react';


export interface SidebarProps {
  activeTab: string;
  onSelectTab: (tab: string) => void;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
  mcpCount?: number;
  activeProvider?: string;
  activeProject?: string;
  onSelectProject?: (project: string) => void;
  onOpenSearch?: () => void;
  onNewChat?: () => void;
  onProfileClick?: () => void; // Kept for compatibility in tests
  onMenuClick?: (menuName: string) => void;

  // New props for dynamic functionality
  projects?: StoredProject[];
  chats?: StoredChat[];
  onCreateProjectClick?: () => void;
  onDeleteProject?: (name: string) => void;
  onDeleteChat?: (id: string) => void;
  onSelectChat?: (id: string) => void;
  activeChatId?: string | null;
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  onSelectTab,
  collapsed = false,
  onToggleCollapse,
  mcpCount = 0,
  activeProvider = 'OpenAI',
  activeProject = 'GlacierPharma',
  onSelectProject,
  onOpenSearch,
  onNewChat,
  onProfileClick,
  onMenuClick,
  projects = [],
  chats = [],
  onCreateProjectClick,
  onDeleteProject,
  onDeleteChat,
  onSelectChat,
  activeChatId = null
}) => {
  const [projectsCollapsed, setProjectsCollapsed] = useState(false);
  const [chatsCollapsed, setChatsCollapsed] = useState(false);

  // Render navigation item helper
  const renderNavItem = (id: string, label: string, IconComponent: React.ComponentType<any>) => {
    const isActive = activeTab === id;
    return (
      <button
        data-testid={`nav-item-${id}`}
        onClick={() => onSelectTab(id)}
        className={`relative w-full flex items-center ${collapsed ? 'justify-center px-0' : 'gap-3 px-4'} py-2.5 rounded-lg transition-all duration-200 text-sm font-medium mb-1.5 select-none cursor-pointer ${isActive
            ? 'text-brand-textMain bg-white/5 border border-brand-border/40 shadow-sm'
            : 'text-brand-textMuted bg-transparent hover:text-brand-textMain hover:bg-white/5'
          }`}
      >
        {/* Left active line indicator */}
        {isActive && (
          <span className="absolute left-0 top-2 bottom-2 w-1 rounded-r-md bg-gradient-to-b from-violet-500 to-indigo-500" />
        )}
        <IconComponent className={`w-4 h-4 flex-shrink-0 transition-transform duration-200 ${isActive ? 'scale-110 text-violet-400' : ''}`} />
        {!collapsed && <span>{label}</span>}
      </button>
    );
  };

  return (
    <div
      data-testid="sidebar-container"
      style={{
        width: collapsed ? '70px' : '260px',
      }}
      className=" glass-panel border-r border-brand-border/50 flex flex-col p-4 h-full box-border transition-all duration-200 z-20"
    >
      {/* Top Windows Navigation Bar — Spacious and styled to feel like a premium Electron header */}
      {!collapsed && (
        <div className="h-14 border-b border-brand-border/30 flex items-center justify-between px-1 mb-5 select-none">
          {/* Navigation Arrows */}
          <div className="flex gap-1.5 text-brand-textMuted select-none">
            <button className="w-6.5 h-6.5 flex items-center justify-center rounded-md hover:bg-white/5 hover:text-brand-textMain transition-all cursor-pointer">
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button className="w-6.5 h-6.5 flex items-center justify-center rounded-md hover:bg-white/5 hover:text-brand-textMain transition-all cursor-pointer">
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
          {/* Window Menu */}
          <div className="flex gap-1 text-brand-textMuted text-[12px] font-medium tracking-wide">
            {['File', 'Edit', 'View', 'Help'].map((item) => (
              <span
                key={item}
                onClick={() => onMenuClick && onMenuClick(item)}
                className="cursor-pointer px-2.5 py-1 rounded-md hover:bg-white/5 hover:text-brand-textMain transition-all duration-150"
              >
                {item}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Main navigation list */}
      <div className="flex-1 overflow-y-auto pr-0.5 custom-scrollbar">
        {/* Core items */}
        <div className="mb-6 space-y-1">
          <button
            data-testid="nav-new-chat"
            onClick={onNewChat || (() => onSelectTab('trajectory'))}
            className={`w-full flex items-center ${collapsed ? 'justify-center px-0' : 'gap-3 px-4'} py-3.5 rounded-xl text-white bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 hover:shadow-lg hover:shadow-violet-600/25 active:scale-[0.98] transition-all duration-200 text-sm font-semibold mb-3 select-none cursor-pointer border border-violet-500/20`}
          >
            <Plus className="w-4 h-4 flex-shrink-0 text-white" />
            {!collapsed && <span>New chat</span>}
          </button>

          <button
            data-testid="nav-search"
            onClick={onOpenSearch}
            className={`w-full flex items-center ${collapsed ? 'justify-center px-0' : 'gap-3 px-4'} py-2.5 rounded-lg text-brand-textMuted bg-transparent hover:text-brand-textMain hover:bg-white/5 transition-all duration-200 text-sm font-medium mb-1.5 select-none cursor-pointer`}
          >
            <Search className="w-4 h-4 flex-shrink-0" />
            {!collapsed && <span>Search</span>}
          </button>

          {renderNavItem('scheduled', 'Scheduled', Clock)}
          {renderNavItem('plugins', 'Plugins', Plug)}
        </div>

        {/* Projects Section */}
        {!collapsed && (
          <div className="mb-6">
            <div className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-wider text-brand-textMuted/50 px-4 py-2 mt-6 mb-1.5 select-none">
              <span
                className="cursor-pointer hover:text-brand-textMain flex items-center gap-1.5 transition-colors duration-150"
                onClick={() => setProjectsCollapsed(!projectsCollapsed)}
              >
                <span>Projects</span>
                <span className="text-[9px] opacity-70">{projectsCollapsed ? '▶' : '▼'}</span>
              </span>
              <button
                onClick={onCreateProjectClick}
                className="text-brand-textMuted/70 hover:text-brand-textMain p-1 rounded-md hover:bg-white/5 transition-all duration-150 cursor-pointer"
                title="Create Project"
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
            </div>

            {!projectsCollapsed && (
              <div className="flex flex-col space-y-0.5">
                {projects.map((proj) => {
                  const isSelected = activeProject === proj.name && activeTab === 'trajectory';
                  return (
                    <div
                      key={proj.name}
                      data-testid={`project-item-${proj.name}`}
                      className={`group relative flex items-center justify-between gap-2 px-4 py-2.5 rounded-lg text-sm transition-all duration-200 cursor-pointer select-none ${isSelected
                          ? 'text-brand-textMain bg-white/5 border border-brand-border/40 shadow-sm'
                          : 'text-brand-textMuted hover:text-brand-textMain hover:bg-white/5'
                        }`}
                    >
                      {isSelected && (
                        <span className="absolute left-0 top-2 bottom-2 w-1 rounded-r-md bg-gradient-to-b from-violet-500 to-indigo-500" />
                      )}
                      <div
                        onClick={() => {
                          if (onSelectProject) onSelectProject(proj.name);
                          onSelectTab('trajectory');
                        }}
                        className="flex items-center gap-2.5 overflow-hidden flex-1"
                      >
                        <Folder className={`w-3.5 h-3.5 flex-shrink-0 transition-colors duration-150 ${isSelected ? 'text-violet-400' : 'text-brand-textMuted'}`} />
                        <span className="truncate font-medium">{proj.name}</span>
                      </div>

                      {/* Delete project button on hover */}
                      {onDeleteProject && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onDeleteProject(proj.name);
                          }}
                          className="opacity-0 group-hover:opacity-100 text-brand-textMuted hover:text-red-400 p-1 rounded-md hover:bg-white/5 transition-all cursor-pointer"
                          title="Delete Project"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  );
                })}
                {projects.length === 0 && (
                  <div className="text-xs text-brand-textMuted/60 px-4 py-2.5 italic">
                    No projects. Click + to add.
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Chats Section */}
        {!collapsed && (
          <div className="mb-6">
            <div
              className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-wider text-brand-textMuted/50 px-4 py-2 mt-6 mb-1.5 select-none cursor-pointer hover:text-brand-textMain transition-colors duration-150"
              onClick={() => setChatsCollapsed(!chatsCollapsed)}
            >
              <span>Chats</span>
              <span className="text-[9px] opacity-70">{chatsCollapsed ? '▶' : '▼'}</span>
            </div>

            {!chatsCollapsed && (
              <div className="flex flex-col space-y-0.5">
                {chats.map((chat) => {
                  const isSelected = activeChatId === chat.id && activeTab === 'trajectory';
                  return (
                    <div
                      key={chat.id}
                      data-testid={`chat-item-${chat.title.replace(/\s+/g, '-')}`}
                      className={`group relative flex items-center justify-between gap-2 px-4 py-2.5 rounded-lg text-sm transition-all duration-200 cursor-pointer select-none ${isSelected
                          ? 'text-brand-textMain bg-white/5 border border-brand-border/40 shadow-sm'
                          : 'text-brand-textMuted hover:text-brand-textMain hover:bg-white/5'
                        }`}
                    >
                      {isSelected && (
                        <span className="absolute left-0 top-2 bottom-2 w-1 rounded-r-md bg-gradient-to-b from-violet-500 to-indigo-500" />
                      )}
                      <div
                        onClick={() => {
                          if (onSelectChat) onSelectChat(chat.id);
                        }}
                        className="flex items-center gap-2.5 overflow-hidden flex-1"
                      >
                        <MessageSquare className={`w-3.5 h-3.5 flex-shrink-0 transition-colors duration-150 ${isSelected ? 'text-violet-400' : 'text-brand-textMuted'}`} />
                        <span className="truncate font-medium">{chat.title}</span>
                      </div>

                      <div className="flex items-center gap-1.5">
                        <span className="text-[10px] text-brand-textMuted/60 flex-shrink-0 group-hover:hidden">
                          {chat.timestamp}
                        </span>
                        {onDeleteChat && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              onDeleteChat(chat.id);
                            }}
                            className="opacity-0 group-hover:opacity-100 text-brand-textMuted hover:text-red-400 p-1 rounded-md hover:bg-white/5 transition-all cursor-pointer"
                            title="Delete Chat"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
                {chats.length === 0 && (
                  <div className="text-xs text-brand-textMuted/60 px-4 py-2.5 italic">
                    No active chats.
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Settings Footer & Collapse button placed side-by-side for clean horizontal layout */}
      <div className={`flex ${collapsed ? 'flex-col gap-2.5' : 'flex-row gap-2.5'} items-center border-t border-brand-border/40 pt-4 mt-auto`}>
        <button
          data-testid="sidebar-settings-btn"
          onClick={() => {
            onSelectTab('settings');
            if (onProfileClick) onProfileClick(); // call profile click callback for test expectations
          }}
          className={`relative flex-1 flex items-center ${collapsed ? 'justify-center px-0' : 'gap-3 px-4'} py-2.5 rounded-lg transition-all duration-200 text-sm font-medium cursor-pointer ${activeTab === 'settings'
              ? 'text-brand-textMain bg-white/5 border border-brand-border/40 shadow-sm'
              : 'text-brand-textMuted hover:text-brand-textMain hover:bg-white/5'
            }`}
        >
          {activeTab === 'settings' && (
            <span className="absolute left-0 top-2 bottom-2 w-1 rounded-r-md bg-gradient-to-b from-violet-500 to-indigo-500" />
          )}
          <Settings className={`w-4.5 h-4.5 flex-shrink-0 transition-transform duration-200 ${activeTab === 'settings' ? 'scale-110 text-violet-400' : ''}`} />
          {!collapsed && <span>Settings</span>}
        </button>
        {onToggleCollapse && (
          <button
            onClick={onToggleCollapse}
            className={`flex items-center justify-center p-2.5 rounded-lg text-brand-textMuted bg-white/5 border border-brand-border/20 hover:text-brand-textMain hover:bg-white/10 hover:border-brand-border/45 transition-all duration-200 cursor-pointer ${collapsed ? 'w-full' : 'w-10 h-10'}`}
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {collapsed ? <ChevronRight className="w-4.5 h-4.5" /> : <PanelLeftClose className="w-4.5 h-4.5" />}
          </button>
        )}
      </div>
    </div>
  );
};
