import { StdioClientTransport, StdioServerParameters } from '@modelcontextprotocol/sdk/client/stdio.js';

/** Options to configure a stdio-based MCP transport. */
export interface MCPStdioOptions {
  command: string;
  args?: string[];
  env?: Record<string, string>;
  cwd?: string;
  stderr?: StdioServerParameters['stderr'];
}

/** MCP transport over stdio (launch a subprocess and communicate via stdin/stdout). */
export class MCPStdioTransport extends StdioClientTransport {
  constructor(options: MCPStdioOptions) {
    super({
      command: options.command,
      args: options.args,
      env: options.env,
      cwd: options.cwd,
      stderr: options.stderr
    });
  }
}

/** Creates a stdio transport from options. */
export function createStdioTransport(options: MCPStdioOptions): MCPStdioTransport {
  return new MCPStdioTransport(options);
}
