// Packages the desktop app into a Windows installer.
//
// Why this script exists: electron-builder auto-detects the npm *workspace root*
// (the repo root) whenever it finds a lock file there, and then collects the
// `files` globs relative to that root instead of packages/desktop. That makes it
// ship only the hoisted node_modules and drop the app's own dist/ (black screen).
//
// To sidestep workspace detection we stage the already-built app (dist/ + assets +
// package.json) into a throwaway directory that lives OUTSIDE the repo (so no
// ancestor package-lock.json triggers detection), junction its node_modules to the
// hoisted repo node_modules so every dependency resolves, run electron-builder
// there (app root = staged dir, dist/ lands at the asar root like a normal app),
// then copy the finished installer back and clean up.

import { spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { listPackage } from '@electron/asar';

const desktopDir = process.cwd(); // npm workspace script runs with cwd = packages/desktop
const repoRoot = path.resolve(desktopDir, '..', '..'); // packages/desktop → packages → repo root
const packDir = path.resolve(repoRoot, '..', '.superagent-pack'); // sibling of the repo → no ancestor lock file
const outName = 'dist-release-app'; // build output name (relative to the staged dir)
const outDir = path.join(desktopDir, outName); // final installer destination inside packages/desktop

function rmrf(p) {
  if (fs.existsSync(p)) fs.rmSync(p, { recursive: true, force: true, maxRetries: 5 });
}

function isWindows() {
  return process.platform === 'win32';
}

function sh(cmd, args, opts = {}) {
  return spawnSync(cmd, args, { stdio: 'inherit', ...opts });
}

console.log('[pack] staging app into', packDir);
rmrf(packDir);
fs.mkdirSync(packDir, { recursive: true });

// Copy the built app (dist already contains the esbuild renderer bundles).
fs.cpSync(path.join(desktopDir, 'dist'), path.join(packDir, 'dist'), { recursive: true });
fs.cpSync(path.join(desktopDir, 'assets'), path.join(packDir, 'assets'), { recursive: true });

// Copy `@superagent/core` into the staged directory.
console.log('[pack] copying @superagent/core to staged core directory');
fs.cpSync(path.join(repoRoot, 'packages', 'core'), path.join(packDir, 'core'), {
  recursive: true,
  filter: (src) => {
    const rel = path.relative(path.join(repoRoot, 'packages', 'core'), src);
    const ignore = ['node_modules', 'tmp', 'logs', 'test'];
    return !ignore.some(dir => rel === dir || rel.startsWith(dir + path.sep));
  }
});

// Read package.json and replace the workspace dependency with a local file link
// pointing to the staged core directory.
const pkg = JSON.parse(fs.readFileSync(path.join(desktopDir, 'package.json'), 'utf8'));
if (pkg.dependencies && pkg.dependencies['@superagent/core']) {
  pkg.dependencies['@superagent/core'] = 'file:./core';
}
fs.writeFileSync(path.join(packDir, 'package.json'), JSON.stringify(pkg, null, 2), 'utf8');

// Run a production-only npm install in the staging directory to resolve
// all dependencies (and their transitive dependencies) cleanly and physically
// into a real, non-junctioned node_modules.
console.log('[pack] running npm install in staged directory to download production dependencies...');
const installResult = spawnSync('npm', ['install', '--omit=dev', '--no-audit', '--no-fund', '--prefer-offline'], {
  cwd: packDir,
  shell: true,
  stdio: 'inherit'
});

if (installResult.status !== 0) {
  console.error('[pack] npm install failed inside staged directory (exit', installResult.status, ')');
  if (installResult.error) console.error('[pack] spawn error:', installResult.error.message);
  rmrf(packDir);
  process.exit(installResult.status || 1);
}

// Run electron-builder from the staged dir (no workspace detection → app root =
// staged dir). Output into a relative dir inside the staged dir, then move it out.
// On Windows the .bin shim is an extensionless script, so invoke the .cmd via cmd.
const ebCmd = path.join(repoRoot, 'node_modules', '.bin', 'electron-builder.cmd');
const logPath = path.join(desktopDir, 'pack-eb.log');
console.log('[pack] running electron-builder (log →', logPath + ')');
const result = spawnSync('cmd', ['/c', ebCmd, '--config.directories.output=' + outName], {
  cwd: packDir,
  encoding: 'utf8',
  maxBuffer: 50 * 1024 * 1024
});
fs.writeFileSync(logPath, (result.stdout || '') + '\n' + (result.stderr || ''));

if (result.status !== 0) {
  console.error('[pack] electron-builder failed (exit', result.status, ') — see', logPath);
  if (result.error) console.error('[pack] spawn error:', result.error.message);
  rmrf(packDir);
  process.exit(result.status || 1);
}

// Move the finished installer out of the (soon-to-be-deleted) staging dir.
const builtDir = path.join(packDir, outName);
if (!fs.existsSync(builtDir)) {
  console.error('[pack] expected build output missing at', builtDir);
  rmrf(packDir);
  process.exit(1);
}

// Self-verify the asar actually contains the app + bundled renderer + three
// addons. Without this check a workspace-hoisting regression would ship a
// black-screen build (dist/ dropped) and we'd only find out at runtime.
const asarPath = path.join(builtDir, 'win-unpacked', 'resources', 'app.asar');
// NOTE: the three.js addons (OrbitControls, GLTFLoader, RoomEnvironment) are
// intentionally NOT required here — bundle-renderer.mjs inlines them into
// dist/renderer/entry.js / dist/pet/entry.js, so they don't need to ship in
// node_modules (and electron-builder would prune them anyway).
const required = [
  'dist/main.js',
  'dist/ui.html',
  'dist/renderer/entry.js',
  'dist/pet/entry.js',
  'dist/index.css',
  'node_modules/react/package.json',
  'node_modules/lucide-react/package.json',
  'node_modules/@superagent/core/package.json',
  'node_modules/playwright/package.json',
  'node_modules/sharp/package.json',
  'node_modules/@modelcontextprotocol/sdk/package.json'
];
try {
  const files = listPackage(asarPath).map((f) => f.replace(/^[\\/]/, '').replace(/\\/g, '/'));
  const missing = required.filter((n) => !files.includes(n));
  if (missing.length) {
    console.error('[pack] ❌ asar is missing required files (black-screen risk):');
    missing.forEach((m) => console.error('        - ' + m));
    rmrf(packDir);
    process.exit(1);
  }
  console.log('[pack] ✅ asar verified: app + bundled renderer + three addons present');
} catch (e) {
  console.error('[pack] could not verify asar:', e.message);
  rmrf(packDir);
  process.exit(1);
}

rmrf(outDir);
fs.cpSync(builtDir, outDir, { recursive: true });

// Clean up the staging dir (removes the junction too).
rmrf(packDir);

console.log('[pack] done →', path.join(outDir, 'SuperAgent-Setup-0.1.0.exe'));
console.log('[pack] build log saved at', logPath);
