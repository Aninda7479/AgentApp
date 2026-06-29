import React, { useState } from 'react';

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

export interface MCPDashboardProps {
  servers: MCPServerInfo[];
  onAddServer: (server: Partial<MCPServerInfo>) => void;
  onRemoveServer: (id: string) => void;
  onToggleServer: (id: string, enabled: boolean) => void;
  onRefreshServers?: () => void;
}

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

  const getStatusBadge = (status: MCPServerInfo['status']) => {
    switch (status) {
      case 'connected':
        return { color: '#10b981', bg: '#064e3b', label: 'Connected' };
      case 'connecting':
        return { color: '#f59e0b', bg: '#78350f', label: 'Connecting' };
      case 'error':
        return { color: '#ef4444', bg: '#7f1d1d', label: 'Error' };
      default:
        return { color: '#a1a1aa', bg: '#27272a', label: 'Disconnected' };
    }
  };

  return (
    <div
      data-testid="mcp-dashboard"
      style={{
        flex: 1,
        padding: '24px 32px',
        backgroundColor: '#09090b',
        color: '#f4f4f5',
        overflowY: 'auto'
      }}
    >
      {/* Dashboard Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '24px',
          borderBottom: '1px solid #27272a',
          paddingBottom: '16px'
        }}
      >
        <div>
          <h1 style={{ fontSize: '1.4rem', fontWeight: 700, margin: 0, display: 'flex', alignItems: 'center', gap: '10px' }}>
            🔌 Visual MCP Server Dashboard
          </h1>
          <p style={{ fontSize: '0.85rem', color: '#a1a1aa', margin: '4px 0 0 0' }}>
            Manage Model Context Protocol servers connected via STDIO or SSE
          </p>
        </div>

        <div style={{ display: 'flex', gap: '12px' }}>
          {onRefreshServers && (
            <button
              data-testid="mcp-refresh-btn"
              onClick={onRefreshServers}
              style={{
                backgroundColor: '#1a1a1e',
                border: '1px solid #3f3f46',
                color: '#e4e4e7',
                padding: '8px 14px',
                borderRadius: '8px',
                cursor: 'pointer',
                fontSize: '0.85rem'
              }}
            >
              🔄 Refresh
            </button>
          )}
          <button
            data-testid="mcp-add-btn"
            onClick={() => setShowAddForm(!showAddForm)}
            style={{
              background: 'linear-gradient(135deg, #8b5cf6, #3b82f6)',
              border: 'none',
              color: '#ffffff',
              padding: '8px 16px',
              borderRadius: '8px',
              fontWeight: 600,
              cursor: 'pointer',
              fontSize: '0.85rem'
            }}
          >
            {showAddForm ? 'Cancel' : '+ Add MCP Server'}
          </button>
        </div>
      </div>

      {/* Add Server Inline Form */}
      {showAddForm && (
        <div
          data-testid="mcp-add-form"
          style={{
            backgroundColor: '#121215',
            border: '1px solid #3b82f6',
            borderRadius: '12px',
            padding: '20px',
            marginBottom: '24px',
            display: 'flex',
            flexDirection: 'column',
            gap: '14px'
          }}
        >
          <h3 style={{ fontSize: '1rem', margin: 0, color: '#3b82f6' }}>Configure New MCP Server</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 2fr', gap: '12px' }}>
            <div>
              <label style={{ fontSize: '0.8rem', color: '#a1a1aa', display: 'block', marginBottom: '4px' }}>Server Name</label>
              <input
                data-testid="mcp-input-name"
                type="text"
                value={newServerName}
                onChange={(e) => setNewServerName(e.target.value)}
                placeholder="e.g. Memory Server"
                style={{
                  width: '100%',
                  backgroundColor: '#09090b',
                  border: '1px solid #3f3f46',
                  borderRadius: '6px',
                  padding: '8px',
                  color: '#fff',
                  fontSize: '0.85rem'
                }}
              />
            </div>
            <div>
              <label style={{ fontSize: '0.8rem', color: '#a1a1aa', display: 'block', marginBottom: '4px' }}>Transport</label>
              <select
                data-testid="mcp-select-transport"
                value={newTransport}
                onChange={(e) => setNewTransport(e.target.value as 'stdio' | 'sse')}
                style={{
                  width: '100%',
                  backgroundColor: '#09090b',
                  border: '1px solid #3f3f46',
                  borderRadius: '6px',
                  padding: '8px',
                  color: '#fff',
                  fontSize: '0.85rem'
                }}
              >
                <option value="stdio">STDIO Process</option>
                <option value="sse">HTTP SSE</option>
              </select>
            </div>
            <div>
              <label style={{ fontSize: '0.8rem', color: '#a1a1aa', display: 'block', marginBottom: '4px' }}>Command or SSE URL</label>
              <input
                data-testid="mcp-input-cmd"
                type="text"
                value={newCommandOrUrl}
                onChange={(e) => setNewCommandOrUrl(e.target.value)}
                placeholder={newTransport === 'stdio' ? 'npx -y @modelcontextprotocol/server-filesystem' : 'http://localhost:3001/sse'}
                style={{
                  width: '100%',
                  backgroundColor: '#09090b',
                  border: '1px solid #3f3f46',
                  borderRadius: '6px',
                  padding: '8px',
                  color: '#fff',
                  fontSize: '0.85rem'
                }}
              />
            </div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button
              data-testid="mcp-submit-add"
              onClick={handleAdd}
              disabled={!newServerName.trim() || !newCommandOrUrl.trim()}
              style={{
                backgroundColor: '#3b82f6',
                border: 'none',
                color: '#fff',
                padding: '6px 16px',
                borderRadius: '6px',
                fontWeight: 600,
                cursor: 'pointer'
              }}
            >
              Save & Connect
            </button>
          </div>
        </div>
      )}

      {/* Servers Grid */}
      {servers.length === 0 ? (
        <div
          data-testid="mcp-empty-state"
          style={{
            textAlign: 'center',
            color: '#a1a1aa',
            padding: '60px 0',
            backgroundColor: '#121215',
            borderRadius: '12px',
            border: '1px dashed #27272a'
          }}
        >
          No MCP servers registered yet. Click "+ Add MCP Server" above to register one!
        </div>
      ) : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
            gap: '20px'
          }}
        >
          {servers.map((srv) => {
            const statusInfo = getStatusBadge(srv.status);
            return (
              <div
                key={srv.id}
                data-testid={`mcp-card-${srv.id}`}
                style={{
                  backgroundColor: '#121215',
                  border: `1px solid ${srv.enabled ? '#27272a' : '#1f1f23'}`,
                  borderRadius: '12px',
                  padding: '20px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '14px',
                  opacity: srv.enabled ? 1 : 0.6,
                  boxShadow: '0 4px 12px rgba(0,0,0,0.3)'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ fontWeight: 700, fontSize: '1rem', color: '#ffffff' }}>{srv.name}</div>
                  <span
                    data-testid={`mcp-status-badge-${srv.id}`}
                    style={{
                      fontSize: '0.75rem',
                      padding: '2px 10px',
                      borderRadius: '12px',
                      backgroundColor: statusInfo.bg,
                      color: statusInfo.color,
                      fontWeight: 600
                    }}
                  >
                    {statusInfo.label}
                  </span>
                </div>

                <div
                  style={{
                    backgroundColor: '#09090b',
                    padding: '8px 10px',
                    borderRadius: '6px',
                    fontFamily: 'monospace',
                    fontSize: '0.8rem',
                    color: '#a1a1aa',
                    overflowX: 'auto',
                    whiteSpace: 'nowrap'
                  }}
                >
                  <span style={{ color: '#8b5cf6', fontWeight: 600, marginRight: '6px' }}>
                    [{srv.transport.toUpperCase()}]
                  </span>
                  {srv.commandOrUrl}
                </div>

                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    fontSize: '0.85rem',
                    color: '#a1a1aa'
                  }}
                >
                  <span>🛠 Tools Exposed: <strong style={{ color: '#fff' }}>{srv.toolsCount}</strong></span>
                  {srv.latencyMs !== undefined && <span>⚡ {srv.latencyMs}ms</span>}
                </div>

                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    borderTop: '1px solid #1f1f23',
                    paddingTop: '12px',
                    marginTop: '4px'
                  }}
                >
                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '0.85rem' }}>
                    <input
                      data-testid={`mcp-toggle-${srv.id}`}
                      type="checkbox"
                      checked={srv.enabled}
                      onChange={(e) => onToggleServer(srv.id, e.target.checked)}
                    />
                    <span>{srv.enabled ? 'Enabled' : 'Disabled'}</span>
                  </label>

                  <button
                    data-testid={`mcp-delete-${srv.id}`}
                    onClick={() => onRemoveServer(srv.id)}
                    style={{
                      backgroundColor: 'transparent',
                      border: 'none',
                      color: '#ef4444',
                      cursor: 'pointer',
                      fontSize: '0.85rem'
                    }}
                  >
                    Remove 🗑
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
