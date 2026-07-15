import { readFileSync, existsSync } from 'fs';
if (!existsSync('research-cache.json')) {
  console.error('research-cache.json not found. Run `node research-mcp.mjs` first to build the cache.');
  process.exit(1);
}
let cache;
try {
  cache = JSON.parse(readFileSync('research-cache.json', 'utf-8'));
} catch {
  console.error('research-cache.json is corrupt. Delete it and re-run `node research-mcp.mjs`.');
  process.exit(1);
}
const repos = Object.keys(cache);
let hasStdio=0, hasEndpoint=0, both=0, neither=0;
for (const r of repos) {
  const c = cache[r];
  const s = !!c.stdio, e = !!c.endpoint;
  if (s) hasStdio++;
  if (e) hasEndpoint++;
  if (s&&e) both++;
  if (!s&&!e) neither++;
}
console.log(`cached repos: ${repos.length}`);
console.log(`  with stdio candidate: ${hasStdio}`);
console.log(`  with endpoint candidate: ${hasEndpoint}`);
console.log(`  neither (README fetched but no command found, OR fetch failed): ${neither}`);
