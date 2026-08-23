import React, { useState, useEffect, useRef } from 'react';
import { KanbanView, KanbanCard } from './KanbanView';
import { RoutinesView } from './RoutinesView';
import { Folder, Globe, Search, RefreshCw, KanbanSquare, Clock } from 'lucide-react';

interface TasksPageProps {
  activeProject?: string;
  ipc: any;
  triggerToast?: (message: string, type?: 'info' | 'error') => void;
  onStartWork?: (card: KanbanCard) => void;
  initialView?: 'kanban' | 'routines';
}

export const TasksPage: React.FC<TasksPageProps> = ({
  activeProject,
  ipc,
  triggerToast,
  onStartWork,
  initialView = 'kanban',
}) => {
  const [activeTab, setActiveTab] = useState<'kanban' | 'routines'>(initialView);
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
    if (activeProject !== lastProjectRef.current) {
      lastProjectRef.current = activeProject;
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
      {/* Top Header bar with Tab Switcher */}
      <div
        className="flex-shrink-0 flex flex-col sm:flex-row sm:items-center justify-between p-4 border-b border-brand-border/40 gap-4 bg-brand-bg/50 backdrop-blur-md z-10"
        style={{ backgroundImage: 'radial-gradient(135% 160% at 0% 0%, var(--brand-atmo-glow) 0%, transparent 52%)' }}
      >
        <div className="flex items-center gap-3">
          <div className="flex items-center p-1 rounded-2xl bg-slate-900 border border-slate-800">
            <button
              onClick={() => setActiveTab('kanban')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                activeTab === 'kanban'
                  ? 'bg-cyan-500 text-slate-950 shadow-md shadow-cyan-500/20'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <KanbanSquare size={14} />
              <span>Tasks Board</span>
            </button>
            <button
              onClick={() => setActiveTab('routines')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                activeTab === 'routines'
                  ? 'bg-cyan-500 text-slate-950 shadow-md shadow-cyan-500/20'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Clock size={14} />
              <span>Scheduled Routines</span>
            </button>
          </div>
        </div>

        {activeTab === 'kanban' && (
          <div className="flex items-center gap-3">
            {/* Scope Pill Switcher */}
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

            {/* Search bar */}
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 w-3.5 h-3.5 text-brand-textMuted" />
              <input
                type="text"
                placeholder="Search tasks..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-8 pr-3 py-1.5 rounded-lg text-xs bg-brand-card/60 border border-brand-border text-brand-textMain focus:outline-none focus:border-brand-accent transition-colors w-40 sm:w-48 placeholder:text-brand-textMuted/60"
              />
            </div>
          </div>
        )}
      </div>

      {/* Body View */}
      {activeTab === 'kanban' ? (
        <KanbanView
          cards={filteredCards}
          onCardsChange={handleCardsChange}
          scope={scope}
          projectName={scope === 'project' ? activeProject : undefined}
          triggerToast={triggerToast}
          onStartWork={onStartWork}
        />
      ) : (
        <RoutinesView />
      )}
    </div>
  );
};

export default TasksPage;
