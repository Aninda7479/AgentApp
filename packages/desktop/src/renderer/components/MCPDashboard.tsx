import React, { useState } from 'react';
import { Button, Input, Select, Toggle } from './ui';
import { Terminal, Globe } from 'lucide-react';

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

/** Props for the MCPDashboard component. */
export interface MCPDashboardProps {
  servers: MCPServerInfo[];
  onAddServer: (server: Partial<MCPServerInfo>) => void;
  onRemoveServer: (id: string) => void;
  onToggleServer: (id: string, enabled: boolean) => void;
  onRefreshServers?: () => void;
}

const getStatusBadgeClass = (status: MCPServerInfo['status']) => {
  switch (status) {
    case 'connected':
      return 'bg-emerald-950/80 text-emerald-400 border border-emerald-800/40';
    case 'connecting':
      return 'bg-amber-950/80 text-amber-400 border border-amber-800/40';
    case 'error':
      return 'bg-red-950/80 text-red-400 border border-red-800/40';
    default:
      return 'bg-brand-border/30 text-brand-textMuted border border-brand-border/40';
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

/** Dashboard for managing MCP servers with add, toggle, and remove actions. */
export const MCPDashboard: React.FC<MCPDashboardProps> = ({
  servers,
  onAddServer,
  onRemoveServer,
  onToggleServer,
  onRefreshServers
}) => {
  const [showAddForm, setShowAddForm] = useState(false);
  const [newServerName, setNewServerName] = useState('');
  const [newTransport, setNewTransport] = useState<'stdio' | 'sse'>('stdio');
  const [newCommandOrUrl, setNewCommandOrUrl] = useState('');

  const handleAdd = () => {
    if (!newServerName.trim() || !newCommandOrUrl.trim()) return;
    onAddServer({
      name: newServerName,
      transport: newTransport,
      commandOrUrl: newCommandOrUrl,
      status: 'connecting',
      enabled: true,
      toolsCount: 0
    });
    setNewServerName('');
    setNewCommandOrUrl('');
    setShowAddForm(false);
  };

  return (
    <div
      data-testid="mcp-dashboard"
      className="flex-1 px-4 md:px-8 py-6 bg-brand-bg text-brand-textMain overflow-y-auto"
    >
      {/* Dashboard Header */}
      <div className="flex flex-wrap items-start justify-between gap-3 mb-6 border-b border-brand-border pb-4">
        <div>
          <h1 className="text-xl md:text-2xl font-bold m-0 flex items-center gap-2.5 text-white">
            🔌 Visual MCP Server Dashboard
          </h1>
          <p className="text-xs md:text-sm text-brand-textMuted mt-1">
            Manage Model Context Protocol servers connected via STDIO or SSE
          </p>
        </div>

        <div className="flex flex-wrap gap-3">
          {onRefreshServers && (
            <Button
              data-testid="mcp-refresh-btn"
              onClick={onRefreshServers}
              variant="secondary"
              size="sm"
            >
              🔄 Refresh
            </Button>
          )}
          <Button
            data-testid="mcp-add-btn"
            onClick={() => setShowAddForm(!showAddForm)}
            variant={showAddForm ? 'secondary' : 'primary'}
            size="sm"
          >
            {showAddForm ? 'Cancel' : '+ Add MCP Server'}
          </Button>
        </div>
      </div>

      {/* Add Server Inline Form */}
      {showAddForm && (
        <div
          data-testid="mcp-add-form"
          className="bg-brand-card border border-blue-500 rounded-2xl p-5 mb-6 flex flex-col gap-3.5 shadow-lg"
        >
          <h3 className="text-base font-bold text-blue-400 m-0">Configure New MCP Server</h3>
          <div className="grid grid-cols-1 md:grid-cols-[1fr_1fr_2fr] gap-3 items-end">
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

      {/* Servers Grid */}
      {servers.length === 0 ? (
        <div
          data-testid="mcp-empty-state"
          className="text-center text-brand-textMuted py-16 bg-brand-card rounded-2xl border border-dashed border-brand-border"
        >
          No MCP servers registered yet. Click "+ Add MCP Server" above to register one!
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {servers.map((srv) => (
            <div
              key={srv.id}
              data-testid={`mcp-card-${srv.id}`}
              className={`bg-brand-card border ${srv.enabled ? 'border-brand-border' : 'border-brand-border/30'} rounded-2xl p-5 flex flex-col gap-3.5 ${srv.enabled ? 'opacity-100' : 'opacity-60'} shadow-[0_4px_12px_rgba(0,0,0,0.3)] hover:border-[var(--brand-highlight)]/20 transition-all duration-200`}
            >
              <div className="flex items-center justify-between">
                <div className="font-bold text-base text-white">{srv.name}</div>
                <span
                  data-testid={`mcp-status-badge-${srv.id}`}
                  className={`text-[10px] px-2.5 py-0.5 rounded-full font-bold uppercase tracking-wider ${getStatusBadgeClass(srv.status)}`}
                >
                  {getStatusLabel(srv.status)}
                </span>
              </div>

              <div className="bg-brand-bg/80 border border-brand-border/40 p-2.5 rounded-lg font-mono text-xs text-brand-textMuted overflow-x-auto whitespace-nowrap">
                <span className="text-[var(--brand-highlight)] font-bold mr-1.5">
                  [{srv.transport.toUpperCase()}]
                </span>
                {srv.commandOrUrl}
              </div>

              <div className="flex items-center justify-between text-xs text-brand-textMuted">
                <span>🛠 Tools Exposed: <strong className="text-white">{srv.toolsCount}</strong></span>
                {srv.latencyMs !== undefined && <span>⚡ {srv.latencyMs}ms</span>}
              </div>

              <div className="flex items-center justify-between border-t border-brand-border/40 pt-3 mt-1">
                <Toggle
                  data-testid={`mcp-toggle-${srv.id}`}
                  checked={srv.enabled}
                  onChange={(checked) => onToggleServer(srv.id, checked)}
                  label={srv.enabled ? 'Enabled' : 'Disabled'}
                />

                <Button
                  data-testid={`mcp-delete-${srv.id}`}
                  onClick={() => onRemoveServer(srv.id)}
                  variant="ghost"
                  size="sm"
                  className="text-red-400 hover:text-red-300 hover:bg-red-500/10"
                >
                  Remove 🗑
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
