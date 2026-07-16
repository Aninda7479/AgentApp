import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { tryAcquireAutoImproveLock } from '../src/auto-improve-lock.js';
import * as fs from 'fs';
import * as path from 'path';

const LOCK_PATH = path.join(process.cwd(), '.claude', '.auto-improve.lock');

beforeEach(() => {
  // Start every test from a clean slate (a real concurrent loop won't be
  // running inside this unit test's process).
  try {
    fs.unlinkSync(LOCK_PATH);
  } catch {
    /* not present */
  }
});

afterEach(() => {
  // Never leave a lock behind for a real concurrent loop.
  try {
    fs.unlinkSync(LOCK_PATH);
  } catch {
    /* not present */
  }
});

describe('tryAcquireAutoImproveLock', () => {
  it('claims the lock when none is held and releases cleanly', () => {
    const lock = tryAcquireAutoImproveLock('test-run-a');
    expect(lock).not.toBeNull();
    // Releasing removes the lock file.
    lock!.release();
    const again = tryAcquireAutoImproveLock('test-run-b');
    expect(again).not.toBeNull();
    again!.release();
  });

  it('returns null (must abort) when another live run holds the lock', () => {
    const holder = tryAcquireAutoImproveLock('test-run-holder');
    expect(holder).not.toBeNull();

    // A second concurrent run must NOT claim it.
    const contender = tryAcquireAutoImproveLock('test-run-contender');
    expect(contender).toBeNull();

    holder!.release();
  });

  it('sanitizes a session id with path-breaking characters instead of writing it raw', () => {
    const lock = tryAcquireAutoImproveLock('../../etc/passwd');
    expect(lock).not.toBeNull();
    // The recorded id must be stripped of path-breaking chars (no traversal).
    const rec = JSON.parse(fs.readFileSync(LOCK_PATH, 'utf-8')) as { sessionId: string };
    expect(rec.sessionId).toBe('etcpasswd');
    lock!.release();
  });
});
