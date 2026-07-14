// Background research: for every catalog entry whose install command is not yet
// known (docs-only), fetch its GitHub repo README and research the real launch
// command (npx/uvx/docker/bunx/deno/...) or SSE/HTTP endpoint.
//
// Design: fetch is expensive, filtering is cheap. We cache the *loosely*
// extracted candidate per repo, then re-apply the (tightenable) strict rules on
// every run — so changing the rules never requires re-fetching 2,500 repos.
//
// Run: node research-mcp.mjs            (full pass; uses cache)
//      RESEARCH_LIMIT=20 node research-mcp.mjs   (subset, for testing)
//      RESEARCH_DRY=1 …                 (no file write)
import { readFileSync, writeFileSync, existsSync } from 'fs';

const FILE = 'packages/core/src/integrations/catalog-data.ts';
const CACHE_FILE = 'research-cache.json';
const text = readFileSync(FILE, 'utf-8');
const start = text.indexOf('= [');
const arrStart = text.indexOf('[', start);
const arrEnd = text.lastIndexOf('];');
const entries = JSON.parse(text.slice(arrStart, arrEnd + 1));

// ---------- host/url helpers ----------
const CODE_HOSTS = ['github.com', 'gitlab.com', 'bitbucket.org', 'gitee.com', 'codeberg.org'];
const INFO_HOSTS = ['glama.ai', 'mcp.run', 'smithery.ai', 'mcpservers.org', 'pulsemcp.com', 'mcpverse.ai'];
const BADGE_HOSTS = ['img.shields.io', 'badgen.net', 'flat.badgen.net', 'badge.fury.io', 'opengraph.githubassets.com'];
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
// localhost, and example placeholders.
function strictIsEndpoint(u) {
  try {
    const url = new URL(u);
    const h = normalizeHost(url.hostname);
    const p = url.pathname;
    if (CODE_HOSTS.some((x) => h === x || h.endsWith('.' + x))) return false;
    if (INFO_HOSTS.some((x) => h === x || h.endsWith('.' + x))) return false;
    if (BADGE_HOSTS.some((x) => h === x || h.endsWith('.' + x))) return false;
    if (h.endsWith('.github.io')) return false;
    if (/example\.(com|org|net)$/.test(h)) return false;
    if (/^(localhost|127\.0\.0\.1|0\.0\.0\.0|::1|192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+)$/.test(h)) return false;
    if (IMAGE_EXT.test(p) || /\.md$/.test(p)) return false;
    if (/\/(tree|blob|src|raw|releases|wiki|issues|pull|badges|badge|docs)(\/|$)/i.test(p)) return false;
    if (/^(mcp|sse)\./.test(h)) return true;
    if (/(\/|^)(mcp|sse|rpc|graphql|tools)(\/|$)/i.test(p)) return true;
    if (/\/v\d+(\/|$)/.test(p) && /(mcp|sse|rpc|tools)/i.test(p)) return true;
    return false;
  } catch {
    return false;
  }
}

