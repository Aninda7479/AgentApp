/**
 * `AgentService` — the send-prompt orchestration and the real-agent / demo-mode
 * dispatch. It resolves which provider/model to use, copies attachments into the
 * chat folder, decides real-vs-simulated, and either invokes the main-process
 * agent runner or the `AgentSimulator`. All React state is driven through `ctx`;
 * the streaming refs (`streamingChatIdRef`, `streamingBufferRef`,
 * `streamingStepIdRef`) are passed in so the matching `agent-event` listener in
 * App.tsx can read them.
 */
import type { AppContext, ComposerOptions, ProviderConnection, ModelConfig, TrajectoryStep } from './types';
import { StepFactory } from './steps';
import { FormatService } from './format';
import { StoreService } from './store';
import { SettingsService } from './settings';
import { AttachmentService } from './attachments';
import { AgentSimulator } from './simulation';
import type { SlashResult } from './slash';

/** Mutable ref bundle the `agent-event` streaming listener reads/writes. */
export interface StreamingRefs {
  chatIdRef: { current: string | null };
  bufferRef: { current: string };
  stepIdRef: { current: string | null };
}

export class AgentService {
  /**
   * Resolves which provider to bill: the one whose enabled model matches the
   * selected model name, otherwise the first connected provider.
   */
  static resolveActiveProvider(
    options: ComposerOptions,
    providers: ProviderConnection[],
    models: ModelConfig[]
  ): ProviderConnection | undefined {
    const modelName = options.model || '';
    return (
      providers.find((p) => models.some((m) => m.providerId === p.id && m.name === modelName && m.enabled)) ||
      providers[0]
    );
  }

  /**
   * Strips the `<providerId>-` prefix from a catalog model id to recover the
   * engine-facing model slug (e.g. "google/gemma-4-31b:free").
   */
  static resolveModelId(
    activeProvider: ProviderConnection | undefined,
    selectedModelName: string,
    models: ModelConfig[]
  ): string {
    const selectedModelConfig =
      models.find((m) => m.providerId === activeProvider?.id && m.name === selectedModelName && m.enabled) ||
      models.find((m) => m.providerId === activeProvider?.id && m.name === selectedModelName);
    return selectedModelConfig ? selectedModelConfig.id.replace(`${activeProvider?.id}-`, '') : selectedModelName;
  }

  /**
   * Collects every attachment path the agent should see: all media paths already
   * in the chat's history plus the newly saved attachments (de-duplicated).
   */
  static collectAttachmentPaths(
    steps: TrajectoryStep[],
    savedAttachments: { filename: string; fullPath: string }[]
  ): string[] {
    const paths: string[] = [];
    for (const step of steps) {
      if (step.metadata?.mediaPath) paths.push(step.metadata.mediaPath as string);
    }
    for (const att of savedAttachments) {
      if (!paths.includes(att.fullPath)) paths.push(att.fullPath);
    }
    return paths;
  }

  /**
   * Starts a real agent run in the main process. Non-blocking — token/tool/done
   * events return over the `agent-event` IPC channel. On failure it marks the
   * chat as errored (with a worked-duration) via `StoreService`.
   */
  static runRealAgent(
    ctx: AppContext,
    args: {
      sessionId: string;
      prompt: string;
      chatId: string;
      config: Record<string, unknown>;
      currentAttachments: string[];
      runStartedAt: number;
    }
  ): void {
    ctx.ipc
      ?.invoke('agent-run', {
        sessionId: args.sessionId,
        prompt: args.prompt,
        config: args.config,
        currentAttachments: args.currentAttachments
      })
      .catch((err: Error) => {
        ctx.triggerToast(`Failed to start agent: ${err.message}`);
        StoreService.updateChatRecord(ctx, args.chatId, (current) => ({
          ...current,
          isRunning: false,
          lastError: err.message,
          steps: FormatService.stampWorkedDuration(
            current.steps,
            FormatService.formatWorkedDuration(Date.now() - (current.startedAt || args.runStartedAt))
          )
        }));
      });
  }

