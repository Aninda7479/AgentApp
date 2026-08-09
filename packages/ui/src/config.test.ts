import { describe, it, expect } from 'vitest';
import { DEFAULT_HOMELAB_PORT, AVAILABLE_MODELS } from './config.js';
import { SuperAgentApiClient } from './api/client.js';

describe('@superagent/ui Config & API Tests', () => {
  it('should use default HomeLab port 14692', () => {
    expect(DEFAULT_HOMELAB_PORT).toBe(14692);
  });

  it('should format HomeLab API base URL correctly', () => {
    const client = new SuperAgentApiClient({
      host: '192.168.1.100',
      port: 14692,
      isTauri: false
    });
    expect(client.getBaseUrl()).toBe('http://192.168.1.100:14692');
  });

  it('should contain default LLM model options', () => {
    expect(AVAILABLE_MODELS.length).toBeGreaterThan(0);
    const gpt4 = AVAILABLE_MODELS.find((m) => m.id === 'gpt-4o');
    expect(gpt4).toBeDefined();
    expect(gpt4?.provider).toBe('openai');
  });
});
