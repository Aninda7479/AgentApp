import React, { useState, useMemo, useEffect } from 'react';
import { Button, Input, Select, Toggle } from './ui';
import { Terminal, Globe, Sparkles, Plus, RefreshCw, Server, Trash2, Search } from 'lucide-react';
import { McpInstallModal } from './McpInstallModal';
import { McpService } from '../logic/mcp';

/** Information about a connected MCP server. */
export interface MCPServerInfo {
  id: string;
  name: string;
  transport: 'stdio' | 'sse';
  commandOrUrl: string;
  status: 'connected' | 'connecting' | 'disconnected' | 'error';
  enabled: boolean;
  toolsCount: number;
  latencyMs?: number;
}

/** A single environment key a catalog server requires. */
export interface CatalogEnvKey {
  key: string;
  label: string;
  description?: string;
  required: boolean;
  secret: boolean;
  url?: string;
}

/** A curated, one-click installable MCP server (mirrors the Core catalog shape). */
export interface CatalogEntry {
  id: string;
  name: string;
  description: string;
  transport: 'stdio' | 'sse' | 'http';
  command: string;
  args: string[];
  envKeys: CatalogEnvKey[];
  tags: string[];
  /** Human-readable category. */
  category?: string;
  /** Whether the server can be installed directly (absent = installable). */
  installable?: boolean;
  icon?: string;
  homepage?: string;
}

/** Props for the MCPDashboard component. */
export interface MCPDashboardProps {
  servers: MCPServerInfo[];
  onAddServer: (server: Partial<MCPServerInfo>) => void;
  onRemoveServer: (id: string) => void;
  onToggleServer: (id: string, enabled: boolean) => void;
  onRefreshServers?: () => void;
  /** Curated catalog of popular servers for one-click install. */
  catalog?: CatalogEntry[];
  /** Invoked when a catalog server is installed (with provided key values). */
  onInstallCatalog?: (entry: CatalogEntry, keys: Record<string, string>) => void;
}

/**
 * Maps a catalog server id to the GitHub organization whose avatar is used as
 * the brand logo (loaded from `https://github.com/<org>.png`). Falls back to
 * the server's emoji icon if the image fails to load.
 */
const LOGO_ORG: Record<string, string> = {
  filesystem: 'modelcontextprotocol',
  memory: 'modelcontextprotocol',
  'sequential-thinking': 'modelcontextprotocol',
  fetch: 'modelcontextprotocol',
  github: 'github',
  'brave-search': 'brave',
  puppeteer: 'puppeteer',
  'google-drive': 'google',
  slack: 'slackhq',
  postgres: 'postgres',
  sqlite: 'sqlite',
  git: 'git',
  notion: 'makenotion'
};

/** Renders a server's real brand logo with an emoji fallback tile. */
const ServerLogo: React.FC<{ id?: string; icon?: string; size?: number }> = ({ id, icon, size = 30 }) => {
  const [error, setError] = useState(false);
  const org = id ? LOGO_ORG[id] : undefined;

  if (error || !org) {
    return (
      <div
        style={{ width: size, height: size }}
        className="flex shrink-0 items-center justify-center rounded-lg bg-brand-bg text-base"
      >
        {icon || '🔌'}
      </div>
    );
  }

  return (
    <img
      src={`https://github.com/${org}.png?size=64`}
      alt=""
      onError={() => setError(true)}
      style={{ width: size, height: size }}
      className="shrink-0 rounded-lg bg-brand-bg object-cover"
    />
  );
};

const getStatusDotClass = (status: MCPServerInfo['status']) => {
  switch (status) {
    case 'connected': return 'bg-emerald-400';
    case 'connecting': return 'bg-amber-400 animate-pulse';
    case 'error': return 'bg-red-400';
    default: return 'bg-brand-textMuted/50';
  }
};

const getStatusBadgeClass = (status: MCPServerInfo['status']) => {
  switch (status) {
    case 'connected':
      return 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20';
    case 'connecting':
      return 'bg-amber-500/10 text-amber-400 border border-amber-500/20';
    case 'error':
      return 'bg-red-500/10 text-red-400 border border-red-500/20';
    default:
      return 'bg-brand-bg text-brand-textMuted border border-brand-border/40';
  }
};

