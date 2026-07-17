import { describe, it, expect, beforeEach } from 'vitest';
import { ModelRouter, type RouterModel } from './router.js';
import { SettingsStorage } from '../storage/settings-store.js';

/**
 * Exercises the P2 extension to `rankModels`: folding speedTier / intelligenceTier
 * / costPer1kTokens into the selection score, while preserving the pre-tier
 * behaviour when those fields are absent.
 *
 * Model ids here are deliberately free of the keyword matchers in
 * ModelGovStorage.getModelScores, so every model resolves to the SAME default
 * governance scores (coding 55 / reasoning 55 / vision 30 / costEff 85). That
 * makes the extended tier/cost signals the *only* differentiator, so each test
 * isolates exactly one new factor.
 */

beforeEach(() => {
  SettingsStorage.saveSettings({
    models: [],
    modelGov: { enabledModels: [], categoryOverrides: {}, optimizationGoal: 'quality' }
  });
  SettingsStorage.clearCache();
});

describe('rankModels — quality goal folds intelligenceTier', () => {
  it('prefers the higher intelligence tier when task scores are equal', () => {
    const pool: RouterModel[] = [
      { id: 'alpha-model', providerId: 'openai', enabled: true, supportsTools: true, intelligenceTier: 'high' },
      { id: 'beta-model', providerId: 'anthropic', enabled: true, supportsTools: true, intelligenceTier: 'mid' }
    ];
    const pick = ModelRouter.routeModelForTask('write a function to parse json', pool);
    expect(pick.model).toBe('alpha-model'); // high (85) beats mid (60)
  });
});

describe('rankModels — cost goal folds costPer1kTokens', () => {
  it('prefers the cheaper model (lower costPer1kTokens)', () => {
    const pool: RouterModel[] = [
      { id: 'cheap-model', providerId: 'openai', enabled: true, supportsTools: true, costPer1kTokens: 0.001 },
      { id: 'pricey-model', providerId: 'anthropic', enabled: true, supportsTools: true, costPer1kTokens: 0.5 }
    ];
    const pick = ModelRouter.routeModelForTask('write a function to parse json', pool);
    expect(pick.model).toBe('cheap-model');
  });
});

describe('rankModels — balanced goal blends speed + cost', () => {
  it('prefers a fast + cheap model over a slow + expensive one at equal task fit', () => {
    const pool: RouterModel[] = [
      { id: 'fast-model', providerId: 'openai', enabled: true, supportsTools: true, speedTier: 'fast', costPer1kTokens: 0.001 },
      { id: 'slow-model', providerId: 'anthropic', enabled: true, supportsTools: true, speedTier: 'slow', costPer1kTokens: 0.5 }
    ];
    const pick = ModelRouter.routeModelForTask('write a function to parse json', pool);
    expect(pick.model).toBe('fast-model');
  });
});

describe('rankModels — backward-compatible when tiers are absent', () => {
  it('still ranks by task (vision) score with no tier metadata (gemini-3 > gpt-4o)', () => {
    const pool: RouterModel[] = [
      { id: 'gpt-4o', providerId: 'openai', enabled: true, supportsVision: true },
      { id: 'gemini-3', providerId: 'google', enabled: true, supportsVision: true }
    ];
    const pick = ModelRouter.routeModelForTask('describe this image and screenshot', pool);
    expect(pick.model).toBe('gemini-3');
  });
});
