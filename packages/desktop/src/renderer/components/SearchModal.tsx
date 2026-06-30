import React, { useState, useEffect, useRef, KeyboardEvent } from 'react';

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
    // Chats
    { id: 'c1', title: 'Find online data listings', shortcut: 'Ctrl+1', type: 'chat', actionKey: 'select-chat' },
    { id: 'c2', title: 'Add ponytail plugin', subtitle: 'GlacierPharma', shortcut: 'Ctrl+2', type: 'chat', actionKey: 'select-chat' },
    { id: 'c3', title: 'use graphify here and make the chart', subtitle: 'GlacierPharma', shortcut: 'Ctrl+3', type: 'chat', actionKey: 'select-chat' },
    { id: 'c4', title: 'Add graphify tool', shortcut: 'Ctrl+4', type: 'chat', actionKey: 'select-chat' },
    { id: 'c5', title: 'Upgrade proxy for Roo Code', subtitle: 'proxy', shortcut: 'Ctrl+5', type: 'chat', actionKey: 'select-chat' },
    { id: 'c6', title: 'Draft BYOM executive memo', subtitle: 'LawX', shortcut: 'Ctrl+6', type: 'chat', actionKey: 'select-chat' },
    { id: 'c7', title: 'Build LLM wiki workflow', subtitle: 'Second_Brain', shortcut: 'Ctrl+7', type: 'chat', actionKey: 'select-chat' },
    { id: 'c8', title: 'Modernize car rental demo', subtitle: 'car_rental_dem...', shortcut: 'Ctrl+8', type: 'chat', actionKey: 'select-chat' },
    { id: 'c9', title: 'Build car rental demo site', subtitle: 'Second_Brain', shortcut: 'Ctrl+9', type: 'chat', actionKey: 'select-chat' },
    // Suggested
    { id: 'a1', title: 'New chat', icon: '📝', shortcut: 'Ctrl+N', type: 'action', actionKey: 'new-chat' },
    { id: 'a2', title: 'Open folder', icon: '📁', shortcut: 'Ctrl+O', type: 'action', actionKey: 'open-folder' },
    { id: 'a3', title: 'Settings', icon: '⚙️', shortcut: 'Ctrl+,', type: 'action', actionKey: 'settings' },
  ];

  // Filter items based on query
  const filteredItems = allItems.filter(item =>
    item.title.toLowerCase().includes(query.toLowerCase()) ||
    (item.subtitle && item.subtitle.toLowerCase().includes(query.toLowerCase()))
  );

  // Auto-focus input when modal opens
  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setSelectedIndex(0);
      setTimeout(() => {
        inputRef.current?.focus();
      }, 50);
    }
  }, [isOpen]);

  // Handle escape to close, and click outside
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

  // Handle global keydowns for shortcuts when modal is NOT open, or search shortcuts when open
  useEffect(() => {
    const handleGlobalShortcuts = (e: KeyboardEvent | any) => {
      if (!isOpen) return;

      // Allow Ctrl+1 through Ctrl+9 to trigger specific items directly
      if (e.ctrlKey && e.key >= '1' && e.key <= '9') {
        e.preventDefault();
        const num = parseInt(e.key);
        const chatItems = filteredItems.filter(i => i.type === 'chat');
        if (chatItems[num - 1]) {
          handleTriggerItem(chatItems[num - 1]);
        }
      }

      // Action shortcuts
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
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.4)',
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'center',
        paddingTop: '64px',
        zIndex: 2000,
        fontFamily: "'Inter', -apple-system, sans-serif",
      }}
    >
      <div
        ref={modalRef}
        data-testid="search-modal-content"
        style={{
          width: '600px',
          backgroundColor: '#262220', // Warm dark charcoal matching screen 2
          border: '1px solid #3d3432',
          borderRadius: '16px',
          boxShadow: '0 20px 40px rgba(0,0,0,0.5)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          maxHeight: '80vh',
        }}
      >
        {/* Search Input Box */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            padding: '14px 16px',
            borderBottom: '1px solid #3d3432',
          }}
        >
          <span style={{ fontSize: '1rem', color: '#8a8a8a', marginRight: '10px' }}>🔍</span>
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
            style={{
              flex: 1,
              background: 'transparent',
              border: 'none',
              outline: 'none',
              color: '#ececec',
              fontSize: '0.95rem',
            }}
          />
        </div>

        {/* Search Results List */}
        <div style={{ overflowY: 'auto', padding: '8px' }}>
          {filteredItems.length === 0 ? (
            <div style={{ padding: '24px', textAlign: 'center', color: '#8a8a8a', fontSize: '0.9rem' }}>
              No results found for "{query}"
            </div>
          ) : (
            <>
              {/* Chats Section */}
              {chatItems.length > 0 && (
                <div>
                  <div
                    style={{
                      fontSize: '0.75rem',
                      textTransform: 'uppercase',
                      color: '#8a8a8a',
                      fontWeight: 600,
                      padding: '8px 12px 4px',
                      letterSpacing: '0.05em',
                    }}
                  >
                    Chats
                  </div>
                  {chatItems.map((item, index) => {
                    const globalIndex = filteredItems.indexOf(item);
                    const isSelected = globalIndex === selectedIndex;
                    return (
                      <div
                        key={item.id}
                        data-testid={`search-item-${item.id}`}
                        onClick={() => handleTriggerItem(item)}
                        onMouseEnter={() => setSelectedIndex(globalIndex)}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: '10px 12px',
                          borderRadius: '8px',
                          cursor: 'pointer',
                          backgroundColor: isSelected ? '#3b2f2d' : 'transparent', // Warm hover highlight
                          transition: 'background-color 0.15s ease',
                          marginBottom: '2px',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1, minWidth: 0 }}>
                          <span style={{ color: '#ececec', fontSize: '0.9rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {item.title}
                          </span>
                          {item.subtitle && (
                            <span
                              style={{
                                fontSize: '0.75rem',
                                color: '#8a8a8a',
                                backgroundColor: '#1e1816',
                                padding: '2px 8px',
                                borderRadius: '4px',
                              }}
                            >
                              {item.subtitle}
                            </span>
                          )}
                        </div>
                        <span style={{ fontSize: '0.75rem', color: '#8a8a8a', fontFamily: 'monospace' }}>
                          {item.shortcut}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Suggested Section */}
              {actionItems.length > 0 && (
                <div style={{ marginTop: '8px' }}>
                  <div
                    style={{
                      fontSize: '0.75rem',
                      textTransform: 'uppercase',
                      color: '#8a8a8a',
                      fontWeight: 600,
                      padding: '8px 12px 4px',
                      letterSpacing: '0.05em',
                    }}
                  >
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
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: '10px 12px',
                          borderRadius: '8px',
                          cursor: 'pointer',
                          backgroundColor: isSelected ? '#3b2f2d' : 'transparent',
                          transition: 'background-color 0.15s ease',
                          marginBottom: '2px',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <span style={{ fontSize: '1rem' }}>{item.icon}</span>
                          <span style={{ color: '#ececec', fontSize: '0.9rem' }}>{item.title}</span>
                        </div>
                        <span style={{ fontSize: '0.75rem', color: '#8a8a8a', fontFamily: 'monospace' }}>
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
