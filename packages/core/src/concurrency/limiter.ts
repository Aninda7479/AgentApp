/**
 * concurrency/limiter.ts — async semaphores used to keep the Core event loop
 * healthy under heavy multi-agent load.
 *
 * Why this exists:
 *   The Core runs every agent loop on a single Node event loop. With 100+
 *   concurrent agents (each potentially spawning subagents) the danger is not
 *   CPU contention from JS itself (the loops mostly `await` network/tool I/O) —
 *   it is *flooding*: firing hundreds of simultaneous provider requests at once
 *   (→ provider 429 storms, the orchestrator reroutes, latency collapses) and
 *   running unbounded CPU-bound tool work (local models, media gen, compaction)
 *   that stalls every other agent sharing the loop.
 *
 *   These semaphores cap *concurrent in-flight operations* per key, so bursts
 *   are smoothed into a bounded queue instead of a thundering herd. They are
 *   cooperative: an agent simply `await`s its slot, does its I/O, releases.
 *
 * Limits are configurable via env vars and default to generous values so normal
 * use is never throttled, only pathological bursts are smoothed.
 *   SUPERAGENT_PROVIDER_CONCURRENCY  (per provider, default 32)
 *   SUPERAGENT_TOOL_CONCURRENCY      (global tools,   default 24)
 */

/** A fair async semaphore. `acquire()` resolves with a `release` callback. */
export class Semaphore {
  private permits: number;
  private readonly queue: Array<() => void> = [];

  constructor(permits: number) {
    this.permits = Math.max(1, permits | 0);
  }

  /** Resolve immediately if a permit is free, else queue. Returns a releaser. */
  public acquire(): Promise<() => void> {
    if (this.permits > 0) {
      this.permits--;
      return Promise.resolve(() => this.release());
    }
    return new Promise<void>((resolve) => {
      this.queue.push(resolve);
    }).then(() => {
      this.permits--;
      return () => this.release();
    });
  }

  private release(): void {
    this.permits++;
    if (this.queue.length > 0 && this.permits > 0) {
      const next = this.queue.shift()!;
      next();
    }
  }

  /** Currently free permits. */
  public get available(): number {
    return this.permits;
  }

  /** Callers waiting for a permit. */
  public get waiting(): number {
    return this.queue.length;
  }
}

/**
 * Keyed concurrency limiter — maintains one semaphore per key (e.g. provider
 * name) so per-provider load is bounded independently, and a single global
 * default for keys that have no dedicated semaphore yet.
 */
export class ConcurrencyLimiter {
  private readonly semaphores = new Map<string, Semaphore>();
  private readonly defaultMax: number;

  constructor(defaultMax: number = 32) {
    this.defaultMax = Math.max(1, defaultMax | 0);
  }

  private semaphoreFor(key: string): Semaphore {
    let s = this.semaphores.get(key);
    if (!s) {
      s = new Semaphore(this.defaultMax);
      this.semaphores.set(key, s);
    }
    return s;
  }

  /** Run `fn` with a permit held for `key`; always releases afterwards. */
  public async run<T>(key: string, fn: () => Promise<T>): Promise<T> {
    const release = await this.semaphoreFor(key).acquire();
    try {
      return await fn();
    } finally {
      release();
    }
  }

  /** Live stats, useful for a UI/diagnostics view of saturation. */
  public stats(): Record<string, { available: number; waiting: number }> {
    const out: Record<string, { available: number; waiting: number }> = {};
    for (const [key, sem] of this.semaphores) {
      out[key] = { available: sem.available, waiting: sem.waiting };
    }
    return out;
  }
}

function envInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

/** Per-provider outbound request limiter (keyed by provider name). */
export const providerLimiter = new ConcurrencyLimiter(
  envInt('SUPERAGENT_PROVIDER_CONCURRENCY', 32)
);

/** Global limiter for tool execution (CPU/IO bound local work). */
export const toolLimiter = new ConcurrencyLimiter(
  envInt('SUPERAGENT_TOOL_CONCURRENCY', 24)
);
