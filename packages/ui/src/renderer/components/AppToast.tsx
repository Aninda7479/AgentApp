import React, { useState } from 'react';
import { Copy, X, AlertTriangle, Check, Info } from 'lucide-react';

interface AppToastProps {
  open: boolean;
  message: string;
  type?: 'info' | 'error';
  onClose: () => void;
  onViewDetails?: () => void;
}

/** Toast notification component with copy-to-clipboard and auto-dismiss. */
export const AppToast: React.FC<AppToastProps> = ({ open, message, type = 'info', onClose, onViewDetails }) => {
  const [copied, setCopied] = useState(false);

  if (!open) return null;

  const handleCopy = () => {
    navigator.clipboard.writeText(message).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const isError = type === 'error' || message.toLowerCase().includes('error') || message.toLowerCase().includes('failed');

  return (
    <div
      data-testid="app-toast"
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
        <span className="font-sans font-medium">{message}</span>
      </div>

      <div className="flex items-center gap-1 border-l border-brand-border/40 pl-2.5 ml-1 select-none">
        {isError && onViewDetails && (
          <button
            onClick={onViewDetails}
            className="px-2 py-0.5 rounded text-[11px] font-semibold bg-red-500/20 text-red-300 hover:bg-red-500/30 transition-all cursor-pointer mr-1"
            title="View full error details and copy diagnostic report"
          >
            Details
          </button>
        )}

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
