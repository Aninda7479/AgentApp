import { Client, ClientOptions } from '@modelcontextprotocol/sdk/client/index.js';
import { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';

/** Configuration for initializing an MCP client. */
export interface MCPClientConfig {
  name: string;
  version: string;
  capabilities?: ClientOptions['capabilities'];
}

/** Wraps the MCP SDK Client with convenience methods for tool/resource/prompt access. */
export class MCPClient {
  private sdkClient: Client;
  private connected: boolean = false;

  constructor(config: MCPClientConfig, options?: ClientOptions) {
    this.sdkClient = new Client(
      { name: config.name, version: config.version },
      { capabilities: config.capabilities, ...options }
    );
  }

  /** Exposes the underlying MCP SDK Client. */
  public get rawClient(): Client {
    return this.sdkClient;
  }

  /** Returns whether the transport connection is established. */
  public isConnected(): boolean {
    return this.connected;
  }

  /** Connects the client to an MCP server via the given transport. */
  public async connect(transport: Transport): Promise<void> {
    await this.sdkClient.connect(transport);
    this.connected = true;
  }

  /** Disconnects from the MCP server. */
  public async close(): Promise<void> {
    if (this.connected) {
      await this.sdkClient.close();
      this.connected = false;
    }
  }

  /** Lists available tools on the MCP server. */
  public async listTools() {
    return await this.sdkClient.listTools();
  }

  /** Calls a tool on the MCP server by name. */
  public async callTool(name: string, args: Record<string, any> = {}) {
    return await this.sdkClient.callTool({ name, arguments: args });
  }

  /** Lists available resources on the MCP server. */
  public async listResources() {
    return await this.sdkClient.listResources();
  }

  /** Reads a resource by URI from the MCP server. */
  public async readResource(uri: string) {
    return await this.sdkClient.readResource({ uri });
  }

  /** Lists available prompts on the MCP server. */
  public async listPrompts() {
    return await this.sdkClient.listPrompts();
  }

  /** Gets a specific prompt template by name. */
  public async getPrompt(name: string, args?: Record<string, string>) {
    return await this.sdkClient.getPrompt({ name, arguments: args });
  }

  /** Returns the capabilities advertised by the MCP server. */
  public getServerCapabilities() {
    return this.sdkClient.getServerCapabilities();
  }

  /** Returns the server version info if available. */
  public getServerVersion() {
    return this.sdkClient.getServerVersion();
  }
}
