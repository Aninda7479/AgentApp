/**
 * `AgentService` — the send-prompt orchestration and the real-agent / demo-mode
 * dispatch. It resolves which provider/model to use, copies attachments into the
 * chat folder, decides real-vs-simulated, and either invokes the main-process
 * agent runner or the `AgentSimulator`. All React state is driven through `ctx`;
 * the streaming refs (`streamingChatIdRef`, `streamingBufferRef`,
 * `streamingStepIdRef`) are passed in so the matching `agent-event` listener in
 * App.tsx can read them.
 */
import type { AppContext, ComposerOptions, ProviderConnection, ModelConfig, TrajectoryStep, ComposerAttachment } from './types';
import { StepFactory } from './steps';
import { FormatService } from './format';
import { StoreService } from './store';
import { SettingsService } from './settings';
import { AttachmentService } from './attachments';
import { AgentSimulator } from './simulation';
import { resolveScopeSettings, approvalToPermissionMode } from './scopeSettings';
import type { SlashResult } from './slash';
import { runManager } from './runManager';

/** Mutable ref bundle the `agent-event` streaming listener reads/writes. */
export interface StreamingRefs {
  chatIdRef: { current: string | null };
  bufferRef: { current: string };
  stepIdRef: { current: string | null };
  /** Sequence number of the response currently streaming (0 = first/normal
   *  response, 1+ = regenerated alternatives). Lets the canvas group a turn's
   *  responses and offer x/n navigation + arrow history. */
  responseSeqRef: { current: number };
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
   * Provider ids whose wire protocol is NOT OpenAI-compatible Chat Completions
   * and therefore must NOT be collapsed to the generic `custom` provider. These
   * are connected as `type: 'custom'` (no API key) but the engine has to route
   * them through a dedicated family (e.g. Ollama's native `/api/chat`). Omitting
   * an id here makes the engine POST to `<baseUrl>/chat/completions`, which such
   * servers reject (Ollama replies with the plaintext "404 page not found").
   */
  static readonly NON_OPENAI_COMPATIBLE_PROVIDER_IDS = ['ollama', 'ollama-cloud'];

  /**
   * Resolves the engine-facing provider id for a connection. Env/key providers
   * keep their real id; non-OpenAI-compatible local providers (Ollama) keep
   * theirs too so the engine picks the right wire protocol; every other custom
   * endpoint collapses to the generic OpenAI-compatible `custom` provider.
   */
  static resolveEngineProviderId(provider: ProviderConnection): string {
    if (provider.type === 'env' || provider.type === 'key') return provider.id;
    if (AgentService.NON_OPENAI_COMPATIBLE_PROVIDER_IDS.includes(provider.id)) return provider.id;
    return 'custom';
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
    const startedAt = args.runStartedAt;
    ctx.ipc
      ?.invoke('agent-run', {
        sessionId: args.sessionId,
        prompt: args.prompt,
        config: args.config,
        currentAttachments: args.currentAttachments
      })
      .then((res: { success?: boolean; error?: string } | undefined) => {
        // The main process may return { success: false, error } when engine.run()
        // rejects before emitting an agent-event (the agent-run catch path). It
        // also emits a terminal error event in that case, but guard the renderer
        // state here too so the chat never stays "generating" forever.
        if (res && res.success === false) {
          ctx.triggerToast(`Agent failed to start: ${res.error || 'Unknown error'}`);
          StoreService.updateChatRecord(ctx, args.chatId, (current) => ({
            ...current,
            isRunning: false,
            lastError: res.error || 'Unknown error',
            steps: FormatService.stampWorkedDuration(
              current.steps,
              FormatService.formatWorkedDuration(Date.now() - (current.startedAt || startedAt))
            )
          }));
          ctx.setIsGenerating(false);
        }
      })
      .catch((err: Error) => {
        ctx.triggerToast(`Failed to start agent: ${err.message}`);
        StoreService.updateChatRecord(ctx, args.chatId, (current) => ({
          ...current,
          isRunning: false,
          lastError: err.message,
          steps: FormatService.stampWorkedDuration(
            current.steps,
            FormatService.formatWorkedDuration(Date.now() - (current.startedAt || startedAt))
          )
        }));
        ctx.setIsGenerating(false);
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
   *
   * Queuing: if `chatId` is already running (per `runManager`), the prompt is
   * enqueued and runs once the in-flight response ends. `presetAttachments`
   * lets a *queued* re-run carry the attachments that were staged when it was
   * submitted, rather than whatever happens to be in the composer later.
   */
  static async sendPrompt(
    ctx: AppContext,
    prompt: string,
    options: ComposerOptions,
    presetAttachments?: ComposerAttachment[],
    onSlashCommand?: (raw: string, options: ComposerOptions) => Promise<SlashResult>
  ): Promise<void> {
    const trimmed = prompt.trim();
    if (trimmed.startsWith('/') && onSlashCommand) {
      const res = await onSlashCommand(trimmed, options);
      if (res.consumed) {
        // Seed commands (/image, /3d, …) pre-fill the composer for the user to
        // review and send intentionally — don't wipe that seed.
        if (!res.keepComposer) ctx.setComposerPrompt('');
        return;
      }
    }
    ctx.setComposerPrompt('');
    const attachmentsToSave = [...(presetAttachments ?? ctx.getComposerAttachments())];
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

    // ── Chat queue ──
    // If this chat already has a run in flight, queue the prompt instead of
    // starting a second concurrent run on the same session (which would collide
    // with the engine instance mid-turn). It is drained automatically when the
    // current run's terminal `agent-event` arrives. A brand-new chat always gets
    // a fresh id, so it never collides and always runs immediately.
    if (runManager.isRunning(chatId)) {
      runManager.enqueue(chatId, {
        prompt,
        options,
        attachments: presetAttachments ? presetAttachments : [...ctx.getComposerAttachments()]
      });
      ctx.setComposerPrompt('');
      ctx.setComposerAttachments([]);
      // Reflect the queue depth on the chat record so the sidebar shows a badge.
      const depth = runManager.queueDepth(chatId);
      StoreService.updateChatRecord(ctx, chatId, (current) => ({ ...current, queuedCount: depth }));
      ctx.triggerToast(`Queued — will run after the current response (${depth} waiting)`, 'info');
      return;
    }
    runManager.markRunning(chatId);
    // Starting a run consumes at most one queued item; sync the remaining depth.
    {
      const remaining = runManager.queueDepth(chatId);
      StoreService.updateChatRecord(ctx, chatId, (current) =>
        (current.queuedCount ?? 0) === remaining ? current : { ...current, queuedCount: remaining }
      );
    }

    // Copy staged attachments into the chat folder.
    const savedAttachments = await AttachmentService.materialize(ctx, attachmentsToSave, chatId, projectScope);

    const userStep = StepFactory.userStep(prompt);
    const attachmentSteps = savedAttachments.map((att, idx) => StepFactory.attachmentStep(att.filename, att.fullPath, undefined, undefined));
    const combinedSteps = [userStep, ...attachmentSteps];

    // Decide whether we have real credentials or a routing configuration to run a live agent.
    const activeProvider = AgentService.resolveActiveProvider(options, ctx.getConnectedProviders(), ctx.getModelsCatalog());
    const isOrchestrator = options.model === 'Orchestrator' || options.model === 'Model Governance' || options.model === 'auto';
    const isLocalOrCustom = activeProvider && (activeProvider.id === 'ollama' || activeProvider.id === 'omniroute' || activeProvider.id === 'custom' || activeProvider.baseUrl);
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
          c.id === chatId
            ? { ...c, steps: updatedSteps, model: options.model || c.model, isRunning: true, startedAt: runStartedAt, lastError: undefined }
            : c
        );
        ctx.persistStore(ctx.getConnectedProviders(), ctx.getModelsCatalog(), ctx.getProjects(), next);
        return next;
      });
    }

    // Reflect "generating" state. We just made `chatId` the active chat above
    // (and either created it or appended to it), so a response is always now in
    // flight for the chat we're sending to. NOTE: we must set `true`
    // unconditionally here — `ctx.getActiveChatId()` reads `stateRef`, which is
    // only refreshed in a post-render effect, so during a brand-new chat it still
    // returns the PREVIOUS id ('draft-chat'), which would wrongly flip generating
    // OFF and hide the red stop button + thinking animation on the first send.
    ctx.setIsGenerating(true);

    // Remember the chosen model.
    if (options.model) {
      SettingsService.persistLastUsedModel(ctx, options.model);
    }

    if (hasRealCredentials && activeProvider && ctx.ipc) {
      // ── Real agent run ──
      // Use THIS chat's own streaming-ref bundle (not a global one) so multiple
      // chats can stream concurrently without corrupting each other's buffers.
      const streaming = runManager.getStreamRefs(chatId);
      streaming.chatIdRef.current = chatId;
      streaming.bufferRef.current = '';
      streaming.stepIdRef.current = null;
      streaming.responseSeqRef.current = 0;

      const allAttachmentPaths = AgentService.collectAttachmentPaths(
        [...ctx.getTrajectorySteps(), userStep, ...attachmentSteps],
        savedAttachments
      );
      const activeProjectConfig = ctx.getProjects().find((p) => p.name === projectScope);
      const resolvedProjectRoot = activeProjectConfig?.folders?.[0] || undefined;
      const sessionId = chatId;
      const selectedModelName = options.model || '';
      const resolvedModel = AgentService.resolveModelId(activeProvider, selectedModelName, ctx.getModelsCatalog());

      // ── Resolve the effective sandbox + internet policy ──
      // Precedence: Chat → Project → Global. The composer's live toggles
      // (approval dropdown + sandbox badge) act as per-send overrides and win
      // over the persisted scope defaults for THIS run (see Part 5 seeding).
      const activeChat = ctx.getChats().find((c) => c.id === chatId);
      const resolvedScope = resolveScopeSettings({
        chat: activeChat ?? null,
        project: activeProjectConfig ?? null,
        globalUnsandboxed: ctx.getFullAccess(),
        globalInternet: ctx.getInternetAccessLevel()
      });
      // The composer's approval dropdown was packed into options.mode by
      // ComposerService.buildSendOptions ('auto'→always, 'plan'→ask,
      // 'bypass'→never). This is the bug fix: the choice now actually
      // reaches the engine instead of being ignored.
      const composerApproval: 'always' | 'ask' | 'never' =
        options.mode === 'auto' ? 'always' : options.mode === 'bypass' ? 'never' : 'ask';
      const unsandboxed = ctx.getFullAccess(); // composer sandbox badge (per-send)
      const permissionMode = approvalToPermissionMode(composerApproval, unsandboxed);

      const agentConfig = {
        // Resolve the engine-facing provider id. Cloud providers connected via an
        // env var / API key keep their real id. Everything else (type 'custom')
        // normally collapses to the generic 'custom' provider, which the engine
        // routes through the OpenAI-compatible Chat Completions wire protocol
        // (POST <baseUrl>/chat/completions).
        //
        // Ollama is registered as a type:'custom' connection but does NOT speak
        // that protocol — its native endpoint is <baseUrl>/api/chat. Collapsing it
        // to 'custom' made the engine POST to http://localhost:11434/chat/completions,
        // which Ollama's server rejects with the plaintext "404 page not found".
        // Preserve the real id for these non-OpenAI-compatible local providers so
        // the engine dispatches them through the Ollama family instead.
        provider: AgentService.resolveEngineProviderId(activeProvider),
        apiKey: activeProvider.apiKey,
        baseUrl: activeProvider.baseUrl || undefined,
        model: resolvedModel,
        projectRoot: resolvedProjectRoot,
        allowedCommands: activeProjectConfig?.allowedCommands,
        // ── Sandbox wiring ── the desktop engine routes every command
        // and file write through a SandboxRunner driven by these. The
        // composer approval dropdown + sandbox badge (per-send overrides)
        // and the per-Project / per-Chat "Sandbox & Internet" settings
        // (persisted defaults) are resolved into the values below.
        unsandboxedActions: unsandboxed,
        permissionMode,
        attachments: allAttachmentPaths.length > 0 ? allAttachmentPaths : undefined,
        // Per-run internet level. The resolver already walked
        // Chat → Project → Global, so this honors the most-specific scope
        // that set a concrete value (config.internetAccess then governs
        // web_fetch inside the engine).
        internetAccess: resolvedScope.internet
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

  /**
   * Regenerates the agent's response for an EXISTING prompt (no new user step is
   * added). The fresh response is streamed as an additional response alternative
   * tagged with `metadata.regenerationSeq = responseSeq`, so the canvas can keep
   * a per-prompt history and let the user navigate it with arrows + an x/n
   * counter. This is the engine used by the "Regenerate" button under a reply.
   */
  static async regenerate(
    ctx: AppContext,
    chatId: string,
    prompt: string,
    options: ComposerOptions,
    responseSeq: number
  ): Promise<void> {
    const chat = ctx.getChats().find((c) => c.id === chatId);
    if (!chat) return;
    const projectScope = chat.project || ctx.getActiveProject();
    const runStartedAt = Date.now();

    // Use THIS chat's own streaming-ref bundle so concurrent regenerations /
    // runs stream independently.
    const streaming = runManager.getStreamRefs(chatId);
    streaming.chatIdRef.current = chatId;
    streaming.bufferRef.current = '';
    streaming.stepIdRef.current = null;
    streaming.responseSeqRef.current = responseSeq;

    ctx.setActiveChatId(chatId);
    ctx.setActiveProject(projectScope);
    ctx.setIsGenerating(true);

    const activeProvider = AgentService.resolveActiveProvider(options, ctx.getConnectedProviders(), ctx.getModelsCatalog());
    const isOrchestrator = options.model === 'Orchestrator' || options.model === 'Model Governance' || options.model === 'auto';
    const isLocalOrCustom = activeProvider && (activeProvider.id === 'ollama' || activeProvider.id === 'omniroute' || activeProvider.id === 'custom' || activeProvider.baseUrl);
    const hasRealCredentials = Boolean(activeProvider?.apiKey) || isOrchestrator || isLocalOrCustom;

    if (hasRealCredentials && activeProvider && ctx.ipc) {
      const allAttachmentPaths = AgentService.collectAttachmentPaths(chat.steps, []);
      const activeProjectConfig = ctx.getProjects().find((p) => p.name === projectScope);
      const resolvedProjectRoot = activeProjectConfig?.folders?.[0] || undefined;
      const sessionId = chatId;
      const selectedModelName = options.model || '';
      const resolvedModel = AgentService.resolveModelId(activeProvider, selectedModelName, ctx.getModelsCatalog());

      const activeChat = ctx.getChats().find((c) => c.id === chatId);
      const resolvedScope = resolveScopeSettings({
        chat: activeChat ?? null,
        project: activeProjectConfig ?? null,
        globalUnsandboxed: ctx.getFullAccess(),
        globalInternet: ctx.getInternetAccessLevel()
      });
      const composerApproval: 'always' | 'ask' | 'never' =
        options.mode === 'auto' ? 'always' : options.mode === 'bypass' ? 'never' : 'ask';
      const unsandboxed = ctx.getFullAccess();
      const permissionMode = approvalToPermissionMode(composerApproval, unsandboxed);

      const agentConfig = {
        provider: AgentService.resolveEngineProviderId(activeProvider),
        apiKey: activeProvider.apiKey,
        baseUrl: activeProvider.baseUrl || undefined,
        model: resolvedModel,
        projectRoot: resolvedProjectRoot,
        allowedCommands: activeProjectConfig?.allowedCommands,
        unsandboxedActions: unsandboxed,
        permissionMode,
        attachments: allAttachmentPaths.length > 0 ? allAttachmentPaths : undefined,
        internetAccess: resolvedScope.internet
      };

      AgentService.runRealAgent(ctx, {
        sessionId,
        prompt,
        chatId,
        config: agentConfig,
        currentAttachments: [],
        runStartedAt
      });
    } else {
      const thoughtStep = StepFactory.thoughtStep(
        `Regenerating response for: "${prompt.slice(0, 40)}..."`
      );
      thoughtStep.metadata = { ...thoughtStep.metadata, regenerationSeq: responseSeq };
      ctx.setTrajectorySteps((prev) => [...prev, thoughtStep]);
      ctx.setChats((prev) => {
        const next = prev.map((c) =>
          c.id === chatId ? { ...c, steps: [...c.steps, thoughtStep], isRunning: true, startedAt: runStartedAt } : c
        );
        ctx.persistStore(ctx.getConnectedProviders(), ctx.getModelsCatalog(), ctx.getProjects(), next);
        return next;
      });

      AgentSimulator.run(
        ctx,
        prompt,
        chatId,
        [...chat.steps, thoughtStep],
        projectScope,
        options.model || '',
        [],
        runStartedAt,
        responseSeq
      );
    }
  }
}
