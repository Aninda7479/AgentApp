import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { AppContext, ProviderConnection, ModelConfig, StoredChat, StoredProject, TrajectoryStep } from './renderer/logic/types';

// ── Module-level mocks (hoisted by vitest) ───────────────────────────────────
const mockMaterialize = vi.fn().mockResolvedValue([]);
const mockAgentSimRun = vi.fn();
const mockPersistLastUsedModel = vi.fn();
const mockUpdateChatRecord = vi.fn();
const mockUpdateChatSteps = vi.fn();
const mockIsRunning = vi.fn().mockReturnValue(false);
const mockMarkRunning = vi.fn();
const mockEnqueue = vi.fn();
const mockResolveScopeSettings = vi.fn().mockReturnValue({ internet: 'none' });
const mockApprovalToPermissionMode = vi.fn().mockReturnValue('full-autonomy');

vi.mock('./renderer/logic/attachments', () => ({
  AttachmentService: {
    materialize: (...args: any[]) => mockMaterialize(...args),
    copyToChat: vi.fn().mockResolvedValue(null),
    fromFiles: vi.fn(),
    fromPaste: vi.fn(),
    remove: vi.fn()
  }
}));

vi.mock('./renderer/logic/simulation', () => ({
  AgentSimulator: { run: (...args: any[]) => mockAgentSimRun(...args) }
}));

vi.mock('./renderer/logic/settings', () => ({
  SettingsService: { persistLastUsedModel: (...args: any[]) => mockPersistLastUsedModel(...args) }
}));

vi.mock('./renderer/logic/store', () => ({
  StoreService: {
    updateChatRecord: (...args: any[]) => mockUpdateChatRecord(...args),
    updateChatSteps: (...args: any[]) => mockUpdateChatSteps(...args),
    persistStore: vi.fn()
  }
}));

vi.mock('./renderer/logic/runManager', () => ({
  runManager: {
    isRunning: (...args: any[]) => mockIsRunning(...args),
    isAnyGenerating: vi.fn().mockReturnValue(false),
    markRunning: (...args: any[]) => mockMarkRunning(...args),
    enqueue: (...args: any[]) => mockEnqueue(...args),
    queueDepth: vi.fn().mockReturnValue(0),
    getStreamRefs: vi.fn().mockReturnValue({
      chatIdRef: { current: null },
      bufferRef: { current: '' },
      stepIdRef: { current: null },
      responseSeqRef: { current: 0 }
    }),
    onTerminal: vi.fn(),
    setStarter: vi.fn()
  }
}));

vi.mock('./renderer/logic/scopeSettings', () => ({
  resolveScopeSettings: (...args: any[]) => mockResolveScopeSettings(...args),
  approvalToPermissionMode: (...args: any[]) => mockApprovalToPermissionMode(...args)
}));

import { AgentService } from './renderer/logic/agent';
import { AgentStreamService } from './renderer/logic/agentStream';

// ── Helpers ──────────────────────────────────────────────────────────────────
function mkProvider(partial: Partial<ProviderConnection> & Pick<ProviderConnection, 'id' | 'type'>): ProviderConnection {
  return { name: partial.id, apiKey: '', baseUrl: '', ...partial };
}

function mkCtx(overrides: Partial<AppContext> = {}): AppContext {
  const chats: StoredChat[] = [];
  const projects: StoredProject[] = [];
  const providers: ProviderConnection[] = [];
  const models: ModelConfig[] = [];
  const steps: TrajectoryStep[] = [];

  const defaults: AppContext = {
    ipc: { invoke: vi.fn().mockResolvedValue(undefined), on: vi.fn(), off: vi.fn() },
    getProjects: () => projects,
    getChats: () => chats,
    getConnectedProviders: () => providers,
    getModelsCatalog: () => models,
    getMcpServers: () => [],
    getActiveChatId: () => 'draft-chat',
    getActiveProject: () => '',
    getDraftProject: () => '',
    getInternetAccessLevel: () => 'none',
    getFullAccess: () => false,
    getDefaultPermissions: () => false,
    getThemeMode: () => 'dark',
    getComposerAttachments: () => [],
    getTrajectorySteps: () => steps,
    getLastUsedModel: () => '',
    setProjects: vi.fn(),
    setChats: vi.fn(),
    setConnectedProviders: vi.fn(),
    setModelsCatalog: vi.fn(),
    setTrajectorySteps: vi.fn(),
    setActiveChatId: vi.fn(),
    setActiveProject: vi.fn(),
    setDraftProject: vi.fn(),
    setActiveTab: vi.fn(),
    setSettingsCategory: vi.fn(),
    setActiveDiff: vi.fn(),
    setToastMessage: vi.fn(),
    setToastType: vi.fn(),
    setToastOpen: vi.fn(),
    setNavigationHistory: vi.fn(),
    setNavigationIndex: vi.fn(),
    setMcpServers: vi.fn(),
    setPluginEnabled: vi.fn(),
    setIsGenerating: vi.fn(),
    setThemeMode: vi.fn(),
    setWorkMode: vi.fn(),
    setDefaultPermissions: vi.fn(),
    setAutoReview: vi.fn(),
    setFullAccess: vi.fn(),
    setInternetAccessLevel: vi.fn(),
    setLastUsedModel: vi.fn(),
    setUpdateStatus: vi.fn(),
    setComposerPrompt: vi.fn(),
    setComposerAttachments: vi.fn(),
    persistStore: vi.fn(),
    triggerToast: vi.fn()
  };

  return { ...defaults, ...overrides };
}

