import React, { useState } from 'react';
import { Sparkles, Check, Search, Wrench, AlertTriangle, RefreshCw } from 'lucide-react';

/** Readiness status shared by skills and plugins. */
export type IntegrationStatus = 'active' | 'under-development' | 'incomplete';

/** A discovered/catalog skill surfaced in the Skills panel. */
export interface IntegrationsSkill {
  id: string;
  name: string;
  description: string;
  enabled?: boolean;
  status?: IntegrationStatus;
  source?: 'discovered' | 'catalog';
}

/** A built-in or marketplace plugin from the Core catalog. */
export interface IntegrationsPlugin {
  id: string;
  name: string;
  description: string;
  icon: string;
  category: 'automation' | 'document' | 'media';
  tags: string[];
  defaultEnabled: boolean;
  status?: IntegrationStatus;
  source?: 'builtin' | 'marketplace';
}

/** Which single panel this instance renders. */
export type IntegrationsView = 'skills' | 'connectors' | 'plugins';

/** Props for the Integrations settings panel. */
interface IntegrationsSettingsProps {
  /** Which panel to render: Skills, Connectors (MCP), or Plugins. */
  view: IntegrationsView;
  mcpDashboard: React.ReactNode;
  skills: IntegrationsSkill[];
  onToggleSkill: (id: string, enabled: boolean) => void;
  /** Manually scan global ~/.claude/skills + ~/.agents/skills (and project dot-folders) for importable skills. */
  onScanSkills?: () => void;
  pluginCatalog: IntegrationsPlugin[];
  pluginEnabled: Record<string, boolean>;
  onTogglePlugin: (id: string, enabled: boolean) => void;
}

const CATEGORY_LABELS: Record<IntegrationsPlugin['category'], string> = {
  automation: 'Automation',
  document: 'Documents',
  media: 'Media & Visualization'
};

/** Copy shown at the top of each panel. */
const VIEW_META: Record<IntegrationsView, { title: string; subtitle: string }> = {
  skills: {
    title: 'Skills',
    subtitle: 'Reusable, model-invoked skills discovered from your project and the curated catalog.'
  },
  connectors: {
    title: 'Connectors',
    subtitle: 'Connect external MCP servers to give SuperAgent new tools and data sources.'
  },
  plugins: {
    title: 'Plugins',
    subtitle: 'Toggle SuperAgent\'s built-in capabilities and browse marketplace plugins.'
  }
};

/** Small status pill: "Under Development" / "Incomplete". `active` renders nothing. */
const StatusBadge: React.FC<{ status?: IntegrationStatus }> = ({ status }) => {
  if (!status || status === 'active') return null;
  if (status === 'incomplete') {
    return (
      <span className="ui-badge destructive" data-testid="status-badge-incomplete">
        <AlertTriangle size={10} /> Incomplete
      </span>
    );
  }
  return (
    <span className="ui-badge muted" data-testid="status-badge-under-development">
      <Wrench size={10} /> Under Development
    </span>
  );
};

/** Renders one of the Integrations panels (Skills, Connectors, or Plugins). */
export const IntegrationsSettings: React.FC<IntegrationsSettingsProps> = ({
  view,
  mcpDashboard,
  skills,
  onToggleSkill,
  onScanSkills,
  pluginCatalog,
  pluginEnabled,
  onTogglePlugin
}) => {
  const [pluginQuery, setPluginQuery] = useState('');

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
    const isUnderDevelopment = skill.status === 'under-development';
    const [enabled, setEnabled] = useState(!isUnderDevelopment && (skill.enabled ?? true));
    const interactive = !isUnderDevelopment;
    return (
      <button
        type="button"
        disabled={!interactive}
        data-testid={`integration-skill-${skill.id}`}
        onClick={() => {
          if (!interactive) return;
          const next = !enabled;
          setEnabled(next);
          onToggleSkill(skill.id, next);
        }}
        className={`ui-card flex items-center justify-between gap-4 p-4 text-left transition-all duration-200 ${
          enabled ? 'border-[var(--brand-accent-border)]' : ''
        } ${isUnderDevelopment ? 'opacity-60 cursor-not-allowed' : ''}`}
      >
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-brand-textMain">{skill.name}</span>
            <StatusBadge status={skill.status} />
          </div>
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
    const isUnderDevelopment = plugin.status === 'under-development';
    const enabled = isUnderDevelopment ? false : (pluginEnabled[plugin.id] ?? plugin.defaultEnabled);
    return (
      <div
        data-testid={`integration-plugin-${plugin.id}`}
        className={`ui-card flex items-center gap-4 p-4 ${isUnderDevelopment ? 'opacity-60' : ''}`}
      >
        <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl bg-brand-bg text-2xl">
          {plugin.icon}
        </div>
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex items-center gap-2">
            <span className="text-sm font-semibold text-brand-textMain">{plugin.name}</span>
            {enabled && (
              <span className="ui-badge constructive">
                <Check size={10} /> Enabled
              </span>
            )}
            <StatusBadge status={plugin.status} />
          </div>
          <p className="text-xs text-brand-textMuted line-clamp-2">{plugin.description}</p>
        </div>
        <button
          type="button"
          disabled={isUnderDevelopment}
          data-testid={`integration-plugin-toggle-${plugin.id}`}
          onClick={() => {
            if (isUnderDevelopment) return;
            onTogglePlugin(plugin.id, !enabled);
          }}
          className={`px-3 py-1 rounded-lg border text-xs transition-all flex-shrink-0 ${
            isUnderDevelopment ? 'cursor-not-allowed' : ''
          } ${
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

  const meta = VIEW_META[view];

  return (
    <div className="mx-auto w-full max-w-3xl text-left">
      <div className="mb-6">
        <h1 className="font-outfit text-2xl font-semibold tracking-tight text-brand-textMain sm:text-3xl">
          {meta.title}
        </h1>
        <p className="mb-2 mt-2 text-sm leading-relaxed text-brand-textMuted sm:text-base">
          {meta.subtitle}
        </p>
      </div>

      {/* Skills panel */}
      {view === 'skills' && (
        <div className="flex flex-col" data-testid="integration-view-skills">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div className="ui-label">
              {skills.filter((s) => s.status !== 'under-development' && s.enabled !== false).length} enabled
            </div>
            {onScanSkills && (
              <button
                type="button"
                data-testid="scan-skills-button"
                onClick={onScanSkills}
                className="flex items-center gap-1.5 rounded-lg border border-brand-border bg-brand-bg px-2.5 py-1 text-[11px] font-medium text-brand-textMain transition-colors hover:bg-brand-hover"
              >
                <RefreshCw size={12} /> Scan for skills
              </button>
            )}
          </div>
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

      {/* Plugins panel */}
      {view === 'plugins' && (
        <div className="flex flex-col gap-6" data-testid="integration-view-plugins">
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

      {/* Connectors panel (MCP) */}
      {view === 'connectors' && <div data-testid="integration-mcp">{mcpDashboard}</div>}
    </div>
  );
};
