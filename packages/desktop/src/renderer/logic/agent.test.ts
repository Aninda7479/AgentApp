import { describe, it, expect } from 'vitest';
import { AgentService } from './agent';
import type { ProviderConnection } from './types';

const mkProvider = (partial: Partial<ProviderConnection> & Pick<ProviderConnection, 'id' | 'type'>): ProviderConnection => ({
  name: partial.id,
  apiKey: '',
  baseUrl: '',
  ...partial
});

describe('AgentService.resolveEngineProviderId', () => {
  it('keeps the real id for env-connected cloud providers', () => {
    const p = mkProvider({ id: 'google', type: 'env', apiKey: 'k' });
    expect(AgentService.resolveEngineProviderId(p)).toBe('google');
  });

  it('keeps the real id for key-connected cloud providers', () => {
    const p = mkProvider({ id: 'openai', type: 'key', apiKey: 'sk-test' });
    expect(AgentService.resolveEngineProviderId(p)).toBe('openai');
  });

  it('collapses arbitrary custom endpoints to the generic OpenAI-compatible "custom"', () => {
    const p = mkProvider({ id: 'my-proxy', type: 'custom', baseUrl: 'https://proxy.example.com/v1' });
    expect(AgentService.resolveEngineProviderId(p)).toBe('custom');
  });

  // Regression: Ollama is connected as type:'custom' but does NOT speak the
  // OpenAI-compatible /chat/completions protocol. Collapsing it to 'custom' made
  // the engine POST to http://localhost:11434/chat/completions, which Ollama
  // rejects with the plaintext "404 page not found". It must keep its real id so
  // the engine routes it through the Ollama family (/api/chat).
  it('preserves the "ollama" id even though it is a type:custom connection', () => {
    const p = mkProvider({ id: 'ollama', type: 'custom', baseUrl: 'http://localhost:11434' });
    expect(AgentService.resolveEngineProviderId(p)).toBe('ollama');
  });

  it('preserves the "ollama-cloud" id', () => {
    const p = mkProvider({ id: 'ollama-cloud', type: 'custom', baseUrl: 'https://api.ollama.com' });
    expect(AgentService.resolveEngineProviderId(p)).toBe('ollama-cloud');
  });
});
