import * as fs from 'fs';
import * as path from 'path';
import { getUserDataDirectory } from './storage/locations.js';

/**
 * Cross-process lock for the self-hosted **web server** (port 3000).
 *
 * The web server can be launched from three surfaces that share no runtime
 * state — the CLI (`superagent --start-web`), the Desktop app (Settings → Web
 * App), and the standalone `@superagent/web` `npm start`. Only ONE may bind the
 * port at a time, and any surface must be able to stop a server another one
 * started. They coordinate through this single lock file in the shared
 * `~/.superagent` data dir — the same filesystem-lock approach used by
 * `packages/cli/src/auto-improve-lock.ts` (atomic write + PID liveness +
 * timestamp staleness), no daemon or live IPC required.
 *
 * The **web-server process owns the file**: it writes it on ignition, refreshes
 * the heartbeat while alive, and clears it on shutdown. The CLI/Desktop only
 * READ it (to guard "start") and read its PID (to "stop").
 */

/** Who launched the currently-running web server. */
export type WebServerLauncher = 'cli' | 'desktop' | 'standalone';

/** On-disk record describing the live web-server process. */
export interface WebServerLock {
  /** PID of the web-server process that owns the port. */
  pid: number;
  /** Bound TCP port (e.g. 3000). */
  port: number;
  /** Bound interface (e.g. 0.0.0.0). */
  host: string;
  /** Which surface spawned it. */
  startedBy: WebServerLauncher;
  /** When the server first came up (ms epoch). */
  startedAt: number;
  /** Last heartbeat (ms epoch); refreshed periodically by the server. */
  heartbeat: number;
}

/**
 * How long a lock may go without a heartbeat before it's considered stale.
 * The server refreshes every ~30s, so 90s tolerates a couple of missed ticks
 * before another surface is allowed to reclaim the port.
 */
const STALE_MS = 90 * 1000;

/** Absolute path to the shared lock file: `~/.superagent/web-server.lock`. */
export function getWebServerLockPath(): string {
  return path.join(getUserDataDirectory(), 'web-server.lock');
}

/** Reads and parses the lock file, or returns null if absent/unreadable. */
export function readWebServerLock(): WebServerLock | null {
  try {
    const raw = fs.readFileSync(getWebServerLockPath(), 'utf-8');
    const parsed = JSON.parse(raw) as WebServerLock;
    if (typeof parsed?.pid !== 'number') return null;
    return parsed;
  } catch {
    return null;
  }
}

/** Writes (or overwrites) the lock file. Best-effort; never throws. */
export function writeWebServerLock(record: WebServerLock): void {
  try {
    const target = getWebServerLockPath();
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, JSON.stringify(record, null, 2), { mode: 0o644 });
  } catch {
    /* best-effort — a missing lock only weakens the guard, never breaks start */
  }
}

/** Removes the lock file. Idempotent; never throws. */
export function clearWebServerLock(): void {
  try {
    fs.unlinkSync(getWebServerLockPath());
  } catch {
    /* already gone */
  }
}

/**
 * Whether a lock record represents a *live* server.
 *
 * A fresh heartbeat is the portable, authoritative signal across OSes. PID
 * liveness is only a best-effort extra check on POSIX — on Windows
 * `process.kill(pid, 0)` returns success for dead PIDs, so it can't be relied
 * on (same caveat documented in `auto-improve-lock.ts`). It therefore only ever
 * nudges an already-heartbeat-fresh lock toward "dead", never the reverse.
 */
export function isLockAlive(lock: WebServerLock | null): boolean {
  if (!lock) return false;
  const fresh = Date.now() - lock.heartbeat < STALE_MS;
  if (!fresh) return false;
  if (typeof lock.pid === 'number' && lock.pid > 0 && process.platform !== 'win32') {
    try {
      process.kill(lock.pid, 0); // throws if the pid is not alive
    } catch {
      return false;
    }
  }
  return true;
}

/**
 * Thrown by `startWebServer` when a live server already holds the port. Carries
 * the existing lock so callers can report the port + who started it.
 */
export class WebServerAlreadyRunningError extends Error {
  public readonly lock: WebServerLock;
  constructor(lock: WebServerLock) {
    super(
      `Web server already running on port ${lock.port} ` +
        `(started by ${lock.startedBy}, PID ${lock.pid}).`
    );
    this.name = 'WebServerAlreadyRunningError';
    this.lock = lock;
  }
}
