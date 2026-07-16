import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  parseCookies,
  isAuthDisabled,
  createSessionToken,
  verifySessionToken,
  checkRateLimit,
  recordFailedAttempt,
  clearAttempts
} from '../src/auth.js';

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
