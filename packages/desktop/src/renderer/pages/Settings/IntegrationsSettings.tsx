import React, { useState } from 'react';
import { Sparkles, Check, Search, Wrench, AlertTriangle, RefreshCw, Plus, X } from 'lucide-react';
import { EmptyState } from '../../components/EmptyState';

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
  origin?: 'superagent' | 'claude' | 'agent' | 'codex' | 'project';
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
  onAddSkill?: (name: string, description: string, instructions: string) => Promise<boolean>;
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
  onAddSkill,
  pluginCatalog,
  pluginEnabled,
  onTogglePlugin
}) => {
  const [pluginQuery, setPluginQuery] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [newSkillName, setNewSkillName] = useState('');
  const [newSkillDesc, setNewSkillDesc] = useState('');
  const [newSkillInstructions, setNewSkillInstructions] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSkillName.trim() || !newSkillInstructions.trim() || !onAddSkill) return;
    setIsSaving(true);
    const success = await onAddSkill(
      newSkillName.trim(),
      newSkillDesc.trim(),
      newSkillInstructions.trim()
    );
    setIsSaving(false);
    if (success) {
      setNewSkillName('');
      setNewSkillDesc('');
      setNewSkillInstructions('');
      setShowAddModal(false);
    }
  };

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

  const BrandBadge: React.FC<{ origin?: string }> = ({ origin }) => {
    if (!origin || origin === 'superagent' || origin === 'project') return null;
    
    let label = '';
    let colorClass = '';
    if (origin === 'claude') {
      label = 'Claude';
      colorClass = 'bg-orange-500/10 text-orange-500 border border-orange-500/20';
    } else if (origin === 'agent') {
      label = 'Agent';
      colorClass = 'bg-blue-500/10 text-blue-500 border border-blue-500/20';
    } else if (origin === 'codex') {
      label = 'Codex';
      colorClass = 'bg-purple-500/10 text-purple-500 border border-purple-500/20';
    }
    
    return (
      <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium leading-none uppercase tracking-wider ${colorClass}`}>
        {label}
      </span>
    );
  };

  const SkillCard: React.FC<{ skill: IntegrationsSkill }> = ({ skill }) => {
    const isUnderDevelopment = skill.status === 'under-development';
    const [enabled, setEnabled] = useState(!isUnderDevelopment && (skill.enabled ?? true));
    const interactive = !isUnderDevelopment;

    // Keep state in sync when prop changes (needed since toggle writes to settings and settings changes refetches list)
    React.useEffect(() => {
      setEnabled(!isUnderDevelopment && (skill.enabled ?? true));
    }, [skill.enabled, isUnderDevelopment]);

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
            <BrandBadge origin={skill.origin} />
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
            <div className="flex items-center gap-2">
              {onAddSkill && (
                <button
                  type="button"
                  onClick={() => setShowAddModal(true)}
                  className="flex items-center gap-1.5 rounded-lg border border-brand-border bg-brand-bg px-2.5 py-1 text-[11px] font-medium text-brand-textMain transition-colors hover:bg-brand-hover"
                >
                  <Plus size={12} /> Add Skill
                </button>
              )}
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
          </div>
          {skills.length === 0 ? (
            <EmptyState
              testid="integration-skills-empty"
              title="No skills discovered"
              message={
                <>
                  Skills are read from your project&rsquo;s <code className="rounded bg-brand-bg px-1">skills/</code> folder.
                </>
              }
            />
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
            <EmptyState
              testid="integration-plugins-empty"
              title="No plugins match"
              message={`No plugins match “${pluginQuery}”.`}
            />
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

      {showAddModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-[1000]">
          <div className="bg-brand-card border border-brand-border rounded-2xl w-[550px] max-w-[90%] p-6 shadow-[0_20px_50px_rgba(0,0,0,0.8)] text-brand-textMain">
            <div className="flex items-center justify-between mb-5 border-b border-brand-border/60 pb-3">
              <div className="flex items-center gap-2.5">
                <span className="text-xl">✨</span>
                <div>
                  <h2 className="text-lg font-bold text-brand-textMain m-0">Create Custom Skill</h2>
                  <p className="text-xs text-brand-textMuted mt-0.5">
                    Codify a reusable set of prompt instructions
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                className="text-brand-textMuted hover:text-brand-textMain transition-colors"
              >
                <X size={16} />
              </button>
            </div>
            
            <form onSubmit={handleSave} className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5 w-full">
                <label className="text-xs font-bold text-brand-textMain">Skill Name</label>
                <input
                  type="text"
                  required
                  value={newSkillName}
                  onChange={(e) => setNewSkillName(e.target.value)}
                  className="bg-brand-bg border border-brand-border rounded-lg px-3 py-2 text-sm text-brand-textMain outline-none focus:border-brand-highlight/75 focus:ring-1 focus:ring-brand-highlight/30 transition-all placeholder-brand-textMuted/40 w-full"
                  placeholder="e.g. Git Assistant"
                />
              </div>

              <div className="flex flex-col gap-1.5 w-full">
                <label className="text-xs font-bold text-brand-textMain">Description</label>
                <input
                  type="text"
                  value={newSkillDesc}
                  onChange={(e) => setNewSkillDesc(e.target.value)}
                  className="bg-brand-bg border border-brand-border rounded-lg px-3 py-2 text-sm text-brand-textMain outline-none focus:border-brand-highlight/75 focus:ring-1 focus:ring-brand-highlight/30 transition-all placeholder-brand-textMuted/40 w-full"
                  placeholder="What does this skill do?"
                />
              </div>

              <div className="flex flex-col gap-1.5 w-full">
                <label className="text-xs font-bold text-brand-textMain">Instructions</label>
                <textarea
                  required
                  value={newSkillInstructions}
                  onChange={(e) => setNewSkillInstructions(e.target.value)}
                  className="bg-brand-bg border border-brand-border rounded-lg px-3 py-2 text-sm text-brand-textMain outline-none focus:border-brand-highlight/75 focus:ring-1 focus:ring-brand-highlight/30 transition-all placeholder-brand-textMuted/40 w-full h-32 resize-none"
                  placeholder="Enter custom instructions or guidelines..."
                />
              </div>

              <div className="flex items-center justify-end gap-3 mt-4 border-t border-brand-border/60 pt-4">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 text-sm font-medium text-brand-textMuted hover:text-brand-textMain transition-colors rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="px-4 py-2 text-sm font-medium bg-[var(--brand-accent)] hover:bg-[var(--brand-accent-hover)] text-white transition-colors rounded-lg disabled:opacity-50"
                >
                  {isSaving ? 'Saving...' : 'Save Skill'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
