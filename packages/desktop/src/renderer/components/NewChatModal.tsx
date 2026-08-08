import React, { useState, useEffect, useRef } from 'react';
import { Folder, MessageSquare, Plus, X, Check } from 'lucide-react';
import type { StoredProject } from '../types';

export interface NewChatModalProps {
  isOpen: boolean;
  onClose: () => void;
  projects?: StoredProject[];
  activeProject?: string;
  onStartChat: (projectName: string) => void;
}

export const NewChatModal: React.FC<NewChatModalProps> = ({
  isOpen,
  onClose,
  projects = [],
  activeProject = '',
  onStartChat,
}) => {
  const [selectedTarget, setSelectedTarget] = useState<string>(activeProject || '');
  const modalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen) {
      setSelectedTarget(activeProject || '');
    }
  }, [isOpen, activeProject]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isOpen) return;
      if (e.key === 'Escape') {
        onClose();
      } else if (e.key === 'Enter') {
        e.preventDefault();
        onStartChat(selectedTarget);
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, selectedTarget, onStartChat, onClose]);

  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (modalRef.current && !modalRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleOutsideClick);
    }
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      data-testid="new-chat-modal-overlay"
      className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[2000] p-4"
    >
      <div
        ref={modalRef}
        data-testid="new-chat-modal-content"
        className="w-[460px] max-w-full bg-slate-950 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-150"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800/80">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-400">
              <Plus size={18} />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-slate-100">Start New Chat</h2>
              <p className="text-xs text-slate-400">Select where to direct this conversation</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-900 transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        {/* Target Options */}
        <div className="p-4 space-y-2 max-h-[60vh] overflow-y-auto scrollbar-thin scrollbar-thumb-slate-800">
          <div className="text-[10px] font-mono uppercase text-slate-400 font-semibold tracking-wider px-1 mb-1">
            Destination Context
          </div>

          {/* Standalone Chat (No Project) Option */}
          <div
            onClick={() => setSelectedTarget('')}
            className={`flex items-center justify-between p-3 rounded-xl border cursor-pointer transition-all ${
              selectedTarget === ''
                ? 'bg-cyan-500/10 border-cyan-500/40 text-cyan-300 shadow-sm shadow-cyan-500/10'
                : 'bg-slate-900/60 border-slate-800/80 text-slate-300 hover:bg-slate-900 hover:border-slate-700'
            }`}
          >
            <div className="flex items-center gap-3">
              <div className={`p-2 rounded-lg ${selectedTarget === '' ? 'bg-cyan-500/20 text-cyan-400' : 'bg-slate-800 text-slate-400'}`}>
                <MessageSquare size={16} />
              </div>
              <div>
                <div className="text-xs font-semibold">No Project (Standalone Chat)</div>
                <div className="text-[11px] text-slate-400">General conversation without folder binding</div>
              </div>
            </div>
            {selectedTarget === '' && <Check size={16} className="text-cyan-400" />}
          </div>

          {/* Projects Options */}
          {projects.map((proj) => {
            const isSelected = selectedTarget === proj.name;
            const folderPath = proj.folders?.[0];
            return (
              <div
                key={proj.name}
                onClick={() => setSelectedTarget(proj.name)}
                className={`flex items-center justify-between p-3 rounded-xl border cursor-pointer transition-all ${
                  isSelected
                    ? 'bg-cyan-500/10 border-cyan-500/40 text-cyan-300 shadow-sm shadow-cyan-500/10'
                    : 'bg-slate-900/60 border-slate-800/80 text-slate-300 hover:bg-slate-900 hover:border-slate-700'
                }`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className={`p-2 rounded-lg shrink-0 ${isSelected ? 'bg-cyan-500/20 text-cyan-400' : 'bg-slate-800 text-slate-400'}`}>
                    <Folder size={16} />
                  </div>
                  <div className="min-w-0">
                    <div className="text-xs font-semibold truncate">{proj.name}</div>
                    {folderPath && (
                      <div className="text-[11px] text-slate-400 font-mono truncate max-w-[280px]">
                        {folderPath}
                      </div>
                    )}
                  </div>
                </div>
                {isSelected && <Check size={16} className="text-cyan-400 shrink-0 ml-2" />}
              </div>
            );
          })}
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-end gap-2 px-5 py-3.5 bg-slate-900/50 border-t border-slate-800/80">
          <button
            type="button"
            onClick={onClose}
            className="px-3.5 py-1.5 rounded-xl text-xs font-medium text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => {
              onStartChat(selectedTarget);
              onClose();
            }}
            className="px-4 py-1.5 rounded-xl text-xs font-semibold text-white bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 shadow-md shadow-cyan-500/20 transition-all cursor-pointer"
          >
            Start Session
          </button>
        </div>
      </div>
    </div>
  );
};
