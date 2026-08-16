/**
 * Agent Orchestrator Service for SuperAgent Desktop
 * Manages parallel execution, streaming events, queues, and stopping runs.
 */

import { chatStore } from '../stores/chatStore';
import { providerStore } from '../stores/providerStore';
import { sessionStore } from '../stores/sessionStore';
import { agentEventBus } from '../core/eventBus';
import { IpcBridge } from '../core/ipc';
import { SessionStreamBuffer } from './StreamBuffer';
import { ProviderRegistry } from './ProviderRegistry';
import { StepFactory } from './StepFactory';
import { ChatRepository } from './ChatRepository';
import { FormatUtils } from '../util/format';
import type { ComposerOptions, ComposerAttachment, TrajectoryStep, AgentEvent, StoredChat } from '../core/types';

export class AgentOrchestrator {
  private static streamBuffers: Map<string, SessionStreamBuffer> = new Map();
  private static eventUnsubscribers: Map<string, () => void> = new Map();
  public static toastTrigger: ((msg: string, type?: 'info' | 'error') => void) | null = null;

  public static registerToastTrigger(trigger: ((msg: string, type?: 'info' | 'error') => void) | null): void {
    AgentOrchestrator.toastTrigger = trigger;
  }

  private static getStreamBuffer(chatId: string): SessionStreamBuffer {
    let buffer = AgentOrchestrator.streamBuffers.get(chatId);
    if (!buffer) {
      buffer = new SessionStreamBuffer(chatId);
      AgentOrchestrator.streamBuffers.set(chatId, buffer);
    }
    return buffer;
  }

