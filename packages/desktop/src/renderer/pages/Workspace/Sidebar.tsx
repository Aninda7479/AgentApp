import React, { useState, useRef, useEffect } from 'react';
import { StoredProject, StoredChat } from '../../types';
import {
  Plus,
  Search,
  Clock,
  Trash2,
  ChevronRight,
  ChevronLeft,
  ChevronDown,
  PanelLeftClose,
  Settings,
  FileText,
  SquarePen,
  MoreHorizontal,
  MessageSquarePlus,
  PawPrint,
  Box,
  KanbanSquare,
} from 'lucide-react';


/** Props for the Sidebar navigation component. */
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
  onNewChatInProject?: (projectName: string) => void;
  onProfileClick?: () => void;
  onMenuClick?: (menuName: string) => void;

  // Dynamic props
  projects?: StoredProject[];
  chats?: StoredChat[];
  onCreateProjectClick?: () => void;
  onDeleteProject?: (name: string) => void;
  onConfigureProject?: (project: StoredProject) => void;
  /** Opens the full-page Project Settings for the given project (replaces the quick modal). */
  onProjectSettings?: (project: StoredProject) => void;
  /** Opens the per-chat Sandbox & Internet settings modal for the given chat. */
  onChatSettings?: (chat: StoredChat) => void;
  /** Opens the per-chat settings page for the given standalone (project-less) chat. */
  onStandaloneChatSettings?: (chat: StoredChat) => void;
  onDeleteChat?: (id: string) => void;
  onSelectChat?: (id: string) => void;
  activeChatId?: string | null;
  /** When true, the sidebar is shown as an off-canvas drawer on small screens. */
  mobileOpen?: boolean;
  /** Invoked to request closing the mobile drawer. */
  onMobileClose?: () => void;
  /** When true, the dedicated 3D Studio nav entry is shown. */
  showStudio?: boolean;
}

