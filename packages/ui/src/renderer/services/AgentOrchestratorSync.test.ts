import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AgentOrchestrator } from './AgentOrchestrator';
import { chatStore } from '../stores/chatStore';
import { sessionStore } from '../stores/sessionStore';
import { agentEventBus } from '../core/eventBus';
import { IpcBridge } from '../core/ipc';
import type { AgentEvent } from '../core/types';

describe('AgentOrchestrator.syncRunningSessions and event bus', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    chatStore.setChats([]);
    sessionStore.getState().runningSessions.clear();
  });

  it('agentEventBus dispatches events to listeners regardless of session- prefix', () => {
    let capturedCallback: ((_evt: unknown, ...args: unknown[]) => void) | null = null;
    // Reset isListening so we can test with our mock IPC
    (agentEventBus as any).isListening = false;
    const mockIpc = {
      invoke: vi.fn().mockResolvedValue(null),
      on: vi.fn((channel: string, cb: (...args: unknown[]) => void) => {
        if (channel === 'agent-event') capturedCallback = cb;
      }),
      removeListener: vi.fn(),
    };
    vi.spyOn(IpcBridge, 'getIpc').mockReturnValue(mockIpc as any);
    agentEventBus.init();

    const received: AgentEvent[] = [];
    const unsub = agentEventBus.subscribe('my-chat-id', (e) => received.push(e));

    // Fire event with session- prefix
    capturedCallback?.({}, { type: 'token', sessionId: 'session-my-chat-id', content: 'chunk 1' });
    // Fire event without prefix
    capturedCallback?.({}, { type: 'token', sessionId: 'my-chat-id', content: 'chunk 2' });

    expect(received).toHaveLength(2);
    expect(received[0].content).toBe('chunk 1');
    expect(received[1].content).toBe('chunk 2');

    unsub();
  });

  it('restores running state, disk steps, and assistant buffer when syncRunningSessions runs', async () => {
    const cleanId = 'running-agent-chat-1';
    chatStore.setChats([
      {
        id: cleanId,
        title: 'Running Chat',
        project: '',
        model: 'deepseek-chat',
        timestamp: new Date().toISOString(),
        isRunning: true,
        steps: [],
      },
    ]);

    vi.spyOn(IpcBridge, 'listRunningAgents').mockResolvedValue([cleanId]);
    vi.spyOn(IpcBridge, 'getAgentStatus').mockResolvedValue({
      sessionId: cleanId,
      isRunning: true,
      events: [
        {
          type: 'tool_call',
          sessionId: cleanId,
          toolName: 'read_file',
          toolCallId: 'call-1',
          toolArgs: { path: 'file.txt' },
        },
      ],
      fullAssistantText: 'Partial assistant message...',
      fullThoughtText: '',
      lastUpdated: 1700000000000,
    });
    vi.spyOn(IpcBridge, 'readChatSteps').mockResolvedValue([
      { id: 'user-step-1', type: 'user', content: 'Read file.txt please' },
    ]);

    await AgentOrchestrator.syncRunningSessions();

    // 1. Session store marked running
    expect(sessionStore.isRunning(cleanId)).toBe(true);

    // 2. ChatStore marked running
    const updatedChat = chatStore.getState().chats.find((c) => c.id === cleanId);
    expect(updatedChat?.isRunning).toBe(true);

    // 3. User step restored from disk
    const steps = chatStore.getSteps(cleanId);
    expect(steps.some((s) => s.type === 'user' && s.content === 'Read file.txt please')).toBe(true);

    // 4. In-flight tool call restored
    expect(steps.some((s) => s.type === 'tool_call' && s.toolName === 'read_file')).toBe(true);

    // 5. Assistant step buffered with full assistant text
    expect(steps.some((s) => s.type === 'assistant' && s.content === 'Partial assistant message...')).toBe(true);
  });

  it('marks chat idle if backend reports session is no longer running', async () => {
    const cleanId = 'stale-running-chat';
    chatStore.setChats([
      {
        id: cleanId,
        title: 'Stale Chat',
        project: '',
        model: 'deepseek-chat',
        timestamp: new Date().toISOString(),
        isRunning: true,
        steps: [],
      },
    ]);

    vi.spyOn(IpcBridge, 'listRunningAgents').mockResolvedValue([]);
    vi.spyOn(IpcBridge, 'getAgentStatus').mockResolvedValue({
      sessionId: cleanId,
      isRunning: false,
      events: [],
      fullAssistantText: '',
      fullThoughtText: '',
      lastUpdated: 1700000000000,
    });

    await AgentOrchestrator.syncRunningSessions();

    expect(sessionStore.isRunning(cleanId)).toBe(false);
    const updatedChat = chatStore.getState().chats.find((c) => c.id === cleanId);
    expect(updatedChat?.isRunning).toBe(false);
  });
});
