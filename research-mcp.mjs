// Background research: for every catalog entry whose install command is not yet
// known (docs-only), fetch its GitHub repo README and research the real launch
// command (npx/uvx/docker/bunx/deno/...) or SSE/HTTP endpoint.
//
// Design: fetch is expensive, filtering is cheap. We cache the *raw README
// snippet* per repo (truncated), then re-apply the (tightenable) strict rules on
// every run — so changing the extraction/qualification rules never requires
// re-fetching 2,500+ repos. The cache also records a `miss` flag for repos that
// failed to fetch so we can retry them once.
//
// Run: node research-mcp.mjs            (full pass; uses cache)
//      RESEARCH_LIMIT=20 node research-mcp.mjs   (subset, for testing)
//      RESEARCH_DRY=1 …                 (no file write)
import { readFileSync, writeFileSync, renameSync, existsSync } from 'fs';

const FILE = 'packages/core/src/integrations/catalog-data.ts';
const CACHE_FILE = 'research-cache.json';
const CONCURRENCY = 6;

const text = readFileSync(FILE, 'utf-8');
const arrStart = text.indexOf('[', text.indexOf('= ['));
const arrEnd = text.lastIndexOf('];');
const entries = JSON.parse(text.slice(arrStart, arrEnd + 1));

// ---------- host/url helpers ----------
const CODE_HOSTS = ['github.com', 'gitlab.com', 'bitbucket.org', 'gitee.com', 'codeberg.org'];
const INFO_HOSTS = ['glama.ai', 'mcp.run', 'smithery.ai', 'mcpservers.org', 'pulsemcp.com', 'mcpverse.ai'];
const BADGE_HOSTS = ['img.shields.io', 'badgen.net', 'flat.badgen.net', 'badge.fury.io', 'opengraph.githubassets.com'];
const DENY_HOSTS = ['vscode.dev', 'insiders.vscode.dev', 'marketplace.visualstudio.com'];
const IMAGE_EXT = /\.(svg|png|jpg|jpeg|gif|webp|ico|bmp)(\?|$)/i;

const normalizeHost = (h) => h.toLowerCase().replace(/^www\./, '');

// Loose: capture any URL that *might* be an endpoint (pre-filtering only).
function looseIsEndpoint(u) {
  try {
    const url = new URL(u);
    const h = normalizeHost(url.hostname);
    const p = url.pathname;
    if (CODE_HOSTS.some((x) => h === x || h.endsWith('.' + x))) return false;
    if (/(\/|^)(tree|blob|src|raw|releases|wiki|issues|pull|badges)(\/|$)/i.test(p)) return false;
    if (IMAGE_EXT.test(p) || /\.md$/.test(p)) return false;
    if (/mcp|sse|api|rpc|graphql|tools/i.test(h + p)) return true;
    return false;
  } catch {
    return false;
  }
}

// Strict: only genuine MCP surfaces. Requires /mcp or /sse (or a terminal
// mcp/sse/rpc/graphql/tools segment); drops generic /api, docs pages, badges,
// localhost, example placeholders, and SaaS/npm landing pages that only *mention*
// mcp in the slug.
function strictIsEndpoint(u) {
  try {
    const url = new URL(u);
    const h = normalizeHost(url.hostname);
    const p = url.pathname;
    if (CODE_HOSTS.some((x) => h === x || h.endsWith('.' + x))) return false;
    if (INFO_HOSTS.some((x) => h === x || h.endsWith('.' + x))) return false;
    if (BADGE_HOSTS.some((x) => h === x || h.endsWith('.' + x))) return false;
    if (DENY_HOSTS.some((x) => h === x || h.endsWith('.' + x))) return false;
    if (h.endsWith('.github.io')) return false;
    // SaaS / package landing pages that are not live endpoints.
    if (/(^|\.)npm\.im$/.test(h) || /(^|\.)(railway\.app|zeabur\.app|render\.com|vercel\.app|netlify\.app|herokuapp\.com)$/.test(h)) return false;
    if (/example\.(com|org|net)$/.test(h)) return false;
    if (/^(localhost|127\.0\.0\.1|0\.0\.0\.0|::1|192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+)$/.test(h)) return false;
    if (IMAGE_EXT.test(p) || /\.md$/.test(p)) return false;
    if (/\/(tree|blob|src|raw|releases|wiki|issues|pull|badges|badge|docs|guides)(\/|$)/i.test(p)) return false;
    if (/^(mcp|sse)\./.test(h)) return true;
    if (/(\/|^)(mcp|sse|rpc|graphql|tools)(\/|$)/i.test(p)) return true;
    if (/\/v\d+\/(mcp|sse|rpc|tools)(\/|$)/i.test(p)) return true;
    return false;
  } catch {
    return false;
  }
}

