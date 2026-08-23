/**
 * Tests for the canonical renderer IPC bridge (../lib/ipc).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

function makeSuperagent() {
  return {
    ipc: {
      invoke: vi.fn(async (ch: string, ..._a: any[]) => ({ ok: true, ch })) as any,
      send: vi.fn(),
      on: vi.fn((_ch: string, _fn: any) => () => {}),
      off: vi.fn(),
    },
    shell: { openPath: vi.fn(async () => '') },
    loop: { read: vi.fn(async () => null) },
  };
}

describe('renderer/lib/ipc bridge', () => {
  const realWindow = (globalThis as any).window;
  const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
  const consoleDebug = vi.spyOn(console, 'debug').mockImplementation(() => {});

  beforeEach(() => {
    (globalThis as any).window = {} as any;
  });
  afterEach(() => {
    (globalThis as any).window = realWindow;
    consoleError.mockClear();
    consoleDebug.mockClear();
  });

  it('invokes through the superagent API', async () => {
    const sa = makeSuperagent();
    (globalThis as any).window = { superagent: sa } as any;
    const { invoke } = await import('../lib/ipc.js');
    const res = await invoke('settings-read', 1, 2);
    expect(sa.ipc.invoke).toHaveBeenCalledWith('settings-read', 1, 2);
    expect(res).toEqual({ ok: true, ch: 'settings-read' });
  });

  it('reports and resolves null on the __ipcError envelope', async () => {
    const sa = makeSuperagent();
    sa.ipc.invoke = vi.fn(async () => ({ __ipcError: true, error: 'boom', channel: 'x' }));
    (globalThis as any).window = { superagent: sa } as any;
    const { invoke } = await import('../lib/ipc.js');
    const res = await invoke('x');
    expect(res).toBeNull();
    expect(consoleError).toHaveBeenCalled();
  });

  it('reports { ok: false, error } but still returns the object', async () => {
    const sa = makeSuperagent();
    sa.ipc.invoke = vi.fn(async () => ({ ok: false, error: 'nope' }));
    (globalThis as any).window = { superagent: sa } as any;
    const { invoke } = await import('../lib/ipc.js');
    const res = await invoke('y');
    expect(res).toEqual({ ok: false, error: 'nope' });
    expect(consoleError).toHaveBeenCalled();
  });

  it('catches thrown errors and resolves null', async () => {
    const sa = makeSuperagent();
    sa.ipc.invoke = vi.fn(async () => {
      throw new Error('kaboom');
    });
    (globalThis as any).window = { superagent: sa } as any;
    const { invoke } = await import('../lib/ipc.js');
    expect(await invoke('z')).toBeNull();
    expect(consoleError).toHaveBeenCalled();
  });

  it('send/on/off delegate to the bridge', async () => {
    const sa = makeSuperagent();
    (globalThis as any).window = { superagent: sa } as any;
    const { send, on, off } = await import('../lib/ipc.js');
    const fn = () => {};
    on('circle-search-submit', fn);
    expect(sa.ipc.on).toHaveBeenCalledWith('circle-search-submit', fn);
    off('circle-search-submit', fn);
    expect(sa.ipc.off).toHaveBeenCalledWith('circle-search-submit', fn);
    send('window-close');
    expect(sa.ipc.send).toHaveBeenCalledWith('window-close');
  });

  it('openExternalPath / readLoopPrompt route to the bridge', async () => {
    const sa = makeSuperagent();
    (globalThis as any).window = { superagent: sa } as any;
    const { openExternalPath, readLoopPrompt } = await import('../lib/ipc.js');
    await openExternalPath('/tmp/x');
    expect(sa.shell.openPath).toHaveBeenCalledWith('/tmp/x');
    await readLoopPrompt('/ws');
    expect(sa.loop.read).toHaveBeenCalledWith('/ws');
  });

  it('degrades gracefully when no bridge is present', async () => {
    (globalThis as any).window = {} as any;
    const { invoke, getIpc } = await import('../lib/ipc.js');
    expect(await invoke('settings-read')).toBeNull();
    expect(await getIpc().invoke('settings-read')).toBeNull();
  });
});
