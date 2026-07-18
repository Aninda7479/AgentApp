import { BYOKConfig } from '../types/agent.js';

/**
 * Media adapters support an explicit mock mode for offline development/testing,
 * signalled by the `mock-key` sentinel or an api key containing `mock`. Any
 * other caller without a real key has simply not connected a provider — in that
 * case the adapter must report a clear failure rather than returning fabricated
 * media with `status: 'success'`, which would mislead the user into thinking a
 * generation actually happened.
 */
export function hasRealMediaKey(config: BYOKConfig): boolean {
  return Boolean(config.apiKey) && config.apiKey !== 'mock-key' && !config.apiKey.includes('mock');
}

/**
 * Inverse of the mock-sentinel check used by every adapter's off-line fixture
 * branch. Centralised here so the "no provider" vs "explicit mock" distinction
 * can't drift between adapters, and so the `apiKey` being `undefined`/`null`
 * (a user who never connected a provider) is handled safely instead of throwing
 * inside `apiKey.includes(...)`.
 */
export function isMockKey(config: BYOKConfig): boolean {
  return Boolean(config.apiKey) && (config.apiKey === 'mock-key' || config.apiKey.includes('mock'));
}

/** Friendly, actionable message used when no provider is configured. */
export const NO_PROVIDER_MESSAGE =
  'No provider API key configured — connect a provider (e.g. OpenAI, a local ComfyUI endpoint) to enable media generation.';
