#!/usr/bin/env node
// scripts/generate-release-notes.mjs
// Generates a release body matching clean download styling:
//   - Quick direct text links for Windows, macOS, Linux, Server
//   - Desktop installer download table
//   - Standalone CLI & Headless Web Server table
//   - Quick start commands
// Output file: release-notes.md (read by the release workflow as --body-path)

import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from 'fs';
import { resolve, dirname, join, basename } from 'path';
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

// Helper to find downloaded artifact files in artifacts directory if present
const findArtifactFile = (pattern) => {
  const artifactsDir = resolve(ROOT, 'artifacts');
  const cliArtifactsDir = resolve(ROOT, 'cli-artifacts');
  const searchDirs = [artifactsDir, cliArtifactsDir].filter(d => existsSync(d));
  
  const collect = (dir) => {
    let results = [];
    const entries = readdirSync(dir);
    for (const e of entries) {
      const full = join(dir, e);
      if (statSync(full).isDirectory()) {
        results = results.concat(collect(full));
      } else {
        results.push(basename(full));
      }
    }
    return results;
  };

  for (const dir of searchDirs) {
    const files = collect(dir);
    const match = files.find(f => pattern.test(f));
    if (match) return match;
  }
  return null;
};

// ── Resolve filenames ────────────────────────────────────────────────────────
const winExeName = findArtifactFile(/^SuperAgent.*x64.*\.exe$/i) || `SuperAgent_${version}_x64-setup.exe`;
const winMsiName = findArtifactFile(/^SuperAgent.*\.msi$/i) || `SuperAgent_${version}_x64_en-US.msi`;
const macArmDmgName = findArtifactFile(/^SuperAgent.*(aarch64|arm64).*\.dmg$/i) || `SuperAgent_${version}_aarch64.dmg`;
const macIntelDmgName = findArtifactFile(/^SuperAgent.*(x64|x86_64).*\.dmg$/i) || `SuperAgent_${version}_x64.dmg`;
const linuxAppImageName = findArtifactFile(/^SuperAgent.*\.AppImage$/i) || `SuperAgent_${version}_amd64.AppImage`;
const linuxDebName = findArtifactFile(/^SuperAgent.*\.deb$/i) || `SuperAgent_${version}_amd64.deb`;
const linuxRpmName = findArtifactFile(/^SuperAgent.*\.rpm$/i) || `SuperAgent-${version}-1.x86_64.rpm`;

// CLI / Standalone Server binaries
const cliWinZip = `superagent-cli-v${version}-windows-x64.zip`;
const cliMacArmZip = `superagent-cli-v${version}-macos-arm64.zip`;
const cliMacIntelZip = `superagent-cli-v${version}-macos-x64.zip`;
const cliLinuxX64Tar = `superagent-cli-v${version}-linux-x64.tar.gz`;
const cliLinuxArmTar = `superagent-cli-v${version}-linux-arm64.tar.gz`;

// Browser Extension bundle
const extZipName = findArtifactFile(/^superagent-browser-extension.*\.zip$/i) || `superagent-browser-extension-v${version}.zip`;

// ── Desktop installer rows ───────────────────────────────────────────────────
const desktopRows = [
  {
    os: '🪟 **Windows**',
    links: [
      `[Download Installer (.exe)](${BASE}/${encodeURIComponent(winExeName)})`,
      `[Download MSI (.msi)](${BASE}/${encodeURIComponent(winMsiName)})`,
    ].join(' &bull; '),
    desc: 'NSIS Installer / MSI (Windows 10 / 11 x64)',
  },
  {
    os: '🍎 **macOS (Apple Silicon)**',
    links: `[Download DMG (.dmg)](${BASE}/${encodeURIComponent(macArmDmgName)})`,
    desc: 'Apple Silicon M1 / M2 / M3 / M4 (arm64)',
  },
  {
    os: '🍎 **macOS (Intel)**',
    links: `[Download DMG (.dmg)](${BASE}/${encodeURIComponent(macIntelDmgName)})`,
    desc: 'Intel 64-bit Mac (x86_64)',
  },
  {
    os: '🐧 **Linux**',
    links: [
      `[Download AppImage](${BASE}/${encodeURIComponent(linuxAppImageName)})`,
      `[Download DEB](${BASE}/${encodeURIComponent(linuxDebName)})`,
      `[Download RPM](${BASE}/${encodeURIComponent(linuxRpmName)})`,
    ].join(' &bull; '),
    desc: 'Universal AppImage, Debian / Ubuntu .deb, Fedora / RHEL .rpm',
  },
];

// ── Standalone CLI / Server Binary rows ──────────────────────────────────────
const cliRows = [
  {
    os: '🐧 **Linux (x64)**',
    link: `[${cliLinuxX64Tar}](${BASE}/${cliLinuxX64Tar})`,
    desc: 'Server / Headless / CLI for Linux x64',
  },
  {
    os: '🐧 **Linux (ARM64)**',
    link: `[${cliLinuxArmTar}](${BASE}/${cliLinuxArmTar})`,
    desc: 'Server / Raspberry Pi / ARM64 Linux',
  },
  {
    os: '🪟 **Windows (x64)**',
    link: `[${cliWinZip}](${BASE}/${cliWinZip})`,
    desc: 'Standalone Command-line & Local Web Server',
  },
  {
    os: '🍎 **macOS (Apple Silicon)**',
    link: `[${cliMacArmZip}](${BASE}/${cliMacArmZip})`,
    desc: 'Standalone CLI / Server for M-series Macs',
  },
  {
    os: '🍎 **macOS (Intel)**',
    link: `[${cliMacIntelZip}](${BASE}/${cliMacIntelZip})`,
    desc: 'Standalone CLI / Server for Intel Macs',
  },
];

