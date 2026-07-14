export * from './types.js';
export { loadSettings } from '@superagent/core';
export * from './commands/model.js';
export * from './commands/status.js';
export * from './commands/password.js';
export * from './commands/theme.js';
export * from './commands/learn.js';
export * from './commands/init.js';
export * from './commands/doctor.js';
export * from './commands/compact.js';
export * from './commands/diff.js';
export * from './commands/permissions.js';
export * from './commands/btw.js';
export * from './commands/verify.js';
export * from './commands/plan.js';
export * from './commands/review.js';
export * from './commands/security.js';
export * from './commands/mcp.js';
export * from './commands/config.js';
export * from './commands/cost.js';
export * from './commands/memory.js';
export * from './commands/goal.js';
export * from './commands/side.js';
export * from './commands/agent.js';
export * from './commands/help.js';
export * from './commands/bug.js';
export * from './commands/voice.js';
export * from './commands/tasks.js';
export * from './commands/clear.js';
export * from './commands/router.js';
export * from './commands/registry.js';
export * from './shortcuts/permissions.js';
export * from './shortcuts/queue.js';
export * from './shortcuts/transcript.js';
export * from './shortcuts/clipboard.js';
export * from './shortcuts/editor_bridge.js';
export * from './shortcuts/history_search.js';
export * from './bin/commander.js';
export * from './bin/exec.js';
export * from './ui/MarkdownStream.js';
export * from './ui/Composer.js';
export * from './ui/App.js';

import { parseCliArguments } from './bin/commander.js';
import { runPasswordCommand } from './commands/password.js';
import React from 'react';
import { render } from 'ink';
import { App } from './ui/App.js';

/** Entry point: parses argv and launches password subcommand or interactive TUI. */
if (process.argv[1] && (process.argv[1].endsWith('commander.js') || process.argv[1].endsWith('index.js') || process.argv[1].includes('superagent'))) {
  const argv = process.argv.slice(2);

  // Credential management runs outside the interactive TUI and exits when done.
  if (argv[0] === 'password') {
    runPasswordCommand(argv.slice(1))
      .then(() => process.exit(0))
      .catch((err) => {
        console.error(err?.message || String(err));
        process.exit(1);
      });
  } else {
    const options = parseCliArguments(argv);
    if (options.interactive) {
      render(React.createElement(App, { provider: options.provider, model: options.model, initialPermission: options.permission, initialVerbose: options.verbose }));
}

  }
}
