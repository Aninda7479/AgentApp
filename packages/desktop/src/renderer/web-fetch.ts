/**
 * Browser-safe fetch shared by every settings screen that talks to a provider
 * API (Providers, Models, Integrations). The native desktop shell may call
 * provider APIs directly — its renderer fetch is privileged and CORS-exempt.
 * The web build runs the same renderer in a browser, where those calls are blocked
 * by CORS, so we forward the request through the server-side proxy (/api/provider-proxy).
 */
import { getIpc } from './lib/ipc';

export const IS_DESKTOP_SHELL =
  typeof window !== 'undefined' && Boolean((window as any).__TAURI_INTERNALS__ || (window as any).__TAURI__);

export async function browserSafeFetch(url: string, init: RequestInit = {}): Promise<Response> {
  const isLocalUrl = /^(https?:\/\/)?(localhost|127\.0\.0\.1|0\.0\.0\.0|::1)(:\d+)?/i.test(url);
  const isTauri = typeof window !== 'undefined' && Boolean((window as any).__TAURI_INTERNALS__ || (window as any).__TAURI__);

  // If in native desktop shell or local/loopback URLs, direct fetch is CORS-free
  if (isTauri || isLocalUrl) {
    try {
      return await window.fetch(url, init);
    } catch {
      /* fallback */
    }
  }

  // If running with preload provider-proxy bridge
  if (typeof window !== 'undefined' && (window as any).superagent?.ipc) {
    try {
      const payload = await (window as any).superagent.ipc.invoke('provider-proxy', {
        method: init.method ?? 'GET',
        url,
        headers: init.headers ?? {}
      });
      if (payload && typeof payload === 'object') {
        if (payload.error && payload.ok === undefined) {
          throw new Error(payload.error);
        }
        const ok = payload.ok ?? false;
        const status = payload.status ?? (ok ? 200 : 502);
        const statusText = payload.statusText ?? (ok ? 'OK' : 'Bad Gateway');
        const data = payload.data ?? (payload.error ? { error: payload.error } : {});
        return {
          ok,
          status,
          statusText,
          text: async () => (typeof data === 'string' ? data : JSON.stringify(data)),
          json: async () => (typeof data === 'string' ? JSON.parse(data) : data),
        } as unknown as Response;
      }
    } catch {
      /* fallback */
    }
  }

  // Web mode: route cross-origin provider calls through the server-side /api/provider-proxy
  if (!isTauri) {
    let res: Response;
    try {
      res = await window.fetch('/api/provider-proxy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ method: init.method ?? 'GET', url, headers: init.headers ?? {} }),
      });
    } catch (err: any) {
      if (isLocalUrl) {
        try {
          return await window.fetch(url, init);
        } catch {
          /* fallback */
        }
      }
      return {
        ok: false,
        status: 503,
        statusText: 'Fetch Failed',
        text: async () => err?.message || 'Fetch failed',
        json: async () => ({ error: err?.message || 'Fetch failed' })
      } as unknown as Response;
    }

    const payload = await res.json().catch(() => ({} as any));
    if (payload.error && payload.ok === undefined) {
      throw new Error(payload.error);
    }
    const ok = payload.ok ?? false;
    const status = payload.status ?? (ok ? 200 : 502);
    const statusText = payload.statusText ?? (ok ? 'OK' : 'Bad Gateway');
    const data = payload.data ?? (payload.error ? { error: payload.error } : {});
    return {
      ok,
      status,
      statusText,
      text: async () => (typeof data === 'string' ? data : JSON.stringify(data)),
      json: async () => (typeof data === 'string' ? JSON.parse(data) : data),
    } as unknown as Response;
  }

  // Direct fetch fallback for desktop
  try {
    return await window.fetch(url, init);
  } catch (err: any) {
    return {
      ok: false,
      status: 502,
      statusText: 'Bad Gateway',
      text: async () => err?.message || 'Connection failed',
      json: async () => ({ error: err?.message || 'Connection failed' })
    } as unknown as Response;
  }
}
