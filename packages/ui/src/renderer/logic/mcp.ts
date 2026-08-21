/**
 * `McpService` — manages MCP (Model Context Protocol) server connections: adding
 * a server, removing/toggling it, and installing a curated catalog server. Each
 * operation optimistically updates React state, then performs the real IPC
 * connection and reconciles the result (status / tool count / latency).
 */
import type { AppContext, MCPServerInfo } from './types';

/** Minimal shape of a catalog entry needed for filtering (avoids depending on the component's full type). */
interface CatalogEntryLike {
  id: string;
  name: string;
  description: string;
  tags: string[];
  category?: string;
  installable?: boolean;
}

export class McpService {
  /**
   * Adds a new MCP server entry (optimistically "connecting"), then attempts a
   * real connection via IPC. On success/error it updates the server's status,
   * tool count, and latency and toasts the result.
   */
  static add(ctx: AppContext, newServer: Partial<MCPServerInfo>): void {
    const created: MCPServerInfo = {
      id: `mcp-${Date.now()}`,
      name: newServer.name || 'Custom Server',
      transport: newServer.transport || 'stdio',
      commandOrUrl: newServer.commandOrUrl || '',
      status: 'connecting',
      enabled: true,
      toolsCount: 0,
      latencyMs: 15
    };
    ctx.setMcpServers((prev) => [...prev, created]);

    ctx.ipc
      ?.invoke('mcp-connect', {
        id: created.id,
        name: created.name,
        transport: created.transport,
        commandOrUrl: created.commandOrUrl
      })
      .then((res: any) => {
        const tools = res?.tools || [];
        ctx.setMcpServers((prev) =>
          prev.map((s) =>
            s.id === created.id
              ? {
                  ...s,
                  status: res?.success ? 'connected' : 'error',
                  toolsCount: tools.length,
                  latencyMs: res?.success ? Math.max(1, Math.round((res?.latencyMs as number) || 12)) : s.latencyMs
                }
              : s
          )
        );
        if (res?.success) {
          ctx.triggerToast(`Connected to ${created.name} (${tools.length} tools)`);
        } else {
          ctx.triggerToast(`Failed to connect to ${created.name}: ${res?.error || 'unknown error'}`, 'error');
        }
      })
      .catch((err: unknown) => {
        ctx.setMcpServers((prev) => prev.map((s) => (s.id === created.id ? { ...s, status: 'error' } : s)));
        ctx.triggerToast(`Failed to connect to ${created.name}: ${(err as Error).message}`, 'error');
      });
  }

  /** Disconnects and removes an MCP server by id. */
  static remove(ctx: AppContext, id: string): void {
    ctx.ipc?.invoke('mcp-disconnect', id).catch(() => {});
    ctx.setMcpServers((prev) => prev.filter((s) => s.id !== id));
  }

  /** Toggles an MCP server's enabled flag (no IPC — local preference). */
  static toggle(ctx: AppContext, id: string, enabled: boolean): void {
    ctx.setMcpServers((prev) => prev.map((s) => (s.id === id ? { ...s, enabled } : s)));
  }

  /**
   * Installs a curated catalog server: adds an optimistic "connecting" entry,
   * resolves any required keys via IPC, and reconciles the connection result.
   */
  static installCatalog(ctx: AppContext, entry: any, keys: Record<string, string>): void {
    const createdId = `mcp-catalog-${entry.id}`;
    ctx.setMcpServers((prev) => [
      ...prev,
      {
        id: createdId,
        name: entry.name,
        transport: entry.transport,
        commandOrUrl: '(installing…)',
        status: 'connecting',
        enabled: true,
        toolsCount: 0,
        latencyMs: 15
      }
    ]);

    ctx.ipc
      ?.invoke('mcp-install', { id: entry.id, keys })
      .then((res: any) => {
        const tools = res?.tools || [];
        ctx.setMcpServers((prev) =>
          prev.map((s) =>
            s.id === createdId
              ? {
                  ...s,
                  status: res?.success ? 'connected' : 'error',
                  commandOrUrl: res?.success ? entry.command : s.commandOrUrl,
                  toolsCount: tools.length,
                  latencyMs: res?.success ? Math.max(1, Math.round((res?.latencyMs as number) || 12)) : s.latencyMs
                }
              : s
          )
        );
        if (res?.success) {
          ctx.triggerToast(`Connected to ${entry.name} (${tools.length} tools)`);
        } else {
          ctx.triggerToast(`Failed to connect to ${entry.name}: ${res?.error || 'unknown error'}`, 'error');
        }
      })
      .catch((err: unknown) => {
        ctx.setMcpServers((prev) => prev.map((s) => (s.id === createdId ? { ...s, status: 'error' } : s)));
        ctx.triggerToast(`Failed to connect to ${entry.name}: ${(err as Error).message}`, 'error');
      });
  }

  /**
   * Strips the `mcp-catalog-` prefix from each server id to obtain the set of
   * underlying catalog entry ids that are already installed (used to hide
   * installed servers from the one-click catalog browser).
   */
  static installedIds(servers: MCPServerInfo[]): Set<string> {
    return new Set(servers.map((s) => s.id.replace(/^mcp-catalog-/, '')));
  }

  /**
   * Filters a catalog down to entries that are not yet installed, then
   * optionally narrows by a free-text query across name, description, tags,
   * and category. When the query is empty, only directly-installable servers
   * are shown (top picks first).
   */
  static filterCatalog<T extends CatalogEntryLike>(
    catalog: T[],
    installedIds: Set<string>,
    query: string
  ): T[] {
    const notInstalled = catalog.filter((e) => !installedIds.has(e.id));
    const q = query.trim().toLowerCase();
    if (!q) {
      return notInstalled.filter((e) => e.installable !== false);
    }
    return notInstalled.filter(
      (e) =>
        e.name.toLowerCase().includes(q) ||
        e.description.toLowerCase().includes(q) ||
        e.tags.some((t) => t.toLowerCase().includes(q)) ||
        (e.category?.toLowerCase().includes(q) ?? false)
    );
  }

  /**
   * Builds the partial server record submitted when the user adds a new MCP
   * server from the dashboard's inline form (optimistically "connecting").
   */
  static buildNewServer(
    name: string,
    transport: 'stdio' | 'sse',
    commandOrUrl: string
  ): Partial<MCPServerInfo> {
    return {
      name,
      transport,
      commandOrUrl,
      status: 'connecting',
      enabled: true,
      toolsCount: 0
    };
  }
}
