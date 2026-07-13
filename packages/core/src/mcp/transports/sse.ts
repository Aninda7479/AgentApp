import { SSEClientTransport, SSEClientTransportOptions } from '@modelcontextprotocol/sdk/client/sse.js';

/** Options to configure an SSE-based MCP transport. */
export interface MCPSSEOptions {
  url: string | URL;
  bearerToken?: string;
  headers?: Record<string, string>;
  requestInit?: RequestInit;
  eventSourceInit?: Record<string, any>;
}

/** MCP transport over Server-Sent Events for remote HTTP servers. */
export class MCPSSETransport extends SSEClientTransport {
  constructor(options: MCPSSEOptions) {
    const targetUrl = typeof options.url === 'string' ? new URL(options.url) : options.url;
    const combinedHeaders: Record<string, string> = { ...options.headers };
    if (options.bearerToken) {
      combinedHeaders['Authorization'] = `Bearer ${options.bearerToken}`;
    }

    const requestHeaders = {
      ...combinedHeaders,
      ...(options.requestInit?.headers as Record<string, string> || {})
    };

    const eventSourceHeaders = {
      ...combinedHeaders,
      ...(options.eventSourceInit?.headers as Record<string, string> || {})
    };

    const opts: SSEClientTransportOptions = {
      requestInit: {
        ...options.requestInit,
        headers: requestHeaders
      },
      eventSourceInit: {
        ...options.eventSourceInit,
        headers: eventSourceHeaders
      } as any
    };

    super(targetUrl, opts);
  }
}

/** Creates an SSE transport from options. */
export function createSSETransport(options: MCPSSEOptions): MCPSSETransport {
  return new MCPSSETransport(options);
}
