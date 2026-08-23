import { describe, it, expect } from 'vitest';
import { DEFAULT_HOMELAB_PORT, AVAILABLE_MODELS, DEFAULT_SERVER_CONFIG } from './config.js';

describe('@superagent/ui Config & API Tests', () => {
  it('should use default HomeLab port 1469', () => {
    expect(DEFAULT_HOMELAB_PORT).toBe(1469);
  });

  it('should format default server config correctly', () => {
    expect(DEFAULT_SERVER_CONFIG.host).toBe('localhost');
    expect(DEFAULT_SERVER_CONFIG.port).toBe(1469);
  });

  it('should contain default LLM model options', () => {
    expect(AVAILABLE_MODELS.length).toBeGreaterThan(0);
    const gpt4 = AVAILABLE_MODELS.find((m) => m.id === 'gpt-4o');
    expect(gpt4).toBeDefined();
    expect(gpt4?.provider).toBe('openai');
  });
});
