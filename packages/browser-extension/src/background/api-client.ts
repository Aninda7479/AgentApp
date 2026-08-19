/**
 * SuperAgent Browser Extension — Backend API Client
 * Connects to http://localhost:1469 via HTTP IPC & WebSocket Event Hub
 */

import { ServerConfig, AuthState, ModelOption } from '../shared/types.js';
import { ExtensionSessionStore } from '../shared/session-store.js';

export type EventCallback = (event: {
  channel: string;
  data: any;
}) => void;

export type ConnectionCallback = (connected: boolean) => void;

export class ExtensionApiClient {
  private ws: WebSocket | null = null;
  private wsListeners: Set<EventCallback> = new Set();
  private connectionListeners: Set<ConnectionCallback> = new Set();
  private reconnectTimer: any = null;

  public onConnectionChange(listener: ConnectionCallback): () => void {
    this.connectionListeners.add(listener);
    return () => this.connectionListeners.delete(listener);
  }

  private notifyConnectionChange(connected: boolean): void {
    this.connectionListeners.forEach((fn) => fn(connected));
  }

  private async getBaseUrl(): Promise<string> {
    const config = await ExtensionSessionStore.getServerConfig();
    return config.baseUrl.replace(/\/+$/, '');
  }

  private async getHeaders(): Promise<Record<string, string>> {
    const token = await ExtensionSessionStore.getAuthToken();
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    return headers;
  }