/** Collapsible sidebar with project tree, chat list, and navigation links. */
export const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  onSelectTab,
  collapsed = false,
  onToggleCollapse,
  mcpCount = 0,
  activeProvider = 'OpenAI',
  activeProject = '',
  onSelectProject,
  onOpenSearch,
  onNewChat,
  onNewChatInProject,
  onProfileClick,
  onMenuClick,
  projects = [],
  chats = [],
  onCreateProjectClick,
  onDeleteProject,
  onConfigureProject,
  onProjectSettings,
  onChatSettings,
  onStandaloneChatSettings,
  onDeleteChat,
  onSelectChat,
  activeChatId = null,
  mobileOpen = false,
  onMobileClose,
  showStudio = false
}) => {
  // Each project tracks its own collapsed state (all expanded by default)
  const [collapsedProjects, setCollapsedProjects] = useState<Record<string, boolean>>({});
  const [chatsCollapsed, setChatsCollapsed] = useState(false);
  // Track which project's "..." menu is open
  const [openMenuProject, setOpenMenuProject] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Sort helper to order chats chronologically (newest first)
  const parseChatTime = (chat: StoredChat): number => {
    if (chat.startedAt) {
      return chat.startedAt;
    }
    if (chat.timestamp) {
      if (chat.timestamp === 'Just now') {
        return Date.now();
      }
      const dateParsed = Date.parse(chat.timestamp);
      if (!isNaN(dateParsed)) {
        return dateParsed;
      }
      const match = chat.timestamp.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
      if (match) {
        const day = parseInt(match[1], 10);
        const month = parseInt(match[2], 10) - 1;
        const year = parseInt(match[3], 10);
        return new Date(year, month, day).getTime();
      }
    }
    return 0;
  };

  const sortChatsChronologically = (a: StoredChat, b: StoredChat): number => {
    return parseChatTime(b) - parseChatTime(a);
  };

  // Standalone chats = chats not linked to any known project, sorted chronologically
  const standaloneChats = chats
    .filter((chat) => !chat.project || !projects.some((p) => p.name === chat.project))
    .sort(sortChatsChronologically);

  const toggleProjectCollapse = (name: string) => {
    setCollapsedProjects(prev => ({ ...prev, [name]: !prev[name] }));
  };

  // Close dot-menu when clicking outside
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpenMenuProject(null);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, []);

  const renderNavItem = (
    id: string,
    label: string,
    IconComponent: React.ComponentType<any>,
    opts?: { locked?: boolean }
  ) => {
    const isActive = activeTab === id;
    const locked = opts?.locked ?? false;
    return (
      <button
        data-testid={`nav-item-${id}`}
        onClick={() => onSelectTab(id)}
        title={locked ? `${label} is off — open Settings to enable it` : undefined}
        className={`relative w-full flex items-center ${collapsed ? 'justify-center px-0' : 'gap-3 px-4'} py-2 rounded-lg transition-all duration-200 text-sm font-medium mb-0.5 select-none cursor-pointer ${isActive
            ? 'text-brand-textMain bg-[color:var(--brand-hover)] border border-brand-border/40 shadow-sm'
            : locked
              ? 'text-brand-textMuted/50 bg-transparent hover:text-brand-textMain hover:bg-[color:var(--brand-hover)]'
              : 'text-brand-textMuted bg-transparent hover:text-brand-textMain hover:bg-[color:var(--brand-hover)]'
          }`}
      >
        {isActive && (
          <span className="absolute left-0 top-2 bottom-2 w-1 rounded-r-md bg-brand-textMain" />
        )}
        <IconComponent className={`w-4 h-4 flex-shrink-0 transition-transform duration-200 ${isActive ? 'scale-110 text-brand-textMain' : ''}`} />
        {!collapsed && <span>{label}</span>}
        {locked && !collapsed && (
          <span className="ml-auto text-[10px] font-semibold uppercase tracking-wide text-brand-textMuted/40">
            Off
          </span>
        )}
      </button>
    );
  };

  return (
    <div
      data-testid="sidebar-container"
      style={{ width: collapsed ? '70px' : '260px', maxWidth: '85vw' }}
      className={`flex flex-col h-full box-border transition-transform duration-200 z-40 pb-[68px] md:pb-4 bg-brand-bg
        fixed inset-y-0 left-0 lg:static lg:translate-x-0
        ${mobileOpen ? 'translate-x-0 shadow-2xl' : '-translate-x-full lg:translate-x-0'}`}
    >
      {/* Mobile-only close button */}
      {onMobileClose && (
        <button
          onClick={onMobileClose}
          className="lg:hidden absolute top-3 right-3 w-8 h-8 flex items-center justify-center rounded-lg text-brand-textMuted hover:text-brand-textMain hover:bg-[color:var(--brand-hover-strong)] transition-colors z-10"
          title="Close menu"
          aria-label="Close menu"
        >
          <PanelLeftClose className="w-5 h-5" />
        </button>
      )}


      {/* Main scrollable nav list */}
      <div className="flex-1 overflow-y-auto pr-0.5 sidebar-scroll">
        {/* Core action buttons */}
        <div className="mb-4 space-y-0.5">
          <button
            data-testid="nav-new-chat"
            onClick={() => onNewChat && onNewChat()}
            className={`w-full flex items-center ${collapsed ? 'justify-center px-0' : 'gap-3 px-4'} py-2.5 rounded-xl text-brand-textMuted bg-transparent hover:text-brand-textMain hover:bg-[color:var(--brand-hover)] transition-all duration-200 text-sm font-semibold mb-1 select-none cursor-pointer`}
          >
            <Plus className="w-4 h-4 flex-shrink-0 text-brand-highlight-text" />
            {!collapsed && <span>New chat</span>}
          </button>

          <button
            data-testid="nav-search"
            onClick={onOpenSearch}
            className={`w-full flex items-center ${collapsed ? 'justify-center px-0' : 'gap-3 px-4'} py-2 rounded-lg text-brand-textMuted bg-transparent hover:text-brand-textMain hover:bg-[color:var(--brand-hover)] transition-all duration-200 text-sm font-medium mb-0.5 select-none cursor-pointer`}
          >
            <Search className="w-4 h-4 flex-shrink-0" />
            {!collapsed && <span>Search</span>}
          </button>

          {renderNavItem('scheduled', 'Scheduled', Clock)}
          {renderNavItem('tasks', 'Tasks', KanbanSquare)}
          {renderNavItem('companion', 'Companion', PawPrint)}
          {/* 3D Studio stays discoverable even when disabled: a "ghost" entry
              (muted + "Off") routes to the 3D settings so first-time users can
              enable it, instead of the entry vanishing entirely. */}
          {renderNavItem(showStudio ? 'studio' : 'studio-settings', '3D Studio', Box, {
            locked: !showStudio,
          })}
        </div>

        {/* ── PROJECTS Section ── */}
        {!collapsed && (
          <div className="mb-4">
            {/* Section header */}
            <div className="flex items-center justify-between px-1 py-2 mb-1 select-none">
              <span className="ui-eyebrow">
                Projects
              </span>
              <button
                onClick={onCreateProjectClick}
                className="text-brand-textMuted/60 hover:text-brand-textMain p-1 rounded-md hover:bg-[color:var(--brand-hover)] transition-all duration-150 cursor-pointer"
                title="New Project"
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Project list */}
            <div className="flex flex-col gap-0.5">
              {projects.map((proj) => {
                const isExpanded = !collapsedProjects[proj.name];
                const isProjectActive = activeProject === proj.name && activeTab === 'trajectory';
                const projectChats = chats.filter((c) => c.project === proj.name).sort(sortChatsChronologically);
                const isMenuOpen = openMenuProject === proj.name;

                return (
                  <div key={proj.name} className="flex flex-col">
                    {/* ── Project row ── */}
                    <div
                      data-testid={`project-item-${proj.name}`}
                      className={`group relative flex items-center gap-1 px-2 py-1.5 rounded-lg text-sm transition-all duration-150 cursor-pointer select-none ${
                        isProjectActive && !activeChatId
                          ? 'text-brand-textMain bg-[color:var(--brand-hover)]'
                          : 'text-brand-textMuted hover:text-brand-textMain hover:bg-[color:var(--brand-hover)]'
                      }`}
                    >
                      {/* Collapse toggle chevron */}
                      <button
                        onClick={() => toggleProjectCollapse(proj.name)}
                        className="flex-shrink-0 w-5 h-5 flex items-center justify-center rounded hover:bg-[color:var(--brand-hover-strong)] transition-colors text-brand-textMuted/60 hover:text-brand-textMain"
                      >
                        {isExpanded
                          ? <ChevronDown className="w-3 h-3" />
                          : <ChevronRight className="w-3 h-3" />
                        }
                      </button>

                      {/* Project icon + name */}
                      <div
                        onClick={() => {
                          if (onSelectProject) onSelectProject(proj.name);
                          onSelectTab('trajectory');
                        }}
                        className="flex items-center gap-2 flex-1 overflow-hidden"
                      >
                        <FileText className={`w-3.5 h-3.5 flex-shrink-0 ${isProjectActive && !activeChatId ? 'text-brand-textMain' : 'text-brand-textMuted/70'}`} />
                        <span className="truncate font-medium text-[13px]">{proj.name}</span>
                      </div>

                      {/* Hover action buttons: new chat + context menu */}
                      <div className="hidden group-hover:flex items-center gap-0.5 flex-shrink-0" ref={isMenuOpen ? menuRef : undefined}>
                        {/* New chat in this project */}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            if (onNewChatInProject) onNewChatInProject(proj.name);
                          }}
                          className="w-6 h-6 flex items-center justify-center rounded hover:bg-[color:var(--brand-hover-strong)] text-brand-textMuted hover:text-brand-textMain transition-colors"
                          title={`New chat in ${proj.name}`}
                        >
                          <SquarePen className="w-3.5 h-3.5" />
                        </button>

                        {/* "..." context menu */}
                        <div className="relative">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setOpenMenuProject(isMenuOpen ? null : proj.name);
                            }}
                            className="w-6 h-6 flex items-center justify-center rounded hover:bg-[color:var(--brand-hover-strong)] text-brand-textMuted hover:text-brand-textMain transition-colors"
                            title="More options"
                          >
                            <MoreHorizontal className="w-3.5 h-3.5" />
                          </button>

                          {isMenuOpen && (
                            <div
                              ref={menuRef}
                              className="absolute left-0 top-full mt-1 z-50 bg-brand-popover border border-brand-border/60 rounded-lg shadow-xl w-44 overflow-hidden py-1 animate-fade-in"
                            >
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (onNewChatInProject) onNewChatInProject(proj.name);
                                  setOpenMenuProject(null);
                                }}
                                className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-brand-textMuted hover:text-brand-textMain hover:bg-[color:var(--brand-hover)] transition-colors cursor-pointer"
                              >
                                <MessageSquarePlus className="w-3.5 h-3.5" />
                                <span>New chat</span>
                              </button>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (onProjectSettings) onProjectSettings(proj);
                                  else if (onConfigureProject) onConfigureProject(proj);
                                  setOpenMenuProject(null);
                                }}
                                className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-brand-textMuted hover:text-brand-textMain hover:bg-[color:var(--brand-hover)] transition-colors cursor-pointer"
                              >
                                <Settings className="w-3.5 h-3.5" />
                                <span>Project Settings</span>
                              </button>
                              {onDeleteProject && (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    onDeleteProject(proj.name);
                                    setOpenMenuProject(null);
                                  }}
                                  className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-[color:var(--neon-destructive)]/80 hover:text-[color:var(--neon-destructive)] hover:bg-[color:var(--neon-destructive)]/10 transition-colors cursor-pointer"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                  <span>Delete project</span>
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* ── Nested chats under this project ── */}
                    {isExpanded && (
                      <div className="flex flex-col ml-6 mt-0.5 mb-1 gap-0.5 border-l border-brand-border/20 pl-2">
                        {projectChats.length === 0 ? (
                          <div className="text-[11px] text-brand-textMuted/40 px-2 py-1.5 italic">
                            No chats yet
                          </div>
                        ) : (
                          projectChats.map((chat) => {
                            const isChatSelected = activeChatId === chat.id && activeTab === 'trajectory';
                            const isChatRunning = Boolean(chat.isRunning);
                            const queuedCount = chat.queuedCount ?? 0;
                            return (
                              <div
                                key={chat.id}
                                onClick={() => {
                                  if (onSelectProject) onSelectProject(proj.name);
                                  if (onSelectChat) onSelectChat(chat.id);
                                  onSelectTab('trajectory');
                                }}
                                className={`group relative flex items-center justify-between gap-2 px-2 py-1.5 rounded-md text-[12px] transition-all duration-150 cursor-pointer select-none ${
                                  isChatSelected
                                    ? 'text-brand-textMain bg-[color:var(--brand-hover)] font-semibold'
                                    : 'text-brand-textMuted/80 hover:text-brand-textMain hover:bg-[color:var(--brand-hover)]'
                                }`}
                              >
                                {isChatSelected && (
                                  <span className="absolute left-[-10px] top-2 bottom-2 w-[2px] rounded-r-full bg-brand-textMain" />
                                )}
                                {isChatRunning && (
                                  <span className="w-1.5 h-1.5 rounded-full bg-[color:var(--neon-live)] shadow-[0_0_6px_var(--neon-live)] animate-pulse flex-shrink-0" />
                                )}
                                <span className="truncate flex-1 leading-snug">{chat.title}</span>
                                <div className="flex items-center gap-1 flex-shrink-0">
                                  {queuedCount > 0 && (
                                    <span
                                      className="text-[9px] font-semibold px-1 py-px rounded-full bg-[color:var(--brand-hover)] text-brand-textMuted"
                                      title={`${queuedCount} prompt${queuedCount > 1 ? 's' : ''} queued`}
                                    >
                                      +{queuedCount}
                                    </span>
                                  )}
                                  <span className="text-[10px] text-brand-textMuted/40 group-hover:hidden">
                                    {isChatRunning ? 'Working...' : chat.timestamp}
                                  </span>
                                  {onChatSettings && (
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        onChatSettings(chat);
                                      }}
                                      className="opacity-0 group-hover:opacity-100 w-5 h-5 flex items-center justify-center rounded text-brand-textMuted hover:text-brand-textMain hover:bg-[color:var(--brand-hover)] transition-all cursor-pointer"
                                      title="Chat Settings"
                                    >
                                      <Settings className="w-3 h-3" />
                                    </button>
                                  )}
                                  {onDeleteChat && (
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        onDeleteChat(chat.id);
                                      }}
                                      className="opacity-0 group-hover:opacity-100 w-5 h-5 flex items-center justify-center rounded text-brand-textMuted hover:text-[color:var(--neon-destructive)] hover:bg-[color:var(--neon-destructive)]/10 transition-all cursor-pointer"
                                      title="Delete Chat"
                                    >
                                      <Trash2 className="w-3 h-3" />
                                    </button>
                                  )}
                                </div>
                              </div>
                            );
                          })
                        )}
                      </div>
                    )}
                  </div>
                );
              })}

              {projects.length === 0 && (
                <button
                  onClick={onCreateProjectClick}
                  className="flex items-center gap-2 px-3 py-2 text-xs text-brand-textMuted/60 hover:text-brand-textMain hover:bg-[color:var(--brand-hover)] rounded-lg transition-all cursor-pointer w-full border border-dashed border-brand-border/30 hover:border-brand-border-strong mt-1"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Create your first project</span>
                </button>
              )}
            </div>
          </div>
        )}

        {/* ── CHATS Section (standalone chats) ── */}
        {!collapsed && (
          <div className="mb-6">
            <div
              className="flex items-center justify-between px-1 py-2 mb-1 select-none cursor-pointer group"
              onClick={() => setChatsCollapsed(!chatsCollapsed)}
            >
              <span className="ui-eyebrow group-hover:text-brand-textMuted transition-colors">
                Chats
              </span>
              <span className="text-brand-textMuted/40">
                {chatsCollapsed
                  ? <ChevronRight className="w-3 h-3" />
                  : <ChevronDown className="w-3 h-3" />
                }
              </span>
            </div>

            {!chatsCollapsed && (
              <div className="flex flex-col gap-0.5">
                {standaloneChats.map((chat) => {
                  const isSelected = activeChatId === chat.id && activeTab === 'trajectory';
                  const isChatRunning = Boolean(chat.isRunning);
                  const queuedCount = chat.queuedCount ?? 0;
                  return (
                    <div
                      key={chat.id}
                      data-testid={`chat-item-${chat.title.replace(/\s+/g, '-')}`}
                      className={`group relative flex items-center justify-between gap-2 px-3 py-2 rounded-lg text-[13px] transition-all duration-150 cursor-pointer select-none ${
                        isSelected
                          ? 'text-brand-textMain bg-[color:var(--brand-hover)] font-semibold'
                          : 'text-brand-textMuted/80 hover:text-brand-textMain hover:bg-[color:var(--brand-hover)]'
                      }`}
                      onClick={() => {
                        if (onSelectChat) onSelectChat(chat.id);
                        onSelectTab('trajectory');
                      }}
                    >
                      {isSelected && (
                        <span className="absolute left-0 top-2 bottom-2 w-1 rounded-r-md bg-brand-textMain" />
                      )}
                      {isChatRunning && (
                        <span className="w-1.5 h-1.5 rounded-full bg-[color:var(--neon-live)] shadow-[0_0_6px_var(--neon-live)] animate-pulse flex-shrink-0" />
                      )}
                      <span className="truncate flex-1">{chat.title}</span>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        {queuedCount > 0 && (
                          <span
                            className="text-[9px] font-semibold px-1 py-px rounded-full bg-[color:var(--brand-hover)] text-brand-textMuted"
                            title={`${queuedCount} prompt${queuedCount > 1 ? 's' : ''} queued`}
                          >
                            +{queuedCount}
                          </span>
                        )}
                        <span className="text-[10px] text-brand-textMuted/40 group-hover:hidden">
                          {isChatRunning ? 'Working...' : chat.timestamp}
                        </span>
                        {onStandaloneChatSettings && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              onStandaloneChatSettings(chat);
                            }}
                            className="opacity-0 group-hover:opacity-100 w-5 h-5 flex items-center justify-center rounded text-brand-textMuted hover:text-brand-textMain hover:bg-[color:var(--brand-hover)] transition-all cursor-pointer"
                            title="Chat Settings"
                          >
                            <Settings className="w-3 h-3" />
                          </button>
                        )}
                        {onDeleteChat && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              onDeleteChat(chat.id);
                            }}
                            className="opacity-0 group-hover:opacity-100 w-5 h-5 flex items-center justify-center rounded text-brand-textMuted hover:text-[color:var(--neon-destructive)] hover:bg-[color:var(--brand-hover)] transition-all cursor-pointer"
                            title="Delete Chat"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}

                {standaloneChats.length === 0 && (
                  <div className="text-[11px] text-brand-textMuted/40 px-3 py-2 italic">
                    No active chats.
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Footer: Settings + Collapse toggle */}
      <div className={`flex ${collapsed ? 'flex-col gap-2' : 'flex-row gap-2'} items-center border-t border-brand-border/40 pt-3 mt-auto`}>
        <button
          data-testid="sidebar-settings-btn"
          onClick={() => {
            onSelectTab('settings');
            if (onProfileClick) onProfileClick();
          }}
          className={`relative flex-1 flex items-center ${collapsed ? 'justify-center px-0' : 'gap-3 px-4'} py-2 rounded-lg transition-all duration-200 text-sm font-medium cursor-pointer ${activeTab === 'settings'
              ? 'text-brand-textMain bg-[color:var(--brand-hover)] border border-brand-border/40 shadow-sm'
              : 'text-brand-textMuted hover:text-brand-textMain hover:bg-[color:var(--brand-hover)]'
            }`}
        >
          {activeTab === 'settings' && (
            <span className="absolute left-0 top-2 bottom-2 w-1 rounded-r-md bg-brand-textMain" />
          )}
          <Settings className={`w-5 h-5 flex-shrink-0 transition-transform duration-200 ${activeTab === 'settings' ? 'scale-110 text-brand-textMain' : ''}`} />
          {!collapsed && <span>Settings</span>}
        </button>
        {onToggleCollapse && (
          <button
            onClick={onToggleCollapse}
            className={`flex items-center justify-center p-2 rounded-lg text-brand-textMuted bg-[color:var(--brand-hover)] border border-brand-border/20 hover:text-brand-textMain hover:bg-[color:var(--brand-hover-strong)] hover:border-brand-border/45 transition-all duration-200 cursor-pointer ${collapsed ? 'w-full' : 'w-9 h-9'}`}
            title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {collapsed ? <ChevronRight className="w-5 h-5" /> : <PanelLeftClose className="w-5 h-5" />}
          </button>
        )}
      </div>
    </div>
  );
};
