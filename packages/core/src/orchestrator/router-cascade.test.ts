import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * Difficulty-driven cascade tests (orchestrator-dev focus): verifies that the
 * router escalates reasoning effort for hard reasoning/coding tasks and widens
 * the ensemble candidate pool for high-difficulty tasks — without ever
 * overriding an explicit caller effort, and without any network call. The
 * adapter factory is stubbed so we capture the request the router ultimately
 * sends and assert on its `reasoningEffort`.
 */
const captured: { request: any } = { request: null };

vi.mock('../providers/models.js', async (importActual) => {
  const actual = await importActual<typeof import('./models.js')>();
  return {
    ...actual,
    createProviderAdapter: (config: { provider: string }) => ({
      complete: async (request: any) => {
        captured.request = request;
        return { text: 'ok', usage: {} };
      }
    })
  };
});

import { OrchestratorRouter, type RouterModel } from './router.js';
import { BYOKProviderManager } from '../providers/byok.js';
import type { BYOKConfig } from '../types/agent.js';

function cfg(provider: string): BYOKConfig {
  return { provider: provider as any, apiKey: 'k', model: 'm', baseUrl: '' } as BYOKConfig;
}
function mgrWith(...configs: BYOKConfig[]): BYOKProviderManager {
  const mgr = new BYOKProviderManager();
  for (const c of configs) mgr.registerKey(c);
  return mgr;
}

// Four tool-capable models so a high-difficulty task can return 3 candidates
// (vs. the default 2) and prove the ensemble-breadth cascade widened the pool.
const TOOL_A: RouterModel = { id: 'a', name: 'A', providerId: 'openai', enabled: true, supportsTools: true };
const TOOL_B: RouterModel = { id: 'b', name: 'B', providerId: 'anthropic', enabled: true, supportsTools: true };
const TOOL_C: RouterModel = { id: 'c', name: 'C', providerId: 'google', enabled: true, supportsTools: true };
const TOOL_D: RouterModel = { id: 'd', name: 'D', providerId: 'deepseek', enabled: true, supportsTools: true };
const FOUR_TOOLS = [TOOL_A, TOOL_B, TOOL_C, TOOL_D];

beforeEach(() => {
  captured.request = null;
});

describe('OrchestratorRouter difficulty cascade — reasoning-effort escalation', () => {
  it('auto-escalates reasoning effort to high for a hard reasoning task', async () => {
    const router = new OrchestratorRouter({ preferredProvider: 'openai' });
    await router.completeWithFallback(
      { messages: [{ role: 'user', content: 'prove this theorem step by step, a complex and difficult problem requiring multiple steps' }] } as any,
      mgrWith(cfg('openai'))
    );
    expect(captured.request?.reasoningEffort).toBe('high');
  });

  it('does NOT add reasoning effort for a trivial non-reasoning task (preserve cost/latency)', async () => {
    const router = new OrchestratorRouter({ preferredProvider: 'openai' });
    await router.completeWithFallback(
      { messages: [{ role: 'user', content: 'hi, what is the weather today?' }] } as any,
      mgrWith(cfg('openai'))
    );
    expect(captured.request?.reasoningEffort).toBeUndefined();
  });

  it('never overrides an explicit caller effort (caller wins over cascade)', async () => {
    const router = new OrchestratorRouter({ preferredProvider: 'openai', reasoningEffort: 'low' });
    await router.completeWithFallback(
      { messages: [{ role: 'user', content: 'prove this theorem step by step, complex and difficult requiring multiple steps' }] } as any,
      mgrWith(cfg('openai'))
    );
    expect(captured.request?.reasoningEffort).toBe('low');
  });
});

describe('OrchestratorRouter difficulty cascade — ensemble candidate breadth', () => {
  it('widens the candidate pool to 3 for a high-difficulty coding task', () => {
    const picks = OrchestratorRouter.selectCandidateModels(
      'refactor this complex and difficult distributed system architecture requiring multiple steps',
      FOUR_TOOLS,
      2
    );
    expect(picks).toHaveLength(3);
  });

  it('keeps the default count for a low-difficulty task', () => {
    const picks = OrchestratorRouter.selectCandidateModels('hi there, how are you today?', FOUR_TOOLS, 2);
    expect(picks).toHaveLength(2);
  });
});
