import React from 'react';

/** Displays a read-only list of keyboard shortcuts and their key bindings. */
export const ShortcutsSettings: React.FC = () => {
  const shortcutItems = [
    { label: 'Search Command Palette', value: 'Ctrl + P' },
    { label: 'Open Settings Panel', value: 'Ctrl + ,' },
    { label: 'Toggle Left Sidebar', value: 'Ctrl + \\' },
    { label: 'Create New Agent Chat', value: 'Ctrl + N' },
    { label: 'Trigger Voice Command', value: 'Ctrl + Shift + V' }
  ];

  return (
    <div className="mx-auto w-full max-w-2xl text-left">
      <h1 className="font-outfit text-2xl font-semibold tracking-tight text-brand-textMain sm:text-3xl">
        Shortcuts
      </h1>
      <p className="mb-7 mt-2 text-sm leading-relaxed text-brand-textMuted sm:text-base">
        View and manage keyboard combinations to quickly execute app operations.
      </p>

      <div className="settings-section overflow-hidden !p-0">
        {shortcutItems.map((item, idx) => (
          <div
            key={item.label}
            className={`flex items-center justify-between gap-3 px-4 py-3.5 sm:px-5 ${
              idx === shortcutItems.length - 1 ? '' : 'border-b border-brand-border'
            }`}
          >
            <span className="text-sm font-medium text-brand-textMain">{item.label}</span>
            <kbd className="ui-chip font-mono text-xs">{item.value}</kbd>
          </div>
        ))}
      </div>
    </div>
  );
};
