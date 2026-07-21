import { describe, it, expect, vi } from 'vitest';
import { AgentStreamService } from './renderer/logic/agentStream.js';
import { runManager } from './renderer/logic/runManager.js';

function makeCtx(chatId: string) {
  const state = {
    chats: [{ id: chatId, steps: [{ id: 'user1', type: 'user', content: 'hi' }] }],
    trajectorySteps: [] as any[],
    activeChatId: chatId,
    generating: false
  };
  const ctx: any = {
    getChats: () => state.chats,
    getActiveChatId: () => state.activeChatId,
    setChats: (updater: any) => { state.chats = updater(state.chats); },
    setTrajectorySteps: (steps: any[]) => { state.trajectorySteps = steps; },
    setIsGenerating: (v: boolean) => { state.generating = v; },
    triggerToast: vi.fn(),
    persistStore: vi.fn(),
    getConnectedProviders: () => [],
    getModelsCatalog: () => ({}),
    getProjects: () => []
  };
  return { ctx, state };
}

describe('AgentStreamService token flush', () => {
  it('commits streamed tokens into an assistant step in trajectorySteps', async () => {
    const chatId = 'chat-1';
    const { ctx, state } = makeCtx(chatId);
    const partnersRef = { current: { activeId: null, importModel: vi.fn(), setActive: vi.fn(), startPet: vi.fn() } };
    const handler = AgentStreamService.createHandler(ctx, (sid) => runManager.getStreamRefs(sid), partnersRef, undefined, () => {});

    const bundle = runManager.getStreamRefs(chatId);
    bundle.chatIdRef.current = chatId;
    bundle.bufferRef.current = '';
    bundle.stepIdRef.current = null;
    bundle.responseSeqRef.current = 0;

    handler(null, { type: 'token', sessionId: chatId, content: 'Hello' });
    handler(null, { type: 'token', sessionId: chatId, content: ' world' });
    await new Promise((r) => setTimeout(r, 200));

    const assistant = state.trajectorySteps.find((s) => s.type === 'assistant');
    expect(assistant, 'an assistant step should exist in trajectorySteps').toBeTruthy();
    expect(assistant.content).toContain('Hello');
    expect(assistant.content).toContain('world');
  });

  it('commits final buffer on done even without a pending flush timer', async () => {
    const chatId = 'chat-2';
    const { ctx, state } = makeCtx(chatId);
    const partnersRef = { current: { activeId: null, importModel: vi.fn(), setActive: vi.fn(), startPet: vi.fn() } };
    const handler = AgentStreamService.createHandler(ctx, (sid) => runManager.getStreamRefs(sid), partnersRef, undefined, () => {});

    const bundle = runManager.getStreamRefs(chatId);
    bundle.chatIdRef.current = chatId;
    bundle.bufferRef.current = '';
    bundle.stepIdRef.current = null;
    bundle.responseSeqRef.current = 0;

    handler(null, { type: 'token', sessionId: chatId, content: 'final words' });
    handler(null, { type: 'done', sessionId: chatId });

    const assistant = state.trajectorySteps.find((s) => s.type === 'assistant');
    expect(assistant, 'assistant step should be committed on done').toBeTruthy();
    expect(assistant.content).toContain('final words');
  });
});
