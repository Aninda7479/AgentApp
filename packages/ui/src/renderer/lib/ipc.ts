/**
 * Canonical Desktop & Web IPC bridge for the RENDERER.
 *
 * Supports native Tauri v2 Rust IPC and the Web SPA backend bridge.
 * It owns the crash-safe `wrapInvoke` envelope: IPC errors are handled cleanly,
 * and internal health/read operations resolve gracefully without throwing or white-screening the UI.
 */

import { reportError, type IpcErrorEnvelope } from './errorReporter';

export type IpcCallback = (...args: unknown[]) => void;

export interface IpcBridge {
  (channel: string, ...args: unknown[]): Promise<unknown> | (() => void);
  invoke: <T = unknown>(channel: string, ...args: unknown[]) => Promise<T | null>;
  send: (channel: string, ...args: unknown[]) => void;
  on: (channel: string, listener: IpcCallback) => () => void;
  off: (channel: string, listener: IpcCallback) => void;
  removeListener: (channel: string, listener: IpcCallback) => void;
  removeAllListeners: (channel?: string) => void;
  shell?: { openPath: (targetPath: string) => Promise<string> };
  loop?: { read: (workspacePath: string) => Promise<string | null> };
}

interface SuperagentApi {
  ipc: {
    invoke: (channel: string, ...args: unknown[]) => Promise<unknown>;
    send: (channel: string, ...args: unknown[]) => void;
    on: (channel: string, listener: (...args: unknown[]) => void) => () => void;
    off: (channel: string, listener: (...args: unknown[]) => void) => void;
  };
  shell?: { openPath: (targetPath: string) => Promise<string> };
  loop?: { read: (workspacePath: string) => Promise<string | null> };
}

function superagent(): SuperagentApi | null {
  if (typeof window === 'undefined') return null;
  const win = window as unknown as { superagent?: SuperagentApi };
  return win.superagent ?? null;
}

export const TAURI_COMMAND_MAP: Record<string, string> = {
  'system-info': 'get_system_info',
  'get-system-info': 'get_system_info',
  'app-version': 'get_app_version',
  'get-app-version': 'get_app_version',
  'window-minimize': 'minimize_window',
  'window-maximize': 'toggle_window_maximize',
  'window-close': 'close_window',
  'autostart-status': 'autostart_is_enabled',
  'overlay-capture-screen': 'circle_search_get_screen_image',
  'overlay-hide': 'circle_search_hide',
  'screenshot-screen': 'circle_search_get_screen_image',
  'screenshot_screen': 'circle_search_get_screen_image',
  'ollama-models': 'ollama_installed_models',
  'check-ollama-installed': 'check_ollama_installed',
  'start-ollama-service': 'start_ollama_service',
};

export function toTauriCommand(channel: string): string {
  return TAURI_COMMAND_MAP[channel] || TAURI_COMMAND_MAP[channel.replace(/_/g, '-')] || channel.replace(/[:\-]/g, '_');
}

export function buildTauriPayload(firstArg: unknown): Record<string, unknown> | undefined {
  if (firstArg && typeof firstArg === 'object') {
    const obj = firstArg as Record<string, unknown>;
    return {
      ...obj,
      data: obj,
      content: obj,
      settings: obj,
      payload: obj,
    };
  }
  if (firstArg !== undefined) {
    return {
      id: firstArg,
      arg: firstArg,
      chatId: firstArg,
      chat_id: firstArg,
      content: firstArg,
      data: firstArg,
      settings: firstArg,
      payload: firstArg,
    };
  }
  return undefined;
}

export function isAgentRunChannel(channel: string): boolean {
  return channel === 'agent-run' || channel === 'agent_run';
}

export function isAgentStopChannel(channel: string): boolean {
  return channel === 'agent-stop' || channel === 'agent_stop';
}

export function isSettingsReadChannel(channel: string): boolean {
  return channel === 'settings-read' || channel === 'settings_read';
}