  public static async sendPrompt(
    chatId: string,
    promptText: string,
    options: ComposerOptions = {},
    attachments: ComposerAttachment[] = []
  ): Promise<void> {
    const trimmedPrompt = promptText.trim();
    if (!trimmedPrompt && attachments.length === 0) return;

    let targetChatId = chatId;
    if (chatId === 'draft-chat') {
      const uniqueChatId = FormatUtils.generateStorageId();
      const defaultModel =
        providerStore.getState().lastUsedModel ||
        providerStore.getState().models.find((m) => m.enabled)?.name ||
        '';
      const proj = chatStore.getState().draftProject !== undefined
        ? chatStore.getState().draftProject
        : (chatStore.getState().activeProject || '');

      const newChat: StoredChat = {
        id: uniqueChatId,
        title: proj ? `Chat in ${proj}` : 'Standalone Chat',
        project: proj,
        model: defaultModel,
        timestamp: new Date().toISOString(),
        steps: [],
      };

      chatStore.setChats([newChat, ...chatStore.getState().chats]);
      chatStore.openPanel(uniqueChatId);
      chatStore.setSteps(uniqueChatId, []);
      targetChatId = uniqueChatId;
    }

    // Check if session is already running — if so, enqueue prompt
    if (sessionStore.isRunning(targetChatId)) {
      sessionStore.enqueue(targetChatId, {
        chatId: targetChatId,
        prompt: trimmedPrompt,
        options,
        attachments,
      });
      return;
    }

    const unsandboxed = options.sandbox === false;
    const sandboxMode: 'sandboxed' | 'full' = unsandboxed ? 'full' : 'sandboxed';

    const startedAt = Date.now();
    sessionStore.markRunning(targetChatId, startedAt, sandboxMode);

    const activeChat = chatStore.getState().chats.find((c) => c.id === targetChatId);
    const activeProject = chatStore.getState().projects.find((p) => p.name === activeChat?.project);

    // Selected model resolution
    const selectedModelName = options.model || activeChat?.model || providerStore.getState().lastUsedModel || '';
    const activeProvider = ProviderRegistry.resolveActiveProvider(selectedModelName);
    const engineProviderId = activeProvider ? ProviderRegistry.resolveEngineProviderId(activeProvider) : 'custom';
    const engineModelSlug = ProviderRegistry.resolveModelId(activeProvider, selectedModelName);

    if (selectedModelName) {
      providerStore.setLastUsedModel(selectedModelName);
    }

    // Step 1: Add User Step & Attachment steps to trajectory
    const userStep = StepFactory.userStep(
      trimmedPrompt,
      undefined,
      undefined,
      sandboxMode,
      selectedModelName,
      attachments.map((att) => ({
        name: att.filename,
        path: att.fullPath || att.filename,
        mediaType: StepFactory.detectMediaType(att.filename)
      }))
    );
    const attachmentSteps: TrajectoryStep[] = attachments.map((att) =>
      StepFactory.attachmentStep(att.filename, att.fullPath || att.filename)
    );

    const nextSteps = [...attachmentSteps, userStep];
    chatStore.updateSteps(targetChatId, (prev) => [...prev, ...nextSteps]);
    chatStore.setChats(
      chatStore.getState().chats.map((c) =>
        c.id === targetChatId
          ? {
              ...c,
              model: selectedModelName || c.model,
              isRunning: true,
              startedAt,
              timestamp: new Date().toISOString(),
            }
          : c
      )
    );
    ChatRepository.persistAll().catch(console.error);

    // Prepare Stream Buffer
    const buffer = AgentOrchestrator.getStreamBuffer(targetChatId);
    buffer.resetTurn();
    buffer.responseSeq = 0;
    buffer.sandboxMode = sandboxMode;
    buffer.modelName = selectedModelName;
    buffer.setStartedAt(startedAt);

    // Setup Agent Event Bus listener for this session
    AgentOrchestrator.setupSessionEventListener(targetChatId, startedAt);

    // Build IPC Agent Run Configuration payload
    const currentAttachments = chatStore
      .getSteps(targetChatId)
      .filter((s) => s.metadata?.mediaPath)
      .map((s) => s.metadata!.mediaPath as string);

    const runConfig: Record<string, unknown> = {
      model: engineModelSlug,
      provider: engineProviderId,
      apiKey: activeProvider?.apiKey || '',
      baseUrl: activeProvider?.baseUrl || '',
      workspacePath: activeProject?.folders?.[0] || '',
      allowedCommands: activeProject?.allowedCommands || [],
      instructions: activeProject?.instructions || '',
      approvalMode: options.approvalMode || 'ask',
      unsandboxed: options.sandbox === false,
      selectedTools: options.selectedTools,
    };

    try {
      const sessionId = targetChatId.startsWith('session-') ? targetChatId : `session-${targetChatId}`;
      const result = await IpcBridge.runAgent({
        sessionId,
        prompt: trimmedPrompt,
        config: runConfig,
        currentAttachments,
      });

      if (result && result.success === false) {
        AgentOrchestrator.handleSessionError(targetChatId, result.error || 'Failed to start agent session', startedAt);
      }
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      AgentOrchestrator.handleSessionError(targetChatId, errorMsg, startedAt);
    }
  }

  public static async stopRun(chatId: string): Promise<void> {
    if (!sessionStore.isRunning(chatId)) return;

    try {
      const sessionId = chatId.startsWith('session-') ? chatId : `session-${chatId}`;
      await IpcBridge.stopAgent(sessionId);
    } catch (err) {
      console.error('[AgentOrchestrator] Error stopping agent:', err);
    }

    AgentOrchestrator.handleSessionTerminal(chatId, 'Stopped by user');
  }

