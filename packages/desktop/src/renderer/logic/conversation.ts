/**
 * `ConversationService` — owns all project/chat state mutations (create, delete,
 * select, rename, undo, mark-reviewed) plus the search-chat jump. It drives
 * React state through `ctx` and persists every change via `ctx.persistStore`.
 * The "compose a prompt then send" helpers (create task / use template / install
 * or try a plugin) stay as tiny wrappers in App.tsx because they bridge this
 * service to the send-prompt flow.
 */
import type { AppContext, StoredChat, StoredProject } from './types';
import { StepFactory } from './steps';
import { StoreService } from './store';
import { FormatService } from './format';

export class ConversationService {
  /** Computes the default composer model (last-used, else first enabled). */
  private static defaultModel(ctx: AppContext): string {
    return ctx.getLastUsedModel() || ctx.getModelsCatalog().find((m) => m.enabled)?.name || '';
  }

  /**
   * Creates a new project and seeds it with an initial chat, makes it active,
   * and navigates to the trajectory view.
   */
  static createProject(ctx: AppContext, newProj: StoredProject): void {
    // Ensure the project has a random storage ID so its folder never collides
    // with another project's folder on disk.
    const project: StoredProject = newProj.storageKey
      ? newProj
      : { ...newProj, storageKey: FormatService.generateStorageId() };
    ctx.setProjects((prev) => {
      const next = [...prev, project];
      const newChatId = FormatService.generateStorageId();
      const newChat: StoredChat = {
        id: newChatId,
        title: `New chat in ${project.name}`,
        project: project.name,
        model: ConversationService.defaultModel(ctx),
        timestamp: 'Just now',
        steps: [
          StepFactory.assistantStep(
            `New conversation initialized. Project context: \`${project.name}\`. How can I help you today?`
          )
        ]
      };

      ctx.setChats((prevChats) => {
        const nextChats = [newChat, ...prevChats];
        ctx.persistStore(ctx.getConnectedProviders(), ctx.getModelsCatalog(), next, nextChats);
        return nextChats;
      });

      ctx.setActiveProject(project.name);
      ctx.setActiveChatId(newChatId);
      ctx.setTrajectorySteps(newChat.steps);
      return next;
    });
    ctx.setActiveTab('trajectory');
  }

  /** Persists an edited project configuration. */
  static saveProjectConfig(ctx: AppContext, updatedProj: StoredProject): void {
    ctx.setProjects((prev) => {
      const next = prev.map((p) => (p.name === updatedProj.name ? updatedProj : p));
      ctx.persistStore(ctx.getConnectedProviders(), ctx.getModelsCatalog(), next, ctx.getChats());
      return next;
    });
  }

  /**
   * Deletes a project and all of its chats. If the deleted project was active,
   * the active project/chat is reassigned to another project (or cleared).
   */
  static deleteProject(ctx: AppContext, projectName: string): void {
    ctx.setProjects((prev) => {
      const next = prev.filter((p) => p.name !== projectName);
      ctx.setChats((prevChats) => {
        const nextChats = prevChats.filter((c) => c.project !== projectName);

        if (ctx.getActiveProject() === projectName) {
          if (next.length > 0) {
            const nextProjName = next[0].name;
            ctx.setActiveProject(nextProjName);
            const matchingChat = nextChats.find((c) => c.project === nextProjName);
            if (matchingChat) {
              ctx.setActiveChatId(matchingChat.id);
              ctx.setTrajectorySteps(matchingChat.steps);
            } else {
              ctx.setActiveChatId(null);
              ctx.setTrajectorySteps([]);
            }
          } else {
            ctx.setActiveProject('');
            ctx.setActiveChatId(null);
            ctx.setTrajectorySteps([]);
          }
        }
        ctx.persistStore(ctx.getConnectedProviders(), ctx.getModelsCatalog(), next, nextChats);
        return nextChats;
      });
      return next;
    });
  }

  /**
   * Selects a project: makes it active, jumps to the trajectory view, and loads
   * the first chat belonging to it (or opens a draft).
   */
  static selectProject(ctx: AppContext, project: string): void {
    ctx.setActiveProject(project);
    ctx.setActiveTab('trajectory');

    const matchingChat = ctx.getChats().find((c) => c.project === project);
    if (matchingChat) {
      ctx.setActiveChatId(matchingChat.id);
      ctx.setTrajectorySteps(matchingChat.steps);
    } else {
      ctx.setActiveChatId('draft-chat');
      ctx.setDraftProject(project);
      ctx.setTrajectorySteps([]);
    }
  }

  /** Opens a specific chat, making it active and loading its trajectory. */
  static selectChat(ctx: AppContext, chatId: string): void {
    const chat = ctx.getChats().find((c) => c.id === chatId);
    if (chat) {
      ctx.setActiveChatId(chatId);
      ctx.setActiveProject(chat.project);
      ctx.setTrajectorySteps(chat.steps);
      ctx.setActiveTab('trajectory');
    }
  }

