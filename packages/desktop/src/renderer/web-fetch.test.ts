import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { browserSafeFetch } from './web-fetch.js';

/**
 * Locks in the web/VPS CORS fix: every settings-screen provider call (model
 * catalog, NVIDIA catalog, connectivity tests) must route through the
 * server-side /api/provider-proxy in the web shell instead of a direct browser
 * fetch that providers block with CORS. In node, `navigator` is undefined so
 * IS_ELECTRON_SHELL is false (web mode) — exactly the path that was broken.
 * We stub `window.fetch` to capture the proxied call and assert the envelope
 * is forwarded and the upstream JSON is adapted back into a Response shape.
 */
describe('browserSafeFetch — web shell proxies through /api/provider-proxy', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal(
      'window',
      {
        fetch: fetchMock
      }
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const proxyResponse = (payload: unknown) => ({
    ok: true,
    status: 200,
    statusText: 'OK',
    json: async () => payload
  });

  it('forwards method, url and headers to the proxy and adapts the data envelope', async () => {
    fetchMock.mockResolvedValue(
      proxyResponse({ ok: true, status: 200, statusText: 'OK', data: [{ id: 'gpt-4o' }] })
    );

    const res = await browserSafeFetch('https://api.openai.com/v1/models', {
      headers: { Authorization: 'Bearer x' }
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [proxyUrl, init] = fetchMock.mock.calls[0];
    expect(proxyUrl).toBe('/api/provider-proxy');
    const body = JSON.parse(init.body);
    expect(body.url).toBe('https://api.openai.com/v1/models');
    expect(body.method).toBe('GET');
    expect(body.headers).toEqual({ Authorization: 'Bearer x' });

    expect(res.ok).toBe(true);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([{ id: 'gpt-4o' }]);
  });

  it('defaults to GET when no method is supplied', async () => {
    fetchMock.mockResolvedValue(proxyResponse({ ok: true, status: 200, data: {} }));
    await browserSafeFetch('https://build.nvidia.com/models');
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.method).toBe('GET');
  });

  it('throws when the proxy returns an error payload (e.g. SSRF guard)', async () => {
    fetchMock.mockResolvedValue(
      proxyResponse({ error: 'provider-proxy cannot target link-local (cloud-metadata) hosts.' })
    );
    await expect(browserSafeFetch('https://api.openai.com/v1/models')).rejects.toThrow(/link-local/);
  });

  it('propagates non-2xx upstream as ok:false rather than throwing', async () => {
    fetchMock.mockResolvedValue(
      proxyResponse({ ok: false, status: 401, statusText: 'Unauthorized', data: { error: 'no key' } })
    );
    const res = await browserSafeFetch('https://api.openai.com/v1/models');
    expect(res.ok).toBe(false);
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'no key' });
  });
});
