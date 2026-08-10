import React, { useEffect, useRef, useState, useMemo } from 'react';
import { X, Check, Plus, Folder, Trash2, Terminal, Boxes, Brain, ClipboardList, ShieldCheck, ShieldAlert, Globe, Cpu, Coins, RefreshCw } from 'lucide-react';
import { StoredProject, StoredChat, InheritableSandbox, InheritableApproval, InheritableInternet } from '../../types';
import { ProjectService } from '../../logic/project';

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

/** Summarizes project history across chats part by part and enforces a strict 12,000 char (12K) limit. */
function rebuildProjectMemory(projectChats: StoredChat[], currentMem: string): string {
  const allSteps: { type: string; content: string }[] = [];
  for (const chat of projectChats) {
    if (chat.steps) {
      for (const s of chat.steps) {
        if (s.content) {
          allSteps.push({ type: s.type || 'step', content: String(s.content) });
        }
      }
    }
  }

  if (allSteps.length === 0) return currentMem.slice(0, 12000);

  const CHUNK_SIZE = 10;
  const chunkSummaries: string[] = [];

  for (let i = 0; i < allSteps.length; i += CHUNK_SIZE) {
    const batch = allSteps.slice(i, i + CHUNK_SIZE);
    const summary = `• Project Part ${Math.floor(i / CHUNK_SIZE) + 1}:\n` +
      batch
        .filter((s) => s.content)
        .slice(0, 4)
        .map((s) => `  - [${s.type.toUpperCase()}]: ${s.content.replace(/\n+/g, ' ').slice(0, 130)}`)
        .join('\n');
    chunkSummaries.push(summary);
  }

  let fullMemory = chunkSummaries.join('\n\n');
  if (currentMem.trim()) {
    fullMemory = `[Existing Project Memory]\n${currentMem.trim()}\n\n[Rebuilt History Summary]\n${fullMemory}`;
  }

  // 12,000 character limit
  const LIMIT = 12000;
  if (fullMemory.length > LIMIT) {
    fullMemory = fullMemory.slice(0, LIMIT);
  }
  return fullMemory;
}

export interface ProjectSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  project: StoredProject | null;
  projectChats?: StoredChat[];
  availableSkills?: { id: string; name: string }[];
  onSave: (updated: StoredProject) => void;
}

/**
 * Popup Modal for Project Settings (replaces full-screen view).
 * Shows Total Token Usage, Total Cost, Permissions, Skills, and 12K Rebuild Memory.
 */
