import { describe, it, expect, beforeEach } from 'vitest';
import { partnerMemory } from './partnerMemory';

describe('PartnerMemory Store', () => {
  beforeEach(() => {
    partnerMemory.resetMemory();
  });

  it('should initialize with default companion values', () => {
    const state = partnerMemory.getState();
    expect(state.companionName).toBe('Kai');
    expect(state.userNickname).toBe('Partner');
    expect(state.relationshipType).toBe('friend');
    expect(state.affinityScore).toBe(20);
    expect(state.streak).toBe(1);
  });

  it('should increment affinity score on interactions', () => {
    partnerMemory.recordInteraction(5);
    expect(partnerMemory.getState().affinityScore).toBe(25);
    expect(partnerMemory.getState().totalInteractions).toBe(2);
  });

  it('should cap affinity score at 100', () => {
    partnerMemory.recordInteraction(150);
    expect(partnerMemory.getState().affinityScore).toBe(100);
    expect(partnerMemory.getState().milestones).toContain('affinity_100');
  });

  it('should log mood entries and award points', () => {
    partnerMemory.logMood('😊', 'Great', 'Had a productive morning');
    const state = partnerMemory.getState();
    expect(state.moodHistory.length).toBe(1);
    expect(state.moodHistory[0].moodEmoji).toBe('😊');
    expect(state.moodHistory[0].note).toBe('Had a productive morning');
  });

  it('should add and remove recalled memories', () => {
    partnerMemory.addMemory('Likes Three.js and TypeScript');
    expect(partnerMemory.getState().keyMemories).toContain('Likes Three.js and TypeScript');

    partnerMemory.removeMemory(0);
    expect(partnerMemory.getState().keyMemories).not.toContain('Likes Three.js and TypeScript');
  });

  it('should update persona settings', () => {
    partnerMemory.updatePersona({
      companionName: 'Luna',
      relationshipType: 'girlfriend',
    });
    expect(partnerMemory.getState().companionName).toBe('Luna');
    expect(partnerMemory.getState().relationshipType).toBe('girlfriend');
  });
});
