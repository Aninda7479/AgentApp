/**
 * Tests for the preload bridge (../preload/preload).
 *
 * Verifies the frozen `window.superagent` API is exposed via contextBridge and
 * that: (1) every channel the renderer may invoke/send is validated against the
 * allowlist, (2) `on` strips the Electron event before calling the listener and
 * returns an unsubscribe fn, (3) only functions (never raw ipcRenderer/shell)
 * are exposed.
 */
import { describe, it, expect, vi } from 'vitest';

function loadPreload() {
  const exposed: Record<string, any> = {};
  const contextBridge = {
    exposeInMainWorld: (key: string, api: any) => {
      // The real Electron contextBridge freezes the exposed object.
      Object.freeze(api);
      exposed[key] = api;
    },
  };
  const ipcRenderer = {
    invoke: vi.fn(async (ch: string) => 'inv:' + ch),
    send: vi.fn(),
    on: vi.fn((_ch: string, _fn: any) => {}),
    off: vi.fn(),
  };
  vi.resetModules();
  vi.doMock('electron', () => ({ contextBridge, ipcRenderer }));
  return { exposed, ipcRenderer };
}

describe('preload bridge', () => {
  it('exposes a frozen window.superagent with ipc/shell/loop', async () => {
    const { exposed } = loadPreload();
    await import('../preload/preload.js');
    expect(exposed.superagent).toBeDefined();
    expect(typeof exposed.superagent.isElectron).toBe('boolean');
    expect(typeof exposed.superagent.ipc.invoke).toBe('function');
    expect(typeof exposed.superagent.ipc.send).toBe('function');
    expect(typeof exposed.superagent.ipc.on).toBe('function');
    expect(typeof exposed.superagent.ipc.off).toBe('function');
    expect(typeof exposed.superagent.shell.openPath).toBe('function');
    expect(typeof exposed.superagent.loop.read).toBe('function');
    expect(Object.isFrozen(exposed.superagent)).toBe(true);
  });

  it('invoke delegates to ipcRenderer.invoke for allowlisted channels', async () => {
    const { exposed, ipcRenderer } = loadPreload();
    await import('../preload/preload.js');
    const res = await exposed.superagent.ipc.invoke('settings-read');
    expect(ipcRenderer.invoke).toHaveBeenCalledWith('settings-read');
    expect(res).toBe('inv:settings-read');
  });

  it('throws for channels not in the allowlist', async () => {
    const { exposed } = loadPreload();
    await import('../preload/preload.js');
    expect(() => exposed.superagent.ipc.invoke('evil-channel')).toThrow(/allowlist/);
    expect(() => exposed.superagent.ipc.send('evil-channel')).toThrow(/allowlist/);
  });

  it('on strips the event object and returns an unsubscribe fn', async () => {
    const { exposed, ipcRenderer } = loadPreload();
    await import('../preload/preload.js');
    const listener = vi.fn();
    const unsub = exposed.superagent.ipc.on('circle-search-submit', listener);
    // The ipcRenderer.on was registered with a wrapper.
    const wrapper = ipcRenderer.on.mock.calls[0][1];
    wrapper({ /* IpcRendererEvent */ }, 'payload');
    expect(listener).toHaveBeenCalledWith('payload');
    expect(typeof unsub).toBe('function');
    unsub();
    expect(ipcRenderer.off).toHaveBeenCalled();
  });

  it('shell.openPath and loop.read route to main-process handlers', async () => {
    const { exposed, ipcRenderer } = loadPreload();
    await import('../preload/preload.js');
    await exposed.superagent.shell.openPath('/tmp/x');
    expect(ipcRenderer.invoke).toHaveBeenCalledWith('shell-open-path', '/tmp/x');
    await exposed.superagent.loop.read('/ws');
    expect(ipcRenderer.invoke).toHaveBeenCalledWith('loop-read', '/ws');
  });
});