export const SAFE_EMPTY_CHANNELS = new Set<string>([
  'skills-catalog',
  'mcp-catalog',
  'plugins-catalog',
  'skills-list',
  'skills-import-check',
  'kanban-load',
  'ollama-installed-models',
]);

export function isSafeEmptyChannel(channel: string): boolean {
  return SAFE_EMPTY_CHANNELS.has(channel) || SAFE_EMPTY_CHANNELS.has(channel.replace(/_/g, '-'));
}

let cachedBridge: IpcBridge | null = null;

export function getStoredAuthToken(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return localStorage.getItem('sa_session_token') || sessionStorage.getItem('sa_session_token');
  } catch {
    return null;
  }
}

export function setStoredAuthToken(token: string | null): void {
  if (typeof window === 'undefined') return;
  try {
    if (token) {
      localStorage.setItem('sa_session_token', token);
    } else {
      localStorage.removeItem('sa_session_token');
      sessionStorage.removeItem('sa_session_token');
    }
  } catch {}
}

export function getAuthHeaders(extra?: Record<string, string>): Record<string, string> {
  const token = getStoredAuthToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(extra || {}),
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  return headers;
}

export function getCoreApiBaseUrl(): string {
  if (typeof window !== 'undefined' && window.location) {
    const { protocol, port, origin } = window.location;
    if (protocol === 'http:' || protocol === 'https:') {
      // In production web (port 80, 443, empty port string, or custom web port except dev 5173),
      // resolve to the current origin.
      if (port !== '5173') {
        return origin;
      }
    }
  }
  return 'http://localhost:1469';
}

function getCoreWsUrl(): string {
  const token = getStoredAuthToken();
  const tokenQuery = token ? `?token=${encodeURIComponent(token)}` : '';
  if (typeof window !== 'undefined' && window.location) {
    const { protocol, host, port } = window.location;
    if (protocol === 'http:' || protocol === 'https:') {
      if (port !== '5173') {
        const wsProtocol = protocol === 'https:' ? 'wss:' : 'ws:';
        return `${wsProtocol}//${host}/api/ws${tokenQuery}`;
      }
    }
  }
  return `ws://localhost:1469/api/ws${tokenQuery}`;
}

// Live WebSocket connection and listener registry for streaming (e.g. agent-event)
const webListeners = new Map<string, Set<IpcCallback>>();
let webSocket: WebSocket | null = null;
let webSocketConnecting = false;

// Active running sessions tracked so disconnect cleans up zombie runs
const activeSessions = new Set<string>();

function registerActiveSessionFromArgs(channel: string, args: unknown[]) {
  const first = args[0] as { sessionId?: string } | string | undefined;
  if (isAgentRunChannel(channel)) {
    const sessId = typeof first === 'object' && first !== null ? first.sessionId : (typeof first === 'string' ? first : undefined);
    if (sessId) activeSessions.add(sessId);
  } else if (isAgentStopChannel(channel)) {
    const sessId = typeof first === 'string' ? first : (typeof first === 'object' && first !== null ? first.sessionId : undefined);
    if (sessId) activeSessions.delete(sessId);
  }
}

export function disconnectWebSocket(): void {
  if (activeSessions.size > 0) {
    const agentListeners = webListeners.get('agent-event');
    if (agentListeners) {
      for (const sessionId of Array.from(activeSessions)) {
        const disconnectEvent = {
          type: 'error',
          sessionId,
          error: 'Disconnected from backend server.',
        };
        agentListeners.forEach((callback) => {
          try {
            callback({}, disconnectEvent);
          } catch {}
        });
      }
    }
    activeSessions.clear();
  }
  if (webSocket) {
    try {
      webSocket.onclose = null;
      webSocket.onerror = null;
      webSocket.close();
    } catch {}
    webSocket = null;
  }
  webSocketConnecting = false;
}

export function reconnectWebSocket(): void {
  disconnectWebSocket();
  ensureWebSocketConnected();
}

