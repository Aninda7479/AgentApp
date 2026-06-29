import { AgentMessage } from '../types/agent.js';
import { MCPClient } from './client.js';

export class MCPResourceManager {
  private clients: Map<string, MCPClient> = new Map();

  public registerClient(serverName: string, client: MCPClient): void {
    this.clients.set(serverName, client);
  }

  public unregisterClient(serverName: string): void {
    this.clients.delete(serverName);
  }

  public async listResources(serverName: string) {
    const client = this.clients.get(serverName);
    if (!client) {
      throw new Error(`MCP server '${serverName}' not found.`);
    }
    return await client.listResources();
  }

  public async readResource(serverName: string, uri: string) {
    const client = this.clients.get(serverName);
    if (!client) {
      throw new Error(`MCP server '${serverName}' not found.`);
    }
    return await client.readResource(uri);
  }

  public async listPrompts(serverName: string) {
    const client = this.clients.get(serverName);
    if (!client) {
      throw new Error(`MCP server '${serverName}' not found.`);
    }
    return await client.listPrompts();
  }

  public async getPrompt(serverName: string, promptName: string, args?: Record<string, string>) {
    const client = this.clients.get(serverName);
    if (!client) {
      throw new Error(`MCP server '${serverName}' not found.`);
    }
    return await client.getPrompt(promptName, args);
  }

  public async injectPromptTemplate(
    serverName: string,
    promptName: string,
    args?: Record<string, string>
  ): Promise<AgentMessage[]> {
    const promptData = await this.getPrompt(serverName, promptName, args);
    const messages: AgentMessage[] = [];
    const timestamp = Date.now();

    if (promptData.messages) {
      promptData.messages.forEach((msg, idx) => {
        let contentStr = '';
        if (typeof msg.content === 'string') {
          contentStr = msg.content;
        } else if (msg.content && typeof msg.content === 'object') {
          const c = msg.content as any;
          if (c.type === 'text' && c.text) {
            contentStr = c.text;
          } else {
            contentStr = JSON.stringify(c);
          }
        }

        messages.push({
          id: `mcp_prompt_${serverName}_${promptName}_${timestamp}_${idx}`,
          role: msg.role === 'assistant' ? 'assistant' : 'user',
          content: contentStr,
          timestamp
        });
      });
    }

    return messages;
  }
}
