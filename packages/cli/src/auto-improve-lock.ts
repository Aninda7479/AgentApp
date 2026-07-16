import * as fs from 'fs';
import * as path from 'path';

/**
 * Single-flight guard for the autonomous `/auto-improve` loop.
 *
 * `/auto-improve` runs on a cron and can also be invoked manually. When two
 * instances share one working tree + git index they cross-commit each other's
 * staged files (seen repeatedly this session: one run's commit swept in
 * another run's staged routing-layer changes). This guard lets a run claim a
 * lock file and ABORT if another holds it, so at most one loop mutates the
 * tree at a time.
 *
 * Other /auto-improve invocations pick up this protocol from the skill text
 * ("./auto-improve" must call tryAcquireAutoImproveLock first and bail if it
 * returns null). The thin self-check in bin/main.ts applies the same guard to
 * the CLI binary so a loop driven via `superagent` self-serializes too.
 */

// Resolve from process.cwd() (always the repo root when /auto-improve runs),
// NOT from import.meta.url — the latter is fragile across src/ vs dist/ and
// across packages, and must match the `.claude/.auto-improve.lock` shell guard
// documented in SKILL.md.
const LOCK_PATH = path.join(process.cwd(), '.claude', '.auto-improve.lock');

const STALE_MS = 9 * 60 * 1000; // 9 min — just under the 10-min cron cadence.

interface LockRecord {
  sessionId: string;
  pid: number;
  acquiredAt: number;
  reason: string;
}

function readRecord(): LockRecord | null {
  try {
    const raw = fs.readFileSync(LOCK_PATH, 'utf-8');
    return JSON.parse(raw) as LockRecord;
  } catch {
    return null;
  }
}

function isStale(record: LockRecord | null): boolean {
  if (!record) return true;
  // Timestamp freshness is the portable, authoritative signal across OSes.
  // (On Windows, process.kill(pid, 0) returns success for dead PIDs, so it
  // cannot be relied on to detect a dead holder — age is.)
  if (Date.now() - record.acquiredAt > STALE_MS) return true;
  // PID liveness is a best-effort extra signal on POSIX; it only ever nudges
  // an already-fresh lock toward "stale", never the reverse.
  if (typeof record.pid === 'number' && record.pid > 0 && process.platform !== 'win32') {
    try {
      process.kill(record.pid, 0); // throws if the pid is not alive
    } catch {
      return true;
    }
  }
  return false;
}

export interface AutoImproveLock {
  path: string;
  release: () => void;
}

/**
 * Attempts to claim the auto-improve lock.
 * @returns the lock handle (call `.release()` when done) or `null` if another
 *          live run already holds it — in which case the caller must ABORT.
 */
export function tryAcquireAutoImproveLock(sessionId: string, reason = 'auto-improve'): AutoImproveLock | null {
  // Defense: sessionId is written only into the lock FILE BODY (the filename
  // is fixed at .claude/.auto-improve.lock), so it can't cause path traversal.
  // Still strip anything but safe chars so the recorded id stays clean.
  const safeId = String(sessionId || 'manual').replace(/[^a-zA-Z0-9_-]/g, '') || 'manual';

  const record: LockRecord = {
    sessionId: safeId,
    pid: process.pid,
    acquiredAt: Date.now(),
    reason
  };

  // Fast path: no lock file → create it. Use 'wx' so a concurrent creator loses
  // atomically instead of clobbering.
  try {
    fs.mkdirSync(path.dirname(LOCK_PATH), { recursive: true });
    fs.writeFileSync(LOCK_PATH, JSON.stringify(record, null, 2), {
      flag: 'wx',
      mode: 0o644
    });
    return {
      path: LOCK_PATH,
      release: () => {
        try {
          fs.unlinkSync(LOCK_PATH);
        } catch {
          /* already gone */
        }
      }
    };
  } catch (err: unknown) {
    // EEXIST → someone beat us. If their record is stale, steal it.
    if ((err as NodeJS.ErrnoException)?.code === 'EEXIST') {
      const existing = readRecord();
      if (isStale(existing)) {
        try {
          fs.writeFileSync(LOCK_PATH, JSON.stringify(record, null, 2), { mode: 0o644 });
          return {
            path: LOCK_PATH,
            release: () => {
              try {
                fs.unlinkSync(LOCK_PATH);
              } catch {
                /* already gone */
              }
            }
          };
        } catch {
          /* lost the race on steal too — treat as held */
        }
      }
      return null;
    }
    // Unexpected error (e.g. permission) → be safe and do NOT claim, so we
    // never run two loops. Return null and let the caller abort.
    return null;
  }
}
