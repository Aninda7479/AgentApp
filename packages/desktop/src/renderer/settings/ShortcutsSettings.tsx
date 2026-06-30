import React from 'react';

export const ShortcutsSettings: React.FC = () => {
  const shortcutItems = [
    { label: 'Search Command Palette', value: 'Ctrl + P' },
    { label: 'Open Settings Panel', value: 'Ctrl + ,' },
    { label: 'Toggle Left Sidebar', value: 'Ctrl + \\' },
    { label: 'Create New Agent Chat', value: 'Ctrl + N' },
    { label: 'Trigger Voice Command', value: 'Ctrl + Shift + V' }
  ];

  return (
    <div style={{ maxWidth: '640px' }}>
      <h1 style={{ fontSize: '1.6rem', fontWeight: 600, color: '#ffffff', marginBottom: '8px', textAlign: 'left' }}>
        Shortcuts
      </h1>
      <p style={{ fontSize: '0.88rem', color: '#8a8a8a', marginBottom: '28px', textAlign: 'left', lineHeight: '1.5' }}>
        View and manage keyboard combinations to quickly execute app operations.
      </p>

      <div style={{ backgroundColor: '#1b1412', border: '1px solid #2d2321', borderRadius: '12px', overflow: 'hidden' }}>
        {shortcutItems.map((item, idx) => (
          <div
            key={item.label}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '16px 20px',
              borderBottom: idx === shortcutItems.length - 1 ? 'none' : '1px solid #231c1a'
            }}
          >
            <span style={{ fontSize: '0.9rem', color: '#ffffff', fontWeight: 500 }}>{item.label}</span>
            <span
              style={{
                fontFamily: 'monospace',
                fontSize: '0.82rem',
                backgroundColor: '#141110',
                border: '1px solid #2d2321',
                padding: '4px 8px',
                borderRadius: '6px',
                color: '#ececec'
              }}
            >
              {item.value}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};
