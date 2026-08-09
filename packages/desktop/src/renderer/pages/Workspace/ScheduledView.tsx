import React, { useState, useEffect, useCallback } from 'react';
import { CalendarPlus, Search, Bell, FileCheck2, Folder, Clock, Play, Pause, Trash2, Plus, RefreshCw, AlertCircle, CheckCircle2, Eye, X, Activity } from 'lucide-react';
import { getIpc } from '../../lib/electron';

export interface ScheduledViewProps {
  onCreateTask?: (taskType: string) => void;
  onUseTemplate?: (templateName: string, cronExpr: string) => void;
}

export interface LiveTrigger {
  id: string;
  name: string;
  type: 'cron' | 'watcher' | 'webhook';
  enabled: boolean;
  targetPath?: string;
  cronExpression?: string;
  intervalMs?: number;
  prompt: string;
  lastRunAt?: string;
  lastStatus?: 'success' | 'error' | 'running';
  lastError?: string;
  runCount: number;
}

interface TemplateCard {
  id: string;
  icon: string;
  title: string;
  schedule: string;
  cron: string;
}

export const ScheduledView: React.FC<ScheduledViewProps> = ({
  onCreateTask,
  onUseTemplate
}) => {
  const [activeSubTab, setActiveSubTab] = useState<'tasks' | 'templates'>('tasks');
  const [searchQuery, setSearchQuery] = useState('');
  const [triggers, setTriggers] = useState<LiveTrigger[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [runningTriggerId, setRunningTriggerId] = useState<string | null>(null);

  // New Trigger Modal State
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [newTriggerName, setNewTriggerName] = useState<string>('');
  const [newTriggerType, setNewTriggerType] = useState<'cron' | 'watcher'>('cron');
  const [newTriggerCron, setNewTriggerCron] = useState<string>('0 9 * * 1-5');
  const [newTriggerPrompt, setNewTriggerPrompt] = useState<string>('');
  const [newTriggerPath, setNewTriggerPath] = useState<string>('');

  const ipc = getIpc();

  // Load triggers from IPC
  const fetchTriggers = useCallback(async () => {
    if (!ipc) return;
    setLoading(true);
    try {
      const res = await ipc.invoke('triggers-list');
      if (Array.isArray(res)) {
        setTriggers(res);
      }
    } catch (e) {
      console.error('Failed to load triggers:', e);
    } finally {
      setLoading(false);
    }
  }, [ipc]);

  useEffect(() => {
    fetchTriggers();

    if (!ipc) return;
    const handleFired = (_e: unknown, data: any) => {
      console.log('[ScheduledView] Trigger fired event received:', data);
      fetchTriggers();
    };
    ipc.on('trigger-fired', handleFired);
    return () => {
      ipc.removeListener('trigger-fired', handleFired);
    };
  }, [fetchTriggers, ipc]);

  // Actions
  const handleToggleTrigger = async (id: string, currentEnabled: boolean) => {
    if (!ipc) return;
    try {
      await ipc.invoke('triggers-toggle', { id, enabled: !currentEnabled });
      fetchTriggers();
    } catch (e) {
      console.error('Failed to toggle trigger:', e);
    }
  };

  const handleRunNow = async (id: string) => {
    if (!ipc) return;
    setRunningTriggerId(id);
    try {
      await ipc.invoke('triggers-run-now', id);
      fetchTriggers();
    } catch (e) {
      console.error('Failed to run trigger now:', e);
    } finally {
      setRunningTriggerId(null);
    }
  };

  const handleDeleteTrigger = async (id: string) => {
    if (!ipc) return;
    try {
      await ipc.invoke('triggers-remove', id);
      fetchTriggers();
    } catch (e) {
      console.error('Failed to remove trigger:', e);
    }
  };

  const handleCreateTriggerSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTriggerName.trim() || !newTriggerPrompt.trim() || !ipc) return;

    try {
      await ipc.invoke('triggers-create', {
        name: newTriggerName.trim(),
        type: newTriggerType,
        enabled: true,
        cronExpression: newTriggerType === 'cron' ? newTriggerCron : undefined,
        targetPath: newTriggerType === 'watcher' ? newTriggerPath : undefined,
        prompt: newTriggerPrompt.trim()
      });
      setIsModalOpen(false);
      setNewTriggerName('');
      setNewTriggerPrompt('');
      setNewTriggerPath('');
      fetchTriggers();
    } catch (err) {
      console.error('Failed to create trigger:', err);
    }
  };

  const handleInstantiateTemplate = async (tmpl: TemplateCard) => {
    if (ipc) {
      try {
        await ipc.invoke('triggers-create', {
          name: tmpl.title.slice(0, 50),
          type: 'cron',
          enabled: true,
          cronExpression: tmpl.cron,
          prompt: tmpl.title
        });
        setActiveSubTab('tasks');
        fetchTriggers();
        return;
      } catch (e) {
        console.error('Failed to instantiate trigger template:', e);
      }
    }
    // Fallback if no IPC available
    onUseTemplate?.(tmpl.title, tmpl.cron);
  };

  const templates: TemplateCard[] = [
    {
      id: 't1',
      icon: '🐞',
      title: 'Scan recent commits for likely bugs and propose minimal fixes.',
      schedule: 'Daily at 9:00',
      cron: '0 9 * * *'
    },
    {
      id: 't2',
      icon: '📖',
      title: 'Draft weekly release notes from merged PRs.',
      schedule: 'Fridays at 9:00',
      cron: '0 9 * * 5'
    },
    {
      id: 't3',
      icon: '💬',
      title: "Summarize yesterday's git activity for standup.",
      schedule: 'Weekdays at 9:00',
      cron: '0 9 * * 1-5'
    },
    {
      id: 't4',
      icon: '🎯',
      title: 'Summarize CI failures and flaky tests; suggest top fixes.',
      schedule: 'Daily at 21:00',
      cron: '0 21 * * *'
    },
    {
      id: 't5',
      icon: '⭐',
      title: 'Draft a summary report of repository highlights & performance.',
      schedule: 'Sundays at 18:00',
      cron: '0 18 * * 0'
    },
    {
      id: 't6',
      icon: '🌿',
      title: 'Monitor active PRs and alert on stale reviews or merge conflicts.',
      schedule: 'Weekdays at 17:00',
      cron: '0 17 * * 1-5'
    }
  ];

  const filteredTemplates = templates.filter(t =>
    t.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    t.schedule.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const quickOptions = [
    { id: 'btn-daily-brief', label: 'Daily brief', icon: <Bell size={15} />, task: 'Daily brief' },
    { id: 'btn-weekly-review', label: 'Weekly review', icon: <FileCheck2 size={15} />, task: 'Weekly review' },
    { id: 'btn-project-monitor', label: 'Project monitor', icon: <Folder size={15} />, task: 'Project monitor' }
  ];

  return (
    <div
      data-testid="scheduled-container"
      className="flex h-full min-h-0 w-full flex-col bg-brand-bg text-brand-textMain relative"
    >
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-brand-border px-4 py-3 sm:px-6 sm:py-4">
        <div className="flex gap-1 rounded-lg border border-brand-border bg-brand-bg p-1">
          <button
            data-testid="subtab-tasks"
            onClick={() => setActiveSubTab('tasks')}
            className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
              activeSubTab === 'tasks'
                ? 'bg-brand-popover text-brand-textMain shadow-sm ring-1 ring-brand-border'
                : 'text-brand-textMuted hover:text-brand-textMain'
            }`}
          >
            Active Triggers ({triggers.length})
          </button>
          <button
            data-testid="subtab-templates"
            onClick={() => setActiveSubTab('templates')}
            className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
              activeSubTab === 'templates'
                ? 'bg-brand-popover text-brand-textMain shadow-sm ring-1 ring-brand-border'
                : 'text-brand-textMuted hover:text-brand-textMain'
            }`}
          >
            Templates
          </button>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsModalOpen(true)}
            className="ui-btn-primary flex items-center gap-1.5 text-xs px-3 py-2"
          >
            <Plus size={15} />
            <span>New Schedule</span>
          </button>
          {onCreateTask && (
            <button
              data-testid="create-via-chat-btn"
              onClick={() => onCreateTask('general')}
              className="ui-btn flex items-center gap-1.5 text-xs px-3 py-2"
            >
              <CalendarPlus size={15} />
              <span>Create via chat</span>
            </button>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-6 sm:px-6 sm:py-8">
        {activeSubTab === 'tasks' ? (
          <div className="mx-auto flex w-full max-w-4xl flex-col">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h1 className="font-outfit text-2xl font-semibold tracking-tight text-brand-textMain sm:text-3xl">
                  Automated Triggers
                </h1>
                <p className="mt-1 text-sm text-brand-textMuted">
                  Time & event-driven background routines powered by TriggerEngine.
                </p>
              </div>
              <button
                onClick={fetchTriggers}
                disabled={loading}
                className={`p-2 rounded-lg bg-brand-card border border-brand-border text-brand-textMuted hover:text-brand-textMain transition-all ${
                  loading ? 'animate-spin' : ''
                }`}
                title="Refresh Triggers"
              >
                <RefreshCw size={15} />
              </button>
            </div>

            {triggers.length === 0 ? (
              /* Empty state */
              <div className="ui-card flex flex-col items-center justify-center gap-6 px-6 py-12 text-center">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-violet-500/10 text-violet-400">
                  <Clock size={26} />
                </div>
                <div>
                  <h3 className="text-base font-semibold text-brand-textMain">
                    No active scheduled triggers
                  </h3>
                  <p className="text-xs text-brand-textMuted mt-1 max-w-md">
                    Set up cron routines or file watchers to execute background checks, build reports, or inspect repository activity automatically.
                  </p>
                </div>

                <div className="flex flex-wrap justify-center gap-2.5">
                  {quickOptions.map(opt => (
                    <button
                      key={opt.id}
                      data-testid={opt.id}
                      onClick={() => onCreateTask?.(opt.task)}
                      className="ui-btn"
                    >
                      <span className="text-brand-textMuted">{opt.icon}</span>
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              /* Active Live Triggers List */
              <div className="grid grid-cols-1 gap-4">
                {triggers.map((t) => {
                  const isRunning = runningTriggerId === t.id || t.lastStatus === 'running';

                  return (
                    <div
                      key={t.id}
                      className={`ui-card flex flex-col justify-between p-5 transition-all duration-200 ${
                        !t.enabled ? 'opacity-60 bg-brand-sidebar/20' : ''
                      }`}
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2.5">
                            <span className="font-semibold text-sm text-brand-textMain">
                              {t.name}
                            </span>

                            {/* Enabled/Disabled status chip */}
                            <span
                              className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                                t.enabled
                                  ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                                  : 'bg-zinc-500/15 text-zinc-400 border border-zinc-500/30'
                              }`}
                            >
                              {t.enabled ? 'Active' : 'Paused'}
                            </span>

                            {/* Last Run Status */}
                            {t.lastStatus === 'success' && (
                              <span className="flex items-center gap-1 text-[11px] text-emerald-400">
                                <CheckCircle2 size={12} /> Success
                              </span>
                            )}
                            {t.lastStatus === 'error' && (
                              <span className="flex items-center gap-1 text-[11px] text-rose-400" title={t.lastError}>
                                <AlertCircle size={12} /> Error
                              </span>
                            )}
                          </div>

                          <p className="text-xs text-brand-textMuted leading-relaxed max-w-2xl">
                            {t.prompt}
                          </p>
                        </div>

                        {/* Control Actions */}
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => handleRunNow(t.id)}
                            disabled={isRunning}
                            className="p-2 rounded-lg bg-brand-hover hover:bg-brand-hover-strong text-brand-textMain text-xs font-semibold flex items-center gap-1 transition-colors disabled:opacity-50"
                            title="Run Trigger Now"
                          >
                            <Play size={13} className={isRunning ? 'animate-spin' : ''} />
                            <span className="hidden sm:inline">Run Now</span>
                          </button>
                          <button
                            onClick={() => handleToggleTrigger(t.id, t.enabled)}
                            className="p-2 rounded-lg bg-brand-hover hover:bg-brand-hover-strong text-brand-textMuted hover:text-brand-textMain transition-colors"
                            title={t.enabled ? 'Pause Schedule' : 'Resume Schedule'}
                          >
                            {t.enabled ? <Pause size={13} /> : <Play size={13} />}
                          </button>
                          <button
                            onClick={() => handleDeleteTrigger(t.id)}
                            className="p-2 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 transition-colors"
                            title="Delete Schedule"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </div>

                      {/* Footer Details */}
                      <div className="mt-4 pt-3 border-t border-brand-border/40 flex flex-wrap items-center justify-between gap-2 text-[11px] text-brand-textMuted">
                        <div className="flex items-center gap-3">
                          <span className="flex items-center gap-1">
                            <Clock size={12} />
                            {t.type === 'cron' ? `Cron: ${t.cronExpression || 'Custom'}` : `Watcher: ${t.targetPath || 'Path'}`}
                          </span>
                          <span className="flex items-center gap-1">
                            <Activity size={12} />
                            Runs: {t.runCount}
                          </span>
                        </div>

                        {t.lastRunAt && (
                          <span>
                            Last run: {new Date(t.lastRunAt).toLocaleString()}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        ) : (
          /* Templates Sub-Tab */
          <div className="mx-auto flex w-full max-w-3xl flex-col">
            <h1 className="font-outfit text-2xl font-semibold tracking-tight text-brand-textMain sm:text-3xl">
              Schedule Templates
            </h1>
            <p className="mb-5 mt-2 text-sm leading-relaxed text-brand-textMuted sm:text-base">
              Start from a ready-made automation routine. Instantly creates a live background schedule.
            </p>

            {/* Search */}
            <div className="ui-input mb-6 flex items-center gap-2 border-transparent bg-brand-card">
              <Search size={15} className="flex-shrink-0 text-brand-textMuted" />
              <input
                data-testid="template-search-input"
                type="text"
                placeholder="Search templates"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full border-none bg-transparent text-sm text-brand-textMain outline-none placeholder:text-brand-textMuted/50"
              />
            </div>

            <div className="ui-label mb-3">Preset System Routines</div>

            {filteredTemplates.length === 0 ? (
              <div className="ui-card px-6 py-10 text-center text-sm text-brand-textMuted">
                No templates match “{searchQuery}”.
              </div>
            ) : (
              <div className="ui-grid-auto">
                {filteredTemplates.map(t => (
                  <div
                    key={t.id}
                    data-testid={`template-card-${t.id}`}
                    className="ui-card group flex min-h-[180px] flex-col justify-between p-5 text-left transition-all duration-200 hover:border-violet-500/30 hover:shadow-[0_8px_24px_rgba(0,0,0,0.25)]"
                  >
                    <div>
                      <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-lg bg-violet-500/10 text-lg">
                        {t.icon}
                      </div>
                      <div className="text-sm font-medium leading-snug text-brand-textMain">
                        {t.title}
                      </div>
                    </div>
                    <div className="mt-4 flex items-center justify-between gap-2 border-t border-brand-border/30 pt-3">
                      <div className="flex items-center gap-1.5 text-xs text-brand-textMuted">
                        <Clock size={12} className="flex-shrink-0" />
                        {t.schedule}
                      </div>
                      <button
                        onClick={() => handleInstantiateTemplate(t)}
                        className="px-2.5 py-1 rounded bg-brand-highlight text-brand-highlight-text hover:bg-brand-highlight-hover text-xs font-semibold transition-colors cursor-pointer"
                      >
                        Activate Schedule
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Create Trigger Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fade-in">
          <div className="ui-card w-full max-w-md p-6 bg-brand-popover border border-brand-border shadow-2xl rounded-2xl relative">
            <div className="flex items-center justify-between pb-4 border-b border-brand-border/40">
              <h3 className="text-base font-bold text-brand-textMain">New Automated Schedule</h3>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-brand-textMuted hover:text-brand-textMain p-1"
              >
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleCreateTriggerSubmit} className="mt-4 space-y-4">
              <div>
                <label className="text-xs font-semibold text-brand-textMuted uppercase">Trigger Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Daily Bug Scanner"
                  value={newTriggerName}
                  onChange={(e) => setNewTriggerName(e.target.value)}
                  className="ui-input w-full mt-1 text-xs"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-brand-textMuted uppercase">Type</label>
                  <select
                    value={newTriggerType}
                    onChange={(e) => setNewTriggerType(e.target.value as any)}
                    className="ui-input w-full mt-1 text-xs bg-brand-card"
                  >
                    <option value="cron">Cron Schedule</option>
                    <option value="watcher">File Watcher</option>
                  </select>
                </div>

                {newTriggerType === 'cron' ? (
                  <div>
                    <label className="text-xs font-semibold text-brand-textMuted uppercase">Cron Frequency</label>
                    <select
                      value={newTriggerCron}
                      onChange={(e) => setNewTriggerCron(e.target.value)}
                      className="ui-input w-full mt-1 text-xs bg-brand-card"
                    >
                      <option value="0 9 * * 1-5">Weekdays at 9am</option>
                      <option value="0 9 * * *">Daily at 9am</option>
                      <option value="0 21 * * *">Daily at 9pm</option>
                      <option value="0 9 * * 5">Fridays at 9am</option>
                      <option value="0 18 * * 0">Sundays at 6pm</option>
                    </select>
                  </div>
                ) : (
                  <div>
                    <label className="text-xs font-semibold text-brand-textMuted uppercase">Target Folder</label>
                    <input
                      type="text"
                      placeholder="./src"
                      value={newTriggerPath}
                      onChange={(e) => setNewTriggerPath(e.target.value)}
                      className="ui-input w-full mt-1 text-xs"
                    />
                  </div>
                )}
              </div>

              <div>
                <label className="text-xs font-semibold text-brand-textMuted uppercase">Prompt Instruction</label>
                <textarea
                  required
                  rows={3}
                  placeholder="Instructions for the agent when this trigger fires..."
                  value={newTriggerPrompt}
                  onChange={(e) => setNewTriggerPrompt(e.target.value)}
                  className="ui-input w-full mt-1 text-xs resize-none"
                />
              </div>

              <div className="flex gap-2 justify-end pt-3 border-t border-brand-border/40">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium text-brand-textMuted hover:text-brand-textMain transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 rounded-lg text-xs font-semibold bg-brand-highlight text-brand-highlight-text hover:bg-brand-highlight-hover transition-colors"
                >
                  Save Schedule
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
