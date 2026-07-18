import React, { useState } from 'react';
import { Copy, X, AlertTriangle, Check, Info } from 'lucide-react';

interface AppToastProps {
  open: boolean;
  message: string;
  type?: 'info' | 'error';
  onClose: () => void;
}

/** Toast notification component with copy-to-clipboard and auto-dismiss. */
export const AppToast: React.FC<AppToastProps> = ({ open, message, type = 'info', onClose }) => {
  const [copied, setCopied] = useState(false);

  if (!open) return null;

  const handleCopy = () => {
    navigator.clipboard.writeText(message).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const isError = type === 'error' || message.toLowerCase().includes('error') || message.toLowerCase().includes('failed');

  const isExcluded =
    message.includes('Menu') ||
    message.includes('Selector') ||
    message.includes('Attached') ||
    message.includes('pasted') ||
    message.toLowerCase().includes('3d') ||
    message.toLowerCase().includes('model') ||
    message.toLowerCase().includes('mesh') ||
    message.toLowerCase().includes('concept') ||
    message.toLowerCase().includes('segmentation') ||
    message.toLowerCase().includes('rigging') ||
    message.toLowerCase().includes('polygon') ||
    message.toLowerCase().includes('uv') ||
    message.toLowerCase().includes('paint') ||
    message.toLowerCase().includes('preset') ||
    message.toLowerCase().includes('feedback') ||
    message.toLowerCase().includes('color');

  return (
    <div
      data-testid="toast-under-construction"
      className={`fixed bottom-6 right-6 border rounded-xl py-3 px-4 text-brand-textMain shadow-2xl z-[3000] flex items-center gap-3 text-xs animate-fade-in glass-panel ${
        isError
          ? 'border-[color:var(--neon-destructive)]/30 bg-[color:var(--neon-destructive)]/10 shadow-[color:var(--neon-destructive)]/5'
          : 'border-brand-border bg-brand-popover'
      }`}
    >
      <div className="flex items-center gap-2">
        {isError ? (
          <AlertTriangle size={14} className="text-[color:var(--neon-destructive)] flex-shrink-0 animate-pulse" />
        ) : (
          <Info size={14} className="text-violet-400 flex-shrink-0" />
        )}
        <span className="font-sans font-medium">
          {message}
          {!isError && !isExcluded && (
            <span className="text-brand-textMuted font-normal"> is currently under development.</span>
          )}
        </span>
      </div>

      <div className="flex items-center gap-1 border-l border-brand-border/40 pl-2.5 ml-1 select-none">
        {/* Copy button */}
        <button
          onClick={handleCopy}
          title="Copy message"
          className="p-1 rounded-md text-brand-textMuted hover:text-brand-textMain hover:bg-[var(--brand-hover)] transition-all cursor-pointer"
        >
          {copied ? <Check size={12} className="text-[color:var(--neon-constructive)]" /> : <Copy size={12} />}
        </button>

        {/* Dismiss button */}
        <button
          onClick={onClose}
          title="Dismiss"
          className="p-1 rounded-md text-brand-textMuted hover:text-[color:var(--neon-destructive)] hover:bg-[color:var(--neon-destructive)]/10 transition-all cursor-pointer"
        >
          <X size={12} />
        </button>
      </div>
    </div>
  );
};