// ---------- stdio command extraction ----------
const STDIO_RE = /`(npx|uvx|uv run|bunx|deno|docker run|pipx|pip install|python -m|npm install -g|npm i -g|pnpm|npm|claude mcp add)[^`]*`/gi;
function cleanStdio(cmd) {
  cmd = cmd.trim();
  if (/^pip install|pipx/i.test(cmd)) {
    const pkg = cmd.replace(/^(pip install|pipx)\s+/i, '').split(/\s/)[0];
    return `uvx ${pkg}`;
  }
  if (/^npm (install|i) -g/i.test(cmd)) {
    const pkg = cmd.replace(/^npm (install|i) -g\s+/i, '').split(/\s/)[0];
    return `npx -y ${pkg}`;
  }
  if (/^claude mcp add/i.test(cmd)) {
    const inner = cmd.match(/(npx|uvx|uv run|bunx|deno|docker run|pipx|pip install|python -m)[^`]*/i);
    return inner ? inner[0].trim() : cmd.replace(/^claude mcp add\s+\S+\s*/i, '').trim();
  }
  return cmd;
}
function extractStdio(readme) {
  const all = [];
  let m;
  STDIO_RE.lastIndex = 0;
  while ((m = STDIO_RE.exec(readme))) all.push(m[1].trim());
  if (all.length === 0) return null;
  const mcp = all.find((c) => /mcp/i.test(c));
  const cmd = cleanStdio(mcp || all[0]);
  if (!cmd) return null;
  if (/create-(react|vite|next|astro)|init\s|@anthropic-ai\/claude-code|claude-code/.test(cmd)) return null;
  // Require a package-like token; reject bare `claude mcp add` / `docker run`.
  const STOP = new Set([
    'mcp', 'add', 'run', 'server', 'install', 'sse', 'stdio', 'mcp-server',
    'start', 'stop', 'list', 'get', 'set', 'use', 'new', 'create', 'init',
    'build', 'test', 'dev', 'serve', 'tools', 'agent', 'agents'
  ]);
  const meaningful = cmd
    .split(/\s+/)
    .filter(
      (t) =>
        !t.startsWith('-') &&
        !/^(npx|uvx|uv|bunx|deno|docker|pnpm|npm|pipx|pip|python|claude)$/i.test(t) &&
        !STOP.has(t.toLowerCase())
    );
  return meaningful.length ? cmd : null;
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

// ---------- cache (loose candidates per repo) ----------
const cache = existsSync(CACHE_FILE) ? JSON.parse(readFileSync(CACHE_FILE, 'utf-8')) : {};
function saveCache() {
  writeFileSync(CACHE_FILE, JSON.stringify(cache));
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function fetchReadme(repo) {
  for (const branch of ['main', 'master']) {
    try {
      const res = await fetch(`https://raw.githubusercontent.com/${repo}/${branch}/README.md`, {
        headers: { 'User-Agent': 'mcp-catalog-research' }
      });
      if (res.status === 200) return (await res.text()).slice(0, 60000);
      if (res.status === 429) {
        await sleep(3000);
        continue;
      }
    } catch {
      /* ignore */
    }
  }
  return null;
}

// Returns the loose candidate for a repo, fetching + caching if missing.
async function candidateFor(repo) {
  if (cache[repo]) return cache[repo];
  const readme = await fetchReadme(repo);
  const cand = readme
    ? { stdio: extractStdio(readme), endpoint: extractEndpointLoose(readme) }
    : { stdio: null, endpoint: null };
  cache[repo] = cand;
  return cand;
}

// Applies the CURRENT strict rules to a loose candidate.
function qualify(cand) {
  if (cand.stdio) return { command: cand.stdio, transport: 'stdio' };
  if (cand.endpoint && strictIsEndpoint(cand.endpoint)) {
    return { command: cand.endpoint, transport: /sse/i.test(cand.endpoint) ? 'sse' : 'http' };
  }
  return null;
}

// ---------- build unique-repo work list ----------
const repoMap = new Map();
for (const e of entries) {
  if (e.installable) continue;
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
console.log(`Researching ${repos.length} unique GitHub repos for ${entries.filter((e) => !e.installable && /github/i.test(e.homepage || '')).length} docs-only entries…${DRY ? ' [DRY RUN]' : ''}`);

let done = 0;
let promoted = 0;
const CONCURRENCY = 6;

async function worker() {
  while (repos.length) {
    const repo = repos.shift();
    const cand = await candidateFor(repo);
    const final = qualify(cand);
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

const workers = Array.from({ length: CONCURRENCY }, () => worker());
await Promise.all(workers);
saveCache();
write();
const total = entries.filter((e) => e.installable).length;
console.log(`DONE. ${total} installable entries (${promoted} promoted this run). Wrote ${FILE}.`);