  public async checkHealth(): Promise<boolean> {
    try {
      const baseUrl = await this.getBaseUrl();
      const res = await fetch(`${baseUrl}/api/health`, {
        signal: AbortSignal.timeout(2000)
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  public async getAuthStatus(): Promise<AuthState> {
    try {
      const baseUrl = await this.getBaseUrl();
      const headers = await this.getHeaders();
      const res = await fetch(`${baseUrl}/api/auth/status`, {
        headers,
        signal: AbortSignal.timeout(2500)
      });

      if (res.status === 401) {
        return {
          connected: true,
          authenticated: false,
          authRequired: true,
          lastChecked: Date.now()
        };
      }

      if (!res.ok) {
        return {
          connected: false,
          authenticated: false,
          authRequired: false,
          lastChecked: Date.now(),
          error: `HTTP ${res.status}: ${res.statusText}`
        };
      }

      const data = await res.json();
      return {
        connected: true,
        authenticated: Boolean(data.authenticated),
        authRequired: Boolean(data.authRequired),
        username: data.ownerName || 'admin',
        lastChecked: Date.now()
      };
    } catch (err: any) {
      return {
        connected: false,
        authenticated: false,
        authRequired: false,
        lastChecked: Date.now(),
        error: err?.message || 'Server unreachable'
      };
    }
  }

  public async login(password: string): Promise<{ success: boolean; token?: string; error?: string }> {
    try {
      const baseUrl = await this.getBaseUrl();
      const res = await fetch(`${baseUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
        signal: AbortSignal.timeout(3000)
      });

      const data = await res.json().catch(() => ({}));
      if (res.ok && data.ok) {
        if (data.token) {
          await ExtensionSessionStore.setAuthToken(data.token);
        }
        await ExtensionSessionStore.setAuthState({
          connected: true,
          authenticated: true,
          authRequired: true,
          token: data.token,
          lastChecked: Date.now()
        });
        this.connectWebSocket();
        return { success: true, token: data.token };
      }
      return { success: false, error: data.error || 'Authentication failed' };
    } catch (err: any) {
      return { success: false, error: err?.message || 'Failed to reach SuperAgent server' };
    }
  }

  public async logout(): Promise<void> {
    try {
      const baseUrl = await this.getBaseUrl();
      const headers = await this.getHeaders();
      await fetch(`${baseUrl}/api/auth/logout`, {
        method: 'POST',
        headers,
        signal: AbortSignal.timeout(2000)
      });
    } catch {}
    await ExtensionSessionStore.clearAuthToken();
    await ExtensionSessionStore.setAuthState({
      connected: true,
      authenticated: false,
      authRequired: true,
      lastChecked: Date.now()
    });
    this.disconnectWebSocket();
  }

  public async invokeIpc<T = any>(channel: string, ...args: any[]): Promise<T> {
    const baseUrl = await this.getBaseUrl();
    const headers = await this.getHeaders();

    const res = await fetch(`${baseUrl}/api/ipc/${channel}`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ args })
    });

    if (res.status === 401) {
      await ExtensionSessionStore.setAuthState({
        connected: true,
        authenticated: false,
        authRequired: true,
        lastChecked: Date.now()
      });
      throw new Error('Unauthorized: Session expired or invalid password');
    }

    if (!res.ok) {
      const errPayload = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(errPayload.error || `HTTP ${res.status}: ${res.statusText}`);
    }

    const json = await res.json();
    return json.data as T;
  }

  public async fetchModels(): Promise<{
    models: ModelOption[];
    selectedModel: string;
    hasConnectedProviders: boolean;
    emptyStateMessage: string | null;
  }> {
    try {
      // 1. Fetch settings from settings-read
      const settings = await this.invokeIpc<any>('settings-read');
      const rawModels: any[] = Array.isArray(settings?.models) ? settings.models : [];
      const providers: any[] = Array.isArray(settings?.providers) ? settings.providers : [];
      const orchestratorEnabled = settings?.orchestrator?.enabled !== false;
      const lastUsedModelName = settings?.lastUsedModel?.model || '';

      const connectedProviderIds = new Set(
        providers.filter((p: any) => p.apiKey || p.type === 'env').map((p: any) => p.id)
      );

      let modelList: ModelOption[] = [];

      if (rawModels.length > 0) {
        modelList = rawModels.map((m: any) => ({
          id: m.id,
          name: m.name || m.id,
          provider: m.providerId || 'openai',
          contextWindow: m.contextLimit,
          isFree: Boolean(m.pricing?.inputPer1M === '0' || m.type === 'free'),
          enabled: m.enabled !== false,
          description: m.description
        }));
      } else {
        // Fallback: try store-read
        const store = await this.invokeIpc<any>('store-read').catch(() => null);
        const catalog = Array.isArray(store?.modelsCatalog) ? store.modelsCatalog : [];
        if (catalog.length > 0) {
          modelList = catalog.map((m: any) => ({
            id: m.id,
            name: m.name || m.id,
            provider: m.providerId || 'openai',
            contextWindow: m.contextLimit,
            isFree: Boolean(m.pricing?.inputPer1M === '0'),
            enabled: m.enabled !== false,
            description: m.description
          }));
        }
      }

      // Filter for enabled models only
      const enabledModels = modelList.filter((m) => m.enabled);
      const hasAnyModel = modelList.length > 0;
      const hasConnectedProviders = connectedProviderIds.size > 0 || hasAnyModel;

      let emptyStateMessage: string | null = null;
      if (enabledModels.length === 0) {
        if (hasAnyModel) {
          emptyStateMessage = 'You’re connected — enable a model in Settings → Models to begin.';
        } else {
          emptyStateMessage = 'Connect a provider in Settings → Providers, and we’re ready to chat.';
        }
      }

      const finalModels: ModelOption[] = [];

      // If multiple models enabled and orchestrator is on, add Orchestrator at the top
      if (enabledModels.length > 1 && orchestratorEnabled) {
        finalModels.push({
          id: 'Orchestrator',
          name: 'Orchestrator',
          provider: 'auto',
          isAutoRoute: true,
          description: 'Auto-routes each request to the best model'
        });
      }

      finalModels.push(...enabledModels);

      // Determine default selected model
      let selectedModel = '';
      if (lastUsedModelName && finalModels.some((m) => m.name === lastUsedModelName || m.id === lastUsedModelName)) {
        selectedModel = lastUsedModelName;
      } else if (finalModels.length > 0) {
        selectedModel = finalModels[0].id === 'Orchestrator' ? 'Orchestrator' : (finalModels[0].name || finalModels[0].id);
      }

      return {
        models: finalModels,
        selectedModel,
        hasConnectedProviders,
        emptyStateMessage
      };
    } catch (err) {
      console.warn('[ApiClient] Failed to fetch real models from backend:', err);
      return {
        models: [],
        selectedModel: '',
        hasConnectedProviders: false,
        emptyStateMessage: 'Could not connect to SuperAgent server to load models.'
      };
    }
  }

  // ─── WebSocket Connection for Realtime Streaming ───────────────────────────

  private connectPromise: Promise<void> | null = null;

  public async connectWebSocket(): Promise<void> {
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return;
    }
    if (this.connectPromise) {
      return this.connectPromise;
    }

    this.connectPromise = (async () => {
      try {
        const auth = await this.getAuthStatus();
        if (!auth.connected) {
          this.notifyConnectionChange(false);
          this.scheduleReconnect();
          return;
        }

        if (!auth.authenticated && auth.authRequired) {
          await ExtensionSessionStore.clearAuthToken();
          this.disconnectWebSocket();
          return;
        }

        const baseUrl = await this.getBaseUrl();
        const token = await ExtensionSessionStore.getAuthToken();
        if (auth.authRequired && !token) {
          return;
        }

        // Clean up any existing stale socket
        if (this.ws) {
          try {
            this.ws.onmessage = null;
            this.ws.onopen = null;
            this.ws.onclose = null;
            this.ws.onerror = null;
            this.ws.close();
          } catch {}
          this.ws = null;
        }

        const wsUrl = baseUrl.replace(/^http/, 'ws') + '/api/ws' + (token ? `?token=${encodeURIComponent(token)}` : '');

        const ws = new WebSocket(wsUrl);
        this.ws = ws;

        ws.onopen = () => {
          if (this.ws !== ws) return;
          console.log('[ApiClient] WebSocket connected to SuperAgent server');
          this.notifyConnectionChange(true);
        };

        ws.onmessage = (event) => {
          if (this.ws !== ws) return;
          try {
            const parsed = JSON.parse(event.data);
            this.wsListeners.forEach((fn) => fn(parsed));
          } catch (e) {
            console.warn('[ApiClient] Failed to parse WebSocket payload:', event.data);
          }
        };

        ws.onclose = () => {
          if (this.ws === ws) {
            this.ws = null;
            this.notifyConnectionChange(false);
            this.scheduleReconnect();
          }
        };

        ws.onerror = () => {
          if (this.ws === ws) {
            this.notifyConnectionChange(false);
            try { ws.close(); } catch {}
          }
        };
      } catch {
        this.notifyConnectionChange(false);
        this.scheduleReconnect();
      } finally {
        this.connectPromise = null;
      }
    })();

    return this.connectPromise;
  }

  public disconnectWebSocket(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      try {
        this.ws.onmessage = null;
        this.ws.onopen = null;
        this.ws.onclose = null;
        this.ws.onerror = null;
        this.ws.close();
      } catch {}
      this.ws = null;
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connectWebSocket();
    }, 5000);
  }

  public onWebSocketEvent(listener: EventCallback): () => void {
    this.wsListeners.add(listener);
    return () => this.wsListeners.delete(listener);
  }
}

export const apiClient = new ExtensionApiClient();
