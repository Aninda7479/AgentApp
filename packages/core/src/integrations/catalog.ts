/**
 * Curated catalog of popular, one-click installable Model Context Protocol
 * (MCP) servers. Each entry declares the command/URL template, the
 * transport, and any environment keys the server needs (API tokens,
 * connection strings, etc.). The {@link resolveMcpServer} helper turns an
 * entry + a set of provided key values into a fully-resolved server spec
 * that the desktop runtime can connect to — keeping all install logic in
 * Core rather than the UI.
 */

import { GENERATED_MCP_CATALOG } from './catalog-data.js';

/** A required or optional environment key an MCP server needs to run. */
export interface McpEnvKey {
  /** Environment variable name, e.g. `GITHUB_PERSONAL_ACCESS_TOKEN`. */
  key: string;
  /** Human-friendly label shown next to the input. */
  label: string;
  /** Short helper text (where to get the key, format, etc.). */
  description?: string;
  /** Whether the server cannot connect without this value. */
  required: boolean;
  /** Render the input as a masked password field. */
  secret: boolean;
  /** Optional link to obtain the key. */
  url?: string;
}

/** Supported MCP transports. */
export type McpTransport = 'stdio' | 'sse' | 'http';

/** A curated, one-click installable MCP server definition. */
export interface McpCatalogEntry {
  /** Stable catalog id (e.g. `github`). */
  id: string;
  /** Display name. */
  name: string;
  /** One-line description of what the server provides. */
  description: string;
  /** Transport used to reach the server. */
  transport: McpTransport;
  /**
   * Base command for `stdio` servers, or the URL for `sse`/`http` servers.
   * May contain `${KEY}` placeholders that are filled from provided values.
   */
  command: string;
  /**
   * Extra arguments for `stdio` servers. Each may contain `${KEY}`
   * placeholders. Ignored for `sse`/`http`.
   */
  args: string[];
  /** Environment keys the server requires/accepts. */
  envKeys: McpEnvKey[];
  /** Free-form tags used for filtering/grouping in the UI. */
  tags: string[];
  /** Human-readable category (e.g. "Databases", "Developer Tools"). */
  category?: string;
  /**
   * Whether the server can be installed directly from the catalog. `false`
   * means we only have a docs/homepage link. Absent is treated as installable.
   */
  installable?: boolean;
  /** Optional emoji/icon shown in the catalog card. */
  icon?: string;
  /** Optional homepage / docs link. */
  homepage?: string;
}

/** A fully-resolved server spec ready to hand to the runtime connector. */
export interface ResolvedMcpServer {
  name: string;
  transport: McpTransport;
  /** Joined command string (stdio) or URL (sse/http). */
  commandOrUrl: string;
  /** Resolved environment variables to inject. */
  env: Record<string, string>;
}

const fillTemplate = (template: string, values: Record<string, string>): string =>
  template.replace(/\$\{(\w+)\}/g, (_match, token: string) => values[token] ?? '');

/**
 * Resolves a catalog entry into a concrete server spec by injecting the
 * provided key values into command/args placeholders and collecting the
 * relevant environment variables.
 */
export function resolveMcpServer(
  entry: McpCatalogEntry,
  values: Record<string, string> = {}
): ResolvedMcpServer {
  const env: Record<string, string> = {};
  for (const envKey of entry.envKeys) {
    const value = values[envKey.key];
    if (value !== undefined && value !== '') {
      env[envKey.key] = value;
    }
  }

  const command = fillTemplate(entry.command, values);
  if (entry.transport === 'stdio') {
    const args = entry.args.map((arg) => fillTemplate(arg, values));
    return {
      name: entry.name,
      transport: 'stdio',
      commandOrUrl: [command, ...args].filter(Boolean).join(' ').trim(),
      env
    };
  }

  return { name: entry.name, transport: entry.transport, commandOrUrl: command, env };
}

/**
 * Returns the catalog entries whose name, description, or tags match the
 * query (case-insensitive). An empty query returns the whole catalog.
 */
export function searchMcpCatalog(query: string, catalog: McpCatalogEntry[] = MCP_CATALOG): McpCatalogEntry[] {
  const q = query.trim().toLowerCase();
  if (!q) return catalog;
  return catalog.filter(
    (entry) =>
      entry.name.toLowerCase().includes(q) ||
      entry.description.toLowerCase().includes(q) ||
      entry.tags.some((tag) => tag.toLowerCase().includes(q)) ||
      (entry.category?.toLowerCase().includes(q) ?? false)
  );
}

