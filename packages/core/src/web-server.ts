import { spawn, type ChildProcess } from 'child_process';
import { createRequire } from 'module';
import * as fs from 'fs';
import * as path from 'path';
import {
  readWebServerLock,
  clearWebServerLock,
  isLockAlive,
  WebServerAlreadyRunningError,
  type WebServerLauncher
} from './web-server-lock.js';

/**
 * Shared helper for launching the SuperAgent **web server** (the host build in
 * `@superagent/web`, i.e. `packages/web/dist/server.js`).
 *
 * Both the CLI (`superagent --start-web`) and the Desktop app (Settings → Web
 * App) need to start that exact same server, so the "how web starts" logic
 * lives here once instead of being duplicated. The server is always launched as
 * a *child* Node process running `node dist/server.js` — identical to the
 * web package's own `npm start` (`node dist/server.js`) — never imported
 * in-process, so the host keeps its own event loop, env, and lifecycle.
 */

/** Options controlling how the web server is launched. */
export interface StartWebServerOptions {
  /** TCP port to bind (passed through as `PORT`). Defaults to 1469. */
  port?: number | string;
  /** Interface to bind (passed through as `HOST`). Defaults to 0.0.0.0. */
  host?: string;
  /**
   * When false (default), the child's stdout/stderr are inherited by the parent
   * so the server banner + errors are visible. Set true to fully detach logging
   * (e.g. when the parent is a GUI with no console).
   */
  quiet?: boolean;
  /**
   * Which surface is launching the server. Recorded in the shared lock file so
   * other surfaces can report "already running (started by …)". Defaults to
   * 'standalone'.
   */
  startedBy?: WebServerLauncher;
}

/**
 * Resolves the absolute path or binary execution info for the web server daemon.
 *
 * Resolution order:
 *   1. `SUPERAGENT_CORE_DAEMON_PATH` / `SUPERAGENT_WEB_SERVER_PATH` env override.
 *   2. Native Rust daemon binary in core_v2 target (debug / release).
 *   3. Packaged Desktop resources: `<resourcesPath>/bin/superagent-core-daemon`.
 *   4. Monorepo dev layout: walk up to find `packages/core_v2/target/release/superagent-core-daemon(.exe)`
 *      or `packages/core_v2/target/debug/superagent-core-daemon(.exe)`.
 */
export interface WebServerEntry {
  type: 'binary' | 'node';
  executable: string;
  args?: string[];
}

export function locateWebServerEntry(): WebServerEntry | null {
  const isWin = process.platform === 'win32';
  const binName = isWin ? 'superagent-core-daemon.exe' : 'superagent-core-daemon';

  const envOverride = process.env.SUPERAGENT_CORE_DAEMON_PATH || process.env.SUPERAGENT_WEB_SERVER_PATH;
  if (envOverride && fs.existsSync(envOverride)) {
    if (envOverride.endsWith('.js') || envOverride.endsWith('.mjs') || envOverride.endsWith('.cjs')) {
      return { type: 'node', executable: envOverride };
    }
    return { type: 'binary', executable: envOverride };
  }

  // Packaged Desktop build
  const resourcesPath = (process as any).resourcesPath as string | undefined;
  if (resourcesPath) {
    const nativeBin = path.join(resourcesPath, 'bin', binName);
    if (fs.existsSync(nativeBin)) return { type: 'binary', executable: nativeBin };
    const nativeRoot = path.join(resourcesPath, binName);
    if (fs.existsSync(nativeRoot)) return { type: 'binary', executable: nativeRoot };
  }

  // Monorepo dev: walk up looking for Rust core_v2 target binaries
  let dir = __dirname;
  for (let i = 0; i < 12; i++) {
    const releaseBin = path.join(dir, 'packages', 'core_v2', 'target', 'release', binName);
    if (fs.existsSync(releaseBin)) return { type: 'binary', executable: releaseBin };

    const debugBin = path.join(dir, 'packages', 'core_v2', 'target', 'debug', binName);
    if (fs.existsSync(debugBin)) return { type: 'binary', executable: debugBin };

    const rootTargetRelease = path.join(dir, 'target', 'release', binName);
    if (fs.existsSync(rootTargetRelease)) return { type: 'binary', executable: rootTargetRelease };

    const rootTargetDebug = path.join(dir, 'target', 'debug', binName);
    if (fs.existsSync(rootTargetDebug)) return { type: 'binary', executable: rootTargetDebug };

    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }

  return null;
}

