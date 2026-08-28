import React from 'react';
import { Keyboard, Sparkles, Camera } from 'lucide-react';
import { Button } from './ui';
import { getPlatform, formatShortcut } from '../lib/platform';

export interface ShortcutsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ShortcutsModal: React.FC<ShortcutsModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  const platform = getPlatform();

  const shortcutItems = [
    { label: 'Circle to Search & Quick Assistant', value: formatShortcut('CommandOrControl+Shift+S'), icon: <Sparkles size={14} className="text-indigo-400" /> },
    { label: 'Search Command Palette', value: formatShortcut('CommandOrControl+P') },

    { label: 'Create New Agent Chat', value: formatShortcut('CommandOrControl+N') },
    { label: 'Open Settings Panel', value: formatShortcut('CommandOrControl+,') },
    { label: 'Toggle Left Sidebar', value: formatShortcut('CommandOrControl+\\') },
    { label: 'Trigger Voice Command', value: formatShortcut('CommandOrControl+Shift+V') },
    { label: 'Dismiss Active Overlay / Modal', value: 'Esc' },
  ];

  return (
    <div
      data-testid="shortcuts-modal-overlay"
      className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-[1000]"
      style={{
        fontFamily: platform === 'macos' ? '-apple-system, BlinkMacSystemFont, "SF Pro Text", sans-serif' : 'inherit',
      }}
    >
      <div
        data-testid="shortcuts-modal-content"
        className="bg-brand-card border border-brand-border rounded-2xl w-[520px] max-w-[90%] p-6 shadow-[0_20px_50px_rgba(0,0,0,0.8)] text-brand-textMain text-left animate-in fade-in zoom-in-95 duration-150"
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-5 border-b border-brand-border/60 pb-3">
          <div className="flex items-center gap-2.5">
            <Keyboard className="w-5 h-5 text-[var(--brand-highlight)]" />
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold text-brand-textMain m-0">Keyboard Shortcuts</h2>
                <span className="px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider bg-brand-bg text-brand-textMuted border border-brand-border">
                  {platform === 'macos' ? 'macOS Keys' : platform === 'windows' ? 'Windows Keys' : 'Linux Keys'}
                </span>
              </div>
              <p className="text-xs text-brand-textMuted mt-0.5">
                Quickly execute application & OS-level actions using hotkeys
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
        <div className="space-y-2 max-h-80 overflow-y-auto custom-scrollbar pr-1">
          {shortcutItems.map((item) => (
            <div
              key={item.label}
              className="flex items-center justify-between gap-3 px-4 py-2.5 bg-brand-bg/40 border border-brand-border/40 rounded-xl hover:bg-brand-bg/70 transition-colors"
            >
              <div className="flex items-center gap-2">
                {item.icon}
                <span className="text-xs font-medium text-brand-textMain">{item.label}</span>
              </div>
              <kbd className="px-2.5 py-1 bg-brand-card border border-brand-border rounded font-mono text-[10px] text-brand-textMain shadow-sm">
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