// ══════════════════════════════════════════════════════════════════════════════
// sendPrompt integration — verify ipc.invoke payload directly
// ══════════════════════════════════════════════════════════════════════════════

describe('CERTAIN-3: Desktop send message — sendPrompt', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockMaterialize.mockResolvedValue([]);
    mockIsRunning.mockReturnValue(false);
    mockResolveScopeSettings.mockReturnValue({ internet: 'none' });
    mockApprovalToPermissionMode.mockReturnValue('full-autonomy');
  });

  it('routes to real agent with correct config (new chat on draft-chat)', async () => {
    const provider = mkProvider({ id: 'openai', type: 'key', apiKey: 'sk-test-123' });
    const mockInvoke = vi.fn().mockResolvedValue(undefined);
    const ctx = mkCtx({
      getConnectedProviders: () => [provider],
      getActiveChatId: () => 'draft-chat',
      ipc: { invoke: mockInvoke, on: vi.fn(), off: vi.fn() } as any
    });

    await AgentService.sendPrompt(ctx, 'Hello world', { model: 'gpt-4o' });

    expect(mockInvoke).toHaveBeenCalledTimes(1);
    const [channel, payload] = mockInvoke.mock.calls[0];
    expect(channel).toBe('agent-run');
    expect(payload.prompt).toBe('Hello world');
    expect(payload.config).toMatchObject({
      provider: 'openai',
      apiKey: 'sk-test-123',
      model: 'gpt-4o'
    });
    expect(ctx.setIsGenerating).toHaveBeenCalledWith(true);
  });

  it('routes to real agent on existing chat', async () => {
    const provider = mkProvider({ id: 'openai', type: 'key', apiKey: 'sk-test' });
    const mockInvoke = vi.fn().mockResolvedValue(undefined);
    const ctx = mkCtx({
      getConnectedProviders: () => [provider],
      getActiveChatId: () => 'chat-1',
      getChats: () => [{ id: 'chat-1', title: 't', project: '', model: '', timestamp: '', steps: [], isRunning: false } as StoredChat],
      ipc: { invoke: mockInvoke, on: vi.fn(), off: vi.fn() } as any
    });

    await AgentService.sendPrompt(ctx, 'Follow-up', { model: 'gpt-4o' });

    expect(mockInvoke).toHaveBeenCalledTimes(1);
    const [channel, payload] = mockInvoke.mock.calls[0];
    expect(channel).toBe('agent-run');
    expect(payload.prompt).toBe('Follow-up');
    expect(payload.config).toMatchObject({ provider: 'openai', model: 'gpt-4o' });
    expect(ctx.setIsGenerating).toHaveBeenCalledWith(true);
  });

  it('clears composer after sending', async () => {
    const provider = mkProvider({ id: 'openai', type: 'key', apiKey: 'sk-test' });
    const mockInvoke = vi.fn().mockResolvedValue(undefined);
    const ctx = mkCtx({
      getConnectedProviders: () => [provider],
      getActiveChatId: () => 'chat-1',
      getChats: () => [{ id: 'chat-1', title: 't', project: '', model: '', timestamp: '', steps: [], isRunning: false } as StoredChat],
      ipc: { invoke: mockInvoke, on: vi.fn(), off: vi.fn() } as any
    });

    await AgentService.sendPrompt(ctx, 'Send this', { model: 'gpt-4o' });

    expect(ctx.setComposerPrompt).toHaveBeenCalledWith('');
    expect(ctx.setComposerAttachments).toHaveBeenCalledWith([]);
  });

  it('queues when chat is already running', async () => {
    const provider = mkProvider({ id: 'openai', type: 'key', apiKey: 'sk-test' });
    mockIsRunning.mockReturnValue(true);
    const ctx = mkCtx({
      getConnectedProviders: () => [provider],
      getActiveChatId: () => 'chat-running',
      getChats: () => [{ id: 'chat-running', title: 't', project: '', model: '', timestamp: '', steps: [], isRunning: true } as StoredChat]
    });

    await AgentService.sendPrompt(ctx, 'Queued message', { model: 'gpt-4o' });

    expect(ctx.ipc!.invoke).not.toHaveBeenCalled();
    expect(mockEnqueue).toHaveBeenCalled();
    expect(ctx.triggerToast).toHaveBeenCalled();
  });

  it('routes to simulation when ipc is null', async () => {
    const provider = mkProvider({ id: 'openai', type: 'key', apiKey: 'sk-test' });
    const ctx = mkCtx({
      getConnectedProviders: () => [provider],
      ipc: null
    });

    await AgentService.sendPrompt(ctx, 'Hello', { model: 'gpt-4o' });

    expect(mockAgentSimRun).toHaveBeenCalledTimes(1);
  });

  it('routes to simulation when no provider has credentials', async () => {
    const ctx = mkCtx({
      getConnectedProviders: () => [mkProvider({ id: 'openai', type: 'key', apiKey: '' })],
      getActiveChatId: () => 'draft-chat'
    });

    await AgentService.sendPrompt(ctx, 'Test prompt', { model: 'gpt-4o' });

    expect(mockAgentSimRun).toHaveBeenCalledTimes(1);
  });

  it('passes attachment paths through to ipc.invoke', async () => {
    const provider = mkProvider({ id: 'openai', type: 'key', apiKey: 'sk-test' });
    const mockInvoke = vi.fn().mockResolvedValue(undefined);
    const ctx = mkCtx({
      getConnectedProviders: () => [provider],
      getActiveChatId: () => 'chat-1',
      getChats: () => [{ id: 'chat-1', title: 't', project: '', model: '', timestamp: '', steps: [], isRunning: false } as StoredChat],
      ipc: { invoke: mockInvoke, on: vi.fn(), off: vi.fn() } as any
    });
    mockMaterialize.mockResolvedValue([{ filename: 'doc.pdf', fullPath: '/tmp/doc.pdf' }]);

    await AgentService.sendPrompt(ctx, 'Analyze this', { model: 'gpt-4o' });

    expect(mockInvoke).toHaveBeenCalledTimes(1);
    const [, payload] = mockInvoke.mock.calls[0];
    expect(payload.currentAttachments).toContain('/tmp/doc.pdf');
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// runRealAgent unit tests
// ══════════════════════════════════════════════════════════════════════════════

describe('CERTAIN-3: runRealAgent invokes IPC correctly', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('calls ipc.invoke with agent-run and correct payload', () => {
    const ctx = mkCtx();
    AgentService.runRealAgent(ctx, {
      sessionId: 'sess-1', prompt: 'Do something', chatId: 'chat-1',
      config: { provider: 'openai', model: 'gpt-4o', apiKey: 'sk-test', permissionMode: 'full-autonomy' },
      currentAttachments: [], runStartedAt: Date.now()
    });

    expect(ctx.ipc!.invoke).toHaveBeenCalledTimes(1);
    expect(ctx.ipc!.invoke).toHaveBeenCalledWith('agent-run', {
      sessionId: 'sess-1', prompt: 'Do something',
      config: { provider: 'openai', model: 'gpt-4o', apiKey: 'sk-test', permissionMode: 'full-autonomy' },
      currentAttachments: []
    });
  });

  it('handles IPC resolve with success: true gracefully', async () => {
    const ctx = mkCtx({ ipc: { invoke: vi.fn().mockResolvedValue({ success: true }), on: vi.fn(), off: vi.fn() } as any });
    AgentService.runRealAgent(ctx, {
      sessionId: 'sess-2', prompt: 'Test', chatId: 'chat-2',
      config: { provider: 'openai', model: 'gpt-4o', apiKey: 'k' },
      currentAttachments: [], runStartedAt: Date.now()
    });
    await new Promise(r => setTimeout(r, 10));
    expect(ctx.triggerToast).not.toHaveBeenCalled();
  });

  it('handles IPC resolve with success: false (error from main process)', async () => {
    const ctx = mkCtx({ ipc: { invoke: vi.fn().mockResolvedValue({ success: false, error: 'No model' }), on: vi.fn(), off: vi.fn() } as any });
    AgentService.runRealAgent(ctx, {
      sessionId: 'sess-3', prompt: 'Test', chatId: 'chat-3',
      config: { provider: 'auto', model: 'auto', apiKey: '' },
      currentAttachments: [], runStartedAt: Date.now()
    });
    await new Promise(r => setTimeout(r, 10));
    expect(ctx.triggerToast).toHaveBeenCalled();
  });

  it('handles IPC invoke rejection gracefully', async () => {
    const ctx = mkCtx({ ipc: { invoke: vi.fn().mockRejectedValue(new Error('IPC disconnected')), on: vi.fn(), off: vi.fn() } as any });
    AgentService.runRealAgent(ctx, {
      sessionId: 'sess-4', prompt: 'Test', chatId: 'chat-4',
      config: { provider: 'openai', model: 'gpt-4o', apiKey: 'k' },
      currentAttachments: [], runStartedAt: Date.now()
    });
    await new Promise(r => setTimeout(r, 10));
    expect(ctx.triggerToast).toHaveBeenCalled();
    expect(ctx.setIsGenerating).toHaveBeenCalledWith(false);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// Pure resolver tests
// ══════════════════════════════════════════════════════════════════════════════

describe('CERTAIN-3: AgentService.resolveActiveProvider', () => {
  it('returns the provider matching the selected model', () => {
    const p1 = mkProvider({ id: 'openai', type: 'key', apiKey: 'k1' });
    const p2 = mkProvider({ id: 'google', type: 'key', apiKey: 'k2' });
    const models: ModelConfig[] = [
      { id: 'openai-gpt-4o', providerId: 'openai', name: 'gpt-4o', enabled: true },
      { id: 'google-gemini', providerId: 'google', name: 'gemini-pro', enabled: true }
    ];
    expect(AgentService.resolveActiveProvider({ model: 'gemini-pro' }, [p1, p2], models)?.id).toBe('google');
  });

  it('falls back to first provider when model not found', () => {
    const p1 = mkProvider({ id: 'openai', type: 'key', apiKey: 'k1' });
    const p2 = mkProvider({ id: 'google', type: 'key', apiKey: 'k2' });
    expect(AgentService.resolveActiveProvider({ model: 'unknown' }, [p1, p2], [])?.id).toBe('openai');
  });
});

describe('CERTAIN-3: AgentService.resolveEngineProviderId', () => {
  it('preserves ollama id for custom-type connections', () => {
    const p = mkProvider({ id: 'ollama', type: 'custom', baseUrl: 'http://localhost:11434' });
    expect(AgentService.resolveEngineProviderId(p)).toBe('ollama');
  });

  it('collapses generic custom endpoints', () => {
    const p = mkProvider({ id: 'my-proxy', type: 'custom', baseUrl: 'https://proxy.example.com/v1' });
    expect(AgentService.resolveEngineProviderId(p)).toBe('custom');
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// AgentStreamService event handler tests
// ══════════════════════════════════════════════════════════════════════════════

describe('CERTAIN-3: AgentStreamService event handling', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  function mkStreamCtx() {
    const chats: StoredChat[] = [];
    const steps: TrajectoryStep[] = [];
    const ctx: AppContext = {
      ipc: null,
      getProjects: () => [],
      getChats: () => chats,
      getConnectedProviders: () => [],
      getModelsCatalog: () => [],
      getMcpServers: () => [],
      getActiveChatId: () => null,
      getActiveProject: () => '',
      getDraftProject: () => '',
      getInternetAccessLevel: () => 'none',
      getFullAccess: () => false,
      getDefaultPermissions: () => false,
      getThemeMode: () => 'dark',
      getComposerAttachments: () => [],
      getTrajectorySteps: () => steps,
      getLastUsedModel: () => '',
      setProjects: vi.fn(),
      setChats: vi.fn(),
      setConnectedProviders: vi.fn(),
      setModelsCatalog: vi.fn(),
      setTrajectorySteps: vi.fn(),
      setActiveChatId: vi.fn(),
      setActiveProject: vi.fn(),
      setDraftProject: vi.fn(),
      setActiveTab: vi.fn(),
      setSettingsCategory: vi.fn(),
      setActiveDiff: vi.fn(),
      setToastMessage: vi.fn(),
      setToastType: vi.fn(),
      setToastOpen: vi.fn(),
      setNavigationHistory: vi.fn(),
      setNavigationIndex: vi.fn(),
      setMcpServers: vi.fn(),
      setPluginEnabled: vi.fn(),
      setIsGenerating: vi.fn(),
      setThemeMode: vi.fn(),
      setWorkMode: vi.fn(),
      setDefaultPermissions: vi.fn(),
      setAutoReview: vi.fn(),
      setFullAccess: vi.fn(),
      setInternetAccessLevel: vi.fn(),
      setLastUsedModel: vi.fn(),
      setUpdateStatus: vi.fn(),
      setComposerPrompt: vi.fn(),
      setComposerAttachments: vi.fn(),
      persistStore: vi.fn(),
      triggerToast: vi.fn()
    };
    return { ctx, chats, steps };
  }

  function mkStreamRefs() {
    return {
      chatIdRef: { current: 'test-chat' } as { current: string | null },
      bufferRef: { current: '' } as { current: string },
      stepIdRef: { current: null } as { current: string | null },
      responseSeqRef: { current: 0 } as { current: number }
    };
  }

  const mkPartners = () => ({
    current: { activeId: null, importModel: vi.fn(), setActive: vi.fn(), startPet: vi.fn() }
  });

  it('buffers token events', () => {
    const { ctx } = mkStreamCtx();
    const refs = mkStreamRefs();
    const handler = AgentStreamService.createHandler(ctx, () => refs, mkPartners());

    handler({}, { type: 'token', sessionId: 'test-chat', content: 'Hello' });
    handler({}, { type: 'token', sessionId: 'test-chat', content: ' world' });

    expect(refs.bufferRef.current).toBe('Hello world');
  });

  it('adds a running step on tool_call events', () => {
    const { ctx } = mkStreamCtx();
    const refs = mkStreamRefs();
    const handler = AgentStreamService.createHandler(ctx, () => refs, mkPartners());

    handler({}, { type: 'tool_call', sessionId: 'test-chat', toolName: 'read_file', toolArgs: { path: '/test' } });

    expect(mockUpdateChatSteps).toHaveBeenCalled();
  });

  it('finalizes chat on done event', () => {
    const { ctx } = mkStreamCtx();
    const refs = mkStreamRefs();
    const onTerminal = vi.fn();
    const handler = AgentStreamService.createHandler(ctx, () => refs, mkPartners(), undefined, onTerminal);

    handler({}, { type: 'done', sessionId: 'test-chat' });

    expect(mockUpdateChatRecord).toHaveBeenCalled();
    expect(onTerminal).toHaveBeenCalledWith('test-chat');
    expect(refs.bufferRef.current).toBe('');
    expect(refs.chatIdRef.current).toBeNull();
  });

  it('reports error on error event', () => {
    const { ctx } = mkStreamCtx();
    const refs = mkStreamRefs();
    const handler = AgentStreamService.createHandler(ctx, () => refs, mkPartners());

    handler({}, { type: 'error', sessionId: 'test-chat', error: 'API key invalid' });

    expect(mockUpdateChatRecord).toHaveBeenCalled();
    expect(ctx.triggerToast).toHaveBeenCalled();
  });

  it('ignores events with empty or missing sessionId', () => {
    const { ctx } = mkStreamCtx();
    const refs = mkStreamRefs();
    const handler = AgentStreamService.createHandler(ctx, () => refs, mkPartners());

    handler({}, { type: 'token', sessionId: '', content: 'test' });
    handler({}, { type: 'token' as any, sessionId: '', content: 'test' });
  });

  it('forwards context events to onContext callback', () => {
    const { ctx } = mkStreamCtx();
    const refs = mkStreamRefs();
    const onContext = vi.fn();
    const handler = AgentStreamService.createHandler(ctx, () => refs, mkPartners(), onContext);

    handler({}, { type: 'context', sessionId: 'test-chat', context: { used: 5000, limit: 10000, pct: 50 } });

    expect(onContext).toHaveBeenCalledWith({ used: 5000, limit: 10000, pct: 50 });
  });

  it('updates chat title on chat-name event', () => {
    const { ctx } = mkStreamCtx();
    const refs = mkStreamRefs();
    const handler = AgentStreamService.createHandler(ctx, () => refs, mkPartners());

    handler({}, { type: 'chat-name', sessionId: 'test-chat', chatName: 'New Chat Name' });

    expect(mockUpdateChatRecord).toHaveBeenCalled();
  });
});
