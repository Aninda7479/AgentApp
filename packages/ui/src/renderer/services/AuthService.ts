import { getStoredAuthToken, setStoredAuthToken, reconnectWebSocket, disconnectWebSocket } from '../lib/ipc';

export interface AuthStatus {
  authenticated: boolean;
  authRequired: boolean;
  passwordSet: boolean;
  ownerName?: string | null;
  user?: string | null;
  version?: string;
  isLockedOut?: boolean;
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
          this.currentStatus = {
            authenticated: Boolean(data.authenticated),
            authRequired: Boolean(data.authRequired),
            passwordSet: Boolean(data.passwordSet),
            ownerName: data.ownerName ?? null,
            user: data.user ?? null,
            version: data.version,
          };
        } else {
          // Fallback if rejected (e.g. 401 unauthenticated with invalid token)
          this.currentStatus = {
            authenticated: false,
            authRequired: true,
            passwordSet: true,
          };
        }
      } catch {
        // Backend offline or unreachable
        this.currentStatus = {
          authenticated: false,
          authRequired: true,
          passwordSet: false,
        };
      } finally {
        this.checkInFlight = null;
        this.notify();
      }

      return this.getStatus();
    })();

    return this.checkInFlight;
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
