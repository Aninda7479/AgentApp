// One-off generator: parses the awesome-mcp-servers README into a catalog array.
// Run with: node gen-mcp-catalog.mjs
//
// Output: packages/core/src/integrations/catalog-data.ts
//   - GENERATED_MCP_CATALOG: McpCatalogEntry[]
//
// Data-quality rules:
//   * Category headings (`### ...`) keep a clean name + their leading emoji as
//     the per-entry `icon` fallback.
//   * A server is `installable` over stdio only when its bullet text carries a
//     real launch command (npx/uvx/bunx/docker/...). A server is `installable`
//     over http/sse only when a genuine endpoint URL is present — GitHub/GitLab
//     repo URLs that merely contain "mcp" in the slug are NOT endpoints.
//   * Every `https://` bullet link becomes a searchable catalog entry (so the
//     whole list is reachable); non-installable ones fall back to a "Docs" link.

import { readFileSync, writeFileSync } from 'fs';

const md = readFileSync('awesome-mcp.md', 'utf-8');
const lines = md.split('\n');

// Emoji / legend glyphs.
const EMOJI = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}\u{200D}\u{20E3}\u{1F3FB}-\u{1F3FF}#️⃣]/gu;

const START = lines.findIndex((l) => l.trim() === '## Server Implementations');
const END = lines.findIndex((l) => l.trim() === '## Frameworks');
const body = lines.slice(START, END < 0 ? lines.length : END);

const stripHtml = (s) => s.replace(/<[^>]+>/g, ' ');

function clean(text) {
  return stripHtml(text)
    .replace(EMOJI, ' ')
    .replace(/\s+/g, ' ')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // keep link text, drop url
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '') // drop badge images
    .trim();
}

function slug(s) {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

// Hosts that host source code rather than live MCP endpoints.
const CODE_HOSTS = [
  'github.com',
  'gitlab.com',
  'bitbucket.org',
  'sourceforge.net',
  'gitee.com',
  'codeberg.org',
  'npmjs.com',
  'npmjs.org',
  'yarnpkg.com',
  'ghcr.io'
];

// Discovery / catalog sites that list servers but do not expose connectable
// endpoints at their server pages.
const INFO_HOSTS = [
  'glama.ai',
  'mcp.run',
  'smithery.ai',
  'mcp.com',
  'mcpservers.org',
  'pulsemcp.com',
  'mcpverse.ai',
  'directory.mcp'
];

const IMAGE_EXT = /\.(svg|png|jpg|jpeg|gif|webp|ico|bmp)(\?|$)/i;

// True only for URLs that are actual MCP endpoints we can connect to.
function isEndpointUrl(raw) {
  let url;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  const host = url.hostname.toLowerCase();
  const path = url.pathname;
  if (CODE_HOSTS.some((h) => host === h || host.endsWith('.' + h))) return false;
  if (INFO_HOSTS.some((h) => host === h || host.endsWith('.' + h))) return false;
  if (host.endsWith('.github.io')) return false;
  // Images, badges, repo file / doc pages are not endpoints.
  if (IMAGE_EXT.test(path)) return false;
  if (/\/(tree|blob|src|raw|releases|wiki|issues|pull|badges)\//i.test(path)) return false;
  if (/\.md$/i.test(path)) return false;
  // Must look like an API / MCP surface: an api/mcp/sse subdomain, or a path
  // that ends in a known endpoint segment.
  if (/^(api|mcp|sse|rpc)\./i.test(host)) return true;
  if (/(\/|^)(sse|mcp|api|rpc|v\d|graphql|tools)(\/|$)/i.test(path)) return true;
  return false;
}

const STDIO_PATTERNS = [
  /`(npx[^\`]*)`/i,
  /`(uvx[^\`]*)`/i,
  /`(uv run[^\`]*)`/i,
  /`(bunx[^\`]*)`/i,
  /`(deno[^\`]*)`/i,
  /`(docker run[^\`]*)`/i,
  /`(pipx[^\`]*)`/i,
  /`(pip install[^\`]*)`/i,
  /`(python -m[^\`]*)`/i,
  /`(npm install -g[^\`]*)`/i,
  /`(npm i -g[^\`]*)`/i,
  /`(pnpm[^\`]*)`/i,
  /`(npm[^\`]*)`/i,
  /`(claude mcp add[^\`]*)`/i
];

// Pulls the real launcher (`npx -y @pkg`, `uvx pkg`, `docker run …`) out of a
// `claude mcp add <name> <command>` string, falling back to the whole string.
function unwrapClaudeAdd(cmd) {
  const inner = cmd.match(/(npx|uvx|uv run|bunx|deno|docker run|pipx|pip install|python -m)[^\`]*/i);
  if (inner) return inner[0].trim();
  // `claude mcp add <name> <rest>` → keep <rest>
  const rest = cmd.replace(/^claude mcp add\s+\S+\s*/i, '').trim();
  return rest || cmd;
}

function extractStdio(line) {
  for (const p of STDIO_PATTERNS) {
    const m = line.match(p);
    if (m) {
      let cmd = m[1].trim();
      if (/^pip install|pipx/i.test(cmd)) {
        const pkg = cmd.replace(/^(pip install|pipx)\s+/i, '').split(/\s/)[0];
        return `uvx ${pkg}`;
      }
      if (/^npm install -g|^npm i -g/i.test(cmd)) {
        const pkg = cmd.replace(/^npm (install|i) -g\s+/i, '').split(/\s/)[0];
        return `npx -y ${pkg}`;
      }
      if (/^claude mcp add/i.test(cmd)) return unwrapClaudeAdd(cmd);
      return cmd;
    }
  }
  return null;
}

// All http(s) URLs in a line, trailing punctuation stripped.
function allUrls(line) {
  const out = [];
  const re = /(https?:\/\/[^\s)<>"'`]+)/gi;
  let m;
  while ((m = re.exec(line))) {
    out.push(m[1].replace(/[.,;:!?)\]]+$/, ''));
  }
  return out;
}

