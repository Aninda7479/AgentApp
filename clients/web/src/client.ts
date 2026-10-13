/**
 * SuperAgent Core v2 Daemon Client.
 * Implements standard HTTP IPC invoking and WebSocket streaming protocols
 * matching packages/core_v2/src/protocol.
 */

import { ClientConfig, getDefaultConfig } from './config';

export type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'error';

export type AgentStreamEvent =
  | { type: 'start_turn'; sessionId: string; model?: string }
  | { type: 'token'; sessionId: string; content: string }
  | { type: 'thought'; sessionId: string; content: string }
  | { type: 'tool_call'; sessionId: string; toolCallId: string; toolName: string; toolArgs: Record<string, unknown> }
  | { type: 'tool_result'; sessionId: string; toolCallId: string; toolResult: unknown; isError?: boolean }
  | { type: 'step_complete'; sessionId: string; stepIndex?: number }
  | { type: 'done'; sessionId: string; stopReason?: string }
  | { type: 'error'; sessionId: string; error: string }
  | { type: 'abort'; sessionId: string };

export interface SessionSyncPayload {
  sessionId: string;
  isRunning: boolean;
  replayEvents?: unknown[];
  fullAssistantText?: string;
  fullThoughtText?: string;
  pendingTool?: unknown;
}

export type EventCallback<T = unknown> = (data: T) => void;
export type StateChangeCallback = (state: ConnectionState) => void;

export class DaemonClient {
  private config: ClientConfig;
  private ws: WebSocket | null = null;
  private state: ConnectionState = 'disconnected';
  private listeners = new Map<string, Set<EventCallback<unknown>>>();
  private stateListeners = new Set<StateChangeCallback>();
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private pingInterval: ReturnType<typeof setInterval> | null = null;
  private activeSubscriptions = new Set<string>();
  private intentionalClose = false;

  constructor(config: ClientConfig = getDefaultConfig()) {
    this.config = config;
  }

  public getConfig(): ClientConfig {
    return { ...this.config };
  }

  public updateConfig(newConfig: Partial<ClientConfig>): void {
    this.config = { ...this.config, ...newConfig };
    if (this.ws && this.state === 'connected') {
      this.reconnect();
    }
  }

  public getConnectionState(): ConnectionState {
    return this.state;
  }

  public onStateChange(callback: StateChangeCallback): () => void {
    this.stateListeners.add(callback);
    callback(this.state);
    return () => {
      this.stateListeners.delete(callback);
    };
  }

  private setState(newState: ConnectionState): void {
    if (this.state !== newState) {
      this.state = newState;
      for (const listener of this.stateListeners) {
        try {
          listener(this.state);
        } catch (err) {
          console.error('[DaemonClient] State listener error:', err);
        }
      }
    }
  }

  /**
   * Invokes an IPC channel on SuperAgent Core v2 over HTTP POST /api/ipc/:channel.
   */
  public async invoke<T = unknown>(channel: string, ...args: unknown[]): Promise<T> {
    const url = `${this.config.httpBaseUrl}/api/ipc/${encodeURIComponent(channel)}`;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (this.config.sessionToken) {
      headers['Authorization'] = `Bearer ${this.config.sessionToken}`;
    }

    const body = JSON.stringify({ args });
    const response = await fetch(url, {
      method: 'POST',
      headers,
      body,
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => response.statusText);
      throw new Error(`HTTP ${response.status} invoking ${channel}: ${errorText}`);
    }

    const json = (await response.json()) as { data?: T; error?: string };
    if (json.error) {
      throw new Error(json.error);
    }

    return (json.data !== undefined ? json.data : (json as unknown as T));
  }

  /**
   * Connects to SuperAgent Core v2 WebSocket hub.
   */
  public connect(): void {
    if (typeof window === 'undefined') return;
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return;
    }

    this.intentionalClose = false;
    this.setState('connecting');