function ensureWebSocketConnected() {
  if (typeof window === 'undefined') return;
  if (webSocket && (webSocket.readyState === WebSocket.OPEN || webSocket.readyState === WebSocket.CONNECTING)) {
    return;
  }
  if (webSocketConnecting) return;
  webSocketConnecting = true;

  try {
    const wsUrl = getCoreWsUrl();
    const ws = new WebSocket(wsUrl);
    webSocket = ws;

    ws.onopen = () => {
      webSocketConnecting = false;
    };

    ws.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data);
        const channel = payload.channel || payload.action;
        const data = payload.data !== undefined ? payload.data : payload;
        if (channel) {
          if (channel === 'agent-event') {
            const sessId = data?.sessionId;
            const eventType = data?.type;
            if (sessId) {
              if (eventType === 'start_turn' || eventType === 'token' || eventType === 'tool_call') {
                activeSessions.add(sessId);
              } else if (eventType === 'done' || eventType === 'error' || eventType === 'abort') {
                activeSessions.delete(sessId);
              }
            }
          }
          const channelListeners = webListeners.get(channel);
          if (channelListeners) {
            channelListeners.forEach((callback) => {
              try {
                callback({}, data);
              } catch (err) {
                console.error(`[IPC-Bridge] Error in listener for channel "${channel}":`, err);
              }
            });
          }
        }
      } catch (err) {
        console.error('[IPC-Bridge] Error parsing WebSocket message:', err);
      }
    };

    ws.onclose = () => {
      webSocketConnecting = false;
      webSocket = null;

      // Clean up zombie sessions on backend disconnect
      if (activeSessions.size > 0) {
        const agentListeners = webListeners.get('agent-event');
        if (agentListeners) {
          for (const sessionId of Array.from(activeSessions)) {
            const disconnectEvent = {
              type: 'error',
              sessionId,
              error: 'Connection to backend server was lost. Please check if the backend core server or daemon process is running.',
            };
            agentListeners.forEach((callback) => {
              try {
                callback({}, disconnectEvent);
              } catch (err) {
                console.error(`[IPC-Bridge] Error dispatching disconnect error for session "${sessionId}":`, err);
              }
            });
          }
        }
        activeSessions.clear();
      }

      setTimeout(ensureWebSocketConnected, 2000);
    };

    ws.onerror = () => {
      webSocketConnecting = false;
    };
  } catch (err) {
    webSocketConnecting = false;
    console.warn('[IPC-Bridge] Failed to create WebSocket:', err);
  }
}

/**
 * Resolves the active IPC surface as a DUAL value (so BOTH call-site styles keep working):
 *   - callable: `ipc(channel, listenerFn)` registers a listener (on) and returns
 *     an unsubscribe fn; `await ipc(channel, ...args)` performs an invoke.
 *   - object: `ipc.invoke / ipc.send / ipc.on / ipc.off / ipc.removeListener`
 */
