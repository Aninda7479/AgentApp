import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { AuthStore } from '../src/storage/auth-store.js';
import { getConfigDirectory } from '../src/storage/locations.js';
import { promises as fs } from 'fs';
import { join } from 'path';

/**
 * Exercises the shared credential store used by both the Web server and the CLI.
 * The login is password-only (no username field), so these tests exercise the
 * password lifecycle directly. In VITEST mode core routes its data into a
 * per-worker temp dir, so we simply delete `auth.json` between tests.
 */
describe('AuthStore', () => {
  const authFile = join(getConfigDirectory(), 'auth.json');

  beforeEach(async () => {
    await fs.rm(authFile, { force: true });
  });

  afterEach(async () => {
    await fs.rm(authFile, { force: true });
  });

  it('reports no password before setup', () => {
    expect(AuthStore.isPasswordSet()).toBe(false);
  });

  it('accepts the default password "admin" when none is set', () => {
    expect(AuthStore.verifyPassword('admin')).toBe(true);
    expect(AuthStore.verifyPassword('wrong')).toBe(false);
  });

  it('stops accepting the default once a custom password is set', () => {
    AuthStore.setPassword('strongpass');
    expect(AuthStore.verifyPassword('admin')).toBe(false);
    expect(AuthStore.verifyPassword('strongpass')).toBe(true);
  });

  it('sets and verifies a password', () => {
    const res = AuthStore.setPassword('hunter2!');
    expect(res.ok).toBe(true);
    expect(AuthStore.isPasswordSet()).toBe(true);

    const verify = AuthStore.verifyPassword('hunter2!');
    expect(verify).toBe(true);
  });

  it('rejects the wrong password', () => {
    AuthStore.setPassword('correct');
    const verify = AuthStore.verifyPassword('wrong');
    expect(verify).toBe(false);
  });

  it('changes the password after verifying the current one', () => {
    AuthStore.setPassword('oldpass');
    const res = AuthStore.changePassword('oldpass', 'newpass');
    expect(res.ok).toBe(true);
    expect(AuthStore.verifyPassword('newpass')).toBe(true);
    expect(AuthStore.verifyPassword('oldpass')).toBe(false);
  });

  it('refuses to change with the wrong current password', () => {
    AuthStore.setPassword('oldpass');
    const res = AuthStore.changePassword('wrongpass', 'newpass');
    expect(res.ok).toBe(false);
  });

  it('persists credentials across reloads', async () => {
    AuthStore.setPassword('secret');
    await fs.rm(authFile, { force: true });
    expect(AuthStore.isPasswordSet()).toBe(false);
    expect(AuthStore.verifyPassword('secret')).toBe(false);
  });

  it('clears credentials', () => {
    AuthStore.setPassword('secret');
    AuthStore.clearCredentials();
    expect(AuthStore.isPasswordSet()).toBe(false);
  });

  it('seeds credentials from the environment once', () => {
    process.env.SUPERAGENT_USERNAME = 'boss';
    process.env.SUPERAGENT_PASSWORD = 'envpass';
    AuthStore.ensureSeededFromEnv();
    expect(AuthStore.isPasswordSet()).toBe(true);
    expect(AuthStore.getUsername()).toBe('boss');
    expect(AuthStore.verifyPassword('envpass')).toBe(true);
    delete process.env.SUPERAGENT_USERNAME;
    delete process.env.SUPERAGENT_PASSWORD;
  });

  it('produces a stable session secret', () => {
    const a = AuthStore.getOrCreateSessionSecret();
    const b = AuthStore.getOrCreateSessionSecret();
    expect(a).toBe(b);
    expect(a.length).toBeGreaterThanOrEqual(32);
  });
});
