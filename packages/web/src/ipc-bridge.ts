// Client-side IPC bridge to mock Electron API in standard browsers

const listeners = new Map<string, Set<Function>>();
let socket: WebSocket | null = null;
let socketQueue: string[] = [];

// Initialize WebSocket for streaming events (like 'agent-event')
function connectWebSocket() {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsUrl = `${protocol}//${window.location.host}/api/ws`;
  const ws = new WebSocket(wsUrl);
  socket = ws;

  ws.onopen = () => {
    console.log('[IPC-Bridge] WebSocket connected.');
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
          // Electron ipcRenderer.on passes (event, data)
          callback({}, data);
        });
      }
    } catch (err) {
      console.error('[IPC-Bridge] Error processing WebSocket message:', err);
    }
  };

  socket.onclose = () => {
    console.warn('[IPC-Bridge] WebSocket closed. Reconnecting in 3 seconds...');
    setTimeout(connectWebSocket, 3000);
  };

  socket.onerror = (err) => {
    console.error('[IPC-Bridge] WebSocket error:', err);
  };
}

// Connect immediately
if (typeof window !== 'undefined') {
  connectWebSocket();
}

// Implement mock ipcRenderer
const mockIpcRenderer = {
  invoke: async (channel: string, ...args: any[]): Promise<any> => {
    try {
      const response = await fetch(`/api/ipc/${channel}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ args }),
      });
      // Session expired or unauthenticated — bounce to the login page.
      if (response.status === 401) {
        window.location.replace('/login');
        throw new Error('Authentication required');
      }
      const result = await response.json();
      if (result.error) {
        throw new Error(result.error);
      }
      return result.data;
    } catch (err: any) {
      console.error(`[IPC-Bridge] Error invoking channel "${channel}":`, err);
      throw err;
    }
  },

  on: (channel: string, callback: Function): void => {
    if (!listeners.has(channel)) {
      listeners.set(channel, new Set());
    }
    listeners.get(channel)!.add(callback);
  },

  removeListener: (channel: string, callback: Function): void => {
    const channelListeners = listeners.get(channel);
    if (channelListeners) {
      channelListeners.delete(callback);
    }
  },

  send: (channel: string, ...args: any[]): void => {
    // Non-blocking invocation via POST or WebSocket
    if (channel.startsWith('window-')) {
      console.log(`[IPC-Bridge] Intercepted desktop window command: ${channel}`);
      return; // Ignore desktop minimize/maximize/close on the web
    }
    
    const payload = JSON.stringify({ channel, args });
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(payload);
    } else {
      socketQueue.push(payload);
    }
  }
};

// Expose window.require Mock
if (typeof window !== 'undefined') {
  (window as any).require = (moduleName: string) => {
    if (moduleName === 'electron') {
      return {
        ipcRenderer: mockIpcRenderer,
        shell: {
          openExternal: (url: string) => window.open(url, '_blank')
        }
      };
    }
    throw new Error(`[IPC-Bridge] Module "${moduleName}" is not available in the browser.`);
  };
  
  // Also expose exports object for CommonJS compatibility
  (window as any).exports = (window as any).exports || {};
}