  /**
   * Deletes a chat. If it was active, the active chat is reassigned (preferring
   * another chat in the same project) or cleared when none remain.
   */
  static deleteChat(ctx: AppContext, chatId: string): void {
    ctx.setChats((prev) => {
      const next = prev.filter((c) => c.id !== chatId);
      if (ctx.getActiveChatId() === chatId) {
        if (next.length > 0) {
          const nextChat = next.find((c) => c.project === ctx.getActiveProject()) || next[0];
          ctx.setActiveChatId(nextChat.id);
          ctx.setActiveProject(nextChat.project);
          ctx.setTrajectorySteps(nextChat.steps);
        } else {
          ctx.setActiveChatId(null);
          ctx.setTrajectorySteps([]);
        }
      }
      ctx.persistStore(ctx.getConnectedProviders(), ctx.getModelsCatalog(), ctx.getProjects(), next);
      return next;
    });
  }

  /**
   * Persists per-chat sandbox + internet overrides. The chat-level scope wins
   * over the parent project and the global default for this chat only.
   */
  static saveChatSettings(
    ctx: AppContext,
    chatId: string,
    settings: import('../types').AgentScopeSettings
  ): void {
    ctx.setChats((prev) => {
      const next = prev.map((c) =>
        c.id === chatId ? { ...c, settings: { ...settings } } : c
      );
      ctx.persistStore(ctx.getConnectedProviders(), ctx.getModelsCatalog(), ctx.getProjects(), next);
      return next;
    });
  }

  /**
   * Persists a standalone (project-less) chat's own config: permissions,
   * chat-only skills, memory, instructions, and its sandbox/internet scope.
   * Each standalone chat carries its own settings instead of a single
   * cumulative config shared by all of them.
   */
  static saveStandaloneChatConfig(
    ctx: AppContext,
    chatId: string,
    config: import('../types').StandaloneChatConfig,
    settings: import('../types').AgentScopeSettings
  ): void {
    ctx.setChats((prev) => {
      const next = prev.map((c) =>
        c.id === chatId
          ? { ...c, standaloneConfig: { ...config }, settings: { ...settings } }
          : c
      );
      ctx.persistStore(ctx.getConnectedProviders(), ctx.getModelsCatalog(), ctx.getProjects(), next);
      return next;
    });
  }

  /**
   * Opens a blank draft chat, optionally scoped to a project. Clears the
   * trajectory and navigates to the trajectory view.
   */
  static newChat(ctx: AppContext, forProject?: string): void {
    const targetProject = forProject !== undefined ? forProject : ctx.getActiveProject();
    ctx.setActiveProject(targetProject || '');
    ctx.setDraftProject(targetProject || '');
    ctx.setActiveChatId('draft-chat');
    ctx.setTrajectorySteps([]);
    ctx.setActiveTab('trajectory');
  }

  /**
   * Rolls back the active chat to just before the given step (removes that step
   * and everything after it) and persists.
   */
  static undoStep(ctx: AppContext, stepId: string): void {
    const activeChatId = ctx.getActiveChatId();
    if (!activeChatId) return;
    ctx.setChats((prevChats) => {
      const chat = prevChats.find((c) => c.id === activeChatId);
      if (!chat) return prevChats;

      const idx = chat.steps.findIndex((s) => s.id === stepId);
      if (idx === -1) return prevChats;

      const nextSteps = chat.steps.slice(0, idx);
      ctx.setTrajectorySteps(nextSteps);

      const nextChats = prevChats.map((c) => (c.id === activeChatId ? { ...c, steps: nextSteps } : c));
      ctx.persistStore(ctx.getConnectedProviders(), ctx.getModelsCatalog(), ctx.getProjects(), nextChats);
      return nextChats;
    });
    ctx.triggerToast('Conversation rolled back');
  }

  /** Marks the diff-originating step for a file as reviewed. */
  static reviewDiff(ctx: AppContext, filename: string): void {
    const activeChatId = ctx.getActiveChatId();
    if (!activeChatId) return;
    StoreService.updateChatSteps(
      ctx,
      activeChatId,
      (prev) => prev.map((s) => (s.metadata?.filename === filename ? { ...s, metadata: { ...s.metadata, reviewed: true } } : s))
    );
    ctx.triggerToast(`Marked ${filename} as reviewed`);
  }

  /**
   * Jumps to a chat from a search result. Opens the real matching conversation
   * if found; otherwise seeds a synthetic "Open chat" exchange.
   */
  static selectSearchChat(ctx: AppContext, chatTitle: string, projectContext?: string): void {
    const match = ctx.getChats().find((c) => c.title === chatTitle);
    if (match) {
      ConversationService.selectChat(ctx, match.id);
      return;
    }
    if (projectContext) {
      ctx.setActiveProject(projectContext);
    }
    ctx.setActiveTab('trajectory');
    ctx.setTrajectorySteps([
      StepFactory.userStep(`Open chat: ${chatTitle}`),
      StepFactory.assistantStep(
        `Loaded conversation history for "${chatTitle}". Currently active in project context: \`${projectContext || ctx.getActiveProject()}\`.`
      )
    ]);
  }
}
