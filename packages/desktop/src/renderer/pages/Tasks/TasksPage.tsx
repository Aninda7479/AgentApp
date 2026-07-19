import React, { useState, useEffect, useRef } from 'react';
import { KanbanView, KanbanCard } from './KanbanView';
import { Folder, Globe, Search, RefreshCw, KanbanSquare } from 'lucide-react';

interface TasksPageProps {
  activeProject?: string;
  ipc: any;
  triggerToast?: (message: string, type?: 'info' | 'error') => void;
}

export const TasksPage: React.FC<TasksPageProps> = ({
  activeProject,
  ipc,
  triggerToast,
}) => {
  const [scope, setScope] = useState<'global' | 'project'>('global');
  const [cards, setCards] = useState<KanbanCard[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(false);

  // Keep a reference to the active project so we know if it changed
  const lastProjectRef = useRef(activeProject);

  // Load cards when scope or activeProject changes
  const loadCards = async (currentScope: 'global' | 'project', projName?: string) => {
    if (!ipc) return;
    setLoading(true);
    try {
      const loaded: KanbanCard[] = await ipc.invoke('kanban-load', {
        scope: currentScope,
        projectName: currentScope === 'project' ? projName : undefined,
      });
      setCards(loaded || []);
    } catch (err: any) {
      console.error('Failed to load kanban cards:', err);
      triggerToast?.('Failed to load tasks from local storage', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // If activeProject changed from one project to another (or was unset), adjust scope
    if (activeProject !== lastProjectRef.current) {
      lastProjectRef.current = activeProject;
      // Default to project scope if a project is active, otherwise global
      const newScope = activeProject ? 'project' : 'global';
      setScope(newScope);
      loadCards(newScope, activeProject);
    } else {
      loadCards(scope, activeProject);
    }
  }, [activeProject, scope]);

  // Save cards to file
  const handleCardsChange = async (newCards: KanbanCard[]) => {
    setCards(newCards);
    if (!ipc) return;
    try {
      await ipc.invoke('kanban-save', {
        scope,
        projectName: scope === 'project' ? activeProject : undefined,
        cards: newCards,
      });
    } catch (err: any) {
      console.error('Failed to save kanban cards:', err);
      triggerToast?.('Failed to save tasks', 'error');
    }
  };

  // Filter cards based on search query
  const filteredCards = cards.filter((card) => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return true;
    return (
      card.title.toLowerCase().includes(q) ||
      (card.description && card.description.toLowerCase().includes(q)) ||
      (card.labels && card.labels.some((lbl) => lbl.text.toLowerCase().includes(q))) ||
      card.priority.toLowerCase().includes(q)
    );
  });

  return (
    <div className="flex-1 flex flex-col h-full bg-brand-bg min-h-0 relative select-none">
      {/* Header bar */}
      <div className="flex-shrink-0 flex flex-col sm:flex-row sm:items-center justify-between p-4 border-b border-brand-border/40 gap-4 bg-brand-bg/50 backdrop-blur-md z-10">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-indigo-500/10 border border-indigo-500/20 text-indigo-400">
            <KanbanSquare className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-base font-bold text-brand-textMain leading-tight">Tasks Board</h1>
            <p className="text-[11px] text-brand-textMuted leading-relaxed">
              Track short-term tasks for your workspace
            </p>
          </div>
        </div>

        {/* Scope Pill Switcher (only shown if a project is active in sidebar) */}
        {activeProject ? (
          <div className="flex items-center p-0.5 rounded-lg bg-brand-sidebar border border-brand-border/50 self-start sm:self-auto">
            <button
              onClick={() => setScope('global')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-all cursor-pointer ${
                scope === 'global'
                  ? 'bg-brand-card text-brand-textMain shadow-sm border border-brand-border/20'
                  : 'text-brand-textMuted hover:text-brand-textMain'
              }`}
            >
              <Globe className="w-3.5 h-3.5" />
              <span>Global Tasks</span>
            </button>
            <button
              onClick={() => setScope('project')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-all cursor-pointer ${
                scope === 'project'
                  ? 'bg-brand-card text-brand-textMain shadow-sm border border-brand-border/20'
                  : 'text-brand-textMuted hover:text-brand-textMain'
              }`}
            >
              <Folder className="w-3.5 h-3.5" />
              <span className="truncate max-w-[120px]">{activeProject}</span>
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-brand-sidebar/40 border border-brand-border/40 text-xs font-semibold text-brand-textMuted self-start sm:self-auto select-none">
            <Globe className="w-3.5 h-3.5" />
            <span>Global Scope</span>
          </div>
        )}

        {/* Action Controls */}
        <div className="flex items-center gap-2">
          {/* Search bar */}
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 w-3.5 h-3.5 text-brand-textMuted" />
            <input
              type="text"
              placeholder="Search tasks..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full sm:w-48 pl-8 pr-3 py-1.5 rounded-lg bg-brand-sidebar border border-brand-border text-xs text-brand-textMain placeholder-brand-textMuted/45 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-2.5 text-brand-textMuted hover:text-brand-textMain cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Reload button */}
          <button
            onClick={() => loadCards(scope, activeProject)}
            disabled={loading}
            className={`p-2 rounded-lg bg-brand-sidebar border border-brand-border hover:bg-brand-hover text-brand-textMuted hover:text-brand-textMain transition-all cursor-pointer ${
              loading ? 'animate-spin' : ''
            }`}
            title="Reload Board"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Main Kanban Content Area */}
      {loading ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-2">
          <RefreshCw className="w-6 h-6 text-indigo-400 animate-spin" />
          <span className="text-xs text-brand-textMuted">Loading task board...</span>
        </div>
      ) : (
        <KanbanView
          cards={filteredCards}
          onCardsChange={handleCardsChange}
          scope={scope}
          projectName={activeProject}
        />
      )}
    </div>
  );
};

// Auxiliary close icon for input clearing
const X = ({ className, ...props }: any) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    {...props}
  >
    <path d="M18 6 6 18" />
    <path d="m6 6 12 12" />
  </svg>
);
