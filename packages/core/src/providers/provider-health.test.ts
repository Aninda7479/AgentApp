import { describe, it, expect, beforeEach } from 'vitest';
import {
  classifyProviderError,
  ProviderHealthTracker,
  providerHealth,
  resetProviderHealth,
  applyHealthToModels
} from './provider-health.js';
import type { RouterModel } from '../types/agent.js';

describe('classifyProviderError', () => {
  it('maps 429 to rate_limited', () => {
    expect(classifyProviderError(new Error('OpenAI API error [429]: rate limit'))).toBe('rate_limited');
  });
  it('maps 401/403 to locked', () => {
    expect(classifyProviderError(new Error('Anthropic API error [401]: bad key'))).toBe('locked');
    expect(classifyProviderError(new Error('custom API error [403]: forbidden'))).toBe('locked');
  });
  it('maps 404/410 to deprecated', () => {
    expect(classifyProviderError(new Error('Gemini API error [404]: not found'))).toBe('deprecated');
    expect(classifyProviderError(new Error('Ollama API error [410]: gone'))).toBe('deprecated');
  });
  it('maps 5xx to rate_limited (server outage is transient)', () => {
    expect(classifyProviderError(new Error('OpenAI API error [503]: unavailable'))).toBe('rate_limited');
  });
  it('maps unknown 4xx to rate_limited (transient)', () => {
    expect(classifyProviderError(new Error('OpenAI API error [400]: bad request'))).toBe('rate_limited');
  });
  it('maps network failures (no status) to rate_limited', () => {
    expect(classifyProviderError(new Error('fetch failed'))).toBe('rate_limited');
    expect(classifyProviderError(new TypeError('Failed to fetch'))).toBe('rate_limited');
    expect(classifyProviderError(new Error('request to localhost:1 failed, reason: ECONNREFUSED'))).toBe('rate_limited');
  });
  it('handles non-Error throws conservatively', () => {
    expect(classifyProviderError('some opaque string')).toBe('rate_limited');
  });
});

describe('ProviderHealthTracker', () => {
  let now = 1000;
  let tracker: ProviderHealthTracker;
  beforeEach(() => { now = 1000; tracker = new ProviderHealthTracker(() => now); });

  it('starts available and flips to locked on auth failure (sticky)', () => {
    expect(tracker.getStatus('openai')).toBe('available');
    tracker.recordFailure('openai', new Error('OpenAI API error [401]: bad key'));
    expect(tracker.getStatus('openai')).toBe('locked');
  });
  it('flips to deprecated on 404 and stays deprecated', () => {
    tracker.recordFailure('openai', new Error('OpenAI API error [404]: gone'));
    expect(tracker.getStatus('openai')).toBe('deprecated');
  });
  it('rate_limited is lifted once the cooldown elapses', () => {
    tracker.recordFailure('openai', new Error('OpenAI API error [429]: slow down'));
    expect(tracker.getStatus('openai')).toBe('rate_limited');
    now += 59_000;
    expect(tracker.getStatus('openai')).toBe('rate_limited'); // still cooling
    now += 1_000;
    expect(tracker.getStatus('openai')).toBe('available'); // cooldown passed
  });
  it('recordSuccess clears a rate_limit', () => {
    tracker.recordFailure('openai', new Error('OpenAI API error [500]: boom'));
    expect(tracker.getStatus('openai')).toBe('rate_limited');
    tracker.recordSuccess('openai');
    expect(tracker.getStatus('openai')).toBe('available');
  });
  it('reset() clears tracked state', () => {
    tracker.recordFailure('openai', new Error('OpenAI API error [401]: bad key'));
    tracker.reset();
    expect(tracker.getStatus('openai')).toBe('available');
  });
});

