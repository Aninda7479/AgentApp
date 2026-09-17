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

describe('renderer/lib/ipc helpers', () => {
  describe('isSafeEmptyChannel', () => {
    it('returns true for canonical kebab entries', async () => {
      const { isSafeEmptyChannel } = await import('../lib/ipc.js');
      expect(isSafeEmptyChannel('skills-catalog')).toBe(true);
      expect(isSafeEmptyChannel('mcp-catalog')).toBe(true);
      expect(isSafeEmptyChannel('plugins-catalog')).toBe(true);
      expect(isSafeEmptyChannel('kanban-load')).toBe(true);
      expect(isSafeEmptyChannel('ollama-installed-models')).toBe(true);
    });

    it('returns true for snake_case variants of catalog channels', async () => {
      const { isSafeEmptyChannel } = await import('../lib/ipc.js');
      expect(isSafeEmptyChannel('skills_catalog')).toBe(true);
      expect(isSafeEmptyChannel('mcp_catalog')).toBe(true);
      expect(isSafeEmptyChannel('plugins_catalog')).toBe(true);
    });

    it('returns false for non-catalog channels', async () => {
      const { isSafeEmptyChannel } = await import('../lib/ipc.js');
      expect(isSafeEmptyChannel('agent-run')).toBe(false);
      expect(isSafeEmptyChannel('settings-read')).toBe(false);
      expect(isSafeEmptyChannel('')).toBe(false);
    });
  });

  describe('isSilentIpcChannel', () => {
    it('returns true for known silent kebab entries', async () => {
      const { isSilentIpcChannel } = await import('../lib/ipc.js');
      expect(isSilentIpcChannel('settings-read')).toBe(true);
      expect(isSilentIpcChannel('system-info')).toBe(true);
      expect(isSilentIpcChannel('skills-catalog')).toBe(true);
      expect(isSilentIpcChannel('check-for-updates')).toBe(true);
    });

    it('returns true for snake_case variants', async () => {
      const { isSilentIpcChannel } = await import('../lib/ipc.js');
      expect(isSilentIpcChannel('settings_read')).toBe(true);
      expect(isSilentIpcChannel('system_info')).toBe(true);
      expect(isSilentIpcChannel('skills_catalog')).toBe(true);
    });

    it('returns false for noisy channels', async () => {
      const { isSilentIpcChannel } = await import('../lib/ipc.js');
      expect(isSilentIpcChannel('agent-run')).toBe(false);
      expect(isSilentIpcChannel('chat-generate-title')).toBe(false);
      expect(isSilentIpcChannel('')).toBe(false);
    });
  });

  describe('toTauriCommand', () => {
    it('resolves explicit TAURI_COMMAND_MAP aliases', async () => {
      const { toTauriCommand } = await import('../lib/ipc.js');
      expect(toTauriCommand('system-info')).toBe('get_system_info');
      expect(toTauriCommand('app-version')).toBe('get_app_version');
      expect(toTauriCommand('window-minimize')).toBe('minimize_window');
      expect(toTauriCommand('window-maximize')).toBe('toggle_window_maximize');
      expect(toTauriCommand('window-close')).toBe('close_window');
      expect(toTauriCommand('autostart-status')).toBe('autostart_is_enabled');
      expect(toTauriCommand('overlay-capture-screen')).toBe('circle_search_get_screen_image');
      expect(toTauriCommand('screenshot_screen')).toBe('circle_search_get_screen_image');
      expect(toTauriCommand('ollama-models')).toBe('ollama_installed_models');
    });

    it('falls back to snake_case conversion for simple kebab channels', async () => {
      const { toTauriCommand } = await import('../lib/ipc.js');
      expect(toTauriCommand('skills-catalog')).toBe('skills_catalog');
      expect(toTauriCommand('mcp-catalog')).toBe('mcp_catalog');
      expect(toTauriCommand('kanban-load')).toBe('kanban_load');
    });

    it('passes through already-snake_case channels unchanged', async () => {
      const { toTauriCommand } = await import('../lib/ipc.js');
      expect(toTauriCommand('agent_run')).toBe('agent_run');
      expect(toTauriCommand('store_read')).toBe('store_read');
    });
  });

  describe('isAgentRunChannel / isAgentStopChannel / isSettingsReadChannel', () => {
    it('detects agent-run in both casing styles', async () => {
      const { isAgentRunChannel } = await import('../lib/ipc.js');
      expect(isAgentRunChannel('agent-run')).toBe(true);
      expect(isAgentRunChannel('agent_run')).toBe(true);
      expect(isAgentRunChannel('agent-stop')).toBe(false);
    });

    it('detects agent-stop in both casing styles', async () => {
      const { isAgentStopChannel } = await import('../lib/ipc.js');
      expect(isAgentStopChannel('agent-stop')).toBe(true);
      expect(isAgentStopChannel('agent_stop')).toBe(true);
      expect(isAgentStopChannel('agent-run')).toBe(false);
    });

    it('detects settings-read in both casing styles', async () => {
      const { isSettingsReadChannel } = await import('../lib/ipc.js');
      expect(isSettingsReadChannel('settings-read')).toBe(true);
      expect(isSettingsReadChannel('settings_read')).toBe(true);
      expect(isSettingsReadChannel('settings-write')).toBe(false);
    });
  });

  describe('buildTauriPayload', () => {
    it('expands an object into multi-key alias payload', async () => {
      const { buildTauriPayload } = await import('../lib/ipc.js');
      const obj = { foo: 'bar' };
      const result = buildTauriPayload(obj);
      expect(result).toBeDefined();
      expect(result?.data).toEqual(obj);
      expect(result?.content).toEqual(obj);
      expect(result?.settings).toEqual(obj);
      expect(result?.payload).toEqual(obj);
      expect((result as Record<string, unknown>)?.foo).toBe('bar');
    });

    it('expands a primitive into a multi-key alias payload', async () => {
      const { buildTauriPayload } = await import('../lib/ipc.js');
      const result = buildTauriPayload('hello');
      expect(result?.id).toBe('hello');
      expect(result?.arg).toBe('hello');
      expect(result?.chatId).toBe('hello');
      expect(result?.data).toBe('hello');
    });

    it('returns undefined when firstArg is undefined', async () => {
      const { buildTauriPayload } = await import('../lib/ipc.js');
      expect(buildTauriPayload(undefined)).toBeUndefined();
    });
  });
});

