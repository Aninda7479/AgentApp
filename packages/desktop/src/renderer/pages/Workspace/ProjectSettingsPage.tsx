import React, { useEffect, useRef, useState } from 'react';
import { X, Plus, Folder, Trash2, Terminal, Check, ArrowLeft, Boxes, Brain, ClipboardList } from 'lucide-react';
import { StoredProject } from '../../types';
import { ProjectService } from '../../logic/project';

export interface ProjectSettingsPageProps {
  /** The project currently being configured, or null if none is selected. */
  project: StoredProject | null;
  /** All projects (used to switch the active project from within the page). */
  projects: StoredProject[];
  /** Skills discoverable in the workspace, offered as project-only skills. */
  availableSkills: { id: string; name: string }[];
  /** Persists the updated project (folders, permissions, skills, memory, instructions). */
  onSave: (updated: StoredProject) => void;
  onBack: () => void;
  onSelectProject: (name: string) => void;
}

/**
 * Full-page project settings: authorized folders (access scope), pre-approved
 * shell commands (permissions), project-only skills, project memory, and
 * instructions. Supersedes the quick-edit ConfigureProjectModal with the full
 * surface the user asked for.
 */
export const ProjectSettingsPage: React.FC<ProjectSettingsPageProps> = ({
  project,
  projects,
  availableSkills,
  onSave,
  onBack,
  onSelectProject
}) => {
  const [folders, setFolders] = useState<string[]>([]);
  const [allowedCommands, setAllowedCommands] = useState<string[]>([]);
  const [allowedSkills, setAllowedSkills] = useState<string[]>([]);
  const [memory, setMemory] = useState<string>('');
  const [instructions, setInstructions] = useState<string>('');
  const [newCommand, setNewCommand] = useState('');
  const commandInputRef = useRef<HTMLInputElement>(null);

  // Re-seed the form whenever the active project changes.
  useEffect(() => {
    setFolders(project?.folders ?? []);
    setAllowedCommands(project?.allowedCommands ?? []);
    setAllowedSkills(project?.allowedSkills ?? []);
    setMemory(project?.memory ?? '');
    setInstructions(project?.instructions ?? '');
    setNewCommand('');
  }, [project?.name, project?.folders, project?.allowedCommands, project?.allowedSkills, project?.memory, project?.instructions]);

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

  const handleSave = () => {
    if (!project) return;
    onSave({
      name: project.name,
      folders,
      allowedCommands,
      allowedSkills,
      memory,
      instructions
    });
  };

  const splitPath = (p: string) => {
    const normalized = p.replace(/\\/g, '/');
    const parts = normalized.split('/').filter(Boolean);
    const leaf = parts[parts.length - 1] || normalized;
    const parent = normalized.slice(0, normalized.length - leaf.length);
    return { parent, leaf };
  };

  if (!project) {
    return (
      <div className="flex h-full flex-col bg-brand-bg text-brand-textMain">
        <div className="flex items-center gap-3 border-b border-brand-border px-4 py-3">
          <button className="ui-btn" onClick={onBack} aria-label="Back">
            <ArrowLeft size={16} />
          </button>
          <h1 className="font-outfit text-lg font-semibold">Project Settings</h1>
        </div>
        <div className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
          <p className="text-sm text-brand-textMuted">Select a project to configure its access, permissions, skills, memory, and instructions.</p>
          <div className="flex flex-wrap justify-center gap-2">
            {projects.map((p) => (
              <button key={p.name} className="ui-btn" onClick={() => onSelectProject(p.name)}>
                <Folder size={14} /> {p.name}
              </button>
            ))}
            {projects.length === 0 && <span className="text-xs text-brand-textMuted/60">No projects yet.</span>}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col bg-brand-bg text-brand-textMain">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 border-b border-brand-border px-4 py-3">
        <div className="flex items-center gap-3 min-w-0">
          <button className="ui-btn flex-shrink-0" onClick={onBack} aria-label="Back">
            <ArrowLeft size={16} />
          </button>
          <div className="min-w-0">
            <h1 className="font-outfit text-lg font-semibold truncate">Project Settings</h1>
            <p className="text-xs text-brand-textMuted truncate">{project.name}</p>
          </div>
        </div>
        <button className="ui-btn ui-btn-primary flex-shrink-0" data-testid="project-settings-save" onClick={handleSave}>
          <Check size={15} /> Save
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-4 py-6 sm:px-6 sm:py-8">
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
          {/* Authorized folders (access) */}
          <section className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="ui-label flex items-center gap-1.5">
                <Folder size={13} className="text-[color:var(--neon-attention)]" /> Authorized Folders (Access)
              </span>
              <span className="text-[10px] text-brand-textMuted/60 font-mono">{folders.length} Authorized</span>
            </div>
            <div className="flex flex-col gap-2 bg-brand-bg/40 border border-brand-border/60 rounded-xl p-3">
              {folders.length === 0 ? (
                <div className="text-xs text-brand-textMuted/50 py-2 text-center italic">No folders authorized for this project yet.</div>
              ) : (
                <div className="flex flex-col gap-1.5 max-h-[140px] overflow-y-auto pr-0.5 custom-scrollbar">
                  {folders.map((folder, idx) => {
                    const { parent, leaf } = splitPath(folder);
                    return (
                      <div key={folder} className="group flex items-center gap-2 bg-brand-bg border border-brand-border/40 rounded-lg px-2.5 py-1.5 text-xs transition-colors">
                        <Folder size={12} className="flex-shrink-0 text-brand-textMuted" />
                        <div className="flex flex-col min-w-0 leading-tight">
                          <span className="truncate text-brand-textMain font-mono">{leaf}</span>
                          {parent && <span className="truncate text-brand-textMuted/60 font-mono text-[9px]">{parent}</span>}
                        </div>
                        <button onClick={() => handleRemoveFolder(idx)} className="ml-auto text-brand-textMuted hover:text-[color:var(--neon-destructive)] p-0.5 rounded transition-colors opacity-0 group-hover:opacity-100">
                          <Trash2 size={12} />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
              <button onClick={handleAddFolder} className="w-full flex items-center justify-center gap-1.5 bg-[var(--brand-hover)] hover:bg-[var(--brand-hover-strong)] border border-brand-border py-2 px-3 rounded-lg text-xs text-brand-textMain transition-all font-medium mt-1 cursor-pointer">
                <Plus size={13} /> Add Folder Path
              </button>
            </div>
          </section>

          {/* Pre-approved shell commands (permissions) */}
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

          {/* Project-only skills */}
          <section className="flex flex-col gap-2">
            <span className="ui-label flex items-center gap-1.5">
              <Boxes size={13} className="text-[var(--brand-accent)]" /> Project-Only Skills
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

          {/* Project memory */}
          <section className="flex flex-col gap-2">
            <span className="ui-label flex items-center gap-1.5">
              <Brain size={13} className="text-[color:var(--neon-live)]" /> Project Memory
            </span>
            <textarea
              value={memory}
              onChange={(e) => setMemory(e.target.value)}
              placeholder="Facts, conventions, and context the agent should remember for this project…"
              rows={5}
              className="w-full resize-y rounded-xl border border-brand-border bg-brand-bg/40 px-3 py-2.5 text-sm text-brand-textMain placeholder:text-brand-textMuted/50 focus:outline-none focus:border-brand-textMuted leading-relaxed"
            />
          </section>

          {/* Project instructions */}
          <section className="flex flex-col gap-2">
            <span className="ui-label flex items-center gap-1.5">
              <ClipboardList size={13} className="text-[color:var(--neon-attention)]" /> Project Instructions
            </span>
            <textarea
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              placeholder="Standing instructions prepended to agent runs in this project…"
              rows={5}
              className="w-full resize-y rounded-xl border border-brand-border bg-brand-bg/40 px-3 py-2.5 text-sm text-brand-textMain placeholder:text-brand-textMuted/50 focus:outline-none focus:border-brand-textMuted leading-relaxed"
            />
          </section>
        </div>
      </div>
    </div>
  );
};

export default ProjectSettingsPage;
