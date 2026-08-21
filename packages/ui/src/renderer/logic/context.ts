import type { TrajectoryStep } from './types';

/** A context-window usage snapshot shown by the workspace gauge. */
export interface ContextUsage {
  /** Estimated tokens currently used. */
  used: number;
  /** Context-window size of the effective model (tokens). */
  limit: number;
  /** used / limit as a percentage (0..100). */
  pct: number;
}

/**
 * Parses a human context-window limit (e.g. `"128k"`, `"2M"`, `"1.5m"`,
 * `"200000"`) into a numeric token count. Returns `undefined` for unparseable
 * input. Kept self-contained so the renderer bundle doesn't pull in core.
 */
export function parseContextLimit(str?: string | null): number | undefined {
  if (!str) return undefined;
  const s = String(str).trim().toLowerCase().replace(/,/g, '');
  const withUnit = s.match(/^([\d.]+)\s*([km])?b?$/);
  if (withUnit) {
    let n = parseFloat(withUnit[1]);
    if (withUnit[2] === 'k') n *= 1_000;
    else if (withUnit[2] === 'm') n *= 1_000_000;
    return Math.round(n);
  }
  const plain = s.match(/^([\d.]+)$/);
  if (plain) return Math.round(parseFloat(plain[1]));
  return undefined;
}

/** Rough token estimate (~4 chars/token) for a single block of text. */
export function estimateTokens(text: string): number {
  if (!text) return 0;
  return Math.max(1, Math.ceil(text.length / 4));
}

/** Estimates the token cost of the visible trajectory steps (demo-mode proxy). */
export function estimateTrajectoryTokens(steps: TrajectoryStep[]): number {
  let total = 0;
  for (const s of steps || []) {
    total += estimateTokens(s?.content ?? '');
  }
  return total;
}

/**
 * Computes a context-usage estimate from the visible steps against the active
 * model's context window. Returns `null` when the limit can't be resolved (so
 * the caller can hide the gauge). Used as the fallback when the engine isn't
 * streaming a live `context` signal (e.g. simulation/demo mode).
 */
export function computeContextUsage(
  steps: TrajectoryStep[],
  contextLimit?: string | number | null
): ContextUsage | null {
  const limit =
    typeof contextLimit === 'number'
      ? contextLimit
      : parseContextLimit(contextLimit ?? null);
  if (!limit || limit <= 0) return null;
  const used = estimateTrajectoryTokens(steps);
  const pct = Number(((used / limit) * 100).toFixed(2));
  return { used, limit, pct };
}
