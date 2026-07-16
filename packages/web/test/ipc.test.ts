import { describe, it, expect } from 'vitest';
import { handleIpc } from '../src/server.js';

/**
 * Unit-tests the web IPC handler in isolation (the module is importable in tests
 * because `server.listen` is skipped when NODE_ENV=test). Focus: malformed /
 * missing request payloads must yield clear 4xx responses, not an uncaught 500
 * (the previous behavior, where channels dereferenced `args[0].<field>` and
 * threw inside the try).
 */
function mockReq(channel: string, body: any = {}) {
  return { params: { channel }, body, headers: {} } as any;
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
    setHeader() {
      return this;
    },
    sendFile() {
      return this;
    },
    redirect() {
      return this;
    }
  };
  return res;
}

describe('web IPC handler — request validation', () => {
  it('returns 400 with a clear message when a required channel gets no payload', async () => {
    const res = mockRes();
    await handleIpc(mockReq('browser-navigate', {}), res);
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toContain('requires a payload argument');
  });

  it('returns 400 (not 500) when args is present but not an array', async () => {
    const res = mockRes();
    await handleIpc(mockReq('agent-run', { args: 'not-an-array' }), res);
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toContain('requires a payload argument');
  });

  it('returns 404 for an unimplemented channel', async () => {
    const res = mockRes();
    await handleIpc(mockReq('no-such-channel', { args: [] }), res);
    expect(res.statusCode).toBe(404);
    expect(res.body.error).toContain('not implemented');
  });

  it('preserves normal behavior for a valid no-payload channel', async () => {
    const res = mockRes();
    await handleIpc(mockReq('agent-list', { args: [] }), res);
    expect(res.statusCode).toBe(200);
    expect(res.body.data).toEqual({ sessions: [] });
  });
});

describe('web IPC handler — read-file-base64 scoping', () => {
  it('refuses to read a file outside the project root / user-data dir', async () => {
    const res = mockRes();
    await handleIpc(mockReq('read-file-base64', { args: ['/etc/passwd'] }), res);
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toContain('outside the allowed directories');
  });

  it('requires a string path argument', async () => {
    const res = mockRes();
    await handleIpc(mockReq('read-file-base64', { args: [123] }), res);
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toContain('requires a file path argument');
  });

  it('reads a file inside the project root', async () => {
    const res = mockRes();
    await handleIpc(mockReq('read-file-base64', { args: ['package.json'] }), res);
    expect(res.statusCode).toBe(200);
    expect(res.body.data).toMatch(/^data:/);
  });
});
