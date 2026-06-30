import React, { useState } from 'react';
import { X, Plus, Folder, Trash2 } from 'lucide-react';

export interface StoredProject {
  name: string;
  folders: string[];
}

interface CreateProjectModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreate: (project: StoredProject) => void;
}

export const CreateProjectModal: React.FC<CreateProjectModalProps> = ({
  isOpen,
  onClose,
  onCreate
}) => {
  const [projectName, setProjectName] = useState('');
  const [folders, setFolders] = useState<string[]>([]);

  if (!isOpen) return null;

  const handleAddFolder = async () => {
    const ipc = typeof window !== 'undefined' && (window as any).require
      ? (window as any).require('electron').ipcRenderer
      : null;

    if (!ipc) {
      // Mock folders for non-electron env (e.g. tests)
      const mockPath = `d:/Project/MockProject-${folders.length + 1}`;
      setFolders(prev => [...prev, mockPath]);
      if (!projectName) {
        setProjectName(`MockProject-${folders.length + 1}`);
      }
      return;
    }

    try {
      const selected: string[] = await ipc.invoke('select-project-folders');
      if (selected && selected.length > 0) {
        setFolders(prev => {
          const next = [...prev];
          selected.forEach(p => {
            if (!next.includes(p)) next.push(p);
          });

          // Pre-fill project name from first folder name if empty
          if (!projectName && selected[0]) {
            const normalized = selected[0].replace(/\\/g, '/');
            const parts = normalized.split('/');
            const name = parts[parts.length - 1] || 'New Project';
            setProjectName(name);
          }
          return next;
        });
      }
    } catch (e) {
      console.error('Failed to select folders', e);
    }
  };

  const handleRemoveFolder = (index: number) => {
    setFolders(prev => prev.filter((_, i) => i !== index));
  };

  const handleCreate = () => {
    const trimmedName = projectName.trim();
    if (!trimmedName || folders.length === 0) return;
    onCreate({
      name: trimmedName,
      folders
    });
    // Reset state
    setProjectName('');
    setFolders([]);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[2000] p-4 backdrop-blur-sm">
      <div className="bg-brand-sidebar border border-brand-border rounded-xl w-full max-w-md shadow-2xl overflow-hidden text-brand-textMain">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-brand-border">
          <h3 className="font-semibold text-lg text-white font-outfit">Create Project</h3>
          <button 
            onClick={onClose}
            className="text-brand-textMuted hover:text-white transition-colors duration-150"
          >
            <X size={18} />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 flex flex-col gap-4">
          {/* Project Name Input */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-brand-textMuted uppercase tracking-wider">
              Project Name
            </label>
            <input
              type="text"
              placeholder="e.g. My Website"
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
              className="bg-brand-bg border border-brand-border rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-brand-textMuted transition-colors placeholder-brand-textMuted/50"
            />
          </div>

          {/* Folder Selection */}
          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-semibold text-brand-textMuted uppercase tracking-wider">
              Select Folder(s)
            </span>

            <button
              onClick={handleAddFolder}
              className="w-full flex items-center justify-center gap-2 bg-brand-bg hover:bg-brand-bg/50 border border-brand-border py-2.5 px-4 rounded-lg text-sm text-brand-textMuted hover:text-white transition-all active:scale-[0.99] font-medium"
            >
              <Plus size={16} />
              <span>Add Folder</span>
            </button>

            {/* Selected Folders List */}
            {folders.length > 0 && (
              <div className="mt-2 flex flex-col gap-2 max-h-[140px] overflow-y-auto pr-1">
                {folders.map((folder, idx) => (
                  <div 
                    key={idx}
                    className="flex items-center justify-between gap-3 bg-brand-bg/40 border border-brand-border/60 rounded-lg p-2 text-xs"
                  >
                    <div className="flex items-center gap-2 text-brand-textMuted overflow-hidden">
                      <Folder size={14} className="flex-shrink-0" />
                      <span className="truncate text-white font-mono">{folder}</span>
                    </div>
                    <button 
                      onClick={() => handleRemoveFolder(idx)}
                      className="text-red-400 hover:text-red-300 p-1 rounded hover:bg-red-500/10 transition-colors"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-5 py-4 border-t border-brand-border bg-brand-bg/20">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-brand-textMuted hover:text-white transition-colors duration-150"
          >
            Skip
          </button>
          <button
            onClick={handleCreate}
            disabled={!projectName.trim() || folders.length === 0}
            className="px-5 py-2 text-sm bg-white hover:bg-brand-textMain text-brand-bg rounded-lg font-medium transition-all disabled:opacity-40 disabled:cursor-not-allowed active:scale-[0.98]"
          >
            Create
          </button>
        </div>
      </div>
    </div>
  );
};