    const tokenQuery = this.config.sessionToken
      ? `?token=${encodeURIComponent(this.config.sessionToken)}`
      : '';
    const wsUrl = `${this.config.wsBaseUrl}${tokenQuery}`;

    try {
      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = () => {
        this.setState('connected');
        this.startHeartbeat();
        // Resubscribe to any active sessions
        for (const sessionId of this.activeSubscriptions) {
          this.sendWsAction('SUBSCRIBE_SESSION', { sessionId });
        }
      };

      this.ws.onmessage = (event: MessageEvent<string>) => {
        this.handleWsMessage(event.data);
      };

      this.ws.onerror = () => {
        this.setState('error');
      };

      this.ws.onclose = () => {
        this.stopHeartbeat();
        this.ws = null;
        if (!this.intentionalClose) {
          this.setState('disconnected');
          this.scheduleReconnect();
        } else {
          this.setState('disconnected');
        }
      };
    } catch {
      this.setState('error');
      this.scheduleReconnect();
    }
  }

  public disconnect(): void {
    this.intentionalClose = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.stopHeartbeat();
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.setState('disconnected');
  }

  public reconnect(): void {
    this.disconnect();
    this.connect();
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer || this.intentionalClose) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, 3000);
  }

  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.pingInterval = setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.sendWsAction('PING', { timestamp: Date.now() });
      }
    }, 30000);
  }

  private stopHeartbeat(): void {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }

  public sendWsAction(action: string, payload: Record<string, unknown> = {}): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ action, ...payload }));
    }
  }

  public subscribeSession(sessionId: string): void {
    this.activeSubscriptions.add(sessionId);
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.sendWsAction('SUBSCRIBE_SESSION', { sessionId });
    }
  }

  public unsubscribeSession(sessionId: string): void {
    this.activeSubscriptions.delete(sessionId);
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.sendWsAction('UNSUBSCRIBE_SESSION', { sessionId });
    }
  }

  public syncSession(sessionId: string): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.sendWsAction('SYNC_SESSION', { sessionId });
    }
  }

  public on<T = unknown>(channel: string, callback: EventCallback<T>): () => void {
    let set = this.listeners.get(channel);
    if (!set) {
      set = new Set();
      this.listeners.set(channel, set);
    }
    set.add(callback as EventCallback<unknown>);
    return () => {
      this.off(channel, callback);
    };
  }

  public off<T = unknown>(channel: string, callback: EventCallback<T>): void {
    const set = this.listeners.get(channel);
    if (set) {
      set.delete(callback as EventCallback<unknown>);
      if (set.size === 0) {
        this.listeners.delete(channel);
      }
    }
  }

  private emit(channel: string, data: unknown): void {
    const set = this.listeners.get(channel);
    if (set) {
      for (const listener of set) {
        try {
          listener(data);
        } catch (err) {
          console.error(`[DaemonClient] Error in listener for ${channel}:`, err);
        }
      }
    }
  }

  private handleWsMessage(raw: string): void {
    try {
      const parsed = JSON.parse(raw) as Record<string, unknown>;

      if (parsed.channel && typeof parsed.channel === 'string') {
        const channel = parsed.channel;
        const data = parsed.data !== undefined ? parsed.data : parsed;
        this.emit(channel, data);
        return;
      }

      if (parsed.action && typeof parsed.action === 'string') {
        this.emit(`action:${parsed.action}`, parsed);
        return;
      }

      if (parsed.type && typeof parsed.type === 'string') {
        // Direct event envelope
        this.emit('agent-event', parsed);
        return;
      }

      this.emit('message', parsed);
    } catch {
      // Non-JSON raw message
      this.emit('raw', raw);
    }
  }
}

// Default singleton instance
let defaultClient: DaemonClient | null = null;

export function getDaemonClient(): DaemonClient {
  if (!defaultClient) {
    defaultClient = new DaemonClient();
  }
  return defaultClient;
}