const getStatusLabel = (status: MCPServerInfo['status']) => {
  switch (status) {
    case 'connected': return 'Connected';
    case 'connecting': return 'Connecting';
    case 'error': return 'Error';
    default: return 'Disconnected';
  }
};

/** A compact catalog card with a real logo; clicking Install opens the modal. */
const CatalogCard: React.FC<{
  entry: CatalogEntry;
  onRequestInstall: (entry: CatalogEntry) => void;
}> = ({ entry, onRequestInstall }) => {
  const installable = entry.installable !== false;
  const needsKeys = entry.envKeys.length > 0;

  return (
    <div
      data-testid={`mcp-popular-card-${entry.id}`}
      className="group flex items-center gap-3 rounded-xl border border-brand-border/60 bg-brand-card p-3 transition-all duration-200 hover:border-(--brand-accent-border)"
    >
      <ServerLogo id={entry.id} icon={entry.icon} size={30} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="truncate text-[13px] font-semibold text-brand-textMain">{entry.name}</span>
          <span
            title={entry.transport === 'stdio' ? 'Local (stdio)' : 'Remote'}
            className={`h-1.5 w-1.5 shrink-0 rounded-full ${
              entry.transport === 'stdio' ? 'bg-brand-textMuted/40' : 'bg-(--brand-accent)'
            }`}
          />
          {entry.category && (
            <span className="truncate rounded-full bg-brand-bg px-1.5 py-0.5 text-[9px] font-medium text-brand-textMuted">
              {entry.category}
            </span>
          )}
        </div>
        <p className="truncate text-[11px] leading-4 text-brand-textMuted">{entry.description}</p>
      </div>
      {installable ? (
        <Button
          data-testid={`mcp-install-${entry.id}`}
          onClick={() => onRequestInstall(entry)}
          variant="secondary"
          size="sm"
          className="shrink-0"
        >
          {needsKeys ? 'Install' : '+ Install'}
        </Button>
      ) : (
        <a
          data-testid={`mcp-docs-${entry.id}`}
          href={entry.homepage}
          target="_blank"
          rel="noreferrer"
          className="ui-btn shrink-0 text-xs"
        >
          Docs
        </a>
      )}
    </div>
  );
};

