import { describe, it, expect } from 'vitest';
import { AgentEngine } from './ai-engine.js';

describe('AgentEngine.updateConfig', () => {
  it('swaps model/provider/apiKey/baseUrl without clearing history', () => {
    const engine = new AgentEngine(
      { provider: 'openai', apiKey: 'k', model: 'gpt-4o', projectRoot: process.cwd() },
      'update-config-session'
    );

    // Seed some conversation history.
    (engine as unknown as { record: (m: unknown) => void }).record({
      role: 'user',
      content: 'remember this'
    });
    const historyBefore = (engine as unknown as { history: unknown[] }).history.length;
    expect(historyBefore).toBeGreaterThan(0);

    engine.updateConfig({
      provider: 'anthropic',
      apiKey: 'new-key',
      baseUrl: 'https://api.anthropic.com',
      model: 'claude-3-5-sonnet-20241022',
      contextWindow: 200000
    });

    const cfg = (engine as unknown as { config: any }).config;
    expect(cfg.model).toBe('claude-3-5-sonnet-20241022');
    expect(cfg.provider).toBe('anthropic');
    expect(cfg.apiKey).toBe('new-key');
    expect(cfg.baseUrl).toBe('https://api.anthropic.com');
    expect((engine as unknown as { contextWindow: number }).contextWindow).toBe(200000);

    // History must be preserved so the conversation continues across the switch.
    expect((engine as unknown as { history: unknown[] }).history.length).toBe(historyBefore);
  });
});