  public static async regenerate(
    chatId: string,
    promptText: string,
    options: ComposerOptions = {},
    responseSeq: number
  ): Promise<void> {
    const activeChat = chatStore.getState().chats.find((c) => c.id === chatId);
    if (!activeChat) return;
    const activeProject = chatStore.getState().projects.find((p) => p.name === activeChat?.project);

    // Selected model resolution
    const selectedModelName = options.model || activeChat?.model || providerStore.getState().lastUsedModel || '';
    const activeProvider = ProviderRegistry.resolveActiveProvider(selectedModelName);
    const engineProviderId = activeProvider ? ProviderRegistry.resolveEngineProviderId(activeProvider) : 'custom';
    const engineModelSlug = ProviderRegistry.resolveModelId(activeProvider, selectedModelName);

    if (selectedModelName) {
      providerStore.setLastUsedModel(selectedModelName);
    }

    const unsandboxed = options.sandbox === false;
    const sandboxMode: 'sandboxed' | 'full' = unsandboxed ? 'full' : 'sandboxed';

    const startedAt = Date.now();
    sessionStore.markRunning(chatId, startedAt, sandboxMode);

    chatStore.setChats(
      chatStore.getState().chats.map((c) =>
        c.id === chatId
          ? {
              ...c,
              isRunning: true,
              startedAt,
              timestamp: new Date().toISOString(),
            }
          : c
      )
    );
    ChatRepository.persistAll().catch(console.error);

    // Prepare Stream Buffer
    const buffer = AgentOrchestrator.getStreamBuffer(chatId);
    buffer.resetTurn();
    buffer.setStartedAt(startedAt);
    buffer.responseSeq = responseSeq;
    buffer.sandboxMode = sandboxMode;

    // Setup Agent Event Bus listener for this session
    AgentOrchestrator.setupSessionEventListener(chatId, startedAt);

    // Build IPC Agent Run Configuration payload
    const currentAttachments = chatStore
      .getSteps(chatId)
      .filter((s) => s.metadata?.mediaPath)
      .map((s) => s.metadata!.mediaPath as string);

    const runConfig: Record<string, unknown> = {
      model: engineModelSlug,
      provider: engineProviderId,
      apiKey: activeProvider?.apiKey || '',
      baseUrl: activeProvider?.baseUrl || '',
      workspacePath: activeProject?.folders?.[0] || '',
      allowedCommands: activeProject?.allowedCommands || [],
      instructions: activeProject?.instructions || '',
      approvalMode: options.approvalMode || 'ask',
      unsandboxed: options.sandbox === false,
      selectedTools: options.selectedTools,
    };

    try {
      const sessionId = chatId.startsWith('session-') ? chatId : `session-${chatId}`;
      const result = await IpcBridge.runAgent({
        sessionId,
        prompt: promptText.trim(),
        config: runConfig,
        currentAttachments,
      });

      if (result && result.success === false) {
        AgentOrchestrator.handleSessionError(chatId, result.error || 'Failed to start agent session', startedAt);
      }
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      AgentOrchestrator.handleSessionError(chatId, errorMsg, startedAt);
    }
  }

  private static setupSessionEventListener(chatId: string, startedAt: number): void {
    // Unsubscribe existing listener if any
    const existingUnsub = AgentOrchestrator.eventUnsubscribers.get(chatId);
    if (existingUnsub) existingUnsub();

    const sessionId = chatId.startsWith('session-') ? chatId : `session-${chatId}`;
    const unsub = agentEventBus.subscribe(sessionId, (event: AgentEvent) => {
      const buffer = AgentOrchestrator.getStreamBuffer(chatId);
      const session = sessionStore.getState().runningSessions.get(chatId);
      const sandboxMode = session?.sandboxMode || 'sandboxed';

      switch (event.type) {
        case 'start_turn':
          buffer.resetTurn();
          break;

        case 'token':
          if (event.content) buffer.append(event.content);
          break;

        case 'replace_tokens':
          if (event.content) buffer.replace(event.content);
          break;

        case 'tool_call':
          if (event.toolName) {
            const currentChat = chatStore.getState().chats.find((c) => c.id === chatId);
            const activeModel = buffer.modelName || currentChat?.model || '';
            const toolStep = StepFactory.toolCallStep(
              event.toolName,
              `${event.toolName}(${JSON.stringify(event.toolArgs || {})})`,
              'running',
              undefined,
              undefined,
              buffer.responseSeq,
              sandboxMode,
              event.toolArgs,
              activeModel
            );
            chatStore.updateSteps(chatId, (prev) => [...prev, toolStep]);
            ChatRepository.persistAll().catch(console.error);
          }
          break;

        case 'tool_result':
          if (event.toolName && event.toolResult) {
            const steps = chatStore.getSteps(chatId);
            const lastToolCall = [...steps]
              .reverse()
              .find((s) => s.type === 'tool_call' && s.toolName === event.toolName);
            const toolArgs = (event.toolArgs || lastToolCall?.metadata?.toolArgs) as Record<string, unknown> | undefined;
            const currentChat = chatStore.getState().chats.find((c) => c.id === chatId);
            const activeModel = buffer.modelName || currentChat?.model || '';

            const resultStep = StepFactory.toolResultStep(
              event.toolName,
              event.toolResult,
              undefined,
              undefined,
              sandboxMode,
              toolArgs,
              activeModel
            );
            chatStore.updateSteps(chatId, (prev) => [...prev, resultStep]);
            ChatRepository.persistAll().catch(console.error);

            if (event.toolName === 'make_3d_character' && event.toolResult) {
              AgentOrchestrator.import3DCharacter(event.toolResult);
            }
          }
          break;

        case 'context':
          if (event.context) {
            sessionStore.updateContextUsage(chatId, event.context);
          }
          break;

        case 'chat-name':
          if (event.chatName) {
            chatStore.setChats(
              chatStore.getState().chats.map((c) => (c.id === chatId ? { ...c, title: event.chatName! } : c))
            );
            ChatRepository.persistAll().catch(console.error);
          }
          break;

        case 'done':
          buffer.flush();
          AgentOrchestrator.handleSessionTerminal(chatId);
          break;

        case 'error':
        case 'abort':
          buffer.flush();
          AgentOrchestrator.handleSessionTerminal(chatId, event.error || 'Agent execution aborted');
          if (event.type === 'error') {
            AgentOrchestrator.toastTrigger?.(`Agent error: ${event.error || 'Unknown error'}`, 'error');
          }
          break;

        default:
          break;
      }
    });

    AgentOrchestrator.eventUnsubscribers.set(chatId, unsub);
  }

