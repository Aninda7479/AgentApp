import React, { useState, useEffect, useRef } from 'react';
import { X, Plus, Folder, Trash2, FolderOpen, Terminal, Check } from 'lucide-react';
import { StoredProject } from '../types';
import { ProjectService } from '../logic/project';

/** Props for the ConfigureProjectModal component. */
interface ConfigureProjectModalProps {
  isOpen: boolean;
  onClose: () => void;
  project: StoredProject | null;
  onSave: (updatedProject: StoredProject) => void;
}

/** Modal for configuring project folders and pre-approved shell commands. */
export const ConfigureProjectModal: React.FC<ConfigureProjectModalProps> = ({
  isOpen,
  onClose,
  project,
  onSave
}) => {
  const [folders, setFolders] = useState<string[]>([]);
  const [allowedCommands, setAllowedCommands] = useState<string[]>([]);
  const [newCommand, setNewCommand] = useState('');
  const [closing, setClosing] = useState(false);
  const commandInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen && project) {
      setClosing(false);
      setFolders(project.folders ?? []);
      setAllowedCommands(project.allowedCommands ?? []);
      setNewCommand('');
    }
  }, [isOpen, project]);

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
      // Not running in Electron — fall back to mock folders
      const mockPath = `d:/Project/MockPath-${folders.length + 1}`;
      setFolders(prev => [...prev, mockPath]);
      return;
    }

    if (selected.length > 0) {
      setFolders(prev => ProjectService.mergeFolders(prev, selected));
    }
  };

  const handleRemoveFolder = (index: number) => {
    setFolders(prev => prev.filter((_, i) => i !== index));
  };

  const handleAddCommand = () => {
    const cmd = newCommand.trim();
    if (!cmd) return;
    if (!allowedCommands.includes(cmd)) {
      setAllowedCommands(prev => [...prev, cmd]);
    }
    setNewCommand('');
    commandInputRef.current?.focus();
  };

  const handleRemoveCommand = (index: number) => {
    setAllowedCommands(prev => prev.filter((_, i) => i !== index));
  };

  const handleSave = () => {
    onSave({
      name: project.name,
      folders,
      allowedCommands
    });
    handleDismiss();
  };

  const splitPath = (p: string) => {
    const normalized = p.replace(/\\/g, '/');
    const parts = normalized.split('/').filter(Boolean);
    const leaf = parts[parts.length - 1] || normalized;
    const parent = normalized.slice(0, normalized.length - leaf.length);
    return { parent, leaf };
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
            <h3 className="font-semibold text-base text-white font-outfit leading-tight">
              Project Settings: {project.name}
            </h3>
            <p className="text-xs text-brand-textMuted leading-tight mt-0.5">
              Configure path authorization and allowed shell commands
            </p>
          </div>
          <button
            onClick={handleDismiss}
            aria-label="Close"
            className="ml-auto text-brand-textMuted hover:text-white hover:bg-white/5 rounded-lg p-1.5 transition-colors duration-150"
          >
            <X size={16} />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 flex flex-col gap-5 max-h-[460px] overflow-y-auto custom-scrollbar">
          {/* Folders List Section */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-brand-textMuted uppercase tracking-wider flex items-center gap-1.5">
                <Folder size={13} className="text-amber-500" /> Authorized Folders
              </span>
              <span className="text-[10px] text-brand-textMuted/60 font-mono">
                {folders.length} Authorized
              </span>
            </div>

            <div className="flex flex-col gap-2 bg-brand-bg/40 border border-brand-border/60 rounded-xl p-3">
              {folders.length === 0 ? (
                <div className="text-xs text-brand-textMuted/50 py-2 text-center italic">
                  No folders authorized for this project yet.
                </div>
              ) : (
                <div className="flex flex-col gap-1.5 max-h-[120px] overflow-y-auto pr-0.5 custom-scrollbar">
                  {folders.map((folder, idx) => {
                    const { parent, leaf } = splitPath(folder);
                    return (
                      <div
                        key={folder}
                        className="group flex items-center gap-2 bg-brand-bg border border-brand-border/40 rounded-lg px-2.5 py-1.5 text-xs transition-colors"
                      >
                        <Folder size={12} className="flex-shrink-0 text-brand-textMuted" />
                        <div className="flex flex-col min-w-0 leading-tight">
                          <span className="truncate text-white font-mono">{leaf}</span>
                          {parent && (
                            <span className="truncate text-brand-textMuted/60 font-mono text-[9px]">
                              {parent}
                            </span>
                          )}
                        </div>
                        <button
                          onClick={() => handleRemoveFolder(idx)}
                          className="ml-auto text-brand-textMuted hover:text-red-400 p-0.5 rounded transition-colors opacity-0 group-hover:opacity-100"
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
              <button
                onClick={handleAddFolder}
                className="w-full flex items-center justify-center gap-1.5 bg-white/5 hover:bg-white/10 border border-brand-border py-2 px-3 rounded-lg text-xs text-brand-textMain transition-all font-medium mt-1 cursor-pointer"
              >
                <Plus size={13} />
                <span>Add Folder Path</span>
              </button>
            </div>
          </div>

          {/* Terminal Commands Section */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-brand-textMuted uppercase tracking-wider flex items-center gap-1.5">
                <Terminal size={13} className="text-violet-400" /> Pre-Approved Shell Commands
              </span>
              <span className="text-[10px] text-brand-textMuted/60 font-mono">
                {allowedCommands.length} Active
              </span>
            </div>

            <div className="flex flex-col gap-2.5 bg-brand-bg/40 border border-brand-border/60 rounded-xl p-3">
              {/* List */}
              {allowedCommands.length === 0 ? (
                <div className="text-xs text-brand-textMuted/50 py-2 text-center italic">
                  All commands require permission checks.
                </div>
              ) : (
                <div className="flex flex-col gap-1.5 max-h-[120px] overflow-y-auto pr-0.5 custom-scrollbar">
                  {allowedCommands.map((cmd, idx) => (
                    <div
                      key={idx}
                      className="group flex items-center justify-between gap-3 bg-brand-bg border border-brand-border/40 rounded-lg px-2.5 py-1.5 text-xs"
                    >
                      <div className="flex items-center gap-2 text-brand-textMuted min-w-0">
                        <Terminal size={12} className="flex-shrink-0 text-emerald-400" />
                        <span className="truncate text-white font-mono text-[11px]">{cmd}</span>
                      </div>
                      <button
                        onClick={() => handleRemoveCommand(idx)}
                        className="text-brand-textMuted hover:text-red-400 p-0.5 rounded transition-colors opacity-0 group-hover:opacity-100"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Add Input */}
              <div className="flex gap-2 mt-1">
                <input
                  ref={commandInputRef}
                  type="text"
                  placeholder="e.g. npm run build"
                  value={newCommand}
                  onChange={(e) => setNewCommand(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleAddCommand();
                    }
                  }}
                  className="bg-brand-bg border border-brand-border rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-brand-textMuted flex-1 font-mono"
                />
                <button
                  onClick={handleAddCommand}
                  disabled={!newCommand.trim()}
                  className="px-3 bg-white hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed text-brand-bg rounded-lg text-xs font-semibold flex items-center justify-center cursor-pointer transition-colors"
                >
                  <Plus size={14} />
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-brand-border bg-black/10">
          <button
            onClick={handleDismiss}
            className="px-3.5 py-2 text-sm text-brand-textMuted hover:text-white transition-colors duration-150"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="flex items-center gap-1.5 px-4 py-2 text-sm bg-white hover:bg-gray-100 text-brand-bg rounded-lg font-medium transition-all active:scale-[0.98] cursor-pointer"
          >
            <Check size={14} />
            <span>Save Settings</span>
          </button>
        </div>
      </div>
    </div>
  );
};
