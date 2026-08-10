import React, { useState, useEffect, useMemo } from 'react';
import { X, Check, ShieldCheck, ShieldAlert, Globe, Brain, RefreshCw, Coins, Cpu } from 'lucide-react';
import { StoredChat, InheritableSandbox, InheritableApproval, InheritableInternet, AgentScopeSettings } from '../../types';

/** Props for the ChatSettingsModal component. */
interface ChatSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  chat: StoredChat | null;
  onSave: (settings: AgentScopeSettings & { memory?: string }) => void;
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

/** Summarizes chat history part by part and enforces a strict 12,000 char (12K) limit. */
function rebuildChatMemory(steps: any[], currentMem: string): string {
  if (!steps || steps.length === 0) return currentMem.slice(0, 12000);
  
  const CHUNK_SIZE = 8;
  const chunkSummaries: string[] = [];

  for (let i = 0; i < steps.length; i += CHUNK_SIZE) {
    const batch = steps.slice(i, i + CHUNK_SIZE);
    const summary = `• Part ${Math.floor(i / CHUNK_SIZE) + 1} (${batch.length} steps):\n` +
      batch
        .filter((s: any) => s.content)
        .map((s: any) => `  - [${(s.type || 'step').toUpperCase()}]: ${String(s.content).replace(/\n+/g, ' ').slice(0, 140)}`)
        .join('\n');
    chunkSummaries.push(summary);
  }

  let fullMemory = chunkSummaries.join('\n\n');
  if (currentMem.trim()) {
    fullMemory = `[Prior Memory]\n${currentMem.trim()}\n\n[Rebuilt History]\n${fullMemory}`;
  }

  // 12K character limit
  const LIMIT = 12000;
  if (fullMemory.length > LIMIT) {
    fullMemory = fullMemory.slice(0, LIMIT);
  }
  return fullMemory;
}

