import { Client, ClientOptions } from '@modelcontextprotocol/sdk/client/index.js';
import { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';

export interface MCPClientConfig {
  name: string;
  version: string;
  capabilities?: ClientOptions['capabilities'];
}

export class MCPClient {
  private sdkClient: Client;
  private connected: boolean = false;

  constructor(config: MCPClientConfig, options?: ClientOptions) {
    this.sdkClient = new Client(
      { name: config.name, version: config.version },
      { capabilities: config.capabilities, ...options }
    );
  }

  public get rawClient(): Client {
    return this.sdkClient;
  }

  public isConnected(): boolean {
    return this.connected;
  }

  public async connect(transport: Transport): Promise<void> {
    await this.sdkClient.connect(transport);
    this.connected = true;
  }

  public async close(): Promise<void> {
    if (this.connected) {
      await this.sdkClient.close();
      this.connected = false;
    }
  }

  public async listTools() {
    return await this.sdkClient.listTools();
  }

  public async callTool(name: string, args: Record<string, any> = {}) {
    return await this.sdkClient.callTool({ name, arguments: args });
  }

  public async listResources() {
    return await this.sdkClient.listResources();
  }

  public async readResource(uri: string) {
    return await this.sdkClient.readResource({ uri });
  }

  public async listPrompts() {
    return await this.sdkClient.listPrompts();
  }

  public async getPrompt(name: string, args?: Record<string, string>) {
    return await this.sdkClient.getPrompt({ name, arguments: args });
  }

  public getServerCapabilities() {
    return this.sdkClient.getServerCapabilities();
  }

  public getServerVersion() {
    return this.sdkClient.getServerVersion();
  }
}
