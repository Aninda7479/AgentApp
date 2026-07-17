import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { handleProviderProxy } from '../src/server.js';
import http from 'http';
import type { AddressInfo } from 'net';

/**
 * Unit-tests the server-side provider connectivity proxy in isolation (the
 * module is importable in tests because `server.listen` is skipped when
 * NODE_ENV=test). The web/VPS build reuses the desktop renderer, whose "Test &
 * Connect" flow calls provider APIs directly — which the browser blocks via
 * CORS. This handler forwards those calls server-side and returns a normalized
 * envelope. We exercise it against a local server (forwarding + envelope shape +
 * error surfacing) and assert the SSRF/input guards reject bad targets.
 */

function mockReq(body: any) {
  return { body, params: {}, headers: {} } as any;
}

function mockRes() {
  const res: any = {
    statusCode: 200,
    body: undefined,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(obj: any) {
      this.body = obj;
      return this;
    },
  };
  return res;
}

let localServer: http.Server;
let baseUrl: string;

beforeAll(async () => {
  localServer = http.createServer((req, res) => {
    if (req.url === '/models') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ data: [{ id: 'gpt-4o', name: 'gpt-4o' }] }));
      return;
    }
    if (req.url === '/boom') {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'internal' }));
      return;
    }
    if (req.url === '/text') {
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end('not-json');
      return;
    }
    res.writeHead(404);
    res.end();
  });
  await new Promise<void>((resolve) => localServer.listen(0, resolve));
  const { port } = localServer.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => localServer.close(() => resolve()));
});

describe('handleProviderProxy — input / SSRF guards', () => {
  it('rejects a missing url with 400', async () => {
    const res = mockRes();
    await handleProviderProxy(mockReq({}), res);
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toMatch(/url/i);
  });

  it('rejects a non-URL string with 400', async () => {
    const res = mockRes();
    await handleProviderProxy(mockReq({ url: 'not a url' }), res);
    expect(res.statusCode).toBe(400);
  });

  it('rejects non-http(s) protocols with 400', async () => {
    const res = mockRes();
    await handleProviderProxy(mockReq({ url: 'ftp://example.com/models' }), res);
    expect(res.statusCode).toBe(400);
  });

  it('rejects cloud-metadata link-local hosts (SSRF guard) with 400', async () => {
    const res = mockRes();
    await handleProviderProxy(mockReq({ url: 'http://169.254.169.254/latest/meta-data/' }), res);
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toMatch(/link-local|metadata/i);
  });
});

describe('handleProviderProxy — forwarding', () => {
  it('forwards to a provider endpoint and returns the normalized envelope', async () => {
    const res = mockRes();
    await handleProviderProxy(
      mockReq({ method: 'GET', url: `${baseUrl}/models`, headers: { Authorization: 'Bearer x' } }),
      res
    );
    expect(res.statusCode).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.status).toBe(200);
    expect(res.body.data.data[0].id).toBe('gpt-4o');
  });

  it('surfaces a non-2xx upstream status (ok:false) rather than throwing', async () => {
    const res = mockRes();
    await handleProviderProxy(mockReq({ url: `${baseUrl}/boom` }), res);
    expect(res.statusCode).toBe(200);
    expect(res.body.ok).toBe(false);
    expect(res.body.status).toBe(500);
  });

  it('keeps non-JSON bodies intact', async () => {
    const res = mockRes();
    await handleProviderProxy(mockReq({ url: `${baseUrl}/text` }), res);
    expect(res.body.ok).toBe(true);
    expect(res.body.data).toBe('not-json');
  });
});
