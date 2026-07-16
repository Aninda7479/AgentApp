// ─── SuperAgent Web/VPS Authentication ──────────────────────────────────────
// Session layer for the web server. Credential storage/verification lives in
// the shared core (`AuthStore`) so the CLI, Desktop and Web all manage the SAME
// admin account. This file only owns web-specific concerns:
//   • Signed, HttpOnly session cookies (HMAC-SHA256, tamper-proof)
//   • Per-IP brute-force rate limiting with temporary lockout
//   • The Express middleware/gate and auth route handlers
//   • Enforcing auth on the WebSocket upgrade handshake
//
// Credential lifecycle (set / verify / change) is handled by core's AuthStore,
// which persists to `<userData>/Config/auth.json`.
//
// Environment variables:
//   SUPERAGENT_PASSWORD         Seed password on first run (plaintext, optional)
//   SUPERAGENT_SESSION_SECRET   Secret used to sign sessions     (persisted if unset)
//   SUPERAGENT_SESSION_TTL      Session lifetime in hours        (default: 168 = 7 days)
//   SUPERAGENT_SECURE_COOKIES   "true" to mark cookies Secure (HTTPS only)
//   SUPERAGENT_DISABLE_AUTH     "true" to run in open mode (local/dev only)
//
// By default the web surface REQUIRES authentication. The login is password-only:
// there is no username field — ownership of the single admin password is the only
// proof of identity. If no password exists yet, visitors are guided through a
// one-time setup flow to create it.

import crypto from 'crypto';
import type { Request, Response, NextFunction } from 'express';
import type { IncomingMessage } from 'http';
import { AuthStore } from '@superagent/core';

/** Name of the session cookie. */
const COOKIE_NAME = 'sa_session';

/** Whether authentication is disabled entirely (explicit opt-out for local dev). */
export function isAuthDisabled(): boolean {
  return process.env.SUPERAGENT_DISABLE_AUTH === 'true';
}

/** Session lifetime in milliseconds (from env, default 7 days). */
function sessionTtlMs(): number {
  const hours = Number(process.env.SUPERAGENT_SESSION_TTL) || 168;
  return Math.max(1, hours) * 60 * 60 * 1000;
}

/** Whether cookies should carry the Secure attribute (HTTPS deployments). */
function useSecureCookies(): boolean {
  return process.env.SUPERAGENT_SECURE_COOKIES === 'true';
}

// ─── Session token: base64url(payload).hmac ──────────────────────────────────

/** Signs arbitrary data with the persistent session secret from core. */
function sign(data: string): string {
  return crypto
    .createHmac('sha256', AuthStore.getOrCreateSessionSecret())
    .update(data)
    .digest('base64url');
}

/** Creates a signed session token embedding the username and an expiry. */
export function createSessionToken(username: string): string {
  const payload = JSON.stringify({ u: username, exp: Date.now() + sessionTtlMs() });
  const encoded = Buffer.from(payload, 'utf-8').toString('base64url');
  return `${encoded}.${sign(encoded)}`;
}

/** Verifies a session token; returns the username or null if invalid/expired. */
export function verifySessionToken(token: string | undefined): string | null {
  if (!token) return null;
  const dot = token.lastIndexOf('.');
  if (dot === -1) return null;

  const encoded = token.slice(0, dot);
  const signature = token.slice(dot + 1);

  // Constant-time signature comparison to prevent timing attacks
  const expected = sign(encoded);
  const sigBuf = Buffer.from(signature);
  const expBuf = Buffer.from(expected);
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
    return null;
  }

  try {
    const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf-8'));
    if (typeof payload.exp !== 'number' || payload.exp < Date.now()) return null;
    return typeof payload.u === 'string' ? payload.u : null;
  } catch {
    return null;
  }
}

// ─── Cookie helpers ──────────────────────────────────────────────────────────

/** Parses a `Cookie` header into a key/value map. */
export function parseCookies(header?: string): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    const key = part.slice(0, idx).trim();
    const val = part.slice(idx + 1).trim();
    if (key) out[key] = decodeURIComponent(val);
  }
  return out;
}

