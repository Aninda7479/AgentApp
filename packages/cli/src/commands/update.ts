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

/** Fetches the latest GitHub release version via web redirect or API fallback. */
function getLatestGitHubVersion(): Promise<string | null> {
  return new Promise<string | null>((resolve) => {
    // 1. Primary: Extract version from web redirect (bypasses api.github.com 60 req/hr rate limit)
    const req = https.request(
      `https://github.com/${REPO}/releases/latest`,
      { method: 'HEAD', headers: { 'User-Agent': 'superagent-cli' } },
      (res) => {
        const location = res.headers.location;
        if (location) {
          const match = location.match(/\/tag\/v?([^/]+)$/);
          if (match && match[1]) {
            return resolve(match[1].trim());
          }
        }
        fetchViaApi().then(resolve);
      }
    );
    req.on('error', () => fetchViaApi().then(resolve));
    req.setTimeout(4000, () => { req.destroy(); fetchViaApi().then(resolve); });
    req.end();
  });
}

function fetchViaApi(): Promise<string | null> {
  return new Promise<string | null>((resolve) => {
    const req = https.get(
      RELEASES_API,
      { headers: { 'User-Agent': 'superagent-cli', Accept: 'application/vnd.github+json' } },
      (res) => {
        if (res.statusCode !== 200) return resolve(null);
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
    req.setTimeout(4000, () => { req.destroy(); resolve(null); });
  });
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
 * standalone binary archive from the GitHub Release.
 */
function getBinaryArchiveUrl(version: string): string {
  const platform = process.platform;
  const arch = process.arch;

  let osLabel = 'linux-x64';
  let ext = 'tar.gz';

  if (platform === 'win32') {
    osLabel = 'windows-x64';
    ext = 'zip';
  } else if (platform === 'darwin') {
    osLabel = arch === 'arm64' ? 'macos-arm64' : 'macos-x64';
    ext = 'zip';
  } else if (platform === 'linux') {
    osLabel = arch === 'arm64' ? 'linux-arm64' : 'linux-x64';
    ext = 'tar.gz';
  }

  return `https://github.com/${REPO}/releases/download/v${version}/superagent-cli-v${version}-${osLabel}.${ext}`;
}

/**
 * Self-update command.
 */
export async function runUpdate(options: UpdateOptions = {}): Promise<void> {
  const current = pkg.version;

  console.log('[update] Checking GitHub Releases for the latest version…');
  const latest = await getLatestGitHubVersion();

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
  const binaryUrl = getBinaryArchiveUrl(latest);

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

  // ── Option B: download binary archive directly ───────────────────────────
  console.log('── Option B: Download standalone binary directly');
  console.log(`   ${binaryUrl}`);
  console.log('   Extract and run: ./superagent --serve');
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
