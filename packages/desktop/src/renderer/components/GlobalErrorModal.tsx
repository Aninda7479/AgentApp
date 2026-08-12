import React, { useState } from 'react';
import { 
  AlertOctagon, 
  Copy, 
  Check, 
  X, 
  Terminal, 
  ChevronDown, 
  ChevronUp, 
  ShieldAlert,
  Sparkles,
  Info,
  HelpCircle
} from 'lucide-react';

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
 * An intelligent, profound diagnostic screen that parses common system errors,
 * provides constructive troubleshooting guidance, and formats full report logs
 * inside a high-end glassmorphic terminal dashboard.
 */
export const GlobalErrorModal: React.FC<GlobalErrorModalProps> = ({ error, onClose }) => {
  const [copied, setCopied] = useState(false);
  const [showStack, setShowStack] = useState(false);

  if (!error) return null;

  const timestamp = error.timestamp || new Date().toLocaleTimeString();

  // ── Error Analysis & Troubleshooting Guidance ────────────────────────────
  const getTroubleshootingAdvice = (msg: string) => {
    const text = msg.toLowerCase();
    if (text.includes('unexpected token') || text.includes('valid json') || text.includes('doctype')) {
      return {
        title: 'HTML Received Instead of JSON',
        advice: 'The web app expected a structured JSON response but received an HTML page (like the Sign In redirect). Ensure your session has not expired by refreshing the browser tab, or check that you have entered correct credentials.',
        action: 'Refresh Session'
      };
    }
    if (text.includes('network') || text.includes('fetch') || text.includes('failed to fetch')) {
      return {
        title: 'Connection Interrupted',
        advice: 'SuperAgent lost connection to the local API server or a cloud AI provider. Check if your backend server process has stopped or if there are local firewall rules blocking port 14692.',
        action: 'Check Network'
      };
    }
    if (text.includes('api key') || text.includes('unauthorized') || text.includes('401') || text.includes('403')) {
      return {
        title: 'API Authentication Issue',
        advice: 'Your AI provider rejected the request. Open Settings → Providers to verify that your OpenAI, Anthropic, or Gemini API keys are entered correctly and have sufficient credits.',
        action: 'Configure Keys'
      };
    }
    if (text.includes('cors') || text.includes('cross-origin')) {
      return {
        title: 'CORS Security Policy Restriction',
        advice: 'The browser blocked the request to protect security. If you are hosting the Web App, ensure you run it securely or connect through the built-in provider proxy server to bypass client-side origin checks.',
        action: 'Read Documentation'
      };
    }
    return {
      title: 'General Execution Exception',
      advice: 'An unexpected runtime error was caught by the resilience layer. Copy the diagnostic payload below and consult the logs to trace the root exception.',
      action: 'Troubleshoot'
    };
  };

  const advice = getTroubleshootingAdvice(error.message);

  const fullReport = `=== SuperAgent Diagnostic Report ===
Timestamp: ${new Date().toISOString()}
Context: ${error.context}
Error Message: ${error.message}
Diagnosis Category: ${advice.title}
Browser User Agent: ${typeof navigator !== 'undefined' ? navigator.userAgent : 'N/A'}
Runtime Platform: ${typeof navigator !== 'undefined' ? navigator.platform : 'N/A'}

=== Stack Trace ===
${error.stack || 'No stack trace captured.'}
`;

  const handleCopy = () => {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(fullReport).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }).catch(() => {});
    }
  };

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-fade-in select-text">
      {/* Outer Card with Glassmorphic gradient backing */}
      <div className="relative w-full max-w-2xl bg-gradient-to-b from-[#181822]/95 to-[#0b0c11]/98 border border-rose-500/20 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh] transition-all duration-300">
        
        {/* Top atmospheric visual ring */}
        <div 
          className="pointer-events-none absolute -top-32 -left-32 w-96 h-96 rounded-full blur-3xl opacity-20"
          style={{ background: 'radial-gradient(circle, var(--brand-accent-glow), transparent 75%)' }}
        />

        {/* Modal Header */}
        <div className="flex items-center justify-between px-8 py-5 border-b border-zinc-800/80 bg-slate-950/40">
          <div className="flex items-center gap-3.5">
            <div className="w-10 h-10 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 flex items-center justify-center shrink-0 shadow-inner">
              <AlertOctagon size={20} className="animate-pulse" />
            </div>
            <div>
              <h3 className="font-outfit text-base font-semibold tracking-tight text-brand-textMain flex items-center gap-2">
                Resilience Guard Notice
                <span className="text-[10px] font-mono px-2.5 py-0.5 rounded-full bg-rose-500/10 text-rose-300 border border-rose-500/20 font-normal">
                  {error.context}
                </span>
              </h3>
              <p className="text-[11px] text-brand-textMuted tracking-wide">Caught at {timestamp}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-brand-textMuted hover:text-brand-textMain hover:bg-brand-hover border border-transparent hover:border-brand-border transition-all cursor-pointer"
            title="Dismiss error modal"
          >
            <X size={16} />
          </button>
        </div>

        {/* Modal Body */}
        <div className="px-8 py-6 overflow-y-auto space-y-5 flex-1 scrollbar-thin">
          
          {/* Diagnostic Raw Message block */}
          <div className="space-y-1.5">
            <span className="text-[10px] font-bold uppercase tracking-wider text-brand-textMuted block">
              Raw Message
            </span>
            <div className="p-4 rounded-xl border border-rose-900/30 bg-rose-500/[0.02] text-rose-300 font-mono text-xs break-all leading-relaxed shadow-sm">
              {error.message}
            </div>
          </div>

          {/* Diagnosis & Advice (Troubleshooting Guidance) */}
          <div className="p-4 rounded-xl border border-brand-border bg-brand-bg/40 space-y-2.5">
            <div className="flex items-center gap-2 text-xs font-semibold text-brand-textMain">
              <HelpCircle size={15} className="text-[color:var(--brand-accent)] shrink-0" />
              <span>Diagnosis: {advice.title}</span>
            </div>
            <p className="text-xs text-brand-textMuted leading-relaxed">
              {advice.advice}
            </p>
          </div>

          {/* Copy Report Action block */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between p-4 rounded-xl border border-brand-border bg-brand-bg/20 gap-3.5">
            <div className="flex items-center gap-2.5 text-xs text-brand-textMuted">
              <Terminal size={14} className="text-brand-textMuted shrink-0" />
              <span>Full diagnostic logs compiled (System details + stack trace).</span>
            </div>
            <button
              onClick={handleCopy}
              className={`w-full sm:w-auto inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold tracking-wide transition-all duration-200 cursor-pointer shadow-md ${
                copied
                  ? 'bg-emerald-600 hover:bg-emerald-500 text-white'
                  : 'bg-[color:var(--brand-highlight)] hover:bg-[color:var(--brand-highlight-hover)] text-[color:var(--brand-highlight-text)]'
              }`}
            >
              {copied ? <Check size={14} /> : <Copy size={14} />}
              {copied ? 'Copied Log!' : 'Copy Diagnostic Logs'}
            </button>
          </div>

          {/* Toggle-able Stack Trace section */}
          {error.stack && (
            <div className="space-y-2.5">
              <button
                type="button"
                onClick={() => setShowStack(v => !v)}
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-brand-textMuted hover:text-brand-textMain transition-colors cursor-pointer"
              >
                <span className="text-[10px]">{showStack ? '▼' : '▶'}</span>
                <span>{showStack ? 'Hide Stack Trace' : 'Inspect Stack Trace'}</span>
              </button>

              {showStack && (
                <div className="p-4 rounded-xl border border-brand-border bg-brand-inner-bg/60 font-mono text-[10px] text-brand-textMuted overflow-x-auto max-h-48 whitespace-pre-wrap break-all leading-relaxed shadow-inner">
                  {error.stack}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="flex items-center justify-between px-8 py-4 border-t border-brand-border/60 bg-slate-950/40 text-xs">
          <div className="flex items-center gap-1.5 text-brand-textMuted">
            <ShieldAlert size={13} className="text-rose-400" />
            <span className="text-[10px] tracking-wide uppercase font-semibold">Resilience Guard Active</span>
          </div>
          <div className="flex items-center gap-2.5">
            <button
              onClick={onClose}
              className="px-5 py-2 rounded-lg bg-[color:var(--brand-hover-strong)] hover:bg-brand-hover text-brand-textMain text-xs font-semibold transition-all border border-brand-border/80 cursor-pointer"
            >
              Dismiss
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};
