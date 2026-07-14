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
  | 'visualize';

/** Coarse grouping used for UI layout. */
export type PluginCategory = 'automation' | 'document' | 'media';

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
