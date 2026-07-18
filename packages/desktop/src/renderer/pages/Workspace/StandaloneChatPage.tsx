import React, { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Check, Terminal, Trash2, Plus, Boxes, Brain, ClipboardList, MessageSquareDashed } from 'lucide-react';

const STORAGE_KEY = 'superagent.standalone-chat-config';

interface StandaloneConfig {
  allowedCommands: string[];
  allowedSkills: string[];
  memory: string;
  instructions: string;
}

const EMPTY: StandaloneConfig = { allowedCommands: [], allowedSkills: [], memory: '', instructions: '' };

export interface StandaloneChatPageProps {
  /** Skills discoverable in the workspace, offered as chat-only skills. */
  availableSkills: { id: string; name: string }[];
  onBack: () => void;
}

/**
 * Scoped settings for standalone (project-less) chats: permissions, chat-only
 * skills, memory, and instructions. Persisted locally so it survives reloads
 * without a backend change.
 */
export const StandaloneChatPage: React.FC<StandaloneChatPageProps> = ({ availableSkills, onBack }) => {
  const [allowedCommands, setAllowedCommands] = useState<string[]>([]);
  const [allowedSkills, setAllowedSkills] = useState<string[]>([]);
  const [memory, setMemory] = useState<string>('');
  const [instructions, setInstructions] = useState<string>('');
  const [newCommand, setNewCommand] = useState('');
  const [savedFlash, setSavedFlash] = useState(false);
  const commandInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<StandaloneConfig>;
        setAllowedCommands(parsed.allowedCommands ?? []);
        setAllowedSkills(parsed.allowedSkills ?? []);
        setMemory(parsed.memory ?? '');
        setInstructions(parsed.instructions ?? '');
      }
    } catch {
      /* ignore corrupt config */
    }
  }, []);

  const persist = (next: StandaloneConfig) => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      /* ignore quota errors */
    }
    setSavedFlash(true);
    setTimeout(() => setSavedFlash(false), 2000);
  };

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

  const handleSave = () => persist({ allowedCommands, allowedSkills, memory, instructions });

  return (
    <div className="flex h-full flex-col bg-brand-bg text-brand-textMain">
      <div className="flex items-center justify-between gap-3 border-b border-brand-border px-4 py-3">
        <div className="flex items-center gap-3 min-w-0">
          <button className="ui-btn flex-shrink-0" onClick={onBack} aria-label="Back">
            <ArrowLeft size={16} />
          </button>
          <div className="min-w-0">
            <h1 className="font-outfit text-lg font-semibold truncate">Standalone Chat Settings</h1>
            <p className="text-xs text-brand-textMuted truncate">Scoped to chats not tied to a project</p>
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
            <MessageSquareDashed size={14} /> These settings apply to standalone chats and are stored on this device.
          </div>

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
              onBlur={() => persist({ allowedCommands, allowedSkills, memory, instructions })}
              placeholder="Facts and context the agent should remember for standalone chats…"
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
              onBlur={() => persist({ allowedCommands, allowedSkills, memory, instructions })}
              placeholder="Standing instructions prepended to standalone chat runs…"
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
