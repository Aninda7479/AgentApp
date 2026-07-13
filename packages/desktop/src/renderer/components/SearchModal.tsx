import React, { useState, useEffect, useRef, KeyboardEvent } from 'react';

/** Props for the SearchModal component. */
export interface SearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectChat: (chatTitle: string, projectContext?: string) => void;
  onNewChat: () => void;
  onOpenFolder: () => void;
  onOpenSettings: () => void;
}

interface SearchItem {
  id: string;
  title: string;
  subtitle?: string;
  shortcut: string;
  type: 'chat' | 'action';
  icon?: string;
  actionKey: 'select-chat' | 'new-chat' | 'open-folder' | 'settings';
}

/** Command palette / search modal for navigating chats and triggering actions. */
export const SearchModal: React.FC<SearchModalProps> = ({
  isOpen,
  onClose,
  onSelectChat,
  onNewChat,
  onOpenFolder,
  onOpenSettings,
}) => {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const modalRef = useRef<HTMLDivElement>(null);

  const allItems: SearchItem[] = [
    { id: 'c1', title: 'Find online data listings', shortcut: 'Ctrl+1', type: 'chat', actionKey: 'select-chat' },
    { id: 'c2', title: 'Add ponytail plugin', subtitle: 'GlacierPharma', shortcut: 'Ctrl+2', type: 'chat', actionKey: 'select-chat' },
    { id: 'c3', title: 'use graphify here and make the chart', subtitle: 'GlacierPharma', shortcut: 'Ctrl+3', type: 'chat', actionKey: 'select-chat' },
    { id: 'c4', title: 'Add graphify tool', shortcut: 'Ctrl+4', type: 'chat', actionKey: 'select-chat' },
    { id: 'c5', title: 'Upgrade proxy for Roo Code', subtitle: 'proxy', shortcut: 'Ctrl+5', type: 'chat', actionKey: 'select-chat' },
    { id: 'c6', title: 'Draft BYOM executive memo', subtitle: 'LawX', shortcut: 'Ctrl+6', type: 'chat', actionKey: 'select-chat' },
    { id: 'c7', title: 'Build LLM wiki workflow', subtitle: 'Second_Brain', shortcut: 'Ctrl+7', type: 'chat', actionKey: 'select-chat' },
    { id: 'c8', title: 'Modernize car rental demo', subtitle: 'car_rental_dem...', shortcut: 'Ctrl+8', type: 'chat', actionKey: 'select-chat' },
    { id: 'c9', title: 'Build car rental demo site', subtitle: 'Second_Brain', shortcut: 'Ctrl+9', type: 'chat', actionKey: 'select-chat' },
    { id: 'a1', title: 'New chat', icon: '📝', shortcut: 'Ctrl+N', type: 'action', actionKey: 'new-chat' },
    { id: 'a2', title: 'Open folder', icon: '📁', shortcut: 'Ctrl+O', type: 'action', actionKey: 'open-folder' },
    { id: 'a3', title: 'Settings', icon: '⚙️', shortcut: 'Ctrl+,', type: 'action', actionKey: 'settings' },
  ];

  const filteredItems = allItems.filter(item =>
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
      if (e.ctrlKey && e.key >= '1' && e.key <= '9') {
        e.preventDefault();
        const num = parseInt(e.key);
        const chatItems = filteredItems.filter(i => i.type === 'chat');
        if (chatItems[num - 1]) {
          handleTriggerItem(chatItems[num - 1]);
        }
      }
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
  }, [isOpen, filteredItems]);

  if (!isOpen) return null;

  const handleTriggerItem = (item: SearchItem) => {
    if (item.actionKey === 'select-chat') {
      onSelectChat(item.title, item.subtitle);
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

  const chatItems = filteredItems.filter(item => item.type === 'chat');
  const actionItems = filteredItems.filter(item => item.type === 'action');

  return (
    <div
      data-testid="search-modal-overlay"
      className="fixed inset-0 bg-black/40 flex items-start justify-center pt-16 z-[2000]"
    >
      <div
        ref={modalRef}
        data-testid="search-modal-content"
        className="w-[600px] max-w-[90%] bg-brand-sidebar border border-brand-border rounded-2xl shadow-[0_20px_40px_rgba(0,0,0,0.5)] overflow-hidden flex flex-col max-h-[80vh]"
      >
        {/* Search Input */}
        <div className="flex items-center gap-2.5 px-4 py-3.5 border-b border-brand-border">
          <span className="text-sm text-brand-textMuted">🔍</span>
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
            className="flex-1 bg-transparent border-none outline-none text-white text-sm placeholder-brand-textMuted/50"
          />
        </div>

        {/* Results */}
        <div className="overflow-y-auto px-2 py-2">
          {filteredItems.length === 0 ? (
            <div className="py-6 text-center text-brand-textMuted text-sm">
              No results found for "{query}"
            </div>
          ) : (
            <>
              {chatItems.length > 0 && (
                <div>
                  <div className="text-[10px] uppercase font-bold tracking-wider text-brand-textMuted/70 px-3 py-1.5">
                    Chats
                  </div>
                  {chatItems.map((item) => {
                    const globalIndex = filteredItems.indexOf(item);
                    const isSelected = globalIndex === selectedIndex;
                    return (
                      <div
                        key={item.id}
                        data-testid={`search-item-${item.id}`}
                        onClick={() => handleTriggerItem(item)}
                        onMouseEnter={() => setSelectedIndex(globalIndex)}
                        className={`flex items-center justify-between px-3 py-2.5 rounded-lg cursor-pointer transition-colors mb-0.5 ${
                          isSelected ? 'bg-white/5 text-white' : 'text-brand-textMuted hover:bg-white/5 hover:text-white'
                        }`}
                      >
                        <div className="flex items-center gap-2 flex-1 min-w-0">
                          <span className="text-sm truncate">{item.title}</span>
                          {item.subtitle && (
                            <span className="text-[10px] text-brand-textMuted/60 bg-brand-bg/50 px-2 py-0.5 rounded font-mono flex-shrink-0">
                              {item.subtitle}
                            </span>
                          )}
                        </div>
                        <span className="text-[10px] text-brand-textMuted/50 font-mono flex-shrink-0 ml-2">
                          {item.shortcut}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}

              {actionItems.length > 0 && (
                <div className="mt-2">
                  <div className="text-[10px] uppercase font-bold tracking-wider text-brand-textMuted/70 px-3 py-1.5">
                    Suggested
                  </div>
                  {actionItems.map((item) => {
                    const globalIndex = filteredItems.indexOf(item);
                    const isSelected = globalIndex === selectedIndex;
                    return (
                      <div
                        key={item.id}
                        data-testid={`search-item-${item.id}`}
                        onClick={() => handleTriggerItem(item)}
                        onMouseEnter={() => setSelectedIndex(globalIndex)}
                        className={`flex items-center justify-between px-3 py-2.5 rounded-lg cursor-pointer transition-colors mb-0.5 ${
                          isSelected ? 'bg-white/5 text-white' : 'text-brand-textMuted hover:bg-white/5 hover:text-white'
                        }`}
                      >
                        <div className="flex items-center gap-2.5">
                          <span className="text-sm">{item.icon}</span>
                          <span className="text-sm">{item.title}</span>
                        </div>
                        <span className="text-[10px] text-brand-textMuted/50 font-mono">
                          {item.shortcut}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};