/** Builds a `Set-Cookie` string for the session cookie. */
function buildSetCookie(value: string, maxAgeMs: number): string {
  const attrs = [
    `${COOKIE_NAME}=${value}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${Math.floor(maxAgeMs / 1000)}`
  ];
  if (useSecureCookies()) attrs.push('Secure');
  return attrs.join('; ');
}

/** Issues a fresh session cookie for the given user. */
export function setSessionCookie(res: Response, username: string): void {
  res.setHeader('Set-Cookie', buildSetCookie(createSessionToken(username), sessionTtlMs()));
}

/** Clears the session cookie (logout). */
export function clearSessionCookie(res: Response): void {
  res.setHeader('Set-Cookie', buildSetCookie('', 0));
}

/** Returns the authenticated username for a raw request, or null. */
export function getAuthenticatedUser(req: IncomingMessage): string | null {
  const cookies = parseCookies(req.headers.cookie);
  return verifySessionToken(cookies[COOKIE_NAME]);
}

// ─── Brute-force rate limiter (per IP) ───────────────────────────────────────

/** Max failed login attempts before IP is locked out. */
const MAX_ATTEMPTS = 8;
/** Rolling time window (ms) for counting failed attempts. */
const WINDOW_MS = 15 * 60 * 1000; // rolling window
/** Duration (ms) of lockout after exceeding max attempts. */
const LOCKOUT_MS = 15 * 60 * 1000; // lockout duration after too many failures

/** Tracks login attempt count and lockout state for a single IP. */
interface AttemptRecord {
  count: number;
  first: number;
  lockedUntil?: number;
}
/** Map of IP addresses to their login attempt records. */
const attempts = new Map<string, AttemptRecord>();

/** Best-effort client IP.
 *
 * X-Forwarded-For is fully client-controlled, so honoring its *first* (leftmost)
 * hop would let an attacker spoof the header to bypass the per-IP brute-force
 * lockout. We only trust XFF when the connection itself originates from a
 * reverse proxy (loopback / private range), and even then we use the *last*
 * (rightmost) hop — the value the trusted proxy appended — not a spoofed one.
 */
function clientIp(req: Request): string {
  const raw = req.socket.remoteAddress || 'unknown';
  const isPrivate = (ip: string) =>
    ip === '::1' ||
    ip === '127.0.0.1' ||
    ip.startsWith('::ffff:127.') ||
    ip.startsWith('10.') ||
    ip.startsWith('192.168.') ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(ip);
  if (isPrivate(raw)) {
    const fwd = req.headers['x-forwarded-for'];
    if (typeof fwd === 'string' && fwd.length) return fwd.split(',').pop()!.trim();
  }
  return raw;
}

/** Checks whether the caller is currently allowed to attempt a login. */
export function checkRateLimit(req: Request): { allowed: boolean; retryAfterMs?: number } {
  // Check if caller is currently locked out from too many failures
  const ip = clientIp(req);
  const rec = attempts.get(ip);
  const now = Date.now();
  if (!rec) return { allowed: true };
  if (rec.lockedUntil && rec.lockedUntil > now) {
    return { allowed: false, retryAfterMs: rec.lockedUntil - now };
  }
  if (now - rec.first > WINDOW_MS) {
    attempts.delete(ip);
    return { allowed: true };
  }
  return { allowed: true };
}

/** Records a failed login attempt and locks the IP after too many failures. */
export function recordFailedAttempt(req: Request): void {
  const ip = clientIp(req);
  const now = Date.now();
  const rec = attempts.get(ip);
  if (!rec || now - rec.first > WINDOW_MS) {
    attempts.set(ip, { count: 1, first: now });
    return;
  }
  rec.count += 1;
  if (rec.count >= MAX_ATTEMPTS) {
    rec.lockedUntil = now + LOCKOUT_MS;
  }
}

/** Clears the attempt counter for a caller (on successful login). */
export function clearAttempts(req: Request): void {
  attempts.delete(clientIp(req));
}

// ─── Express middleware & route handlers ─────────────────────────────────────

