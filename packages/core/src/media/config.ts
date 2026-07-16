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

/** Friendly, actionable message used when no provider is configured. */
export const NO_PROVIDER_MESSAGE =
  'No provider API key configured — connect a provider (e.g. OpenAI, a local ComfyUI endpoint) to enable media generation.';
