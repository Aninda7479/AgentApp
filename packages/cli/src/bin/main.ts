#!/usr/bin/env node
import React from 'react';
import { render } from 'ink';
import { createCliProgram } from './commander.js';
import { registerExecCommand, executeScript } from './exec.js';
import { App } from '../ui/App.js';
import type { CliOptions } from './commander.js';

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
