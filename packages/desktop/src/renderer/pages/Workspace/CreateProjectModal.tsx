// import React, { useState } from 'react';
// import { X, Plus, Folder, Trash2 } from 'lucide-react';
// import { StoredProject } from '../../types';

// interface CreateProjectModalProps {
//   isOpen: boolean;
//   onClose: () => void;
//   onCreate: (project: StoredProject) => void;
// }

// export const CreateProjectModal: React.FC<CreateProjectModalProps> = ({
//   isOpen,
//   onClose,
//   onCreate
// }) => {
//   const [projectName, setProjectName] = useState('');
//   const [folders, setFolders] = useState<string[]>([]);

//   if (!isOpen) return null;

//   const handleAddFolder = async () => {
//     const ipc = typeof window !== 'undefined' && (window as any).require
//       ? (window as any).require('electron').ipcRenderer
//       : null;

//     if (!ipc) {
//       // Mock folders for non-electron env (e.g. tests)
//       const mockPath = `d:/Project/MockProject-${folders.length + 1}`;
//       setFolders(prev => [...prev, mockPath]);
//       if (!projectName) {
//         setProjectName(`MockProject-${folders.length + 1}`);
//       }
//       return;
//     }

//     try {
//       const selected: string[] = await ipc.invoke('select-project-folders');
//       if (selected && selected.length > 0) {
//         setFolders(prev => {
//           const next = [...prev];
//           selected.forEach(p => {
//             if (!next.includes(p)) next.push(p);
//           });

//           // Pre-fill project name from first folder name if empty
//           if (!projectName && selected[0]) {
//             const normalized = selected[0].replace(/\\/g, '/');
//             const parts = normalized.split('/');
//             const name = parts[parts.length - 1] || 'New Project';
//             setProjectName(name);
//           }
//           return next;
//         });
//       }
//     } catch (e) {
//       console.error('Failed to select folders', e);
//     }
//   };

//   const handleRemoveFolder = (index: number) => {
//     setFolders(prev => prev.filter((_, i) => i !== index));
//   };

//   const handleCreate = () => {
//     const trimmedName = projectName.trim();
//     if (!trimmedName || folders.length === 0) return;
//     onCreate({
//       name: trimmedName,
//       folders
//     });
//     // Reset state
//     setProjectName('');
//     setFolders([]);
//     onClose();
//   };

//   return (
//     <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[2000] p-4 backdrop-blur-sm">
//       <div className="bg-brand-sidebar border border-brand-border rounded-xl w-full max-w-md shadow-2xl overflow-hidden text-brand-textMain">
//         {/* Header */}
//         <div className="flex items-center justify-between px-5 py-4 border-b border-brand-border">
//           <h3 className="font-semibold text-lg text-white font-outfit">Create Project</h3>
//           <button 
//             onClick={onClose}
//             className="text-brand-textMuted hover:text-white transition-colors duration-150"
//           >
//             <X size={18} />
//           </button>
//         </div>

//         {/* Content */}
//         <div className="p-5 flex flex-col gap-4">
//           {/* Project Name Input */}
//           <div className="flex flex-col gap-1.5">
//             <label className="text-xs font-semibold text-brand-textMuted uppercase tracking-wider">
//               Project Name
//             </label>
//             <input
//               type="text"
//               placeholder="e.g. My Website"
//               value={projectName}
//               onChange={(e) => setProjectName(e.target.value)}
//               className="bg-brand-bg border border-brand-border rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-brand-textMuted transition-colors placeholder-brand-textMuted/50"
//             />
//           </div>

//           {/* Folder Selection */}
//           <div className="flex flex-col gap-1.5">
//             <span className="text-xs font-semibold text-brand-textMuted uppercase tracking-wider">
//               Select Folder(s)
//             </span>

//             <button
//               onClick={handleAddFolder}
//               className="w-full flex items-center justify-center gap-2 bg-brand-bg hover:bg-brand-bg/50 border border-brand-border py-2.5 px-4 rounded-lg text-sm text-brand-textMuted hover:text-white transition-all active:scale-[0.99] font-medium"
//             >
//               <Plus size={16} />
//               <span>Add Folder</span>
//             </button>