/** Popular, community-maintained MCP servers available for one-click install. */
const CURATED_MCP_CATALOG: McpCatalogEntry[] = [
  {
    id: 'filesystem',
    name: 'Filesystem',
    description: 'Secure local file read/write, search, and directory operations.',
    transport: 'stdio',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-filesystem', '${ROOT_DIR}'],
    envKeys: [
      {
        key: 'ROOT_DIR',
        label: 'Root directory',
        description: 'Folder the server is allowed to access (defaults to current directory).',
        required: false,
        secret: false
      }
    ],
    tags: ['files', 'local', 'productivity'],
    icon: '📁',
    homepage: 'https://github.com/modelcontextprotocol/servers/tree/main/src/filesystem'
  },
  {
    id: 'memory',
    name: 'Memory',
    description: 'Knowledge-graph based persistent memory across sessions.',
    transport: 'stdio',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-memory'],
    envKeys: [],
    tags: ['memory', 'knowledge', 'productivity'],
    icon: '🧠',
    homepage: 'https://github.com/modelcontextprotocol/servers/tree/main/src/memory'
  },
  {
    id: 'github',
    name: 'GitHub',
    description: 'Repository, issue, pull-request, and workflow automation.',
    transport: 'stdio',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-github'],
    envKeys: [
      {
        key: 'GITHUB_PERSONAL_ACCESS_TOKEN',
        label: 'GitHub Personal Access Token',
        description: 'A fine-grained token with repo + read:org scopes.',
        required: true,
        secret: true,
        url: 'https://github.com/settings/tokens'
      }
    ],
    tags: ['devtools', 'code', 'git'],
    icon: '🐙',
    homepage: 'https://github.com/modelcontextprotocol/servers/tree/main/src/github'
  },
  {
    id: 'brave-search',
    name: 'Brave Search',
    description: 'Web and local search powered by the Brave Search API.',
    transport: 'stdio',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-brave-search'],
    envKeys: [
      {
        key: 'BRAVE_API_KEY',
        label: 'Brave API Key',
        description: 'Get a free key from the Brave Search API dashboard.',
        required: true,
        secret: true,
        url: 'https://brave.com/search/api/'
      }
    ],
    tags: ['search', 'web', 'research'],
    icon: '🦁',
    homepage: 'https://github.com/modelcontextprotocol/servers/tree/main/src/brave-search'
  },
  {
    id: 'puppeteer',
    name: 'Puppeteer',
    description: 'Headless-Chrome browser automation for scraping and interaction.',
    transport: 'stdio',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-puppeteer'],
    envKeys: [],
    tags: ['browser', 'automation', 'web'],
    icon: '🕸️',
    homepage: 'https://github.com/modelcontextprotocol/servers/tree/main/src/puppeteer'
  },
  {
    id: 'google-drive',
    name: 'Google Drive',
    description: 'Search, read, and manage files in Google Drive.',
    transport: 'stdio',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-gdrive'],
    envKeys: [
      {
        key: 'GOOGLE_CLIENT_ID',
        label: 'OAuth Client ID',
        description: 'From a Google Cloud OAuth 2.0 desktop credential.',
        required: true,
        secret: false
      },
      {
        key: 'GOOGLE_CLIENT_SECRET',
        label: 'OAuth Client Secret',
        required: true,
        secret: true
      },
      {
        key: 'GOOGLE_REFRESH_TOKEN',
        label: 'OAuth Refresh Token',
        description: 'Refresh token authorised for Drive scopes.',
        required: true,
        secret: true
      }
    ],
    tags: ['cloud', 'docs', 'google'],
    icon: '📂',
    homepage: 'https://github.com/modelcontextprotocol/servers/tree/main/src/gdrive'
  },
  {
    id: 'slack',
    name: 'Slack',
    description: 'Read channels, post messages, and manage Slack workspaces.',
    transport: 'stdio',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-slack'],
    envKeys: [
      {
        key: 'SLACK_BOT_TOKEN',
        label: 'Slack Bot Token',
        description: 'xoxb-… token from your Slack app.',
        required: true,
        secret: true
      },
      {
        key: 'SLACK_TEAM_ID',
        label: 'Slack Team ID',
        description: 'Optional: restrict to a specific workspace.',
        required: false,
        secret: false
      }
    ],
    tags: ['chat', 'team', 'productivity'],
    icon: '💬',
    homepage: 'https://github.com/modelcontextprotocol/servers/tree/main/src/slack'
  },
  {
    id: 'postgres',
    name: 'PostgreSQL',
    description: 'Run read-only queries and inspect schemas on a Postgres database.',
    transport: 'stdio',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-postgres'],
    envKeys: [
      {
        key: 'POSTGRES_CONNECTION_STRING',
        label: 'Connection String',
        description: 'postgresql://user:pass@host:5432/db',
        required: true,
        secret: true
      }
    ],
    tags: ['database', 'sql', 'data'],
    icon: '🐘',
    homepage: 'https://github.com/modelcontextprotocol/servers/tree/main/src/postgres'
  },
  {
    id: 'sqlite',
    name: 'SQLite',
    description: 'Query and manage a local SQLite database file.',
    transport: 'stdio',
    command: 'uvx',
    args: ['mcp-server-sqlite', '--db-path', '${DB_PATH}'],
    envKeys: [
      {
        key: 'DB_PATH',
        label: 'Database file path',
        description: 'Path to the .sqlite/.db file to open.',
        required: true,
        secret: false
      }
    ],
    tags: ['database', 'sql', 'local', 'data'],
    icon: '🗄️',
    homepage: 'https://github.com/modelcontextprotocol/servers/tree/main/src/sqlite'
  },
  {
    id: 'sequential-thinking',
    name: 'Sequential Thinking',
    description: 'Structured step-by-step reasoning and problem decomposition.',
    transport: 'stdio',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-sequential-thinking'],
    envKeys: [],
    tags: ['reasoning', 'productivity'],
    icon: '🔢',
    homepage: 'https://github.com/modelcontextprotocol/servers/tree/main/src/sequentialthinking'
  },
  {
    id: 'fetch',
    name: 'Fetch',
    description: 'Lightweight web content fetching and extraction.',
    transport: 'stdio',
    command: 'uvx',
    args: ['mcp-server-fetch'],
    envKeys: [],
    tags: ['web', 'research', 'fetch'],
    icon: '🌐',
    homepage: 'https://github.com/modelcontextprotocol/servers/tree/main/src/fetch'
  },
  {
    id: 'git',
    name: 'Git',
    description: 'Local Git repository operations: status, diff, commit, log.',
    transport: 'stdio',
    command: 'uvx',
    args: ['mcp-server-git'],
    envKeys: [],
    tags: ['devtools', 'git', 'code'],
    icon: '🔧',
    homepage: 'https://github.com/modelcontextprotocol/servers/tree/main/src/git'
  },
  {
    id: 'notion',
    name: 'Notion',
    description: 'Search and read Notion pages via the official API.',
    transport: 'stdio',
    command: 'npx',
    args: ['-y', '@notionhq/notion-mcp-server'],
    envKeys: [
      {
        key: 'OPENAPI_MCP_HEADERS',
        label: 'OpenAPI MCP Headers (JSON)',
        description: '{"Authorization":"Bearer <token>","Notion-Version":"2022-06-28"}',
        required: true,
        secret: true,
        url: 'https://www.notion.so/profile/integrations'
      }
    ],
    tags: ['docs', 'notes', 'productivity'],
    icon: '📝',
    homepage: 'https://github.com/makenotion/notion-mcp-server'
  }
];

/**
 * The complete catalog: curated servers first, followed by every server parsed
 * from the awesome-mcp-servers README. De-duplicated by id so curated entries
 * take precedence over generated ones with the same id.
 */
const mergedCatalog = new Map<string, McpCatalogEntry>();
for (const entry of CURATED_MCP_CATALOG) mergedCatalog.set(entry.id, entry);
for (const entry of GENERATED_MCP_CATALOG) {
  if (!mergedCatalog.has(entry.id)) mergedCatalog.set(entry.id, entry);
}
/** Full MCP catalog (curated + every awesome-mcp-servers entry). */
export const MCP_CATALOG: McpCatalogEntry[] = [...mergedCatalog.values()];

/** Looks up a single catalog entry by id. */
export function getMcpCatalogEntry(id: string): McpCatalogEntry | undefined {
  return MCP_CATALOG.find((entry) => entry.id === id);
}
