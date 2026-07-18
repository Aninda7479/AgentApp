#!/usr/bin/env node
import React from 'react';
import { render } from 'ink';
import { createCliProgram } from './commander.js';
import { registerExecCommand, executeScript } from './exec.js';
import { App } from '../ui/App.js';
import { tryAcquireAutoImproveLock } from '../auto-improve-lock.js';
import { startWebServer, stopWebServer, isWebServerRunning } from '@superagent/core';
import type { CliOptions } from './commander.js';

// `superagent --start-web` launches the self-hosted web server (the same host
// build the Web package runs) and keeps the CLI process alive as its parent.
// Intercept before commander parses so the chat TUI never renders.
const WEB_FLAG = '--start-web';
if (process.argv.includes(WEB_FLAG)) {
  const portArg = process.argv[process.argv.indexOf(WEB_FLAG) + 1];
  const portIdx = process.argv.indexOf('--web-port');
  const port = portIdx !== -1 ? Number(process.argv[portIdx + 1]) : (portArg && /^\d+$/.test(portArg) ? Number(portArg) : 3000);

  try {
    const child = startWebServer({ port });
    console.log(`SuperAgent web server starting on http://localhost:${port} (LAN: http://0.0.0.0:${port}) …`);
    console.log('PID ' + child.pid + ' — press Ctrl+C to stop.');
  } catch (err) {
    console.error('[web] ' + (err instanceof Error ? err.message : String(err)));
    process.exit(1);
  }

  // The spawned child keeps this event loop alive, but make sure Ctrl+C tears
  // the server down cleanly instead of orphaning it.
  const shutdown = () => {
    if (isWebServerRunning()) stopWebServer();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  // Never reach commander.parse — we've already taken over the process.
  process.on('exit', () => { if (isWebServerRunning()) stopWebServer(); });
} else {

// Self-serialize the autonomous loop: if a /auto-improve run is already
// mutating the working tree, this process must not start another one and
// cross-commit its staged files. A normal interactive/one-shot CLI invocation
// has no AUTO_IMPROVE_RUN set, so it skips the guard entirely.
if (process.env.AUTO_IMPROVE_RUN) {
  const lock = tryAcquireAutoImproveLock(process.env.AUTO_IMPROVE_RUN, 'superagent-cli');
  if (!lock) {
    console.error(
      '[auto-improve] Another /auto-improve run holds the lock (.claude/.auto-improve.lock). Aborting to avoid cross-committing.'
    );
    process.exit(2);
  }
  process.on('exit', () => lock.release());
}

/**
 * Launches the appropriate mode for the default `chat` command:
 *  - a single prompt (non-interactive) -> run one engine turn and exit
 *  - no prompt -> render the interactive Ink TUI
 */
async function handleChat(opts: CliOptions, prompt?: string): Promise<void> {
  if (prompt && prompt.trim().length > 0) {
    try {
      const result = await executeScript({
        prompt: prompt.trim(),
        provider: opts.provider,
        model: opts.model,
        apiKey: opts.key,
        silent: false,
      });
      if (!result.success) process.exit(1);
    } catch (err) {
      console.error(err instanceof Error ? err.message : err);
      process.exit(1);
    }
    return;
  }

  // Interactive TUI. Ink keeps the process alive until the user quits (/exit).
  render(
    React.createElement(App, {
      provider: opts.provider,
      model: opts.model ?? 'default',
      initialPermission: opts.permission,
      initialVerbose: opts.verbose,
    })
  );
}

const program = createCliProgram((opts, prompt) => handleChat(opts, prompt));
registerExecCommand(program);

program
  .parseAsync(process.argv)
  .catch((err: unknown) => {
    // exitOverride() surfaces --help/--version as a CommanderError; don't treat that as a crash.
    if (err && typeof err === 'object' && 'code' in err && (err as { code?: string }).code === 'commander.helpDisplayed') {
      return;
    }
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