export function getIpc(): IpcBridge {
  if (cachedBridge) return cachedBridge;

  // 1. Tauri IPC path (native Tauri runtime on macOS, Windows, Linux).
  const tauri = getTauriInvoke();
  if (tauri) {
    const tauriSurface = {
      invoke: async (channel: string, ...args: unknown[]) => {
        registerActiveSessionFromArgs(channel, args);
        const isCoreApiChannel = isAgentRunChannel(channel) || isAgentStopChannel(channel);

        if (!isCoreApiChannel) {
          const rustCmd = toTauriCommand(channel);
          const payload = buildTauriPayload(args[0]);

          try {
            const res = await tauri(rustCmd, payload);
            if (res !== undefined) {
              if (typeof res === 'string' && isSettingsReadChannel(channel)) {
                try {
                  return JSON.parse(res);
                } catch {
                  return res;
                }
              }
              return res;
            }
          } catch (err: unknown) {
            const errMsg = err instanceof Error ? err.message : String(err || '');
            if (!errMsg.includes('not found') && !errMsg.includes('Command')) {
              throw err;
            }
          }
        }

        // Fallback to Core v2 HTTP API on port 1469
        try {
          const httpRes = await fetch(`${getCoreApiBaseUrl()}/api/ipc/${encodeURIComponent(channel)}`, {
            method: 'POST',
            headers: getAuthHeaders(),
            credentials: 'include',
            body: JSON.stringify({ channel, args }),
          });
          const isTauriEnv = typeof window !== 'undefined' && Boolean((window as unknown as { __TAURI_INTERNALS__?: unknown; __TAURI__?: unknown }).__TAURI_INTERNALS__ || (window as unknown as { __TAURI_INTERNALS__?: unknown; __TAURI__?: unknown }).__TAURI__);
          if (!isTauriEnv && httpRes.status === 401 && typeof window !== 'undefined' && window.location && window.location.pathname !== '/login') {
            window.location.href = '/login';
          }
          if (httpRes.ok) {
            const resJson = await httpRes.json();
            if (resJson && typeof resJson === 'object' && 'data' in resJson) {
              return resJson.data;
            }
            return resJson;
          }
        } catch {
          /* ignore network error */
        }
        if (isSafeEmptyChannel(channel)) {
          return [];
        }
        return null;
      },
      send: (channel: string, ...args: unknown[]) => {
        registerActiveSessionFromArgs(channel, args);
        ensureWebSocketConnected();
        const rustCmd = toTauriCommand(channel);
        const payload = buildTauriPayload(args[0]);
        tauri(rustCmd, payload).catch(() => {
          const jsonPayload = JSON.stringify({ channel, args });
          if (webSocket && webSocket.readyState === WebSocket.OPEN) {
            webSocket.send(jsonPayload);
          } else {
            fetch(`${getCoreApiBaseUrl()}/api/ipc/${encodeURIComponent(channel)}`, {
              method: 'POST',
              headers: getAuthHeaders(),
              credentials: 'include',
              body: jsonPayload,
            }).catch(() => {});
          }
        });
      },
      on: (channel: string, fn: IpcCallback) => {
        ensureWebSocketConnected();
        let set = webListeners.get(channel);
        if (!set) {
          set = new Set();
          webListeners.set(channel, set);
        }
        set.add(fn);
        return () => {
          set?.delete(fn);
        };
      },
      off: (channel: string, fn: IpcCallback) => {
        const set = webListeners.get(channel);
        if (set) {
          set.delete(fn);
        }
      },
    };
    cachedBridge = makeIpcBridge(tauriSurface);
    return cachedBridge;
  }

  // 2. Web bridge path (window.superagent).
  const api = superagent();
  if (api?.ipc) {
    cachedBridge = makeIpcBridge(api.ipc, api.shell);
    return cachedBridge;
  }

  // 3. Web HTTP IPC path — communicates with SuperAgent Core v2 over HTTP / REST and WebSocket
  const webHttpSurface = {
    invoke: async (channel: string, ...args: unknown[]) => {
      registerActiveSessionFromArgs(channel, args);
      try {
        const httpRes = await fetch(`${getCoreApiBaseUrl()}/api/ipc/${encodeURIComponent(channel)}`, {
          method: 'POST',
          headers: getAuthHeaders(),
          credentials: 'include',
          body: JSON.stringify({ channel, args }),
        });
        if (httpRes.ok) {
          const resJson = await httpRes.json();
          if (resJson && typeof resJson === 'object' && 'data' in resJson) {
            return resJson.data;
          }
          return resJson;
        }
      } catch {
        /* ignore network error */
      }

      // Direct REST fallback for settings when offline or during bootstrap
      if (isSettingsReadChannel(channel)) {
        try {
          const res = await fetch(`${getCoreApiBaseUrl()}/api/settings`, {
            headers: getAuthHeaders(),
            credentials: 'include',
          });
          if (res.ok) {
            return await res.json();
          }
        } catch {}
      }

      if (isSafeEmptyChannel(channel)) {
        return [];
      }
      return null;
    },
    send: (channel: string, ...args: unknown[]) => {
      registerActiveSessionFromArgs(channel, args);
      ensureWebSocketConnected();
      const payload = JSON.stringify({ channel, args });
      if (webSocket && webSocket.readyState === WebSocket.OPEN) {
        webSocket.send(payload);
      } else {
        fetch(`${getCoreApiBaseUrl()}/api/ipc/${encodeURIComponent(channel)}`, {
          method: 'POST',
          headers: getAuthHeaders(),
          credentials: 'include',
          body: payload,
        }).catch(() => {});
      }
    },
    on: (channel: string, fn: IpcCallback) => {
      ensureWebSocketConnected();
      let set = webListeners.get(channel);
      if (!set) {
        set = new Set();
        webListeners.set(channel, set);
      }
      set.add(fn);
      return () => {
        set?.delete(fn);
      };
    },
    off: (channel: string, fn: IpcCallback) => {
      const set = webListeners.get(channel);
      if (set) {
        set.delete(fn);
      }
    },
  };
  cachedBridge = makeIpcBridge(webHttpSurface);
  return cachedBridge;
}

