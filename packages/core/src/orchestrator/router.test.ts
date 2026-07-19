import { describe, it, expect, beforeEach } from 'vitest';
import { OrchestratorRouter, type RouterModel } from './router.js';
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

describe('OrchestratorRouter.resolveCandidatePool (capability gate)', () => {
  it('pure vision task is restricted to vision-capable models', () => {
    const result = (OrchestratorRouter as any).resolveCandidatePool(
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
    const result = (OrchestratorRouter as any).resolveCandidatePool(
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
    const result = (OrchestratorRouter as any).resolveCandidatePool(
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
    const result = (OrchestratorRouter as any).resolveCandidatePool(
      { isCoding: false, isReasoning: false, isVision: true },
      visionTaskPool
    );
    // No vision model exists -> gate yields nothing -> full pool returned (no throw).
    expect(result.map((m: RouterModel) => m.id)).toEqual(['claude-sonnet', 'deepseek-chat']);
  });
});

describe('OrchestratorRouter.resolveCandidatePool (availability filter)', () => {
  // Availability pre-filter: a model whose accessStatus is locked / rate_limited
  // / deprecated must never be selected, even if it is capability-fit. This is
  // the core "can't be banned out from under you" guarantee.
  const RATE_LIMITED_VISION: RouterModel = {
    id: 'gpt-4o', name: 'GPT-4o', providerId: 'openai', enabled: true,
    supportsVision: true, supportsTools: false, accessStatus: 'rate_limited'
  };
  const AVAILABLE_VISION: RouterModel = {
    id: 'gemini-3', name: 'Gemini 3', providerId: 'google', enabled: true,
    supportsVision: true, supportsTools: true, accessStatus: 'available'
  };
  const LOCKED_TOOLS: RouterModel = {
    id: 'claude-sonnet', name: 'Claude Sonnet', providerId: 'anthropic', enabled: true,
    supportsVision: false, supportsTools: true, accessStatus: 'locked'
  };
  const DEPRECATED_TOOLS: RouterModel = {
    id: 'deepseek-chat', name: 'DeepSeek Chat', providerId: 'deepseek', enabled: true,
    supportsVision: false, supportsTools: true, accessStatus: 'deprecated'
  };

  it('drops rate_limited models from the candidate pool', () => {
    const result = (OrchestratorRouter as any).resolveCandidatePool(
      { isCoding: false, isReasoning: false, isVision: true },
      [RATE_LIMITED_VISION, AVAILABLE_VISION]
    );
    const ids = result.map((m: RouterModel) => m.id);
    expect(ids).toContain('gemini-3');
    expect(ids).not.toContain('gpt-4o'); // rate_limited -> skipped
  });

  it('a coding task never selects a locked or deprecated tool model', () => {
    const result = (OrchestratorRouter as any).resolveCandidatePool(
      { isCoding: true, isReasoning: false, isVision: false },
      [LOCKED_TOOLS, DEPRECATED_TOOLS, AVAILABLE_VISION]
    );
    const ids = result.map((m: RouterModel) => m.id);
    expect(ids).toContain('gemini-3'); // vision + tools, available
    expect(ids).not.toContain('claude-sonnet'); // locked
    expect(ids).not.toContain('deepseek-chat'); // deprecated
  });

  it('keeps an absent accessStatus as available (backward-compatible)', () => {
    const legacy: RouterModel = {
      id: 'gpt-4o', name: 'GPT-4o', providerId: 'openai', enabled: true,
      supportsVision: true, supportsTools: false
    };
    const result = (OrchestratorRouter as any).resolveCandidatePool(
      { isCoding: false, isReasoning: false, isVision: true },
      [legacy]
    );
    expect(result.map((m: RouterModel) => m.id)).toEqual(['gpt-4o']);
  });

  it('never empties the pool: if every model is unavailable it falls back to the full pool', () => {
    const result = (OrchestratorRouter as any).resolveCandidatePool(
      { isCoding: false, isReasoning: false, isVision: false },
      [LOCKED_TOOLS, DEPRECATED_TOOLS]
    );
    const ids = result.map((m: RouterModel) => m.id);
    expect(ids).toContain('claude-sonnet');
    expect(ids).toContain('deepseek-chat');
  });
});

describe('OrchestratorRouter.routeModelForTask', () => {
  it('throws when no models are configured', () => {
    expect(() => OrchestratorRouter.routeModelForTask('hello', [])).toThrow();
  });

  it('selects the highest-scored vision model for a vision prompt', () => {
    const pick = OrchestratorRouter.routeModelForTask('describe this image and screenshot', ALL);
    // gpt-4o curates to a higher vision score (76) than gemini-3 (no DB entry →
    // default 30), and both are vision-capable, so gpt-4o ranks first.
    expect(pick.provider).toBe('openai');
    expect(pick.model).toBe('gpt-4o');
  });

  it('selects a tool-capable model for a coding prompt', () => {
    const pick = OrchestratorRouter.routeModelForTask('write a function to parse json', ALL);
    expect(pick.provider).toBe('anthropic');
    expect(pick.model).toBe('claude-sonnet');
  });

  it('honors a category override for the detected task type', () => {
    SettingsStorage.saveSettings({
      modelGov: { categoryOverrides: { vision: 'openai-gpt-4o' } }
    });
    const pick = OrchestratorRouter.routeModelForTask('analyze this photo', ALL);
    expect(pick.provider).toBe('openai');
    expect(pick.model).toBe('gpt-4o');
  });
});

describe('OrchestratorRouter.selectCandidateModels (best-of-N pool)', () => {
  it('returns only models satisfying every required modality for a mixed task', () => {
    const picks = OrchestratorRouter.selectCandidateModels(
      'write code to draw a diagram',
      ALL,
      2
    );
    expect(picks).toHaveLength(1);
    expect(picks[0].provider).toBe('google');
    expect(picks[0].model).toBe('gemini-3');
  });

  it('returns up to `count` candidates for a pure coding task', () => {
    const picks = OrchestratorRouter.selectCandidateModels('refactor this class', ALL, 2);
    expect(picks).toHaveLength(2);
    const ids = picks.map((p) => p.model);
    expect(ids).toContain('claude-sonnet');
    expect(ids).toContain('gemini-3');
  });
});

describe('OrchestratorRouter.stripProviderPrefix', () => {
  it('strips exactly the single canonical provider prefix', () => {
    expect((OrchestratorRouter as any).stripProviderPrefix('openai', 'openai-gpt-4o')).toBe('gpt-4o');
  });

  it('strips one prefix even when the input carries a malformed double prefix', () => {
    // The catalog contract is exactly one `${providerId}-` prefix; a doubled
    // id is malformed upstream. We strip once and leave the remaining
    // canonical `${providerId}-${nativeId}` intact rather than consuming it.
    expect((OrchestratorRouter as any).stripProviderPrefix('openai', 'openai-openai-gpt-4o')).toBe('openai-gpt-4o');
  });

  it('preserves a native id that begins with the providerId (Claude/DeepSeek)', () => {
    // Regression: a repeat-strip loop previously corrupted these into
    // `sonnet-4-5` / `chat`. The catalog id is `${providerId}-${nativeId}`,
    // so a single strip must yield the native id the API expects.
    expect((OrchestratorRouter as any).stripProviderPrefix('claude', 'claude-claude-sonnet-4-5')).toBe('claude-sonnet-4-5');
    expect((OrchestratorRouter as any).stripProviderPrefix('deepseek', 'deepseek-deepseek-chat')).toBe('deepseek-chat');
  });

  it('leaves an unprefixed id untouched', () => {
    expect((OrchestratorRouter as any).stripProviderPrefix('anthropic', 'claude-sonnet')).toBe('claude-sonnet');
  });
});
