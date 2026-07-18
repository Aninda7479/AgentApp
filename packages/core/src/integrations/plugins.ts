/**
 * Built-in Plugin catalog. Plugins bundle SuperAgent's native capabilities
 * (browser automation, computer use, document/PDF/spreadsheet/presentation
 * generation, and data visualization) into user-toggleable units. The
 * desktop UI reads this catalog from Core and persists the user's enabled
 * set; the agent runtime consults the same catalog to decide which
 * capability modules to load.
 */

/** Stable capability identifier each plugin maps to in the runtime. */
export type PluginCapability =
  | 'browserUse'
  | 'computerUse'
  | 'document'
  | 'pdf'
  | 'spreadsheets'
  | 'presentations'
  | 'visualize'
  /** Marketplace/under-development plugins that do not yet map to a runtime module. */
  | 'marketplace';

/** Coarse grouping used for UI layout. */
export type PluginCategory = 'automation' | 'document' | 'media';

/** Lifecycle/readiness status surfaced in the Settings UI. */
export type PluginStatus = 'active' | 'under-development' | 'incomplete';

/** Whether the plugin ships with the app or comes from the marketplace catalog. */
export type PluginSource = 'builtin' | 'marketplace';

/** A single built-in plugin definition. */
export interface PluginCatalogEntry {
  /** Stable plugin id (e.g. `browser-use`). */
  id: string;
  /** Runtime capability this plugin enables. */
  capability: PluginCapability;
  /** Display name. */
  name: string;
  /** One-line description. */
  description: string;
  /** Emoji/icon shown in the plugin card. */
  icon: string;
  /** UI grouping. */
  category: PluginCategory;
  /** Whether the plugin ships enabled by default. */
  defaultEnabled: boolean;
  /** Free-form tags. */
  tags: string[];
  /** Readiness status. Built-ins default to `active`; marketplace items are `under-development`. */
  status?: PluginStatus;
  /** Origin of the plugin. Defaults to `builtin`. */
  source?: PluginSource;
}

/** The seven built-in plugins. */
export const PLUGIN_CATALOG: PluginCatalogEntry[] = [
  {
    id: 'browser-use',
    capability: 'browserUse',
    name: 'Browser Use',
    description: 'Drive a real browser to research, navigate, and act on the web.',
    icon: '🌐',
    category: 'automation',
    defaultEnabled: true,
    tags: ['web', 'automation']
  },
  {
    id: 'computer-use',
    capability: 'computerUse',
    name: 'Computer Use',
    description: 'Control the desktop — click, type, and run workflows on your machine.',
    icon: '🖥️',
    category: 'automation',
    defaultEnabled: true,
    tags: ['desktop', 'automation']
  },
  {
    id: 'document',
    capability: 'document',
    name: 'Document',
    description: 'Read and author Word and Markdown documents with the agent.',
    icon: '📄',
    category: 'document',
    defaultEnabled: true,
    tags: ['office', 'writing']
  },
  {
    id: 'pdf',
    capability: 'pdf',
    name: 'PDF',
    description: 'Generate, compile, and extract content from PDF files.',
    icon: '📕',
    category: 'document',
    defaultEnabled: true,
    tags: ['office', 'pdf']
  },
  {
    id: 'spreadsheets',
    capability: 'spreadsheets',
    name: 'Spreadsheets',
    description: 'Create and edit spreadsheets and CSV data directly in your workspace.',
    icon: '📊',
    category: 'document',
    defaultEnabled: true,
    tags: ['office', 'data']
  },
  {
    id: 'presentations',
    capability: 'presentations',
    name: 'Presentations',
    description: 'Build slide decks with an agent-written narrative and design.',
    icon: '📽️',
    category: 'media',
    defaultEnabled: true,
    tags: ['office', 'slides']
  },
  {
    id: 'visualize',
    capability: 'visualize',
    name: 'Visualize',
    description: 'Render charts, diagrams, and rich data visualizations.',
    icon: '📈',
    category: 'media',
    defaultEnabled: false,
    tags: ['media', 'data']
  }
];

