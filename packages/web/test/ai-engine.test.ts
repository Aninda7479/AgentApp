import fs from 'fs';
import os from 'os';
import path from 'path';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createBuiltinTools } from '../src/ai-engine';

let root: string;
const grep = () => createBuiltinTools(root).find((t) => t.name === 'grep_search')!;

beforeAll(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'sa-grep-test-'));
  fs.mkdirSync(path.join(root, 'src'));
  fs.writeFileSync(path.join(root, 'src', 'app.ts'), 'const answer = 42; // the answer\n');
  fs.writeFileSync(path.join(root, 'src', 'util.js'), "console.log('hello');\n");
  fs.writeFileSync(path.join(root, 'readme.md'), 'TODO: write docs\n');
});

afterAll(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

describe('grep_search builtin tool', () => {
  it('finds a matching line with file:line:content formatting', async () => {
    const res = await grep().execute({ pattern: 'answer', directory: '.' });
    expect(res).toContain('answer');
    expect(res).toMatch(/src[\\/]app\.ts:1:/); // path:line: prefix
  });

  it('treats the pattern as literal text — never executes shell metacharacters', async () => {
    const sentinel = path.join(root, 'injected_sentinel');
    expect(fs.existsSync(sentinel)).toBe(false);
    const res = await grep().execute({ pattern: '$(touch injected_sentinel)' });
    // No command may have run: the sentinel file must not exist.
    expect(fs.existsSync(sentinel)).toBe(false);
    // And the pattern is searched literally (no match) rather than executed.
    expect(res).toBe('(no matches found)');
  });

  it('returns a clear message when nothing matches', async () => {
    const res = await grep().execute({ pattern: 'zzz_no_such_string_xyz' });
    expect(res).toBe('(no matches found)');
  });

  it('respects the fileGlob filter', async () => {
    const mdOnly = await grep().execute({ pattern: 'TODO', directory: '.', fileGlob: '*.md' });
    expect(mdOnly).toContain('readme.md');

    const tsOnly = await grep().execute({ pattern: 'TODO', directory: '.', fileGlob: '*.ts' });
    expect(tsOnly).toBe('(no matches found)');
  });
});
