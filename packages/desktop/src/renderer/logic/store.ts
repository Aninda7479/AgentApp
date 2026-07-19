/**
 * `StoreService` — owns loading and persisting the on-disk application store
 * (projects, chats, providers, models) plus the chat-step mutation helpers that
 * the agent streaming and many handlers rely on. The design layer calls
 * `bootstrap` once on startup and `updateChatSteps` / `updateChatRecord` whenever
 * a chat's trajectory changes.
 */
import type {
  AppContext,
  ProviderConnection,
  ModelConfig,
  StoredProject,
  StoredChat,
  TrajectoryStep
} from './types';

export class StoreService {
  /**
   * Reads the persisted store from disk (via IPC) and normalizes it: every chat
   * is forced to a non-running state on load. Returns empty arrays when there is
   * no IPC (test / web build). Pure fetch — does not touch React state.
   */
  static async read(ipc: any | null): Promise<{
    connectedProviders: ProviderConnection[];
    modelsCatalog: ModelConfig[];
    projects: StoredProject[];
    chats: StoredChat[];
  }> {
    if (!ipc) {
      return { connectedProviders: [], modelsCatalog: [], projects: [], chats: [] };
    }
    const stored = (await ipc.invoke('store-read')) as {
      connectedProviders?: ProviderConnection[];
      modelsCatalog?: ModelConfig[];
      projects?: StoredProject[];
      chats?: StoredChat[];
    } | undefined;

    const connectedProviders = stored?.connectedProviders ?? [];
    const modelsCatalog = stored?.modelsCatalog ?? [];
    const projects = stored?.projects ?? [];
    const chats = (stored?.chats ?? []).map((c: StoredChat) => ({ ...c, isRunning: false }));
    return { connectedProviders, modelsCatalog, projects, chats };
  }

  /**
   * Full startup load: reads the store, pushes it into React state, selects the
   * initial active project + chat (or the draft chat), and re-persists. Returns
   * the loaded data so the caller can then load settings and auto-detect
   * providers. Mirrors the original App startup exactly.
   */
  static async bootstrap(ctx: AppContext): Promise<{
    loadedProviders: ProviderConnection[];
    loadedModels: ModelConfig[];
    finalProjects: StoredProject[];
    finalChats: StoredChat[];
  }> {
    const stored = await StoreService.read(ctx.ipc);

    ctx.setProjects(stored.projects);
    ctx.setChats(stored.chats);
    ctx.setConnectedProviders(stored.connectedProviders);
    ctx.setModelsCatalog(stored.modelsCatalog);

    if (stored.projects.length > 0) {
      const defaultProject = stored.projects[0].name;
      ctx.setActiveProject(defaultProject);

      const requestedChatId = ctx.getActiveChatId();
      const matchingChat = requestedChatId && requestedChatId !== 'draft-chat'
        ? stored.chats.find((c) => c.id === requestedChatId)
        : null;

      if (matchingChat) {
        ctx.setActiveChatId(matchingChat.id);
        ctx.setTrajectorySteps(matchingChat.steps);
      } else {
        ctx.setActiveChatId('draft-chat');
        ctx.setDraftProject(defaultProject);
        ctx.setTrajectorySteps([]);
      }
    } else {
      ctx.setActiveChatId('draft-chat');
      ctx.setDraftProject('');
      ctx.setTrajectorySteps([]);
    }

    ctx.persistStore(stored.connectedProviders, stored.modelsCatalog, stored.projects, stored.chats);

    return {
      loadedProviders: stored.connectedProviders,
      loadedModels: stored.modelsCatalog,
      finalProjects: stored.projects,
      finalChats: stored.chats
    };
  }

  /**
   * Applies a step-updater to one chat's trajectory and persists. Also mirrors
   * the result into the live canvas when the targeted chat is the active one.
   */
  static updateChatSteps(
    ctx: AppContext,
    targetChatId: string,
    updater: (prevSteps: TrajectoryStep[]) => TrajectoryStep[]
  ): void {
    ctx.setChats((prevChats) => {
      const chat = prevChats.find((c) => c.id === targetChatId);
      if (!chat) return prevChats;

      const nextSteps = updater(chat.steps || []);
      if (targetChatId === ctx.getActiveChatId()) {
        ctx.setTrajectorySteps(nextSteps);
      }

      const nextChats = prevChats.map((c) =>
        c.id === targetChatId ? { ...c, steps: nextSteps } : c
      );
      ctx.persistStore(ctx.getConnectedProviders(), ctx.getModelsCatalog(), ctx.getProjects(), nextChats);
      return nextChats;
    });
  }

  /**
   * Applies a whole-chat updater (e.g. `isRunning = false`) and persists. Mirrors
   * the (possibly changed) steps into the live canvas when relevant.
   */
  static updateChatRecord(
    ctx: AppContext,
    targetChatId: string,
    updater: (chat: StoredChat) => StoredChat
  ): void {
    ctx.setChats((prevChats) => {
      const existing = prevChats.find((c) => c.id === targetChatId);
      if (!existing) return prevChats;

      let updatedChat = existing;
      const nextChats = prevChats.map((c) => {
        if (c.id !== targetChatId) return c;
        updatedChat = updater(c);
        return updatedChat;
      });

      if (targetChatId === ctx.getActiveChatId()) {
        ctx.setTrajectorySteps(updatedChat.steps);
      }

      ctx.persistStore(ctx.getConnectedProviders(), ctx.getModelsCatalog(), ctx.getProjects(), nextChats);
      return nextChats;
    });
  }
}
