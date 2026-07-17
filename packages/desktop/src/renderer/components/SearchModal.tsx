import React, { useState, useEffect, useRef, KeyboardEvent } from 'react';
import { Search, Plus, FolderOpen, Settings as SettingsIcon, MessageSquare, Folder } from 'lucide-react';

/** Props for the SearchModal component. */
export interface SearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Real conversations to search across. */
  chats?: { id: string; title: string; project?: string }[];
  /** Real projects to jump into. */
  projects?: { name: string }[];
  onSelectChat: (chatTitle: string, projectContext?: string) => void;
  onSelectProject?: (name: string) => void;
  onNewChat: () => void;
  onOpenFolder: () => void;
  onOpenSettings: () => void;
}

interface SearchItem {
  id: string;
  title: string;
  subtitle?: string;
  shortcut: string;
  type: 'chat' | 'project' | 'action';
  icon: React.ReactNode;
  actionKey: 'select-chat' | 'select-project' | 'new-chat' | 'open-folder' | 'settings';
  payload?: string;
}

/** Command palette / search modal for navigating real chats, projects, and actions. */
export const SearchModal: React.FC<SearchModalProps> = ({
  isOpen,
  onClose,
  chats = [],
  projects = [],
  onSelectChat,
  onSelectProject,
  onNewChat,
  onOpenFolder,
  onOpenSettings,
}) => {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const modalRef = useRef<HTMLDivElement>(null);

  const chatItems: SearchItem[] = chats.map((c) => ({
    id: `chat-${c.id}`,
    title: c.title,
    subtitle: c.project,
    shortcut: '',
    type: 'chat',
    icon: <MessageSquare size={14} />,
    actionKey: 'select-chat',
    payload: c.id,
  }));

  const projectItems: SearchItem[] = projects.map((p) => ({
    id: `proj-${p.name}`,
    title: p.name,
    subtitle: 'Project',
    shortcut: '',
    type: 'project',
    icon: <Folder size={14} />,
    actionKey: 'select-project',
    payload: p.name,
  }));

  const actionItems: SearchItem[] = [
    { id: 'a1', title: 'New chat', subtitle: 'Start a fresh conversation', shortcut: 'Ctrl+N', type: 'action', icon: <Plus size={14} />, actionKey: 'new-chat' },
    { id: 'a2', title: 'Open folder', subtitle: 'Add a project from disk', shortcut: 'Ctrl+O', type: 'action', icon: <FolderOpen size={14} />, actionKey: 'open-folder' },
    { id: 'a3', title: 'Settings', subtitle: 'Providers, models, preferences', shortcut: 'Ctrl+,', type: 'action', icon: <SettingsIcon size={14} />, actionKey: 'settings' },
  ];

  const allItems = [...chatItems, ...projectItems, ...actionItems];

  const filteredItems = allItems.filter((item) =>
    item.title.toLowerCase().includes(query.toLowerCase()) ||
    (item.subtitle && item.subtitle.toLowerCase().includes(query.toLowerCase()))
  );

  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setSelectedIndex(0);
      setTimeout(() => {
        inputRef.current?.focus();
      }, 50);
    }
  }, [isOpen]);

  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (modalRef.current && !modalRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleOutsideClick);
    }
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
    };
  }, [isOpen, onClose]);

  useEffect(() => {
    const handleGlobalShortcuts = (e: KeyboardEvent | any) => {
      if (!isOpen) return;
      if (e.ctrlKey && e.key.toLowerCase() === 'n') {
        e.preventDefault();
        onNewChat();
        onClose();
      }
      if (e.ctrlKey && e.key.toLowerCase() === 'o') {
        e.preventDefault();
        onOpenFolder();
        onClose();
      }
      if (e.ctrlKey && e.key === ',') {
        e.preventDefault();
        onOpenSettings();
        onClose();
      }
    };
    window.addEventListener('keydown', handleGlobalShortcuts);
    return () => {
      window.removeEventListener('keydown', handleGlobalShortcuts);
    };
  }, [isOpen, onNewChat, onOpenFolder, onOpenSettings, onClose]);

  if (!isOpen) return null;

  const handleTriggerItem = (item: SearchItem) => {
    if (item.actionKey === 'select-chat') {
      const chat = chats.find((c) => c.id === item.payload);
      onSelectChat(item.title, chat?.project);
    } else if (item.actionKey === 'select-project') {
      onSelectProject?.(item.payload!);
    } else if (item.actionKey === 'new-chat') {
      onNewChat();
    } else if (item.actionKey === 'open-folder') {
      onOpenFolder();
    } else if (item.actionKey === 'settings') {
      onOpenSettings();
    }
    onClose();
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) => (filteredItems.length > 0 ? (prev + 1) % filteredItems.length : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) => (filteredItems.length > 0 ? (prev - 1 + filteredItems.length) % filteredItems.length : 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (filteredItems[selectedIndex]) {
        handleTriggerItem(filteredItems[selectedIndex]);
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    }
  };

  const chatResults = filteredItems.filter((i) => i.type === 'chat');
  const projectResults = filteredItems.filter((i) => i.type === 'project');
  const actionResults = filteredItems.filter((i) => i.type === 'action');

  const renderGroup = (heading: string, items: SearchItem[]) =>
    items.length > 0 && (
      <div>
        <div className="text-[10px] uppercase font-bold tracking-wider text-brand-textMuted/70 px-3 py-1.5">
          {heading}
        </div>
        {items.map((item) => {
          const globalIndex = filteredItems.indexOf(item);
          const isSelected = globalIndex === selectedIndex;
          return (
            <div
              key={item.id}
              data-testid={`search-item-${item.id}`}
              onClick={() => handleTriggerItem(item)}
              onMouseEnter={() => setSelectedIndex(globalIndex)}
              className={`flex items-center justify-between px-3 py-2.5 rounded-lg cursor-pointer transition-colors mb-0.5 ${
                isSelected ? 'bg-[var(--brand-hover)] text-brand-textMain' : 'text-brand-textMuted hover:bg-[var(--brand-hover)] hover:text-brand-textMain'
              }`}
            >
              <div className="flex items-center gap-2.5 flex-1 min-w-0">
                <span className="text-brand-textMuted/80 flex-shrink-0">{item.icon}</span>
                <span className="text-sm truncate">{item.title}</span>
                {item.subtitle && (
                  <span className="text-[10px] text-brand-textMuted/60 bg-brand-bg/50 px-2 py-0.5 rounded font-mono flex-shrink-0 truncate max-w-[120px]">
                    {item.subtitle}
                  </span>
                )}
              </div>
              {item.shortcut && (
                <span className="text-[10px] text-brand-textMuted/50 font-mono flex-shrink-0 ml-2">{item.shortcut}</span>
              )}
            </div>
          );
        })}
      </div>
    );

  return (
    <div
      data-testid="search-modal-overlay"
      className="fixed inset-0 bg-black/40 flex items-start justify-center pt-16 z-[2000] px-3"
    >
      <div
        ref={modalRef}
        data-testid="search-modal-content"
        className="w-[600px] max-w-full bg-brand-sidebar border border-brand-border rounded-2xl shadow-[0_20px_40px_rgba(0,0,0,0.5)] overflow-hidden flex flex-col max-h-[80vh]"
      >
        {/* Search Input */}
        <div className="flex items-center gap-2.5 px-4 py-3.5 border-b border-brand-border">
          <Search size={16} className="text-brand-textMuted flex-shrink-0" />
          <input
            ref={inputRef}
            data-testid="search-modal-input"
            type="text"
            placeholder="Search chats or run a command"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelectedIndex(0);
            }}
            onKeyDown={handleKeyDown}
            className="flex-1 bg-transparent border-none outline-none text-brand-textMain text-sm placeholder-brand-textMuted/50"
          />
          {query && (
            <button
              onClick={() => { setQuery(''); inputRef.current?.focus(); }}
              className="text-brand-textMuted hover:text-brand-textMain text-xs px-1.5 cursor-pointer"
              aria-label="Clear search"
            >
              ✕
            </button>
          )}
        </div>

        {/* Results */}
        <div className="overflow-y-auto px-2 py-2">
          {filteredItems.length === 0 ? (
            <div className="py-8 text-center text-brand-textMuted text-sm">
              No results for &ldquo;{query}&rdquo;
            </div>
          ) : (
            <>
              {renderGroup('Chats', chatResults)}
              {renderGroup('Projects', projectResults)}
              {renderGroup('Actions', actionResults)}
            </>
          )}
        </div>
      </div>
    </div>
  );
};
