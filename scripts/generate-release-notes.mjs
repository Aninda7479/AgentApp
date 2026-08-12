#!/usr/bin/env node
// scripts/generate-release-notes.mjs
// Generates a release body matching the TinyTools style:
//   - Desktop installer download table
//   - Server / HomeLab tarball download table
// Output file: release-notes.md (read by the release workflow as --body-path)

import { readFileSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

const version = process.env.RELEASE_VERSION;
if (!version) {
  console.error('RELEASE_VERSION environment variable is required.');
  process.exit(1);
}

const REPO = 'Aninda7479/AgentApp';
const BASE = `https://github.com/${REPO}/releases/download/v${version}`;

// ── Desktop installer rows ───────────────────────────────────────────────────
// Tauri generates these artifact names automatically based on tauri.conf.json
// productName + version + target.
const desktopRows = [
  {
    os: '🪟 **Windows**',
    links: [
      `[Download Installer (EXE)](${BASE}/SuperAgent_${version}_x64-setup.exe)`,
      `[Download MSI](${BASE}/SuperAgent_${version}_x64_en-US.msi)`,
    ].join(' <br> '),
    desc: 'NSIS Installer or MSI — Windows x64',
  },
  {
    os: '🍎 **macOS (Apple Silicon)**',
    links: `[Download DMG](${BASE}/SuperAgent_${version}_aarch64.dmg)`,
    desc: 'macOS Disk Image — M1/M2/M3 (arm64)',
  },
  {
    os: '🍎 **macOS (Intel)**',
    links: `[Download DMG](${BASE}/SuperAgent_${version}_x64.dmg)`,
    desc: 'macOS Disk Image — Intel x86_64',
  },
  {
    os: '🐧 **Linux**',
    links: [
      `[Download AppImage](${BASE}/SuperAgent_${version}_amd64.AppImage)`,
      `[Download DEB](${BASE}/SuperAgent_${version}_amd64.deb)`,
    ].join(' <br> '),
    desc: 'Portable AppImage or Debian/Ubuntu package',
  },
];

// ── Server / HomeLab rows ────────────────────────────────────────────────────
const serverRows = [
  {
    os: '🐧 Linux',
    link: `[superagent-server-v${version}-linux-x64.tar.gz](${BASE}/superagent-server-v${version}-linux-x64.tar.gz)`,
  },
  {
    os: '🪟 Windows',
    link: `[superagent-server-v${version}-windows-x64.zip](${BASE}/superagent-server-v${version}-windows-x64.zip)`,
  },
  {
    os: '🍎 macOS',
    link: `[superagent-server-v${version}-macos-arm64.zip](${BASE}/superagent-server-v${version}-macos-arm64.zip)`,
  },
];

// ── Previous version for changelog link ──────────────────────────────────────
// Read from package.json and compute previous minor (simple heuristic).
let prevVersion = '0.0.0';
try {
  const pkg = JSON.parse(readFileSync(resolve(ROOT, 'package.json'), 'utf8'));
  const [maj, min, pat] = pkg.version.split('.').map(Number);
  // Previous version: if patch > 0 decrement patch, else decrement minor.
  if (pat > 0) prevVersion = `${maj}.${min}.${pat - 1}`;
  else if (min > 0) prevVersion = `${maj}.${min - 1}.0`;
  else prevVersion = `${maj - 1}.0.0`;
} catch { /* ignore */ }

const desktopTable = [
  '| OS / Platform | Direct Download | Description |',
  '| :--- | :--- | :--- |',
  ...desktopRows.map(r => `| ${r.os} | ${r.links} | ${r.desc} |`),
].join('\n');

const serverTable = [
  '| OS | Direct Download |',
  '| :--- | :--- |',
  ...serverRows.map(r => `| ${r.os} | ${r.link} |`),
].join('\n');

const notes = `\
### 🚀 Quick Download Links

${desktopTable}

---

#### 🖥️ Server / HomeLab (Headless \`--serve\` mode)

Extract the archive and run:
\`\`\`bash
node cli/dist/bin/main.js --serve
# or with custom port:
node cli/dist/bin/main.js --serve --serve-port 8080
\`\`\`

${serverTable}

---

**Full Changelog**: https://github.com/${REPO}/compare/v${prevVersion}...v${version}
`;

writeFileSync(resolve(ROOT, 'release-notes.md'), notes, 'utf8');
console.log('[generate-release-notes] Written release-notes.md');
console.log(notes);
