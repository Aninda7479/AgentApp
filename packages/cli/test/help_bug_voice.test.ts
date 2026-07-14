import { describe, it, expect, afterEach } from 'vitest';
import { join } from 'path';
import { existsSync, rmSync, readdirSync } from 'fs';
import {
  SlashCommandRouter,
  registerHelpCommand,
  registerBugCommand,
  BugReporter,
  registerVoiceCommand
} from '../src/index.js';

const TMP = join(process.cwd(), 'tmp', 'help_bug_voice_dir');

describe('help command (/help)', () => {
  it('lists every registered command via the router', async () => {
    const router = new SlashCommandRouter();
    registerHelpCommand(router);
    registerBugCommand(router);
    const res = await router.execute('/help');
    expect(res.success).toBe(true);
    expect(res.output).toContain('Available Slash Commands');
    expect(res.output).toContain('/bug');
    expect(res.output).toContain('/help');
  });
});

describe('BugReporter (/bug)', () => {
  afterEach(() => {
    if (existsSync(TMP)) rmSync(TMP, { recursive: true, force: true });
  });

  it('writes a structured local bug report', () => {
    const report = BugReporter.report('crash on startup', 'steps...', TMP);
    expect(report.id).toMatch(/^bug-/);
    expect(report.summary).toBe('crash on startup');
    expect(report.environment.node).toBeTruthy();

    const dir = BugReporter.getReportsDir(TMP);
    const files = readdirSync(dir);
    expect(files.some((f) => f.startsWith(report.id))).toBe(true);
  });

  it('requires a summary', async () => {
    const router = new SlashCommandRouter();
    registerBugCommand(router);
    const res = await router.execute('/bug');
    expect(res.success).toBe(false);
    expect(res.error).toContain('Missing summary');
  });
});

describe('voice command (/voice)', () => {
  it('acknowledges unsupported state without erroring', async () => {
    const router = new SlashCommandRouter();
    registerVoiceCommand(router);
    const res = await router.execute('/voice on');
    expect(res.success).toBe(true);
    expect(res.output).toContain('not available in the headless CLI');
  });
});