// ── Previous version for changelog link ──────────────────────────────────────
let prevVersion = '0.0.0';
try {
  const pkg = JSON.parse(readFileSync(resolve(ROOT, 'package.json'), 'utf8'));
  const [maj, min, pat] = pkg.version.split('.').map(Number);
  if (pat > 0) prevVersion = `${maj}.${min}.${pat - 1}`;
  else if (min > 0) prevVersion = `${maj}.${min - 1}.0`;
  else prevVersion = `${maj - 1}.0.0`;
} catch { /* ignore */ }

const desktopTable = [
  '| Platform | Direct Downloads | Description |',
  '| :--- | :--- | :--- |',
  ...desktopRows.map(r => `| ${r.os} | ${r.links} | ${r.desc} |`),
].join('\n');

const cliTable = [
  '| Architecture / OS | Direct Archive Link | Details |',
  '| :--- | :--- | :--- |',
  ...cliRows.map(r => `| ${r.os} | ${r.link} | ${r.desc} |`),
].join('\n');

const notes = `\
### ⚡ Quick Direct Download Links

* 🪟 **Windows**: [Installer (.exe)](${BASE}/${encodeURIComponent(winExeName)}) &bull; [MSI (.msi)](${BASE}/${encodeURIComponent(winMsiName)}) &bull; [Standalone Server/CLI (.zip)](${BASE}/${cliWinZip})
* 🍎 **macOS (Apple Silicon)**: [DMG (.dmg)](${BASE}/${encodeURIComponent(macArmDmgName)}) &bull; [Standalone Server/CLI (.zip)](${BASE}/${cliMacArmZip})
* 🍎 **macOS (Intel)**: [DMG (.dmg)](${BASE}/${encodeURIComponent(macIntelDmgName)}) &bull; [Standalone Server/CLI (.zip)](${BASE}/${cliMacIntelZip})
* 🐧 **Linux**: [AppImage (.AppImage)](${BASE}/${encodeURIComponent(linuxAppImageName)}) &bull; [Debian/Ubuntu (.deb)](${BASE}/${encodeURIComponent(linuxDebName)}) &bull; [Fedora/RHEL (.rpm)](${BASE}/${encodeURIComponent(linuxRpmName)}) &bull; [Standalone (.tar.gz)](${BASE}/${cliLinuxX64Tar})
* 🧩 **Browser Extension**: [Extension Bundle (.zip)](${BASE}/${encodeURIComponent(extZipName)}) *(Chrome, Edge, Brave, Arc)*
* 🌐 **Headless Server / HomeLab**: [Linux x64](${BASE}/${cliLinuxX64Tar}) &bull; [Linux ARM64](${BASE}/${cliLinuxArmTar}) &bull; [macOS ARM64](${BASE}/${cliMacArmZip}) &bull; [Windows x64](${BASE}/${cliWinZip})

---

### 🖥️ Desktop Application Installers

${desktopTable}

> 💡 **macOS Notice**: If macOS Gatekeeper shows *"SuperAgent is damaged and can't be opened"*, run in Terminal:
> ```bash
> xattr -cr /Applications/SuperAgent.app
> ```
> Or go to **System Settings → Privacy & Security** and click **Open Anyway**.

---

### 🧩 Browser Extension

Bring autonomous AI agent capabilities, page summarization, and DOM inspection directly into your browser side panel:

| Package | Direct Download Link | Supported Browsers |
| :--- | :--- | :--- |
| 🧩 **Browser Extension ZIP** | [${extZipName}](${BASE}/${encodeURIComponent(extZipName)}) | Chrome, Edge, Brave, Arc, Opera |

#### Quick Install Instructions:
1. Download **[${extZipName}](${BASE}/${encodeURIComponent(extZipName)})** and unzip it to a folder.
2. Open \`chrome://extensions/\` (or \`edge://extensions/\` / \`brave://extensions/\`).
3. Turn on **Developer mode** toggle in the top-right corner.
4. Click **Load unpacked** and choose the unzipped extension directory.
5. Click the SuperAgent icon in your browser toolbar to open the Side Panel!

---

### 🌐 Standalone Server & CLI (Zero-Dependency)

Run SuperAgent anywhere as a lightweight local web server or terminal CLI with zero runtime dependencies (no Node.js or Rust required):

\`\`\`bash
# Start the local web UI & API server on port 3000
./superagent --serve --serve-port 3000

# Or launch interactive terminal agent mode
./superagent
\`\`\`

${cliTable}

---

**Full Changelog**: https://github.com/${REPO}/compare/v${prevVersion}...v${version}
`;

writeFileSync(resolve(ROOT, 'release-notes.md'), notes, 'utf8');
console.log('[generate-release-notes] Successfully written release-notes.md');
console.log(notes);