export const ProjectSettingsModal: React.FC<ProjectSettingsModalProps> = ({
  isOpen,
  onClose,
  project,
  projectChats = [],
  availableSkills = [],
  onSave
}) => {
  const [folders, setFolders] = useState<string[]>([]);
  const [allowedCommands, setAllowedCommands] = useState<string[]>([]);
  const [allowedSkills, setAllowedSkills] = useState<string[]>([]);
  const [memory, setMemory] = useState<string>('');
  const [instructions, setInstructions] = useState<string>('');
  const [newCommand, setNewCommand] = useState('');
  const [isRebuilding, setIsRebuilding] = useState(false);
  const [closing, setClosing] = useState(false);
  const commandInputRef = useRef<HTMLInputElement>(null);

  const [sandbox, setSandbox] = useState<InheritableSandbox>('inherit');
  const [approval, setApproval] = useState<InheritableApproval>('inherit');
  const [internet, setInternet] = useState<InheritableInternet>('inherit');

  useEffect(() => {
    if (isOpen && project) {
      setClosing(false);
      setFolders(project.folders ?? []);
      setAllowedCommands(project.allowedCommands ?? []);
      setAllowedSkills(project.allowedSkills ?? []);
      setMemory(project.memory ?? '');
      setInstructions(project.instructions ?? '');
      setSandbox(project.settings?.sandbox ?? 'inherit');
      setApproval(project.settings?.approval ?? 'inherit');
      setInternet(project.settings?.internet ?? 'inherit');
      setNewCommand('');
    }
  }, [isOpen, project]);

  // Aggregate Token Usage & Total Cost for this project's chats
  const { inputTokens, outputTokens, totalTokens, totalCost } = useMemo(() => {
    let input = 0;
    let output = 0;
    for (const chat of projectChats) {
      if (chat.steps) {
        for (const s of chat.steps) {
          const est = Math.ceil((s.content ? s.content.length : 0) / 4);
          if (s.type === 'user') {
            input += est;
          } else {
            output += est;
          }
        }
      }
    }
    const tot = input + output;
    const cost = (input * 1.5 + output * 4.0) / 1000000;
    return { inputTokens: input, outputTokens: output, totalTokens: tot, totalCost: cost };
  }, [projectChats]);

  if (!isOpen || !project) return null;

  const handleDismiss = () => {
    setClosing(true);
    setTimeout(() => {
      onClose();
      setClosing(false);
    }, 150);
  };

  const handleAddFolder = async () => {
    const selected = await ProjectService.selectProjectFolders();
    if (selected === null) {
      const mockPath = `d:/Project/MockPath-${folders.length + 1}`;
      setFolders((prev) => ProjectService.mergeFolders(prev, [mockPath]));
      return;
    }
    if (selected.length > 0) {
      setFolders((prev) => ProjectService.mergeFolders(prev, selected));
    }
  };

  const handleRemoveFolder = (index: number) => setFolders((prev) => prev.filter((_, i) => i !== index));

  const handleAddCommand = () => {
    const cmd = newCommand.trim();
    if (!cmd) return;
    if (!allowedCommands.includes(cmd)) setAllowedCommands((prev) => [...prev, cmd]);
    setNewCommand('');
    commandInputRef.current?.focus();
  };

  const handleRemoveCommand = (index: number) => setAllowedCommands((prev) => prev.filter((_, i) => i !== index));

  const toggleSkill = (id: string) =>
    setAllowedSkills((prev) => (prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]));

  const handleRebuildMemory = () => {
    setIsRebuilding(true);
    setTimeout(() => {
      const rebuilt = rebuildProjectMemory(projectChats, memory);
      setMemory(rebuilt);
      setIsRebuilding(false);
    }, 300);
  };

  const handleSave = () => {
    onSave({
      name: project.name,
      folders,
      allowedCommands,
      allowedSkills,
      memory,
      instructions,
      settings: { sandbox, approval, internet }
    });
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
        className={`bg-brand-sidebar border border-brand-border rounded-2xl w-full max-w-2xl shadow-2xl overflow-hidden text-brand-textMain transition-all duration-150 ${
          closing ? 'opacity-0 scale-95 translate-y-1' : 'opacity-100 scale-100 translate-y-0'
        }`}
      >
        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-brand-border bg-black/20">
          <div className="w-9 h-9 rounded-lg bg-[var(--brand-accent)]/15 border border-[var(--brand-accent)]/30 flex items-center justify-center flex-shrink-0 text-[var(--brand-accent)] font-outfit font-semibold text-sm">
            📁
          </div>
          <div className="flex flex-col min-w-0 flex-1">
            <h3 className="font-semibold text-base text-brand-textMain font-outfit leading-tight truncate">
              Project Settings: {project.name}
            </h3>
            <p className="text-xs text-brand-textMuted leading-tight mt-0.5">
              Access scopes, tokens, cost, permissions, and 12K memory
            </p>
          </div>
          <button
            onClick={handleDismiss}
            aria-label="Close"
            className="ml-auto text-brand-textMuted hover:text-brand-textMain hover:bg-[var(--brand-hover)] rounded-lg p-1.5 transition-colors duration-150 cursor-pointer"
          >
            <X size={16} />
          </button>
        </div>

        {/* Total Token Usage & Total Cost Header */}
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
        <div className="p-5 flex flex-col gap-5 max-h-[520px] overflow-y-auto custom-scrollbar">
          {/* Authorized Folders */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-brand-textMuted uppercase tracking-wider flex items-center gap-1.5">
                <Folder size={13} className="text-amber-400" /> Authorized Folders
              </span>
              <span className="text-[10px] text-brand-textMuted/60 font-mono">{folders.length} Folders</span>
            </div>
            <div className="flex flex-col gap-1.5 max-h-[110px] overflow-y-auto pr-1 custom-scrollbar">
              {folders.map((folder, idx) => (
                <div key={folder} className="flex items-center justify-between bg-brand-bg/40 border border-brand-border/40 rounded-lg px-2.5 py-1.5 text-xs">
                  <span className="truncate font-mono text-brand-textMain">{folder}</span>
                  <button onClick={() => handleRemoveFolder(idx)} className="text-brand-textMuted hover:text-red-400 ml-2">
                    <Trash2 size={12} />
                  </button>
                </div>
              ))}
            </div>
            <button onClick={handleAddFolder} className="w-full flex items-center justify-center gap-1.5 bg-brand-bg/60 hover:bg-brand-bg border border-brand-border py-1.5 rounded-lg text-xs text-brand-textMain font-medium cursor-pointer">
              <Plus size={13} /> Add Folder Path
            </button>
          </div>

          {/* Sandbox & Permissions */}
          <div className="flex flex-col gap-3 pt-2 border-t border-brand-border/40">
            <div className="flex flex-col gap-1.5">
              <span className="text-xs font-bold text-brand-textMuted uppercase tracking-wider flex items-center gap-1.5">
                <ShieldCheck size={13} className="text-[color:var(--neon-constructive)]" /> Sandbox Mode
              </span>
              <Segmented
                value={sandbox}
                onChange={setSandbox}
                options={[
                  { value: 'inherit', label: 'Inherit (global)' },
                  { value: 'sandboxed', label: 'Sandboxed' },
                  { value: 'full-access', label: 'Full access' }
                ]}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <span className="text-xs font-bold text-brand-textMuted uppercase tracking-wider flex items-center gap-1.5">
                <ShieldAlert size={13} className="text-[color:var(--neon-attention)]" /> Command Approval
              </span>
              <Segmented
                value={approval}
                onChange={setApproval}
                options={[
                  { value: 'inherit', label: 'Inherit (global)' },
                  { value: 'always', label: 'Always approve' },
                  { value: 'ask', label: 'Ask for approval' },
                  { value: 'never', label: 'Never approve' }
                ]}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <span className="text-xs font-bold text-brand-textMuted uppercase tracking-wider flex items-center gap-1.5">
                <Globe size={13} className="text-[color:var(--neon-live)]" /> Internet Access
              </span>
              <Segmented
                value={internet}
                onChange={setInternet}
                options={[
                  { value: 'inherit', label: 'Inherit (global)' },
                  { value: 'all', label: 'Full access' },
                  { value: 'observation', label: 'Observation only' },
                  { value: 'none', label: 'None' }
                ]}
              />
            </div>
          </div>

          {/* Pre-Approved Commands */}
          <div className="flex flex-col gap-2 pt-2 border-t border-brand-border/40">
            <span className="text-xs font-bold text-brand-textMuted uppercase tracking-wider flex items-center gap-1.5">
              <Terminal size={13} className="text-violet-400" /> Pre-Approved Commands
            </span>
            <div className="flex gap-2">
              <input
                ref={commandInputRef}
                type="text"
                placeholder="e.g. npm run build"
                value={newCommand}
                onChange={(e) => setNewCommand(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddCommand(); } }}
                className="bg-brand-bg border border-brand-border rounded-lg px-3 py-1.5 text-xs text-brand-textMain flex-1 font-mono outline-none"
              />
              <button onClick={handleAddCommand} disabled={!newCommand.trim()} className="px-3 bg-[var(--brand-highlight)] text-[color:var(--brand-highlight-text)] rounded-lg text-xs font-semibold cursor-pointer">
                Add
              </button>
            </div>
          </div>

          {/* Project-Only Skills */}
          {availableSkills.length > 0 && (
            <div className="flex flex-col gap-2 pt-2 border-t border-brand-border/40">
              <span className="text-xs font-bold text-brand-textMuted uppercase tracking-wider flex items-center gap-1.5">
                <Boxes size={13} className="text-[var(--brand-accent)]" /> Project Skills
              </span>
              <div className="grid grid-cols-2 gap-1.5 max-h-[110px] overflow-y-auto custom-scrollbar">
                {availableSkills.map((skill) => {
                  const checked = allowedSkills.includes(skill.id);
                  return (
                    <label key={skill.id} className="flex items-center gap-2 rounded-lg px-2 py-1 bg-brand-bg/40 text-xs cursor-pointer">
                      <input type="checkbox" checked={checked} onChange={() => toggleSkill(skill.id)} className="accent-[var(--brand-accent)]" />
                      <span className="truncate text-brand-textMain">{skill.name}</span>
                    </label>
                  );
                })}
              </div>
            </div>
          )}

          {/* Project Memory Section with 12K Rebuild Memory Button */}
          <div className="flex flex-col gap-2 pt-2 border-t border-brand-border/40">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-brand-textMuted uppercase tracking-wider flex items-center gap-1.5">
                <Brain size={13} className="text-emerald-400" /> Project Memory (12K Limit)
              </span>
              <button
                type="button"
                onClick={handleRebuildMemory}
                disabled={isRebuilding}
                className="px-2.5 py-1 text-[11px] font-semibold bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 border border-emerald-500/30 rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
              >
                <RefreshCw size={11} className={isRebuilding ? 'animate-spin' : ''} />
                <span>Rebuild Memory</span>
              </button>
            </div>
            <textarea
              value={memory}
              onChange={(e) => setMemory(e.target.value)}
              placeholder="Project memory, conventions, and architectural context..."
              rows={4}
              maxLength={12000}
              className="w-full resize-y rounded-xl border border-brand-border bg-brand-bg/40 px-3 py-2 text-xs text-brand-textMain font-mono leading-relaxed placeholder:text-brand-textMuted/40 focus:outline-none focus:border-emerald-500"
            />
            <div className="flex justify-end text-[10px] text-brand-textMuted font-mono">
              {memory.length} / 12,000 chars
            </div>
          </div>

          {/* Project Instructions */}
          <div className="flex flex-col gap-2 pt-2 border-t border-brand-border/40">
            <span className="text-xs font-bold text-brand-textMuted uppercase tracking-wider flex items-center gap-1.5">
              <ClipboardList size={13} className="text-amber-400" /> Standing Instructions
            </span>
            <textarea
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              placeholder="Standing instructions prepended to agent runs..."
              rows={3}
              className="w-full resize-y rounded-xl border border-brand-border bg-brand-bg/40 px-3 py-2 text-xs text-brand-textMain leading-relaxed placeholder:text-brand-textMuted/40 focus:outline-none focus:border-brand-textMuted"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-brand-border bg-black/10">
          <button
            onClick={handleDismiss}
            className="px-3.5 py-2 text-sm text-brand-textMuted hover:text-brand-textMain transition-colors duration-150 cursor-pointer"
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

export default ProjectSettingsModal;
