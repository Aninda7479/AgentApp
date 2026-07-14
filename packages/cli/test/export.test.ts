import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { formatConversationMarkdown, formatConversationJSON, registerExportCommand } from '../src/commands/export.js';
import { SlashCommandRouter } from '../src/commands/router.js';
import { ContextMessage } from '../src/commands/compact.js';

const SAMPLE: ContextMessage[] = [
  { role: 'system', content: 'You are a helpful assistant.' },
  { role: 'user', content: 'What is the capital of France?' },
  { role: 'assistant', content: 'The capital of France is Paris.' },
  { role: 'tool', content: 'echo ok' }
];

describe('formatConversationMarkdown', () => {
  it('returns a notice for an empty conversation', () => {
    const md = formatConversationMarkdown([]);
    expect(md).toContain('No messages to export');
  });

  it('prefixes a heading and numbers each message by role', () => {
    const md = formatConversationMarkdown(SAMPLE);
    expect(md.startsWith('# SuperAgent Conversation Export')).toBe(true);
    expect(md).toContain('1. System');
    expect(md).toContain('2. User');
    expect(md).toContain('3. Assistant');
    expect(md).toContain('4. Tool');
  });

  it('includes the message bodies', () => {
    const md = formatConversationMarkdown(SAMPLE);
    expect(md).toContain('You are a helpful assistant.');
    expect(md).toContain('The capital of France is Paris.');
  });

  it('renders tool messages inside a code fence', () => {
    const md = formatConversationMarkdown(SAMPLE);
    expect(md).toContain('```\necho ok\n```');
  });
});

describe('formatConversationJSON', () => {
  it('produces a parseable JSON array of role/content records', () => {
    const json = formatConversationJSON(SAMPLE);
    const parsed = JSON.parse(json) as Array<{ role: string; content: string }>;
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed).toHaveLength(4);
    expect(parsed[1]).toEqual({ role: 'user', content: 'What is the capital of France?' });
  });

  it('preserves a numeric tokens field when present', () => {
    const json = formatConversationJSON([{ role: 'user', content: 'hi', tokens: 7 }]);
    const parsed = JSON.parse(json) as Array<{ tokens: number }>;
    expect(parsed[0].tokens).toBe(7);
  });
});

describe('/export command', () => {
  const TMP = mkdtempSync(join(tmpdir(), 'sa-export-'));
  const BLOCKER = join(TMP, 'blocker');

  beforeAll(() => {
    // A regular file standing in for a directory, so writing into it fails.
    writeFileSync(BLOCKER, 'i am a file, not a dir');
  });

  afterAll(() => {
    rmSync(TMP, { recursive: true, force: true });
  });

  function buildRouter(messages: ContextMessage[]): SlashCommandRouter {
    const router = new SlashCommandRouter();
    registerExportCommand(router, { getMessages: () => messages });
    return router;
  }

  it('prints the markdown transcript to stdout when no path is given', async () => {
    const router = buildRouter(SAMPLE);
    const res = await router.execute('/export');
    expect(res.success).toBe(true);
    expect(res.output).toContain('# SuperAgent Conversation Export');
    expect(res.output).toContain('The capital of France is Paris.');
  });

  it('prints a JSON transcript with --json when no path is given', async () => {
    const router = buildRouter(SAMPLE);
    const res = await router.execute('/export --json');
    expect(res.success).toBe(true);
    expect(() => JSON.parse(res.output)).not.toThrow();
    expect(res.output).toContain('"role": "assistant"');
  });

  it('reports when there is nothing to export', async () => {
    const router = buildRouter([]);
    const res = await router.execute('/export');
    expect(res.success).toBe(true);
    expect(res.output).toContain('No messages to export');
  });

  it('writes a markdown file when a path is supplied', async () => {
    const target = join(TMP, 'chat.md');
    const router = buildRouter(SAMPLE);
    const res = await router.execute(`/export ${target}`);
    expect(res.success).toBe(true);
    expect(existsSync(target)).toBe(true);
    const written = readFileSync(target, 'utf8');
    expect(written).toContain('# SuperAgent Conversation Export');
    expect(written).toContain('The capital of France is Paris.');
    expect(res.output).toContain(`Exported 4 message(s) to ${target}`);
  });

  it('writes a JSON file with --json when a path is supplied', async () => {
    const target = join(TMP, 'chat.json');
    const router = buildRouter(SAMPLE);
    const res = await router.execute(`/export --json ${target}`);
    expect(res.success).toBe(true);
    const written = readFileSync(target, 'utf8');
    expect(written.trim().startsWith('[')).toBe(true);
  });

  it('creates parent directories for the export path', async () => {
    const target = join(TMP, 'nested', 'dir', 'out.md');
    const router = buildRouter(SAMPLE);
    const res = await router.execute(`/export ${target}`);
    expect(res.success).toBe(true);
    expect(existsSync(target)).toBe(true);
  });

  it('fails gracefully when the path is not writable', async () => {
    const router = buildRouter(SAMPLE);
    // BLOCKER is a file; writing into it as a directory must fail on every OS.
    const res = await router.execute(`/export ${join(BLOCKER, 'sub', 'out.md')}`);
    expect(res.success).toBe(false);
    expect(res.output).toContain('Failed to export');
  });
});