/**
 * Modal for per-chat Sandbox, Internet, and Memory settings with token/cost tracking.
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
  const [memory, setMemory] = useState<string>('');
  const [isRebuilding, setIsRebuilding] = useState(false);
  const [closing, setClosing] = useState(false);

  useEffect(() => {
    if (isOpen && chat) {
      setClosing(false);
      setSandbox(chat.settings?.sandbox ?? 'inherit');
      setApproval(chat.settings?.approval ?? 'inherit');
      setInternet(chat.settings?.internet ?? 'inherit');
      setMemory((chat.standaloneConfig?.memory ?? chat.projectStorageKey) || '');
    }
  }, [isOpen, chat]);

  // Compute token usage & cost for this chat step history
  const { inputTokens, outputTokens, totalTokens, totalCost } = useMemo(() => {
    if (!chat || !chat.steps) {
      return { inputTokens: 0, outputTokens: 0, totalTokens: 0, totalCost: 0 };
    }
    let input = 0;
    let output = 0;
    for (const s of chat.steps) {
      const len = s.content ? s.content.length : 0;
      const est = Math.ceil(len / 4);
      if (s.type === 'user') {
        input += est;
      } else {
        output += est;
      }
    }
    const tot = input + output;
    // Estimated $1.50 per 1M input, $4.00 per 1M output
    const cost = (input * 1.5 + output * 4.0) / 1000000;
    return { inputTokens: input, outputTokens: output, totalTokens: tot, totalCost: cost };
  }, [chat]);

  if (!isOpen || !chat) return null;

  const handleDismiss = () => {
    setClosing(true);
    setTimeout(() => {
      onClose();
      setClosing(false);
    }, 150);
  };

  const handleRebuildMemory = () => {
    setIsRebuilding(true);
    setTimeout(() => {
      const rebuilt = rebuildChatMemory(chat.steps || [], memory);
      setMemory(rebuilt);
      setIsRebuilding(false);
    }, 300);
  };

  const handleSave = () => {
    onSave({ sandbox, approval, internet, memory });
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
        className={`bg-brand-sidebar border border-brand-border rounded-2xl w-full max-w-xl shadow-2xl overflow-hidden text-brand-textMain transition-all duration-150 ${
          closing ? 'opacity-0 scale-95 translate-y-1' : 'opacity-100 scale-100 translate-y-0'
        }`}
      >
        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-brand-border bg-black/20">
          <div className="w-9 h-9 rounded-lg bg-violet-500/10 border border-violet-500/20 flex items-center justify-center flex-shrink-0 text-violet-400 font-outfit font-semibold text-sm">
            ⚙️
          </div>
          <div className="flex flex-col min-w-0 flex-1">
            <h3 className="font-semibold text-base text-brand-textMain font-outfit leading-tight truncate">
              Chat Settings: {chat.title}
            </h3>
            <p className="text-xs text-brand-textMuted leading-tight mt-0.5">
              Permissions, total usage, and 12K memory management
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

        {/* Usage Stats Banner */}
        <div className="grid grid-cols-3 gap-2 px-5 py-3 bg-brand-bg/60 border-b border-brand-border/60">
          <div className="flex flex-col bg-brand-card/40 border border-brand-border/40 rounded-lg p-2 text-center">
            <span className="text-[10px] text-brand-textMuted font-medium uppercase tracking-wider flex items-center justify-center gap-1">
              <Cpu size={11} /> Total Tokens
            </span>
            <span className="text-sm font-bold font-mono text-brand-textMain mt-0.5">{totalTokens.toLocaleString()}</span>
          </div>
          <div className="flex flex-col bg-brand-card/40 border border-brand-border/40 rounded-lg p-2 text-center">
            <span className="text-[10px] text-brand-textMuted font-medium uppercase tracking-wider">In / Out Tokens</span>
            <span className="text-xs font-mono text-brand-textMuted mt-0.5">
              {inputTokens.toLocaleString()} / {outputTokens.toLocaleString()}
            </span>
          </div>
          <div className="flex flex-col bg-brand-card/40 border border-brand-border/40 rounded-lg p-2 text-center">
            <span className="text-[10px] text-brand-textMuted font-medium uppercase tracking-wider flex items-center justify-center gap-1">
              <Coins size={11} className="text-amber-400" /> Total Cost
            </span>
            <span className="text-sm font-bold font-mono text-amber-400 mt-0.5">
              ${totalCost < 0.001 ? '< 0.001' : totalCost.toFixed(4)}
            </span>
          </div>
        </div>

        {/* Content */}
        <div className="p-5 flex flex-col gap-5 max-h-[480px] overflow-y-auto custom-scrollbar">
          {/* Sandbox & Permissions */}
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
          </div>

          {/* Memory Section with Rebuild Memory Button */}
          <div className="flex flex-col gap-2 pt-3 border-t border-brand-border/60">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-brand-textMuted uppercase tracking-wider flex items-center gap-1.5">
                <Brain size={13} className="text-violet-400" /> Chat Memory (12K Limit)
              </span>
              <button
                type="button"
                onClick={handleRebuildMemory}
                disabled={isRebuilding}
                className="px-2.5 py-1 text-[11px] font-semibold bg-violet-500/15 hover:bg-violet-500/25 text-violet-300 border border-violet-500/30 rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
              >
                <RefreshCw size={11} className={isRebuilding ? 'animate-spin' : ''} />
                <span>Rebuild Memory</span>
              </button>
            </div>
            <textarea
              value={memory}
              onChange={(e) => setMemory(e.target.value)}
              placeholder="Chat memory context prepended to requests..."
              rows={4}
              maxLength={12000}
              className="w-full resize-y rounded-xl border border-brand-border bg-brand-bg/40 px-3 py-2 text-xs text-brand-textMain font-mono leading-relaxed placeholder:text-brand-textMuted/40 focus:outline-none focus:border-violet-500"
            />
            <div className="flex justify-end text-[10px] text-brand-textMuted font-mono">
              {memory.length} / 12,000 chars
            </div>
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
