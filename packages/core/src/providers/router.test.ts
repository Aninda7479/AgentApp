import { describe, it, expect, beforeEach } from 'vitest';
import { ModelRouter, type RouterModel } from './router.js';
import { SettingsStorage } from '../storage/settings-store.js';

/**
 * Unit tests for the provider-agnostic model router (mission point #2 —
 * model orchestration). The router's selection logic is pure and deterministic,
 * so it is exercised directly here without calling any live provider API.
 */

// A small catalog exercising every capability combination.
const VISION_ONLY: RouterModel = {
  id: 'gpt-4o',
  name: 'GPT-4o',
  providerId: 'openai',
  enabled: true,
  supportsVision: true,
  supportsTools: false
};
const TOOLS_ONLY: RouterModel = {
  id: 'claude-sonnet',
  name: 'Claude Sonnet',
  providerId: 'anthropic',
  enabled: true,
  supportsVision: false,
  supportsTools: true
};
const BOTH: RouterModel = {
  id: 'gemini-3',
  name: 'Gemini 3',
  // providerId intentionally differs from the native id prefix so the
  // router's stripProviderPrefix no-op's (native id "gemini-3" doesn't
  // start with "google-") and the returned model id stays intact.
  providerId: 'google',
  enabled: true,
  supportsVision: true,
  supportsTools: true
};
const NEITHER: RouterModel = {
  id: 'deepseek-chat',
  name: 'DeepSeek Chat',
  providerId: 'deepseek',
  enabled: true,
  supportsVision: false,
  supportsTools: false
};

const ALL = [VISION_ONLY, TOOLS_ONLY, BOTH, NEITHER];

beforeEach(() => {
  // Reset governance so each test starts from a clean, fully-enabled pool
  // with no category overrides. VITEST mode writes to a temp dir on disk.
  // Pin optimization to "quality" so ranking reflects capability scores
  // (not cost-efficiency), keeping selection assertions deterministic.
  SettingsStorage.saveSettings({
    models: [],
    modelGov: { enabledModels: [], categoryOverrides: {}, optimizationGoal: 'quality' }
  });
  SettingsStorage.clearCache();
});

describe('ModelRouter.resolveCandidatePool (capability gate)', () => {
  it('pure vision task is restricted to vision-capable models', () => {
    const result = (ModelRouter as any).resolveCandidatePool(
      { isCoding: false, isReasoning: false, isVision: true },
      ALL
    );
    const ids = result.map((m: RouterModel) => m.id);
    expect(ids).toContain('gpt-4o');
    expect(ids).toContain('gemini-3');
    expect(ids).not.toContain('claude-sonnet'); // tool-only, no vision
    expect(ids).not.toContain('deepseek-chat'); // neither
  });

  it('pure coding task is restricted to tool-capable models', () => {
    const result = (ModelRouter as any).resolveCandidatePool(
      { isCoding: true, isReasoning: false, isVision: false },
      ALL
    );
    const ids = result.map((m: RouterModel) => m.id);
    expect(ids).toContain('claude-sonnet');
    expect(ids).toContain('gemini-3');
    expect(ids).not.toContain('gpt-4o'); // vision-only, no tools
    expect(ids).not.toContain('deepseek-chat'); // neither
  });

  it('mixed vision + coding task requires BOTH vision and tools (regression)', () => {
    // Before the fix this gate used OR, so a tool-only model could win a vision task.
    const result = (ModelRouter as any).resolveCandidatePool(
      { isCoding: true, isReasoning: false, isVision: true },
      ALL
    );
    const ids = result.map((m: RouterModel) => m.id);
    expect(ids).toEqual(['gemini-3']); // only model that is vision AND tools
    expect(ids).not.toContain('claude-sonnet'); // tool-only must not win vision work
    expect(ids).not.toContain('gpt-4o'); // vision-only cannot do the coding half
  });
  // (BOTH fixture uses providerId 'google' — see declaration above.)

  it('falls back to the full pool when no capable model is present', () => {
    const visionTaskPool = [TOOLS_ONLY, NEITHER]; // no vision-capable model
    const result = (ModelRouter as any).resolveCandidatePool(
      { isCoding: false, isReasoning: false, isVision: true },
      visionTaskPool
    );
    // No vision model exists -> gate yields nothing -> full pool returned (no throw).
    expect(result.map((m: RouterModel) => m.id)).toEqual(['claude-sonnet', 'deepseek-chat']);
  });
});

describe('ModelRouter.routeModelForTask', () => {
  it('throws when no models are configured', () => {
    expect(() => ModelRouter.routeModelForTask('hello', [])).toThrow();
  });

  it('selects the highest-scored vision model for a vision prompt', () => {
    const pick = ModelRouter.routeModelForTask('describe this image and screenshot', ALL);
    expect(pick.provider).toBe('google'); // gemini-3 has the highest vision score
    expect(pick.model).toBe('gemini-3');
  });

  it('selects a tool-capable model for a coding prompt', () => {
    const pick = ModelRouter.routeModelForTask('write a function to parse json', ALL);
    expect(pick.provider).toBe('anthropic');
    expect(pick.model).toBe('claude-sonnet');
  });

  it('honors a category override for the detected task type', () => {
    SettingsStorage.saveSettings({
      modelGov: { categoryOverrides: { vision: 'openai-gpt-4o' } }
    });
    const pick = ModelRouter.routeModelForTask('analyze this photo', ALL);
    expect(pick.provider).toBe('openai');
    expect(pick.model).toBe('gpt-4o');
  });
});

describe('ModelRouter.selectCandidateModels (best-of-N pool)', () => {
  it('returns only models satisfying every required modality for a mixed task', () => {
    const picks = ModelRouter.selectCandidateModels(
      'write code to draw a diagram',
      ALL,
      2
    );
    expect(picks).toHaveLength(1);
    expect(picks[0].provider).toBe('google');
    expect(picks[0].model).toBe('gemini-3');
  });

  it('returns up to `count` candidates for a pure coding task', () => {
    const picks = ModelRouter.selectCandidateModels('refactor this class', ALL, 2);
    expect(picks).toHaveLength(2);
    const ids = picks.map((p) => p.model);
    expect(ids).toContain('claude-sonnet');
    expect(ids).toContain('gemini-3');
  });
});

describe('ModelRouter.stripProviderPrefix', () => {
  it('strips a single provider prefix', () => {
    expect((ModelRouter as any).stripProviderPrefix('openai', 'openai-gpt-4o')).toBe('gpt-4o');
  });

  it('strips repeated (malformed double) prefixes', () => {
    expect((ModelRouter as any).stripProviderPrefix('openai', 'openai-openai-gpt-4o')).toBe('gpt-4o');
  });

  it('leaves an unprefixed id untouched', () => {
    expect((ModelRouter as any).stripProviderPrefix('anthropic', 'claude-sonnet')).toBe('claude-sonnet');
  });
});
