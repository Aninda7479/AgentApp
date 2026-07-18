import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * Simulates a provider going down WITHOUT any network call — this is the
 * "simulate a provider being unreachable (bad endpoint, forced timeout)" test
 * from the orchestrator-dev skill (Step 6). We stub the adapter factory so an
 * adapter can throw a status-coded error the health tracker classifies, then
 * assert the router reroutes and records the failure. The real
 * provider-health singleton is used (not mocked), so we exercise the actual
 * wiring in ModelRouter.completeWithFallback.
 */
const fakeAdapters: Record<string, { complete: () => Promise<any> }> = {};

vi.mock('../providers/models.js', async (importActual) => {
  const actual = await importActual<typeof import('../providers/models.js')>();
  return {
    ...actual,
    createProviderAdapter: (config: { provider: string }) => {
      const a = fakeAdapters[config.provider];
      if (!a) throw new Error(`no fake adapter registered for ${config.provider}`);
      return a;
    }
  };
});

import { ModelRouter } from './router.js';
import { providerHealth, resetProviderHealth } from './provider-health.js';
import { BYOKProviderManager } from './byok.js';
import type { BYOKConfig } from '../types/agent.js';

const OK_RESPONSE = { text: 'ok', usage: {} };

function cfg(provider: string, model = 'm', apiKey = 'k'): BYOKConfig {
  return { provider: provider as any, apiKey, model, baseUrl: '' } as BYOKConfig;
}

function mgrWith(...configs: BYOKConfig[]): BYOKProviderManager {
  const mgr = new BYOKProviderManager();
  for (const c of configs) mgr.registerKey(c);
  return mgr;
}

beforeEach(() => {
  resetProviderHealth();
  for (const k of Object.keys(fakeAdapters)) delete fakeAdapters[k];
});

describe('ModelRouter.completeWithFallback — health-aware reroute', () => {
  it('reroutes to a healthy provider when the preferred one is rate-limited', async () => {
    fakeAdapters['openai'] = { complete: async () => { throw new Error('OpenAI API error [429]: slow down'); } };
    fakeAdapters['anthropic'] = { complete: async () => OK_RESPONSE };

    const router = new ModelRouter({ preferredProvider: 'openai', fallbackOrder: ['anthropic'] });
    const res = await router.completeWithFallback({ messages: [] } as any, mgrWith(cfg('openai'), cfg('anthropic')));

    expect(res).toBe(OK_RESPONSE);
    expect(providerHealth.getStatus('openai')).toBe('rate_limited');
    expect(providerHealth.getStatus('anthropic')).toBe('available');
  });

  it('tries the already-known-healthy provider first (no wasted 429 on a down provider)', async () => {
    // Pre-existing knowledge: openai is rate-limited from a prior failure.
    providerHealth.recordFailure('openai', new Error('OpenAI API error [429]: slow'));
    let openaiCalls = 0;
    fakeAdapters['openai'] = { complete: async () => { openaiCalls++; throw new Error('OpenAI API error [429]: slow'); } };
    fakeAdapters['anthropic'] = { complete: async () => OK_RESPONSE };

    const router = new ModelRouter({ preferredProvider: 'openai', fallbackOrder: ['anthropic'] });
    const res = await router.completeWithFallback({ messages: [] } as any, mgrWith(cfg('openai'), cfg('anthropic')));

    expect(res).toBe(OK_RESPONSE);
    expect(openaiCalls).toBe(0); // healthy-first ordering skipped the down provider
  });

  it('records success and clears a prior rate_limit', async () => {
    providerHealth.recordFailure('openai', new Error('OpenAI API error [429]: slow'));
    fakeAdapters['openai'] = { complete: async () => OK_RESPONSE };

    const router = new ModelRouter({ preferredProvider: 'openai' });
    await router.completeWithFallback({ messages: [] } as any, mgrWith(cfg('openai')));

    expect(providerHealth.getStatus('openai')).toBe('available');
  });

  it('still throws a clear error when every provider is down (no silent drop)', async () => {
    fakeAdapters['openai'] = { complete: async () => { throw new Error('OpenAI API error [500]: boom'); } };
    fakeAdapters['anthropic'] = { complete: async () => { throw new Error('Anthropic API error [500]: boom'); } };

    const router = new ModelRouter({ preferredProvider: 'openai', fallbackOrder: ['anthropic'] });
    await expect(
      router.completeWithFallback({ messages: [] } as any, mgrWith(cfg('openai'), cfg('anthropic')))
    ).rejects.toThrow(/All provider fallbacks failed/);

    expect(providerHealth.getStatus('openai')).toBe('rate_limited');
    expect(providerHealth.getStatus('anthropic')).toBe('rate_limited');
  });
});
