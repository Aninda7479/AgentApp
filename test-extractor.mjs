// Validate the improved stdio extractor (fenced blocks + inline) on a sample
// of docs-only github repos, WITHOUT relying on the old cache.
import { readFileSync } from 'fs';

const text = readFileSync('packages/core/src/integrations/catalog-data.ts', 'utf-8');
const arrStart = text.indexOf('[', text.indexOf('= ['));
const entries = JSON.parse(text.slice(arrStart, text.lastIndexOf('];') + 1));
const docs = entries.filter((e) => !e.installable && /github\.com/i.test(e.homepage || ''));
const repos = [...new Set(
  docs
    .map((e) => {
      const m = e.homepage.match(/github\.com\/([^/#?]+)\/([^/#?]+)/i);
      return m ? `${m[1]}/${m[2].replace(/\.git$/, '')}` : null;
    })
    .filter(Boolean)
)];

const CODE_FENCE = /```[\s\S]*?```/g;
const STOP = new Set([
  'mcp', 'add', 'run', 'server', 'install', 'sse', 'stdio', 'mcp-server',
  'start', 'stop', 'list', 'get', 'set', 'use', 'new', 'create', 'init',
  'build', 'test', 'dev', 'serve', 'tools', 'agent', 'agents', 'help',
  'remove', 'rm', 'config', 'update', 'inspect'
]);
const STDIO_RE = /(npx|uvx|uv run|bunx|deno|docker run|pipx|pip install|python -m|npm install -g|npm i -g|pnpm)\b[^\n]*/gi;

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
function extractStdio(readme) {
  const blocks = [];
  let m;
  const fenceRe = new RegExp(CODE_FENCE);
  while ((m = fenceRe.exec(readme))) blocks.push(m[0]);
  const lines = readme.split('\n').map((l) => l.replace(/^[`>]*/, '').trim());
  const candidates = [];
  for (const b of blocks) {
    for (const ln of b.split('\n')) {
      if (/npx|uvx|uv run|bunx|deno|docker run|pipx|pip install|python -m|npm (install|i)/i.test(ln))
        candidates.push(ln);
    }
  }
  for (const ln of lines) {
    if (/npx|uvx|uv run|bunx|deno|docker run|pipx|pip install|python -m|npm (install|i)/i.test(ln))
      candidates.push(ln);
  }
  for (let raw of candidates) {
    raw = raw.replace(/^`+|`+$/g, '').trim();
    const mm = raw.match(STDIO_RE);
    if (!mm) continue;
    let cmd = cleanStdio(mm[0]);
    if (!cmd) continue;
    if (/create-(react|vite|next|astro)|init\s|@anthropic-ai\/claude-code|claude-code|\.ts$|\.js$|\/path\/to|\.\./i.test(cmd)) continue;
    if (/^docker run/i.test(cmd) && !/mcp|server/i.test(cmd)) continue;
    if (/^(npm install|npm i)/i.test(cmd) && !/mcp|server/i.test(cmd)) continue;
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

const sample = repos.slice(0, 40);
async function fetchReadme(repo) {
  for (const b of ['main', 'master']) {
    try {
      const res = await fetch(`https://raw.githubusercontent.com/${repo}/${b}/README.md`, {
        headers: { 'User-Agent': 'x' }
      });
      if (res.status === 200) return await res.text();
    } catch {}
  }
  return null;
}
let found = 0,
  fetched = 0;
for (const r of sample) {
  const md = await fetchReadme(r);
  if (md) fetched++;
  const cmd = md ? extractStdio(md) : null;
  if (cmd) {
    found++;
    console.log(`  ✅ ${r}: ${cmd.slice(0, 80)}`);
  }
}
console.log(`\nsample=${sample.length} fetched=${fetched} new-installable-found=${found}`);