// ---------- stdio command extraction (fenced blocks + inline) ----------
const CODE_FENCE = /```[\s\S]*?```/g;
const STOP = new Set([
  'mcp', 'add', 'run', 'server', 'install', 'sse', 'stdio', 'mcp-server',
  'start', 'stop', 'list', 'get', 'set', 'use', 'new', 'create', 'init',
  'build', 'test', 'dev', 'serve', 'tools', 'agent', 'agents', 'help',
  'remove', 'rm', 'config', 'update', 'inspect', 'login', 'logout', 'search'
]);
const STDIO_RE = /(npx|uvx|uv run|bunx|deno|docker run|pipx|pip install|python -m|npm install -g|npm i -g|pnpm)\b[^\n]*/i;

function cleanStdio(cmd) {
  cmd = cmd.trim().replace(/\s+/g, ' ');
  if (/^pip install|pipx/i.test(cmd)) {
    const pkg = cmd.replace(/^(pip install|pipx)\s+/i, '').split(/\s/)[0];
    return `uvx ${pkg}`;
  }
  if (/^npm (install|i) -g/i.test(cmd)) {
    const pkg = cmd.replace(/^npm (install|i) -g\s+/i, '').split(/\s/)[0];
    return `npx -y ${pkg}`;
  }
  if (/^claude mcp add/i.test(cmd)) {
    const inner = cmd.match(/(npx|uvx|uv run|bunx|deno|docker run|pipx|pip install|python -m)[^\n]*/i);
    return inner ? inner[0].trim() : null;
  }
  return cmd;
}

