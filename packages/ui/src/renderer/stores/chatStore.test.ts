import { describe, it, expect, beforeEach } from 'vitest';
import { chatStore } from './chatStore';

describe('chatStore deduplication', () => {
  beforeEach(() => {
    chatStore.setProjects([]);
    chatStore.setChats([]);
    chatStore.setActiveChatId(null);
  });

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
    expect(state.chats[0].title).toBe('First Chat');
    expect(state.chats[1].id).toBe('chat-2');
  });
});
