import React, { useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  Check,
  Terminal,
  Trash2,
  Plus,
  Boxes,
  Brain,
  ClipboardList,
  MessageSquareDashed,
  ShieldCheck,
  ShieldAlert,
  Globe
} from 'lucide-react';
import {
  StoredChat,
  StandaloneChatConfig,
  AgentScopeSettings,
  InheritableSandbox,
  InheritableApproval,
  InheritableInternet
} from '../../types';

/**
 * Legacy global config key. Before standalone-chat settings became per-chat, a
 * single record here was shared by every standalone chat. We still read it to
 * seed a chat that has no per-chat config yet, so existing users don't lose
 * their previous settings.
 */
const LEGACY_STORAGE_KEY = 'superagent.standalone-chat-config';

const EMPTY: StandaloneChatConfig = { allowedCommands: [], allowedSkills: [], memory: '', instructions: '' };
const EMPTY_SCOPE: Required<AgentScopeSettings> = { sandbox: 'inherit', approval: 'inherit', internet: 'inherit' };

/** Reads the legacy global config (if any) to seed an unconfigured chat. */
function readLegacyConfig(): StandaloneChatConfig | null {
  try {
    const raw = localStorage.getItem(LEGACY_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StandaloneChatConfig>;
    return {
      allowedCommands: parsed.allowedCommands ?? [],
      allowedSkills: parsed.allowedSkills ?? [],
      memory: parsed.memory ?? '',
      instructions: parsed.instructions ?? ''
    };
  } catch {
    return null;
  }
}

/** Small inline segmented control for the inheritable scope settings. */
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

export interface StandaloneChatPageProps {
  /** The standalone chat being configured. Null → show an empty-state hint. */
  chat: StoredChat | null;
  /** Skills discoverable in the workspace, offered as chat-only skills. */
  availableSkills: { id: string; name: string }[];
  /** Persists this chat's config + sandbox/internet scope. */
  onSave: (config: StandaloneChatConfig, settings: AgentScopeSettings) => void;
  onBack: () => void;
}

/**
 * Per-chat settings for a standalone (project-less) chat: permissions,
 * chat-only skills, memory, instructions, and the sandbox / command-approval /
 * internet scope. These are scoped to the single selected chat, not shared
 * across every standalone chat.
 */
export const StandaloneChatPage: React.FC<StandaloneChatPageProps> = ({ chat, availableSkills, onSave, onBack }) => {
  const [allowedCommands, setAllowedCommands] = useState<string[]>([]);
  const [allowedSkills, setAllowedSkills] = useState<string[]>([]);
  const [memory, setMemory] = useState<string>('');
  const [instructions, setInstructions] = useState<string>('');
  const [sandbox, setSandbox] = useState<InheritableSandbox>('inherit');
  const [approval, setApproval] = useState<InheritableApproval>('inherit');
  const [internet, setInternet] = useState<InheritableInternet>('inherit');
  const [newCommand, setNewCommand] = useState('');
  const [savedFlash, setSavedFlash] = useState(false);
  const commandInputRef = useRef<HTMLInputElement>(null);

  // Load this chat's config. If it has none yet, seed from the legacy global
  // config so a user's previous (shared) settings become this chat's starting
  // point — they can then override and save per-chat.
  useEffect(() => {
    const cfg = chat?.standaloneConfig ?? readLegacyConfig() ?? EMPTY;
    setAllowedCommands(cfg.allowedCommands ?? []);
    setAllowedSkills(cfg.allowedSkills ?? []);
    setMemory(cfg.memory ?? '');
    setInstructions(cfg.instructions ?? '');
    const scope = chat?.settings ?? EMPTY_SCOPE;
    setSandbox(scope.sandbox ?? 'inherit');
    setApproval(scope.approval ?? 'inherit');
    setInternet(scope.internet ?? 'inherit');
  }, [chat?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const persist = (
    config: StandaloneChatConfig,
    scope: AgentScopeSettings = { sandbox, approval, internet }
  ) => {
    if (!chat) return;
    onSave(config, scope);
    setSavedFlash(true);
    setTimeout(() => setSavedFlash(false), 2000);
  };

  const currentConfig = (): StandaloneChatConfig => ({ allowedCommands, allowedSkills, memory, instructions });

  const handleAddCommand = () => {
    const cmd = newCommand.trim();
    if (!cmd || allowedCommands.includes(cmd)) return;
    const next = [...allowedCommands, cmd];
    setAllowedCommands(next);
    setNewCommand('');
    commandInputRef.current?.focus();
    persist({ allowedCommands: next, allowedSkills, memory, instructions });
  };

  const handleRemoveCommand = (index: number) => {
    const next = allowedCommands.filter((_, i) => i !== index);
    setAllowedCommands(next);
    persist({ allowedCommands: next, allowedSkills, memory, instructions });
  };

  const toggleSkill = (id: string) => {
    const next = allowedSkills.includes(id) ? allowedSkills.filter((s) => s !== id) : [...allowedSkills, id];
    setAllowedSkills(next);
    persist({ allowedCommands, allowedSkills: next, memory, instructions });
  };

  const setScope = (partial: Partial<AgentScopeSettings>) => {
    const nextScope: AgentScopeSettings = { sandbox, approval, internet, ...partial };
    if (partial.sandbox !== undefined) setSandbox(partial.sandbox);
    if (partial.approval !== undefined) setApproval(partial.approval);
    if (partial.internet !== undefined) setInternet(partial.internet);
    persist(currentConfig(), nextScope);
  };

  const handleSave = () => persist(currentConfig());

  // No chat selected → guide the user to open one from the sidebar.
  if (!chat) {
    return (
      <div className="flex h-full flex-col bg-brand-bg text-brand-textMain">
        <div className="flex items-center gap-3 border-b border-brand-border px-4 py-3">
          <button className="ui-btn flex-shrink-0" onClick={onBack} aria-label="Back">
            <ArrowLeft size={16} />
          </button>
          <h1 className="font-outfit text-lg font-semibold">Standalone Chat Settings</h1>
        </div>
        <div className="flex flex-1 items-center justify-center px-6 text-center">
          <div className="flex max-w-sm flex-col items-center gap-3 text-brand-textMuted">
            <MessageSquareDashed size={28} className="opacity-60" />
            <p className="text-sm">
              Open a standalone chat's settings from the sidebar (hover a chat under <strong>Chats</strong> and click the
              gear) to configure it. Each standalone chat has its own settings.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col bg-brand-bg text-brand-textMain">
      <div className="flex items-center justify-between gap-3 border-b border-brand-border px-4 py-3">
        <div className="flex items-center gap-3 min-w-0">
          <button className="ui-btn flex-shrink-0" onClick={onBack} aria-label="Back">
            <ArrowLeft size={16} />
          </button>
          <div className="min-w-0">
            <h1 className="font-outfit text-lg font-semibold truncate">Chat Settings: {chat.title}</h1>
            <p className="text-xs text-brand-textMuted truncate">Scoped to this standalone chat only</p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {savedFlash && <span className="text-[11px] text-[color:var(--neon-constructive)]">Saved</span>}
          <button className="ui-btn ui-btn-primary" data-testid="standalone-chat-save" onClick={handleSave}>
            <Check size={15} /> Save
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-6 sm:px-6 sm:py-8">
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
          <div className="flex items-center gap-2 text-xs text-brand-textMuted">
            <MessageSquareDashed size={14} /> These settings apply to this chat only and are saved with it.
          </div>

          {/* Sandbox & permissions scope */}
          <section className="flex flex-col gap-4 rounded-xl border border-brand-border/60 bg-brand-bg/40 p-4">
            <div className="flex flex-col gap-1.5">
              <span className="ui-label flex items-center gap-1.5">
                <ShieldCheck size={13} className="text-[color:var(--neon-constructive)]" /> Sandbox
              </span>
              <Segmented
                value={sandbox}
                onChange={(v) => setScope({ sandbox: v })}
                options={[
                  { value: 'inherit', label: 'Inherit (global)' },
                  { value: 'sandboxed', label: 'Sandboxed' },
                  { value: 'full-access', label: 'Full access' }
                ]}
              />
              <span className="text-[10px] text-brand-textMuted/60">
                Full access lets the agent read/write anywhere on disk; Sandboxed confines file access to authorized folders.
              </span>
            </div>

            <div className="flex flex-col gap-1.5">
              <span className="ui-label flex items-center gap-1.5">
                <ShieldAlert size={13} className="text-[color:var(--neon-attention)]" /> Command approval
              </span>
              <Segmented
                value={approval}
                onChange={(v) => setScope({ approval: v })}
                options={[
                  { value: 'inherit', label: 'Inherit (global)' },
                  { value: 'always', label: 'Always approve' },
                  { value: 'ask', label: 'Ask for approval' },
                  { value: 'never', label: 'Never approve' }
                ]}
              />
              <span className="text-[10px] text-brand-textMuted/60">
                Never approve blocks every command unless it is on the pre-approved list below.
              </span>
            </div>

            <div className="flex flex-col gap-1.5">
              <span className="ui-label flex items-center gap-1.5">
                <Globe size={13} className="text-[color:var(--neon-live)]" /> Internet access
              </span>
              <Segmented
                value={internet}
                onChange={(v) => setScope({ internet: v })}
                options={[
                  { value: 'inherit', label: 'Inherit (global)' },
                  { value: 'all', label: 'Full access' },
                  { value: 'observation', label: 'Observation only' },
                  { value: 'none', label: 'None' }
                ]}
              />
              <span className="text-[10px] text-brand-textMuted/60">
                Observation only allows read-only GET requests; None blocks web fetch, search, and uploads.
              </span>
            </div>
          </section>

          {/* Permissions */}
          <section className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="ui-label flex items-center gap-1.5">
                <Terminal size={13} className="text-violet-400" /> Pre-Approved Shell Commands (Permissions)
              </span>
              <span className="text-[10px] text-brand-textMuted/60 font-mono">{allowedCommands.length} Active</span>
            </div>
            <div className="flex flex-col gap-2.5 bg-brand-bg/40 border border-brand-border/60 rounded-xl p-3">
              {allowedCommands.length === 0 ? (
                <div className="text-xs text-brand-textMuted/50 py-2 text-center italic">All commands require permission checks.</div>
              ) : (
                <div className="flex flex-col gap-1.5 max-h-[140px] overflow-y-auto pr-0.5 custom-scrollbar">
                  {allowedCommands.map((cmd, idx) => (
                    <div key={idx} className="group flex items-center justify-between gap-3 bg-brand-bg border border-brand-border/40 rounded-lg px-2.5 py-1.5 text-xs">
                      <div className="flex items-center gap-2 text-brand-textMuted min-w-0">
                        <Terminal size={12} className="flex-shrink-0 text-[color:var(--neon-constructive)]" />
                        <span className="truncate text-brand-textMain font-mono text-[11px]">{cmd}</span>
                      </div>
                      <button onClick={() => handleRemoveCommand(idx)} className="text-brand-textMuted hover:text-[color:var(--neon-destructive)] p-0.5 rounded transition-colors opacity-0 group-hover:opacity-100">
                        <Trash2 size={12} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <div className="flex gap-2 mt-1">
                <input
                  ref={commandInputRef}
                  type="text"
                  placeholder="e.g. npm run build"
                  value={newCommand}
                  onChange={(e) => setNewCommand(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddCommand(); } }}
                  className="bg-brand-bg border border-brand-border rounded-lg px-3 py-2 text-xs text-brand-textMain focus:outline-none focus:border-brand-textMuted flex-1 font-mono"
                />
                <button onClick={handleAddCommand} disabled={!newCommand.trim()} className="px-3 bg-[var(--brand-highlight)] hover:bg-[var(--brand-highlight-hover)] disabled:opacity-40 disabled:cursor-not-allowed text-[color:var(--brand-highlight-text)] rounded-lg text-xs font-semibold flex items-center justify-center cursor-pointer transition-colors">
                  <Plus size={14} />
                </button>
              </div>
            </div>
          </section>

          {/* Chat-only skills */}
          <section className="flex flex-col gap-2">
            <span className="ui-label flex items-center gap-1.5">
              <Boxes size={13} className="text-[var(--brand-accent)]" /> Chat-Only Skills
            </span>
            {availableSkills.length === 0 ? (
              <div className="text-xs text-brand-textMuted/50 py-2 text-center italic border border-brand-border/60 rounded-xl">No skills discovered yet.</div>
            ) : (
              <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2 bg-brand-bg/40 border border-brand-border/60 rounded-xl p-3 max-h-[220px] overflow-y-auto custom-scrollbar">
                {availableSkills.map((skill) => {
                  const checked = allowedSkills.includes(skill.id);
                  return (
                    <label key={skill.id} className={`flex items-center gap-2 rounded-lg px-2.5 py-2 text-xs cursor-pointer transition-colors ${checked ? 'bg-[var(--brand-accent)]/10' : 'hover:bg-[var(--brand-hover)]'}`}>
                      <input type="checkbox" checked={checked} onChange={() => toggleSkill(skill.id)} className="accent-[var(--brand-accent)]" />
                      <span className="truncate text-brand-textMain">{skill.name}</span>
                    </label>
                  );
                })}
              </div>
            )}
          </section>

          {/* Memory */}
          <section className="flex flex-col gap-2">
            <span className="ui-label flex items-center gap-1.5">
              <Brain size={13} className="text-[color:var(--neon-live)]" /> Chat Memory
            </span>
            <textarea
              value={memory}
              onChange={(e) => setMemory(e.target.value)}
              onBlur={() => persist(currentConfig())}
              placeholder="Facts and context the agent should remember for this chat…"
              rows={5}
              className="w-full resize-y rounded-xl border border-brand-border bg-brand-bg/40 px-3 py-2.5 text-sm text-brand-textMain placeholder:text-brand-textMuted/50 focus:outline-none focus:border-brand-textMuted leading-relaxed"
            />
          </section>

          {/* Instructions */}
          <section className="flex flex-col gap-2">
            <span className="ui-label flex items-center gap-1.5">
              <ClipboardList size={13} className="text-[color:var(--neon-attention)]" /> Chat Instructions
            </span>
            <textarea
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              onBlur={() => persist(currentConfig())}
              placeholder="Standing instructions prepended to this chat's runs…"
              rows={5}
              className="w-full resize-y rounded-xl border border-brand-border bg-brand-bg/40 px-3 py-2.5 text-sm text-brand-textMain placeholder:text-brand-textMuted/50 focus:outline-none focus:border-brand-textMuted leading-relaxed"
            />
          </section>
        </div>
      </div>
    </div>
  );
};

export default StandaloneChatPage;
