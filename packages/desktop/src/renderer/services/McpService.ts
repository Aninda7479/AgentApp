/**
 * MCP Service for Managing MCP Server Catalog & Connections
 */

import type { MCPServerInfo } from '../core/types';

export interface CatalogEnvKey {
  key: string;
  label: string;
  description?: string;
  required: boolean;
  secret: boolean;
  url?: string;
}

export interface CatalogEntry {
  id: string;
  name: string;
  description: string;
  transport: 'stdio' | 'sse' | 'http';
  command: string;
  args: string[];
  envKeys: CatalogEnvKey[];
  tags: string[];
  category?: string;
  installable?: boolean;
  icon?: string;
  homepage?: string;
  commandOrUrl?: string;
}

export class McpService {
  static installedIds(servers: MCPServerInfo[]): Set<string> {
    return new Set(servers.map((s) => s.id));
  }

  static filterCatalog(
    catalog: CatalogEntry[],
    installedIds: Set<string>,
    query: string
  ): CatalogEntry[] {
    const q = query.trim().toLowerCase();
    return catalog.filter((entry) => {
      if (installedIds.has(entry.id)) return false;
      if (!q) return true;
      return entry.name.toLowerCase().includes(q) || entry.description.toLowerCase().includes(q);
    });
  }

  static buildNewServer(name: string, transport: 'stdio' | 'sse', commandOrUrl: string): Partial<MCPServerInfo> {
    const id = `mcp-${name.toLowerCase().replace(/[^a-z0-9_-]/g, '-')}`;
    return {
      id,
      name,
      transport,
      commandOrUrl,
      status: 'disconnected',
      enabled: true,
      toolsCount: 0,
    };
  }
}