/**
 * Builds the dual callable+object IPC bridge around a surface that exposes
 * `{ invoke, send, on, off }`.
 */
function makeIpcBridge(
  surface: {
    invoke: (channel: string, ...a: unknown[]) => Promise<unknown>;
    send: (channel: string, ...a: unknown[]) => void;
    on: (channel: string, listener: IpcCallback) => () => void;
    off: (channel: string, listener: IpcCallback) => void;
  },
  shell?: { openPath: (targetPath: string) => Promise<string> }
): IpcBridge {
  const safeInvoke = wrapInvoke((ch: string, ...a: unknown[]) => surface.invoke(ch, ...a));

  const bridge = ((channel: string, ...args: unknown[]) => {
    const fn = args.find((a): a is IpcCallback => typeof a === 'function');
    if (fn) return surface.on(channel, fn);
    return safeInvoke(channel, ...args);
  }) as IpcBridge;

  bridge.invoke = safeInvoke;
  bridge.send = (ch: string, ...a: unknown[]) => surface.send(ch, ...a);
  bridge.on = (ch: string, fn: IpcCallback) => surface.on(ch, fn);
  const safeOff = (ch: string, fn: IpcCallback) => {
    if (typeof surface?.off === 'function') {
      return surface.off(ch, fn);
    }
    const s = surface as unknown as { removeListener?: (ch: string, fn: IpcCallback) => void };
    if (typeof s?.removeListener === 'function') {
      return s.removeListener(ch, fn);
    }
  };
  bridge.off = safeOff;
  bridge.removeListener = safeOff;
  bridge.removeAllListeners = (_ch?: string) => {};
  if (shell) {
    bridge.shell = shell;
  }
  return bridge;
}

/** True when running inside the Tauri native desktop runtime. */
export function isTauri(): boolean {
  return Boolean(getTauriInvoke());
}

/** True when running inside any native desktop shell. */
export function isDesktopApp(): boolean {
  return isTauri();
}

export const SILENT_IPC_CHANNELS = new Set<string>([
  'system-info',
  'get-system-info',
  'settings-read',
  'settings-write',
  'store-read',
  'store-write',
  'chat-steps-read',
  'app-version',
  'get-app-version',
  'auto-detect-providers',
  'skills-catalog',
  'mcp-catalog',
  'plugins-catalog',
  'skills-list',
  'skills-import-check',
  'skills-import-perform',
  'kanban-load',
  'kanban-save',
  'pet-set-partner',
  'pet-say',
  'pet-status',
  'pet-start',
  'pet-stop',
  'pet-set-visible',
  'web-status',
  'check-for-updates',
  'download-update',
  'provider-proxy',
  'telegram-test',
  'telegram-config-get',
  'telegram-config-save',
  'telegram-send',
  'autostart-enable',
  'autostart-disable',
  'autostart-status',
  'autostart-is-enabled',
  'circle-search-get-screen-image',
  'circle-search-show',
  'circle-search-hide',
  'circle-search-toggle',
  'circle-search-analyze',
  'overlay-capture-screen',
  'overlay-hide',
  'screenshot-screen',
  'ollama-status',
  'check-ollama-installed',
  'ollama-installed-models',
  'ollama-models',
  'ollama-start',
  'start-ollama-service',
  'ollama-settings-get',
  'ollama-settings-save',
]);

