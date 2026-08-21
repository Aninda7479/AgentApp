// Client-side IPC bridge for standard web browsers

const listeners = new Map<string, Set<Function>>();
let socket: WebSocket | null = null;
let socketQueue: string[] = [];
let lastConnectedStatus: boolean | null = null;

function dispatchBackendStatus(connected: boolean) {
  if (typeof window === 'undefined') return;
  if (lastConnectedStatus === connected) return;
  lastConnectedStatus = connected;
  window.dispatchEvent(new CustomEvent('backend-status', { detail: { connected } }));
}

// Initialize WebSocket for streaming events (like 'agent-event')
/** Establishes a WebSocket connection for streaming events, with auto-reconnect. */
function connectWebSocket() {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsUrl = `${protocol}//${window.location.host}/api/ws`;
  const ws = new WebSocket(wsUrl);
  socket = ws;

  ws.onopen = () => {
    console.log('[IPC-Bridge] WebSocket connected.');
    dispatchBackendStatus(true);
    // Flush queued messages
    while (socketQueue.length > 0) {
      const msg = socketQueue.shift();
      if (msg) ws.send(msg);
    }
  };

  socket.onmessage = (event) => {
    try {
      const { channel, data } = JSON.parse(event.data);
      const channelListeners = listeners.get(channel);
      if (channelListeners) {
        channelListeners.forEach((callback) => {
          callback({}, data);
        });
      }
    } catch (err) {
      console.error('[IPC-Bridge] Error processing WebSocket message:', err);
    }
  };

  socket.onclose = () => {
    console.warn('[IPC-Bridge] WebSocket closed. Reconnecting in 3 seconds...');
    dispatchBackendStatus(false);
    setTimeout(connectWebSocket, 3000);
  };

  socket.onerror = (err) => {
    console.error('[IPC-Bridge] WebSocket error:', err);
    dispatchBackendStatus(false);
  };
}

// Connect immediately
if (typeof window !== 'undefined') {
  connectWebSocket();
}

// Concurrency control: max 6 parallel in-flight HTTP calls to prevent socket exhaustion
const MAX_CONCURRENT_FETCHES = 6;
let activeFetchCount = 0;
const fetchQueue: Array<() => void> = [];

function processQueue() {
  while (activeFetchCount < MAX_CONCURRENT_FETCHES && fetchQueue.length > 0) {
    const nextTask = fetchQueue.shift();
    if (nextTask) {
      activeFetchCount++;
      nextTask();
    }
  }
}

// In-flight read request deduplication cache
const inFlightReads = new Map<string, Promise<any>>();

const DEDUPLICATABLE_PREFIXES = [
  'settings-read',
  'store-read',
  'chat-steps-read',
  'get_system_info',
  'system-info',
];

function isDeduplicatable(channel: string): boolean {
  return DEDUPLICATABLE_PREFIXES.some((prefix) => channel === prefix || channel.startsWith(prefix + ':'));
}

async function enqueueFetch<T>(fn: () => Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    fetchQueue.push(() => {
      fn()
        .then(resolve)
        .catch(reject)
        .finally(() => {
          activeFetchCount--;
          processQueue();
        });
    });
    processQueue();
  });
}

// Implement mock IPC bridge
/** Web IPC bridge that routes IPC calls over HTTP fetch and WebSocket with concurrency control. */
const mockIpcRenderer = {
  invoke: async (channel: string, ...args: any[]): Promise<any> => {
    // `open-external` opens a URL in the OS shell on desktop. In the browser
    // there is no shell, so open it in a new tab directly instead of hitting the
    // (nonexistent) server endpoint.
    if (channel === 'open-external' && typeof args[0] === 'string') {
      window.open(args[0], '_blank');
      return { ok: true };
    }

    // Invalidate in-flight reads when writes happen
    if (channel.endsWith('-write') || channel.endsWith('-save') || channel.endsWith('-delete')) {
      inFlightReads.clear();
    }

    // In-flight read deduplication
    const isRead = isDeduplicatable(channel);
    const dedupeKey = isRead ? `${channel}:${JSON.stringify(args)}` : '';
    if (isRead && inFlightReads.has(dedupeKey)) {
      return inFlightReads.get(dedupeKey);
    }

    const executeCall = async () => {
      const performFetch = async (retries = 2, delayMs = 150): Promise<any> => {
        try {
          const response = await fetch(`/api/ipc/${channel}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'same-origin',
            body: JSON.stringify({ args }),
          });

          // Session expired or unauthenticated — bounce to login
          if (response.status === 401) {
            window.location.replace('/login');
            return new Promise(() => {});
          }

          const result = await response.json();
          if (result.error) {
            throw new Error(result.error);
          }
          return result.data;
        } catch (err: any) {
          if (retries > 0 && (err instanceof TypeError || err.message?.includes('fetch') || err.message?.includes('NetworkError'))) {
            await new Promise((r) => setTimeout(r, delayMs));
            return performFetch(retries - 1, delayMs * 2);
          }
          throw err;
        }
      };

      return enqueueFetch(() => performFetch());
    };

    if (isRead) {
      const promise = executeCall().finally(() => {
        inFlightReads.delete(dedupeKey);
      });
      inFlightReads.set(dedupeKey, promise);
      return promise;
    }

    return executeCall();
  },

  on: (channel: string, callback: Function): void => {
    if (!listeners.has(channel)) {
      listeners.set(channel, new Set());
    }
    listeners.get(channel)!.add(callback);
  },

  off: (channel: string, callback: Function): void => {
    const channelListeners = listeners.get(channel);
    if (channelListeners) {
      channelListeners.delete(callback);
    }
  },

  removeListener: (channel: string, callback: Function): void => {
    const channelListeners = listeners.get(channel);
    if (channelListeners) {
      channelListeners.delete(callback);
    }
  },

  send: (channel: string, ...args: any[]): void => {
    // Route window commands to browser; everything else goes over WebSocket
    if (channel.startsWith('window-')) {
      console.log(`[IPC-Bridge] Intercepted desktop window command: ${channel}`);
      return;
    }
    
    const payload = JSON.stringify({ channel, args });
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(payload);
    } else {
      socketQueue.push(payload);
    }
  }
};

// Expose window.superagent API for web clients
if (typeof window !== 'undefined') {
  (window as any).superagent = {
    ipc: mockIpcRenderer,
    shell: {
      openPath: (targetPath: string) => {
        window.open(targetPath, '_blank');
        return Promise.resolve('');
      }
    },
    loop: {
      read: async () => null
    }
  };
  
  // Also expose exports object for CommonJS compatibility
  (window as any).exports = (window as any).exports || {};
}
