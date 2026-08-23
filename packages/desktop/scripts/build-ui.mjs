#!/usr/bin/env node
/**
 * SuperAgent Desktop — Build UI Script
 *
 * Delegates the full UI build to packages/ui (the canonical UI package).
 * All React/Tailwind/Three.js source is now in packages/ui/src/renderer/.
 * Desktop only keeps its Tauri host (src-tauri/) and platform entry files.
 */

import { execSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const UI_ROOT = path.resolve(ROOT, '../ui');
const isWatch = process.argv.includes('--watch');
const script = isWatch ? 'watch' : 'build';

console.log(`[desktop/build-ui] Delegating UI build to @superagent/ui (${script})...`);
execSync(`npm run ${script}`, {
  cwd: UI_ROOT,
  stdio: 'inherit',
});
console.log('[desktop/build-ui] ✅ UI build finished (from @superagent/ui).');
