import {
  MCPClient,
  createStdioTransport,
  createSSETransport,
  createHTTPTransport,
} from '@superagent/core';
import { ToolDefinition as AgentToolDefinition } from './ai-engine';

/** Minimal spec for connecting an MCP server from the renderer. */
export interface MCPServerSpec {
  id: string;
  name: string;
  transport: 'stdio' | 'sse' | 'http';
  commandOrUrl: string;
}

interface ConnectedServer {
  id: string;
  name: string;
  client: MCPClient;
  tools: AgentToolDefinition[];
}

/** Active MCP connections, keyed by server id. */
const servers = new Map<string, ConnectedServer>();

/** Builds an MCP transport from a server spec. */
function buildTransport(spec: MCPServerSpec) {
  if (spec.transport === 'stdio') {
    const [command, ...args] = spec.commandOrUrl.split(/\s+/);
    return createStdioTransport({ command, args });
  }
  if (spec.transport === 'sse') {
    return createSSETransport({ url: spec.commandOrUrl });
  }
  return createHTTPTransport({ url: spec.commandOrUrl });
}

/**
 * Connects to an MCP server, discovers its tools, and registers them as
 * agent tools (namespaced as `<serverName>_<toolName>`). Returns the tool list.
 */
export async function connectServer(
  spec: MCPServerSpec
): Promise<{ id: string; name: string; tools: { name: string; description?: string }[] }> {
  const client = new MCPClient({ name: 'superagent-desktop', version: '0.1.0' });
  await client.connect(buildTransport(spec));

  const response = await client.listTools();
  const mcpTools: any[] = (response as any)?.tools || [];

  const tools: AgentToolDefinition[] = mcpTools.map((t: any) => ({
    name: `${spec.name}_${t.name}`,
    description: t.description || `MCP tool ${t.name} from ${spec.name}`,
    parameters: (t.inputSchema as Record<string, any>) || { type: 'object', properties: {} },
    execute: async (args: Record<string, any>) => {
      const res = await client.callTool(t.name, args);
      return typeof res === 'string' ? res : JSON.stringify(res, null, 2);
    }
  }));

  servers.set(spec.id, { id: spec.id, name: spec.name, client, tools });
  return {
    id: spec.id,
    name: spec.name,
    tools: mcpTools.map((t: any) => ({ name: t.name, description: t.description }))
  };
}

/** Disconnects and forgets a server. */
export async function disconnectServer(id: string): Promise<void> {
  const s = servers.get(id);
  if (s) {
    try {
      await s.client.close();
    } catch {
      // ignore close errors
    }
    servers.delete(id);
  }
}

/** Snapshot of connected servers and their tools (for the renderer UI). */
export function listServers() {
  return Array.from(servers.values()).map((s) => ({
    id: s.id,
    name: s.name,
    tools: s.tools.map((t) => ({ name: t.name, description: t.description }))
  }));
}

/** Calls a tool on a connected server. */
export async function callTool(id: string, tool: string, args: Record<string, any> = {}): Promise<string> {
  const s = servers.get(id);
  if (!s) throw new Error(`MCP server not connected: ${id}`);
  const res = await s.client.callTool(tool, args);
  return typeof res === 'string' ? res : JSON.stringify(res, null, 2);
}

/** All tools from every connected server, ready to inject into the agent. */
export function connectedTools(): AgentToolDefinition[] {
  const out: AgentToolDefinition[] = [];
  for (const s of servers.values()) out.push(...s.tools);
  return out;
}