/**
 * Marketplace plugins surfaced in Settings → Plugins as inactive and flagged
 * "Under Development". These do NOT map to a runtime capability module yet, so
 * every entry shares `capability: 'marketplace'` and `defaultEnabled: false`.
 * They are merged into the desktop/web `plugins-catalog` response at the IPC
 * layer — kept separate from `PLUGIN_CATALOG` so the built-in catalog (and its
 * unique-capability invariant) stays intact.
 */
export const MARKETPLACE_PLUGINS: PluginCatalogEntry[] = [
  {
    id: 'pdf-viewer',
    capability: 'marketplace',
    name: 'PDF Viewer',
    description:
      'View, annotate, and sign PDFs in a live interactive viewer. Mark up contracts, fill forms with visual feedback, stamp approvals, and place signatures — then download the annotated copy.',
    icon: '📄',
    category: 'document',
    defaultEnabled: false,
    tags: ['pdf', 'documents', 'signing'],
    status: 'under-development',
    source: 'marketplace'
  },
  {
    id: 'small-business',
    capability: 'marketplace',
    name: 'Small Business',
    description:
      'Pre-built small business workflows (including payroll planning, month-end close, weekly briefs, and growth campaigns) using your QuickBooks, PayPal, HubSpot, Docusign, Gsuite, O365, Canva, and other connected tools. You approve every step that touches money or customers.',
    icon: '🏪',
    category: 'automation',
    defaultEnabled: false,
    tags: ['business', 'workflows', 'finance'],
    status: 'under-development',
    source: 'marketplace'
  },
  {
    id: 'operations',
    capability: 'marketplace',
    name: 'Operations',
    description:
      'Optimize business operations — vendor management, process documentation, change management, capacity planning, and compliance tracking. Keep your organization running efficiently.',
    icon: '⚙️',
    category: 'automation',
    defaultEnabled: false,
    tags: ['operations', 'process', 'compliance'],
    status: 'under-development',
    source: 'marketplace'
  },
  {
    id: 'design',
    capability: 'marketplace',
    name: 'Design',
    description:
      'Accelerate design workflows — critique, design system management, UX writing, accessibility audits, research synthesis, and dev handoff. From exploration to pixel-perfect specs.',
    icon: '🎨',
    category: 'media',
    defaultEnabled: false,
    tags: ['design', 'ux', 'accessibility'],
    status: 'under-development',
    source: 'marketplace'
  },
  {
    id: 'human-resources',
    capability: 'marketplace',
    name: 'Human Resources',
    description:
      'Streamline people operations — recruiting, onboarding, performance reviews, compensation analysis, and policy guidance. Maintain compliance and keep your team running smoothly.',
    icon: '👥',
    category: 'automation',
    defaultEnabled: false,
    tags: ['hr', 'people', 'recruiting'],
    status: 'under-development',
    source: 'marketplace'
  },
  {
    id: 'engineering',
    capability: 'marketplace',
    name: 'Engineering',
    description:
      'Streamline engineering workflows — standups, code review, architecture decisions, incident response, and technical documentation. Works with your existing tools or standalone.',
    icon: '🛠️',
    category: 'automation',
    defaultEnabled: false,
    tags: ['engineering', 'code-review', 'devops'],
    status: 'under-development',
    source: 'marketplace'
  },
  {
    id: 'bio-research',
    capability: 'marketplace',
    name: 'Bio Research',
    description:
      'Connect to preclinical research tools and databases (literature search, genomics analysis, target prioritization) to accelerate early-stage life sciences R&D',
    icon: '🧬',
    category: 'automation',
    defaultEnabled: false,
    tags: ['research', 'genomics', 'science'],
    status: 'under-development',
    source: 'marketplace'
  },
  {
    id: 'marketing',
    capability: 'marketplace',
    name: 'Marketing',
    description:
      'Create content, plan campaigns, and analyze performance across marketing channels. Maintain brand voice consistency, track competitors, and report on what\'s working.',
    icon: '📣',
    category: 'media',
    defaultEnabled: false,
    tags: ['marketing', 'content', 'campaigns'],
    status: 'under-development',
    source: 'marketplace'
  },
  {
    id: 'product-management',
    capability: 'marketplace',
    name: 'Product Management',
    description:
      'Write feature specs, plan roadmaps, and synthesize user research faster. Keep stakeholders updated and stay ahead of the competitive landscape.',
    icon: '🗺️',
    category: 'document',
    defaultEnabled: false,
    tags: ['product', 'roadmap', 'specs'],
    status: 'under-development',
    source: 'marketplace'
  },
  {
    id: 'data',
    capability: 'marketplace',
    name: 'Data',
    description:
      'Write SQL, explore datasets, and generate insights faster. Build visualizations and dashboards, and turn raw data into clear stories for stakeholders.',
    icon: '📊',
    category: 'media',
    defaultEnabled: false,
    tags: ['data', 'sql', 'analytics'],
    status: 'under-development',
    source: 'marketplace'
  },
  {
    id: 'finance',
    capability: 'marketplace',
    name: 'Finance',
    description:
      'Streamline finance and accounting workflows, from journal entries and reconciliation to financial statements and variance analysis. Speed up audit prep, month-end close, and keeping your books clean.',
    icon: '💰',
    category: 'document',
    defaultEnabled: false,
    tags: ['finance', 'accounting', 'audit'],
    status: 'under-development',
    source: 'marketplace'
  },
  {
    id: 'sales',
    capability: 'marketplace',
    name: 'Sales',
    description:
      'Prospect, craft outreach, and build deal strategy faster. Prep for calls, manage your pipeline, and write personalized messaging that moves deals forward.',
    icon: '🤝',
    category: 'automation',
    defaultEnabled: false,
    tags: ['sales', 'crm', 'outreach'],
    status: 'under-development',
    source: 'marketplace'
  },
  {
    id: 'productivity',
    capability: 'marketplace',
    name: 'Productivity',
    description:
      'Manage tasks, plan your day, and build up memory of important context about your work. Syncs with your calendar, email, and chat to keep everything organized and on track.',
    icon: '✅',
    category: 'automation',
    defaultEnabled: false,
    tags: ['productivity', 'tasks', 'calendar'],
    status: 'under-development',
    source: 'marketplace'
  },
  {
    id: 'legal',
    capability: 'marketplace',
    name: 'Legal',
    description:
      'Speed up contract review, NDA triage, and compliance workflows for in-house legal teams. Draft legal briefs, organize precedent research, and manage institutional knowledge.',
    icon: '⚖️',
    category: 'document',
    defaultEnabled: false,
    tags: ['legal', 'contracts', 'compliance'],
    status: 'under-development',
    source: 'marketplace'
  },
  {
    id: 'enterprise-search',
    capability: 'marketplace',
    name: 'Enterprise Search',
    description:
      'Search across all of your company\'s tools in one place. Find anything across email, chat, documents, and wikis without switching between apps.',
    icon: '🔎',
    category: 'automation',
    defaultEnabled: false,
    tags: ['search', 'enterprise', 'knowledge'],
    status: 'under-development',
    source: 'marketplace'
  },
  {
    id: 'customer-support',
    capability: 'marketplace',
    name: 'Customer Support',
    description:
      'Triage tickets, draft responses, escalate issues, and build your knowledge base. Research customer context and turn resolved issues into self-service content.',
    icon: '🎧',
    category: 'automation',
    defaultEnabled: false,
    tags: ['support', 'tickets', 'knowledge-base'],
    status: 'under-development',
    source: 'marketplace'
  }
];

/** Looks up a single plugin by id. */
export function getPlugin(id: string): PluginCatalogEntry | undefined {
  return PLUGIN_CATALOG.find((plugin) => plugin.id === id);
}

/** Returns a map of pluginId → default-enabled state. */
export function defaultPluginState(): Record<string, boolean> {
  const state: Record<string, boolean> = {};
  for (const plugin of PLUGIN_CATALOG) {
    state[plugin.id] = plugin.defaultEnabled;
  }
  return state;
}