// Extract a launch command from a README. Returns null if none is found or all
// candidates are scaffolding/placeholder/non-command lines.
function extractStdio(readme) {
  const candidates = [];
  const fenceRe = new RegExp(CODE_FENCE);
  let m;
  while ((m = fenceRe.exec(readme))) {
    for (const ln of m[0].split('\n')) {
      if (/npx|uvx|uv run|bunx|deno|docker run|pipx|pip install|python -m|npm (install|i)/i.test(ln))
        candidates.push(ln);
    }
  }
  for (const ln of readme.split('\n').map((l) => l.replace(/^[`>]*/, '').trim())) {
    if (/npx|uvx|uv run|bunx|deno|docker run|pipx|pip install|python -m|npm (install|i)/i.test(ln))
      candidates.push(ln);
  }
  for (let raw of candidates) {
    raw = raw.replace(/^`+|`+$/g, '').trim();
    const mm = raw.match(STDIO_RE);
    if (!mm) continue;
    let cmd = cleanStdio(mm[0]);
    if (!cmd) continue;
    // Drop artifacts + placeholders + non-command installs.
    if (/[`"│|]/.test(cmd)) continue;
    if (/example\.(com|org|net)|\byour[-_]|<[^>]+>|#\s*arbitrary|\{\{|\$\{/i.test(cmd)) continue;
    if (/@smithery\/cli|smithery\s+install|npx\s+@modelcontextprotocol\/inspect/i.test(cmd)) continue;
    if (/create-(react|vite|next|astro)|@anthropic-ai\/claude-code|claude-code|\.ts$|\.js$|\/path\/to|\.\./i.test(cmd)) continue;
    if (/^claude mcp add/i.test(cmd)) continue;
    if (/^docker run/i.test(cmd) && !/mcp|server/i.test(cmd)) continue;
    if (/^npm (install|i)/i.test(cmd) && !/mcp|server/i.test(cmd)) continue;
    const meaningful = cmd
      .split(/\s+/)
      .filter(
        (t) =>
          !t.startsWith('-') &&
          !/^(npx|uvx|uv|bunx|deno|docker|pnpm|npm|pipx|pip|python|claude)$/i.test(t) &&
          !STOP.has(t.toLowerCase())
      );
    if (meaningful.length) return cmd;
  }
  return null;
}

function extractEndpointLoose(readme) {
  const re = /(https?:\/\/[^\s)<>"'`]+)/gi;
  let m;
  while ((m = re.exec(readme))) {
    const u = m[1].replace(/[.,;:!?)\]]+$/, '');
    if (looseIsEndpoint(u)) return u;
  }
  return null;
}

// ---------- cache (raw README snippet per repo) ----------
let cache = {};
if (existsSync(CACHE_FILE)) {
  try {
    cache = JSON.parse(readFileSync(CACHE_FILE, 'utf-8'));
  } catch {
    // A truncated/partial cache (e.g. process killed mid-write) must not abort
    // the run. Drop it and start fresh — fetches are cheap to redo.
    console.warn(`WARN: ${CACHE_FILE} corrupt; starting with empty cache.`);
    cache = {};
  }
}
function saveCache() {
  // Atomic write: serialize to a temp file then rename, so a crash mid-write
  // can never leave a half-written (unparseable) cache behind.
  const tmp = CACHE_FILE + '.tmp';
  writeFileSync(tmp, JSON.stringify(cache));
  renameSync(tmp, CACHE_FILE);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const FETCH_TIMEOUT_MS = Number(process.env.RESEARCH_TIMEOUT_MS || 15000);
async function fetchOne(url) {
  for (let attempt = 0; attempt < 2; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': 'mcp-catalog-research' },
        signal: controller.signal
      });
      if (res.status === 200) return (await res.text()).slice(0, 10000);
      if (res.status === 429 || res.status >= 500) await sleep(1500 * (attempt + 1));
    } catch {
      await sleep(500);
    } finally {
      clearTimeout(timer);
    }
  }
  return null;
}
async function fetchReadme(repo, branches = ['main', 'master']) {
  for (const b of branches) {
    const t = await fetchOne(`https://raw.githubusercontent.com/${repo}/${b}/README.md`);
    if (t) return t;
  }
  return null;
}

function parseGithub(url) {
  const m = url.match(/github\.com\/([^/#?]+)\/([^/#?]+)(?:\/(?:tree|blob)\/([^/#?]+)\/?(.+)?)?/i);
  if (!m) return null;
  return {
    owner: m[1],
    repo: m[2].replace(/\.git$/, ''),
    branch: m[3] || null,
    subdir: m[4] ? m[4].replace(/\/$/, '') : null
  };
}

// Returns the raw README snippet for a repo, fetching + caching if missing or
// if a previous fetch failed (miss flag) — so transient failures get retried.
async function rawFor(repo, homepage) {
  // Old cache shape lacked `raw`; treat missing/non-string raw as a miss so the
  // entry is re-fetched and rebuilt in the new {raw,stdio,endpoint,miss} shape.
  if (cache[repo] && !cache[repo].miss && typeof cache[repo].raw === 'string') return cache[repo].raw;
  const g = parseGithub(homepage);
  const branches = g?.branch ? [g.branch, 'main', 'master'] : ['main', 'master'];
  const root = await fetchReadme(repo, branches);
  let raw = root;
  if (g?.subdir) {
    const subUrl = `https://raw.githubusercontent.com/${g.owner}/${g.repo}/${branches[0]}/${g.subdir}/README.md`;
    const sub = await fetchOne(subUrl);
    if (sub) raw = `${sub}\n${root || ''}`;
  }
  if (!raw) {
    cache[repo] = { raw: '', stdio: null, endpoint: null, miss: true };
    return '';
  }
  cache[repo] = { raw, stdio: null, endpoint: null, miss: false };
  return raw;
}

// Applies the CURRENT strict rules to a raw README.
function qualifyFromRaw(raw) {
  if (!raw) return null;
  const stdio = extractStdio(raw);
  if (stdio) return { command: stdio, transport: 'stdio' };
  const endpoint = extractEndpointLoose(raw);
  if (endpoint && strictIsEndpoint(endpoint)) {
    return { command: endpoint, transport: /sse/i.test(endpoint) ? 'sse' : 'http' };
  }
  return null;
}

// ---------- build unique-repo work list ----------
const repoMap = new Map();
for (const e of entries) {
  if (e.installable) continue; // already done; skip to save work
  if (!e.homepage || !/github\.com/i.test(e.homepage)) continue;
  const mm = e.homepage.match(/github\.com\/([^/#?]+)\/([^/#?]+)/i);
  if (!mm) continue;
  const repo = `${mm[1]}/${mm[2].replace(/\.git$/, '')}`;
  if (!repoMap.has(repo)) repoMap.set(repo, []);
  repoMap.get(repo).push(e);
}
let repos = [...repoMap.keys()];
const LIMIT = Number(process.env.RESEARCH_LIMIT || 0);
if (LIMIT > 0 && LIMIT < repos.length) repos.length = LIMIT;
const DRY = process.env.RESEARCH_DRY === '1';
console.log(
  `Researching ${repos.length} unique GitHub repos for ${entries.filter((e) => !e.installable && /github/i.test(e.homepage || '')).length} docs-only entries…${DRY ? ' [DRY RUN]' : ''}`
);

let done = 0;
let promoted = 0;
const CONC = CONCURRENCY;

async function worker() {
  while (repos.length) {
    const repo = repos.shift();
    const raw = await rawFor(repo, repoMap.get(repo)[0].homepage);
    const final = qualifyFromRaw(raw);
    done++;
    if (final) {
      if (DRY) console.log(`  PROMOTE ${repo} -> ${final.command} [${final.transport}]`);
      for (const e of repoMap.get(repo)) {
        e.command = final.command;
        e.transport = final.transport;
        e.installable = true;
        e.args = [];
      }
      promoted += repoMap.get(repo).length;
    }
    if (done % 200 === 0) {
      console.log(`  ${done} repos scanned, ${promoted} entries promoted`);
      saveCache();
    }
  }
}

function write() {
  if (DRY) return;
  const out =
    `// AUTO-GENERATED from awesome-mcp-servers README by gen-mcp-catalog.mjs ` +
    `(enriched by research-mcp.mjs).\n// Do not edit by hand; regenerate instead.\n` +
    `import type { McpCatalogEntry } from './catalog.js';\n\n` +
    `export const GENERATED_MCP_CATALOG: McpCatalogEntry[] = ${JSON.stringify(entries, null, 2)};\n`;
  writeFileSync(FILE, out);
}

const workers = Array.from({ length: CONC }, () => worker());
await Promise.all(workers);
saveCache();
write();
const total = entries.filter((e) => e.installable).length;
console.log(`DONE. ${total} installable entries (${promoted} promoted this run). Wrote ${FILE}.`);
