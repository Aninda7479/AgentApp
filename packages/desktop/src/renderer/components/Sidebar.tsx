import React, { useState } from 'react';

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
  onProfileClick?: () => void;
  onMenuClick?: (menuName: string) => void;
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
  onMenuClick
}) => {
  const [projectsCollapsed, setProjectsCollapsed] = useState(false);
  const [chatsCollapsed, setChatsCollapsed] = useState(false);

  const projects = [
    { name: 'agent', desc: 'Add actions for desktop automa... 3mo' },
    { name: 'GlacierPharma', desc: '' },
    { name: 'proxy', desc: '' },
    { name: 'LawX', desc: '' },
    { name: 'Second_Brain', desc: '' }
  ];

  const chats = [
    { title: 'Find online data listings', time: '5d' },
    { title: 'Add graphify tool', time: '3w' }
  ];

  // Render navigation item helper
  const renderNavItem = (id: string, label: string, icon: string) => {
    const isActive = activeTab === id;
    return (
      <div
        data-testid={`nav-item-${id}`}
        onClick={() => onSelectTab(id)}
        style={{
          padding: '8px 10px',
          borderRadius: '8px',
          color: isActive ? '#ffffff' : '#8a8a8a',
          backgroundColor: isActive ? '#2e2220' : 'transparent',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          fontSize: '0.9rem',
          fontWeight: isActive ? 500 : 400,
          marginBottom: '2px',
          transition: 'all 0.15s ease',
          userSelect: 'none'
        }}
        onMouseEnter={(e) => {
          if (!isActive) e.currentTarget.style.backgroundColor = '#251c1a';
        }}
        onMouseLeave={(e) => {
          if (!isActive) e.currentTarget.style.backgroundColor = 'transparent';
        }}
      >
        <span style={{ fontSize: '1rem', width: '18px', textAlign: 'center' }}>{icon}</span>
        {!collapsed && <span>{label}</span>}
      </div>
    );
  };

  return (
    <div
      data-testid="sidebar-container"
      style={{
        width: collapsed ? '70px' : '260px',
        backgroundColor: '#1e1816', // Dark warm charcoal sidebar background
        borderRight: '1px solid #2d2321',
        display: 'flex',
        flexDirection: 'column',
        padding: '8px',
        height: '100%',
        boxSizing: 'border-box',
        transition: 'width 0.2s ease-in-out'
      }}
    >
      {/* Top Windows Navigation Bar */}
      {!collapsed && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            padding: '8px 10px 16px',
            borderBottom: '1px solid #2d2321',
            marginBottom: '12px'
          }}
        >
          {/* Navigation Arrows */}
          <div style={{ display: 'flex', gap: '8px', color: '#8a8a8a', fontSize: '0.85rem' }}>
            <span style={{ cursor: 'pointer' }}>←</span>
            <span style={{ cursor: 'pointer' }}>→</span>
          </div>
          {/* Window Menu */}
          <div
            style={{
              display: 'flex',
              gap: '10px',
              color: '#8a8a8a',
              fontSize: '0.78rem',
              fontWeight: 500,
              userSelect: 'none'
            }}
          >
            <span onClick={() => onMenuClick && onMenuClick('File')} style={{ cursor: 'pointer' }}>File</span>
            <span onClick={() => onMenuClick && onMenuClick('Edit')} style={{ cursor: 'pointer' }}>Edit</span>
            <span onClick={() => onMenuClick && onMenuClick('View')} style={{ cursor: 'pointer' }}>View</span>
            <span onClick={() => onMenuClick && onMenuClick('Help')} style={{ cursor: 'pointer' }}>Help</span>
          </div>
        </div>
      )}

      {/* Main navigation list */}
      <div style={{ flex: 1, overflowY: 'auto', paddingRight: '2px' }}>
        {/* Core items */}
        <div style={{ marginBottom: '16px' }}>
          <div
            data-testid="nav-new-chat"
            onClick={onNewChat || (() => onSelectTab('trajectory'))}
            style={{
              padding: '8px 10px',
              borderRadius: '8px',
              color: '#ececec',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              fontSize: '0.9rem',
              marginBottom: '2px',
              transition: 'all 0.15s ease'
            }}
            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#2e2220')}
            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
          >
            <span style={{ fontSize: '1rem', width: '18px', textAlign: 'center' }}>📝</span>
            {!collapsed && <span>New chat</span>}
          </div>

          <div
            data-testid="nav-search"
            onClick={onOpenSearch}
            style={{
              padding: '8px 10px',
              borderRadius: '8px',
              color: '#8a8a8a',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              fontSize: '0.9rem',
              marginBottom: '2px',
              transition: 'all 0.15s ease'
            }}
            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#251c1a')}
            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
          >
            <span style={{ fontSize: '1rem', width: '18px', textAlign: 'center' }}>🔍</span>
            {!collapsed && <span>Search</span>}
          </div>

          {renderNavItem('scheduled', 'Scheduled', '⏰')}
          {renderNavItem('plugins', 'Plugins', '🔌')}
        </div>

        {/* Projects Section */}
        {!collapsed && (
          <div style={{ marginBottom: '16px' }}>
            <div
              data-testid="sidebar-projects-header"
              onClick={() => setProjectsCollapsed(!projectsCollapsed)}
              style={{
                fontSize: '0.72rem',
                textTransform: 'uppercase',
                color: '#8a8a8a',
                fontWeight: 600,
                letterSpacing: '0.05em',
                marginBottom: '6px',
                padding: '4px 10px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                cursor: 'pointer',
                userSelect: 'none'
              }}
            >
              <span>Projects</span>
              <span>{projectsCollapsed ? '▶' : '▼'}</span>
            </div>

            {!projectsCollapsed &&
              projects.map((proj) => {
                const isSelected = activeProject === proj.name && activeTab === 'trajectory';
                return (
                  <div
                    key={proj.name}
                    data-testid={`project-item-${proj.name}`}
                    onClick={() => {
                      if (onSelectProject) onSelectProject(proj.name);
                      onSelectTab('trajectory');
                    }}
                    style={{
                      padding: '8px 10px',
                      borderRadius: '8px',
                      color: isSelected ? '#ffffff' : '#ececec',
                      backgroundColor: isSelected ? '#2e2220' : 'transparent',
                      cursor: 'pointer',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '2px',
                      marginBottom: '2px',
                      transition: 'all 0.15s ease'
                    }}
                    onMouseEnter={(e) => {
                      if (!isSelected) e.currentTarget.style.backgroundColor = '#251c1a';
                    }}
                    onMouseLeave={(e) => {
                      if (!isSelected) e.currentTarget.style.backgroundColor = 'transparent';
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.88rem' }}>
                      <span>📁</span>
                      <span style={{ fontWeight: isSelected ? 500 : 400 }}>{proj.name}</span>
                    </div>
                    {proj.desc && (
                      <span style={{ fontSize: '0.72rem', color: '#8a8a8a', paddingLeft: '22px' }}>
                        {proj.desc}
                      </span>
                    )}
                  </div>
                );
              })}
          </div>
        )}

        {/* Chats Section */}
        {!collapsed && (
          <div style={{ marginBottom: '16px' }}>
            <div
              data-testid="sidebar-chats-header"
              onClick={() => setChatsCollapsed(!chatsCollapsed)}
              style={{
                fontSize: '0.72rem',
                textTransform: 'uppercase',
                color: '#8a8a8a',
                fontWeight: 600,
                letterSpacing: '0.05em',
                marginBottom: '6px',
                padding: '4px 10px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                cursor: 'pointer',
                userSelect: 'none'
              }}
            >
              <span>Chats</span>
              <span>{chatsCollapsed ? '▶' : '▼'}</span>
            </div>

            {!chatsCollapsed &&
              chats.map((chat) => (
                <div
                  key={chat.title}
                  data-testid={`chat-item-${chat.title.replace(/\s+/g, '-')}`}
                  style={{
                    padding: '8px 10px',
                    borderRadius: '8px',
                    color: '#ececec',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    fontSize: '0.88rem',
                    marginBottom: '2px',
                    transition: 'all 0.15s ease'
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#251c1a')}
                  onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                >
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginRight: '6px' }}>
                    {chat.title}
                  </span>
                  <span style={{ fontSize: '0.72rem', color: '#8a8a8a', flexShrink: 0 }}>
                    {chat.time}
                  </span>
                </div>
              ))}
          </div>
        )}
      </div>

      {/* User profile footer section */}
      {!collapsed && (
        <div
          data-testid="sidebar-profile"
          onClick={onProfileClick}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'flex-start',
            padding: '12px 6px 4px',
            borderTop: '1px solid #2d2321',
            marginTop: 'auto',
            cursor: 'pointer',
            borderRadius: '6px',
            transition: 'background-color 0.15s ease'
          }}
          onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#251c1a')}
          onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {/* Avatar circle */}
            <div
              style={{
                width: '32px',
                height: '32px',
                borderRadius: '50%',
                backgroundColor: '#10b981', // green background
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#ffffff',
                fontWeight: 600,
                fontSize: '0.85rem'
              }}
            >
              AD
            </div>
            {/* Name / Subtitle */}
            <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.2 }}>
              <span style={{ fontSize: '0.88rem', fontWeight: 600, color: '#ffffff' }}>Aninda Das</span>
              <span style={{ fontSize: '0.78rem', color: '#8a8a8a' }}>Go</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
