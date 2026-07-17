import { describe, it, expect } from 'vitest';
import { SessionTracker, handleStatusCommand } from '../src/commands/status.js';

/**
 * Exercises the read-only surface of the `status` command — the session token
 * meter / cost report. All paths here are pure and read-only: they compute a
 * report from an in-memory context and never touch the credential store, the
 * filesystem settings, or any provider. We hand-build a minimal context (the
 * real `createSessionContext` helper loads persisted settings, which we avoid
 * to keep the test hermetic) so the token-meter math is what's actually under
 * test. The interactive `/status` flow is covered by this handler directly.
 */
function makeContext(overrides: Record<string, unknown> = {}): any {
  return {
    activeProvider: 'openai',
    activeModel: 'gpt-4o',
    // No capability registered -> status falls back to the default 128k window.
    capabilityRegistry: { getCapability: () => null },
    activeTheme: { name: 'DARK' },
    startTime: Date.now() - 5000,
    tokenUsage: { promptTokens: 100, completionTokens: 50, totalTokens: 150, estimatedCost: 0.0023 },
    messages: [],
    ...overrides
  };
}

describe('CLI status command', () => {
  it('handleStatusCommand returns a success envelope with a formatted token meter', () => {
    const res = handleStatusCommand([], makeContext());
    expect(res.success).toBe(true);
    expect(res.message).toContain('=== Session Status & Token Meter ===');
    expect(res.message).toContain('Total Tokens:');
    expect(res.data).toBeTruthy();
  });

  it('getStatusReport uses the default context window when no capability is registered', () => {
    const tracker = new SessionTracker();
    const report = tracker.getStatusReport(makeContext());
    // No capability -> fallback limit of 128000; 150 tokens ~= 0.12% used.
    expect(report.contextWindowLimit).toBe(128000);
    expect(report.totalTokens).toBe(150);
    expect(report.usagePercentage).toBeCloseTo(0.12, 1);
  });

  it('formatStatusReport renders active provider/model/theme lines', () => {
    const tracker = new SessionTracker();
    const out = tracker.formatStatusReport(
      makeContext({
        activeProvider: 'anthropic',
        activeModel: 'claude-3-5-sonnet',
        activeTheme: { name: 'LIGHT' }
      })
    );
    expect(out).toContain('Active Provider:   anthropic');
    expect(out).toContain('Active Model:      claude-3-5-sonnet');
    expect(out).toContain('Visual Theme:      LIGHT');
  });
});
