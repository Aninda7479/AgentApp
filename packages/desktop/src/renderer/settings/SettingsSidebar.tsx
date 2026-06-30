import React from 'react';

interface SidebarItem {
  id: string;
  label: string;
  icon: string;
}

interface SettingsSidebarProps {
  activeCategory: string;
  onSelectCategory: (category: string) => void;
  onBackToApp: () => void;
  searchQuery: string;
  setSearchQuery: (query: string) => void;
}

const CATEGORIES: Record<string, SidebarItem[]> = {
  Desktop: [
    { id: 'general', label: 'General', icon: '⚙️' },
    { id: 'shortcuts', label: 'Shortcuts', icon: '⌨️' },
    { id: 'servers', label: 'Servers', icon: '🔌' }
  ],
  Server: [
    { id: 'providers', label: 'Providers', icon: '⚙️' },
    { id: 'models', label: 'Models', icon: '✦' }
  ]
};

export const SettingsSidebar: React.FC<SettingsSidebarProps> = ({
  activeCategory,
  onSelectCategory,
  onBackToApp,
  searchQuery,
  setSearchQuery
}) => {
  const renderSidebarItem = (id: string, label: string, icon: string) => {
    const isActive = activeCategory === id;
    if (searchQuery && !label.toLowerCase().includes(searchQuery.toLowerCase())) return null;

    return (
      <div
        key={id}
        data-testid={`settings-category-${id}`}
        onClick={() => onSelectCategory(id)}
        style={{
          padding: '8px 10px',
          borderRadius: '8px',
          color: isActive ? '#ffffff' : '#8a8a8a',
          backgroundColor: isActive ? '#2e2220' : 'transparent',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          fontSize: '0.88rem',
          fontWeight: isActive ? 500 : 400,
          marginBottom: '2px',
          transition: 'all 0.15s ease'
        }}
        onMouseEnter={(e) => {
          if (!isActive) e.currentTarget.style.backgroundColor = '#251c1a';
        }}
        onMouseLeave={(e) => {
          if (!isActive) e.currentTarget.style.backgroundColor = 'transparent';
        }}
      >
        <span style={{ fontSize: '0.95rem' }}>{icon}</span>
        <span>{label}</span>
      </div>
    );
  };

  return (
    <div
      style={{
        width: '260px',
        backgroundColor: '#1b1412',
        borderRight: '1px solid #2d2321',
        display: 'flex',
        flexDirection: 'column',
        padding: '20px 16px',
        height: '100%'
      }}
    >
      <div
        onClick={onBackToApp}
        style={{
          color: '#8a8a8a',
          cursor: 'pointer',
          fontSize: '0.9rem',
          marginBottom: '20px',
          display: 'flex',
          alignItems: 'center',
          gap: '6px'
        }}
        onMouseEnter={(e) => (e.currentTarget.style.color = '#ffffff')}
        onMouseLeave={(e) => (e.currentTarget.style.color = '#8a8a8a')}
      >
        <span>←</span>
        <span>Back to app</span>
      </div>

      <div style={{ marginBottom: '24px' }}>
        <input
          type="text"
          placeholder="Search settings..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          style={{
            width: '100%',
            backgroundColor: '#141110',
            border: '1px solid #2d2321',
            borderRadius: '6px',
            padding: '8px 12px',
            color: '#ffffff',
            fontSize: '0.85rem',
            outline: 'none'
          }}
        />
      </div>

      <div style={{ flex: 1 }}>
        {Object.entries(CATEGORIES).map(([group, items]) => {
          const visibleItems = items.filter(
            (item) => !searchQuery || item.label.toLowerCase().includes(searchQuery.toLowerCase())
          );
          if (visibleItems.length === 0) return null;

          return (
            <div key={group} style={{ marginBottom: '20px' }}>
              <div
                style={{
                  fontSize: '0.72rem',
                  fontWeight: 600,
                  color: '#4b4b4b',
                  textTransform: 'uppercase',
                  letterSpacing: '0.08em',
                  marginBottom: '8px',
                  paddingLeft: '10px'
                }}
              >
                {group}
              </div>
              {visibleItems.map((item) => renderSidebarItem(item.id, item.label, item.icon))}
            </div>
          );
        })}
      </div>

      <div
        style={{
          borderTop: '1px solid #2d2321',
          paddingTop: '12px',
          fontSize: '0.78rem',
          color: '#4b4b4b',
          textAlign: 'left',
          paddingLeft: '10px'
        }}
      >
        OpenCode Desktop
      </div>
    </div>
  );
};