  private static async import3DCharacter(toolResult: string): Promise<void> {
    try {
      const res = JSON.parse(toolResult) as {
        ok?: boolean;
        disabled?: boolean;
        path?: string;
        provider?: string;
        message?: string;
      };
      if (res.disabled) {
        AgentOrchestrator.toastTrigger?.('3D Model Gen is disabled — enable it in Settings → 3D Model Gen.', 'info');
      } else if (res.ok && res.path) {
        const activeId = await IpcBridge.invoke<string | null>('partner-get-active');
        if (!activeId) {
          AgentOrchestrator.toastTrigger?.('3D character ready, but no active Partner to show it.', 'info');
        } else {
          try {
            await IpcBridge.invoke('partner-import-model', activeId, res.path);
            await IpcBridge.invoke('partner-set-active', activeId);
            await IpcBridge.invoke('pet-start');
            AgentOrchestrator.toastTrigger?.(`3D character saved to ${res.path}`, 'info');
          } catch (err) {
            console.error('[AgentOrchestrator] Failed to import 3D character:', err);
          }
        }
      } else if (res.message) {
        AgentOrchestrator.toastTrigger?.(res.message, 'info');
      }
    } catch {
      /* non-JSON tool result — ignore */
    }
  }

  private static handleSessionError(chatId: string, errorMessage: string, startedAt: number): void {
    const duration = FormatUtils.formatWorkedDuration(Date.now() - startedAt);
    chatStore.updateSteps(chatId, (prev) => FormatUtils.stampWorkedDuration(prev, duration));
    AgentOrchestrator.handleSessionTerminal(chatId, errorMessage);
  }

  private static handleSessionTerminal(chatId: string, error?: string): void {
    const unsub = AgentOrchestrator.eventUnsubscribers.get(chatId);
    if (unsub) {
      unsub();
      AgentOrchestrator.eventUnsubscribers.delete(chatId);
    }

    const buffer = AgentOrchestrator.streamBuffers.get(chatId);
    if (buffer) {
      buffer.clear();
    }

    sessionStore.markIdle(chatId, error);
    chatStore.setChats(
      chatStore.getState().chats.map((c) =>
        c.id === chatId
          ? {
              ...c,
              isRunning: false,
              timestamp: new Date().toISOString(),
              lastError: error,
            }
          : c
      )
    );
    ChatRepository.persistAll().catch(console.error);

    // Drain next item in queue for this chat session
    const nextQueuedItem = sessionStore.dequeue(chatId);
    if (nextQueuedItem) {
      AgentOrchestrator.sendPrompt(
        nextQueuedItem.chatId,
        nextQueuedItem.prompt,
        nextQueuedItem.options,
        nextQueuedItem.attachments
      ).catch(console.error);
    }
  }
}
