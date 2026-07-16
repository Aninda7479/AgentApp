import fs from 'fs';
import os from 'os';
import path from 'path';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createBuiltinTools, resolveWithinAnyRoot, isCommandAllowed } from '../src/main/ai-engine';

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

describe('resolveWithinAnyRoot (read-file-base64 scope check)', () => {
  // Mirrors the web read-file-base64 scope check (e38c276) for the desktop
  // side: the channel may only read from the user-data dir or a configured
  // project folder — never arbitrary files on disk.
  const userData = path.join(os.tmpdir(), 'sa-userdata');
  const project = path.join(os.tmpdir(), 'sa-project');
  const roots = [userData, project];

  it('allows a file inside the user-data root', () => {
    const inside = path.join(userData, 'chat', 'pic.png');
    expect(resolveWithinAnyRoot(inside, roots)).toBe(path.resolve(inside));
  });

  it('allows a file inside a configured project folder', () => {
    const inside = path.join(project, 'src', 'app.ts');
    expect(resolveWithinAnyRoot(inside, roots)).toBe(path.resolve(inside));
  });

  it('rejects a path escaping every allowed root via ../', () => {
    const escaped = path.join(userData, '..', '..', 'etc', 'passwd');
    expect(resolveWithinAnyRoot(escaped, roots)).toBeNull();
  });

  it('rejects an absolute path outside all allowed roots', () => {
    expect(resolveWithinAnyRoot('/etc/passwd', roots)).toBeNull();
    expect(resolveWithinAnyRoot('C:\\Windows\\system32\\secrets.txt', roots)).toBeNull();
  });

  it('rejects a root-sibling that only shares a name prefix', () => {
    const sibling = userData + '-evil';
    fs.mkdirSync(sibling, { recursive: true });
    try {
      expect(resolveWithinAnyRoot(path.join(sibling, 'x.png'), roots)).toBeNull();
    } finally {
      fs.rmSync(sibling, { recursive: true, force: true });
    }
  });

  it('is case-insensitive so it holds on Windows paths', () => {
    const mixed = path.join(userData.toUpperCase(), 'Chat', 'PIC.PNG');
    expect(resolveWithinAnyRoot(mixed, roots)).toBe(path.resolve(mixed));
  });
});

describe('isCommandAllowed (run_command allowlist)', () => {
  // The desktop ConfigureProjectModal lets a user pre-approve commands; this
  // guard enforces that allowlist in run_command. Empty list = opt-in off.
  it('permits everything when the allowlist is empty/undefined', () => {
    expect(isCommandAllowed('rm -rf /', [])).toBe(true);
    expect(isCommandAllowed('git status', undefined)).toBe(true);
  });

  it('rejects a non-matching command when an allowlist is set', () => {
    expect(isCommandAllowed('rm -rf /', ['git', 'npm run build'])).toBe(false);
  });

  it('permits an exact single-token match', () => {
    expect(isCommandAllowed('git', ['git'])).toBe(true);
  });

  it('permits a command whose first token matches the allowed prefix', () => {
    expect(isCommandAllowed('git status --short', ['git'])).toBe(true);
    expect(isCommandAllowed('npm run build', ['npm'])).toBe(true);
  });

  it('permits a multi-word allowed entry as an exact or prefixed command', () => {
    expect(isCommandAllowed('git status', ['git status'])).toBe(true);
    expect(isCommandAllowed('git status --short', ['git status'])).toBe(true);
  });

  it('does NOT let a longer command piggyback on a token-prefix', () => {
    // "git" must not permit "github-clone evil.com"
    expect(isCommandAllowed('github-clone evil.com', ['git'])).toBe(false);
  });

  it('trims whitespace before matching', () => {
    expect(isCommandAllowed('  git status  ', ['git'])).toBe(true);
  });
});

describe('run_command tool honors the project allowlist', () => {
  it('refuses a command outside the allowlist without executing it', async () => {
    const tool = createBuiltinTools(root, ['echo']).find((t) => t.name === 'run_command')!;
    const res = await tool.execute({ command: 'rm -rf /' });
    expect(res).toContain('not in the project');
  });

  it('runs a command inside the allowlist', async () => {
    const tool = createBuiltinTools(root, ['echo']).find((t) => t.name === 'run_command')!;
    const res = await tool.execute({ command: 'echo allowed' });
    expect(res).toContain('allowed');
  });

  it('runs any command when no allowlist is set (opt-in off)', async () => {
    const tool = createBuiltinTools(root).find((t) => t.name === 'run_command')!;
    const res = await tool.execute({ command: 'echo free' });
    expect(res).toContain('free');
  });
});
