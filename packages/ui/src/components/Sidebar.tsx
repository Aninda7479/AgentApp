import React from 'react';
import { Plus, MessageSquare, Folder, Sliders, X, Sparkles, Server } from 'lucide-react';
import { ChatSession } from '../types.js';

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
  sessions: ChatSession[];
  activeSessionId: string;
  onSelectSession: (id: string) => void;
  onNewSession: () => void;
  onOpenSettings: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  isOpen,
  onClose,
  sessions,
  activeSessionId,
  onSelectSession,
  onNewSession,
  onOpenSettings
}) => {
  return (
    <>
      {/* Backdrop overlay for mobile screen drawer */}
      {isOpen && (
        <div
          onClick={onClose}
          className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-40 md:hidden"
        />
      )}

      <aside
        className={`fixed md:static inset-y-0 left-0 z-50 w-64 bg-slate-950 border-r border-slate-800 flex flex-col transition-transform duration-200 ease-in-out ${
          isOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
        }`}
      >
        {/* Top Action Header */}
        <div className="p-3 border-b border-slate-800 flex items-center justify-between">
          <button
            onClick={onNewSession}
            className="flex-1 flex items-center justify-center space-x-2 py-2 px-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-semibold shadow-md transition-colors"
          >
            <Plus className="w-4 h-4" />
            <span>New Agent Run</span>
          </button>
          <button
            onClick={onClose}
            className="md:hidden ml-2 p-1.5 text-slate-400 hover:text-slate-200"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Chat History List */}
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          <div className="px-2 py-1.5 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
            Recent Sessions
          </div>
          {sessions.length === 0 ? (
            <div className="px-3 py-6 text-center text-xs text-slate-400">
              No previous runs. Start a new conversation!
            </div>
          ) : (
            sessions.map((session) => (
              <button
                key={session.id}
                onClick={() => {
                  onSelectSession(session.id);
                  onClose();
                }}
                className={`w-full text-left px-3 py-2 rounded-lg flex items-center space-x-2.5 text-xs transition-colors ${
                  session.id === activeSessionId
                    ? 'bg-slate-800 text-slate-100 font-medium'
                    : 'text-slate-400 hover:bg-slate-900 hover:text-slate-200'
                }`}
              >
                <MessageSquare className="w-3.5 h-3.5 flex-shrink-0 text-slate-400" />
                <span className="truncate flex-1">{session.title}</span>
              </button>
            ))
          )}
        </div>

        {/* Footer Actions & Server Status */}
        <div className="p-3 border-t border-slate-800 space-y-2">
          <button
            onClick={() => {
              onOpenSettings();
              onClose();
            }}
            className="w-full flex items-center space-x-2.5 px-3 py-2 rounded-lg text-xs text-slate-400 hover:text-slate-200 hover:bg-slate-900 transition-colors"
          >
            <Sliders className="w-4 h-4 text-slate-400" />
            <span>App Settings & Keys</span>
          </button>

          <div className="px-3 py-2 bg-slate-900 rounded-lg border border-slate-800 flex items-center space-x-2 text-[11px] text-slate-400">
            <Sparkles className="w-3.5 h-3.5 text-indigo-400 flex-shrink-0" />
            <span className="truncate">HomeLab Port: 14692</span>
          </div>
        </div>
      </aside>
    </>
  );
};
