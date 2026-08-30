import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  installEngine,
  getEngineStatus,
  getApiBaseUrl,
} from './imageService';

describe('imageService', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('resolves API base URL to port 1469 when running on dev port 5173', () => {
    const url = getApiBaseUrl();
    expect(url).toBe('http://localhost:1469');
  });

  it('handles HTML responses gracefully without throwing raw JSON parse error', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      headers: {
        get: (h: string) => (h.toLowerCase() === 'content-type' ? 'text/html; charset=utf-8' : null),
      },
      text: async () => '<!DOCTYPE html><html><body>Error</body></html>',
    } as any);

    await expect(installEngine()).rejects.toThrow(
      /Received HTML response instead of JSON|Ensure SuperAgent Core backend is running/
    );
  });

  it('handles HTTP error statuses with error message extraction', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      headers: {
        get: (h: string) => (h.toLowerCase() === 'content-type' ? 'application/json' : null),
      },
      json: async () => ({ error: 'Hardware backend not supported' }),
      text: async () => JSON.stringify({ error: 'Hardware backend not supported' }),
    } as any);

    await expect(installEngine('cuda')).rejects.toThrow('Hardware backend not supported');
  });

  it('successfully parses valid JSON response on successful installation', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      headers: {
        get: (h: string) => (h.toLowerCase() === 'content-type' ? 'application/json' : null),
      },
      text: async () => JSON.stringify({ success: true, message: 'Engine installation started' }),
    } as any);

    const res = await installEngine('vulkan');
    expect(res).toEqual({ success: true, message: 'Engine installation started' });
    expect(globalThis.fetch).toHaveBeenCalledWith(
      'http://localhost:1469/api/images/engine/install',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ backend: 'vulkan' }),
      })
    );
  });

  it('returns default fallback status if engine status fetch fails', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('Network offline'));

    const status = await getEngineStatus();
    expect(status).toEqual({
      installed: false,
      is_running: false,
      is_downloading: false,
    });
  });
});
