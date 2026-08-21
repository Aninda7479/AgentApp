/**
 * Context Usage Math & Meter Utility
 */

import type { TrajectoryStep, ContextUsage } from '../core/types';

export function parseContextLimit(limitStr?: string): number {
  if (!limitStr || limitStr === 'n/a') return 128000;
  const normalized = limitStr.trim().toLowerCase();
  if (normalized.endsWith('k')) {
    return (parseFloat(normalized) || 128) * 1000;
  }
  if (normalized.endsWith('m')) {
    return (parseFloat(normalized) || 1) * 1000000;
  }
  const parsed = parseInt(normalized, 10);
  return isNaN(parsed) ? 128000 : parsed;
}

export function computeContextUsage(steps: TrajectoryStep[], limitStr?: string): ContextUsage {
  const limit = parseContextLimit(limitStr);
  let totalChars = 0;
  for (const s of steps) {
    totalChars += (s.content || '').length;
    if (s.toolName) totalChars += s.toolName.length;
  }
  // Rough estimate: ~4 chars per token
  const usedTokens = Math.ceil(totalChars / 4);
  const pct = Math.min(100, Math.round((usedTokens / limit) * 100));

  return {
    used: usedTokens,
    limit,
    pct,
  };
}
