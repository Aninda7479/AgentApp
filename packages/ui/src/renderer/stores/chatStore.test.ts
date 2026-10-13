import { describe, it, expect, beforeEach, vi } from 'vitest';
import { chatStore } from './chatStore';
import type { TrajectoryStep } from '../core/types';

describe('chatStore', () => {
  beforeEach(() => {
    chatStore.setProjects([]);
    chatStore.setChats([]);
    chatStore.setActiveChatId(null);
    chatStore.setState(() => ({ residentSteps: new Map(), activePanels: [] }));
  });

  describe('Deduplication', () => {
    it('deduplicates projects by case-insensitive name', () => {
      chatStore.setProjects([
        { name: 'DemoProject', folders: ['/path/1'] },
        { name: 'demoproject', folders: ['/path/2'] },
        { name: 'DEMOPROJECT', folders: ['/path/3'] },
        { name: 'OtherProject', folders: ['/path/4'] },
      ]);

      const state = chatStore.getState();
      expect(state.projects).toHaveLength(2);
      expect(state.projects[0].name).toBe('DemoProject');
      expect(state.projects[1].name).toBe('OtherProject');
    });

    it('deduplicates chats by ID', () => {
      chatStore.setChats([
        { id: 'chat-1', title: 'First Chat', project: 'DemoProject', model: 'gpt-4o', timestamp: '2026-09-01T10:00:00Z', steps: [] },
        { id: 'chat-1', title: 'Duplicate First Chat', project: 'DemoProject', model: 'gpt-4o', timestamp: '2026-09-01T10:05:00Z', steps: [] },
        { id: 'chat-2', title: 'Second Chat', project: 'DemoProject', model: 'gpt-4o', timestamp: '2026-09-01T10:10:00Z', steps: [] },
      ]);

      const state = chatStore.getState();
      expect(state.chats).toHaveLength(2);
      expect(state.chats[0].id).toBe('chat-1');
      expect(state.chats[1].id).toBe('chat-2');
    });
  });

  describe('Multi-Panel Workspace Navigation', () => {
    it('synchronizes activeChatId and activePanels on selection', () => {
      chatStore.setActiveChatId('chat-alpha');
      expect(chatStore.getState().activeChatId).toBe('chat-alpha');
      expect(chatStore.getState().activePanels).toEqual(['chat-alpha']);

      chatStore.setActiveChatId(null);
      expect(chatStore.getState().activeChatId).toBeNull();
      expect(chatStore.getState().activePanels).toEqual([]);
    });

    it('manages side-by-side panel layout and fallback on close', () => {
      chatStore.openPanel('chat-1');
      chatStore.openPanel('chat-2');
      chatStore.openPanel('chat-3');

      expect(chatStore.getState().activePanels).toEqual(['chat-1', 'chat-2', 'chat-3']);
      expect(chatStore.getState().activeChatId).toBe('chat-3');

      // Closing current active panel falls back to the previous remaining panel
      chatStore.closePanel('chat-3');
      expect(chatStore.getState().activePanels).toEqual(['chat-1', 'chat-2']);
      expect(chatStore.getState().activeChatId).toBe('chat-2');

      // Closing a background panel preserves current active panel
      chatStore.closePanel('chat-1');
      expect(chatStore.getState().activePanels).toEqual(['chat-2']);
      expect(chatStore.getState().activeChatId).toBe('chat-2');
    });
  });

  describe('Resident Steps LRU Cache & RAM Conservation', () => {
    it('stores and retrieves trajectory steps accurately', () => {
      const step: TrajectoryStep = {
        id: 'step-1',
        type: 'user',
        content: 'Explain quantum computing',
      };

      chatStore.setSteps('chat-test', [step]);
      expect(chatStore.getSteps('chat-test')).toEqual([step]);

      chatStore.updateSteps('chat-test', (prev) => [
        ...prev,
        { id: 'step-2', type: 'assistant', content: 'Quantum computing uses qubits.' },
      ]);

      const updated = chatStore.getSteps('chat-test');
      expect(updated).toHaveLength(2);
      expect(updated[1].content).toBe('Quantum computing uses qubits.');
    });

    it('enforces RESIDENT_CAP = 5 to evict inactive chats from RAM', () => {
      chatStore.setActiveChatId('chat-active');

      // Fill 7 chats with step payloads
      for (let i = 1; i <= 7; i++) {
        chatStore.setSteps(`chat-${i}`, [
          { id: `s-${i}`, type: 'thought', content: `Thinking for chat ${i}` },
        ]);
      }

      const resident = chatStore.getState().residentSteps;
      // Resident size should not exceed 5 chats
      expect(resident.size).toBeLessThanOrEqual(5);

      // Active chat is never evicted
      chatStore.setSteps('chat-active', [{ id: 'sa', type: 'user', content: 'Important chat' }]);
      for (let i = 8; i <= 12; i++) {
        chatStore.setSteps(`chat-${i}`, [{ id: `s-${i}`, type: 'thought', content: `Work ${i}` }]);
      }
      expect(chatStore.getState().residentSteps.has('chat-active')).toBe(true);
    });

    it('handles heavy conversation step stress (1,000 steps) without degradation', () => {
      const largeSteps: TrajectoryStep[] = Array.from({ length: 1000 }, (_, idx) => ({
        id: `stress-step-${idx}`,
        type: idx % 2 === 0 ? 'user' : 'assistant',
        content: `Synthetic step content token chunk #${idx}`,
      }));

      const startTime = performance.now();
      chatStore.setSteps('heavy-chat', largeSteps);
      const retrieved = chatStore.getSteps('heavy-chat');
      const durationMs = performance.now() - startTime;

      expect(retrieved).toHaveLength(1000);
      expect(retrieved[999].id).toBe('stress-step-999');
      // Must execute efficiently in memory
      expect(durationMs).toBeLessThan(100);
    });
  });

  describe('Reactivity & Subscriber Notifications', () => {
    it('notifies subscribers synchronously upon state mutation', () => {
      const listener = vi.fn();
      const unsubscribe = chatStore.subscribe(listener);

      chatStore.setActiveProject('ProjectX');
      expect(listener).toHaveBeenCalledTimes(1);

      chatStore.setDraftProject('DraftY');
      expect(listener).toHaveBeenCalledTimes(2);

      unsubscribe();
      chatStore.setActiveProject('ProjectZ');
      expect(listener).toHaveBeenCalledTimes(2);
    });
  });
});
