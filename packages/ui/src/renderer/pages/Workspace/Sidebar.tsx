import React, { useState, useRef, useEffect } from 'react';
import { StoredProject, StoredChat } from '../../types';
import {
  Plus,
  Search,
  Clock,
  Trash2,
  ChevronRight,
  ChevronDown,
  Settings,
  Folder,
  SquarePen,
  MoreHorizontal,
  MessageSquarePlus,
  PawPrint,
  KanbanSquare,
  Package,
  X,
  Pin,
  Mail,
} from 'lucide-react';
import { BrandLogo } from '../../BrandLogo';
import { ChatTitleService } from '../../services/ChatTitleService';

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
  onPinChat?: (id: string) => void;
  onMarkUnreadChat?: (id: string) => void;
  activeChatId?: string | null;
  /** When true, the sidebar is shown as an off-canvas drawer on small screens. */
  mobileOpen?: boolean;
  /** Invoked to request closing the mobile drawer. */
  onMobileClose?: () => void;
  /** When true, the dedicated 3D Workspace nav entry is shown. */
  showStudio?: boolean;
}

/**
 * Collapsible sidebar with Apple & Claude-like soft editorial aesthetic,
 * fluid micro-animations, adaptive responsive layout, and direct new chat actions.
 */
export const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  onSelectTab,
  collapsed = false,
  activeProject = '',
  onSelectProject,
  onOpenSearch,
  onNewChat,
  onNewChatInProject,
  onProfileClick,
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
  onPinChat,
  onMarkUnreadChat,
  activeChatId = null,
  mobileOpen = false,
  onMobileClose,
}) => {
  // Project folder expanded state: collapsed by default, saved in localStorage
  const STORAGE_KEY_EXPANDED_PROJECTS = 'superagent_sidebar_expanded_projects';
  const [expandedProjects, setExpandedProjects] = useState<Record<string, boolean>>(() => {
    try {
      if (typeof localStorage !== 'undefined') {
        const saved = localStorage.getItem(STORAGE_KEY_EXPANDED_PROJECTS);
        if (saved) return JSON.parse(saved);
      }
    } catch {
      // Fallback
    }
    return {};
  });
  const [chatsCollapsed, setChatsCollapsed] = useState(false);
  
  // Track which project's "..." menu is open
  const [openMenuProject, setOpenMenuProject] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Track which chat's "..." menu is open
  const [openMenuChat, setOpenMenuChat] = useState<string | null>(null);
  const chatMenuRef = useRef<HTMLDivElement>(null);

  // Track local pinned and unread state for chats with localStorage persistence
  const STORAGE_KEY_PINNED_CHATS = 'superagent_sidebar_pinned_chats';
  const STORAGE_KEY_UNREAD_CHATS = 'superagent_sidebar_unread_chats';

  const [pinnedChatIds, setPinnedChatIds] = useState<Set<string>>(() => {
    try {
      if (typeof localStorage !== 'undefined') {
        const saved = localStorage.getItem(STORAGE_KEY_PINNED_CHATS);
        if (saved) return new Set(JSON.parse(saved));
      }
    } catch {
      // Fallback
    }
    return new Set();
  });

  const [unreadChatIds, setUnreadChatIds] = useState<Set<string>>(() => {
    try {
      if (typeof localStorage !== 'undefined') {
        const saved = localStorage.getItem(STORAGE_KEY_UNREAD_CHATS);
        if (saved) return new Set(JSON.parse(saved));
      }
    } catch {
      // Fallback
    }
    return new Set();
  });

  // Maximum initial chats displayed per list section before "Show more"
  const MAX_INITIAL_CHATS = 5;
  const [showAllStandaloneChats, setShowAllStandaloneChats] = useState(false);
  const [expandedProjectChats, setExpandedProjectChats] = useState<Record<string, boolean>>({});

  // Sort helper to order chats chronologically (newest first, pinned chats first)
  const parseChatTime = (chat: StoredChat): number => {
    if (chat.startedAt && typeof chat.startedAt === 'number') {
      return chat.startedAt;
    }
    if (chat.createdAt && typeof chat.createdAt === 'number') {
      return chat.createdAt;
    }
    if (chat.updatedAt && typeof chat.updatedAt === 'number') {
      return chat.updatedAt;
    }
    if (chat.timestamp != null) {
      if (typeof chat.timestamp === 'number') {
        return chat.timestamp;
      }
      const tsStr = String(chat.timestamp).trim();
      if (!tsStr) return 0;
      if (tsStr.toLowerCase() === 'just now') {
        return Date.now();
      }
      const dateParsed = Date.parse(tsStr);
      if (!isNaN(dateParsed)) {
        return dateParsed;
      }
      const match = tsStr.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
      if (match) {
        const day = parseInt(match[1], 10);
        const month = parseInt(match[2], 10) - 1;
        const year = parseInt(match[3], 10);
        return new Date(year, month, day).getTime();
      }
    }
    return 0;
  };

  /** Converts chat timestamps into compact relative times (e.g. 26m, 2h, 5d, 3w, 2mo, 1y). */
  const formatRelativeTime = (chat: StoredChat): string => {
    const timeMs = parseChatTime(chat);
    if (!timeMs) {
      return typeof chat.timestamp === 'string' && chat.timestamp ? chat.timestamp : '1m';
    }

    const diffMs = Date.now() - timeMs;
    if (diffMs <= 0) {
      return '1m';
    }

    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 1) {
      return '1m';
    }
    if (diffMins < 60) {
      return `${diffMins}m`;
    }
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) {
      return `${diffHours}h`;
    }
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays < 7) {
      return `${diffDays}d`;
    }
    const diffWeeks = Math.floor(diffDays / 7);
    if (diffWeeks < 4) {
      return `${diffWeeks}w`;
    }
    const diffMonths = Math.floor(diffDays / 30);
    if (diffMonths < 12) {
      return `${diffMonths}mo`;
    }
    const diffYears = Math.floor(diffDays / 365);
    return `${diffYears}y`;
  };

  const isChatPinned = (chat: StoredChat): boolean => {
    return chat.pinned === true || pinnedChatIds.has(chat.id);
  };

  const isChatUnread = (chat: StoredChat): boolean => {
    return chat.unread === true || unreadChatIds.has(chat.id);
  };

  const togglePinChat = (chatId: string) => {
    setPinnedChatIds((prev) => {
      const next = new Set(prev);
      if (next.has(chatId)) next.delete(chatId);
      else next.add(chatId);
      try {
        if (typeof localStorage !== 'undefined') {
          localStorage.setItem(STORAGE_KEY_PINNED_CHATS, JSON.stringify(Array.from(next)));
        }
      } catch {
        // Fallback
      }
      return next;
    });
    onPinChat?.(chatId);
  };

  const toggleUnreadChat = (chatId: string) => {
    setUnreadChatIds((prev) => {
      const next = new Set(prev);
      if (next.has(chatId)) next.delete(chatId);
      else next.add(chatId);
      try {
        if (typeof localStorage !== 'undefined') {
          localStorage.setItem(STORAGE_KEY_UNREAD_CHATS, JSON.stringify(Array.from(next)));
        }
      } catch {
        // Fallback
      }
      return next;
    });
    onMarkUnreadChat?.(chatId);
  };

  const handleDeleteChatClick = (chatId: string) => {
    setPinnedChatIds((prev) => {
      if (!prev.has(chatId)) return prev;
      const next = new Set(prev);
      next.delete(chatId);
      try {
        if (typeof localStorage !== 'undefined') {
          localStorage.setItem(STORAGE_KEY_PINNED_CHATS, JSON.stringify(Array.from(next)));
        }
      } catch {}
      return next;
    });
    setUnreadChatIds((prev) => {
      if (!prev.has(chatId)) return prev;
      const next = new Set(prev);
      next.delete(chatId);
      try {
        if (typeof localStorage !== 'undefined') {
          localStorage.setItem(STORAGE_KEY_UNREAD_CHATS, JSON.stringify(Array.from(next)));
        }
      } catch {}
      return next;
    });
    onDeleteChat?.(chatId);
  };

  const sortChatsChronologically = (a: StoredChat, b: StoredChat): number => {
    const aPinned = isChatPinned(a) ? 1 : 0;
    const bPinned = isChatPinned(b) ? 1 : 0;
    if (aPinned !== bPinned) {
      return bPinned - aPinned;
    }
    return parseChatTime(b) - parseChatTime(a);
  };

  // Deduplicate projects by case-insensitive name
  const uniqueProjects = React.useMemo(() => {
    return (projects || []).reduce<StoredProject[]>((acc, proj) => {
      const cleanName = (proj.name || '').trim();
      if (cleanName && !acc.some((p) => (p.name || '').trim().toLowerCase() === cleanName.toLowerCase())) {
        acc.push(proj);
      }
      return acc;
    }, []);
  }, [projects]);

  // Deduplicate chats by ID
  const uniqueChats = React.useMemo(() => {
    return (chats || []).reduce<StoredChat[]>((acc, chat) => {
      const cleanId = (chat.id || '').trim();
      if (cleanId && !acc.some((c) => (c.id || '').trim() === cleanId)) {
        acc.push(chat);
      }
      return acc;
    }, []);
  }, [chats]);

  // Standalone chats = chats not linked to any known project, sorted chronologically (pinned first)
  const standaloneChats = uniqueChats
    .filter((chat) => !chat.project || !uniqueProjects.some((p) => (p.name || '').trim().toLowerCase() === (chat.project || '').trim().toLowerCase()))
    .sort(sortChatsChronologically);

  const toggleProjectCollapse = (name: string) => {
    setExpandedProjects((prev) => {
      const next = { ...prev, [name]: !prev[name] };
      try {
        localStorage.setItem(STORAGE_KEY_EXPANDED_PROJECTS, JSON.stringify(next));
      } catch {
        // Fallback
      }
      return next;
    });
  };

  // Auto-expand list if active chat is positioned beyond initial 5 items
  useEffect(() => {
    if (!activeChatId) return;
    const standaloneIndex = standaloneChats.findIndex((c) => c.id === activeChatId);
    if (standaloneIndex >= MAX_INITIAL_CHATS) {
      setShowAllStandaloneChats(true);
    }
    uniqueProjects.forEach((proj) => {
      const projChats = uniqueChats
        .filter((c) => (c.project || '').trim().toLowerCase() === (proj.name || '').trim().toLowerCase())
        .sort(sortChatsChronologically);
      const projIndex = projChats.findIndex((c) => c.id === activeChatId);
      if (projIndex >= MAX_INITIAL_CHATS) {
        setExpandedProjectChats((prev) => ({ ...prev, [proj.name]: true }));
      }
    });
  }, [activeChatId, uniqueChats, uniqueProjects]);

  // Close menus when clicking outside
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpenMenuProject(null);
      }
      if (chatMenuRef.current && !chatMenuRef.current.contains(e.target as Node)) {
        setOpenMenuChat(null);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, []);

  const renderNavItem = (
    id: string,
    label: string,
    IconComponent: React.ComponentType<{ className?: string }>,
    opts?: { locked?: boolean; badge?: string }
  ) => {
    const isActive = activeTab === id;
    const locked = opts?.locked ?? false;
    return (
      <button
        type="button"
        data-testid={`nav-item-${id}`}
        onClick={() => {
          onSelectTab(id);
          onMobileClose?.();
        }}
        title={collapsed ? label : locked ? `${label} is off — open Settings to enable it` : undefined}
        className={`relative w-full flex items-center ${
          collapsed ? 'justify-center px-0 h-9' : 'gap-3 px-3 py-2'
        } rounded-xl transition-all duration-200 text-xs font-medium mb-0.5 select-none cursor-pointer group ${
          isActive
            ? 'text-brand-textMain bg-brand-card/75 border border-brand-border/60 shadow-2xs font-semibold'
            : locked
            ? 'text-brand-textMuted/40 bg-transparent hover:text-brand-textMain hover:bg-[color:var(--brand-hover)]'
            : 'text-brand-textMuted bg-transparent hover:text-brand-textMain hover:bg-[color:var(--brand-hover)]'
        }`}
      >
        {isActive && !collapsed && (
          <span className="absolute left-1 top-2 bottom-2 w-1 rounded-full bg-[color:var(--brand-accent)] shadow-[0_0_6px_var(--brand-accent-glow)]" />
        )}
        <IconComponent
          className={`w-4 h-4 shrink-0 transition-transform duration-200 ${
            isActive ? 'scale-105 text-brand-textMain' : 'text-brand-textMuted group-hover:text-brand-textMain'
          }`}
        />
        {!collapsed && <span className="truncate">{label}</span>}
        {opts?.badge && !collapsed && (
          <span className="ml-auto text-[10px] font-mono px-1.5 py-0.5 rounded-full bg-[color:var(--brand-hover)] text-brand-textMuted/70 border border-brand-border/40">
            {opts.badge}
          </span>
        )}
        {locked && !collapsed && (
          <span className="ml-auto text-[9px] font-semibold uppercase tracking-wider text-brand-textMuted/40">
            Off
          </span>
        )}
      </button>
    );
  };

  /**
   * Renders a single chat row (for both standalone and project-nested chats)
   * with the title on the left and the time / 3-dot menu aligned to the maximum right
   * in the exact same position.
   */
  const renderChatRow = (chat: StoredChat, isNestedInProject = false) => {
    const isSelected = activeChatId === chat.id && activeTab === 'trajectory';
    const isChatRunning = Boolean(chat.isRunning);
    const queuedCount = chat.queuedCount ?? 0;
    const isPinned = isChatPinned(chat);
    const isUnread = isChatUnread(chat);
    const isMenuOpen = openMenuChat === chat.id;

    return (
      <div
        key={`chat-${chat.id}`}
        data-testid={`chat-item-${chat.title.replace(/\s+/g, '-')}`}
        className={`group relative flex items-center justify-between gap-2 ${
          isNestedInProject ? 'px-2.5 py-1.5' : 'px-3 py-2'
        } rounded-xl text-xs transition-all duration-150 cursor-pointer select-none ${
          isSelected
            ? 'text-brand-textMain bg-brand-card/75 border border-brand-border/60 shadow-2xs font-medium'
            : 'text-brand-textMuted/80 hover:text-brand-textMain hover:bg-[color:var(--brand-hover)]'
        }`}
        onClick={() => {
          if (unreadChatIds.has(chat.id)) {
            setUnreadChatIds((prev) => {
              const next = new Set(prev);
              next.delete(chat.id);
              try {
                if (typeof localStorage !== 'undefined') {
                  localStorage.setItem(STORAGE_KEY_UNREAD_CHATS, JSON.stringify(Array.from(next)));
                }
              } catch {}
              return next;
            });
          }
          if (onSelectChat) onSelectChat(chat.id);
          onSelectTab('trajectory');
          onMobileClose?.();
        }}
      >
        {isSelected && (
          <span
            className={`absolute ${
              isNestedInProject ? 'left-[-11px] top-1.5 bottom-1.5 w-[2px]' : 'left-1 top-2 bottom-2 w-1'
            } rounded-full bg-[color:var(--brand-accent)] shadow-[0_0_6px_var(--brand-accent-glow)]`}
          />
        )}

        {/* Left Side: Status Dot / Pin Icon + Title (Truncated) */}
        <div className="flex items-center gap-1.5 min-w-0 flex-1">
          {isChatRunning && (
            <span className="w-1.5 h-1.5 rounded-full bg-[color:var(--neon-live)] shadow-[0_0_8px_var(--neon-live)] animate-pulse shrink-0" />
          )}
          {isUnread && !isChatRunning && (
            <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 shrink-0" title="Unread" />
          )}
          {isPinned && (
            <Pin className="w-3 h-3 text-brand-accent shrink-0 -rotate-45" title="Pinned" />
          )}
          <span className="truncate text-[12.5px] leading-snug">{ChatTitleService.sanitizeTitle(chat.title)}</span>
        </div>

        {/* Right Side: Position of Time & 3-dot are EXACTLY the same, flush to maximum right */}
        <div
          className="flex items-center justify-end shrink-0 w-8 h-6 relative"
          ref={isMenuOpen ? chatMenuRef : undefined}
        >
          {queuedCount > 0 && (
            <span
              className="text-[9px] font-semibold px-1.5 py-px rounded-full bg-[color:var(--brand-hover)] text-brand-textMuted mr-1"
              title={`${queuedCount} prompt${queuedCount > 1 ? 's' : ''} queued`}
            >
              +{queuedCount}
            </span>
          )}

          {/* Time display: visible in normal state, transforms into 3-dot on hover or when menu is open */}
          <span
            className={`text-[10.5px] text-brand-textMuted/50 font-mono text-right truncate transition-opacity ${
              isMenuOpen ? 'hidden' : 'group-hover:hidden'
            }`}
          >
            {isChatRunning ? '...' : formatRelativeTime(chat)}
          </span>

          {/* Three-dot button: appears in exact same spot on hover or when menu is open */}
          <button
            type="button"
            data-testid={`chat-menu-btn-${chat.id}`}
            onClick={(e) => {
              e.stopPropagation();
              setOpenMenuChat(isMenuOpen ? null : chat.id);
            }}
            className={`w-6 h-6 flex items-center justify-center rounded-md text-brand-textMuted hover:text-brand-textMain hover:bg-[color:var(--brand-hover-strong)] transition-all cursor-pointer ${
              isMenuOpen ? 'flex text-brand-textMain bg-[color:var(--brand-hover-strong)]' : 'hidden group-hover:flex'
            }`}
            title="Chat options"
            aria-label="Chat options"
          >
            <MoreHorizontal className="w-3.5 h-3.5" />
          </button>

          {/* Dropdown Menu: Pin, Mark as unread, Settings, Delete */}
          {isMenuOpen && (
            <div
              ref={chatMenuRef}
              className="absolute right-0 top-full mt-1 z-50 bg-brand-popover border border-brand-border/70 rounded-xl shadow-xl w-44 overflow-hidden py-1 backdrop-blur-xl animate-fade-in"
            >
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  togglePinChat(chat.id);
                  setOpenMenuChat(null);
                }}
                className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-brand-textMuted hover:text-brand-textMain hover:bg-[color:var(--brand-hover)] transition-colors cursor-pointer"
              >
                <Pin className="w-3.5 h-3.5" />
                <span>{isPinned ? 'Unpin chat' : 'Pin chat'}</span>
              </button>

              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  toggleUnreadChat(chat.id);
                  setOpenMenuChat(null);
                }}
                className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-brand-textMuted hover:text-brand-textMain hover:bg-[color:var(--brand-hover)] transition-colors cursor-pointer"
              >
                <Mail className="w-3.5 h-3.5" />
                <span>{isUnread ? 'Mark as read' : 'Mark as unread'}</span>
              </button>

              {(onStandaloneChatSettings || onChatSettings) && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (onStandaloneChatSettings) onStandaloneChatSettings(chat);
                    else if (onChatSettings) onChatSettings(chat);
                    setOpenMenuChat(null);
                  }}
                  className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-brand-textMuted hover:text-brand-textMain hover:bg-[color:var(--brand-hover)] transition-colors cursor-pointer"
                >
                  <Settings className="w-3.5 h-3.5" />
                  <span>Chat Settings</span>
                </button>
              )}

              {onDeleteChat && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDeleteChatClick(chat.id);
                    setOpenMenuChat(null);
                  }}
                  className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 transition-colors cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Delete chat</span>
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <aside
      data-testid="sidebar-container"
      style={{ width: collapsed ? '68px' : '260px' }}
      className={`flex flex-col h-full box-border select-none z-50 lg:z-auto bg-[color:var(--brand-bg)]  shadow-soft
        fixed inset-y-0 left-0 lg:static transition-[width,transform] duration-200 ease-out
        ${collapsed ? 'lg:w-[68px]' : 'lg:w-[260px]'}
        ${mobileOpen ? 'translate-x-0 w-[285px] max-w-[85vw] shadow-2xl' : '-translate-x-full lg:translate-x-0 w-[285px] max-w-[85vw]'}`}
    >
      {/* ── Mobile-Only Header Area (Desktop header is provided by TitleBar, avoiding duplicate logo & collapse) ── */}
      <div className="lg:hidden flex items-center justify-between px-3.5 pt-3 pb-2.5 mb-1 shrink-0 border-b border-brand-border/40">
        <div className="flex items-center gap-2.5 text-brand-textMain font-semibold text-sm">
          <BrandLogo size={22} />
          <span className="font-outfit font-bold tracking-tight text-[15px] bg-gradient-to-r from-brand-textMain to-brand-textMuted bg-clip-text text-transparent">
            SuperAgent
          </span>
        </div>
        {onMobileClose && (
          <button
            type="button"
            onClick={onMobileClose}
            className="w-7 h-7 flex items-center justify-center rounded-lg text-brand-textMuted hover:text-brand-textMain hover:bg-[color:var(--brand-hover-strong)] transition-colors cursor-pointer"
            title="Close sidebar"
            aria-label="Close sidebar"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* ── Main Scrollable Area ── */}
      <div className="flex-1 overflow-y-auto px-2 pt-2 sidebar-scroll">
        {/* Core Actions: New Chat & Navigation */}
        <div className="mb-3 space-y-1">
          {/* Prominent "New chat" button (Claude & Apple soft tactile pill) */}
          <button
            type="button"
            data-testid="nav-new-chat"
            onClick={() => {
              if (onNewChat) onNewChat();
              onMobileClose?.();
            }}
            title={collapsed ? 'New chat' : undefined}
            className={`w-full flex items-center ${
              collapsed ? 'justify-center h-9 px-0' : 'gap-2.5 px-3 py-2'
            } rounded-xl text-brand-textMain bg-brand-card/85 hover:bg-brand-card border border-brand-border/70 hover:border-brand-border-strong/90 shadow-2xs hover:shadow-xs transition-all duration-200 active:scale-[0.98] text-xs font-semibold cursor-pointer group`}
          >
            <div className="w-5 h-5 rounded-md bg-brand-textMain/10 flex items-center justify-center text-brand-textMain group-hover:bg-brand-textMain/15 transition-colors shrink-0">
              <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
            </div>
            {!collapsed && <span>New chat</span>}
          </button>

          {/* Quick Search Item */}
          <button
            type="button"
            data-testid="nav-search"
            onClick={() => {
              if (onOpenSearch) onOpenSearch();
              onMobileClose?.();
            }}
            title={collapsed ? 'Search' : undefined}
            className={`w-full flex items-center ${
              collapsed ? 'justify-center h-9 px-0' : 'gap-3 px-3 py-2'
            } rounded-xl text-brand-textMuted bg-transparent hover:text-brand-textMain hover:bg-[color:var(--brand-hover)] transition-all duration-200 text-xs font-medium cursor-pointer group`}
          >
            <Search className="w-4 h-4 shrink-0 text-brand-textMuted group-hover:text-brand-textMain transition-colors" />
            {!collapsed && <span className="truncate">Search</span>}
          </button>

          {/* Secondary Quick Nav Items */}
          {renderNavItem('tasks', 'Tasks', KanbanSquare)}
          {renderNavItem('scheduled', 'Scheduled', Clock)}
          {renderNavItem('artifacts', 'Artifacts', Package)}
          {renderNavItem('partner', 'Partner', PawPrint)}
        </div>

        {/* ── PROJECTS Section ── */}
        {!collapsed && (
          <div className="mb-4">
            {/* Section Eyebrow Header */}
            <div className="flex items-center justify-between px-2 py-1.5 mb-0.5 select-none">
              <span className="text-[10.5px] font-semibold tracking-wider text-brand-textMuted/50 uppercase font-mono">
                Projects
              </span>
              {onCreateProjectClick && (
                <button
                  type="button"
                  onClick={onCreateProjectClick}
                  className="w-5 h-5 flex items-center justify-center rounded-md text-brand-textMuted/60 hover:text-brand-textMain hover:bg-[color:var(--brand-hover)] transition-all duration-150 cursor-pointer"
                  title="New project"
                  aria-label="New project"
                >
                  <Plus className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Project List */}
            <div className="flex flex-col gap-0.5">
              {uniqueProjects.map((proj, projIdx) => {
                const isExpanded = Boolean(expandedProjects[proj.name]);
                const isProjectActive =
                  (activeProject || '').trim().toLowerCase() === (proj.name || '').trim().toLowerCase() &&
                  activeTab === 'trajectory';
                const projectChats = uniqueChats
                  .filter((c) => (c.project || '').trim().toLowerCase() === (proj.name || '').trim().toLowerCase())
                  .sort(sortChatsChronologically);
                const isMenuOpen = openMenuProject === proj.name;

                return (
                  <div key={`proj-item-${proj.name || 'item'}-${(proj as any).id || projIdx}-${projIdx}`} className="flex flex-col">
                    {/* Project Row */}
                    <div
                      data-testid={`project-item-${proj.name}`}
                      className={`group relative flex items-center gap-1.5 px-2 py-1.5 rounded-xl text-xs transition-all duration-150 cursor-pointer select-none ${
                        isProjectActive && !activeChatId
                          ? 'text-brand-textMain bg-brand-card/75 border border-brand-border/60 shadow-2xs font-medium'
                          : 'text-brand-textMuted hover:text-brand-textMain hover:bg-[color:var(--brand-hover)]'
                      }`}
                    >
                      {/* Expand / Collapse Chevron */}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleProjectCollapse(proj.name);
                        }}
                        className="w-4 h-4 flex items-center justify-center rounded text-brand-textMuted/60 hover:text-brand-textMain transition-colors shrink-0"
                        title={isExpanded ? 'Collapse project' : 'Expand project'}
                      >
                        {isExpanded ? (
                          <ChevronDown className="w-3 h-3 transition-transform duration-200" />
                        ) : (
                          <ChevronRight className="w-3 h-3 transition-transform duration-200" />
                        )}
                      </button>

                      {/* Project Icon + Title */}
                      <div
                        onClick={() => {
                          if (onSelectProject) onSelectProject(proj.name);
                          onSelectTab('trajectory');
                          onMobileClose?.();
                        }}
                        className="flex items-center gap-2 flex-1 overflow-hidden"
                      >
                        <Folder className={`w-3.5 h-3.5 shrink-0 ${isProjectActive && !activeChatId ? 'text-brand-accent' : 'text-brand-textMuted/70'}`} />
                        <span className="truncate font-medium text-[12.5px]">{proj.name}</span>
                      </div>

                      {/* Hover Action Buttons */}
                      <div className="opacity-0 group-hover:opacity-100 transition-opacity duration-150 flex items-center gap-0.5 shrink-0" ref={isMenuOpen ? menuRef : undefined}>
                        {/* New chat in project */}
                        {onNewChatInProject && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onNewChatInProject(proj.name);
                              onMobileClose?.();
                            }}
                            className="w-5 h-5 flex items-center justify-center rounded-md text-brand-textMuted hover:text-brand-textMain hover:bg-[color:var(--brand-hover-strong)] transition-colors cursor-pointer"
                            title={`New chat in ${proj.name}`}
                          >
                            <SquarePen className="w-3 h-3" />
                          </button>
                        )}

                        {/* More options menu */}
                        <div className="relative">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setOpenMenuProject(isMenuOpen ? null : proj.name);
                            }}
                            className="w-5 h-5 flex items-center justify-center rounded-md text-brand-textMuted hover:text-brand-textMain hover:bg-[color:var(--brand-hover-strong)] transition-colors cursor-pointer"
                            title="More options"
                          >
                            <MoreHorizontal className="w-3.5 h-3.5" />
                          </button>

                          {isMenuOpen && (
                            <div
                              ref={menuRef}
                              className="absolute left-0 top-full mt-1 z-50 bg-brand-popover border border-brand-border/70 rounded-xl shadow-xl w-44 overflow-hidden py-1 backdrop-blur-xl animate-fade-in"
                            >
                              {onNewChatInProject && (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    onNewChatInProject(proj.name);
                                    setOpenMenuProject(null);
                                  }}
                                  className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-brand-textMuted hover:text-brand-textMain hover:bg-[color:var(--brand-hover)] transition-colors cursor-pointer"
                                >
                                  <MessageSquarePlus className="w-3.5 h-3.5" />
                                  <span>New chat</span>
                                </button>
                              )}
                              <button
                                type="button"
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
                                  type="button"
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

                    {/* Nested Chats Under Project */}
                    {isExpanded && (
                      <div className="flex flex-col ml-4 pl-2.5 mt-0.5 mb-1 gap-0.5 border-l border-brand-border/25">
                        {projectChats.length === 0 ? (
                          <div className="text-[11px] text-brand-textMuted/40 px-2 py-1.5 italic select-none">
                            No chats yet
                          </div>
                        ) : (
                          <>
                            {(expandedProjectChats[proj.name] ? projectChats : projectChats.slice(0, MAX_INITIAL_CHATS)).map((chat) =>
                              renderChatRow(chat, true)
                            )}
                            {projectChats.length > MAX_INITIAL_CHATS && (
                              <button
                                type="button"
                                data-testid={`show-more-project-${proj.name}`}
                                onClick={() =>
                                  setExpandedProjectChats((prev) => ({
                                    ...prev,
                                    [proj.name]: !prev[proj.name],
                                  }))
                                }
                                className="flex items-center gap-1.5 px-2 py-1 text-[11px] font-medium text-brand-textMuted/70 hover:text-brand-textMain hover:bg-[color:var(--brand-hover)] rounded-lg transition-colors cursor-pointer mt-0.5"
                              >
                                <ChevronDown
                                  className={`w-3 h-3 transition-transform duration-200 ${
                                    expandedProjectChats[proj.name] ? 'rotate-180' : ''
                                  }`}
                                />
                                <span>
                                  {expandedProjectChats[proj.name]
                                    ? 'Show less'
                                    : `Show ${projectChats.length - MAX_INITIAL_CHATS} more`}
                                </span>
                              </button>
                            )}
                          </>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}

              {uniqueProjects.length === 0 && onCreateProjectClick && (
                <button
                  type="button"
                  onClick={onCreateProjectClick}
                  className="flex items-center gap-2 px-3 py-2 text-xs text-brand-textMuted/60 hover:text-brand-textMain hover:bg-[color:var(--brand-hover)] rounded-xl transition-all cursor-pointer w-full border border-dashed border-brand-border/40 hover:border-brand-border-strong mt-1"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Create your first project</span>
                </button>
              )}
            </div>
          </div>
        )}

        {/* ── CHATS Section (Standalone Chats) ── */}
        {!collapsed && (
          <div className="mb-4">
            <div className="flex items-center justify-between px-2 py-1.5 mb-0.5 select-none group">
              <span
                className="text-[10.5px] font-semibold tracking-wider text-brand-textMuted/50 uppercase font-mono group-hover:text-brand-textMuted transition-colors cursor-pointer flex-1"
                onClick={() => setChatsCollapsed(!chatsCollapsed)}
              >
                Chats
              </span>
              <div className="flex items-center gap-1 shrink-0">
                {onNewChatInProject && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onNewChatInProject('');
                    }}
                    className="w-5 h-5 flex items-center justify-center rounded-md text-brand-textMuted/60 hover:text-brand-textMain hover:bg-[color:var(--brand-hover)] transition-all cursor-pointer"
                    title="New standalone chat"
                    aria-label="New standalone chat"
                  >
                    <Plus className="w-3.5 h-3.5" />
                  </button>
                )}
                <button
                  type="button"
                  className="w-5 h-5 flex items-center justify-center text-brand-textMuted/40 hover:text-brand-textMain cursor-pointer rounded"
                  onClick={() => setChatsCollapsed(!chatsCollapsed)}
                  title={chatsCollapsed ? 'Expand chats' : 'Collapse chats'}
                >
                  {chatsCollapsed ? <ChevronRight className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                </button>
              </div>
            </div>

            {!chatsCollapsed && (
              <div className="flex flex-col gap-0.5">
                {standaloneChats.length === 0 ? (
                  <div className="text-[11px] text-brand-textMuted/40 px-3 py-2 italic select-none">
                    No active chats.
                  </div>
                ) : (
                  <>
                    {(showAllStandaloneChats ? standaloneChats : standaloneChats.slice(0, MAX_INITIAL_CHATS)).map((chat) =>
                      renderChatRow(chat, false)
                    )}
                    {standaloneChats.length > MAX_INITIAL_CHATS && (
                      <button
                        type="button"
                        data-testid="show-more-standalone-chats"
                        onClick={() => setShowAllStandaloneChats((prev) => !prev)}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-medium text-brand-textMuted/70 hover:text-brand-textMain hover:bg-[color:var(--brand-hover)] rounded-xl transition-colors cursor-pointer mt-0.5"
                      >
                        <ChevronDown
                          className={`w-3 h-3 transition-transform duration-200 ${
                            showAllStandaloneChats ? 'rotate-180' : ''
                          }`}
                        />
                        <span>
                          {showAllStandaloneChats
                            ? 'Show less'
                            : `Show ${standaloneChats.length - MAX_INITIAL_CHATS} more`}
                        </span>
                      </button>
                    )}
                  </>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Footer: Settings (Apple / Claude clean soft footer) ── */}
      <div className="border-t border-brand-border/40 pt-2 pb-3 px-2 mt-auto shrink-0">
        <button
          type="button"
          data-testid="sidebar-settings-btn"
          onClick={() => {
            onSelectTab('settings');
            if (onProfileClick) onProfileClick();
            onMobileClose?.();
          }}
          title={collapsed ? 'Settings' : undefined}
          className={`relative w-full flex items-center ${
            collapsed ? 'justify-center h-9 px-0' : 'gap-3 px-3 py-2'
          } rounded-xl transition-all duration-200 text-xs font-medium cursor-pointer ${
            activeTab === 'settings'
              ? 'text-brand-textMain bg-brand-card/75 border border-brand-border/60 shadow-2xs font-semibold'
              : 'text-brand-textMuted hover:text-brand-textMain hover:bg-[color:var(--brand-hover)]'
          }`}
        >
          {activeTab === 'settings' && !collapsed && (
            <span className="absolute left-1 top-2 bottom-2 w-1 rounded-full bg-[color:var(--brand-accent)] shadow-[0_0_6px_var(--brand-accent-glow)]" />
          )}
          <Settings className={`w-4 h-4 shrink-0 transition-transform duration-200 ${activeTab === 'settings' ? 'scale-105 text-brand-textMain' : ''}`} />
          {!collapsed && <span>Settings</span>}
        </button>
      </div>
    </aside>
  );
};
