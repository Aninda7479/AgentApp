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

// Verify that the web server package is built.
const webServerSrc = path.join(repoRoot, 'packages', 'web', 'dist', 'server.js');
if (!fs.existsSync(webServerSrc)) {
  console.error('[pack] ❌ Web server build output not found at packages/web/dist/server.js.');
  console.error('[pack] Please build the web package first with `npm run build --workspace=@superagent/web`.');
  process.exit(1);
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

// Copy `@superagent/web` into the staged directory.
console.log('[pack] copying @superagent/web to staged web directory');
fs.cpSync(path.join(repoRoot, 'packages', 'web'), path.join(packDir, 'web'), {
  recursive: true,
  filter: (src) => {
    const rel = path.relative(path.join(repoRoot, 'packages', 'web'), src);
    const ignore = ['node_modules', 'tmp', 'logs', 'test'];
    return !ignore.some(dir => rel === dir || rel.startsWith(dir + path.sep));
  }
});

// Read the staged web package.json and replace the core workspace dependency with a relative file link.
const webPkgPath = path.join(packDir, 'web', 'package.json');
const webPkg = JSON.parse(fs.readFileSync(webPkgPath, 'utf8'));
if (webPkg.dependencies && webPkg.dependencies['@superagent/core']) {
  webPkg.dependencies['@superagent/core'] = 'file:../core';
}
fs.writeFileSync(webPkgPath, JSON.stringify(webPkg, null, 2), 'utf8');

// Run a production-only npm install inside the staged web directory to resolve
// all web server dependencies (and their transitive dependencies) cleanly and physically.
console.log('[pack] running npm install inside staged web directory...');
const webInstallResult = spawnSync('npm', ['install', '--omit=dev', '--no-audit', '--no-fund', '--prefer-offline'], {
  cwd: path.join(packDir, 'web'),
  shell: true,
  stdio: 'inherit'
});

if (webInstallResult.status !== 0) {
  console.error('[pack] npm install failed inside staged web directory (exit', webInstallResult.status, ')');
  if (webInstallResult.error) console.error('[pack] spawn error:', webInstallResult.error.message);
  rmrf(packDir);
  process.exit(webInstallResult.status || 1);
}

// Target platform configuration. Accepts process arguments: --win, --mac, --linux.
const args = process.argv.slice(2);
let targetPlatform = 'win';
if (args.includes('--mac')) targetPlatform = 'mac';
else if (args.includes('--linux')) targetPlatform = 'linux';
else if (args.includes('--win')) targetPlatform = 'win';
else if (process.platform === 'darwin') targetPlatform = 'mac';
else if (process.platform === 'linux') targetPlatform = 'linux';

// Run electron-builder from the staged dir (no workspace detection → app root =
// staged dir). Output into a relative dir inside the staged dir, then move it out.
const cliPath = path.join(repoRoot, 'node_modules', 'electron-builder', 'cli.js');
const logPath = path.join(desktopDir, 'pack-eb.log');
console.log(`[pack] running electron-builder for --${targetPlatform} (log → ${logPath})`);
const result = spawnSync(process.execPath, [cliPath, '--config.directories.output=' + outName, '--' + targetPlatform], {
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
// Resolve verification paths dynamically based on target platform.
let asarPath, packedWebEntry;
if (targetPlatform === 'mac') {
  asarPath = path.join(builtDir, 'mac', 'SuperAgent.app', 'Contents', 'Resources', 'app.asar');
  packedWebEntry = path.join(builtDir, 'mac', 'SuperAgent.app', 'Contents', 'Resources', 'web', 'dist', 'server.js');
} else if (targetPlatform === 'linux') {
  asarPath = path.join(builtDir, 'linux-unpacked', 'resources', 'app.asar');
  packedWebEntry = path.join(builtDir, 'linux-unpacked', 'resources', 'web', 'dist', 'server.js');
} else {
  asarPath = path.join(builtDir, 'win-unpacked', 'resources', 'app.asar');
  packedWebEntry = path.join(builtDir, 'win-unpacked', 'resources', 'web', 'dist', 'server.js');
}
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

// Verify that the web server extra resource was copied successfully.
if (!fs.existsSync(packedWebEntry)) {
  console.error('[pack] ❌ packaged web server is missing at:', packedWebEntry);
  rmrf(packDir);
  process.exit(1);
}
console.log('[pack] ✅ web server extra resource verified');

rmrf(outDir);
fs.cpSync(builtDir, outDir, { recursive: true });

// Clean up the staging dir (removes the junction too).
rmrf(packDir);

console.log(`[pack] done → packaged files copied to ${outDir}`);
console.log('[pack] build log saved at', logPath);
