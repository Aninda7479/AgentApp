import React, { useState, useEffect, useRef } from 'react';
import { X, Check, ShieldCheck, ShieldAlert, Globe } from 'lucide-react';
import { StoredChat, InheritableSandbox, InheritableApproval, InheritableInternet, AgentScopeSettings } from '../../types';

/** Props for the ChatSettingsModal component. */
interface ChatSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  chat: StoredChat | null;
  onSave: (settings: AgentScopeSettings) => void;
}

function Segmented<T extends string>(props: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}): React.ReactElement {
  return (
    <div className="inline-flex flex-wrap gap-1 bg-brand-bg/40 border border-brand-border/60 rounded-lg p-1">
      {props.options.map((opt) => {
        const active = props.value === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => props.onChange(opt.value)}
            className={`px-2.5 py-1.5 rounded-md text-[11px] font-medium transition-colors cursor-pointer ${
              active
                ? 'bg-[var(--brand-highlight)] text-[color:var(--brand-highlight-text)]'
                : 'text-brand-textMuted hover:bg-[var(--brand-hover)] hover:text-brand-textMain'
            }`}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

/**
 * Modal for per-chat Sandbox & Internet overrides. These win over the parent
 * project's settings and the global default for this chat only.
 */
export const ChatSettingsModal: React.FC<ChatSettingsModalProps> = ({
  isOpen,
  onClose,
  chat,
  onSave
}) => {
  const [sandbox, setSandbox] = useState<InheritableSandbox>('inherit');
  const [approval, setApproval] = useState<InheritableApproval>('inherit');
  const [internet, setInternet] = useState<InheritableInternet>('inherit');
  const [closing, setClosing] = useState(false);

  useEffect(() => {
    if (isOpen && chat) {
      setClosing(false);
      setSandbox(chat.settings?.sandbox ?? 'inherit');
      setApproval(chat.settings?.approval ?? 'inherit');
      setInternet(chat.settings?.internet ?? 'inherit');
    }
  }, [isOpen, chat]);

  if (!isOpen || !chat) return null;

  const handleDismiss = () => {
    setClosing(true);
    setTimeout(() => {
      onClose();
      setClosing(false);
    }, 150);
  };

  const handleSave = () => {
    onSave({ sandbox, approval, internet });
    handleDismiss();
  };

  return (
    <div
      className={`fixed inset-0 bg-black/70 flex items-center justify-center z-[2000] p-4 backdrop-blur-sm transition-opacity duration-150 ${
        closing ? 'opacity-0' : 'opacity-100'
      }`}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) handleDismiss();
      }}
    >
      <div
        className={`bg-brand-sidebar border border-brand-border rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden text-brand-textMain transition-all duration-150 ${
          closing ? 'opacity-0 scale-95 translate-y-1' : 'opacity-100 scale-100 translate-y-0'
        }`}
      >
        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-brand-border">
          <div className="w-9 h-9 rounded-lg bg-violet-500/10 border border-violet-500/20 flex items-center justify-center flex-shrink-0 text-violet-400 font-outfit font-semibold text-sm">
            ⚙️
          </div>
          <div className="flex flex-col min-w-0">
            <h3 className="font-semibold text-base text-brand-textMain font-outfit leading-tight">
              Chat Settings: {chat.title}
            </h3>
            <p className="text-xs text-brand-textMuted leading-tight mt-0.5">
              Override sandbox & internet access for this chat only
            </p>
          </div>
          <button
            onClick={handleDismiss}
            aria-label="Close"
            className="ml-auto text-brand-textMuted hover:text-brand-textMain hover:bg-[var(--brand-hover)] rounded-lg p-1.5 transition-colors duration-150"
          >
            <X size={16} />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 flex flex-col gap-5 max-h-[460px] overflow-y-auto custom-scrollbar">
          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-bold text-brand-textMuted uppercase tracking-wider flex items-center gap-1.5">
              <ShieldCheck size={13} className="text-[color:var(--neon-constructive)]" /> Sandbox
            </span>
            <Segmented
              value={sandbox}
              onChange={setSandbox}
              options={[
                { value: 'inherit', label: 'Inherit (project/global)' },
                { value: 'sandboxed', label: 'Sandboxed' },
                { value: 'full-access', label: 'Full access' }
              ]}
            />
            <span className="text-[10px] text-brand-textMuted/60">Full access lets the agent read/write anywhere on disk; Sandboxed confines file access to the project's authorized folders.</span>
          </div>

          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-bold text-brand-textMuted uppercase tracking-wider flex items-center gap-1.5">
              <ShieldAlert size={13} className="text-[color:var(--neon-attention)]" /> Command approval
            </span>
            <Segmented
              value={approval}
              onChange={setApproval}
              options={[
                { value: 'inherit', label: 'Inherit (project/global)' },
                { value: 'always', label: 'Always approve' },
                { value: 'ask', label: 'Ask for approval' },
                { value: 'never', label: 'Never approve' }
              ]}
            />
            <span className="text-[10px] text-brand-textMuted/60">Never approve blocks every command unless it is on the project's allowed-commands list.</span>
          </div>

          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-bold text-brand-textMuted uppercase tracking-wider flex items-center gap-1.5">
              <Globe size={13} className="text-[color:var(--neon-live)]" /> Internet access
            </span>
            <Segmented
              value={internet}
              onChange={setInternet}
              options={[
                { value: 'inherit', label: 'Inherit (project/global)' },
                { value: 'all', label: 'Full access' },
                { value: 'observation', label: 'Observation only' },
                { value: 'none', label: 'None' }
              ]}
            />
            <span className="text-[10px] text-brand-textMuted/60">Observation only allows read-only GET requests; None blocks web fetch, search, and uploads (the AI provider API still works).</span>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-brand-border bg-black/10">
          <button
            onClick={handleDismiss}
            className="px-3.5 py-2 text-sm text-brand-textMuted hover:text-brand-textMain transition-colors duration-150"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="flex items-center gap-1.5 px-4 py-2 text-sm bg-[var(--brand-highlight)] hover:bg-[var(--brand-highlight-hover)] text-[color:var(--brand-highlight-text)] rounded-lg font-medium transition-all active:scale-[0.98] cursor-pointer"
          >
            <Check size={14} />
            <span>Save Settings</span>
          </button>
        </div>
      </div>
    </div>
  );
};

export default ChatSettingsModal;
