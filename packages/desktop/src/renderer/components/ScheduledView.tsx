import React, { useState } from 'react';
import { CalendarPlus, Search, Bell, FileCheck2, Folder, Clock } from 'lucide-react';

export interface ScheduledViewProps {
  onCreateTask: (taskType: string) => void;
  onUseTemplate: (templateName: string, cronExpr: string) => void;
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

  const templates: TemplateCard[] = [
    {
      id: 't1',
      icon: '🐞',
      title: 'Scan recent commits (since the last run, or last 24h) for likely bugs and propose minimal fixes.',
      schedule: 'Daily at 9:00',
      cron: '0 9 * * *'
    },
    {
      id: 't2',
      icon: '📖',
      title: 'Draft weekly release notes from merged PRs (include links when available).',
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
      title: 'Summarize CI failures and flaky tests from the last CI window; suggest top fixes.',
      schedule: 'Daily at 21:00',
      cron: '0 21 * * *'
    },
    {
      id: 't5',
      icon: '⭐',
      title: 'Draft a summary report of the repository highlights and performance changes.',
      schedule: 'Sundays at 18:00',
      cron: '0 18 * * 0'
    },
    {
      id: 't6',
      icon: '🌿',
      title: 'Monitor active repository pull requests and alert on stale reviews or merge conflicts.',
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
      className="flex h-full min-h-0 w-full flex-col bg-brand-bg text-brand-textMain"
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
            Tasks
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

        <button
          data-testid="create-via-chat-btn"
          onClick={() => onCreateTask('general')}
          className="ui-btn-primary"
        >
          <CalendarPlus size={15} />
          <span>Create via chat</span>
        </button>
      </div>

      {/* Content */}
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-8 sm:px-6 sm:py-10">
        {activeSubTab === 'tasks' ? (
          <div className="mx-auto flex w-full max-w-2xl flex-col">
            <h1 className="font-outfit text-2xl font-semibold tracking-tight text-brand-textMain sm:text-3xl">
              Scheduled
            </h1>
            <p className="mb-8 mt-2 text-sm leading-relaxed text-brand-textMuted sm:text-base">
              Run SuperAgent on a timer — routine checks, reports, or monitoring across your projects.
            </p>

            {/* Empty state */}
            <div className="ui-card flex flex-col items-center justify-center gap-6 px-6 py-12 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-violet-500/10 text-violet-400">
                <Clock size={26} />
              </div>
              <h3 className="text-base font-semibold text-brand-textMain">
                Create your first scheduled task
              </h3>

              <div className="flex flex-wrap justify-center gap-2.5">
                {quickOptions.map(opt => (
                  <button
                    key={opt.id}
                    data-testid={opt.id}
                    onClick={() => onCreateTask(opt.task)}
                    className="ui-btn"
                  >
                    <span className="text-brand-textMuted">{opt.icon}</span>
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div className="mx-auto flex w-full max-w-3xl flex-col">
            <h1 className="font-outfit text-2xl font-semibold tracking-tight text-brand-textMain sm:text-3xl">
              Templates
            </h1>
            <p className="mb-5 mt-2 text-sm leading-relaxed text-brand-textMuted sm:text-base">
              Start from a ready-made scheduled task.
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

            <div className="ui-label mb-3">System</div>

            {filteredTemplates.length === 0 ? (
              <div className="ui-card px-6 py-10 text-center text-sm text-brand-textMuted">
                No templates match “{searchQuery}”.
              </div>
            ) : (
              <div className="ui-grid-auto">
                {filteredTemplates.map(t => (
                  <button
                    key={t.id}
                    data-testid={`template-card-${t.id}`}
                    onClick={() => onUseTemplate(t.title, t.cron)}
                    className="ui-card group flex min-h-[160px] flex-col justify-between p-5 text-left transition-all duration-200 hover:border-violet-500/30 hover:shadow-[0_8px_24px_rgba(0,0,0,0.25)]"
                  >
                    <div>
                      <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-lg bg-violet-500/10 text-lg">
                        {t.icon}
                      </div>
                      <div className="text-sm font-medium leading-snug text-brand-textMain">
                        {t.title}
                      </div>
                    </div>
                    <div className="mt-4 flex items-center gap-1.5 text-xs text-brand-textMuted">
                      <Clock size={12} className="flex-shrink-0" />
                      {t.schedule}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
