import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * Tests the observability half of the resilience promise (orchestrator-dev
 * gap #9): when the router skips, demotes, or fails over a provider it must
 * emit a structured `RerouteEvent` via `onReroute` (and the engine surfaces it
 * as a 'reroute' event) so the user can SEE that a provider was banned,
 * throttled, or rerouted — not just silently rerouted. No network calls: the
 * adapter factory is stubbed, the real ProviderHealthTracker is exercised.
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

import { OrchestratorRouter, type RerouteEvent } from './router.js';
import { providerHealth, resetProviderHealth } from './provider-health.js';
import { BYOKProviderManager } from '../providers/byok.js';
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

describe('OrchestratorRouter.completeWithFallback — reroute observability', () => {
  it('emits NO reroute events when the first healthy provider succeeds', async () => {
    fakeAdapters['openai'] = { complete: async () => OK_RESPONSE };
    const events: RerouteEvent[] = [];
    const router = new OrchestratorRouter({ preferredProvider: 'openai' });
    await router.completeWithFallback({ messages: [] } as any, mgrWith(cfg('openai')), undefined, undefined, (e) => events.push(e));
    expect(events).toEqual([]);
  });

  it('emits a health-skip reroute for a known-unhealthy provider when a healthy one succeeds', async () => {
    // Pre-existing knowledge that openai is rate-limited → should be skipped.
    providerHealth.recordFailure('openai', new Error('OpenAI API error [429]: slow'));
    let openaiCalls = 0;
    fakeAdapters['openai'] = { complete: async () => { openaiCalls++; throw new Error('OpenAI API error [429]: slow'); } };
    fakeAdapters['anthropic'] = { complete: async () => OK_RESPONSE };

    const events: RerouteEvent[] = [];
    const router = new OrchestratorRouter({ preferredProvider: 'openai', fallbackOrder: ['anthropic'] });
    const res = await router.completeWithFallback({ messages: [] } as any, mgrWith(cfg('openai'), cfg('anthropic')), undefined, undefined, (e) => events.push(e));

    expect(res).toBe(OK_RESPONSE);
    expect(openaiCalls).toBe(0); // never actually hit the down provider
    // Exactly one reroute: the health-skip for openai (no error attempt, no final try).
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ from: 'openai', reason: 'health-skip', status: 'rate_limited' });
  });

  it('emits an error reroute with the next provider when the preferred one fails and fallback succeeds', async () => {
    fakeAdapters['openai'] = { complete: async () => { throw new Error('OpenAI API error [429]: slow'); } };
    fakeAdapters['anthropic'] = { complete: async () => OK_RESPONSE };

    const events: RerouteEvent[] = [];
    const router = new OrchestratorRouter({ preferredProvider: 'openai', fallbackOrder: ['anthropic'] });
    const res = await router.completeWithFallback({ messages: [] } as any, mgrWith(cfg('openai'), cfg('anthropic')), undefined, undefined, (e) => events.push(e));

    expect(res).toBe(OK_RESPONSE);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ from: 'openai', to: 'anthropic', reason: 'error', status: 'rate_limited' });
  });

  it('emits a terminal error reroute (no `to`) when every provider fails', async () => {
    fakeAdapters['openai'] = { complete: async () => { throw new Error('OpenAI API error [500]: boom'); } };
    fakeAdapters['anthropic'] = { complete: async () => { throw new Error('Anthropic API error [500]: boom'); } };

    const events: RerouteEvent[] = [];
    const router = new OrchestratorRouter({ preferredProvider: 'openai', fallbackOrder: ['anthropic'] });
    await expect(
      router.completeWithFallback({ messages: [] } as any, mgrWith(cfg('openai'), cfg('anthropic')), undefined, undefined, (e) => events.push(e))
    ).rejects.toThrow(/All provider fallbacks failed/);

    expect(events).toHaveLength(2);
    expect(events[0]).toMatchObject({ from: 'openai', to: 'anthropic', reason: 'error' });
    expect(events[1]).toMatchObject({ from: 'anthropic', to: undefined, reason: 'error' });
  });

  it('emits a health-last-resort reroute when ALL providers are unhealthy but one still succeeds', async () => {
    // Both providers pre-marked unhealthy; only the first one (openai) actually recovers.
    providerHealth.recordFailure('openai', new Error('OpenAI API error [429]: slow'));
    providerHealth.recordFailure('anthropic', new Error('Anthropic API error [500]: down'));
    fakeAdapters['openai'] = { complete: async () => OK_RESPONSE };
    fakeAdapters['anthropic'] = { complete: async () => { throw new Error('Anthropic API error [500]: down'); } };

    const events: RerouteEvent[] = [];
    const router = new OrchestratorRouter({ preferredProvider: 'openai', fallbackOrder: ['anthropic'] });
    const res = await router.completeWithFallback({ messages: [] } as any, mgrWith(cfg('openai'), cfg('anthropic')), undefined, undefined, (e) => events.push(e));

    expect(res).toBe(OK_RESPONSE);
    // openai is unhealthy but tried first (no healthier option) → last-resort;
    // anthropic also unhealthy but a healthy recovery already happened, so it is skipped.
    expect(events.some((e) => e.from === 'openai' && e.reason === 'health-last-resort')).toBe(true);
  });
});

/**
 * The engine must surface reroute decisions as a 'reroute' AgentEvent so the
 * GUI (gap #9) can show the user the resilience happened. We drive a real
 * runOrchestrated (text-only, so it falls through to completeWithFallback)
 * where the preferred provider fails 429 and a fallback succeeds — asserting
 * the engine emits a 'reroute' event, not just a silent success.
 */
describe('AgentEngine.runOrchestrated — surfaces reroute as an event', () => {
  it('emits a "reroute" event when the router fails over a provider', async () => {
    const { AgentEngine } = await import('../providers/ai-engine.js');
    fakeAdapters['openai'] = { complete: async () => { throw new Error('OpenAI API error [429]: slow'); } };
    fakeAdapters['anthropic'] = { complete: async () => ({ content: 'answer', usage: {} }) };

    const events: any[] = [];
    await AgentEngine.runOrchestrated(
      'hello',
      (e) => events.push(e),
      {
        config: { provider: 'openai', apiKey: 'k', model: 'm' } as any,
        byokManager: mgrWith(cfg('openai'), cfg('anthropic')),
        pool: [
          { id: 'openai-m', name: 'm', providerId: 'openai', enabled: true } as any,
          { id: 'anthropic-m', name: 'm', providerId: 'anthropic', enabled: true } as any
        ]
      }
    );

    const reroute = events.find((e) => e.type === 'reroute');
    expect(reroute).toBeDefined();
    expect(reroute.content).toContain('openai');
    expect(reroute.content).toContain('anthropic');
    expect(events.some((e) => e.type === 'token' && e.content === 'answer')).toBe(true);
    expect(events.some((e) => e.type === 'done')).toBe(true);
  });
});
