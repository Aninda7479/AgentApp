import fs from 'fs';
import os from 'os';
import path from 'path';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createBuiltinTools } from '../src/main/ai-engine';

let root: string;
const get = (name: string) => createBuiltinTools(root).find((t) => t.name === name)!;

beforeAll(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'sa-desktop-grep-test-'));
  fs.mkdirSync(path.join(root, 'src'));
  fs.writeFileSync(path.join(root, 'src', 'app.ts'), 'const answer = 42; // the answer\n');
  fs.writeFileSync(path.join(root, 'src', 'util.js'), "console.log('hello');\n");
  fs.writeFileSync(path.join(root, 'readme.md'), 'TODO: write docs\n');
});

afterAll(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

describe('grep_search builtin tool (desktop)', () => {
  it('finds a matching line with file:line:content formatting', async () => {
    const res = await get('grep_search').execute({ pattern: 'answer', directory: '.' });
    expect(res).toContain('answer');
    expect(res).toMatch(/src[\\/]app\.ts:1:/); // path:line: prefix
  });

  it('treats the pattern as literal text — never executes shell metacharacters', async () => {
    const sentinel = path.join(root, 'injected_sentinel');
    expect(fs.existsSync(sentinel)).toBe(false);
    const res = await get('grep_search').execute({ pattern: '$(touch injected_sentinel)' });
    // No command may have run: the sentinel file must not exist.
    expect(fs.existsSync(sentinel)).toBe(false);
    // And the pattern is searched literally (no match) rather than executed.
    expect(res).toBe('(no matches found)');
  });

  it('returns a clear message when nothing matches', async () => {
    const res = await get('grep_search').execute({ pattern: 'zzz_no_such_string_xyz' });
    expect(res).toBe('(no matches found)');
  });

  it('respects the fileGlob filter', async () => {
    const mdOnly = await get('grep_search').execute({ pattern: 'TODO', directory: '.', fileGlob: '*.md' });
    expect(mdOnly).toContain('readme.md');

    const tsOnly = await get('grep_search').execute({ pattern: 'TODO', directory: '.', fileGlob: '*.ts' });
    expect(tsOnly).toBe('(no matches found)');
  });
});

describe('builtin file tools respect project-root scoping (desktop)', () => {
  it('read_file refuses paths outside the project root', async () => {
    const res = await get('read_file').execute({ path: '../escape.txt' });
    expect(res).toContain('outside the project root');
  });

  it('list_dir refuses paths outside the project root', async () => {
    const res = await get('list_dir').execute({ path: '..' });
    expect(res).toContain('outside the project root');
  });

  it('grep_search refuses a directory outside the project root', async () => {
    const res = await get('grep_search').execute({ pattern: 'x', directory: '../' });
    expect(res).toContain('outside the project root');
  });

  it('write_file refuses paths outside the project root and writes nothing', async () => {
    const escapeTarget = path.join(root, '..', 'escaped_write.txt');
    expect(fs.existsSync(escapeTarget)).toBe(false);
    const res = await get('write_file').execute({ path: '../escaped_write.txt', content: 'pwned' });
    expect(res).toContain('outside the project root');
    expect(fs.existsSync(escapeTarget)).toBe(false);
  });

  it('still allows legitimate in-root access', async () => {
    const res = await get('read_file').execute({ path: 'readme.md' });
    expect(res).toContain('TODO: write docs');
  });
});
