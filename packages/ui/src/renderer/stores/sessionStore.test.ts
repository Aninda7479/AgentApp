import { describe, it, expect, beforeEach } from 'vitest';
import { sessionStore } from './sessionStore';

describe('sessionStore', () => {
  beforeEach(() => {
    // Clear state before each test
    sessionStore.getState().runningSessions.clear();
    sessionStore.getState().queues.clear();
  });

  it('reports isAnySessionRunning and isAnyGenerating accurately', () => {
    expect(sessionStore.isAnyGenerating()).toBe(false);
    expect(sessionStore.isAnySessionRunning()).toBe(false);
    expect(sessionStore.getState().isAnySessionRunning?.()).toBe(false);

    sessionStore.markRunning('test-chat-1');
    expect(sessionStore.isAnyGenerating()).toBe(true);
    expect(sessionStore.isAnySessionRunning()).toBe(true);
    expect(sessionStore.getState().isAnySessionRunning?.()).toBe(true);

    sessionStore.markIdle('test-chat-1');
    expect(sessionStore.isAnyGenerating()).toBe(false);
    expect(sessionStore.isAnySessionRunning()).toBe(false);
    expect(sessionStore.getState().isAnySessionRunning?.()).toBe(false);
  });

  it('handles session ID prefixes in isRunning and markIdle', () => {
    sessionStore.markRunning('session-chat-abc');
    expect(sessionStore.isRunning('session-chat-abc')).toBe(true);
    expect(sessionStore.isRunning('chat-abc')).toBe(true);

    sessionStore.markIdle('chat-abc');
    expect(sessionStore.isRunning('session-chat-abc')).toBe(false);
    expect(sessionStore.isRunning('chat-abc')).toBe(false);
  });

  it('handles queues and getQueueDepth accurately', () => {
    expect(sessionStore.getQueueDepth('chat-queue-1')).toBe(0);

    sessionStore.enqueue('chat-queue-1', {
      chatId: 'chat-queue-1',
      prompt: 'Test prompt 1',
    });
    sessionStore.enqueue('chat-queue-1', {
      chatId: 'chat-queue-1',
      prompt: 'Test prompt 2',
    });

    expect(sessionStore.getQueueDepth('chat-queue-1')).toBe(2);

    const first = sessionStore.dequeue('chat-queue-1');
    expect(first?.prompt).toBe('Test prompt 1');
    expect(sessionStore.getQueueDepth('chat-queue-1')).toBe(1);

    const second = sessionStore.dequeue('chat-queue-1');
    expect(second?.prompt).toBe('Test prompt 2');
    expect(sessionStore.getQueueDepth('chat-queue-1')).toBe(0);

    expect(sessionStore.dequeue('chat-queue-1')).toBeNull();
  });
});
