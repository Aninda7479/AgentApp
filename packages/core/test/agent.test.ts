import { describe, it, expect } from 'vitest';
import { SuperAgentEngine } from '../src/planner/agent.js';
import { BYOKProviderManager } from '../src/providers/byok.js';

describe('SuperAgentEngine', () => {
  it('should initialize trajectory and queue user turns', () => {
    const manager = new BYOKProviderManager();
    manager.registerKey({ provider: 'openai', apiKey: 'sk-test-123' });

    const engine = new SuperAgentEngine(manager, 'test-session');
    engine.queueTurn('Hello SuperAgent!');

    const trajectory = engine.getTrajectory();
    expect(trajectory.sessionId).toBe('test-session');
    expect(trajectory.messages.length).toBeGreaterThan(0);
  });
});
