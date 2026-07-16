import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { getConfigDirectory } from './settings-store.js';

/**
 * A single stored credential (one admin account).
 * The password is never stored in plaintext — only its scrypt hash + salt.
 */
export interface StoredCredential {
  /** Login username. */
  username: string;
  /** Random per-credential salt (hex encoded). */
  salt: string;
  /** scrypt-derived password hash (hex encoded). */
  hash: string;
  /** Hashing algorithm used (currently always "scrypt"). */
  algo: 'scrypt';
  /** Derived key length in bytes. */
  keylen: number;
  /** Unix epoch (ms) of the last password update. */
  updatedAt: number;
}

/** Shape of the on-disk `auth.json` file. */
export interface AuthFile {
  /** The admin credential, if a password has been set. */
  credential?: StoredCredential;
  /** Secret used by surfaces to sign session tokens (persisted so sessions survive restarts). */
  sessionSecret?: string;
  /**
   * Monotonic counter bumped on every password change. Session tokens embed this
   * version so that changing the password invalidates every previously-issued
   * session (forcing re-login on all other devices), not just the one that
   * performed the change.
   */
  sessionVersion?: number;
  /** Unix epoch (ms) of the last change to this file. */
  updatedAt?: number;
}

/** Result of an operation that can fail with a human-readable reason. */
export interface AuthResult {
  ok: boolean;
  error?: string;
}

/**
 * AuthStore — the shared, cross-surface credential manager.
 *
 * This lives in `@superagent/core` so the CLI, Desktop and Web surfaces all read
 * and write the SAME credential file (`<userData>/Config/auth.json`). Surfaces
 * stay thin: they only handle transport concerns (HTTP sessions, IPC, prompts)
 * and delegate all password logic (hashing, verification, changing) here.
 *
 * Security notes:
 *  - Passwords are hashed with scrypt using a random 16-byte salt.
 *  - All comparisons are constant-time to avoid timing attacks.
 *  - The file is written with 0600 permissions on POSIX systems.
 */
export class AuthStore {
  /** scrypt derived-key length in bytes. */
  private static readonly KEYLEN = 64;
  /** Minimum acceptable custom-password length. */
  private static readonly MIN_PASSWORD_LENGTH = 6;
  /**
   * Fallback password used before any custom password is configured. Lets the
   * server be usable out of the box without a setup step; `setPassword` (via the
   * CLI or the web Account page) overwrites it with a proper scrypt hash.
   */
  private static readonly DEFAULT_PASSWORD = 'admin';

  /** Absolute path to the credentials file. */
  public static getAuthFilePath(): string {
    return path.join(getConfigDirectory(), 'auth.json');
  }

  /** Reads and parses `auth.json`, returning an empty object if absent/corrupt. */
  private static read(): AuthFile {
    const filePath = this.getAuthFilePath();
    if (!fs.existsSync(filePath)) return {};
    try {
      return JSON.parse(fs.readFileSync(filePath, 'utf-8')) as AuthFile;
    } catch {
      return {};
    }
  }

  /** Serializes the auth file to disk, restricting permissions where supported. */
  private static write(data: AuthFile): void {
    const filePath = this.getAuthFilePath();
    data.updatedAt = Date.now();
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
    // Best-effort: lock the file down to the owner on POSIX systems.
    try {
      fs.chmodSync(filePath, 0o600);
    } catch {
      // Windows / restricted FS — ignore.
    }
  }

  /** Whether an admin password has been configured. */
  public static isPasswordSet(): boolean {
    return Boolean(this.read().credential);
  }

  /** Returns the configured username, falling back to env / "admin". */
  public static getUsername(): string {
    return this.read().credential?.username || process.env.SUPERAGENT_USERNAME || 'admin';
  }

  /** Derives a scrypt hash for the given password + salt. */
  private static deriveHash(password: string, salt: Buffer): Buffer {
    return crypto.scryptSync(password, salt, this.KEYLEN);
  }

  /**
   * Validates password strength. Kept intentionally simple (length-based) so it
   * is predictable for a self-hosted single-admin tool.
   */
  public static validatePassword(password: string): AuthResult {
    if (typeof password !== 'string' || password.length < this.MIN_PASSWORD_LENGTH) {
      return { ok: false, error: `Password must be at least ${this.MIN_PASSWORD_LENGTH} characters.` };
    }
    return { ok: true };
  }

