import { describe, it, expect, afterEach } from 'vitest';
import * as fs from 'fs';
import { join } from 'path';
import {
  type WebServerLock,
  getWebServerLockPath,
  writeWebServerLock,
  readWebServerLock,
  clearWebServerLock,
  isLockAlive,
  WebServerAlreadyRunningError
} from '../src/web-server-lock.js';

const LOCK_PATH = getWebServerLockPath();

const base: WebServerLock = {
  pid: process.pid,
  port: 3000,
  host: '0.0.0.0',
  startedBy: 'cli',
  startedAt: Date.now(),
  heartbeat: Date.now()
};

afterEach(() => {
  try {
    fs.unlinkSync(LOCK_PATH);
  } catch {
    /* already gone */
  }
});

describe('web-server-lock', () => {
  it('reads what it writes and clears', () => {
    expect(readWebServerLock()).toBeNull();
    writeWebServerLock(base);
    const read = readWebServerLock();
    expect(read).not.toBeNull();
    expect(read!.pid).toBe(process.pid);
    expect(read!.port).toBe(3000);
    expect(read!.startedBy).toBe('cli');
    clearWebServerLock();
    expect(readWebServerLock()).toBeNull();
  });

  it('treats a fresh heartbeat as alive', () => {
    expect(isLockAlive({ ...base, heartbeat: Date.now() })).toBe(true);
  });

  it('treats a stale heartbeat as dead (and sweeps the file)', () => {
    writeWebServerLock({ ...base, startedAt: 0, heartbeat: Date.now() - 200_000 });
    expect(isLockAlive(readWebServerLock())).toBe(false);
    // The stale lock file should be reclaimable — startWebServer reads & sweeps it.
    expect(fs.existsSync(LOCK_PATH)).toBe(true);
    clearWebServerLock();
  });

  it('WebServerAlreadyRunningError carries the lock', () => {
    const err = new WebServerAlreadyRunningError(base);
    expect(err.lock.startedBy).toBe('cli');
    expect(err.message).toContain('port 3000');
    expect(err.message).toContain('started by cli');
  });

  it('isLockAlive(null) is false', () => {
    expect(isLockAlive(null)).toBe(false);
  });
});
