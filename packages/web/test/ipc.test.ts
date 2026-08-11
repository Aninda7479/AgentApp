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

describe('web IPC handler — triggers channels', () => {
  it('implements triggers-create, triggers-list, triggers-toggle, triggers-run-now, and triggers-remove', async () => {
    // 1. Create a trigger
    const createRes = mockRes();
    await handleIpc(
      mockReq('triggers-create', {
        args: [
          {
            name: 'Test Trigger IPC',
            type: 'cron',
            enabled: true,
            cronExpression: '0 9 * * 1-5',
            prompt: 'Test Prompt'
          }
        ]
      }),
      createRes
    );
    expect(createRes.statusCode).toBe(200);
    const createdTrigger = createRes.body.data;
    expect(createdTrigger).toBeDefined();
    expect(createdTrigger.id).toBeDefined();
    expect(createdTrigger.name).toBe('Test Trigger IPC');

    const triggerId = createdTrigger.id;

    // 2. List triggers to verify it was added
    const listRes = mockRes();
    await handleIpc(mockReq('triggers-list', { args: [] }), listRes);
    expect(listRes.statusCode).toBe(200);
    expect(Array.isArray(listRes.body.data)).toBe(true);
    const found = listRes.body.data.find((t: any) => t.id === triggerId);
    expect(found).toBeDefined();
    expect(found.name).toBe('Test Trigger IPC');
    expect(found.enabled).toBe(true);

    // 3. Toggle the trigger (disable it)
    const toggleRes = mockRes();
    await handleIpc(
      mockReq('triggers-toggle', {
        args: [
          {
            id: triggerId,
            enabled: false
          }
        ]
      }),
      toggleRes
    );
    expect(toggleRes.statusCode).toBe(200);
    expect(toggleRes.body.data.enabled).toBe(false);

    // 4. Run the trigger now
    const runRes = mockRes();
    await handleIpc(mockReq('triggers-run-now', { args: [triggerId] }), runRes);
    expect(runRes.statusCode).toBe(200);
    expect(runRes.body.data.success).toBe(true);
    expect(runRes.body.data.trigger.runCount).toBe(1);

    // 5. Remove the trigger
    const removeRes = mockRes();
    await handleIpc(mockReq('triggers-remove', { args: [triggerId] }), removeRes);
    expect(removeRes.statusCode).toBe(200);
    expect(removeRes.body.data).toBe(true);

    // Verify it is no longer listed
    const listRes2 = mockRes();
    await handleIpc(mockReq('triggers-list', { args: [] }), listRes2);
    expect(listRes2.body.data.find((t: any) => t.id === triggerId)).toBeUndefined();
  });
});

