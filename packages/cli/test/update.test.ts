import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as childProcess from 'child_process';
import https from 'https';
import { EventEmitter } from 'events';

let latestRedirectUrl = 'https://github.com/Aninda7479/AgentApp/releases/tag/v99.9.9';

vi.mock('https', () => ({
  default: {
    request: (url: any, options: any, callback: any) => {
      const res = new EventEmitter() as any;
      res.headers = { location: latestRedirectUrl };
      res.statusCode = 302;
      if (typeof callback === 'function') callback(res);
      const req = new EventEmitter() as any;
      req.end = vi.fn();
      req.setTimeout = vi.fn();
      return req;
    },
    get: (url: any, options: any, callback: any) => {
      const req = new EventEmitter() as any;
      req.end = vi.fn();
      req.setTimeout = vi.fn();
      return req;
    },
  },
}));

vi.mock('child_process', async () => {
  const actual = await vi.importActual<typeof import('child_process')>('child_process');
  return {
    ...actual,
    spawnSync: vi.fn(() => ({ status: 0 })),
    execFileSync: vi.fn(() => Buffer.from('v18.0.0')),
  };
});

import { runUpdate } from '../src/commands/update.js';

describe('superagent update command', () => {
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.clearAllMocks();
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    consoleErrorSpy.mockRestore();
  });

  it('runs update check and triggers auto-update script when newer version exists', async () => {
    latestRedirectUrl = 'https://github.com/Aninda7479/AgentApp/releases/tag/v99.9.9';
    const spawnSyncSpy = vi.spyOn(childProcess, 'spawnSync').mockReturnValue({ status: 0 } as any);

    await runUpdate();

    expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('New version available: v99.9.9'));
    expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Automatically running install script to self update…'));
    expect(spawnSyncSpy).toHaveBeenCalled();
    const callArgs = spawnSyncSpy.mock.calls[0];
    const isWin = process.platform === 'win32';
    expect(callArgs[0]).toBe(isWin ? 'powershell.exe' : 'sh');
    expect(callArgs[2]).toEqual(expect.objectContaining({
      env: expect.objectContaining({ FORCE: '1' }),
    }));
    expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('SuperAgent successfully updated to v99.9.9!'));
  });

  it('displays manual options if auto-update script returns error code', async () => {
    latestRedirectUrl = 'https://github.com/Aninda7479/AgentApp/releases/tag/v99.9.9';
    vi.spyOn(childProcess, 'spawnSync').mockReturnValue({ status: 1 } as any);

    await runUpdate();

    expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('Automatic update script exited with code 1.'));
    expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Manual update fallback options:'));
  });
});
