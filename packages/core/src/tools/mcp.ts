import { ToolDefinition, BYOKConfig } from '../types/agent.js';

/** Manages registered MCP server connections. */
export class MCPClientManager {
  private servers: Map<string, string> = new Map();

  /** Registers a new MCP server by name and command. */
  public addServer(name: string, command: string): void {
    this.servers.set(name, command);
  }

  /** Lists all registered MCP servers. */
  public listServers(): Array<{ name: string; command: string }> {
    return Array.from(this.servers.entries()).map(([name, command]) => ({ name, command }));
  }
}

/** Creates the MCP management tool for agent use. */
export const createMCPTool = (mcpManager: MCPClientManager): ToolDefinition => ({
  name: 'mcp_manager',
  description: 'Manage connected Model Context Protocol (MCP) servers and tools.',
  parameters: {
    type: 'object',
    properties: {
      action: { type: 'string', enum: ['list', 'add'] },
      name: { type: 'string' },
      command: { type: 'string' }
    },
    required: ['action']
  },
  execute: async (args: Record<string, any>, _config: BYOKConfig) => {
    if (args.action === 'list') {
      return { servers: mcpManager.listServers() };
    } else if (args.action === 'add') {
      if (!args.name || !args.command) {
        throw new Error('Name and command are required to add an MCP server.');
      }
      mcpManager.addServer(args.name, args.command);
      return { status: 'success', message: `Added MCP server '${args.name}'` };
    }
  }
});
