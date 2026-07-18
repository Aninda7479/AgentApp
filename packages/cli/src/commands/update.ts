import { execFileSync } from 'child_process';
import { createRequire } from 'module';

// Resolve the *running* CLI's own package.json so `current` reflects the
// installed version (works identically after tsc compiles into dist/).
const require = createRequire(import.meta.url);
const pkg = require('../../package.json') as { name: string; version: string };

/** The published packages that make up the "Core + CLI + Web" install (Option 1). */
const CORE_CLI_WEB = ['@superagent/cli', '@superagent/web'];

/** Options for the `superagent update` command. */
export interface UpdateOptions {
  /** When true, only report whether a newer version exists (no install). */
  check?: boolean;
}

/**
 * Fetches the latest published version of a scoped package from the public npm
 * registry. Returns null if npm is unreachable or the package isn't published
 * yet — callers degrade gracefully rather than crashing.
 */
function getLatestVersion(spec: string): string | null {
  try {
    const out = execFileSync('npm', ['view', spec, 'version'], {
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    return out.trim();
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
 * Self-update for the "Core + CLI + Web" distribution (Option 1). The same two
 * packages published by the release workflow (`@superagent/cli`, `@superagent/web`)
 * are re-installed globally here, keeping a `npm install -g` install in sync with
 * the latest published version. With `--check` it only reports, mirroring the
 * desktop's "Check for Updates" panel.
 */
export function runUpdate(options: UpdateOptions = {}): void {
  const current = pkg.version;
  const latest = getLatestVersion('@superagent/cli');

  if (!latest) {
    console.error('[update] Could not reach npm to check for updates — are you online?');
    console.error('[update] You can update manually:');
    console.error(`         npm install -g ${CORE_CLI_WEB.join(' ')}`);
    process.exit(1);
  }

  console.log(`SuperAgent CLI  current: v${current}   latest: v${latest}`);

  if (compareVersions(current, latest) >= 0) {
    console.log('[update] You are already on the latest version.');
    return;
  }

  if (options.check) {
    console.log(`[update] A newer version (v${latest}) is available — run \`superagent update\` to install it.`);
    return;
  }

  console.log(`[update] Installing ${CORE_CLI_WEB.join(' + ')} v${latest} globally…`);
  try {
    execFileSync('npm', ['install', '-g', '@superagent/cli@latest', '@superagent/web@latest'], {
      stdio: 'inherit',
    });
    console.log('[update] Done. Restart your terminal (or run `hash -r`) if the `superagent` binary did not refresh.');
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[update] Automatic update failed: ${message}`);
    console.error('[update] Install manually with:');
    console.error(`         npm install -g ${CORE_CLI_WEB.join(' ')}`);
    console.error('         (prefix with sudo, or use nvm/n, if you hit an EACCES permissions error)');
    process.exit(1);
  }
}
