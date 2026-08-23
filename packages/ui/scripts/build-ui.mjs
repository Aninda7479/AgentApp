#!/usr/bin/env node
/**
 * SuperAgent UI — Build Script
 * Compiles Tailwind CSS, copies HTML and assets into dist/, and bundles esbuild renderers.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync, spawn } from 'node:child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');
const distDir = path.join(ROOT, 'dist');
const distAssetsDir = path.join(distDir, 'assets');
const srcAssetsDir = path.join(ROOT, 'assets');

const isWatch = process.argv.includes('--watch');

// 1. Ensure dist directories exist
fs.mkdirSync(distDir, { recursive: true });
fs.mkdirSync(distAssetsDir, { recursive: true });

console.log('[build-ui] Preparing distribution directories...');

// 2. Compile Tailwind CSS
console.log('[build-ui] Compiling CSS...');
const srcCss = path.join(ROOT, 'src/styles/index.css');
const distCss = path.join(distDir, 'index.css');

try {
  const minifyFlag = isWatch ? '' : '--minify';
  execSync(`npx @tailwindcss/cli -i "${srcCss}" -o "${distCss}" ${minifyFlag}`, {
    cwd: ROOT,
    stdio: 'inherit',
  });
  console.log('[build-ui] ✅ Tailwind CSS compiled successfully.');
} catch (err) {
  console.warn('[build-ui] ⚠️ Tailwind CLI compile warning, falling back to direct CSS copy:', err.message);
  if (fs.existsSync(srcCss)) {
    fs.copyFileSync(srcCss, distCss);
    console.log('[build-ui] Copied raw src/styles/index.css to dist/index.css.');
  }
}

// 3. Copy HTML templates
const htmlFiles = [
  { src: 'src/index.html', dest: 'dist/index.html' },
  { src: 'src/ui.html', dest: 'dist/ui.html' },
  { src: 'src/pet.html', dest: 'dist/pet.html' },
  { src: 'src/circle-search.html', dest: 'dist/circle-search.html' },
  { src: 'src/tray.html', dest: 'dist/tray.html' },
  { src: 'src/overlay.html', dest: 'dist/overlay.html' },
];

for (const { src, dest } of htmlFiles) {
  const srcPath = path.join(ROOT, src);
  const destPath = path.join(ROOT, dest);
  if (fs.existsSync(srcPath)) {
    fs.copyFileSync(srcPath, destPath);
    console.log(`[build-ui] Copied ${src} -> ${dest}`);
  }
}

// 4. Copy static assets if folder exists
if (fs.existsSync(srcAssetsDir)) {
  const assets = fs.readdirSync(srcAssetsDir);
  for (const asset of assets) {
    const fromPath = path.join(srcAssetsDir, asset);
    const toPath = path.join(distAssetsDir, asset);
    if (fs.statSync(fromPath).isFile()) {
      fs.copyFileSync(fromPath, toPath);
    }
  }
  console.log(`[build-ui] Copied ${assets.length} assets to dist/assets/`);
}

// 5. Bundle esbuild renderers
console.log('[build-ui] Running esbuild bundle-renderer...');
const bundleScript = path.join(__dirname, 'bundle-renderer.mjs');
if (isWatch) {
  const child = spawn(process.execPath, [bundleScript, '--watch'], {
    cwd: ROOT,
    stdio: 'inherit',
  });
  child.on('error', (err) => console.error('[build-ui] esbuild watch error:', err));
} else {
  execSync(`"${process.execPath}" "${bundleScript}"`, {
    cwd: ROOT,
    stdio: 'inherit',
  });
  console.log('[build-ui] ✅ UI build finished.');
}
