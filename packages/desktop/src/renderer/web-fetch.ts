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
export const IS_ELECTRON_SHELL =
  typeof navigator !== 'undefined' && /electron/i.test(navigator.userAgent || '');

export async function browserSafeFetch(url: string, init: RequestInit = {}): Promise<Response> {
  if (IS_ELECTRON_SHELL) return window.fetch(url, init);
  const res = await window.fetch('/api/provider-proxy', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify({ method: init.method ?? 'GET', url, headers: init.headers ?? {} }),
  });
  const payload = await res.json().catch(() => ({} as any));
  if (payload.error) throw new Error(payload.error);
  return {
    ok: payload.ok ?? false,
    status: payload.status ?? 502,
    statusText: payload.statusText ?? 'Bad Gateway',
    json: async () => payload.data,
  } as unknown as Response;
}
