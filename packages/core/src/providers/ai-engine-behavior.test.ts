/**
 * Behavior tests for the provider-agnostic helpers in ai-engine.ts that were
 * previously at 0% coverage:
 *   - isCommandAllowed (command allowlist policy, security-relevant)
 *   - isContextOverflowError (provider error classification for retry/rerouting)
 *   - the `grep_search` built-in tool (exercises the private grepSearch /
 *     walkFiles / globToRegExp helpers through the public API)
 *
 * These are pure / filesystem-only behaviors — no AI provider, network, or
 * browser mocking required. We test observable behavior, not implementation.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync, mkdirSync } from 'fs';
import { tmpdir } from 'os';
import { join, sep } from 'path';
import { isCommandAllowed, isContextOverflowError, createBuiltinTools } from './ai-engine.js';

describe('isCommandAllowed', () => {
  it('permits everything when the allowlist is empty or undefined (confinement is opt-in)', () => {
    expect(isCommandAllowed('rm -rf /', [])).toBe(true);
    expect(isCommandAllowed('git status', undefined)).toBe(true);
    expect(isCommandAllowed('git status')).toBe(true);
  });

  it('allows an exact command match against the allowlist', () => {
    expect(isCommandAllowed('git status', ['git status', 'ls'])).toBe(true);
  });

  it('allows a command whose first token is an allowed prefix ("git" permits "git status")', () => {
    expect(isCommandAllowed('git status --short', ['git'])).toBe(true);
    expect(isCommandAllowed('git', ['git'])).toBe(true);
  });

  it('rejects a command that only shares a substring of the first token ("github-clone" != "git")', () => {
    expect(isCommandAllowed('github-clone owner/repo', ['git'])).toBe(false);
  });

  it('rejects an empty command string when an allowlist is active', () => {
    expect(isCommandAllowed('   ', ['git'])).toBe(false);
    expect(isCommandAllowed('', ['git'])).toBe(false);
  });

  it('rejects a command whose first token is not in the allowlist', () => {
    expect(isCommandAllowed('npm install', ['git', 'ls'])).toBe(false);
  });
});

describe('isContextOverflowError', () => {
  it('returns false for an empty or undefined message', () => {
    expect(isContextOverflowError('')).toBe(false);
    expect(isContextOverflowError(null as unknown as string)).toBe(false);
  });

  it('detects the common "context length" / "context window" overflow phrasings', () => {
    expect(isContextOverflowError('Error: context length exceeded')).toBe(true);
    expect(isContextOverflowError('maximum context window reached')).toBe(true);
  });

  it('detects token-limit and input-length overflow phrasings', () => {
    expect(isContextOverflowError('request exceeds maximum token limit')).toBe(true);
    expect(isContextOverflowError('prompt is too long for this model')).toBe(true);
    expect(isContextOverflowError('input length 90000 exceeds model maximum')).toBe(true);
  });

  it('is case-insensitive', () => {
    expect(isContextOverflowError('CONTEXT LENGTH EXCEEDED')).toBe(true);
  });

  it('returns false for an unrelated error message', () => {
    expect(isContextOverflowError('invalid API key')).toBe(false);
    expect(isContextOverflowError('network timeout')).toBe(false);
  });
});

describe('grep_search tool (via createBuiltinTools)', () => {
  let root: string;
  let grep: { execute: (args: Record<string, any>) => Promise<any> } | undefined;

  beforeAll(() => {
    root = mkdtempSync(join(tmpdir(), 'sa-grep-'));
    writeFileSync(join(root, 'a.txt'), 'line one\nhello world on line two\nline three\n');
    writeFileSync(join(root, 'b.txt'), 'nothing matches here\njust text\n');
    writeFileSync(join(root, 'notes.md'), 'hello from markdown\n');
    // binary-ish file containing the literal search term among null bytes
    writeFileSync(join(root, 'blob.bin'), Buffer.from([0x00, 0x68, 0x65, 0x6c, 0x6c, 0x6f, 0x00]));
    const sub = join(root, 'sub');
    mkdirSync(sub);
    writeFileSync(join(sub, 'c.txt'), 'hello nested\n');

    const tools = createBuiltinTools(root);
    grep = tools.find((t) => t.name === 'grep_search');
  });

  afterAll(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('returns a tool named grep_search from createBuiltinTools', () => {
    expect(grep).toBeDefined();
  });

  it('finds matches across files and reports a per-file summary', async () => {
    const out = await grep!.execute({ pattern: 'hello' });
    expect(out).toContain('a.txt:2:hello world on line two');
    expect(out).toContain('notes.md:1:hello from markdown');
    expect(out).toContain(`sub${sep}c.txt:1:hello nested`);
    expect(out).toContain('Found 3 match(es) across 5 file(s).');
  });

  it('returns a no-match sentinel when nothing matches', async () => {
    const out = await grep!.execute({ pattern: 'zzzzz-no-such-text' });
    expect(out).toBe('(no matches found)');
  });

  it('reports an error for an invalid regular expression', async () => {
    const out = await grep!.execute({ pattern: '(' });
    expect(out).toContain('Error: invalid search pattern: (');
  });

  it('filters by file extension when fileGlob is supplied', async () => {
    const out = await grep!.execute({ pattern: 'hello', fileGlob: '*.txt' });
    expect(out).toContain('a.txt:2:hello world on line two');
    expect(out).toContain(`sub${sep}c.txt:1:hello nested`);
    // notes.md must be excluded by the glob
    expect(out).not.toContain('notes.md');
    expect(out).toContain('Found 2 match(es) across 3 file(s).');
  });

  it('skips binary files (those containing a NUL byte)', async () => {
    // 'hello' exists in blob.bin but it is treated as binary and skipped
    const out = await grep!.execute({ pattern: 'hello' });
    expect(out).not.toContain('blob.bin');
    expect(out).toContain('Found 3 match(es) across 5 file(s).');
  });
});
