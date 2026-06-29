import {
  StreamableHTTPClientTransport,
  StreamableHTTPClientTransportOptions
} from '@modelcontextprotocol/sdk/client/streamableHttp.js';

export interface MCPHTTPOptions {
  url: string | URL;
  bearerToken?: string;
  headers?: Record<string, string>;
  sessionId?: string;
  requestInit?: RequestInit;
  reconnectionOptions?: StreamableHTTPClientTransportOptions['reconnectionOptions'];
}

export class MCPHTTPTransport extends StreamableHTTPClientTransport {
  constructor(options: MCPHTTPOptions) {
    const targetUrl = typeof options.url === 'string' ? new URL(options.url) : options.url;
    const combinedHeaders: Record<string, string> = { ...options.headers };
    if (options.bearerToken) {
      combinedHeaders['Authorization'] = `Bearer ${options.bearerToken}`;
    }

    const requestHeaders = {
      ...combinedHeaders,
      ...(options.requestInit?.headers as Record<string, string> || {})
    };

    const opts: StreamableHTTPClientTransportOptions = {
      sessionId: options.sessionId,
      reconnectionOptions: options.reconnectionOptions,
      requestInit: {
        ...options.requestInit,
        headers: requestHeaders
      }
    };

    super(targetUrl, opts);
  }
}

export function createHTTPTransport(options: MCPHTTPOptions): MCPHTTPTransport {
  return new MCPHTTPTransport(options);
}
