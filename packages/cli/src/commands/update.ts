import { execFileSync, execSync } from 'child_process';
import { createRequire } from 'module';
import https from 'https';

// Resolve the *running* CLI's own package.json so `current` reflects the
// installed version (works identically after tsc compiles into dist/).
const getPkg = () => {
  try {
    if (typeof require !== 'undefined') {
      return require('../../package.json');
    }
  } catch {}
  const requireFn = createRequire(import.meta.url);
  return requireFn('../../package.json');
};
const pkg = getPkg() as { name: string; version: string };

const REPO = 'Aninda7479/AgentApp';
const RELEASES_API = `https://api.github.com/repos/${REPO}/releases/latest`;

/** Options for the `superagent update` command. */
export interface UpdateOptions {
  /** When true, only report whether a newer version exists (no install). */
  check?: boolean;
}

/** Fetches the latest GitHub release version via the GitHub API (no auth required for public repos). */
function getLatestGitHubVersion(): string | null {
  return new Promise<string | null>((resolve) => {
    const req = https.get(
      RELEASES_API,
      { headers: { 'User-Agent': 'superagent-cli', Accept: 'application/vnd.github+json' } },
      (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
          try {
            const json = JSON.parse(data);
            const tag = json.tag_name as string | undefined;
            resolve(tag ? tag.replace(/^v/, '') : null);
          } catch {
            resolve(null);
          }
        });
      }
    );
    req.on('error', () => resolve(null));
    req.setTimeout(8000, () => { req.destroy(); resolve(null); });
  }) as unknown as string | null;  // sync wrapper below handles the promise
}

/** Synchronous wrapper — runs the async GitHub fetch in a tiny child node process. */
function getLatestVersion(): string | null {
  try {
    const script = `
      const https = require('https');
      const req = https.get(
        '${RELEASES_API}',
        { headers: { 'User-Agent': 'superagent-cli', Accept: 'application/vnd.github+json' } },
        res => {
          let d = '';
          res.on('data', c => d += c);
          res.on('end', () => {
            try {
              const tag = JSON.parse(d).tag_name || '';
              process.stdout.write(tag.replace(/^v/, ''));
            } catch { process.exit(1); }
          });
        }
      );
      req.on('error', () => process.exit(1));
      req.setTimeout(8000, () => { req.destroy(); process.exit(1); });
    `;
    const out = execFileSync(process.execPath, ['-e', script], {
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 10000,
    });
    return out.trim() || null;
  } catch {
    return null;
  }
}

/** Semantic-ish comparison of two `x.y.z` version strings. */
function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map((n) => parseInt(n, 10) || 0);
  const pb = b.split('.').map((n) => parseInt(n, 10) || 0);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const diff = (pa[i] || 0) - (pb[i] || 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

/**
 * Detects the OS / arch and returns the download URL for the appropriate
 * server tarball from the GitHub Release.
 */
function getServerTarballUrl(version: string): string {
  const platform = process.platform;
  const arch = process.arch;

  if (platform === 'win32') {
    return `https://github.com/${REPO}/releases/download/v${version}/superagent-server-v${version}-windows-x64.zip`;
  }
  if (platform === 'darwin') {
    // arm64 covers M1/M2/M3; fall back to linux-x64-equivalent for x86_64 macs
    const label = arch === 'arm64' ? 'macos-arm64' : 'linux-x64';
    return `https://github.com/${REPO}/releases/download/v${version}/superagent-server-v${version}-${label}.zip`;
  }
  // Linux default
  return `https://github.com/${REPO}/releases/download/v${version}/superagent-server-v${version}-linux-x64.tar.gz`;
}

/**
 * Self-update command.
 *
 * Strategy:
 *  1. Hit the GitHub Releases API to find the latest published version.
 *  2. With `--check`: just print whether an update is available.
 *  3. Without `--check`: print download links. If npm is available and the user
 *     is on a global npm install, run `npm install -g @superagent/cli@latest
 *     @superagent/web@latest`. Otherwise, print the GitHub tarball URL so the
 *     user can re-run the install script or grab the binary directly.
 */
export function runUpdate(options: UpdateOptions = {}): void {
  const current = pkg.version;

  console.log('[update] Checking GitHub Releases for the latest version…');
  const latest = getLatestVersion();

  if (!latest) {
    console.error('[update] Could not reach GitHub to check for updates — are you online?');
    console.error(`[update] Latest release: https://github.com/${REPO}/releases/latest`);
    process.exit(1);
  }

  console.log(`SuperAgent  current: v${current}   latest: v${latest}`);

  if (compareVersions(current, latest) >= 0) {
    console.log('[update] You are already on the latest version.');
    return;
  }

  const releaseUrl = `https://github.com/${REPO}/releases/tag/v${latest}`;
  const tarballUrl = getServerTarballUrl(latest);

  if (options.check) {
    console.log(`[update] A newer version (v${latest}) is available.`);
    console.log(`         Release: ${releaseUrl}`);
    console.log(`         Run \`superagent update\` to see install instructions.`);
    return;
  }

  console.log(`\n[update] New version available: v${latest}`);
  console.log(`         Release page: ${releaseUrl}\n`);

  // ── Option A: re-run the install script (recommended for most users) ────
  console.log('── Option A: Re-run the install script (recommended)');
  console.log('   macOS / Linux:');
  console.log(`     curl -fsSL https://aninda7479.github.io/AgentApp/install.sh | sh`);
  console.log('   Windows PowerShell:');
  console.log(`     irm https://aninda7479.github.io/AgentApp/install.ps1 | iex`);
  console.log('');

  // ── Option B: download tarball directly ─────────────────────────────────
  console.log('── Option B: Download tarball directly');
  console.log(`   ${tarballUrl}`);
  console.log('   Extract and run: node cli/dist/bin/main.js --serve');
  console.log('');

  // ── Option C: try npm global install (legacy path) ───────────────────────
  // Only attempt if npm is on PATH — some server setups don't have it.
  let npmAvailable = false;
  try {
    execFileSync('npm', ['--version'], { stdio: 'ignore' });
    npmAvailable = true;
  } catch { /* not available */ }

  if (npmAvailable) {
    console.log('── Option C: npm global update (if originally installed via npm)');
    console.log('   npm install -g @superagent/cli@latest @superagent/web@latest');
    console.log('   (Only works if packages are published to npm — check the release notes)');
  }
}
