import { readFileSync } from 'fs';
const cache = JSON.parse(readFileSync('research-cache.json','utf-8'));
const repos = Object.keys(cache);
// show first entries with stdio, and a few with endpoint
const withStdio = repos.filter(r=>cache[r].stdio).slice(0,5);
console.log('STDIO examples:', JSON.stringify(withStdio.map(r=>[r,cache[r].stdio])));
const withEp = repos.filter(r=>cache[r].endpoint).slice(0,8);
console.log('ENDPOINT examples:');
for(const r of withEp) console.log('  ',r,'->',cache[r].endpoint);
