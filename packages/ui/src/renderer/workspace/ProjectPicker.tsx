import React, { useState, useRef, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, Check, Folder, Plus, Search, X, FolderGit2 } from 'lucide-react';
import { useChatStore, chatStore } from '../stores/chatStore';

export interface ProjectPickerProps {
  selectedProject?: string;
  onSelectProject?: (projectName: string) => void;
  onCreateProject?: () => void;
  buttonClassName?: string;
  variant?: 'compact' | 'pill';
}

export const ProjectPicker: React.FC<ProjectPickerProps> = ({
  selectedProject,
  onSelectProject,
  onCreateProject,
  buttonClassName,
  variant = 'compact',
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const projects = useChatStore((s) => s.projects) || [];
  const activeProjectFromStore = useChatStore((s) => s.activeProject);
  const draftProjectFromStore = useChatStore((s) => s.draftProject);

  const effectiveProject = selectedProject !== undefined
    ? selectedProject
    : (draftProjectFromStore || activeProjectFromStore || '');

  const triggerRef = useRef<HTMLButtonElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [coords, setCoords] = useState({ top: 0, left: 0, width: 0, height: 0, openUpward: true });

  const handleSelect = (projectName: string) => {
    chatStore.setDraftProject(projectName);
    chatStore.setActiveProject(projectName);
    if (onSelectProject) {
      onSelectProject(projectName);
    }
    setIsOpen(false);
    setSearchQuery('');
  };

  const handleCreateNew = () => {
    setIsOpen(false);
    if (onCreateProject) {
      onCreateProject();
    } else {
      window.dispatchEvent(new CustomEvent('open-create-project-modal'));
    }
  };

  const updateCoords = () => {
    if (triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom;
      const openUpward = spaceBelow < 320 && rect.top > spaceBelow;
      const targetWidth = Math.min(window.innerWidth - 16, Math.max(rect.width, 260));
      const left = Math.max(8, Math.min(rect.left, window.innerWidth - targetWidth - 8));
      setCoords({
        top: rect.top,
        left,
        width: targetWidth,
        height: rect.height,
        openUpward,
      });
    }
  };

  useEffect(() => {
    const handleClickOutside = (evt: MouseEvent) => {
      const target = evt.target as Node;
      const insideTrigger = triggerRef.current?.contains(target) ?? false;
      const insidePopup = popupRef.current?.contains(target) ?? false;
      if (!insideTrigger && !insidePopup) {
        setIsOpen(false);
        setSearchQuery('');
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (!isOpen) {
      setSearchQuery('');
      return;
    }
    updateCoords();
    requestAnimationFrame(() => {
      searchInputRef.current?.focus();
    });
    window.addEventListener('scroll', updateCoords, true);
    window.addEventListener('resize', updateCoords);
    return () => {
      window.removeEventListener('scroll', updateCoords, true);
      window.removeEventListener('resize', updateCoords);
    };
  }, [isOpen]);

  const filteredProjects = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return projects;
    return projects.filter((p) => p.name.toLowerCase().includes(q));
  }, [projects, searchQuery]);

  const displayLabel = effectiveProject || 'No Project';

  return (
    <div className="relative inline-block">
      <button
        ref={triggerRef}
        type="button"
        data-testid="project-select-btn"
        onClick={() => {
          updateCoords();
          setIsOpen(!isOpen);
        }}
        className={
          buttonClassName ||
          (variant === 'pill'
            ? `group inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium bg-brand-card/70 hover:bg-brand-hover border border-brand-border/60 transition-all cursor-pointer shadow-xs ${
                isOpen ? 'bg-brand-hover border-brand-border-strong text-brand-textMain' : 'text-brand-textMain'
              }`
            : `group inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium transition-colors select-none cursor-pointer ${
                isOpen
                  ? 'bg-brand-hover text-brand-textMain'
                  : 'text-brand-textMuted hover:text-brand-textMain hover:bg-brand-hover'
              }`)
        }
        title={`Workspace: ${displayLabel}`}
        aria-label={`Select workspace or project, currently ${displayLabel}`}
      >
        <Folder size={12} className="text-brand-textMuted group-hover:text-brand-textMain shrink-0 transition-colors" />
        <span className="truncate max-w-[120px] sm:max-w-[170px]">{displayLabel}</span>
        <ChevronDown size={11} className="text-brand-textMuted/60 group-hover:text-brand-textMuted shrink-0 transition-transform duration-150" />
      </button>

      {isOpen && typeof document !== 'undefined' && createPortal(
        <div
          ref={popupRef}
          style={{
            position: 'fixed',
            left: `${coords.left}px`,
            width: `${coords.width}px`,
            maxWidth: 'calc(100vw - 16px)',
            ...(coords.openUpward
              ? { bottom: `${window.innerHeight - coords.top + 6}px` }
              : { top: `${coords.top + coords.height + 6}px` }),
            maxHeight: coords.openUpward
              ? `${Math.min(340, Math.max(180, coords.top - 20))}px`
              : `${Math.min(340, Math.max(180, window.innerHeight - (coords.top + coords.height) - 20))}px`,
          }}
          className="z-[99999] flex flex-col bg-brand-popover/95 backdrop-blur-2xl border border-brand-border rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-100"
        >
          {/* Search Box */}
          <div className="p-2 border-b border-brand-border/60 shrink-0 bg-brand-popover/50">
            <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-xl bg-brand-card/80 border border-brand-border focus-within:border-brand-border-strong text-xs">
              <Search size={13} className="text-brand-textMuted shrink-0" />
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') {
                    setIsOpen(false);
                    setSearchQuery('');
                  }
                }}
                placeholder="Search projects..."
                className="w-full bg-transparent text-xs text-brand-textMain placeholder:text-brand-textMuted/60 focus:outline-none"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="text-brand-textMuted hover:text-brand-textMain p-0.5 rounded cursor-pointer"
                  aria-label="Clear search"
                >
                  <X size={12} />
                </button>
              )}
            </div>
          </div>

          {/* Project List */}
          <div className="flex-1 overflow-y-auto p-1.5 space-y-0.5 scrollbar-thin scrollbar-thumb-neutral-700">
            {/* Standalone / No Project option */}
            <button
              type="button"
              onClick={() => handleSelect('')}
              className={`w-full flex items-center justify-between px-2.5 py-2 rounded-xl text-xs transition-colors cursor-pointer text-left ${
                !effectiveProject
                  ? 'bg-brand-card text-brand-textMain font-medium border border-brand-border/60'
                  : 'text-brand-textMuted hover:text-brand-textMain hover:bg-brand-hover'
              }`}
            >
              <div className="flex items-center gap-2 min-w-0">
                <FolderGit2 size={14} className="text-brand-textMuted shrink-0" />
                <span className="truncate">No Project (Standalone)</span>
              </div>
              {!effectiveProject && <Check size={13} className="text-brand-textMain shrink-0 ml-1.5" />}
            </button>

            {/* Existing Projects */}
            {filteredProjects.length > 0 && (
              <div className="pt-1.5 pb-0.5 px-2">
                <span className="text-[10px] font-mono uppercase tracking-wider text-brand-textMuted/70">
                  Projects ({filteredProjects.length})
                </span>
              </div>
            )}

            {filteredProjects.map((p) => {
              const isSelected = effectiveProject.toLowerCase() === p.name.toLowerCase();
              return (
                <button
                  key={p.name}
                  type="button"
                  onClick={() => handleSelect(p.name)}
                  className={`w-full flex items-center justify-between px-2.5 py-2 rounded-xl text-xs transition-colors cursor-pointer text-left ${
                    isSelected
                      ? 'bg-brand-card text-brand-textMain font-medium border border-brand-border/60'
                      : 'text-brand-textMuted hover:text-brand-textMain hover:bg-brand-hover'
                  }`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <Folder size={14} className={isSelected ? 'text-brand-textMain shrink-0' : 'text-brand-textMuted shrink-0'} />
                    <span className="truncate">{p.name}</span>
                  </div>
                  {isSelected && <Check size={13} className="text-brand-textMain shrink-0 ml-1.5" />}
                </button>
              );
            })}

            {filteredProjects.length === 0 && searchQuery && (
              <div className="py-6 text-center text-xs text-brand-textMuted">
                No projects matching &ldquo;{searchQuery}&rdquo;
              </div>
            )}
          </div>

          {/* Create Project Action at Bottom */}
          <div className="p-1.5 border-t border-brand-border/60 shrink-0 bg-brand-card/40">
            <button
              type="button"
              data-testid="btn-create-project-picker"
              onClick={handleCreateNew}
              className="w-full flex items-center gap-2 px-2.5 py-2 rounded-xl text-xs text-brand-textMain hover:bg-brand-hover transition-colors font-medium cursor-pointer"
            >
              <Plus size={13} className="text-brand-textMain shrink-0" />
              <span>Create new project...</span>
            </button>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};
