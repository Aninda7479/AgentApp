/**
 * Chat Repository Service for SuperAgent Desktop
 * Handles persistent Chat & Project operations.
 */

import { chatStore } from '../stores/chatStore';
import { providerStore } from '../stores/providerStore';
import { IpcBridge } from '../core/ipc';
import type { StoredProject, StoredChat, TrajectoryStep } from '../core/types';
import { StepFactory } from './StepFactory';
import { FormatUtils } from '../util/format';

export class ChatRepository {
  private static persistTimeout: NodeJS.Timeout | null = null;
  private static pendingResolvers: Array<() => void> = [];

  static async bootstrap(): Promise<{
    projects: StoredProject[];
    chats: StoredChat[];
  }> {
    const data = await IpcBridge.readStore();
    const projects = data.projects || [];
    const chats = (data.chats || []).map((c) => ({ ...c, isRunning: false }));
    const connectedProviders = data.connectedProviders || [];
    const modelsCatalog = data.modelsCatalog || [];

    providerStore.setProviders(connectedProviders);
    providerStore.setModels(modelsCatalog);
    chatStore.setProjects(projects);

    const defaultProject = projects.length > 0 ? projects[0].name : '';
    const activeChat = chats.find((c) => c.id === chatStore.getState().activeChatId) || chats[0];

    // Meta chats keep steps empty until opened to save RAM
    const metaChats = chats.map((c) => (c.id === activeChat?.id ? c : { ...c, steps: [] }));
    chatStore.setChats(metaChats);

    if (activeChat) {
      chatStore.setActiveChatId(activeChat.id);
      chatStore.setActiveProject(activeChat.project || defaultProject);
      chatStore.setSteps(activeChat.id, activeChat.steps || []);
    } else {
      chatStore.setActiveChatId('draft-chat');
      chatStore.setActiveProject(defaultProject);
      chatStore.setDraftProject(defaultProject);
    }

    await ChatRepository.persistAll();
    return { projects, chats };
  }

  static async openChat(chatId: string): Promise<void> {
    chatStore.openPanel(chatId);

    // Read steps from disk if not resident
    const currentSteps = chatStore.getSteps(chatId);
    if (currentSteps.length === 0 && chatId !== 'draft-chat') {
      const diskSteps = await IpcBridge.readChatSteps(chatId);
      if (diskSteps && diskSteps.length > 0) {
        chatStore.setSteps(chatId, diskSteps);
      }
    }

    const chat = chatStore.getState().chats.find((c) => c.id === chatId);
    if (chat?.project) {
      chatStore.setActiveProject(chat.project);
    }

    await ChatRepository.persistAll();
  }

  static async createProject(newProj: StoredProject): Promise<void> {
    const project: StoredProject = {
      ...newProj,
      storageKey: newProj.storageKey || FormatUtils.generateStorageId(),
    };

    const newChatId = FormatUtils.generateStorageId();
    const defaultModel =
      providerStore.getState().lastUsedModel ||
      providerStore.getState().models.find((m) => m.enabled)?.name ||
      '';

    const newChat: StoredChat = {
      id: newChatId,
      title: `New chat in ${project.name}`,
      project: project.name,
      model: defaultModel,
      timestamp: 'Just now',
      steps: [
        StepFactory.assistantStep(
          `New conversation initialized. Project context: \`${project.name}\`. How can I help you today?`
        ),
      ],
    };

    const nextProjects = [...chatStore.getState().projects, project];
    const nextChats = [newChat, ...chatStore.getState().chats];

    chatStore.setProjects(nextProjects);
    chatStore.setChats(nextChats);
    chatStore.setActiveProject(project.name);
    chatStore.openPanel(newChatId);
    chatStore.setSteps(newChatId, newChat.steps);

    await ChatRepository.persistAll();
  }

  static async createChat(projectName?: string): Promise<string> {
    const proj = projectName || chatStore.getState().activeProject || chatStore.getState().projects[0]?.name || '';
    const newChatId = FormatUtils.generateStorageId();
    const defaultModel =
      providerStore.getState().lastUsedModel ||
      providerStore.getState().models.find((m) => m.enabled)?.name ||
      '';

    const newChat: StoredChat = {
      id: newChatId,
      title: proj ? `Chat in ${proj}` : 'Standalone Chat',
      project: proj,
      model: defaultModel,
      timestamp: 'Just now',
      steps: [],
    };

    chatStore.setChats([newChat, ...chatStore.getState().chats]);
    chatStore.openPanel(newChatId);
    chatStore.setSteps(newChatId, []);

    await ChatRepository.persistAll();
    return newChatId;
  }

  static async deleteChat(chatId: string): Promise<void> {
    chatStore.closePanel(chatId);
    const nextChats = chatStore.getState().chats.filter((c) => c.id !== chatId);
    chatStore.setChats(nextChats);
    await ChatRepository.persistAll();
  }

  static async deleteProject(projectName: string): Promise<void> {
    const nextProjects = chatStore.getState().projects.filter((p) => p.name !== projectName);
    const nextChats = chatStore.getState().chats.filter((c) => c.project !== projectName);

    chatStore.setProjects(nextProjects);
    chatStore.setChats(nextChats);

    if (chatStore.getState().activeProject === projectName) {
      const fallbackProj = nextProjects[0]?.name || '';
      chatStore.setActiveProject(fallbackProj);
    }

    await ChatRepository.persistAll();
  }

  /**
   * Persists all store changes to disk.
   * Debounces parallel invocations (300ms) to avoid file write race conditions.
   */
  static persistAll(): Promise<void> {
    if (!IpcBridge.isDesktop()) return Promise.resolve();

    if (ChatRepository.persistTimeout) {
      clearTimeout(ChatRepository.persistTimeout);
    }

    return new Promise<void>((resolve) => {
      ChatRepository.pendingResolvers.push(resolve);

      ChatRepository.persistTimeout = setTimeout(async () => {
        ChatRepository.persistTimeout = null;
        const resolvers = [...ChatRepository.pendingResolvers];
        ChatRepository.pendingResolvers = [];

        try {
          const { projects, chats } = chatStore.getState();
          const { providers, models } = providerStore.getState();

          // Preserve resident steps in memory when persisting store
          const fullChats = chats.map((c) => {
            const resident = chatStore.getSteps(c.id);
            return {
              ...c,
              steps: resident.length > 0 ? resident : c.steps,
            };
          });

          await IpcBridge.writeStore({
            connectedProviders: providers,
            modelsCatalog: models,
            projects,
            chats: fullChats,
          });
        } catch (err) {
          console.error('[ChatRepository] Persist failed:', err);
        } finally {
          resolvers.forEach((r) => r());
        }
      }, 300);
    });
  }
}
