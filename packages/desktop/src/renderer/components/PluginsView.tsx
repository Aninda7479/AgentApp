import React, { useState } from 'react';
import { Plus, Search, Check, Sparkles } from 'lucide-react';

export interface PluginsViewProps {
  onInstallPlugin: (pluginId: string) => void;
  onTryPlugin: (pluginId: string) => void;
  onToggleSkill: (skillId: string, enabled: boolean) => void;
}

interface PluginCard {
  id: string;
  icon: string;
  title: string;
  description: string;
  status: 'available' | 'installed';
}

interface SkillCard {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  icon: string;
  iconBg: string;
}

export const PluginsView: React.FC<PluginsViewProps> = ({
  onInstallPlugin,
  onTryPlugin,
  onToggleSkill
}) => {
  const [activeSubTab, setActiveSubTab] = useState<'plugins' | 'skills'>('plugins');
  const [pluginSearchQuery, setPluginSearchQuery] = useState('');
  const [skillSearchQuery, setSkillSearchQuery] = useState('');

  const plugins: PluginCard[] = [
    { id: 'p1', icon: '🌌', title: 'Computer Use', description: 'Control desktop apps and click through workflows.', status: 'available' },
    { id: 'p2', icon: '🌐', title: 'Browser', description: 'Drive a real browser to research and act on the web.', status: 'available' },
    { id: 'p3', icon: '📊', title: 'Spreadsheets', description: 'Create and edit sheets directly in your workspace.', status: 'installed' },
    { id: 'p4', icon: '📽️', title: 'Presentations', description: 'Generate slides with an agent-built narrative voice.', status: 'installed' }
  ];

  const [skillsList, setSkillsList] = useState<SkillCard[]>([
    { id: 's1', name: 'Graphify', description: 'Index a codebase and trace file dependencies and call maps.', enabled: true, icon: '📦', iconBg: '#2d1f3d' },
    { id: 's2', name: 'Image Gen', description: 'Generate or edit images for sites, mockups, and assets.', enabled: true, icon: '🖼️', iconBg: '#1f2e3d' },
    { id: 's3', name: 'Docs', description: 'Reference docs and API references while you work.', enabled: true, icon: '📖', iconBg: '#1f3d2e' },
    { id: 's4', name: 'Plugin Creator', description: 'Scaffold plugins and marketplace entries for integrations.', enabled: true, icon: '✏️', iconBg: '#3f1f1d' },
    { id: 's5', name: 'Skill Creator', description: 'Create or update a skill, writing manifests and pipelines.', enabled: true, icon: '🛠️', iconBg: '#3d341f' },
    { id: 's6', name: 'Skill Installer', description: 'Install curated skills from a remote host or registry.', enabled: true, icon: '🧩', iconBg: '#1f3d3d' }
  ]);

  const handleToggleSkill = (id: string) => {
    setSkillsList(prev => prev.map(s => {
      if (s.id === id) {
        const nextState = !s.enabled;
        onToggleSkill(id, nextState);
        return { ...s, enabled: nextState };
      }
      return s;
    }));
  };

  const filteredPlugins = plugins.filter(p =>
    p.title.toLowerCase().includes(pluginSearchQuery.toLowerCase()) ||
    p.description.toLowerCase().includes(pluginSearchQuery.toLowerCase())
  );

  const filteredSkills = skillsList.filter(s =>
    s.name.toLowerCase().includes(skillSearchQuery.toLowerCase()) ||
    s.description.toLowerCase().includes(skillSearchQuery.toLowerCase())
  );

  return (
    <div
      data-testid="plugins-container"
      className="flex h-full min-h-0 w-full flex-col bg-brand-bg text-brand-textMain"
    >
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-brand-border px-4 py-3 sm:px-6 sm:py-4">
        <div className="flex gap-1 rounded-lg border border-brand-border bg-brand-bg p-1">
          <button
            data-testid="subtab-plugins"
            onClick={() => setActiveSubTab('plugins')}
            className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
              activeSubTab === 'plugins'
                ? 'bg-brand-popover text-brand-textMain shadow-sm ring-1 ring-brand-border'
                : 'text-brand-textMuted hover:text-brand-textMain'
            }`}
          >
            Plugins
          </button>
          <button
            data-testid="subtab-skills"
            onClick={() => setActiveSubTab('skills')}
            className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
              activeSubTab === 'skills'
                ? 'bg-brand-popover text-brand-textMain shadow-sm ring-1 ring-brand-border'
                : 'text-brand-textMuted hover:text-brand-textMain'
            }`}
          >
            Skills
          </button>
        </div>

        <button className="ui-btn">
          <Plus size={15} />
          <span>Add</span>
        </button>
      </div>

      {/* Content */}
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-8 sm:px-6 sm:py-10">
        {activeSubTab === 'plugins' ? (
          <div className="mx-auto flex w-full max-w-3xl flex-col">
            <h1 className="font-outfit text-2xl font-semibold tracking-tight text-brand-textMain sm:text-3xl">
              Plugins
            </h1>
            <p className="mb-5 mt-2 text-sm leading-relaxed text-brand-textMuted sm:text-base">
              Connect SuperAgent to the tools you already use.
            </p>

            <div className="ui-input mb-6 flex items-center gap-2 border-transparent bg-brand-card">
              <Search size={15} className="flex-shrink-0 text-brand-textMuted" />
              <input
                data-testid="plugin-search-input"
                type="text"
                placeholder="Search plugins"
                value={pluginSearchQuery}
                onChange={(e) => setPluginSearchQuery(e.target.value)}
                className="w-full border-none bg-transparent text-sm text-brand-textMain outline-none placeholder:text-brand-textMuted/50"
              />
            </div>

            <div className="ui-label mb-3">
              {filteredPlugins.filter(p => p.status === 'installed').length} installed · {filteredPlugins.length} shown
            </div>

            {filteredPlugins.length === 0 ? (
              <div className="ui-card px-6 py-10 text-center text-sm text-brand-textMuted">
                No plugins match “{pluginSearchQuery}”.
              </div>
            ) : (
              <div className="ui-grid-auto">
                {filteredPlugins.map(p => (
                  <div
                    key={p.id}
                    data-testid={`plugin-card-${p.id}`}
                    className="ui-card flex items-center gap-4 p-4"
                  >
                    <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl bg-brand-bg text-2xl">
                      {p.icon}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="mb-1 flex items-center gap-2">
                        <span className="truncate text-sm font-semibold text-brand-textMain">{p.title}</span>
                        {p.status === 'installed' && (
                          <span className="ui-badge bg-emerald-500/12 text-emerald-400">
                            <Check size={10} /> Installed
                          </span>
                        )}
                      </div>
                      <p className="truncate text-xs text-brand-textMuted">{p.description}</p>
                    </div>
                    {p.status === 'installed' ? (
                      <button
                        data-testid={`btn-try-${p.id}`}
                        onClick={() => onTryPlugin(p.id)}
                        className="ui-btn flex-shrink-0"
                      >
                        Try in chat
                      </button>
                    ) : (
                      <button
                        data-testid={`btn-install-${p.id}`}
                        onClick={() => onInstallPlugin(p.id)}
                        className="ui-btn-primary flex-shrink-0"
                      >
                        Install
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="mx-auto flex w-full max-w-3xl flex-col">
            <h1 className="font-outfit text-2xl font-semibold tracking-tight text-brand-textMain sm:text-3xl">
              Skills
            </h1>
            <p className="mb-5 mt-2 text-sm leading-relaxed text-brand-textMuted sm:text-base">
              Toggle task-specific capabilities on or off.
            </p>

            <div className="ui-input mb-6 flex items-center gap-2 border-transparent bg-brand-card">
              <Search size={15} className="flex-shrink-0 text-brand-textMuted" />
              <input
                data-testid="skill-search-input"
                type="text"
                placeholder="Search skills"
                value={skillSearchQuery}
                onChange={(e) => setSkillSearchQuery(e.target.value)}
                className="w-full border-none bg-transparent text-sm text-brand-textMain outline-none placeholder:text-brand-textMuted/50"
              />
            </div>

            <div className="ui-label mb-3">{filteredSkills.filter(s => s.enabled).length} enabled</div>

            {filteredSkills.length === 0 ? (
              <div className="ui-card px-6 py-10 text-center text-sm text-brand-textMuted">
                No skills match “{skillSearchQuery}”.
              </div>
            ) : (
              <div className="ui-grid-auto">
                {filteredSkills.map(s => (
                  <button
                    key={s.id}
                    data-testid={`skill-card-${s.id}`}
                    onClick={() => handleToggleSkill(s.id)}
                    className={`ui-card flex items-center justify-between gap-4 p-4 text-left transition-all duration-200 ${
                      s.enabled ? 'border-violet-500/30' : ''
                    }`}
                  >
                    <div className="flex min-w-0 items-center gap-4">
                      <div
                        className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg text-xl"
                        style={{ backgroundColor: s.iconBg }}
                      >
                        {s.icon}
                      </div>
                      <div className="min-w-0">
                        <div className="truncate text-sm font-semibold text-brand-textMain">{s.name}</div>
                        <div className="truncate text-xs text-brand-textMuted">{s.description}</div>
                      </div>
                    </div>
                    <span
                      data-testid={`skill-check-${s.id}`}
                      className={`flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                        s.enabled ? 'bg-violet-500/15 text-violet-400' : 'bg-brand-bg text-brand-textMuted'
                      }`}
                    >
                      {s.enabled ? <Check size={14} /> : <Sparkles size={12} />}
                    </span>
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
