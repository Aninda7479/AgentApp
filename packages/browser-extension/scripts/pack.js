/**
 * SuperAgent Browser Extension — Release Packager
 * Packages packages/browser-extension/dist into release ZIP archive.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const pkgDir = path.resolve(__dirname, '..');
const distDir = path.resolve(pkgDir, 'dist');
const releaseDir = path.resolve(pkgDir, 'release');
const zipFile = path.resolve(releaseDir, 'superagent-browser-extension-v0.9.0.zip');

if (!fs.existsSync(distDir)) {
  console.error('❌ dist/ folder not found. Run "npm run build:ext" first.');
  process.exit(1);
}

if (!fs.existsSync(releaseDir)) {
  fs.mkdirSync(releaseDir, { recursive: true });
}

console.log('[Packager] Packaging SuperAgent browser extension from dist/ ...');

try {
  if (process.platform === 'win32') {
    // Windows PowerShell Compress-Archive
    execSync(
      `powershell -NoProfile -Command "Compress-Archive -Path '${distDir}\\*' -DestinationPath '${zipFile}' -Force"`,
      { stdio: 'inherit' }
    );
  } else {
    // Linux / macOS zip command
    execSync(`cd "${distDir}" && zip -r "${zipFile}" .`, { stdio: 'inherit' });
  }

  const stat = fs.statSync(zipFile);
  const kb = (stat.size / 1024).toFixed(1);
  console.log(`✅ Successfully generated release bundle: ${zipFile} (${kb} KB)`);
} catch (err) {
  console.error('❌ Failed to package release zip:', err);
  process.exit(1);
}