/** Dashboard for managing MCP servers with add, toggle, and remove actions. */
export const MCPDashboard: React.FC<MCPDashboardProps> = ({
  servers,
  onAddServer,
  onRemoveServer,
  onToggleServer,
  onRefreshServers,
  catalog,
  onInstallCatalog
}) => {
  const [showAddForm, setShowAddForm] = useState(false);
  const [newServerName, setNewServerName] = useState('');
  const [newTransport, setNewTransport] = useState<'stdio' | 'sse'>('stdio');
  const [newCommandOrUrl, setNewCommandOrUrl] = useState('');
  const [installTarget, setInstallTarget] = useState<CatalogEntry | null>(null);

  // Catalog browsing: search + progressive "Show more" reveal so the UI stays
  // responsive even with the full (hundreds of entries) awesome-mcp catalog.
  const [catalogQuery, setCatalogQuery] = useState('');
  const [visibleCount, setVisibleCount] = useState(10);
  useEffect(() => {
    setVisibleCount(10);
  }, [catalogQuery]);

  const installedIds = useMemo(
    () => McpService.installedIds(servers),
    [servers]
  );

  const filteredCatalog = useMemo(
    () => McpService.filterCatalog(catalog ?? [], installedIds, catalogQuery),
    [catalog, installedIds, catalogQuery]
  );

  const visibleCatalog = filteredCatalog.slice(0, visibleCount);
  const hasMore = filteredCatalog.length > visibleCount;
  const installedHidden = catalog ? catalog.filter((e) => installedIds.has(e.id)).length : 0;

  const handleAdd = () => {
    if (!newServerName.trim() || !newCommandOrUrl.trim()) return;
    onAddServer(McpService.buildNewServer(newServerName, newTransport, newCommandOrUrl));
    setNewServerName('');
    setNewCommandOrUrl('');
    setShowAddForm(false);
  };

  return (
    <div
      data-testid="mcp-dashboard"
      className="h-full w-full overflow-y-auto px-4 py-5 text-brand-textMain md:px-6 md:py-6"
    >
      {/* Header */}
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-brand-textMain">
            <Server size={15} className="text-(--brand-accent)" />
            <span className="sr-only">Visual MCP Server Dashboard</span>
            Model Context Protocol
          </h2>
          <p className="mt-0.5 text-[11px] text-brand-textMuted">
            Connect servers via STDIO or SSE to give the agent live tools.
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {onRefreshServers && (
            <button
              data-testid="mcp-refresh-btn"
              onClick={onRefreshServers}
              title="Refresh"
              className="ui-btn text-xs"
            >
              <RefreshCw size={13} />
              <span className="hidden sm:inline">Refresh</span>
            </button>
          )}
          <button
            data-testid="mcp-add-btn"
            onClick={() => setShowAddForm(!showAddForm)}
            className={showAddForm ? 'ui-btn text-xs' : 'ui-btn-primary text-xs'}
          >
            <Plus size={14} />
            {showAddForm ? 'Cancel' : 'Add Server'}
          </button>
        </div>
      </div>

      {/* Add Server Inline Form */}
      {showAddForm && (
        <div
          data-testid="mcp-add-form"
          className="glass-card mb-6 flex flex-col gap-3 rounded-xl border border-(--brand-accent-border) p-4 animate-fade-in"
        >
          <h3 className="text-xs font-semibold uppercase tracking-wider text-(--brand-accent)">
            Configure New MCP Server
          </h3>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-[1fr_1fr_2fr] md:items-end">
            <Input
              data-testid="mcp-input-name"
              type="text"
              value={newServerName}
              onChange={(e) => setNewServerName(e.target.value)}
              placeholder="e.g. Memory Server"
              label="Server Name"
            />
            <Select
              options={[
                { value: 'stdio', label: 'STDIO Process', icon: <Terminal className="w-3.5 h-3.5" /> },
                { value: 'sse', label: 'HTTP SSE', icon: <Globe className="w-3.5 h-3.5" /> }
              ]}
              value={newTransport}
              onChange={(val) => setNewTransport(val as 'stdio' | 'sse')}
              label="Transport"
            />
            <Input
              data-testid="mcp-input-cmd"
              type="text"
              value={newCommandOrUrl}
              onChange={(e) => setNewCommandOrUrl(e.target.value)}
              placeholder={newTransport === 'stdio' ? 'npx -y @modelcontextprotocol/server-filesystem' : 'http://localhost:3001/sse'}
              label="Command or SSE URL"
            />
          </div>
          <div className="flex justify-end">
            <Button
              data-testid="mcp-submit-add"
              onClick={handleAdd}
              disabled={!newServerName.trim() || !newCommandOrUrl.trim()}
              variant="primary"
              size="sm"
            >
              Save & Connect
            </Button>
          </div>
        </div>
      )}

      {/* Catalog: searchable, progressively revealed, excludes installed */}
      {catalog && catalog.length > 0 && onInstallCatalog && (
        <div data-testid="mcp-popular" className="mb-7">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <Sparkles size={14} className="text-(--brand-accent)" />
            <h3 className="text-xs font-semibold uppercase tracking-wider text-brand-textMain">
              {catalogQuery.trim() ? 'Search Results' : 'Browse MCP Servers'}
            </h3>
            <span className="ui-label ml-auto">
              {filteredCatalog.length} {filteredCatalog.length === 1 ? 'server' : 'servers'}
              {installedHidden > 0 && ` · ${installedHidden} installed (hidden)`}
            </span>
          </div>

          {/* Search bar */}
          <div className="ui-input mb-4 flex items-center gap-2 border-transparent bg-brand-card">
            <Search size={14} className="shrink-0 text-brand-textMuted" />
            <input
              type="text"
              data-testid="mcp-catalog-search"
              placeholder="Search servers, descriptions, or categories…"
              value={catalogQuery}
              onChange={(e) => setCatalogQuery(e.target.value)}
              className="w-full border-none bg-transparent text-sm text-brand-textMain outline-none placeholder:text-brand-textMuted/50"
            />
            {catalogQuery && (
              <button
                type="button"
                onClick={() => setCatalogQuery('')}
                className="shrink-0 rounded px-1 text-brand-textMuted hover:text-brand-textMain"
                aria-label="Clear search"
              >
                ×
              </button>
            )}
          </div>

          {visibleCatalog.length === 0 ? (
            <div
              data-testid="mcp-catalog-empty"
              className="rounded-xl border border-dashed border-brand-border bg-brand-card px-6 py-8 text-center text-xs text-brand-textMuted"
            >
              {catalogQuery.trim()
                ? `No MCP servers match “${catalogQuery}”.`
                : 'All listed servers are already installed.'}
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-2.5 lg:grid-cols-2">
              {visibleCatalog.map((entry) => (
                <CatalogCard key={entry.id} entry={entry} onRequestInstall={setInstallTarget} />
              ))}
            </div>
          )}

          {hasMore && (
            <div className="mt-4 flex justify-center">
              <button
                type="button"
                data-testid="mcp-catalog-show-more"
                onClick={() => setVisibleCount((c) => c + 60)}
                className="ui-btn text-xs"
              >
                Show more ({filteredCatalog.length - visibleCount} more)
              </button>
            </div>
          )}
        </div>
      )}

      {/* Connected Servers */}
      <div className="mb-3 flex items-center gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-brand-textMain">Connected Servers</h3>
        {servers.length > 0 && <span className="ui-label ml-auto">{servers.length} configured</span>}
      </div>
      {servers.length === 0 ? (
        <div
          data-testid="mcp-empty-state"
          className="rounded-xl border border-dashed border-brand-border bg-brand-card px-6 py-10 text-center text-xs text-brand-textMuted"
        >
          No MCP servers registered yet. Install a popular server above or click "Add Server".
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-2.5 lg:grid-cols-2">
          {servers.map((srv) => (
            <div
              key={srv.id}
              data-testid={`mcp-card-${srv.id}`}
              className={`flex flex-col gap-2.5 rounded-xl border bg-brand-card p-3 transition-all duration-200 ${
                srv.enabled ? 'border-brand-border/60 opacity-100' : 'border-brand-border/30 opacity-60'
              } hover:border-(--brand-accent-border)`}
            >
              <div className="flex items-center gap-3">
                <div className="relative shrink-0">
                  <ServerLogo id={srv.id.replace(/^mcp-catalog-/, '')} size={30} />
                  <span
                    className={`absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-brand-card ${getStatusDotClass(srv.status)}`}
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-[13px] font-semibold text-brand-textMain">{srv.name}</span>
                    <span
                      data-testid={`mcp-status-badge-${srv.id}`}
                      className={`shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider ${getStatusBadgeClass(srv.status)}`}
                    >
                      {getStatusLabel(srv.status)}
                    </span>
                  </div>
                  <div className="truncate font-mono text-[10px] leading-4 text-brand-textMuted">
                    <span className="font-bold text-(--brand-accent)">[{srv.transport.toUpperCase()}]</span>{' '}
                    {srv.commandOrUrl}
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between border-t border-brand-border/40 pt-2 text-[11px] text-brand-textMuted">
                <span>
                  🛠 Tools Exposed: <strong className="text-brand-textMain">{srv.toolsCount}</strong>
                  {srv.latencyMs !== undefined && <span className="ml-2">⚡ {srv.latencyMs}ms</span>}
                </span>
                <div className="flex items-center gap-2">
                  <Toggle
                    data-testid={`mcp-toggle-${srv.id}`}
                    checked={srv.enabled}
                    onChange={(checked) => onToggleServer(srv.id, checked)}
                    label={srv.enabled ? 'On' : 'Off'}
                  />
                  <button
                    data-testid={`mcp-delete-${srv.id}`}
                    onClick={() => onRemoveServer(srv.id)}
                    title="Remove server"
                    className="rounded-md p-1 text-brand-textMuted transition-colors hover:bg-red-500/10 hover:text-red-400"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <McpInstallModal
        isOpen={installTarget !== null}
        entry={installTarget}
        onClose={() => setInstallTarget(null)}
        onInstall={async (entry, keys) => {
          await onInstallCatalog?.(entry, keys);
        }}
      />
    </div>
  );
};
