// Generates list.md: a checklist of every catalog MCP, grouped by category,
// with a ✅ tick for entries that are now installable (converted docs -> install)
// and [ ] for entries still docs-only. Re-run after research-mcp.mjs to refresh.
import { readFileSync, writeFileSync } from 'fs';

const FILE = 'packages/core/src/integrations/catalog-data.ts';
const text = readFileSync(FILE, 'utf-8');
const arrStart = text.indexOf('[', text.indexOf('= ['));
const arrEnd = text.lastIndexOf('];');
const entries = JSON.parse(text.slice(arrStart, arrEnd + 1));

const installable = entries.filter((e) => e.installable !== false);
const docsOnly = entries.filter((e) => e.installable === false);

const byCat = new Map();
for (const e of entries) {
  const cat = e.category || 'Uncategorized';
  if (!byCat.has(cat)) byCat.set(cat, []);
  byCat.get(cat).push(e);
}

const esc = (s) => (s || '').replace(/[<>]/g, '');
let out = '# MCP Catalog — Docs → Install Progress\n\n';
out += `Total servers: **${entries.length}** · installable: **${installable.length}** ✅ · docs-only: **${docsOnly.length}** [ ]\n\n`;
out += '_Run `node research-mcp.mjs` then `node gen-list.mjs` to refresh ticks._\n\n';

const cats = [...byCat.keys()].sort((a, b) => a.localeCompare(b));
for (const cat of cats) {
  const items = byCat.get(cat).slice().sort((a, b) => {
    const ai = a.installable !== false ? 0 : 1;
    const bi = b.installable !== false ? 0 : 1;
    if (ai !== bi) return ai - bi;
    return a.name.localeCompare(b.name);
  });
  const done = items.filter((e) => e.installable !== false).length;
  out += `## ${esc(cat)} (${done}/${items.length})\n\n`;
  for (const e of items) {
    const tick = e.installable !== false ? '✅' : ' ';
    const cmd = e.installable !== false ? ` — \`${esc(e.transport)}: ${esc(e.command)}\`` : '';
    out += `- [${tick}] ${esc(e.name)} — ${esc(e.homepage)}${cmd}\n`;
  }
  out += '\n';
}

writeFileSync('list.md', out);
console.log(`Wrote list.md: ${entries.length} servers, ${installable.length} installable (✅), ${docsOnly.length} docs-only.`);