export function isSilentIpcChannel(channel: string): boolean {
  return SILENT_IPC_CHANNELS.has(channel) || SILENT_IPC_CHANNELS.has(channel.replace(/_/g, '-'));
}

function wrapInvoke(fn: (channel: string, ...args: unknown[]) => Promise<unknown>) {
  return async <T = unknown>(channel: string, ...args: unknown[]): Promise<T | null> => {
    try {
      const result = await fn(channel, ...args);
      if (result && typeof result === 'object' && (result as IpcErrorEnvelope).__ipcError) {
        if (!isSilentIpcChannel(channel)) {
          reportError('ipc:' + channel, (result as IpcErrorEnvelope).error);
        }
        return null;
      }
      if (result && typeof result === 'object') {
        const obj = result as { ok?: boolean; error?: unknown; unsupported?: boolean };
        if (obj.ok === false && obj.error) {
          if (!isSilentIpcChannel(channel) && !obj.unsupported) {
            reportError('ipc:' + channel, obj.error);
          }
        }
      }
      return result as T;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err || '');
      if (!isSilentIpcChannel(channel) && !msg.includes('not found') && !msg.includes('Command')) {
        reportError('ipc:' + channel, err);
      }
      return null;
    }
  };
}

type TauriInvokeFn = (cmd: string, args?: Record<string, unknown>) => Promise<unknown>;

function getTauriInvoke(): TauriInvokeFn | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as {
    __TAURI_INTERNALS__?: { invoke: TauriInvokeFn };
    __TAURI__?: { core?: { invoke: TauriInvokeFn } };
  };
  if (w.__TAURI_INTERNALS__?.invoke) {
    return (cmd: string, args?: Record<string, unknown>) => w.__TAURI_INTERNALS__!.invoke(cmd, args);
  }
  if (w.__TAURI__?.core?.invoke) {
    return (cmd: string, args?: Record<string, unknown>) => w.__TAURI__!.core!.invoke(cmd, args);
  }
  return null;
}

export function invoke<T = unknown>(channel: string, ...args: unknown[]): Promise<T | null> {
  const tauri = getTauriInvoke();
  if (tauri) {
    const rustCmd = toTauriCommand(channel);
    const payload = buildTauriPayload(args[0]);
    return wrapInvoke((_ch, a) => tauri(rustCmd, a as Record<string, unknown> | undefined))(channel, payload);
  }
  const api = superagent();
  if (api?.ipc) return wrapInvoke((ch, ...a) => api.ipc.invoke(ch, ...a))(channel, ...args);
  return Promise.resolve(null);
}

export function send(channel: string, ...args: unknown[]): void {
  const tauri = getTauriInvoke();
  if (tauri) {
    const rustCmd = toTauriCommand(channel);
    const payload = buildTauriPayload(args[0]);
    tauri(rustCmd, payload).catch(() => {});
    return;
  }
  const api = superagent();
  if (api?.ipc) {
    api.ipc.send(channel, ...args);
  }
}

export function on(channel: string, listener: IpcCallback): () => void {
  const api = superagent();
  if (api?.ipc) return api.ipc.on(channel, listener);
  return () => {};
}

export function off(channel: string, listener: IpcCallback): void {
  const api = superagent();
  if (api?.ipc) {
    api.ipc.off(channel, listener);
  }
}

/** Open a file/folder with the OS shell (routed through the backend). */
export function openExternalPath(targetPath: string): Promise<string> {
  const api = superagent();
  if (api?.shell?.openPath) return api.shell.openPath(targetPath);
  return Promise.resolve('');
}

/** Read a workspace's `.superagent/loop.md` / `.claude/loop.md`. */
export function readLoopPrompt(workspacePath: string): Promise<string | null> {
  const api = superagent();
  if (api?.loop?.read) return api.loop.read(workspacePath);
  return Promise.resolve(null);
}
