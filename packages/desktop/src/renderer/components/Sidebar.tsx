import React, { useState } from 'react';
import { StoredProject, StoredChat } from '../App';

// Inline Custom SVG Outline Icons for maximum reliability in Electron
const PlusIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <path d="M5 12h14M12 5v14"/>
  </svg>
);

const SearchIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>
  </svg>
);

const ClockIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
  </svg>
);

const PlugIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <path d="M12 22v-5M9 8V2M15 8V2M18 8v5a4 4 0 0 1-4 4h-4a4 4 0 0 1-4-4V8Z"/>
  </svg>
);

const FolderIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2z"/>
  </svg>
);

const MessageSquareIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
  </svg>
);

const Trash2Icon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <path d="M3 6h18M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2M10 11v6M14 11v6"/>
  </svg>
);

const ChevronRightIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <polyline points="9 18 15 12 9 6"/>
  </svg>
);

const PanelLeftCloseIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <rect width="18" height="18" x="3" y="3" rx="2" ry="2"/>
    <path d="M9 3v16M16 15l-3-3 3-3"/>
  </svg>
);

const SettingsIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.1a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/>
    <circle cx="12" cy="12" r="3"/>
  </svg>
);

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
        className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-all duration-150 text-sm font-medium mb-0.5 select-none ${
          isActive 
            ? 'text-white bg-white/5 border-l-2 border-purple-500 shadow-sm' 
            : 'text-brand-textMuted hover:text-white hover:bg-white/5'
        }`}
      >
        <IconComponent className="w-4 h-4 flex-shrink-0" />
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
      className="glass-panel border-r border-brand-border flex flex-col p-2.5 h-full box-border transition-all duration-200 z-20"
    >
      {/* Top Windows Navigation Bar — Aligned to exactly match main workspace header height h-12 */}
      {!collapsed && (
        <div className="h-12 border-b border-brand-border flex items-center gap-4 px-2 mb-3 select-none">
          {/* Navigation Arrows */}
          <div className="flex gap-2 text-brand-textMuted text-xs font-mono">
            <span className="cursor-pointer hover:text-white transition-colors">←</span>
            <span className="cursor-pointer hover:text-white transition-colors">→</span>
          </div>
          {/* Window Menu */}
          <div className="flex gap-3 text-brand-textMuted text-[11px] font-semibold">
            <span onClick={() => onMenuClick && onMenuClick('File')} className="cursor-pointer hover:text-white transition-colors">File</span>
            <span onClick={() => onMenuClick && onMenuClick('Edit')} className="cursor-pointer hover:text-white transition-colors">Edit</span>
            <span onClick={() => onMenuClick && onMenuClick('View')} className="cursor-pointer hover:text-white transition-colors">View</span>
            <span onClick={() => onMenuClick && onMenuClick('Help')} className="cursor-pointer hover:text-white transition-colors">Help</span>
          </div>
        </div>
      )}

      {/* Main navigation list */}
      <div className="flex-1 overflow-y-auto pr-0.5 custom-scrollbar">
        {/* Core items */}
        <div className="mb-4">
          <button
            data-testid="nav-new-chat"
            onClick={onNewChat || (() => onSelectTab('trajectory'))}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-white bg-gradient-to-r from-purple-600/10 to-indigo-600/10 border border-purple-500/20 hover:border-purple-500/55 hover:from-purple-600/25 hover:to-indigo-600/25 transition-all duration-150 text-sm font-semibold mb-2 select-none cursor-pointer"
          >
            <PlusIcon className="w-4 h-4 flex-shrink-0 text-purple-400" />
            {!collapsed && <span>New chat</span>}
          </button>

          <button
            data-testid="nav-search"
            onClick={onOpenSearch}
            className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-brand-textMuted hover:text-white hover:bg-white/5 transition-all duration-150 text-sm font-medium mb-0.5 select-none cursor-pointer"
          >
            <SearchIcon className="w-4 h-4 flex-shrink-0" />
            {!collapsed && <span>Search</span>}
          </button>

          {renderNavItem('scheduled', 'Scheduled', ClockIcon)}
          {renderNavItem('plugins', 'Plugins', PlugIcon)}
        </div>

        {/* Projects Section */}
        {!collapsed && (
          <div className="mb-4">
            <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-brand-textMuted/70 px-3 py-2 select-none">
              <span 
                className="cursor-pointer hover:text-white flex items-center gap-1.5"
                onClick={() => setProjectsCollapsed(!projectsCollapsed)}
              >
                <span>Projects</span>
                <span className="text-[9px]">{projectsCollapsed ? '▶' : '▼'}</span>
              </span>
              <button 
                onClick={onCreateProjectClick}
                className="text-brand-textMuted hover:text-white p-0.5 rounded hover:bg-white/5 transition-colors"
                title="Create Project"
              >
                <PlusIcon className="w-3.5 h-3.5" />
              </button>
            </div>

            {!projectsCollapsed && (
              <div className="flex flex-col">
                {projects.map((proj) => {
                  const isSelected = activeProject === proj.name && activeTab === 'trajectory';
                  return (
                    <div
                      key={proj.name}
                      data-testid={`project-item-${proj.name}`}
                      className={`group flex items-center justify-between gap-2 px-3 py-2 rounded-lg text-sm transition-all duration-150 cursor-pointer mb-0.5 ${
                        isSelected 
                          ? 'text-white bg-white/5 border-l-2 border-indigo-500 shadow-sm' 
                          : 'text-brand-textMuted hover:text-white hover:bg-white/5'
                      }`}
                    >
                      <div 
                        onClick={() => {
                          if (onSelectProject) onSelectProject(proj.name);
                          onSelectTab('trajectory');
                        }}
                        className="flex items-center gap-2.5 overflow-hidden flex-1"
                      >
                        <FolderIcon className="w-3.5 h-3.5 flex-shrink-0 text-brand-textMuted" />
                        <span className="truncate font-medium">{proj.name}</span>
                      </div>
                      
                      {/* Delete project button on hover */}
                      {onDeleteProject && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onDeleteProject(proj.name);
                          }}
                          className="opacity-0 group-hover:opacity-100 text-brand-textMuted hover:text-red-400 p-0.5 rounded hover:bg-white/5 transition-all"
                          title="Delete Project"
                        >
                          <Trash2Icon className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  );
                })}
                {projects.length === 0 && (
                  <div className="text-xs text-brand-textMuted/50 px-3 py-2 italic">
                    No projects. Click + to add.
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Chats Section */}
        {!collapsed && (
          <div className="mb-4">
            <div 
              className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-brand-textMuted/70 px-3 py-2 select-none cursor-pointer hover:text-white"
              onClick={() => setChatsCollapsed(!chatsCollapsed)}
            >
              <span>Chats</span>
              <span className="text-[9px]">{chatsCollapsed ? '▶' : '▼'}</span>
            </div>

            {!chatsCollapsed && (
              <div className="flex flex-col">
                {chats.map((chat) => {
                  const isSelected = activeChatId === chat.id && activeTab === 'trajectory';
                  return (
                    <div
                      key={chat.id}
                      data-testid={`chat-item-${chat.title.replace(/\s+/g, '-')}`}
                      className={`group flex items-center justify-between gap-2 px-3 py-2 rounded-lg text-sm transition-all duration-150 cursor-pointer mb-0.5 ${
                        isSelected 
                          ? 'text-white bg-white/5 border-l-2 border-indigo-400 shadow-sm' 
                          : 'text-brand-textMuted hover:text-white hover:bg-white/5'
                      }`}
                    >
                      <div 
                        onClick={() => {
                          if (onSelectChat) onSelectChat(chat.id);
                        }}
                        className="flex items-center gap-2.5 overflow-hidden flex-1"
                      >
                        <MessageSquareIcon className="w-3.5 h-3.5 flex-shrink-0 text-brand-textMuted" />
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
                            className="opacity-0 group-hover:opacity-100 text-brand-textMuted hover:text-red-400 p-0.5 rounded hover:bg-white/5 transition-all"
                            title="Delete Chat"
                          >
                            <Trash2Icon className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
                {chats.length === 0 && (
                  <div className="text-xs text-brand-textMuted/50 px-3 py-2 italic">
                    No active chats.
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Settings Footer & Collapse button placed side-by-side for clean horizontal layout */}
      <div className={`flex ${collapsed ? 'flex-col gap-1' : 'flex-row gap-2'} items-center border-t border-brand-border/40 pt-2.5 mt-auto`}>
        <button
          data-testid="sidebar-settings-btn"
          onClick={() => {
            onSelectTab('settings');
            if (onProfileClick) onProfileClick(); // call profile click callback for test expectations
          }}
          className={`w-full flex items-center justify-start gap-3 px-3 py-2 rounded-lg transition-colors duration-150 text-sm font-medium ${
            activeTab === 'settings' 
              ? 'text-white bg-white/5 border-l-2 border-purple-500 shadow-sm' 
              : 'text-brand-textMuted hover:text-white hover:bg-white/5'
          }`}
        >
          <SettingsIcon className="w-4.5 h-4.5 flex-shrink-0" />
          {!collapsed && <span>Settings</span>}
        </button>
        {onToggleCollapse && (
          <button
            onClick={onToggleCollapse}
            className={`flex items-center justify-center p-2 rounded-lg text-brand-textMuted hover:text-white hover:bg-white/5 transition-all duration-150 cursor-pointer ${collapsed ? 'w-full' : ''}`}
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {collapsed ? <ChevronRightIcon className="w-4.5 h-4.5" /> : <PanelLeftCloseIcon className="w-4.5 h-4.5" />}
          </button>
        )}
      </div>
    </div>
  );
};
