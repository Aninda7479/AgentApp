import React from 'react';

export interface SidebarProps {
  activeTab: string;
  onSelectTab: (tab: string) => void;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
  mcpCount?: number;
  activeProvider?: string;
}

export interface NavItem {
  id: string;
  label: string;
  icon: string;
  section: 'workspaces' | 'integrations';
  badge?: string | number;
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  onSelectTab,
  collapsed = false,
  onToggleCollapse,
  mcpCount = 0,
  activeProvider = 'OpenAI'
}) => {
  const navItems: NavItem[] = [
    { id: 'trajectory', label: 'Agent Trajectory', icon: '⚡', section: 'workspaces' },
    { id: 'diff', label: 'Diff Inspector', icon: '🔍', section: 'workspaces' },
    { id: 'mcp', label: 'MCP Servers', icon: '🔌', section: 'integrations', badge: mcpCount },
    { id: 'settings', label: 'BYOK Settings', icon: '⚙️', section: 'integrations', badge: activeProvider ? 'Active' : undefined }
  ];

  return (
    <div
      data-testid="sidebar-container"
      style={{
        width: collapsed ? '70px' : '260px',
        backgroundColor: '#121215',
        borderRight: '1px solid #27272a',
        display: 'flex',
        flexDirection: 'column',
        padding: collapsed ? '16px 8px' : '16px',
        transition: 'width 0.2s ease-in-out',
        userSelect: 'none',
        height: '100%'
      }}
    >
      {/* Brand Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: collapsed ? 'center' : 'space-between',
          marginBottom: '24px'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div
            style={{
              width: '28px',
              height: '28px',
              borderRadius: '6px',
              background: 'linear-gradient(135deg, #8b5cf6, #3b82f6)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#ffffff',
              fontWeight: 'bold',
              fontSize: '14px'
            }}
          >
            S
          </div>
          {!collapsed && (
            <span style={{ fontWeight: 700, fontSize: '1rem', color: '#ffffff' }}>
              SuperAgent
            </span>
          )}
        </div>
        {onToggleCollapse && (
          <button
            onClick={onToggleCollapse}
            aria-label="Toggle sidebar"
            data-testid="collapse-toggle"
            style={{
              background: 'transparent',
              border: 'none',
              color: '#a1a1aa',
              cursor: 'pointer',
              fontSize: '14px',
              padding: '4px'
            }}
          >
            {collapsed ? '▶' : '◀'}
          </button>
        )}
      </div>

      {/* Navigation Sections */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {/* Section: Workspaces */}
        <div style={{ marginBottom: '20px' }}>
          {!collapsed && (
            <div
              style={{
                fontSize: '0.75rem',
                textTransform: 'uppercase',
                color: '#a1a1aa',
                letterSpacing: '0.05em',
                marginBottom: '8px',
                paddingLeft: '4px'
              }}
            >
              Workspaces
            </div>
          )}
          {navItems
            .filter((item) => item.section === 'workspaces')
            .map((item) => {
              const isActive = activeTab === item.id;
              return (
                <div
                  key={item.id}
                  data-testid={`nav-item-${item.id}`}
                  onClick={() => onSelectTab(item.id)}
                  style={{
                    padding: collapsed ? '10px 0' : '10px 12px',
                    borderRadius: '8px',
                    color: isActive ? '#ffffff' : '#a1a1aa',
                    backgroundColor: isActive ? '#1f1f23' : 'transparent',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: collapsed ? 'center' : 'space-between',
                    fontSize: '0.9rem',
                    marginBottom: '4px',
                    transition: 'all 0.15s ease'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <span style={{ fontSize: '1.1rem' }}>{item.icon}</span>
                    {!collapsed && <span>{item.label}</span>}
                  </div>
                </div>
              );
            })}
        </div>

        {/* Section: Protocol & Integrations */}
        <div style={{ marginBottom: '20px' }}>
          {!collapsed && (
            <div
              style={{
                fontSize: '0.75rem',
                textTransform: 'uppercase',
                color: '#a1a1aa',
                letterSpacing: '0.05em',
                marginBottom: '8px',
                paddingLeft: '4px'
              }}
            >
              Protocol & Integrations
            </div>
          )}
          {navItems
            .filter((item) => item.section === 'integrations')
            .map((item) => {
              const isActive = activeTab === item.id;
              return (
                <div
                  key={item.id}
                  data-testid={`nav-item-${item.id}`}
                  onClick={() => onSelectTab(item.id)}
                  style={{
                    padding: collapsed ? '10px 0' : '10px 12px',
                    borderRadius: '8px',
                    color: isActive ? '#ffffff' : '#a1a1aa',
                    backgroundColor: isActive ? '#1f1f23' : 'transparent',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: collapsed ? 'center' : 'space-between',
                    fontSize: '0.9rem',
                    marginBottom: '4px',
                    transition: 'all 0.15s ease'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <span style={{ fontSize: '1.1rem' }}>{item.icon}</span>
                    {!collapsed && <span>{item.label}</span>}
                  </div>
                  {!collapsed && item.badge !== undefined && (
                    <span
                      style={{
                        fontSize: '0.75rem',
                        backgroundColor: isActive ? '#3b82f6' : '#27272a',
                        color: '#ffffff',
                        padding: '2px 8px',
                        borderRadius: '10px',
                        fontWeight: 600
                      }}
                    >
                      {item.badge}
                    </span>
                  )}
                </div>
              );
            })}
        </div>
      </div>
    </div>
  );
};
