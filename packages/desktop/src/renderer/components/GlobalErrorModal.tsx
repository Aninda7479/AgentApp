import React, { useState } from 'react';
import { AlertTriangle, Copy, Check, X, Terminal, ChevronDown, ChevronUp, RefreshCw } from 'lucide-react';

export interface GlobalErrorPayload {
  context: string;
  message: string;
  stack?: string;
  timestamp?: string;
}

interface GlobalErrorModalProps {
  error: GlobalErrorPayload | null;
  onClose: () => void;
}

/**
 * Modern modal dialog that pops up on critical system or runtime errors,
 * prompting the user with full error details and a one-click copy button.
 */
export const GlobalErrorModal: React.FC<GlobalErrorModalProps> = ({ error, onClose }) => {
  const [copied, setCopied] = useState(false);
  const [showStack, setShowStack] = useState(true);

  if (!error) return null;

  const timestamp = error.timestamp || new Date().toLocaleTimeString();

  const fullReport = `=== SuperAgent Error Report ===
Time: ${new Date().toISOString()}
Context: ${error.context}
Message: ${error.message}
User Agent: ${typeof navigator !== 'undefined' ? navigator.userAgent : 'N/A'}
Platform: ${typeof navigator !== 'undefined' ? navigator.platform : 'N/A'}

=== Stack Trace ===
${error.stack || 'No stack trace available'}
`;

  const handleCopy = () => {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(fullReport).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2500);
      }).catch(() => {});
    }
  };

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/70 backdrop-blur-md animate-fade-in select-text">
      <div className="w-full max-w-2xl bg-[#0e0f17] border border-red-500/30 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
        
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 bg-red-500/10 border-b border-red-500/20">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-red-500/20 text-red-400 shrink-0">
              <AlertTriangle size={22} className="animate-pulse" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-zinc-100 flex items-center gap-2">
                System Error Detected
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-red-500/20 text-red-300 font-normal">
                  {error.context}
                </span>
              </h3>
              <p className="text-xs text-zinc-400">Logged at {timestamp}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 transition-colors cursor-pointer"
            title="Dismiss error dialog"
          >
            <X size={18} />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-4 flex-1">
          
          {/* Main Error Message */}
          <div className="p-4 rounded-xl bg-zinc-950 border border-red-900/40 text-red-300 font-mono text-xs break-words leading-relaxed">
            <div className="text-[10px] font-sans font-semibold text-red-400/80 uppercase tracking-wider mb-1">
              Error Message
            </div>
            {error.message}
          </div>

          {/* Copy Prompt Callout */}
          <div className="flex items-center justify-between p-3.5 rounded-xl bg-zinc-900/90 border border-zinc-800">
            <div className="flex items-center gap-2 text-xs text-zinc-300">
              <Terminal size={16} className="text-violet-400 shrink-0" />
              <span>Copy full diagnostic report to paste in bug report or AI prompt.</span>
            </div>
            <button
              onClick={handleCopy}
              className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition-all cursor-pointer shadow-lg shrink-0 ${
                copied
                  ? 'bg-emerald-600 text-white'
                  : 'bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white hover:shadow-violet-500/20'
              }`}
            >
              {copied ? <Check size={15} /> : <Copy size={15} />}
              {copied ? 'Copied Report!' : 'Copy Error Details'}
            </button>
          </div>

          {/* Stack Trace Toggle */}
          {error.stack && (
            <div className="space-y-2">
              <button
                onClick={() => setShowStack((v) => !v)}
                className="inline-flex items-center gap-2 text-xs font-medium text-zinc-400 hover:text-zinc-200 transition-colors cursor-pointer"
              >
                {showStack ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                {showStack ? 'Hide Stack Trace' : 'Show Full Stack Trace'}
              </button>

              {showStack && (
                <div className="p-4 rounded-xl bg-zinc-950 border border-zinc-800 font-mono text-[11px] text-zinc-300 overflow-x-auto max-h-56 whitespace-pre-wrap break-all leading-relaxed">
                  {error.stack}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="flex items-center justify-between px-6 py-3.5 bg-zinc-950 border-t border-zinc-800/80">
          <span className="text-[11px] text-zinc-500">SuperAgent Resilience &amp; Diagnostic Guard</span>
          <div className="flex items-center gap-2">
            <button
              onClick={handleCopy}
              className="px-3.5 py-1.5 rounded-lg border border-zinc-700 bg-zinc-800 text-zinc-200 text-xs font-medium hover:bg-zinc-700 transition-all cursor-pointer inline-flex items-center gap-1.5"
            >
              {copied ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
              {copied ? 'Copied' : 'Copy'}
            </button>
            <button
              onClick={onClose}
              className="px-4 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-100 text-xs font-semibold transition-all cursor-pointer"
            >
              Close
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};