//             {/* Selected Folders List */}
//             {folders.length > 0 && (
//               <div className="mt-2 flex flex-col gap-2 max-h-[140px] overflow-y-auto pr-1">
//                 {folders.map((folder, idx) => (
//                   <div 
//                     key={idx}
//                     className="flex items-center justify-between gap-3 bg-brand-bg/40 border border-brand-border/60 rounded-lg p-2 text-xs"
//                   >
//                     <div className="flex items-center gap-2 text-brand-textMuted overflow-hidden">
//                       <Folder size={14} className="flex-shrink-0" />
//                       <span className="truncate text-white font-mono">{folder}</span>
//                     </div>
//                     <button 
//                       onClick={() => handleRemoveFolder(idx)}
//                       className="text-[color:var(--neon-destructive)] hover:text-[color:var(--neon-destructive)] p-1 rounded hover:bg-[color:var(--neon-destructive)]/10 transition-colors"
//                     >
//                       <Trash2 size={13} />
//                     </button>
//                   </div>
//                 ))}
//               </div>
//             )}
//           </div>
//         </div>

//         {/* Footer */}
//         <div className="flex items-center justify-end gap-3 px-5 py-4 border-t border-brand-border bg-brand-bg/20">
//           <button
//             onClick={onClose}
//             className="px-4 py-2 text-sm text-brand-textMuted hover:text-white transition-colors duration-150"
//           >
//             Skip
//           </button>
//           <button
//             onClick={handleCreate}
//             disabled={!projectName.trim() || folders.length === 0}
//             className="px-5 py-2 text-sm bg-white hover:bg-brand-textMain text-brand-bg rounded-lg font-medium transition-all disabled:opacity-40 disabled:cursor-not-allowed active:scale-[0.98]"
//           >
//             Create
//           </button>
//         </div>
//       </div>
//     </div>
//   );
// };

import React, { useState, useRef, useEffect } from 'react';
import { X, Plus, Folder, Trash2, FolderOpen, ArrowRight } from 'lucide-react';
import { StoredProject } from '../../types';
import { ProjectService } from '../../logic/project';

interface CreateProjectModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreate: (project: StoredProject) => void;
}

