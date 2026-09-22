import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ChatRepository } from './ChatRepository';
import { chatStore } from '../stores/chatStore';
import { providerStore } from '../stores/providerStore';
import { IpcBridge } from '../core/ipc';
import type { StoredChat, TrajectoryStep } from '../core/types';

describe('ChatRepository Persistence', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    chatStore.setProjects([]);
    chatStore.setChats([]);
    providerStore.setProviders([]);
    providerStore.setModels([]);
  });

  it('persists standalone chats and resident steps even when isDesktop() is false (web mode)', async () => {
    // Mock web environment: isDesktop is false, but getIpc returns active bridge
    vi.spyOn(IpcBridge, 'isDesktop').mockReturnValue(false);
    const mockIpc = {
      invoke: vi.fn().mockResolvedValue(null),
      on: vi.fn(),
      removeListener: vi.fn(),
    };
    vi.spyOn(IpcBridge, 'getIpc').mockReturnValue(mockIpc as any);
    const writeStoreSpy = vi.spyOn(IpcBridge, 'writeStore').mockResolvedValue();

    const standaloneChatId = 'standalone-test-123';
    const standaloneChat: StoredChat = {
      id: standaloneChatId,
      title: 'Standalone Chat',
      project: '',
      model: 'opencode/zen-free',
      timestamp: new Date().toISOString(),
      steps: [],
    };

    const residentSteps: TrajectoryStep[] = [
      { id: 'step-user', type: 'user', content: 'What is 2+2?' },
      { id: 'step-assistant', type: 'assistant', content: '4' },
    ];

    chatStore.setChats([standaloneChat]);
    chatStore.setSteps(standaloneChatId, residentSteps);

    // Call persistAll with immediate = true
    await ChatRepository.persistAll(true);

    expect(writeStoreSpy).toHaveBeenCalledTimes(1);
    const callArg = writeStoreSpy.mock.calls[0][0];
    expect(callArg.chats).toHaveLength(1);
    expect(callArg.chats[0].id).toBe(standaloneChatId);
    expect(callArg.chats[0].title).toBe('Standalone Chat');
    expect(callArg.chats[0].project).toBe('');
    // Ensure resident steps are preserved in the persisted chat payload
    expect(callArg.chats[0].steps).toHaveLength(2);
    expect(callArg.chats[0].steps[0].content).toBe('What is 2+2?');
    expect(callArg.chats[0].steps[1].content).toBe('4');
  });

  it('immediately flushes to disk when immediate is true', async () => {
    const mockIpc = {
      invoke: vi.fn().mockResolvedValue(null),
      on: vi.fn(),
      removeListener: vi.fn(),
    };
    vi.spyOn(IpcBridge, 'getIpc').mockReturnValue(mockIpc as any);
    const writeStoreSpy = vi.spyOn(IpcBridge, 'writeStore').mockResolvedValue();

    chatStore.setChats([
      {
        id: 'chat-imm',
        title: 'Immediate Chat',
        project: '',
        model: 'opencode',
        timestamp: new Date().toISOString(),
        steps: [],
      }
    ]);

    await ChatRepository.persistAll(true);
    expect(writeStoreSpy).toHaveBeenCalledTimes(1);
  });

  it('preserves isRunning state and loads disk steps on bootstrap', async () => {
    const runningChatId = 'running-chat-789';
    vi.spyOn(IpcBridge, 'readStore').mockResolvedValue({
      projects: [],
      chats: [
        {
          id: runningChatId,
          title: 'Active Running Chat',
          project: '',
          model: 'claude-3-5-sonnet',
          timestamp: new Date().toISOString(),
          isRunning: true,
          steps: [],
        },
      ],
      connectedProviders: [],
      modelsCatalog: [],
    });

    const readStepsSpy = vi.spyOn(IpcBridge, 'readChatSteps').mockResolvedValue([
      { id: 'user-p', type: 'user', content: 'What is photosynthesis?' },
    ]);
    vi.spyOn(IpcBridge, 'writeStore').mockResolvedValue();

    chatStore.setActiveChatId(runningChatId);
    const res = await ChatRepository.bootstrap();

    expect(res.chats).toHaveLength(1);
    expect(res.chats[0].isRunning).toBe(true);
    const storeChat = chatStore.getState().chats.find((c) => c.id === runningChatId);
    expect(storeChat?.isRunning).toBe(true);
    expect(readStepsSpy).toHaveBeenCalledWith(runningChatId);
    expect(chatStore.getSteps(runningChatId)).toHaveLength(1);
    expect(chatStore.getSteps(runningChatId)[0].content).toBe('What is photosynthesis?');
  });
});
