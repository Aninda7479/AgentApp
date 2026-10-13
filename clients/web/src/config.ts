/**
 * SuperAgent Web Client Configuration.
 * Connects to SuperAgent Core v2 via standard HTTP (port 1469) and WebSocket (/api/ws).
 */

export interface ClientConfig {
  httpBaseUrl: string;
  wsBaseUrl: string;
  sessionToken?: string;
  defaultSessionId: string;
}

const STORAGE_HTTP_KEY = 'superagent_web_http_url';
const STORAGE_WS_KEY = 'superagent_web_ws_url';
const STORAGE_TOKEN_KEY = 'superagent_web_token';
const STORAGE_SESSION_KEY = 'superagent_web_session_id';

export function getDefaultConfig(): ClientConfig {
  const isBrowser = typeof window !== 'undefined';
  const defaultPort = 1469;

  let httpBaseUrl = `http://localhost:${defaultPort}`;
  let wsBaseUrl = `ws://localhost:${defaultPort}/api/ws`;

  if (isBrowser && window.location) {
    const { protocol, host, port } = window.location;
    if (protocol === 'http:' || protocol === 'https:') {
      // In production deployment hosted by the daemon itself
      if (port === String(defaultPort) || port === '' || port === '80' || port === '443') {
        httpBaseUrl = `${protocol}//${host}`;
        const wsProto = protocol === 'https:' ? 'wss:' : 'ws:';
        wsBaseUrl = `${wsProto}//${host}/api/ws`;
      }
    }

    const storedHttp = localStorage.getItem(STORAGE_HTTP_KEY);
    const storedWs = localStorage.getItem(STORAGE_WS_KEY);
    if (storedHttp) httpBaseUrl = storedHttp;
    if (storedWs) wsBaseUrl = storedWs;
  }

  const storedToken = isBrowser ? localStorage.getItem(STORAGE_TOKEN_KEY) ?? undefined : undefined;
  const storedSessionId = isBrowser ? localStorage.getItem(STORAGE_SESSION_KEY) ?? 'web-session' : 'web-session';

  return {
    httpBaseUrl,
    wsBaseUrl,
    sessionToken: storedToken,
    defaultSessionId: storedSessionId,
  };
}

export function saveConfig(config: Partial<ClientConfig>): void {
  if (typeof window === 'undefined') return;

  if (config.httpBaseUrl !== undefined) {
    localStorage.setItem(STORAGE_HTTP_KEY, config.httpBaseUrl);
  }
  if (config.wsBaseUrl !== undefined) {
    localStorage.setItem(STORAGE_WS_KEY, config.wsBaseUrl);
  }
  if (config.sessionToken !== undefined) {
    if (config.sessionToken) {
      localStorage.setItem(STORAGE_TOKEN_KEY, config.sessionToken);
    } else {
      localStorage.removeItem(STORAGE_TOKEN_KEY);
    }
  }
  if (config.defaultSessionId !== undefined) {
    localStorage.setItem(STORAGE_SESSION_KEY, config.defaultSessionId);
  }
}
