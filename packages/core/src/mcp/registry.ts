import { ToolDefinition, BYOKConfig } from '../types/agent.js';
import { MCPClient } from './client.js';
import { MCPPermissionGuard, MCPToolContext } from './guard.js';

export interface MCPRegistryOptions {
  guard?: MCPPermissionGuard;
  prefixToolName?: boolean;
}

export class MCPToolRegistry {
  private servers: Map<string, MCPClient> = new Map();
  private tools: Map<string, ToolDefinition> = new Map();
  private guard?: MCPPermissionGuard;
  private prefixToolName: boolean;

  constructor(options: MCPRegistryOptions = {}) {
    this.guard = options.guard;
    this.prefixToolName = options.prefixToolName ?? true;
  }

  public setGuard(guard: MCPPermissionGuard): void {
    this.guard = guard;
  }

  public registerServer(serverName: string, client: MCPClient): void {
    this.servers.set(serverName, client);
  }

  public unregisterServer(serverName: string): void {
    this.servers.delete(serverName);
    for (const [toolName] of Array.from(this.tools.entries())) {
      if (toolName.startsWith(`${serverName}_`)) {
        this.tools.delete(toolName);
      }
    }
  }

  public getServer(serverName: string): MCPClient | undefined {
    return this.servers.get(serverName);
  }

  public async discoverTools(serverName?: string): Promise<ToolDefinition[]> {
    const discovered: ToolDefinition[] = [];

    const targetServers = serverName 
      ? Array.from(this.servers.entries()).filter(([sName]) => sName === serverName)
      : Array.from(this.servers.entries());

    for (const [sName, client] of targetServers) {
      if (!client.isConnected()) {
        continue;
      }

      const response = await client.listTools();
      const mcpTools = response.tools || [];

      for (const mcpTool of mcpTools) {
        const registeredName = this.prefixToolName ? `${sName}_${mcpTool.name}` : mcpTool.name;
        
        const toolDef: ToolDefinition = {
          name: registeredName,
          description: mcpTool.description || `MCP tool ${mcpTool.name} from ${sName}`,
          parameters: (mcpTool.inputSchema as Record<string, any>) || { type: 'object', properties: {} },
          execute: async (args: Record<string, any>, _config: BYOKConfig) => {
            if (this.guard) {
              const toolContext: MCPToolContext = {
                serverName: sName,
                toolName: mcpTool.name,
                args,
                description: mcpTool.description,
                annotations: mcpTool.annotations
              };
              const allowed = await this.guard.verifyPermission(toolContext);
              if (!allowed) {
                throw new Error(`Execution of MCP tool '${registeredName}' denied by permission guard.`);
              }
            }

            return await client.callTool(mcpTool.name, args);
          }
        };

        this.tools.set(registeredName, toolDef);
        discovered.push(toolDef);
      }
    }

    return discovered;
  }

  public getRegisteredTools(): ToolDefinition[] {
    return Array.from(this.tools.values());
  }

  public getTool(name: string): ToolDefinition | undefined {
    return this.tools.get(name);
  }
}