describe('applyHealthToModels', () => {
  beforeEach(() => resetProviderHealth());
  it('stamps a rate_limited provider onto RouterModel but leaves healthy ones untouched', () => {
    providerHealth.recordFailure('openai', new Error('OpenAI API error [429]: slow'));
    const models: RouterModel[] = [
      { id: 'gpt-4o', name: 'GPT-4o', providerId: 'openai', enabled: true, supportsVision: true, supportsTools: true },
      { id: 'gemini-3', name: 'Gemini 3', providerId: 'google', enabled: true, supportsVision: true, supportsTools: true }
    ];
    const out = applyHealthToModels(models);
    expect(out[0].accessStatus).toBe('rate_limited');
    expect(out[1].accessStatus).toBeUndefined();
  });
  it('preserves an explicit non-available override over runtime health', () => {
    providerHealth.recordFailure('openai', new Error('OpenAI API error [429]: slow'));
    const models: RouterModel[] = [
      { id: 'gpt-4o', name: 'GPT-4o', providerId: 'openai', enabled: true, supportsVision: true, supportsTools: true, accessStatus: 'deprecated' }
    ];
    const out = applyHealthToModels(models);
    expect(out[0].accessStatus).toBe('deprecated');
  });
});

describe('getDiagnostics', () => {
  let now = 1000;
  let tracker: ProviderHealthTracker;
  beforeEach(() => { now = 1000; tracker = new ProviderHealthTracker(() => now); });

  it('reports a rate_limit cooldown countdown that ticks down to zero', () => {
    tracker.recordFailure('openai', new Error('OpenAI API error [429]: slow'));
    const d = tracker.getDiagnostics('openai').openai;
    expect(d.status).toBe('rate_limited');
    expect(d.consecutiveFailures).toBe(1);
    expect(d.cooldownRemainingMs).toBe(60_000);
    now += 20_000;
    expect(tracker.getDiagnostics('openai').openai.cooldownRemainingMs).toBe(40_000);
    now += 40_000;
    const cleared = tracker.getDiagnostics('openai').openai;
    expect(cleared.status).toBe('available');
    expect(cleared.cooldownRemainingMs).toBe(0);
    expect(cleared.consecutiveFailures).toBe(0);
  });

  it('keeps locked sticky with its failure count even after the cooldown window', () => {
    tracker.recordFailure('openai', new Error('OpenAI API error [401]: bad key'));
    now += 120_000; // far past any cooldown window
    const d = tracker.getDiagnostics('openai').openai;
    expect(d.status).toBe('locked'); // never auto-recovers
    expect(d.consecutiveFailures).toBe(1);
    expect(d.cooldownRemainingMs).toBe(0);
  });

  it('accumulates consecutive failures across repeated failures', () => {
    tracker.recordFailure('openai', new Error('OpenAI API error [500]: boom'));
    tracker.recordFailure('openai', new Error('OpenAI API error [500]: boom'));
    tracker.recordFailure('openai', new Error('OpenAI API error [500]: boom'));
    const d = tracker.getDiagnostics('openai').openai;
    expect(d.status).toBe('rate_limited');
    expect(d.consecutiveFailures).toBe(3);
  });

  it('resets the failure counter on success', () => {
    tracker.recordFailure('openai', new Error('OpenAI API error [429]: slow'));
    tracker.recordSuccess('openai');
    const d = tracker.getDiagnostics('openai').openai;
    expect(d.status).toBe('available');
    expect(d.consecutiveFailures).toBe(0);
    expect(d.cooldownRemainingMs).toBe(0);
  });

  it('returns a diagnosis map for every tracked provider when called without an argument', () => {
    tracker.recordFailure('openai', new Error('OpenAI API error [429]: slow'));
    tracker.recordFailure('anthropic', new Error('Anthropic API error [401]: bad key'));
    const all = tracker.getDiagnostics();
    expect(Object.keys(all).sort()).toEqual(['anthropic', 'openai']);
    expect(all.anthropic.status).toBe('locked');
    expect(all.openai.status).toBe('rate_limited');
  });

  it('returns an empty map for an untracked provider', () => {
    expect(tracker.getDiagnostics('ghost')).toEqual({});
  });
});
