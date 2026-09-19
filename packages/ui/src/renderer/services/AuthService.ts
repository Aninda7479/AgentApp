import { getStoredAuthToken, setStoredAuthToken, reconnectWebSocket, disconnectWebSocket, getIpc } from '../lib/ipc';

export interface AuthStatus {
  authenticated: boolean;
  authRequired: boolean;
  passwordSet: boolean;
  ownerName?: string | null;
  user?: string | null;
  version?: string;
  isLockedOut?: boolean;
  backendConnected?: boolean;
}

function getApiBaseUrl(): string {
  if (typeof window !== 'undefined') {
    if (window.location && window.location.port && window.location.port !== '5173') {
      return window.location.origin;
    }
  }
  return 'http://localhost:1469';
}

type AuthListener = (status: AuthStatus) => void;

class AuthServiceClass {
  private currentStatus: AuthStatus = {
    authenticated: false,
    authRequired: true,
    passwordSet: false,
    ownerName: null,
    user: null,
  };
  private listeners = new Set<AuthListener>();
  private checkInFlight: Promise<AuthStatus> | null = null;

  public getStatus(): AuthStatus {
    return { ...this.currentStatus };
  }

  public setOwnerName(name: string | null): void {
    this.currentStatus.ownerName = name ? name.trim() : null;
    this.notify();
  }

  public subscribe(listener: AuthListener): () => void {
    this.listeners.add(listener);
    listener(this.getStatus());
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify() {
    const status = this.getStatus();
    this.listeners.forEach((listener) => {
      try {
        listener(status);
      } catch (err) {
        console.error('[AuthService] Listener error:', err);
      }
    });
  }

  private async resolveOwnerNameFromSettings(): Promise<string | null> {
    try {
      const ipc = getIpc();
      if (!ipc) return null;
      interface SettingsOwnerFallback {
        general?: { ownerName?: string; hostOwnerName?: string };
        ownerName?: string;
        webApp?: { ownerName?: string };
        branding?: { ownerName?: string };
        hostOwnerName?: string;
      }
      const settings = (await ipc.invoke('settings-read')) as SettingsOwnerFallback | null | undefined;
      if (!settings) return null;
      const owner =
        settings.general?.ownerName ||
        settings.ownerName ||
        settings.webApp?.ownerName ||
        settings.branding?.ownerName ||
        settings.general?.hostOwnerName ||
        settings.hostOwnerName;
      if (typeof owner === 'string' && owner.trim().length > 0) {
        return owner.trim();
      }
    } catch {
      /* ignore */
    }
    return null;
  }

  public async checkStatus(): Promise<AuthStatus> {
    if (this.checkInFlight) {
      return this.checkInFlight;
    }

    this.checkInFlight = (async () => {
      const token = getStoredAuthToken();
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      try {
        const res = await fetch(`${getApiBaseUrl()}/api/auth/status`, {
          method: 'GET',
          headers,
          credentials: 'include',
        });

        if (res.ok) {
          const data = await res.json();
          let owner = data.ownerName ?? null;
          if (!owner) {
            owner = await this.resolveOwnerNameFromSettings();
          }
          this.currentStatus = {
            authenticated: Boolean(data.authenticated),
            authRequired: Boolean(data.authRequired),
            passwordSet: Boolean(data.passwordSet),
            ownerName: owner,
            user: data.user ?? null,
            version: data.version,
            backendConnected: true,
          };
        } else {
          // Fallback if rejected (e.g. 401 unauthenticated with invalid token)
          const owner = await this.resolveOwnerNameFromSettings();
          this.currentStatus = {
            authenticated: false,
            authRequired: true,
            passwordSet: true,
            ownerName: owner || this.currentStatus.ownerName,
            backendConnected: true,
          };
        }
      } catch {
        // Backend offline or unreachable - check IPC settings directly
        const owner = await this.resolveOwnerNameFromSettings();
        this.currentStatus = {
          authenticated: false,
          authRequired: true,
          // Guard: Never assume password is unset if the backend is offline/unreachable.
          // Setting this to false causes the UI to render the master password setup wizard.
          passwordSet: true,
          ownerName: owner || this.currentStatus.ownerName,
          backendConnected: false,
        };
      } finally {
        this.checkInFlight = null;
        this.notify();
      }

      return this.getStatus();
    })();

    return this.checkInFlight;
  }

  /**
   * Fast health probe to verify if the SuperAgent core daemon on port 1469 is reachable.
   */
  public async checkHealth(timeoutMs = 2000): Promise<boolean> {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
      const res = await fetch(`${getApiBaseUrl()}/api/health`, {
        method: 'GET',
        cache: 'no-store',
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      return res.ok;
    } catch {
      return false;
    }
  }

  /**
   * Periodically re-checks status during startup so that as soon as the Core daemon
   * finishes booting (e.g. in the 3s loading screen), authStatus is fully resolved.
   */
  public async checkStatusWithRetry(retries = 4, delayMs = 500): Promise<AuthStatus> {
    let s = await this.checkStatus();
    for (let i = 0; i < retries; i++) {
      if (s.version) {
        break;
      }
      await new Promise((r) => setTimeout(r, delayMs));
      s = await this.checkStatus();
    }
    return s;
  }

  public async setup(password: string, username = 'admin'): Promise<{ ok: boolean; token?: string; error?: string }> {
    try {
      const res = await fetch(`${getApiBaseUrl()}/api/auth/setup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ username, password }),
      });

      const data = await res.json().catch(() => ({}));
      if (res.ok && data.token) {
        setStoredAuthToken(data.token);
        this.currentStatus = {
          authenticated: true,
          authRequired: true,
          passwordSet: true,
          user: username,
        };
        this.notify();
        reconnectWebSocket();
        return { ok: true, token: data.token };
      }

      return {
        ok: false,
        error: data.error || 'Failed to setup master password.',
      };
    } catch (err: any) {
      return {
        ok: false,
        error: err?.message || 'Network error communicating with server.',
      };
    }
  }

  public async login(password: string, username = 'admin'): Promise<{ ok: boolean; token?: string; error?: string; isLockedOut?: boolean }> {
    try {
      const res = await fetch(`${getApiBaseUrl()}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ username, password }),
      });

      const data = await res.json().catch(() => ({}));
      if (res.ok && data.token) {
        setStoredAuthToken(data.token);
        this.currentStatus = {
          authenticated: true,
          authRequired: true,
          passwordSet: true,
          user: username,
        };
        this.notify();
        reconnectWebSocket();
        return { ok: true, token: data.token };
      }

      const isLockedOut = res.status === 429;
      return {
        ok: false,
        error: data.error || (isLockedOut ? 'Account temporarily locked due to too many failed attempts.' : 'Incorrect password.'),
        isLockedOut,
      };
    } catch (err: any) {
      return {
        ok: false,
        error: err?.message || 'Network error communicating with server.',
      };
    }
  }

  public lock(): void {
    setStoredAuthToken(null);
    disconnectWebSocket();
    this.currentStatus = {
      ...this.currentStatus,
      authenticated: false,
    };
    this.notify();
  }

  public async logout(): Promise<void> {
    const token = getStoredAuthToken();
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;
      await fetch(`${getApiBaseUrl()}/api/auth/logout`, {
        method: 'POST',
        headers,
        credentials: 'include',
      });
    } catch {
      /* ignore */
    } finally {
      this.lock();
    }
  }
}

export const AuthService = new AuthServiceClass();
