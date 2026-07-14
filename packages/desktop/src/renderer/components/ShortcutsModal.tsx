import React from 'react';
import { Keyboard } from 'lucide-react';
import { Button } from './ui';

export interface ShortcutsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ShortcutsModal: React.FC<ShortcutsModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  const shortcutItems = [
    { label: 'Search Command Palette', value: 'Ctrl + P' },
    { label: 'Open Settings Panel', value: 'Ctrl + ,' },
    { label: 'Toggle Left Sidebar', value: 'Ctrl + \\' },
    { label: 'Create New Agent Chat', value: 'Ctrl + N' },
    { label: 'Trigger Voice Command', value: 'Ctrl + Shift + V' }
  ];

  return (
    <div
      data-testid="shortcuts-modal-overlay"
      className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-[1000]"
    >
      <div
        data-testid="shortcuts-modal-content"
        className="bg-brand-card border border-brand-border rounded-2xl w-[500px] max-w-[90%] p-6 shadow-[0_20px_50px_rgba(0,0,0,0.8)] text-brand-textMain text-left animate-in fade-in zoom-in-95 duration-150"
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-5 border-b border-brand-border/60 pb-3">
          <div className="flex items-center gap-2.5">
            <Keyboard className="w-5 h-5 text-[var(--brand-highlight)]" />
            <div>
              <h2 className="text-lg font-bold text-white m-0">Keyboard Shortcuts</h2>
              <p className="text-xs text-brand-textMuted mt-0.5">
                Quickly execute application actions using hotkeys
              </p>
            </div>
          </div>
          <Button
            onClick={onClose}
            variant="ghost"
            className="text-lg p-1 h-auto"
          >
            ✕
          </Button>
        </div>

        {/* Content */}
        <div className="space-y-2">
          {shortcutItems.map((item) => (
            <div
              key={item.label}
              className="flex items-center justify-between gap-3 px-4 py-3 bg-brand-bg/40 border border-brand-border/40 rounded-xl"
            >
              <span className="text-xs font-medium text-brand-textMain">{item.label}</span>
              <kbd className="px-2.5 py-1 bg-brand-card border border-brand-border rounded font-mono text-[10px] text-white shadow-sm">
                {item.value}
              </kbd>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="flex justify-end mt-6">
          <Button onClick={onClose} variant="primary" size="sm">
            Close
          </Button>
        </div>
      </div>
    </div>
  );
};
