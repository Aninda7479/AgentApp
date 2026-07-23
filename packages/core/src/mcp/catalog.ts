export interface MCPCatalogEnvVar {
  name: string;
  description: string;
  required: boolean;
  default?: string;
}

export interface MCPCatalogItem {
  id: string;
  name: string;
  description: string;
  category: 'developer' | 'database' | 'web' | 'productivity' | 'memory';
  icon: string;
  command: string;
  args: string[];
  envVars: MCPCatalogEnvVar[];
  publisher: string;
  website?: string;
}

export const CURATED_MCP_CATALOG: MCPCatalogItem[] = [
  {
    id: 'github',
    name: 'GitHub MCP Server',
    description: 'Interact with GitHub repositories, issues, pull requests, commits, and code search.',
    category: 'developer',
    icon: 'github',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-github'],
    envVars: [
      { name: 'GITHUB_PERSONAL_ACCESS_TOKEN', description: 'GitHub Personal Access Token with repo access', required: true }
    ],
    publisher: 'Anthropic / MCP Core',
    website: 'https://github.com/modelcontextprotocol/servers'
  },
  {
    id: 'filesystem',
    name: 'Filesystem MCP Server',
    description: 'Secure file operations, directory listing, searching, and file editing.',
    category: 'developer',
    icon: 'folder',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-filesystem', './'],
    envVars: [],
    publisher: 'Anthropic / MCP Core',
    website: 'https://github.com/modelcontextprotocol/servers'
  },
  {
    id: 'postgres',
    name: 'PostgreSQL MCP Server',
    description: 'Inspect schemas, run read queries, and analyze SQL tables.',
    category: 'database',
    icon: 'database',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-postgres', 'postgresql://localhost/mydb'],
    envVars: [
      { name: 'POSTGRES_URL', description: 'PostgreSQL Connection URI string', required: true, default: 'postgresql://user:pass@localhost:5432/db' }
    ],
    publisher: 'Anthropic / MCP Core',
    website: 'https://github.com/modelcontextprotocol/servers'
  },
  {
    id: 'sqlite',
    name: 'SQLite MCP Server',
    description: 'Database tools for reading, querying, and analyzing local SQLite databases.',
    category: 'database',
    icon: 'database',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-sqlite', './app.db'],
    envVars: [],
    publisher: 'Anthropic / MCP Core',
    website: 'https://github.com/modelcontextprotocol/servers'
  },
  {
    id: 'puppeteer',
    name: 'Puppeteer Browser Automation',
    description: 'Automate browser navigation, screenshot capture, DOM inspection, and form interaction.',
    category: 'web',
    icon: 'globe',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-puppeteer'],
    envVars: [],
    publisher: 'Anthropic / MCP Core',
    website: 'https://github.com/modelcontextprotocol/servers'
  },
  {
    id: 'fetch',
    name: 'Web Fetch MCP Server',
    description: 'Fetch web pages, convert HTML to clean markdown, and extract text context.',
    category: 'web',
    icon: 'link',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-fetch'],
    envVars: [],
    publisher: 'Anthropic / MCP Core',
    website: 'https://github.com/modelcontextprotocol/servers'
  },
  {
    id: 'memory',
    name: 'Knowledge Graph Memory',
    description: 'Graph-based persistent memory server for entity and relation tracking.',
    category: 'memory',
    icon: 'brain',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-memory'],
    envVars: [],
    publisher: 'Anthropic / MCP Core',
    website: 'https://github.com/modelcontextprotocol/servers'
  },
  {
    id: 'slack',
    name: 'Slack MCP Server',
    description: 'Search Slack channels, list messages, post updates, and reply to threads.',
    category: 'productivity',
    icon: 'message-square',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-slack'],
    envVars: [
      { name: 'SLACK_BOT_TOKEN', description: 'Slack Bot User OAuth Token (xoxb-...)', required: true },
      { name: 'SLACK_TEAM_ID', description: 'Slack Workspace Team ID', required: true }
    ],
    publisher: 'Anthropic / MCP Core',
    website: 'https://github.com/modelcontextprotocol/servers'
  }
];

export class MCPCatalogService {
  public static getCatalog(): MCPCatalogItem[] {
    return [...CURATED_MCP_CATALOG];
  }

  public static getItem(id: string): MCPCatalogItem | undefined {
    return CURATED_MCP_CATALOG.find((item) => item.id === id);
  }
}