  /**
   * Stops the currently-running agent session. Sends `agent-stop` to the main
   * process, stamps the worked duration onto the chat, marks it not-running with
   * a "Stopped by user" error, and clears the generating flag. A null / draft
   * chat simply clears the generating flag.
   */
  static stopRun(ctx: AppContext, activeChatId: string | null): void {
    if (!activeChatId || activeChatId === 'draft-chat') {
      ctx.setIsGenerating(false);
      return;
    }
    const runningChat = ctx.getChats().find((c) => c.id === activeChatId);
    const workedDuration = FormatService.formatWorkedDuration(
      Date.now() - (runningChat?.startedAt || Date.now())
    );
    ctx.ipc
      ?.invoke('agent-stop', `session-${activeChatId}`)
      .catch((err: Error) => {
        console.error('Failed to stop agent session', err);
      });
    StoreService.updateChatRecord(ctx, activeChatId, (current) => ({
      ...current,
      isRunning: false,
      lastError: 'Stopped by user',
      steps: FormatService.stampWorkedDuration(current.steps, workedDuration)
    }));
    ctx.setIsGenerating(false);
  }

  /**
   * Main prompt-submission handler. This is the orchestration that used to live
   * inside App.tsx: it handles leading-slash commands, materializes attachments,
   * creates/updates the chat, and routes to the real agent or the simulator.
   * Returns nothing; all effects happen through `ctx` / `streaming`.
   */
  static async sendPrompt(
    ctx: AppContext,
    prompt: string,
    options: ComposerOptions,
    streaming: StreamingRefs,
    onSlashCommand: (raw: string, options: ComposerOptions) => Promise<SlashResult>
  ): Promise<void> {
    const trimmed = prompt.trim();
    if (trimmed.startsWith('/')) {
      const res = await onSlashCommand(trimmed, options);
      if (res.consumed) {
        // Seed commands (/image, /3d, …) pre-fill the composer for the user to
        // review and send intentionally — don't wipe that seed.
        if (!res.keepComposer) ctx.setComposerPrompt('');
        return;
      }
    }
    ctx.setComposerPrompt('');
    const attachmentsToSave = [...ctx.getComposerAttachments()];
    ctx.setComposerAttachments([]);
    const runStartedAt = Date.now();

    let chatId = ctx.getActiveChatId();
    let projectScope = ctx.getActiveProject();
    let isNew = false;

    if (chatId === 'draft-chat') {
      isNew = true;
      // Assign a random, collision-resistant storage ID (`XXXX-XXXX-XXXX-XXXX`)
      // as the chat folder name so duplicate titles never collide on disk.
      let uniqueChatId = FormatService.generateStorageId();
      let guard = 0;
      while (ctx.getChats().some((c) => c.id === uniqueChatId) && guard < 10) {
        uniqueChatId = FormatService.generateStorageId();
        guard++;
      }
      chatId = uniqueChatId;
      projectScope = ctx.getDraftProject() || '';
    }
    if (!chatId) return;

    // Copy staged attachments into the chat folder.
    const savedAttachments = await AttachmentService.materialize(ctx, attachmentsToSave, chatId, projectScope);

    const userStep = StepFactory.userStep(prompt);
    const attachmentSteps = savedAttachments.map((att, idx) => StepFactory.attachmentStep(att.filename, att.fullPath, undefined, undefined));
    const combinedSteps = [userStep, ...attachmentSteps];

    // Decide whether we have real credentials or a routing configuration to run a live agent.
    const activeProvider = AgentService.resolveActiveProvider(options, ctx.getConnectedProviders(), ctx.getModelsCatalog());
    const isOrchestrator = options.model === 'Orchestrator' || options.model === 'Model Governance' || options.model === 'auto';
    const isLocalOrCustom = activeProvider && (activeProvider.id === 'ollama' || activeProvider.id === 'custom' || activeProvider.baseUrl);
    const hasRealCredentials = Boolean(activeProvider?.apiKey) || isOrchestrator || isLocalOrCustom;

    if (isNew) {
      const newChat = {
        id: chatId,
        title: prompt.length > 25 ? prompt.slice(0, 25).trim() + '...' : prompt.trim(),
        project: projectScope,
        model: options.model || '',
        timestamp: new Date().toLocaleDateString(),
        steps: combinedSteps,
        isRunning: true,
        startedAt: runStartedAt
      };
      ctx.setChats((prev) => {
        const next = [newChat, ...prev];
        ctx.persistStore(ctx.getConnectedProviders(), ctx.getModelsCatalog(), ctx.getProjects(), next);
        return next;
      });
      ctx.setActiveChatId(chatId);
      ctx.setActiveProject(projectScope);
      ctx.setTrajectorySteps(combinedSteps);
    } else {
      const updatedSteps = [...ctx.getTrajectorySteps(), userStep, ...attachmentSteps];
      ctx.setTrajectorySteps(updatedSteps);
      ctx.setChats((prev) => {
        const next = prev.map((c) =>
          c.id === chatId ? { ...c, steps: updatedSteps, isRunning: true, startedAt: runStartedAt, lastError: undefined } : c
        );
        ctx.persistStore(ctx.getConnectedProviders(), ctx.getModelsCatalog(), ctx.getProjects(), next);
        return next;
      });
    }

    // Reflect "generating" state. Mirrors original: compares against the ref that
    // lags the render, so appending to the already-active chat flips it on.
    ctx.setIsGenerating(ctx.getActiveChatId() === chatId);

    // Remember the chosen model.
    if (options.model) {
      SettingsService.persistLastUsedModel(ctx, options.model);
    }

    if (hasRealCredentials && activeProvider && ctx.ipc) {
      // ── Real agent run ──
      streaming.chatIdRef.current = chatId;
      streaming.bufferRef.current = '';
      streaming.stepIdRef.current = null;

      const allAttachmentPaths = AgentService.collectAttachmentPaths(
        [...ctx.getTrajectorySteps(), userStep, ...attachmentSteps],
        savedAttachments
      );
      const activeProjectConfig = ctx.getProjects().find((p) => p.name === projectScope);
      const resolvedProjectRoot = activeProjectConfig?.folders?.[0] || undefined;
      const sessionId = `session-${chatId}`;
      const selectedModelName = options.model || '';
      const resolvedModel = AgentService.resolveModelId(activeProvider, selectedModelName, ctx.getModelsCatalog());

      const agentConfig = {
        provider: activeProvider.type === 'env' || activeProvider.type === 'key' ? activeProvider.id : 'custom',
        apiKey: activeProvider.apiKey,
        baseUrl: activeProvider.baseUrl || undefined,
        model: resolvedModel,
        projectRoot: resolvedProjectRoot,
        allowedCommands: activeProjectConfig?.allowedCommands,
        // ── Sandbox wiring ── the desktop engine routes every command
        // and file write through a SandboxRunner driven by these. The
        // UI toggles (Unsandboxed Terminal Actions / Confirm shell
        // commands) are read here so the agent actually honors them.
        unsandboxedActions: ctx.getFullAccess(),
        permissionMode: (ctx.getFullAccess()
          ? 'full-autonomy'
          : (ctx.getDefaultPermissions() ? 'read-only' : 'auto-approve-edits')),
        attachments: allAttachmentPaths.length > 0 ? allAttachmentPaths : undefined,
        internetAccess: ctx.getInternetAccessLevel()
      };

      AgentService.runRealAgent(ctx, {
        sessionId,
        prompt,
        chatId,
        config: agentConfig,
        currentAttachments: savedAttachments.map((att) => att.fullPath),
        runStartedAt
      });
    } else {
      // ── Simulation fallback ──
      const thoughtStep = StepFactory.thoughtStep(
        hasRealCredentials
          ? `Streaming from ${activeProvider?.name || 'provider'} using model ${options.model}...`
          : `Demo mode — configure a provider in Settings to use real AI. Simulating response for: "${prompt.slice(0, 40)}..."`
      );
      ctx.setTrajectorySteps((prev) => [...prev, thoughtStep]);
      ctx.setChats((prev) => {
        const next = prev.map((c) =>
          c.id === chatId ? { ...c, steps: [...c.steps, thoughtStep] } : c
        );
        ctx.persistStore(ctx.getConnectedProviders(), ctx.getModelsCatalog(), ctx.getProjects(), next);
        return next;
      });

      AgentSimulator.run(
        ctx,
        prompt,
        chatId,
        isNew ? [...combinedSteps, thoughtStep] : [...ctx.getTrajectorySteps(), userStep, ...attachmentSteps, thoughtStep],
        projectScope,
        options.model || '',
        savedAttachments,
        runStartedAt
      );
    }
  }
}
