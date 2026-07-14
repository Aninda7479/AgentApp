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
const sample = repos.slice(0, 25);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
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
const INLINE = /`(npx|uvx|uv run|bunx|deno|docker run|pipx|python -m)[^`]*`/i;
const FENCED = /(npx|uvx|uv run|bunx|deno|docker run|pipx|python -m)\s+[^\n]*/i;
let inlineHit = 0,
  fencedHit = 0,
  fencedOnly = 0;
for (const r of sample) {
  const md = await fetchReadme(r);
  if (!md) continue;
  const i = INLINE.test(md),
    f = FENCED.test(md);
  if (i) inlineHit++;
  if (f) fencedHit++;
  if (f && !i) {
    fencedOnly++;
    const m = md.match(FENCED);
    console.log(`  FENCED-ONLY ${r}: ${m[0].slice(0, 70)}`);
  }
}
console.log(
  `\nsample=${sample.length} inline=${inlineHit} anyCmd=${fencedHit} fencedOnly(missed by current)=${fencedOnly}`
);