/** The single active web-server child process launched by THIS process, if any. */
let activeChild: ChildProcess | null = null;

/**
 * Whether a web server is currently alive — anywhere on the machine, not just
 * one this process spawned. Fast path checks the in-process child handle; the
 * cross-process source of truth is the shared lock file. A stale lock (server
 * died without cleaning up) is swept so the port can be reclaimed.
 */
export function isWebServerRunning(): boolean {
  if (activeChild !== null && !activeChild.killed) return true;
  const lock = readWebServerLock();
  if (isLockAlive(lock)) return true;
  if (lock) clearWebServerLock(); // stale — let the next start reclaim the port
  return false;
}

/**
 * Launches the SuperAgent web server as a detached child process.
 * @throws {WebServerAlreadyRunningError} if a live server already holds the port
 *         (started by any surface on this machine).
 * @throws if the server entry cannot be located (build the web package first).
 */
export function startWebServer(options: StartWebServerOptions = {}): ChildProcess {
  // Cross-process single-instance guard: refuse if any surface already holds the
  // port. isWebServerRunning() sweeps a stale lock first, so this only fires on
  // a genuinely live server.
  if (isWebServerRunning()) {
    const lock = readWebServerLock();
    if (lock) throw new WebServerAlreadyRunningError(lock);
  }

  const env: NodeJS.ProcessEnv = { ...process.env };
  const port = options.port != null ? String(options.port) : '1469';
  const host = options.host || '0.0.0.0';
  env.PORT = port;
  env.HOST = host;
  // Record who launched it so the server can write it into the shared lock.
  env.SUPERAGENT_WEB_LAUNCHER = options.startedBy ?? 'standalone';

  // When running inside a standalone @yao-pkg/pkg binary, process.execPath IS the binary.
  if ((process as any).pkg) {
    env.SUPERAGENT_INTERNAL_WEB_SERVER = '1';
    const child = spawn(process.execPath, [], {
      env,
      stdio: options.quiet ? 'ignore' : 'inherit'
    });

    activeChild = child;
    child.on('exit', () => {
      if (activeChild === child) activeChild = null;
    });
    child.on('error', () => {
      if (activeChild === child) activeChild = null;
    });

    return child;
  }

  const entry = locateWebServerEntry();
  if (!entry) {
    throw new Error(
      'Could not locate the SuperAgent web daemon (superagent-core-daemon binary or packages/web/dist/server.js). ' +
        'Build the core package first with `cargo build --manifest-path packages/core_v2/Cargo.toml`.'
    );
  }

  let child: ChildProcess;
  if (entry.type === 'binary') {
    child = spawn(entry.executable, ['--server', '--port', port, '--host', host], {
      env,
      stdio: options.quiet ? 'ignore' : 'inherit'
    });
  } else {
    child = spawn(process.execPath, [entry.executable], {
      env,
      stdio: options.quiet ? 'ignore' : 'inherit'
    });
  }

  // Track the child so callers can later stop it and we can report status.
  // Clear the handle if this exact child exits so status stays accurate.
  activeChild = child;
  child.on('exit', () => {
    if (activeChild === child) activeChild = null;
  });
  child.on('error', () => {
    if (activeChild === child) activeChild = null;
  });

  return child;
}


/**
 * Stops the running web server — even one started by a *different* surface.
 *
 * Kills the in-process child if we own it, otherwise signals the PID recorded in
 * the shared lock file (that's the cross-surface stop: CLI can stop a
 * Desktop-started server and vice-versa). Clears the lock afterwards.
 *
 * @returns true if a server was signalled/killed, false if none was running.
 */
export function stopWebServer(): boolean {
  let stopped = false;

  // In-process child (we launched it) — kill directly.
  if (activeChild && !activeChild.killed) {
    activeChild.kill();
    stopped = true;
  }
  activeChild = null;

  // Cross-process: signal whatever PID the lock names, if it's still alive and
  // isn't the child we just killed.
  const lock = readWebServerLock();
  if (isLockAlive(lock) && lock) {
    try {
      process.kill(lock.pid); // default SIGTERM — the server clears its own lock on exit
      stopped = true;
    } catch {
      /* already dead — fall through to clearing the stale lock */
    }
  }

  clearWebServerLock();
  return stopped;
}
