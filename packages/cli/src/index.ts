export * from './types.js';
export * from './commands/model.js';
export * from './commands/status.js';
export * from './commands/theme.js';
export * from './commands/learn.js';
export * from './commands/init.js';
export * from './commands/compact.js';
export * from './commands/diff.js';
export * from './commands/router.js';
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
import React from 'react';
import { render } from 'ink';
import { App } from './ui/App.js';

if (process.argv[1] && (process.argv[1].endsWith('commander.js') || process.argv[1].endsWith('index.js') || process.argv[1].includes('superagent'))) {
  const options = parseCliArguments(process.argv.slice(2));
  if (options.interactive) {
    render(React.createElement(App, { provider: options.provider, model: options.model, initialPermission: options.permission, initialVerbose: options.verbose }));
  }
}
