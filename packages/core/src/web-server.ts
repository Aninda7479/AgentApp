import { spawn, type ChildProcess } from 'child_process';
import { createRequire } from 'module';
import * as fs from 'fs';
import * as path from 'path';

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
  /** TCP port to bind (passed through as `PORT`). Defaults to 3000. */
  port?: number | string;
  /** Interface to bind (passed through as `HOST`). Defaults to 0.0.0.0. */
  host?: string;
  /**
   * When false (default), the child's stdout/stderr are inherited by the parent
   * so the server banner + errors are visible. Set true to fully detach logging
   * (e.g. when the parent is a GUI with no console).
   */
  quiet?: boolean;
}

/**
 * Resolves the absolute path to the web server's compiled entry point.
 * Resolution order (first hit wins):
 *   1. `SUPERAGENT_WEB_SERVER_PATH` env override (explicit path to server.js).
 *   2. Packaged Electron build: `<resourcesPath>/web/server.js`.
 *   3. Monorepo dev layout: walk up from this file to find
 *      `packages/web/dist/server.js`.
 *   4. Published package resolution: `require.resolve('@superagent/web')`.
 *
 * Returns `null` when no candidate can be found (caller should surface a
 * helpful "build the web package first" message).
 */
export function locateWebServerEntry(): string | null {
  const envOverride = process.env.SUPERAGENT_WEB_SERVER_PATH;
  if (envOverride && fs.existsSync(envOverride)) {
    return envOverride;
  }

  // Packaged Electron build bundles the web server under resources/web.
  const resourcesPath = (process as any).resourcesPath as string | undefined;
  if (resourcesPath) {
    const packed = path.join(resourcesPath, 'web', 'server.js');
    if (fs.existsSync(packed)) return packed;
  }

  // Monorepo dev: this file lives at packages/core/dist/web-server.js, so walk
  // up looking for <root>/packages/web/dist/server.js.
  let dir = __dirname;
  for (let i = 0; i < 12; i++) {
    const candidate = path.join(dir, 'packages', 'web', 'dist', 'server.js');
    if (fs.existsSync(candidate)) return candidate;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }

  // Published layout: @superagent/web's main field points at its server.js.
  try {
    const req = createRequire(__filename);
    return req.resolve('@superagent/web');
  } catch {
    /* not installed as a dependency — fall through */
  }

  return null;
}

/** The single active web-server child process, if any. */
let activeChild: ChildProcess | null = null;

/** Whether a web server launched by this process is currently alive. */
export function isWebServerRunning(): boolean {
  return activeChild !== null && !activeChild.killed;
}

/**
 * Launches the SuperAgent web server as a detached child process.
 * @throws if the server entry cannot be located (build the web package first).
 */
export function startWebServer(options: StartWebServerOptions = {}): ChildProcess {
  const entry = locateWebServerEntry();
  if (!entry) {
    throw new Error(
      'Could not locate the SuperAgent web server (packages/web/dist/server.js). ' +
        'Build the web package first with `npm run build --workspace=@superagent/web`.'
    );
  }

  const env: NodeJS.ProcessEnv = { ...process.env };
  if (options.port != null) env.PORT = String(options.port);
  if (options.host != null) env.HOST = options.host;

  const child = spawn(process.execPath, [entry], {
    env,
    stdio: options.quiet ? 'ignore' : 'inherit'
  });

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

/** Stops the web server child process if one is running. No-op otherwise. */
export function stopWebServer(): void {
  if (activeChild && !activeChild.killed) {
    activeChild.kill();
  }
  activeChild = null;
}