  /**
   * Sets (or overwrites) the admin credential. The login is password-only, so the
   * username is an internal label that defaults to "admin" and is never shown or
   * required at the login prompt. Used by first-run setup and administrative resets.
   */
  public static setPassword(password: string, username: string = 'admin'): AuthResult {
    const cleanUser = (username || 'admin').trim();

    const strength = this.validatePassword(password);
    if (!strength.ok) return strength;

    const salt = crypto.randomBytes(16);
    const hash = this.deriveHash(password, salt);

    const file = this.read();
    file.credential = {
      username: cleanUser,
      salt: salt.toString('hex'),
      hash: hash.toString('hex'),
      algo: 'scrypt',
      keylen: this.KEYLEN,
      updatedAt: Date.now()
    };
    // Invalidate every existing session: bump the session version (embedded in
    // each token) and rotate the signing secret. Any session token minted before
    // this change — on other devices — will no longer verify, forcing a re-login.
    file.sessionVersion = (file.sessionVersion ?? 0) + 1;
    file.sessionSecret = crypto.randomBytes(48).toString('hex');
    this.write(file);
    return { ok: true };
  }

  /**
   * Returns the current session version, used to invalidate sessions on password
   * change. Defaults to 0 when unset, so tokens issued before this field existed
   * keep working until the first password change — at which point they expire.
   */
  public static getSessionVersion(): number {
    return this.read().sessionVersion ?? 0;
  }

  /** Constant-time comparison of two equal-length buffers (scrypt hashes). */
  private static safeEqual(a: Buffer, b: Buffer): boolean {
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
  }

  /**
   * Verifies a password against the stored credential. The login is password-only,
   * so no username is required. When no custom password has been set yet, the
   * default password ("admin") is accepted. Returns false on any mismatch.
   */
  public static verifyPassword(password: string): boolean {
    const cred = this.read().credential;
    if (!cred) return password === this.DEFAULT_PASSWORD;

    try {
      const derived = this.deriveHash(password, Buffer.from(cred.salt, 'hex'));
      const expected = Buffer.from(cred.hash, 'hex');
      return this.safeEqual(derived, expected);
    } catch {
      return false;
    }
  }

  /**
   * Changes the password after verifying the current one. The username label may
   * also be updated in the same call (optional). When no custom password exists
   * yet, the current password must be the default ("admin").
   */
  public static changePassword(
    currentPassword: string,
    newPassword: string,
    newUsername?: string
  ): AuthResult {
    const cred = this.read().credential;
    if (!cred) {
      if (currentPassword !== this.DEFAULT_PASSWORD) {
        return { ok: false, error: 'Current password is incorrect.' };
      }
      return this.setPassword(newPassword, (newUsername || this.getUsername()).trim());
    }
    if (!this.verifyPassword(currentPassword)) {
      return { ok: false, error: 'Current password is incorrect.' };
    }
    return this.setPassword(newPassword, (newUsername || this.getUsername()).trim());
  }

  /** Removes the stored credential (administrative reset). */
  public static clearCredentials(): void {
    const file = this.read();
    delete file.credential;
    this.write(file);
  }

  /**
   * Seeds credentials from environment variables on first run only.
   * Enables headless provisioning (e.g. Docker) while keeping the persisted
   * store authoritative afterwards. Returns true if a seed was performed.
   */
  public static ensureSeededFromEnv(): boolean {
    if (this.isPasswordSet()) return false;
    const envPassword = process.env.SUPERAGENT_PASSWORD || process.env.SUPERAGENT_WEB_PASSWORD;
    if (!envPassword) return false;
    const envUser = process.env.SUPERAGENT_USERNAME || 'admin';
    const result = this.setPassword(envPassword, envUser);
    return result.ok;
  }

  /**
   * Returns a stable secret for signing session tokens. Prefers an explicit
   * env override, otherwise generates and persists one so sessions survive
   * server restarts.
   */
  public static getOrCreateSessionSecret(): string {
    if (process.env.SUPERAGENT_SESSION_SECRET) {
      return process.env.SUPERAGENT_SESSION_SECRET;
    }
    const file = this.read();
    if (!file.sessionSecret) {
      file.sessionSecret = crypto.randomBytes(48).toString('hex');
      this.write(file);
    }
    return file.sessionSecret;
  }
}
