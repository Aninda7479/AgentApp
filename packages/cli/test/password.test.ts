import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { runPasswordCommand, printPasswordStatus } from '../src/commands/password.js';

/**
 * Exercises the non-interactive surface of the `superagent password` command —
 * the status report and the usage fallback. These are read-only (they only read
 * AuthStore state) and require no stdin, so they are safe to run in CI without
 * touching the shared credential store. The interactive `set` flow (readline
 * prompt -> AuthStore.setPassword) is intentionally not exercised here; it is
 * covered by core's auth-store.test.ts.
 */
describe('CLI password command', () => {
  let logSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    logSpy.mockRestore();
  });

  const logged = () => logSpy.mock.calls.map((c) => String(c[0])).join('\n');

  it('prints usage for an unknown subcommand without touching the store', async () => {
    await runPasswordCommand(['bogus']);
    expect(logged()).toContain('Usage: superagent password');
  });

  it('defaults to the status report when no subcommand is given', async () => {
    await runPasswordCommand([]);
    const out = logged();
    expect(out).toMatch(/Password:/);
    expect(out).toMatch(/SET|NOT SET/);
  });

  it('status subcommand reports the configured-password state', () => {
    printPasswordStatus();
    const out = logged();
    expect(out).toMatch(/Password:/);
    // Read-only: either state is valid; we only assert the command ran.
    expect(out).toMatch(/SET|NOT SET/);
  });
});
