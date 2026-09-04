/**
 * Canonical Desktop & Web IPC bridge for the RENDERER.
 *
 * Supports native Tauri v2 Rust IPC and the Web SPA backend bridge.
 * It owns the crash-safe `wrapInvoke` envelope: IPC errors are handled cleanly,
 * and internal health/read operations resolve gracefully without throwing or white-screening the UI.
 */

import { reportError, type IpcErrorEnvelope } from './errorReporter';

interface SuperagentApi {
  ipc: {
    invoke: (channel: string, ...args: any[]) => Promise<any>;
    send: (channel: string, ...args: any[]) => void;
    on: (channel: string, listener: (...args: any[]) => void) => () => void;
    off: (channel: string, listener: (...args: any[]) => void) => void;
  };
  shell?: { openPath: (targetPath: string) => Promise<string> };
  loop?: { read: (workspacePath: string) => Promise<string | null> };
}

function superagent(): SuperagentApi | null {
  if (typeof window === 'undefined') return null;
  return (window as any).superagent ?? null;
}

const TAURI_COMMAND_MAP: Record<string, string> = {
  'system-info': 'get_system_info',
  'system_info': 'get_system_info',
  'get-system-info': 'get_system_info',
  'get_system_info': 'get_system_info',
  'app-version': 'get_app_version',
  'app_version': 'get_app_version',
  'get-app-version': 'get_app_version',
  'get_app_version': 'get_app_version',
  'window-minimize': 'minimize_window',
  'window-maximize': 'toggle_window_maximize',
  'window-close': 'close_window',
  'minimize_window': 'minimize_window',
  'toggle_window_maximize': 'toggle_window_maximize',
  'close_window': 'close_window',
  'autostart-enable': 'autostart_enable',
  'autostart-disable': 'autostart_disable',
  'autostart-status': 'autostart_is_enabled',
  'settings-read': 'settings_read',
  'settings-write': 'settings_write',
  'store-read': 'store_read',
  'store-write': 'store_write',
  'chat-steps-read': 'chat_steps_read',
  'check-for-updates': 'check_for_updates',
  'check_for_updates': 'check_for_updates',
  'download-update': 'download_update',
  'download_update': 'download_update',
  'auto-detect-providers': 'auto_detect_providers',
  'auto_detect_providers': 'auto_detect_providers',
  'skills-catalog': 'skills_catalog',
  'skills_catalog': 'skills_catalog',
  'mcp-catalog': 'mcp_catalog',
  'mcp_catalog': 'mcp_catalog',
  'plugins-catalog': 'plugins_catalog',
  'plugins_catalog': 'plugins_catalog',
  'skills-list': 'skills_list',
  'skills_list': 'skills_list',
  'skills-save': 'skills_save',
  'skills_save': 'skills_save',
  'skills-import-check': 'skills_import_check',
  'skills_import_check': 'skills_import_check',
  'skills-import-perform': 'skills_import_perform',
  'skills_import_perform': 'skills_import_perform',
  'kanban-load': 'kanban_load',
  'kanban_load': 'kanban_load',
  'kanban-save': 'kanban_save',
  'kanban_save': 'kanban_save',
  'circle-search-get-screen-image': 'circle_search_get_screen_image',
  'circle_search_get_screen_image': 'circle_search_get_screen_image',
  'circle-search-show': 'circle_search_show',
  'circle_search_show': 'circle_search_show',
  'circle-search-hide': 'circle_search_hide',
  'circle_search_hide': 'circle_search_hide',
  'circle-search-toggle': 'circle_search_toggle',
  'circle_search_toggle': 'circle_search_toggle',
  'circle-search-capture-area': 'circle_search_capture_area',
  'circle_search_capture_area': 'circle_search_capture_area',
  'overlay-capture-screen': 'circle_search_get_screen_image',
  'overlay-hide': 'circle_search_hide',
  'ollama-status': 'ollama_status',
  'ollama_status': 'ollama_status',
  'check-ollama-installed': 'check_ollama_installed',
  'check_ollama_installed': 'check_ollama_installed',
  'ollama-installed-models': 'ollama_installed_models',
  'ollama_installed_models': 'ollama_installed_models',
  'ollama-models': 'ollama_installed_models',
  'ollama_models': 'ollama_installed_models',
  'ollama-start': 'ollama_start',
  'ollama_start': 'ollama_start',
  'start-ollama-service': 'start_ollama_service',
  'start_ollama_service': 'start_ollama_service',
  'ollama-settings-get': 'ollama_settings_get',
  'ollama_settings_get': 'ollama_settings_get',
  'ollama-settings-save': 'ollama_settings_save',
};

