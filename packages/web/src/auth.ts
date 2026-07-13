// ─── SuperAgent Web/VPS Authentication ──────────────────────────────────────
// A self-contained, dependency-free session login system for the web server.
//
// Features:
//   • Username + password login (credentials from environment variables)
//   • Signed, HttpOnly session cookies (HMAC-SHA256, tamper-proof)
//   • Optional scrypt password hashing (SUPERAGENT_PASSWORD_HASH)
//   • Constant-time credential comparison (mitigates timing attacks)
//   • Per-IP brute-force rate limiting with temporary lockout
//   • Protects both HTTP routes and the WebSocket upgrade handshake
//
// Environment variables:
//   SUPERAGENT_USERNAME         Login username        (default: "admin")
//   SUPERAGENT_PASSWORD         Login password (plaintext)
//   SUPERAGENT_WEB_PASSWORD     Alias for SUPERAGENT_PASSWORD (back-compat)
//   SUPERAGENT_PASSWORD_HASH    scrypt hash "scrypt$<saltHex>$<hashHex>" (overrides plaintext)
//   SUPERAGENT_SESSION_SECRET   Secret used to sign sessions (random if unset)
//   SUPERAGENT_SESSION_TTL      Session lifetime in hours   (default: 168 = 7 days)
//   SUPERAGENT_SECURE_COOKIES   "true" to mark cookies Secure (HTTPS only)
//
// If neither a password nor a password hash is configured, authentication is
// DISABLED (open mode) and a warning is printed — preserving prior behavior.

import crypto from 'crypto';
import type { Request, Response, NextFunction } from 'express';
import type { IncomingMessage } from 'http';

const COOKIE_NAME = 'sa_session';

interface AuthConfig {
  enabled: boolean;
  username: string;
  password?: string;
  passwordHash?: { salt: Buffer; hash: Buffer };
  secret: string;
  secureCookies: boolean;
  sessionTtlMs: number;
}

function parsePasswordHash(raw?: string): { salt: Buffer; hash: Buffer } | undefined {
  if (!raw) return undefined;
  const parts = raw.split('$');
  if (parts.length === 3 && parts[0] === 'scrypt') {
    try {
      return { salt: Buffer.from(parts[1], 'hex'), hash: Buffer.from(parts[2], 'hex') };
    } catch {
      return undefined;
    }
  }
  return undefined;
}

let cachedConfig: AuthConfig | null = null;

export function getAuthConfig(): AuthConfig {
  if (cachedConfig) return cachedConfig;

  const password = process.env.SUPERAGENT_PASSWORD || process.env.SUPERAGENT_WEB_PASSWORD;
  const passwordHash = parsePasswordHash(process.env.SUPERAGENT_PASSWORD_HASH);
  const username = process.env.SUPERAGENT_USERNAME || 'admin';
  const enabled = Boolean(password || passwordHash);

  const ttlHours = Number(process.env.SUPERAGENT_SESSION_TTL) || 168;
  const secret =
    process.env.SUPERAGENT_SESSION_SECRET || crypto.randomBytes(48).toString('hex');

  cachedConfig = {
    enabled,
    username,
    password: password || undefined,
    passwordHash,
    secret,
    secureCookies: process.env.SUPERAGENT_SECURE_COOKIES === 'true',
    sessionTtlMs: Math.max(1, ttlHours) * 60 * 60 * 1000
  };
  return cachedConfig;
}

// ─── Constant-time helpers ───────────────────────────────────────────────────
function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'utf-8');
  const bufB = Buffer.from(b, 'utf-8');
  // Hash both to equal length so timingSafeEqual never throws on length mismatch.
  const hashA = crypto.createHash('sha256').update(bufA).digest();
  const hashB = crypto.createHash('sha256').update(bufB).digest();
  return crypto.timingSafeEqual(hashA, hashB);
}

export function verifyCredentials(username: string, password: string): boolean {
  const cfg = getAuthConfig();
  if (!cfg.enabled) return false;

  const userOk = safeEqual(username, cfg.username);

  let passOk = false;
  if (cfg.passwordHash) {
    try {
      const derived = crypto.scryptSync(password, cfg.passwordHash.salt, cfg.passwordHash.hash.length);
      passOk =
        derived.length === cfg.passwordHash.hash.length &&
        crypto.timingSafeEqual(derived, cfg.passwordHash.hash);
    } catch {
      passOk = false;
    }
  } else if (cfg.password) {
    passOk = safeEqual(password, cfg.password);
  }

  return userOk && passOk;
}

