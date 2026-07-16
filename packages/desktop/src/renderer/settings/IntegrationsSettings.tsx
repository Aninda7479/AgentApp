import React, { useState } from 'react';
import { Plug, Boxes, Sparkles, Check, Search } from 'lucide-react';

/** A discovered skill surfaced in the Skills tab. */
export interface IntegrationsSkill {
  id: string;
  name: string;
  description: string;
  enabled?: boolean;
}

/** A built-in plugin from the Core catalog (structural mirror). */
export interface IntegrationsPlugin {
  id: string;
  name: string;
  description: string;
  icon: string;
  category: 'automation' | 'document' | 'media';
  tags: string[];
  defaultEnabled: boolean;
}

/** Props for the Integrations settings panel (Skills / Plugins / MCP). */
interface IntegrationsSettingsProps {
  mcpDashboard: React.ReactNode;
  skills: IntegrationsSkill[];
  onToggleSkill: (id: string, enabled: boolean) => void;
  pluginCatalog: IntegrationsPlugin[];
  pluginEnabled: Record<string, boolean>;
  onTogglePlugin: (id: string, enabled: boolean) => void;
  /** Initial tab to show (defaults to `mcp`). */
  defaultTab?: TabId;
}

type TabId = 'skills' | 'plugins' | 'mcp';

const CATEGORY_LABELS: Record<IntegrationsPlugin['category'], string> = {
  automation: 'Automation',
  document: 'Documents',
  media: 'Media & Visualization'
};

