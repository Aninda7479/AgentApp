#!/usr/bin/env node
/**
 * SuperAgent Desktop — Bundle Renderer (Delegator)
 *
 * The renderer bundling now lives in packages/ui/scripts/bundle-renderer.mjs.
 * This file exists for backward compatibility only and delegates to ui.
 */
import { execSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const UI_ROOT = path.resolve(__dirname, '../../ui');
const isWatch = process.argv.includes('--watch');

console.log('[desktop/bundle-renderer] Delegating to @superagent/ui bundle-renderer...');
execSync(
  `node "${path.join(UI_ROOT, 'scripts/bundle-renderer.mjs')}" ${isWatch ? '--watch' : ''}`,
  { cwd: UI_ROOT, stdio: 'inherit' }
);
