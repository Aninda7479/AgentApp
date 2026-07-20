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

/**
 * Residency (LRU) of chat trajectories in RAM. Only the chats the user is
 * actually looking at keep their (potentially huge) `steps` array in memory;
 * every other chat is held metadata-only and its steps are lazy-loaded from
 * disk (`chat-steps-read`) the moment it is opened, then evicted again when
 * another chat displaces it. The canonical transcript lives on disk, so
 * eviction never loses data. `RESIDENT_CAP` bounds peak RAM regardless of
 * how many conversations exist.
 */
const RESIDENT_CAP = 2;
const residentOrder: string[] = [];

/** Drops a chat id from the residency tracker (e.g. when it is deleted). */
function forgetResident(chatId: string): void {
  const idx = residentOrder.indexOf(chatId);
  if (idx !== -1) residentOrder.splice(idx, 1);
}

/**
 * Reads a chat's steps: from resident RAM if still held, otherwise via a
 * lazy `chat-steps-read` IPC call (disk). Returns [] when nothing is found.
 */
async function loadSteps(ctx: AppContext, chatId: string): Promise<TrajectoryStep[]> {
  const resident = ctx.getChats().find((c) => c.id === chatId);
  if (resident && resident.steps && resident.steps.length > 0) return resident.steps;
  if (!ctx.ipc) return [];
  try {
    const steps = (await ctx.ipc.invoke('chat-steps-read', chatId)) as TrajectoryStep[] | undefined;
    return steps && Array.isArray(steps) ? steps : [];
  } catch {
    return [];
  }
}

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
    ctx.setConnectedProviders(stored.connectedProviders);
    ctx.setModelsCatalog(stored.modelsCatalog);

    // Only the ACTIVE chat's steps stay resident; every other chat is held
    // metadata-only (its steps are re-read from disk on open via
    // `openChat`). This keeps RAM bounded no matter how many
    // conversations exist.
    const requestedChatId = ctx.getActiveChatId();
    const activeChat =
      requestedChatId && requestedChatId !== 'draft-chat'
        ? stored.chats.find((c) => c.id === requestedChatId)
        : null;
    const defaultProject = stored.projects.length > 0 ? stored.projects[0].name : '';

    const metaChats = stored.chats.map((c) =>
      c.id === activeChat?.id ? c : { ...c, steps: [] }
    );
    ctx.setChats(metaChats);

    residentOrder.length = 0;
    if (activeChat) {
      ctx.setActiveChatId(activeChat.id);
      ctx.setActiveProject(defaultProject);
      ctx.setTrajectorySteps(activeChat.steps);
      residentOrder.push(activeChat.id);
    } else {
      ctx.setActiveChatId('draft-chat');
      ctx.setActiveProject(defaultProject);
      ctx.setDraftProject(defaultProject);
      ctx.setTrajectorySteps([]);
    }

    // Persist the full store as-is so the on-disk transcript stays complete.
    ctx.persistStore(stored.connectedProviders, stored.modelsCatalog, stored.projects, stored.chats);

    return {
      loadedProviders: stored.connectedProviders,
      loadedModels: stored.modelsCatalog,
      finalProjects: stored.projects,
      finalChats: stored.chats
    };
  }

  /**
   * Opens a chat for viewing: lazy-loads its trajectory steps from disk (if
   * not already resident), pushes them to the live canvas, and EVICTS the
   * least-recently-used resident chat's steps from RAM (it stays on disk).
   * This is the "load when needed, offload when done" path — the renderer
   * holds at most `RESIDENT_CAP` chats' full steps at once instead of all
   * of them forever.
   */
  static async openChat(
    ctx: AppContext,
    chatId: string,
    opts?: { setTab?: boolean }
  ): Promise<void> {
    const steps = await loadSteps(ctx, chatId);

    const order = residentOrder.filter((id) => id !== chatId);
    let nextChats = ctx.getChats();

    // Evict the LRU resident chat (oldest) by dropping its steps from the
    // in-memory chat list. Its transcript remains on disk, so nothing is lost.
    if (order.length >= RESIDENT_CAP) {
      const evictId = order.shift() as string;
      nextChats = nextChats.map((c) => (c.id === evictId ? { ...c, steps: [] } : c));
    }
    order.push(chatId);
    residentOrder.length = 0;
    residentOrder.push(...order);

    nextChats = nextChats.map((c) => (c.id === chatId ? { ...c, steps } : c));

    ctx.setChats(nextChats);
    ctx.setTrajectorySteps(steps);
    ctx.setActiveChatId(chatId);
    const meta = ctx.getChats().find((c) => c.id === chatId);
    if (meta?.project) ctx.setActiveProject(meta.project);
    if (opts?.setTab) ctx.setActiveTab('trajectory');
    ctx.persistStore(ctx.getConnectedProviders(), ctx.getModelsCatalog(), ctx.getProjects(), nextChats);
    return;
  }

  /**
   * Applies a step-updater to one chat's trajectory and persists. Also mirrors
   * the result into the live canvas when the targeted chat is the active one.
   *
   * `persist` (default true) controls whether the ENTIRE store is serialized and
   * written to disk over IPC. During token streaming this is called once per
   * token; persisting the whole store (all chats + every step) on each token is
   * an O(n²) allocation/IO storm that balloons the renderer's RSS into the
   * gigabytes on fast local providers (e.g. Ollama, which streams uncapped tokens
   * with no network latency) — see the token branch in AgentStreamService, which
   * passes `persist: false` and relies on the terminal done/error/abort event to
   * flush the final steps. The canonical transcript is independently persisted in
   * the main process (MessageHistoryStore), so skipping per-token disk writes
   * never loses data.
   */
  static updateChatSteps(
    ctx: AppContext,
    targetChatId: string,
    updater: (prevSteps: TrajectoryStep[]) => TrajectoryStep[],
    persist: boolean = true
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
      if (persist) {
        ctx.persistStore(ctx.getConnectedProviders(), ctx.getModelsCatalog(), ctx.getProjects(), nextChats);
      }
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
