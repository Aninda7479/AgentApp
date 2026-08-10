/**
 * Browser-safe fetch shared by every settings screen that talks to a provider
 * API (Providers, Models, Integrations). The desktop Electron shell may call
 * provider APIs (api.anthropic.com, api.openai.com, build.nvidia.com, ...) directly
 * — its renderer fetch is privileged and CORS-exempt. The web/VPS build runs the
 * *same* renderer in a browser, where those calls are blocked by CORS (providers
 * don't send Access-Control-Allow-Origin for browser requests). In the web shell
 * we forward the request through the server-side proxy (/api/provider-proxy),
 * which performs the upstream call server-side and returns a Response-shaped object.
 *
 * Centralised here so the CORS workaround lives in exactly one place and every
 * settings screen routes through it (the earlier fix only patched ProvidersSettings'
 * connection-test call sites and missed the model-catalog + NVIDIA catalog fetches).
 */
import { getIpc } from './lib/electron';

export const IS_ELECTRON_SHELL =
  typeof navigator !== 'undefined' && /electron/i.test(navigator.userAgent || '');

export async function browserSafeFetch(url: string, init: RequestInit = {}): Promise<Response> {
  const ipc = getIpc();
  if (ipc && typeof ipc.invoke === 'function') {
    try {
      const payload = await ipc.invoke('provider-proxy', {
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
    } catch (ipcErr: any) {
      /* fallback to window.fetch if IPC failed */
    }
  }

  if (IS_ELECTRON_SHELL) {
    try {
      return await window.fetch(url, init);
    } catch {
      /* fallback to web proxy if window.fetch failed */
    }
  }

  let res: Response;
  try {
    res = await window.fetch('/api/provider-proxy', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ method: init.method ?? 'GET', url, headers: init.headers ?? {} }),
    });
  } catch (err: any) {
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
