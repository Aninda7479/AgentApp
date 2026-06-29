import { describe, it, expect } from 'vitest';
import { BYOKProviderManager } from '../src/providers/byok.js';

describe('BYOKProviderManager', () => {
  it('should register and retrieve API key configurations', () => {
    const manager = new BYOKProviderManager();
    manager.registerKey({ provider: 'openai', apiKey: 'sk-test-key-123' });
    
    const config = manager.getKey('openai');
    expect(config).toBeDefined();
    expect(config?.apiKey).toBe('sk-test-key-123');
  });

  it('should throw an error when accessing unconfigured keys', () => {
    const manager = new BYOKProviderManager();
    expect(() => manager.getActiveConfig()).toThrow('No BYOK API key configured');
  });
});