/** Renders the Integrations panel split into Skills, Plugins, and MCP tabs. */
export const IntegrationsSettings: React.FC<IntegrationsSettingsProps> = ({
  mcpDashboard,
  skills,
  onToggleSkill,
  pluginCatalog,
  pluginEnabled,
  onTogglePlugin,
  defaultTab = 'mcp'
}) => {
  const [tab, setTab] = useState<TabId>(defaultTab);
  const [pluginQuery, setPluginQuery] = useState('');

  const tabs: { id: TabId; label: string; Icon: typeof Plug }[] = [
    { id: 'skills', label: 'Skills', Icon: Sparkles },
    { id: 'plugins', label: 'Plugins', Icon: Boxes },
    { id: 'mcp', label: 'MCP', Icon: Plug }
  ];

  const filteredPlugins = pluginCatalog.filter((p) => {
    const q = pluginQuery.trim().toLowerCase();
    if (!q) return true;
    return (
      p.name.toLowerCase().includes(q) ||
      p.description.toLowerCase().includes(q) ||
      p.tags.some((t) => t.toLowerCase().includes(q))
    );
  });

  const groupedPlugins = filteredPlugins.reduce<Record<string, IntegrationsPlugin[]>>((acc, p) => {
    (acc[p.category] ||= []).push(p);
    return acc;
  }, {});

  const SkillCard: React.FC<{ skill: IntegrationsSkill }> = ({ skill }) => {
    const [enabled, setEnabled] = useState(skill.enabled ?? true);
    return (
      <button
        type="button"
        data-testid={`integration-skill-${skill.id}`}
        onClick={() => {
          const next = !enabled;
          setEnabled(next);
          onToggleSkill(skill.id, next);
        }}
        className={`ui-card flex items-center justify-between gap-4 p-4 text-left transition-all duration-200 ${
          enabled ? 'border-[var(--brand-accent-border)]' : ''
        }`}
      >
        <div className="min-w-0">
          <div className="text-sm font-semibold text-brand-textMain">{skill.name}</div>
          <div className="text-xs text-brand-textMuted mt-0.5 line-clamp-2">{skill.description}</div>
        </div>
        <span
          data-testid={`integration-skill-check-${skill.id}`}
          className={`flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full text-xs font-bold ${
            enabled ? 'bg-[var(--brand-accent-tint)] text-[var(--brand-accent)]' : 'bg-brand-bg text-brand-textMuted'
          }`}
        >
          {enabled ? <Check size={14} /> : <Sparkles size={12} />}
        </span>
      </button>
    );
  };

  const PluginCard: React.FC<{ plugin: IntegrationsPlugin }> = ({ plugin }) => {
    const enabled = pluginEnabled[plugin.id] ?? plugin.defaultEnabled;
    return (
      <div data-testid={`integration-plugin-${plugin.id}`} className="ui-card flex items-center gap-4 p-4">
        <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl bg-brand-bg text-2xl">
          {plugin.icon}
        </div>
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex items-center gap-2">
            <span className="text-sm font-semibold text-brand-textMain">{plugin.name}</span>
            {enabled && (
              <span className="ui-badge bg-[color:var(--neon-constructive)]/12 text-[color:var(--neon-constructive)]">
                <Check size={10} /> Enabled
              </span>
            )}
          </div>
          <p className="text-xs text-brand-textMuted line-clamp-2">{plugin.description}</p>
        </div>
        <button
          type="button"
          data-testid={`integration-plugin-toggle-${plugin.id}`}
          onClick={() => onTogglePlugin(plugin.id, !enabled)}
          className={`px-3 py-1 rounded-lg border text-xs transition-all flex-shrink-0 ${
            enabled
              ? 'border-[var(--brand-accent-border)] bg-[var(--brand-accent-tint)] text-[var(--brand-accent)]'
              : 'border-brand-border bg-brand-bg text-brand-textMuted hover:bg-brand-hover'
          }`}
        >
          {enabled ? 'On' : 'Off'}
        </button>
      </div>
    );
  };

  return (
    <div className="mx-auto w-full max-w-3xl text-left">
      <div className="mb-6">
        <h1 className="font-outfit text-2xl font-semibold tracking-tight text-brand-textMain sm:text-3xl">
          Integrations
        </h1>
        <p className="mb-5 mt-2 text-sm leading-relaxed text-brand-textMuted sm:text-base">
          Connect skills, built-in plugins, and external MCP servers to extend what SuperAgent can do.
        </p>

        {/* Tabs */}
        <div className="flex gap-1 rounded-lg border border-brand-border bg-brand-bg p-1">
          {tabs.map(({ id, label, Icon }) => (
            <button
              key={id}
              type="button"
              data-testid={`integration-tab-${id}`}
              onClick={() => setTab(id)}
              className={`flex flex-1 items-center justify-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                tab === id
                  ? 'bg-brand-popover text-brand-textMain shadow-sm ring-1 ring-brand-border'
                  : 'text-brand-textMuted hover:text-brand-textMain'
              }`}
            >
              <Icon size={15} />
              <span>{label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Skills tab */}
      {tab === 'skills' && (
        <div className="flex flex-col">
          <div className="ui-label mb-3">{skills.filter((s) => s.enabled !== false).length} enabled</div>
          {skills.length === 0 ? (
            <div className="ui-card px-6 py-10 text-center text-sm text-brand-textMuted">
              No skills discovered yet. Skills are read from your project's <code className="rounded bg-brand-bg px-1">skills/</code> folder.
            </div>
          ) : (
            <div className="ui-grid-auto">
              {skills.map((skill) => (
                <SkillCard key={skill.id} skill={skill} />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Plugins tab */}
      {tab === 'plugins' && (
        <div className="flex flex-col gap-6">
          <div className="ui-input flex items-center gap-2 border-transparent bg-brand-card">
            <Search size={14} className="flex-shrink-0 text-brand-textMuted" />
            <input
              type="text"
              data-testid="integration-plugin-search"
              placeholder="Search plugins"
              value={pluginQuery}
              onChange={(e) => setPluginQuery(e.target.value)}
              className="w-full border-none bg-transparent text-sm text-brand-textMain outline-none placeholder:text-brand-textMuted/50"
            />
          </div>

          {filteredPlugins.length === 0 ? (
            <div className="ui-card px-6 py-10 text-center text-sm text-brand-textMuted">
              No plugins match “{pluginQuery}”.
            </div>
          ) : (
            Object.entries(groupedPlugins).map(([category, items]) => (
              <div key={category} className="flex flex-col">
                <div className="settings-group-label mb-3">{CATEGORY_LABELS[category as IntegrationsPlugin['category']]}</div>
                <div className="ui-grid-auto">
                  {items.map((plugin) => (
                    <PluginCard key={plugin.id} plugin={plugin} />
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* MCP tab */}
      {tab === 'mcp' && <div data-testid="integration-mcp">{mcpDashboard}</div>}
    </div>
  );
};
