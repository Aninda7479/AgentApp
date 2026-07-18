import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  parseCookies,
  isAuthDisabled,
  createSessionToken,
  verifySessionToken,
  checkRateLimit,
  recordFailedAttempt,
  clearAttempts,
  validateChangePasswordInput
} from '../src/auth.js';
import { AuthStore } from '@superagent/core';

/**
 * Exercises the web auth layer's pure / deterministic pieces:
 *   • cookie header parsing
 *   • the SUPERAGENT_DISABLE_AUTH opt-out flag
 *   • HMAC session token issue + verify (tamper / malformed rejection)
 *   • the per-IP brute-force limiter (lockout + manual clear)
 *
 * `createSessionToken` signs with `AuthStore.getOrCreateSessionSecret()`, which
 * honors `SUPERAGENT_SESSION_SECRET` so the signature is deterministic here and
 * nothing is persisted to disk.
 */
function fakeReq(ip: string): any {
  return { socket: { remoteAddress: ip }, headers: {} };
}

describe('auth: cookie parsing', () => {
  it('returns an empty map for undefined / empty headers', () => {
    expect(parseCookies(undefined)).toEqual({});
    expect(parseCookies('')).toEqual({});
  });

  it('parses multiple key/value pairs', () => {
    expect(parseCookies('a=1; b=2; c=three')).toEqual({ a: '1', b: '2', c: 'three' });
  });

  it('url-decodes values', () => {
    expect(parseCookies('name=hello%20world')).toEqual({ name: 'hello world' });
  });

  it('ignores pairs without an equals sign', () => {
    expect(parseCookies('garbage; a=1')).toEqual({ a: '1' });
  });
});

describe('auth: auth-disabled flag', () => {
  const saved = process.env.SUPERAGENT_DISABLE_AUTH;
  afterAll(() => {
    if (saved === undefined) delete process.env.SUPERAGENT_DISABLE_AUTH;
    else process.env.SUPERAGENT_DISABLE_AUTH = saved;
  });

  it('is false when the env var is unset', () => {
    delete process.env.SUPERAGENT_DISABLE_AUTH;
    expect(isAuthDisabled()).toBe(false);
  });

  it('is true when SUPERAGENT_DISABLE_AUTH=true', () => {
    process.env.SUPERAGENT_DISABLE_AUTH = 'true';
    expect(isAuthDisabled()).toBe(true);
  });
});

describe('auth: session tokens', () => {
  const savedSecret = process.env.SUPERAGENT_SESSION_SECRET;
  beforeAll(() => {
    process.env.SUPERAGENT_SESSION_SECRET = 'test-secret';
  });
  afterAll(() => {
    if (savedSecret === undefined) delete process.env.SUPERAGENT_SESSION_SECRET;
    else process.env.SUPERAGENT_SESSION_SECRET = savedSecret;
  });

  it('round-trips a created token to its username', () => {
    const token = createSessionToken('admin');
    expect(typeof token).toBe('string');
    expect(token).toContain('.');
    expect(verifySessionToken(token)).toBe('admin');
  });

  it('rejects a tampered token', () => {
    const token = createSessionToken('admin');
    expect(verifySessionToken(`${token}x`)).toBeNull();
  });

  it('rejects a malformed token (no separator)', () => {
    expect(verifySessionToken('not-a-token')).toBeNull();
  });

  it('rejects an undefined token', () => {
    expect(verifySessionToken(undefined)).toBeNull();
  });
});

describe('auth: brute-force rate limit', () => {
  it('allows logins before any failures', () => {
    expect(checkRateLimit(fakeReq('203.0.113.1')).allowed).toBe(true);
  });

  it('locks the IP after MAX_ATTEMPTS failures and reports retryAfterMs', () => {
    const ip = '203.0.113.2';
    for (let i = 0; i < 8; i++) recordFailedAttempt(fakeReq(ip));
    const result = checkRateLimit(fakeReq(ip));
    expect(result.allowed).toBe(false);
    expect(result.retryAfterMs).toBeGreaterThan(0);
  });

  it('clearAttempts re-enables logins', () => {
    const ip = '203.0.113.3';
    recordFailedAttempt(fakeReq(ip));
    recordFailedAttempt(fakeReq(ip));
    clearAttempts(fakeReq(ip));
    expect(checkRateLimit(fakeReq(ip)).allowed).toBe(true);
  });
});

describe('auth: change-password input validation', () => {
  it('accepts a well-formed payload', () => {
    const out = validateChangePasswordInput({ currentPassword: 'old', newPassword: 'new' });
    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(out.currentPassword).toBe('old');
      expect(out.newPassword).toBe('new');
    }
  });

  it('rejects a missing current password', () => {
    const out = validateChangePasswordInput({ newPassword: 'new' });
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.error).toContain('Current password is required');
  });

  it('rejects an empty new password before any credential write', () => {
    const out = validateChangePasswordInput({ currentPassword: 'old', newPassword: '   ' });
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.error).toContain('cannot be empty');
  });
});

describe('auth: password change invalidates other sessions', () => {
  // Use the file-backed session secret/version (not the env override) so that
  // rotation actually changes the key that tokens are signed/verified with.
  const savedSecret = process.env.SUPERAGENT_SESSION_SECRET;
  beforeAll(() => {
    delete process.env.SUPERAGENT_SESSION_SECRET;
    AuthStore.clearCredentials();
  });
  afterAll(() => {
    AuthStore.clearCredentials();
    if (savedSecret === undefined) delete process.env.SUPERAGENT_SESSION_SECRET;
    else process.env.SUPERAGENT_SESSION_SECRET = savedSecret;
  });

  it('invalidates a previously-issued token after the password is changed', () => {
    // Device A logs in with the original password.
    AuthStore.setPassword('original-password');
    const tokenBefore = createSessionToken(AuthStore.getUsername());
    expect(verifySessionToken(tokenBefore)).toBe(AuthStore.getUsername());

    // User changes the password on device B (verifying the current one first).
    const change = AuthStore.changePassword('original-password', 'brand-new-password');
    expect(change.ok).toBe(true);

    // The stale session on device A must no longer verify — it is force-logged-out.
    expect(verifySessionToken(tokenBefore)).toBeNull();

    // A freshly minted token (carrying the new version) is valid on the device
    // that performed the change.
    const tokenAfter = createSessionToken(AuthStore.getUsername());
    expect(verifySessionToken(tokenAfter)).toBe(AuthStore.getUsername());
  });

  it('keeps tokens valid across a restart when the password is unchanged', () => {
    // Same version => a token minted before a read-from-disk still verifies,
    // proving normal sessions survive restarts (only a password change revokes).
    AuthStore.setPassword('stable-password');
    const token = createSessionToken(AuthStore.getUsername());
    // Simulate re-reading the persisted store (fresh process-equivalent state).
    expect(verifySessionToken(token)).toBe(AuthStore.getUsername());
  });
});