/** Paths reachable without a valid session (login/setup flow + health). */
const PUBLIC_PATHS = new Set([
  '/login',
  '/api/health',
  '/api/auth/status',
  '/api/auth/login',
  '/api/auth/setup'
]);

/**
 * Express gate: allows public paths, then requires a valid session. Unauthenticated
 * API calls receive 401 JSON; page requests are redirected to `/login`.
 */
export function authGate(req: Request, res: Response, next: NextFunction): void {
  // Gate: allow public paths, require session for everything else
  if (isAuthDisabled()) return next();
  if (PUBLIC_PATHS.has(req.path)) return next();

  const user = getAuthenticatedUser(req);
  if (user) {
    (req as any).authUser = user;
    return next();
  }

  if (req.path.startsWith('/api/')) {
    res.status(401).json({ error: 'Authentication required', authRequired: true });
    return;
  }
  res.redirect(302, '/login');
}

/**
 * GET /api/auth/status — reports the current auth state so the front-end knows
 * whether to show the login form, the first-run setup form, or the app.
 */
export function handleStatus(req: Request, res: Response): void {
  if (isAuthDisabled()) {
    res.json({ authenticated: true, authRequired: false, passwordSet: true });
    return;
  }
  const user = getAuthenticatedUser(req);
  res.json({
    authenticated: Boolean(user),
    authRequired: true,
    passwordSet: AuthStore.isPasswordSet()
  });
}

/**
 * POST /api/auth/setup — one-time creation of the admin account. Only permitted
 * while no password exists yet (prevents takeover once configured).
 */
export function handleSetup(req: Request, res: Response): void {
  if (isAuthDisabled()) {
    res.json({ ok: true, authRequired: false });
    return;
  }
  if (AuthStore.isPasswordSet()) {
    res.status(409).json({ error: 'A password has already been set. Please sign in.' });
    return;
  }

  const { password } = (req.body || {}) as { password?: string };
  const result = AuthStore.setPassword(password || '');
  if (!result.ok) {
    res.status(400).json({ error: result.error });
    return;
  }

  // Log the admin in immediately.
  setSessionCookie(res, AuthStore.getUsername());
  res.json({ ok: true });
}

/** POST /api/auth/login — verifies credentials and issues a session cookie. */
export function handleLogin(req: Request, res: Response): void {
  if (isAuthDisabled()) {
    res.json({ ok: true, authRequired: false });
    return;
  }

  const limit = checkRateLimit(req);
  if (!limit.allowed) {
    res.status(429).json({
      error: 'Too many attempts. Please try again later.',
      retryAfterSeconds: Math.ceil((limit.retryAfterMs || 0) / 1000)
    });
    return;
  }

  const { password } = (req.body || {}) as { password?: string };
  if (typeof password !== 'string') {
    res.status(400).json({ error: 'Password is required.' });
    return;
  }

  if (AuthStore.verifyPassword(password)) {
    clearAttempts(req);
    setSessionCookie(res, AuthStore.getUsername());
    res.json({ ok: true });
    return;
  }

  recordFailedAttempt(req);
  res.status(401).json({ error: 'Invalid password.' });
}

/** POST /api/auth/logout — clears the session cookie. */
export function handleLogout(_req: Request, res: Response): void {
  clearSessionCookie(res);
  res.json({ ok: true });
}

/**
 * POST /api/auth/change-password — updates the password (and optionally the
 * username) after verifying the current password. Requires an active session.
 */
export function handleChangePassword(req: Request, res: Response): void {
  if (isAuthDisabled()) {
    res.status(400).json({ error: 'Authentication is disabled on this server.' });
    return;
  }
  const sessionUser = getAuthenticatedUser(req);
  if (!sessionUser) {
    res.status(401).json({ error: 'Authentication required.' });
    return;
  }

  const { currentPassword, newPassword } = (req.body || {}) as {
    currentPassword?: string;
    newPassword?: string;
  };

  const result = AuthStore.changePassword(currentPassword || '', newPassword || '');
  if (!result.ok) {
    res.status(400).json({ error: result.error });
    return;
  }

  // Re-issue the cookie so the session stays valid.
  setSessionCookie(res, AuthStore.getUsername());
  res.json({ ok: true });
}
