import { describe, it, expect } from 'vitest';
import { ConversationService } from './conversation';
import { chatStore } from '../stores/chatStore';
import type { AppContext } from './types';

describe('ConversationService.newChat', () => {
  it('resets activeChatId to draft-chat, clears trajectory, and updates chatStore state', () => {
    // Seed chatStore with an existing chat
    chatStore.setChats([
      {
        id: 'chat-123',
        title: 'Existing Chat',
        project: 'Agent App',
        model: 'gpt-4o',
        timestamp: new Date().toISOString(),
        steps: [{ id: 's1', type: 'user', content: 'hello' } as any]
      }
    ]);
    chatStore.setActiveChatId('chat-123');
    chatStore.setActiveProject('Agent App');

    let activeChatId: string | null = 'chat-123';
    let activeProject = 'Agent App';
    let draftProject = '';
    let trajectorySteps: any[] = [{ id: 's1', type: 'user', content: 'hello' }];
    let activeTab = 'trajectory';

    const ctx: AppContext = {
      getActiveChatId: () => activeChatId,
      setActiveChatId: ((v: any) => (activeChatId = typeof v === 'function' ? v(activeChatId) : v)) as any,
      getActiveProject: () => activeProject,
      setActiveProject: ((v: any) => (activeProject = typeof v === 'function' ? v(activeProject) : v)) as any,
      getDraftProject: () => draftProject,
      setDraftProject: ((v: any) => (draftProject = typeof v === 'function' ? v(draftProject) : v)) as any,
      getTrajectorySteps: () => trajectorySteps,
      setTrajectorySteps: ((v: any) => (trajectorySteps = typeof v === 'function' ? v(trajectorySteps) : v)) as any,
      getActiveTab: () => activeTab,
      setActiveTab: ((v: any) => (activeTab = typeof v === 'function' ? v(activeTab) : v)) as any,
      getChats: () => chatStore.getState().chats,
      setChats: () => {},
      getProjects: () => [],
      setProjects: () => {},
      getConnectedProviders: () => [],
      setConnectedProviders: () => {},
      getModelsCatalog: () => [],
      setModelsCatalog: () => {},
      getLastUsedModel: () => 'gpt-4o',
      persistStore: () => {},
      triggerToast: () => {},
      getFullAccess: () => false,
      getInternetAccessLevel: () => 'unrestricted'
    };

    // User clicks "New Chat" -> No Project (Standalone Chat)
    ConversationService.newChat(ctx, '');

    expect(activeChatId).toBe('draft-chat');
    expect(activeProject).toBe('');
    expect(draftProject).toBe('');
    expect(trajectorySteps).toEqual([]);
    expect(chatStore.getState().activeChatId).toBe('draft-chat');
    expect(chatStore.getState().activeProject).toBe('');
    expect(chatStore.getState().draftProject).toBe('');
    expect(chatStore.getState().activePanels).toEqual(['draft-chat']);
    expect(chatStore.getState().residentSteps.get('draft-chat')).toEqual([]);
  });
});
