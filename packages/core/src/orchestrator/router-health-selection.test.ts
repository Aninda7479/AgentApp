import { describe, it, expect, beforeEach } from 'vitest';
import { OrchestratorRouter, type RouterModel } from './router.js';
import { SettingsStorage } from '../storage/settings-store.js';
import { providerHealth, resetProviderHealth } from './provider-health.js';

/**
 * Closes the selection↔fallback health disconnect (orchestrator-dev focus A).
 *
 * The fallback loop (completeWithFallback) has always consulted the live
 * `providerHealth` singleton, but the *selection* layer (routeModelForTask /
 * resolveCandidatePool) only read the static `accessStatus` field — so a
 * provider that got rate-limited or banned *after* the pool was built could
 * still be picked as the best model and only fail at call time. These tests
 * assert selection now honors live runtime health directly, with no network.
 */

const VISION_OPENAI: RouterModel = {
  id: 'gpt-4o', name: 'GPT-4o', providerId: 'openai', enabled: true,
  supportsVision: true, supportsTools: false
};
const VISION_GOOGLE: RouterModel = {
  id: 'gemini-3', name: 'Gemini 3', providerId: 'google', enabled: true,
  supportsVision: true, supportsTools: true
};
const TOOLS_ANTHROPIC: RouterModel = {
  id: 'claude-sonnet', name: 'Claude Sonnet', providerId: 'anthropic', enabled: true,
  supportsVision: false, supportsTools: true
};

beforeEach(() => {
  resetProviderHealth();
  // Mirror router.test.ts: clean governance, quality optimization so ranking is
  // capability-driven and deterministic.
  SettingsStorage.saveSettings({
    models: [],
    modelGov: { enabledModels: [], categoryOverrides: {}, optimizationGoal: 'quality' }
  });
  SettingsStorage.clearCache();
});

describe('resolveCandidatePool — consults live providerHealth', () => {
  it('drops a live rate_limited provider from the candidate pool', () => {
    providerHealth.recordFailure('openai', new Error('OpenAI API error [429]: slow'));
    const result = (OrchestratorRouter as any).resolveCandidatePool(
      { isCoding: false, isReasoning: false, isVision: true },
      [VISION_OPENAI, VISION_GOOGLE]
    );
    const ids = result.map((m: RouterModel) => m.id);
    expect(ids).toContain('gemini-3');
    expect(ids).not.toContain('gpt-4o'); // live rate_limited -> skipped at selection
  });

  it('drops a live locked (auth) provider for a coding task', () => {
    providerHealth.recordFailure('anthropic', new Error('Anthropic API error [401]: bad key'));
    const result = (OrchestratorRouter as any).resolveCandidatePool(
      { isCoding: true, isReasoning: false, isVision: false },
      [TOOLS_ANTHROPIC, VISION_GOOGLE]
    );
    const ids = result.map((m: RouterModel) => m.id);
    expect(ids).toContain('gemini-3');
    expect(ids).not.toContain('claude-sonnet'); // live locked -> skipped at selection
  });

  it('still returns a degraded model as last resort when it is the only option (no throw)', () => {
    providerHealth.recordFailure('openai', new Error('OpenAI API error [429]: slow'));
    const result = (OrchestratorRouter as any).resolveCandidatePool(
      { isCoding: false, isReasoning: false, isVision: false },
      [VISION_OPENAI]
    );
    expect(result.map((m: RouterModel) => m.id)).toEqual(['gpt-4o']);
  });
});

describe('routeModelForTask — honors live providerHealth', () => {
  it('selects the best vision model when healthy', () => {
    const pick = OrchestratorRouter.routeModelForTask('describe this screenshot', [VISION_OPENAI, VISION_GOOGLE]);
    expect(pick.provider).toBe('openai'); // gpt-4o outranks gemini-3 on vision score
    expect(pick.model).toBe('gpt-4o');
  });

  it('reroutes selection to a healthy provider when the best one is rate-limited', () => {
    const before = OrchestratorRouter.routeModelForTask('describe this screenshot', [VISION_OPENAI, VISION_GOOGLE]);
    expect(before.provider).toBe('openai');

    providerHealth.recordFailure('openai', new Error('OpenAI API error [429]: slow'));

    const after = OrchestratorRouter.routeModelForTask('describe this screenshot', [VISION_OPENAI, VISION_GOOGLE]);
    expect(after.provider).toBe('google'); // avoids the degraded openai, picks gemini-3
    expect(after.model).toBe('gemini-3');
  });

  it('honors a static accessStatus override over live health (sticky explicit wins)', () => {
    // Even if live health says available, an explicit deprecated flag wins.
    providerHealth.recordSuccess('openai');
    const deprecated: RouterModel = { ...VISION_OPENAI, accessStatus: 'deprecated' };
    const result = (OrchestratorRouter as any).resolveCandidatePool(
      { isCoding: false, isReasoning: false, isVision: true },
      [deprecated, VISION_GOOGLE]
    );
    expect(result.map((m: RouterModel) => m.id)).not.toContain('gpt-4o');
  });
});