/** Modal dialog for creating a new project with a name and folder selection. */
export const CreateProjectModal: React.FC<CreateProjectModalProps> = ({
  isOpen,
  onClose,
  onCreate
}) => {
  const [projectName, setProjectName] = useState('');
  const [folders, setFolders] = useState<string[]>([]);
  const [touched, setTouched] = useState(false);
  const [closing, setClosing] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setClosing(false);
      const t = setTimeout(() => inputRef.current?.focus(), 50);
      return () => clearTimeout(t);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const isValid = projectName.trim().length > 0 && folders.length > 0;

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
      // Not running in Electron — fall back to mock folders (e.g. tests)
      const mockPath = `d:/Project/MockProject-${folders.length + 1}`;
      setFolders(prev => [...prev, mockPath]);
      if (!projectName) {
        setProjectName(`MockProject-${folders.length + 1}`);
      }
      return;
    }

    if (selected.length > 0) {
      setFolders(prev => {
        const next = ProjectService.mergeFolders(prev, selected);
        if (!projectName && selected[0]) {
          setProjectName(ProjectService.deriveNameFromPath(selected[0]));
        }
        return next;
      });
    }
  };

  const handleRemoveFolder = (index: number) => {
    setFolders(prev => prev.filter((_, i) => i !== index));
  };

  const handleCreate = () => {
    setTouched(true);
    const trimmedName = projectName.trim();
    if (!trimmedName || folders.length === 0) return;
    onCreate(ProjectService.buildProject(trimmedName, folders));
    setProjectName('');
    setFolders([]);
    setTouched(false);
    onClose();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') handleDismiss();
    if (e.key === 'Enter' && isValid) handleCreate();
  };

  // Split a path into { parent, leaf } so the folder name reads clearly
  const splitPath = (p: string) => {
    const normalized = p.replace(/\\/g, '/');
    const parts = normalized.split('/').filter(Boolean);
    const leaf = parts[parts.length - 1] || normalized;
    const parent = normalized.slice(0, normalized.length - leaf.length);
    return { parent, leaf };
  };

  const initial = projectName.trim().charAt(0).toUpperCase();

  return (
    <div
      className={`fixed inset-0 bg-black/70 flex items-center justify-center z-[2000] p-4 backdrop-blur-sm transition-opacity duration-150 ${
        closing ? 'opacity-0' : 'opacity-100'
      }`}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) handleDismiss();
      }}
      onKeyDown={handleKeyDown}
    >
      <div
        className={`bg-brand-sidebar border border-brand-border rounded-2xl w-full max-w-md shadow-2xl overflow-hidden text-brand-textMain transition-all duration-150 ${
          closing ? 'opacity-0 scale-95 translate-y-1' : 'opacity-100 scale-100 translate-y-0'
        }`}
      >
        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-brand-border">
          <div className="w-9 h-9 rounded-lg bg-[var(--brand-hover)] border border-brand-border flex items-center justify-center flex-shrink-0 text-brand-textMain font-outfit font-semibold text-sm">
            {initial || <Folder size={16} className="text-brand-textMuted" />}
          </div>
          <div className="flex flex-col min-w-0">
            <h3 className="font-semibold text-base text-brand-textMain font-outfit leading-tight">
              Create project
            </h3>
            <p className="text-xs text-brand-textMuted leading-tight">
              Name it and add the folders it lives in
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
        <div className="p-5 flex flex-col gap-4">
          {/* Project Name Input */}
          <div className="flex flex-col gap-1.5">
            <label htmlFor="project-name" className="text-xs font-semibold text-brand-textMuted uppercase tracking-wider">
              Project name
            </label>
            <input
              id="project-name"
              ref={inputRef}
              type="text"
              placeholder="e.g. My Website"
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
              className={`bg-brand-bg border rounded-lg px-3 py-2.5 text-sm text-brand-textMain focus:outline-none focus:ring-2 transition-colors placeholder-brand-textMuted/50 ${
                touched && !projectName.trim()
                  ? 'border-[color:var(--neon-destructive)]/60 focus:ring-[color:var(--neon-destructive)]/30'
                  : 'border-brand-border focus:ring-brand-border-strong focus:border-brand-textMuted'
              }`}
            />
            {touched && !projectName.trim() && (
              <span className="text-xs text-[color:var(--neon-destructive)]">Give your project a name</span>
            )}
          </div>

          {/* Folder Selection */}
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-brand-textMuted uppercase tracking-wider">
                Folders
              </span>
              {folders.length > 0 && (
                <span className="text-[11px] text-brand-textMuted font-mono">
                  {folders.length} added
                </span>
              )}
            </div>

            {folders.length === 0 ? (
              <button
                onClick={handleAddFolder}
                className={`w-full flex flex-col items-center justify-center gap-2 bg-brand-bg hover:bg-[var(--brand-hover)] border border-dashed rounded-xl py-6 px-4 text-sm transition-all active:scale-[0.99] ${
                  touched && folders.length === 0
                    ? 'border-[color:var(--neon-destructive)]/50 text-[color:var(--neon-destructive)]'
                    : 'border-brand-border text-brand-textMuted hover:text-brand-textMain hover:border-brand-textMuted'
                }`}
              >
                <FolderOpen size={20} />
                <span className="font-medium">Add a folder to get started</span>
              </button>
            ) : (
              <>
                <div className="flex flex-col gap-1.5 max-h-[168px] overflow-y-auto pr-0.5 -mr-0.5">
                  {folders.map((folder, idx) => {
                    const { parent, leaf } = splitPath(folder);
                    return (
                      <div
                        key={folder}
                        className="group flex items-center gap-2.5 bg-brand-bg/60 border border-brand-border/60 hover:border-brand-border rounded-lg px-2.5 py-2 text-xs transition-colors"
                      >
                        <Folder size={14} className="flex-shrink-0 text-brand-textMuted" />
                        <div className="flex flex-col min-w-0 leading-tight">
                          <span className="truncate text-brand-textMain font-mono">{leaf}</span>
                          {parent && (
                            <span className="truncate text-brand-textMuted/70 font-mono text-[10px]">
                              {parent}
                            </span>
                          )}
                        </div>
                        <button
                          onClick={() => handleRemoveFolder(idx)}
                          aria-label={`Remove ${leaf}`}
                          className="ml-auto flex-shrink-0 text-brand-textMuted hover:text-[color:var(--neon-destructive)] p-1 rounded hover:bg-[color:var(--neon-destructive)]/10 transition-colors opacity-0 group-hover:opacity-100"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    );
                  })}
                </div>
                <button
                  onClick={handleAddFolder}
                  className="w-full flex items-center justify-center gap-1.5 bg-transparent hover:bg-[var(--brand-hover)] border border-brand-border/60 hover:border-brand-border py-2 px-3 rounded-lg text-xs text-brand-textMuted hover:text-brand-textMain transition-all active:scale-[0.99] font-medium"
                >
                  <Plus size={13} />
                  <span>Add another folder</span>
                </button>
              </>
            )}
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
            onClick={handleCreate}
            className="group flex items-center gap-1.5 px-4 py-2 text-sm bg-[var(--brand-highlight)] hover:bg-[var(--brand-highlight-hover)] text-[color:var(--brand-highlight-text)] rounded-lg font-medium transition-all active:scale-[0.98]"
          >
            <span>Create project</span>
            <ArrowRight size={14} className="transition-transform duration-150 group-hover:translate-x-0.5" />
          </button>
        </div>
      </div>
    </div>
  );
};