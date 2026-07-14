import { describe, it, expect } from 'vitest';
import { petWindowManager } from '../src/main/pet-window';

describe('PetWindow mood mapping', () => {
  it('maps agent events to pet moods', () => {
    expect(petWindowManager.moodFromAgentEvent('token')).toBe('thinking');
    expect(petWindowManager.moodFromAgentEvent('tool_call')).toBe('working');
    expect(petWindowManager.moodFromAgentEvent('tool_result')).toBe('working');
    expect(petWindowManager.moodFromAgentEvent('done')).toBe('celebrate');
    expect(petWindowManager.moodFromAgentEvent('error')).toBe('sad');
    expect(petWindowManager.moodFromAgentEvent('abort')).toBe('sad');
    expect(petWindowManager.moodFromAgentEvent('unknown')).toBeNull();
  });

  it('represents an enabled manager by default', () => {
    expect(petWindowManager.enabled).toBe(true);
  });
});
