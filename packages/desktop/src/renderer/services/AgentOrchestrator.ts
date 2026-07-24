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
      const proj = chatStore.getState().activeProject || chatStore.getState().draftProject || '';

      const newChat: StoredChat = {
        id: uniqueChatId,
        title: proj ? `Chat in ${proj}` : 'Standalone Chat',
        project: proj,
        model: defaultModel,
        timestamp: 'Just now',
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

    const startedAt = Date.now();
    sessionStore.markRunning(targetChatId, startedAt);

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
    const userStep = StepFactory.userStep(trimmedPrompt);
    const attachmentSteps: TrajectoryStep[] = attachments.map((att) =>
      StepFactory.attachmentStep(att.filename, att.fullPath || att.filename)
    );

    const nextSteps = [...attachmentSteps, userStep];
    chatStore.updateSteps(targetChatId, (prev) => [...prev, ...nextSteps]);
    ChatRepository.persistAll().catch(console.error);

    // Prepare Stream Buffer
    const buffer = AgentOrchestrator.getStreamBuffer(targetChatId);
    buffer.resetTurn();
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
    };

    try {
      const result = await IpcBridge.runAgent({
        sessionId: `session-${targetChatId}`,
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
      await IpcBridge.stopAgent(`session-${chatId}`);
    } catch (err) {
      console.error('[AgentOrchestrator] Error stopping agent:', err);
    }

    AgentOrchestrator.handleSessionTerminal(chatId, 'Stopped by user');
  }

  private static setupSessionEventListener(chatId: string, startedAt: number): void {
    // Unsubscribe existing listener if any
    const existingUnsub = AgentOrchestrator.eventUnsubscribers.get(chatId);
    if (existingUnsub) existingUnsub();

    const sessionId = `session-${chatId}`;
    const unsub = agentEventBus.subscribe(sessionId, (event: AgentEvent) => {
      const buffer = AgentOrchestrator.getStreamBuffer(chatId);

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
            const toolStep = StepFactory.toolCallStep(
              event.toolName,
              `${event.toolName}(${JSON.stringify(event.toolArgs || {})})`,
              'running'
            );
            chatStore.updateSteps(chatId, (prev) => [...prev, toolStep]);
            ChatRepository.persistAll().catch(console.error);
          }
          break;

        case 'tool_result':
          if (event.toolName && event.toolResult) {
            const resultStep = StepFactory.toolResultStep(event.toolName, event.toolResult);
            chatStore.updateSteps(chatId, (prev) => [...prev, resultStep]);
            ChatRepository.persistAll().catch(console.error);
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
          break;

        default:
          break;
      }
    });

    AgentOrchestrator.eventUnsubscribers.set(chatId, unsub);
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
