/**
 * Tests for the canonical renderer IPC bridge (../lib/electron).
 *
 * The bridge must: route calls through the preload `window.superagent` API,
 * apply the crash-safe error envelope (report toasts, resolve null on error),
 * and gracefully no-op when neither the bridge nor `window.require` is present.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

function makeSuperagent() {
  return {
    isElectron: true,
    ipc: {
      invoke: vi.fn(async (ch: string, ..._a: any[]) => ({ ok: true, ch })),
      send: vi.fn(),
      on: vi.fn((_ch: string, _fn: any) => () => {}),
      off: vi.fn(),
    },
    shell: { openPath: vi.fn(async () => '') },
    loop: { read: vi.fn(async () => null) },
  };
}

describe('renderer/lib/electron bridge', () => {
  const realWindow = (globalThis as any).window;
  const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

  beforeEach(() => {
    (globalThis as any).window = {} as any;
  });
  afterEach(() => {
    (globalThis as any).window = realWindow;
    consoleError.mockClear();
  });

  it('invokes through the preload superagent API', async () => {
    const sa = makeSuperagent();
    (globalThis as any).window = { superagent: sa } as any;
    const { invoke } = await import('../lib/electron');
    const res = await invoke('settings-read', 1, 2);
    expect(sa.ipc.invoke).toHaveBeenCalledWith('settings-read', 1, 2);
    expect(res).toEqual({ ok: true, ch: 'settings-read' });
  });

  it('reports and resolves null on the __ipcError envelope', async () => {
    const sa = makeSuperagent();
    sa.ipc.invoke = vi.fn(async () => ({ __ipcError: true, error: 'boom', channel: 'x' }));
    (globalThis as any).window = { superagent: sa } as any;
    const { invoke } = await import('../lib/electron');
    const res = await invoke('x');
    expect(res).toBeNull();
    expect(consoleError).toHaveBeenCalled();
  });

  it('reports { ok: false, error } but still returns the object', async () => {
    const sa = makeSuperagent();
    sa.ipc.invoke = vi.fn(async () => ({ ok: false, error: 'nope' }));
    (globalThis as any).window = { superagent: sa } as any;
    const { invoke } = await import('../lib/electron');
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
    const { invoke } = await import('../lib/electron');
    expect(await invoke('z')).toBeNull();
    expect(consoleError).toHaveBeenCalled();
  });

  it('send/on/off delegate to the bridge', async () => {
    const sa = makeSuperagent();
    (globalThis as any).window = { superagent: sa } as any;
    const { send, on, off } = await import('../lib/electron');
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
    const { openExternalPath, readLoopPrompt } = await import('../lib/electron');
    await openExternalPath('/tmp/x');
    expect(sa.shell.openPath).toHaveBeenCalledWith('/tmp/x');
    await readLoopPrompt('/ws');
    expect(sa.loop.read).toHaveBeenCalledWith('/ws');
  });

  it('degrades gracefully when no bridge and no window.require', async () => {
    (globalThis as any).window = {} as any;
    const { invoke, getIpc } = await import('../lib/electron');
    expect(await invoke('settings-read')).toBeNull();
    expect(getIpc()).toBeNull();
    expect(consoleError).toHaveBeenCalled();
  });

  it('legacy shim falls back to window.require when bridge absent', async () => {
    const fakeIpc = { invoke: vi.fn(async () => 'legacy'), send: vi.fn(), on: vi.fn(), off: vi.fn() };
    (globalThis as any).window = { require: () => ({ ipcRenderer: fakeIpc }) } as any;
    const { invoke, getIpc } = await import('../lib/electron');
    expect(await invoke('settings-read')).toBe('legacy');
    expect(getIpc()).not.toBeNull();
  });
});
