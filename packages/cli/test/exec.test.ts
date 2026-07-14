import { describe, it, expect } from 'vitest';
import { SlashCommandRouter, registerExecSlashCommand, handleExecCommand } from '../src/index.js';
import { PermissionLevel } from '../src/shortcuts/permissions.js';

/** A trivial cross-platform command that emits a known marker to stdout. */
const ECHO_CMD = `node -e "process.stdout.write('exec-marker-42')"`;

describe('CodeReviewer /exec command', () => {
  it('runs a raw shell command and captures stdout', async () => {
    const res = await handleExecCommand(ECHO_CMD, 'auto');
    expect(res.success).toBe(true);
    expect(res.message).toContain('exec-marker-42');
    expect(res.message).toContain('=== Command Output ===');
  });

  it('refuses execution when permission is deny', async () => {
    const res = await handleExecCommand(ECHO_CMD, 'deny');
    expect(res.success).toBe(false);
    expect(res.message).toContain('denied');
  });

  it('returns a usage hint when no command is given', async () => {
    const res = await handleExecCommand('', 'auto');
    expect(res.success).toBe(false);
    expect(res.message).toContain('Usage: /exec');
  });

  it('routes a leading ! through the router to the exec handler', async () => {
    const router = new SlashCommandRouter();
    registerExecSlashCommand(router, { permission: 'auto' });

    const parsed = router.parse('! ' + ECHO_CMD);
    expect(parsed?.command).toBe('exec');
    expect(parsed?.rawArgs).toBe(ECHO_CMD);

    const res = await router.execute('! ' + ECHO_CMD);
    expect(res.success).toBe(true);
    expect(res.output).toContain('exec-marker-42');
  });

  it('supports the /exec slash form with the run alias', async () => {
    const router = new SlashCommandRouter();
    registerExecSlashCommand(router, { permission: 'auto' });

    const viaSlash = await router.execute('/exec ' + ECHO_CMD);
    expect(viaSlash.success).toBe(true);
    expect(viaSlash.output).toContain('exec-marker-42');

    const viaAlias = await router.execute('/run ' + ECHO_CMD);
    expect(viaAlias.success).toBe(true);
    expect(viaAlias.output).toContain('exec-marker-42');
  });

  it('isSlashCommand recognizes a leading ! as a routed command', () => {
    const router = new SlashCommandRouter();
    registerExecSlashCommand(router, { permission: 'auto' });
    expect(router.isSlashCommand('! ls -la')).toBe(true);
    expect(router.isSlashCommand('/help')).toBe(true);
    expect(router.isSlashCommand('hello there')).toBe(false);
  });

  it('reports failure for a command that exits non-zero', async () => {
    const res = await handleExecCommand(`node -e "process.exit(3)"`, 'auto');
    expect(res.success).toBe(false);
    expect(res.message).toContain('Command Failed');
  });
});