const SAFE_EMPTY_CHANNELS = new Set<string>([
  'skills-catalog',
  'skills_catalog',
  'mcp-catalog',
  'mcp_catalog',
  'plugins-catalog',
  'plugins_catalog',
  'skills-list',
  'skills_list',
  'skills-import-check',
  'skills_import_check',
  'kanban-load',
  'kanban_load',
  'ollama-installed-models',
  'ollama_installed_models',
]);

let cachedBridge: any = null;

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
const webListeners = new Map<string, Set<Function>>();
let webSocket: WebSocket | null = null;
let webSocketConnecting = false;

// Active running sessions tracked so disconnect cleans up zombie runs
const activeSessions = new Set<string>();

function registerActiveSessionFromArgs(channel: string, args: any[]) {
  if (channel === 'agent-run' || channel === 'agent_run') {
    const sessId = args[0]?.sessionId || (typeof args[0] === 'string' ? args[0] : undefined);
    if (sessId) activeSessions.add(sessId);
  } else if (channel === 'agent-stop' || channel === 'agent_stop') {
    const sessId = typeof args[0] === 'string' ? args[0] : args[0]?.sessionId;
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
export function getIpc(): any {
  if (cachedBridge) return cachedBridge;

  // 1. Tauri IPC path (native Tauri runtime on macOS, Windows, Linux).
  const tauri = getTauriInvoke();
  if (tauri) {
    const tauriSurface = {
      invoke: async (channel: string, ...args: any[]) => {
        registerActiveSessionFromArgs(channel, args);
        const isCoreApiChannel =
          channel === 'agent-run' ||
          channel === 'agent-stop' ||
          channel === 'agent_run' ||
          channel === 'agent_stop';

        if (!isCoreApiChannel) {
          const rustCmd = TAURI_COMMAND_MAP[channel] || channel.replace(/[:\-]/g, '_');
          const payload =
            args[0] && typeof args[0] === 'object'
              ? {
                  ...args[0],
                  data: args[0],
                  content: args[0],
                  settings: args[0],
                  payload: args[0],
                }
              : args[0] !== undefined
              ? { id: args[0], arg: args[0], chatId: args[0], chat_id: args[0], content: args[0], data: args[0], settings: args[0], payload: args[0] }
              : undefined;

          try {
            const res = await tauri(rustCmd, payload);
            if (res !== undefined) {
              if (typeof res === 'string' && (channel === 'settings-read' || channel === 'settings_read')) {
                try {
                  return JSON.parse(res);
                } catch {
                  return res;
                }
              }
              return res;
            }
          } catch (err: any) {
            const errMsg = String(err?.message || err || '');
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
          const isTauri = typeof window !== 'undefined' && Boolean((window as any).__TAURI_INTERNALS__ || (window as any).__TAURI__);
          if (!isTauri && httpRes.status === 401 && typeof window !== 'undefined' && window.location && window.location.pathname !== '/login') {
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
        if (SAFE_EMPTY_CHANNELS.has(channel)) {
          return [];
        }
        return null;
      },
      send: (channel: string, ...args: any[]) => {
        registerActiveSessionFromArgs(channel, args);
        ensureWebSocketConnected();
        const rustCmd = TAURI_COMMAND_MAP[channel] || channel.replace(/[:\-]/g, '_');
        const payload =
          args[0] && typeof args[0] === 'object'
            ? args[0]
            : args[0] !== undefined
            ? { id: args[0], arg: args[0], chatId: args[0], chat_id: args[0], content: args[0] }
            : undefined;
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
      on: (channel: string, fn: any) => {
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
      off: (channel: string, fn: any) => {
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
    invoke: async (channel: string, ...args: any[]) => {
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
      if (channel === 'settings-read' || channel === 'settings_read') {
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

      if (SAFE_EMPTY_CHANNELS.has(channel)) {
        return [];
      }
      return null;
    },
    send: (channel: string, ...args: any[]) => {
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
    on: (channel: string, fn: any) => {
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
    off: (channel: string, fn: any) => {
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
  surface: { invoke: (...a: any[]) => any; send: (...a: any[]) => any; on: (...a: any[]) => any; off: (...a: any[]) => any },
  shell?: { openPath: (targetPath: string) => Promise<string> }
): any {
  const safeInvoke = wrapInvoke((ch: string, ...a: any[]) => surface.invoke(ch, ...a));

  const bridge: any = (channel: string, ...args: any[]) => {
    const fn = args.find((a) => typeof a === 'function');
    if (fn) return surface.on(channel, fn);
    return safeInvoke(channel, ...args);
  };

  bridge.invoke = safeInvoke;
  bridge.send = (ch: string, ...a: any[]) => surface.send(ch, ...a);
  bridge.on = (ch: string, fn: (...a: any[]) => void) => surface.on(ch, fn);
  const safeOff = (ch: string, fn: (...a: any[]) => void) => {
    if (typeof surface?.off === 'function') {
      return surface.off(ch, fn);
    }
    if (typeof (surface as any)?.removeListener === 'function') {
      return (surface as any).removeListener(ch, fn);
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

const SILENT_IPC_CHANNELS = new Set<string>([
  'system-info',
  'system_info',
  'get-system-info',
  'get_system_info',
  'settings-read',
  'settings_read',
  'settings-write',
  'settings_write',
  'store-read',
  'store_read',
  'store-write',
  'store_write',
  'chat-steps-read',
  'chat_steps_read',
  'app-version',
  'app_version',
  'get-app-version',
  'get_app_version',
  'auto-detect-providers',
  'auto_detect_providers',
  'skills-catalog',
  'skills_catalog',
  'mcp-catalog',
  'mcp_catalog',
  'plugins-catalog',
  'plugins_catalog',
  'skills-list',
  'skills_list',
  'skills-import-check',
  'skills_import_check',
  'skills-import-perform',
  'skills_import_perform',
  'kanban-load',
  'kanban_load',
  'kanban-save',
  'kanban_save',
  'pet-set-partner',
  'pet-say',
  'pet-status',
  'pet-start',
  'pet-stop',
  'pet-set-visible',
  'web-status',
  'check-for-updates',
  'check_for_updates',
  'download-update',
  'download_update',
  'provider-proxy',
  'telegram-test',
  'telegram-config-get',
  'telegram-config-save',
  'telegram-send',
  'autostart-enable',
  'autostart-disable',
  'autostart-status',
  'autostart-is-enabled',
  'autostart_enable',
  'autostart_disable',
  'autostart_is_enabled',
  'circle-search-get-screen-image',
  'circle_search_get_screen_image',
  'circle-search-show',
  'circle_search_show',
  'circle-search-hide',
  'circle_search_hide',
  'circle-search-toggle',
  'circle_search_toggle',
  'circle-search-analyze',
  'overlay-capture-screen',
  'overlay-hide',
  'ollama-status',
  'ollama_status',
  'check-ollama-installed',
  'check_ollama_installed',
  'ollama-installed-models',
  'ollama_installed_models',
  'ollama-models',
  'ollama_models',
  'ollama-start',
  'ollama_start',
  'start-ollama-service',
  'start_ollama_service',
  'ollama-settings-get',
  'ollama_settings_get',
  'ollama-settings-save',
  'ollama_settings_save',
]);


function wrapInvoke(fn: (channel: string, ...args: any[]) => Promise<any>) {
  return async (channel: string, ...args: any[]): Promise<any> => {
    try {
      const result = await fn(channel, ...args);
      if (result && typeof result === 'object' && (result as IpcErrorEnvelope).__ipcError) {
        if (!SILENT_IPC_CHANNELS.has(channel)) {
          reportError('ipc:' + channel, (result as IpcErrorEnvelope).error);
        }
        return null;
      }
      if (result && typeof result === 'object' && result.ok === false && result.error) {
        if (!SILENT_IPC_CHANNELS.has(channel) && !result.unsupported) {
          reportError('ipc:' + channel, result.error);
        }
      }
      return result;
    } catch (err: any) {
      const msg = String(err?.message || err || '');
      if (!SILENT_IPC_CHANNELS.has(channel) && !msg.includes('not found') && !msg.includes('Command')) {
        reportError('ipc:' + channel, err);
      }
      return null;
    }
  };
}

function getTauriInvoke(): ((cmd: string, args?: any) => Promise<any>) | null {
  if (typeof window === 'undefined') return null;
  const w = window as any;
  if (w.__TAURI_INTERNALS__?.invoke) {
    return (cmd: string, args?: any) => w.__TAURI_INTERNALS__.invoke(cmd, args);
  }
  if (w.__TAURI__?.core?.invoke) {
    return (cmd: string, args?: any) => w.__TAURI__.core.invoke(cmd, args);
  }
  return null;
}

export function invoke(channel: string, ...args: unknown[]): Promise<any> {
  const tauri = getTauriInvoke();
  if (tauri) {
    const rustCmd = TAURI_COMMAND_MAP[channel] || channel.replace(/[:\-]/g, '_');
    const firstArg = args[0];
    let payload: any;
    if (firstArg && typeof firstArg === 'object') {
      payload = {
        ...firstArg,
        data: firstArg,
        content: firstArg,
        settings: firstArg,
        payload: firstArg,
      };
    } else if (firstArg !== undefined) {
      payload = {
        id: firstArg,
        arg: firstArg,
        chatId: firstArg,
        chat_id: firstArg,
        content: firstArg,
        data: firstArg,
        payload: firstArg,
      };
    } else {
      payload = undefined;
    }
    return wrapInvoke((_ch, a) => tauri(rustCmd, a))(channel, payload);
  }
  const api = superagent();
  if (api?.ipc) return wrapInvoke((ch, ...a) => api.ipc.invoke(ch, ...a))(channel, ...args);
  return Promise.resolve(null);
}

export function send(channel: string, ...args: unknown[]): void {
  const tauri = getTauriInvoke();
  if (tauri) {
    const rustCmd = TAURI_COMMAND_MAP[channel] || channel.replace(/[:\-]/g, '_');
    const firstArg = args[0];
    const payload = firstArg && typeof firstArg === 'object'
      ? { ...firstArg, data: firstArg, content: firstArg, settings: firstArg, payload: firstArg }
      : (firstArg !== undefined ? { id: firstArg, arg: firstArg, chatId: firstArg, chat_id: firstArg, content: firstArg, data: firstArg, payload: firstArg } : undefined);
    tauri(rustCmd, payload).catch(() => {});
    return;
  }
  const api = superagent();
  if (api?.ipc) {
    api.ipc.send(channel, ...args);
  }
}

export function on(channel: string, listener: (...args: any[]) => void): () => void {
  const api = superagent();
  if (api?.ipc) return api.ipc.on(channel, listener);
  return () => {};
}

export function off(channel: string, listener: (...args: any[]) => void): void {
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