function extractEndpoint(line, homepage) {
  // Explicit endpoint markers win.
  const labeled = line.match(/(?:Endpoint|SSE|MCP URL|URL):\s*(https?:\/\/\S+)/i);
  if (labeled) {
    const u = labeled[1].replace(/[.,;:!?)\]]+$/, '');
    if (isEndpointUrl(u)) return u;
  }
  for (const u of allUrls(line)) {
    if (u === homepage) continue;
    if (isEndpointUrl(u)) return u;
  }
  return null;
}

// Pick the server's canonical link: prefer a GitHub repo, else the first
// non-image link. Shields/badges at the start of a bullet are ignored.
const IMAGE_HOSTS = ['img.shields.io', 'badgen.net', 'flat.badgen.net', 'badge.fury.io', 'opencollective'];
function pickServerLink(line) {
  const links = [];
  const re = /\[([^\]]*)\]\((https?:\/\/[^)]+)\)/g;
  let m;
  while ((m = re.exec(line))) {
    links.push({ text: m[1].trim(), url: m[2].trim() });
  }
  if (links.length === 0) return null;
  const nonImage = links.filter(
    (l) => !IMAGE_HOSTS.some((h) => l.url.includes(h)) && !/^!?\[?image\]?$/i.test(l.text)
  );
  const pool = nonImage.length ? nonImage : links;
  const gh = pool.find((l) => /github\.com/i.test(l.url));
  if (gh) return gh;
  return pool[0];
}

const entries = [];
const seen = new Set();
let category = '';
let categoryEmoji = '';

/**
 * Turns a raw link label (often `owner/repo` or `owner/mcp-server-foo`) into a
 * clean display name ("Coinopai", "Filesystem") while keeping the id derived
 * from the raw label so it stays stable across regenerations.
 */
function cleanDisplayName(raw) {
  let n = raw;
  if (n.includes('/')) n = n.split('/').pop() || n; // drop the owner/ prefix
  n = n
    .replace(/^mcp[-_]?server[-_]?/i, '')
    .replace(/[-_]?mcp[-_]?server$/i, '')
    .replace(/[-_]?mcp$/i, '')
    .replace(/[-_]?server$/i, '');
  if (!n.trim()) n = raw;
  return n
    .split(/[-_]/)
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1).toLowerCase())
    .join(' ')
    .trim();
}

for (const raw of body) {
  const line = raw.trim();
  if (line.startsWith('### ')) {
    let catRaw = line.replace(/^###\s*/, '');
    const emojiMatch = catRaw.match(EMOJI);
    categoryEmoji = emojiMatch ? emojiMatch[0] : '';
    category = clean(catRaw) || category;
    continue;
  }
  if (!line.startsWith('- [')) continue;

  const link = pickServerLink(line);
  if (!link || !/^https?:\/\//i.test(link.url)) continue;
  const homepage = link.url;

  const rawName = link.text || homepage;
  if (!rawName || /^!?\[?image\]?$/i.test(rawName)) continue;
  const name = cleanDisplayName(rawName);

  // description = text after the closing paren of this link
  const afterLink = line.slice(line.indexOf(')') + 1);
  let description = clean(afterLink).replace(/^[\s\-–—:·•|]+/, '');
  if (!description) description = name;

  let id = slug(rawName);
  let n = 1;
  while (seen.has(id)) id = `${slug(name)}-${++n}`;
  seen.add(id);

  const stdio = extractStdio(line);
  const endpoint = extractEndpoint(line, homepage);

  let command = '';
  let transport = 'stdio';
  let installable = false;
  if (stdio) {
    command = stdio;
    transport = 'stdio';
    installable = true;
  } else if (endpoint) {
    command = endpoint;
    transport = /sse/i.test(endpoint) ? 'sse' : 'http';
    installable = true;
  }

  const tags = [slug(category)].filter(Boolean).slice(0, 3);
  entries.push({
    id,
    name,
    description: description.slice(0, 240),
    transport,
    command,
    args: [],
    envKeys: [],
    tags,
    category,
    icon: categoryEmoji,
    homepage,
    installable
  });
}

const out =
  `// AUTO-GENERATED from awesome-mcp-servers README by gen-mcp-catalog.mjs.\n` +
  `// Do not edit by hand; regenerate instead.\n` +
  `import type { McpCatalogEntry } from './catalog.js';\n\n` +
  `export const GENERATED_MCP_CATALOG: McpCatalogEntry[] = ${JSON.stringify(entries, null, 2)};\n`;

writeFileSync('packages/core/src/integrations/catalog-data.ts', out);
console.log(
  `Generated ${entries.length} catalog entries ` +
    `(installable: ${entries.filter((e) => e.installable).length}, ` +
    `stdio: ${entries.filter((e) => e.installable && e.transport === 'stdio').length}, ` +
    `remote: ${entries.filter((e) => e.installable && e.transport !== 'stdio').length}).`
);