// ─── Session token: base64url(payload).hmac ──────────────────────────────────
function sign(data: string): string {
  return crypto
    .createHmac('sha256', getAuthConfig().secret)
    .update(data)
    .digest('base64url');
}

export function createSessionToken(username: string): string {
  const cfg = getAuthConfig();
  const payload = JSON.stringify({ u: username, exp: Date.now() + cfg.sessionTtlMs });
  const encoded = Buffer.from(payload, 'utf-8').toString('base64url');
  return `${encoded}.${sign(encoded)}`;
}

export function verifySessionToken(token: string | undefined): string | null {
  if (!token) return null;
  const dot = token.lastIndexOf('.');
  if (dot === -1) return null;
  const encoded = token.slice(0, dot);
  const signature = token.slice(dot + 1);

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

function buildSetCookie(value: string, maxAgeMs: number): string {
  const cfg = getAuthConfig();
  const attrs = [
    `${COOKIE_NAME}=${value}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${Math.floor(maxAgeMs / 1000)}`
  ];
  if (cfg.secureCookies) attrs.push('Secure');
  return attrs.join('; ');
}

export function setSessionCookie(res: Response, username: string): void {
  const token = createSessionToken(username);
  res.setHeader('Set-Cookie', buildSetCookie(token, getAuthConfig().sessionTtlMs));
}

export function clearSessionCookie(res: Response): void {
  res.setHeader('Set-Cookie', buildSetCookie('', 0));
}

export function getAuthenticatedUser(req: IncomingMessage): string | null {
  const cookies = parseCookies(req.headers.cookie);
  return verifySessionToken(cookies[COOKIE_NAME]);
}

// ─── Brute-force rate limiter (per IP) ───────────────────────────────────────
const MAX_ATTEMPTS = 8;
const WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const LOCKOUT_MS = 15 * 60 * 1000;

interface AttemptRecord {
  count: number;
  first: number;
  lockedUntil?: number;
}
const attempts = new Map<string, AttemptRecord>();

function clientIp(req: Request): string {
  const fwd = req.headers['x-forwarded-for'];
  if (typeof fwd === 'string' && fwd.length) return fwd.split(',')[0].trim();
  return req.socket.remoteAddress || 'unknown';
}

export function checkRateLimit(req: Request): { allowed: boolean; retryAfterMs?: number } {
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

export function clearAttempts(req: Request): void {
  attempts.delete(clientIp(req));
}

// ─── Express middleware & route handlers ─────────────────────────────────────

/** Paths reachable without a valid session (login flow + health). */
const PUBLIC_PATHS = new Set(['/login', '/api/auth/login', '/api/auth/status', '/api/health']);

export function authGate(req: Request, res: Response, next: NextFunction): void {
  const cfg = getAuthConfig();
  if (!cfg.enabled) return next();

  if (PUBLIC_PATHS.has(req.path)) return next();

  const user = getAuthenticatedUser(req);
  if (user) {
    (req as any).authUser = user;
    return next();
  }

  // Unauthenticated: JSON error for API calls, redirect to login for pages.
  if (req.path.startsWith('/api/')) {
    res.status(401).json({ error: 'Authentication required', authRequired: true });
    return;
  }
  res.redirect(302, '/login');
}

export function handleLogin(req: Request, res: Response): void {
  const cfg = getAuthConfig();
  if (!cfg.enabled) {
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

  const { username, password } = (req.body || {}) as { username?: string; password?: string };
  if (typeof username !== 'string' || typeof password !== 'string') {
    res.status(400).json({ error: 'Username and password are required.' });
    return;
  }

  if (verifyCredentials(username, password)) {
    clearAttempts(req);
    setSessionCookie(res, username);
    res.json({ ok: true, username });
    return;
  }

  recordFailedAttempt(req);
  res.status(401).json({ error: 'Invalid username or password.' });
}

export function handleLogout(_req: Request, res: Response): void {
  clearSessionCookie(res);
  res.json({ ok: true });
}

export function handleStatus(req: Request, res: Response): void {
  const cfg = getAuthConfig();
  if (!cfg.enabled) {
    res.json({ authenticated: true, authRequired: false });
    return;
  }
  const user = getAuthenticatedUser(req);
  res.json({ authenticated: Boolean(user), authRequired: true, username: user || undefined });
}
