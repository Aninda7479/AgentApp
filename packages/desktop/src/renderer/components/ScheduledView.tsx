import React, { useState } from 'react';

export interface ScheduledViewProps {
  onCreateTask: (taskType: string) => void;
  onUseTemplate: (templateName: string, cronExpr: string) => void;
}

interface TemplateCard {
  id: string;
  icon: string;
  iconBg: string;
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
      iconBg: '#3f1f1d',
      title: 'Scan recent commits (since the last run, or last 24h) for likely bugs and propose minimal fixes.',
      schedule: 'Daily at 9:00',
      cron: '0 9 * * *'
    },
    {
      id: 't2',
      icon: '📖',
      iconBg: '#1f2e3d',
      title: 'Draft weekly release notes from merged PRs (include links when available).',
      schedule: 'Fridays at 9:00',
      cron: '0 9 * * 5'
    },
    {
      id: 't3',
      icon: '💬',
      iconBg: '#2d1f3d',
      title: "Summarize yesterday's git activity for standup.",
      schedule: 'Weekdays at 9:00',
      cron: '0 9 * * 1-5'
    },
    {
      id: 't4',
      icon: '🎯',
      iconBg: '#1f3d2e',
      title: 'Summarize CI failures and flaky tests from the last CI window; suggest top fixes.',
      schedule: 'Daily at 21:00',
      cron: '0 21 * * *'
    },
    {
      id: 't5',
      icon: '⭐',
      iconBg: '#3d341f',
      title: 'Draft a summary report of the repository highlights and performance changes.',
      schedule: 'Sundays at 18:00',
      cron: '0 18 * * 0'
    },
    {
      id: 't6',
      icon: '🌿',
      iconBg: '#1f3d3d',
      title: 'Monitor active repository pull requests and alert on stale reviews or merge conflicts.',
      schedule: 'Weekdays at 17:00',
      cron: '0 17 * * 1-5'
    }
  ];

  const filteredTemplates = templates.filter(t =>
    t.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    t.schedule.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div
      data-testid="scheduled-container"
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: '#141110', // Dark warm background
        color: '#ececec',
        overflow: 'hidden',
        height: '100%',
        width: '100%',
        fontFamily: "'Inter', -apple-system, sans-serif"
      }}
    >
      {/* Top Header Controls */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '16px 24px',
          borderBottom: '1px solid #231c1a'
        }}
      >
        {/* Sub tabs */}
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            data-testid="subtab-tasks"
            onClick={() => setActiveSubTab('tasks')}
            style={{
              backgroundColor: activeSubTab === 'tasks' ? '#2e2220' : 'transparent',
              border: 'none',
              color: activeSubTab === 'tasks' ? '#ffffff' : '#8a8a8a',
              padding: '6px 14px',
              borderRadius: '20px',
              cursor: 'pointer',
              fontSize: '0.85rem',
              fontWeight: 500,
              transition: 'all 0.15s ease'
            }}
          >
            Tasks
          </button>
          <button
            data-testid="subtab-templates"
            onClick={() => setActiveSubTab('templates')}
            style={{
              backgroundColor: activeSubTab === 'templates' ? '#2e2220' : 'transparent',
              border: 'none',
              color: activeSubTab === 'templates' ? '#ffffff' : '#8a8a8a',
              padding: '6px 14px',
              borderRadius: '20px',
              cursor: 'pointer',
              fontSize: '0.85rem',
              fontWeight: 500,
              transition: 'all 0.15s ease'
            }}
          >
            Templates
          </button>
        </div>

        {/* Action Dropdown */}
        <button
          data-testid="create-via-chat-btn"
          onClick={() => onCreateTask('general')}
          style={{
            backgroundColor: '#2e2220',
            border: '1px solid #3d302e',
            color: '#ececec',
            padding: '6px 14px',
            borderRadius: '8px',
            cursor: 'pointer',
            fontSize: '0.85rem',
            fontWeight: 500,
            display: 'flex',
            alignItems: 'center',
            gap: '6px'
          }}
        >
          Create via chat <span style={{ fontSize: '0.7rem' }}>▼</span>
        </button>
      </div>

      {/* Tab Contents */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '40px 24px' }}>
        {activeSubTab === 'tasks' ? (
          <div style={{ maxWidth: '800px', margin: '0 auto', display: 'flex', flexDirection: 'column' }}>
            <h1 style={{ fontSize: '2rem', fontFamily: "'Outfit', sans-serif", fontWeight: 600, marginBottom: '8px' }}>
              Scheduled
            </h1>
            <p style={{ color: '#8a8a8a', fontSize: '0.95rem', marginBottom: '40px', lineHeight: '1.5' }}>
              Ask ChatGPT to schedule tasks, set reminders, or monitor for updates.{' '}
              <a href="#" style={{ color: '#3b82f6', textDecoration: 'none' }}>Learn more</a>
            </p>

            {/* Empty State Card */}
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '60px 20px',
                textAlign: 'center'
              }}
            >
              <h3 style={{ fontSize: '1.2rem', fontWeight: 600, marginBottom: '24px' }}>
                Create your first scheduled task
              </h3>

              {/* Quick Options Row */}
              <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', justifyContent: 'center' }}>
                <button
                  data-testid="btn-daily-brief"
                  onClick={() => onCreateTask('Daily brief')}
                  style={{
                    backgroundColor: '#1b1412',
                    border: '1px solid #2e2220',
                    borderRadius: '24px',
                    color: '#ececec',
                    padding: '10px 20px',
                    fontSize: '0.9rem',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    transition: 'all 0.15s ease'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = '#261c1a';
                    e.currentTarget.style.borderColor = '#3d2b29';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = '#1b1412';
                    e.currentTarget.style.borderColor = '#2e2220';
                  }}
                >
                  <span>🔔</span> Daily brief
                </button>
                <button
                  data-testid="btn-weekly-review"
                  onClick={() => onCreateTask('Weekly review')}
                  style={{
                    backgroundColor: '#1b1412',
                    border: '1px solid #2e2220',
                    borderRadius: '24px',
                    color: '#ececec',
                    padding: '10px 20px',
                    fontSize: '0.9rem',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    transition: 'all 0.15s ease'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = '#261c1a';
                    e.currentTarget.style.borderColor = '#3d2b29';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = '#1b1412';
                    e.currentTarget.style.borderColor = '#2e2220';
                  }}
                >
                  <span>📋</span> Weekly review
                </button>
                <button
                  data-testid="btn-project-monitor"
                  onClick={() => onCreateTask('Project monitor')}
                  style={{
                    backgroundColor: '#1b1412',
                    border: '1px solid #2e2220',
                    borderRadius: '24px',
                    color: '#ececec',
                    padding: '10px 20px',
                    fontSize: '0.9rem',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    transition: 'all 0.15s ease'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = '#261c1a';
                    e.currentTarget.style.borderColor = '#3d2b29';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = '#1b1412';
                    e.currentTarget.style.borderColor = '#2e2220';
                  }}
                >
                  <span>📄</span> Project monitor
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div style={{ maxWidth: '900px', margin: '0 auto', display: 'flex', flexDirection: 'column' }}>
            <h1 style={{ fontSize: '2.2rem', fontFamily: "'Outfit', sans-serif", fontWeight: 600, marginBottom: '8px' }}>
              Templates
            </h1>
            <p style={{ color: '#8a8a8a', fontSize: '0.95rem', marginBottom: '24px' }}>
              Start with a scheduled task template
            </p>

            {/* Template Search Bar */}
            <div
              style={{
                backgroundColor: '#1e1816',
                border: '1px solid #2e2220',
                borderRadius: '8px',
                display: 'flex',
                alignItems: 'center',
                padding: '10px 16px',
                marginBottom: '32px'
              }}
            >
              <span style={{ color: '#8a8a8a', marginRight: '8px' }}>🔍</span>
              <input
                data-testid="template-search-input"
                type="text"
                placeholder="Search templates"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{
                  background: 'transparent',
                  border: 'none',
                  outline: 'none',
                  color: '#ffffff',
                  fontSize: '0.9rem',
                  flex: 1
                }}
              />
            </div>

            <h3 style={{ fontSize: '1rem', fontWeight: 600, color: '#ececec', marginBottom: '16px', letterSpacing: '0.02em' }}>
              System
            </h3>

            {/* Template Grid */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))',
                gap: '16px'
              }}
            >
              {filteredTemplates.map(t => (
                <div
                  key={t.id}
                  data-testid={`template-card-${t.id}`}
                  onClick={() => onUseTemplate(t.title, t.cron)}
                  style={{
                    backgroundColor: '#1b1412',
                    border: '1px solid #2e2220',
                    borderRadius: '12px',
                    padding: '20px',
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    minHeight: '160px'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = '#3d2b29';
                    e.currentTarget.style.transform = 'translateY(-2px)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = '#2e2220';
                    e.currentTarget.style.transform = 'translateY(0)';
                  }}
                >
                  <div>
                    <div
                      style={{
                        width: '36px',
                        height: '36px',
                        borderRadius: '8px',
                        backgroundColor: t.iconBg,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '1.2rem',
                        marginBottom: '16px'
                      }}
                    >
                      {t.icon}
                    </div>
                    <div
                      style={{
                        fontSize: '0.9rem',
                        fontWeight: 500,
                        color: '#ececec',
                        lineHeight: '1.4',
                        marginBottom: '16px'
                      }}
                    >
                      {t.title}
                    </div>
                  </div>
                  <div style={{ fontSize: '0.8rem', color: '#8a8a8a' }}>
                    {t.schedule}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
