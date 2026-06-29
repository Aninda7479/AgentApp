import { StdioClientTransport, StdioServerParameters } from '@modelcontextprotocol/sdk/client/stdio.js';

export interface MCPStdioOptions {
  command: string;
  args?: string[];
  env?: Record<string, string>;
  cwd?: string;
  stderr?: StdioServerParameters['stderr'];
}

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

export function createStdioTransport(options: MCPStdioOptions): MCPStdioTransport {
  return new MCPStdioTransport(options);
}
