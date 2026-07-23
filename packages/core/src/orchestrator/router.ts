import {
  CompletionRequest,
  CompletionResponse,
  BYOKConfig,
  AIProvider,
  BaseProviderAdapter,
  ReasoningEffort,
  SpeedTier,
  IntelligenceTier
} from '../types/agent.js';
import { classifyTask } from './task-classifier.js';
import { BYOKProviderManager } from '../providers/byok.js';
import { createProviderAdapter } from '../providers/models.js';
import { SettingsStorage, type ProviderSettings } from '../storage/settings-store.js';
import { OrchestratorStorage } from './storage.js';
import { providerHealth, classifyProviderError } from './provider-health.js';
import { deriveReasoningEffortFromDifficulty, candidateCountForDifficulty } from './reasoning-effort.js';
import {
  detectInputModalities,
  planModalityBridge,
  bridgeInstruction,
  withBridgeInstruction,
  augmentRequestForBridge,
  lastUserText,
  findRouterModel,
  type ModalityBridgePlan
} from './modality-bridge.js';

/**
 * Returns true when a model is free to use (no per-token cost). Desktop/web only
 * have `settings.models` (ModelSettings) at runtime — not the renderer catalog's
 * `free` flag — so free-ness is derived from pricing: a model is free when both
 * its input and output per-1M rates are zero/absent, OR when it is a local
 * provider (ollama/custom) which never bills per token. This mirrors the catalog
 * `m.free` heuristic the Orchestrator Settings UI uses, so the desktop "Free
 * Only" toggle and the runtime pool agree.
 */
export function isFreeModel(m: {
  providerId?: string;
  pricing?: { inputPer1M?: string; outputPer1M?: string };
  free?: boolean;
}): boolean {
  if (m.free === true) return true;
  const provider = (m.providerId || '').toLowerCase();
  if (provider === 'ollama' || provider === 'omniroute' || provider === 'custom') return true;
  const rate = (v?: string): number => {
    if (v == null) return 0;
    const n = parseFloat(String(v).replace(/[^0-9.]/g, ''));
    return Number.isFinite(n) ? n : 0;
  };
  const input = rate(m.pricing?.inputPer1M);
  const output = rate(m.pricing?.outputPer1M);
  return input === 0 && output === 0;
}

/** Options for the Orchestrator router. */
export interface RouterOptions {
  preferredProvider?: AIProvider;
  fallbackOrder?: AIProvider[];
  /** Default reasoning effort applied to every request unless the caller sets
   *  its own `request.reasoningEffort` (caller preference wins). */
  reasoningEffort?: ReasoningEffort;
  /** Observability hook: fired whenever the router avoids, demotes, or fails
   *  over a provider (mission: make the "can't be banned out from under you"
   *  resilience *visible* rather than silent). See {@link RerouteEvent}. */
  onReroute?: (e: RerouteEvent) => void;
}

/**
 * A structured record of one resilience decision the router made — emitted via
 * `RouterOptions.onReroute` so the engine/GUI can show the user *why* a
 * provider was skipped or a request rerouted.
 */
export interface RerouteEvent {
  from: string;
  to?: string;
  reason: 'health-skip' | 'health-last-resort' | 'error';
  /** Live access status of `from` at decision time (when health-driven). */
  status?: 'available' | 'locked' | 'rate_limited' | 'deprecated';
  detail?: string;
}

/** Routes completion requests to the best available provider with fallback and task-based model selection. */
export class OrchestratorRouter {
  private preferredProvider?: AIProvider;
  private fallbackOrder: AIProvider[];
  private reasoningEffort?: ReasoningEffort;

  constructor(options?: RouterOptions) {
    this.preferredProvider = options?.preferredProvider;
    this.fallbackOrder = options?.fallbackOrder || ['openai', 'anthropic', 'gemini', 'deepseek', 'custom'];
    this.reasoningEffort = options?.reasoningEffort;
  }

  public selectDefaultModel(byokManager: BYOKProviderManager): BYOKConfig {
    if (this.preferredProvider) {
      const config = byokManager.getKey(this.preferredProvider);
      if (config) return config;
    }
    return byokManager.getActiveConfig();
  }

  public async completeWithFallback(
    request: CompletionRequest,
    byokManager: BYOKProviderManager,
    overrideProvider?: AIProvider,
    reasoningEffort?: ReasoningEffort,
    onReroute?: (e: RerouteEvent) => void
  ): Promise<CompletionResponse> {
    const explicitEffort = reasoningEffort ?? this.reasoningEffort;
    const classification = classifyTask(request);
    const effort =
      explicitEffort ??
      (classification.isReasoning || classification.isCoding
        ? deriveReasoningEffortFromDifficulty(classification.difficulty)
        : undefined);

    const providerOrder = [
      ...(overrideProvider ? [overrideProvider] : this.preferredProvider ? [this.preferredProvider] : []),
      ...this.fallbackOrder
    ].filter((v, i, self) => self.indexOf(v) === i);

    const healthyOrder = providerOrder;

    let lastError: Error | null = null;

    for (let i = 0; i < healthyOrder.length; i++) {
      const provider = healthyOrder[i];
      const nextProvider = healthyOrder[i + 1];

      const config = byokManager.getKey(provider);
      if (!config) continue;

      const rank = OrchestratorRouter.healthRank(provider);
      // A healthy fallback is only a reason to skip an unhealthy provider if it
      // is actually configured. (Otherwise a lone rate-limited provider would be
      // skipped in favour of unconfigured "healthy" defaults and never recover.)
      const hasHealthyConfiguredLater = providerOrder
        .slice(i + 1)
        .some((p) => byokManager.getKey(p) && OrchestratorRouter.healthRank(p) === 0);
      if (rank > 0 && hasHealthyConfiguredLater) {
        onReroute?.({
          from: provider,
          to: nextProvider,
          reason: 'health-skip',
          status: providerHealth.getStatus(provider)
        });
        continue;
      }
      if (rank > 0) {
        onReroute?.({
          from: provider,
          reason: 'health-last-resort',
          status: providerHealth.getStatus(provider)
        });
      }

      try {
        const adapter = createProviderAdapter(config);
        const req = { ...request, reasoningEffort: effort };
        const res = await adapter.complete(req);

        providerHealth.recordSuccess(provider);
        return res;
      } catch (err: any) {
        lastError = err;
        const errType = classifyProviderError(err);
        providerHealth.recordFailure(provider, errType);

        onReroute?.({
          from: provider,
          to: nextProvider,
          reason: 'error',
          status: providerHealth.getStatus(provider),
          detail: err.message || String(err)
        });
      }
    }

    throw new Error(
      `All provider fallbacks failed: ${lastError ? lastError.message : 'no configured providers succeeded or were available.'}`
    );
  }

  /**
   * Orchestrated completion using the modality bridge.
   */
  public async completeWithBridge(
    request: CompletionRequest,
    byokManager: BYOKProviderManager,
    pool: RouterModel[],
    options?: {
      overrideProvider?: AIProvider;
      reasoningEffort?: ReasoningEffort;
      onBridge?: (plan: ModalityBridgePlan) => void;
      onReroute?: (e: RerouteEvent) => void;
    }
  ): Promise<CompletionResponse> {
    const text = lastUserText(request);
    const needed = detectInputModalities(request);

    const routed = OrchestratorRouter.routeModelForTask(text, pool, request);
    const finalTarget =
      options?.overrideProvider ??
      this.preferredProvider ??
      (routed?.provider as AIProvider | undefined);

    const targetModel = findRouterModel(pool, finalTarget ?? '', routed?.model ?? '');
    const plan: ModalityBridgePlan = targetModel
      ? planModalityBridge({ requiredModalities: needed, targetModel, pool })
      : { needsBridge: false, bridgeType: null, reason: 'No target model resolved; skipping modality bridge.' };
    options?.onBridge?.(plan);

    let activeRequest = request;
    if (plan.needsBridge && plan.bridgeModel) {
      const helperConfig = byokManager.getKey(plan.bridgeModel.providerId);
      if (helperConfig) {
        try {
          const helperAdapter = createProviderAdapter(helperConfig);
          const inst = bridgeInstruction(plan.bridgeType ?? 'vision');
          const helperRequest = {
            ...withBridgeInstruction(request, inst),
            reasoningEffort: options?.reasoningEffort
          };
          const helperResponse = await helperAdapter.complete(helperRequest);

          activeRequest = augmentRequestForBridge(request, helperResponse.content, plan.bridgeType ?? 'bridge');
        } catch (bridgeErr: any) {
          console.warn(
            `[Orchestrator] Modality bridge failed (${bridgeErr?.message || String(bridgeErr)}). Falling back to direct target call.`
          );
        }
      }
    }

    return this.completeWithFallback(
      activeRequest,
      byokManager,
      finalTarget,
      options?.reasoningEffort,
      options?.onReroute
    );
  }

  /**
   * Tool-free, free-aware completion used for lightweight orchestration tasks
   * (e.g. AI-optimizing the Orchestrator's own system instructions). Unlike the
   * agentic `AgentEngine`, this sends NO tools, so:
   *   - it is far cheaper/faster (no 20+ tool schemas in the payload), and
   *   - it sidesteps provider-specific schema quirks (Gemini rejects
   *     `additionalProperties`, which the agentic path otherwise trips on).
   *
   * It builds a `BYOKProviderManager` from only the providers that own a model
   * in `pool` (so a `freeOnly`/`enabled` filtered pool keeps the call within
   * that scope), routes the request to the best pool model via
   * {@link routeModelForTask}, then runs it through the health-aware
   * {@link completeWithFallback} so a rate-limited/failing free provider is
   * automatically skipped in favour of the next healthy one.
   *
   * @throws a clear, actionable error (not an opaque "no provider" message) when
   *         the pool is empty or no configured provider has an API key.
   */
  public async completeWithFreePool(
    request: CompletionRequest,
    pool: RouterModel[],
    providers: ProviderSettings[]
  ): Promise<CompletionResponse> {
    if (!pool || pool.length === 0) {
      throw new Error(
        'No enabled/free models are configured for the Orchestrator. Enable at least one model in Settings → Orchestrator (or turn off Free Only mode).'
      );
    }

    const byok = new BYOKProviderManager();
    const providerIds = Array.from(new Set(pool.map((m) => m.providerId)));
    let registered = 0;
    for (const pid of providerIds) {
      const p = providers.find((x) => x.id === pid && x.apiKey);
      if (!p) continue;
      // Use the first model in the (enabled/free) pool for this provider as its
      // default; completeWithFallback will prefer the overall best-routed
      // provider first and fall back to the others by their own model.
      const best = pool.find((m) => m.providerId === pid);
      if (!best) continue;
      const modelId = OrchestratorRouter.stripProviderPrefix(pid, best.id);
      byok.registerKey({ provider: pid as AIProvider, apiKey: p.apiKey, baseUrl: p.baseUrl, modelName: modelId });
      registered++;
    }

    if (registered === 0) {
      throw new Error(
        'No API key is configured for any enabled/free provider. Add a provider key in Settings → Providers, then retry (or use Test Connections to verify).'
      );
    }

    const routed = OrchestratorRouter.routeModelForTask(lastUserText(request), pool, request);
    const preferredProvider = (routed?.provider as AIProvider) || undefined;
    return this.completeWithFallback(request, byok, preferredProvider);
  }

  static stripProviderPrefix(providerId: string, id: string): string {
    const prefix = `${providerId}-`;
    return id.startsWith(prefix) ? id.substring(prefix.length) : id;
  }

  private static healthRank(provider: string): number {
    const status = providerHealth.getStatus(provider);
    if (status === 'available') return 0;
    if (status === 'rate_limited') return 1;
    return 2; // locked | deprecated
  }  private static verifyPool(allModels: RouterModel[]): void {
    if (allModels.length === 0) {
      throw new Error(
        'No models are enabled for the Orchestrator. Please open Settings → Orchestrator and enable at least one model in the Model Pool, or select a model manually.'
      );
    }

    const hasTextInput = allModels.some(m => !m.inputModalities || m.inputModalities.includes('text'));
    const hasImageInput = allModels.some(m => m.supportsVision || (m.inputModalities && m.inputModalities.includes('image')));
    const hasVideoInput = allModels.some(m => m.inputModalities && m.inputModalities.includes('video'));
    const hasAudioInput = allModels.some(m => m.inputModalities && m.inputModalities.includes('audio'));

    const hasTextOutput = allModels.some(m => !m.outputModalities || m.outputModalities.includes('text'));
    const hasImageOutput = allModels.some(m => m.outputModalities && m.outputModalities.includes('image'));
    const hasAudioOutput = allModels.some(m => m.outputModalities && m.outputModalities.includes('audio'));

    if (!hasTextInput) {
      console.warn('[Orchestrator] Warning: No enabled model supports text input.');
    }
    if (!hasImageInput) {
      console.warn('[Orchestrator] Warning: No enabled model supports image input (vision).');
    }
    if (!hasVideoInput) {
      console.warn('[Orchestrator] Warning: No enabled model supports video input.');
    }
    if (!hasAudioInput) {
      console.warn('[Orchestrator] Warning: No enabled model supports audio input.');
    }

    if (!hasTextOutput) {
      console.warn('[Orchestrator] Warning: No enabled model supports text output.');
    }
    if (!hasImageOutput) {
      console.warn('[Orchestrator] Warning: No enabled model supports image output.');
    }
    if (!hasAudioOutput) {
      console.warn('[Orchestrator] Warning: No enabled model supports audio output.');
    }
  }

  public static routeModelForTask(
    prompt: string,
    allModels: RouterModel[],
    request?: CompletionRequest
  ): { provider: string; model: string } | null {
    OrchestratorRouter.verifyPool(allModels);

    const prepared = OrchestratorRouter.prepareRouting(prompt, allModels, request);
    if (prepared.override) return prepared.override;
    const ranked = OrchestratorRouter.rankModels(
      prepared.flags,
      OrchestratorRouter.resolveCandidatePool(prepared.flags, prepared.enabledModels)
    );
    if (ranked.length > 0) {
      const best = ranked[0].model;
      return { provider: best.providerId, model: OrchestratorRouter.stripProviderPrefix(best.providerId, best.id) };
    }
    const firstEnabled = prepared.enabledModels[0];
    return { provider: firstEnabled.providerId, model: OrchestratorRouter.stripProviderPrefix(firstEnabled.providerId, firstEnabled.id) };
  }

  public static selectCandidateModels(
    prompt: string,
    allModels: RouterModel[],
    count: number = 2,
    request?: CompletionRequest
  ): Array<{ provider: string; model: string }> {
    OrchestratorRouter.verifyPool(allModels);
    const classification = classifyTask(request ?? { messages: [{ role: 'user', content: prompt }] });
    const effectiveCount = candidateCountForDifficulty(classification.difficulty, count);
    const prepared = OrchestratorRouter.prepareRouting(prompt, allModels, request);
    if (prepared.override) return [prepared.override];
    const ranked = OrchestratorRouter.rankModels(
      prepared.flags,
      OrchestratorRouter.resolveCandidatePool(prepared.flags, prepared.enabledModels)
    );
    const n = Math.max(1, Math.min(effectiveCount, ranked.length));
    return ranked.slice(0, n).map((c) => ({
      provider: c.model.providerId,
      model: OrchestratorRouter.stripProviderPrefix(c.model.providerId, c.model.id)
    }));
  }

  private static resolveCandidatePool(
    flags: { isCoding: boolean; isReasoning: boolean; isVision: boolean },
    enabledModels: RouterModel[]
  ): RouterModel[] {
    // Availability pre-filter. A model is selectable only when BOTH its static
    // catalog `accessStatus` AND the runtime `providerHealth` view agree it is
    // usable. Historically the fallback loop consulted live health but the
    // *selection* layer only read the static flag (the catalog stamp was
    // "opt-in" via `applyHealthToModels`), so a provider that got rate-limited
    // or banned *after* the pool was built could still be selected as best and
    // only fail at call time. Selecting the live view directly makes the
    // "can't be banned out from under you" guarantee hold at selection time too.
    // `applyHealthToModels` remains available for batch UI stamping but is no
    // longer required for selection to respect runtime health.
    const isAvailable = (m: RouterModel) =>
      (m.accessStatus === undefined || m.accessStatus === 'available') &&
      providerHealth.getStatus(m.providerId) === 'available';
    const live = enabledModels.filter(isAvailable);
    const pool = live.length > 0 ? live : enabledModels;

    const needsVision = flags.isVision;
    const needsTools = flags.isCoding || flags.isReasoning;
    const capable = pool.filter(
      (m) => (!needsVision || m.supportsVision === true) && (!needsTools || m.supportsTools === true)
    );
    return capable.length > 0 ? capable : pool;
  }

  private static readonly INTELLIGENCE_SCORE: Record<IntelligenceTier, number> = {
    low: 30,
    mid: 60,
    high: 85,
    frontier: 100
  };
  private static readonly SPEED_SCORE: Record<SpeedTier, number> = {
    fast: 100,
    balanced: 70,
    slow: 40
  };

  private static costFromDollars(costPer1k: number): number {
    if (costPer1k <= 0) return 100;
    return 100 / (1 + costPer1k);
  }

  private static rankModels(
    flags: { isCoding: boolean; isReasoning: boolean; isVision: boolean },
    pool: RouterModel[]
  ): Array<{ model: RouterModel; finalScore: number }> {
    const settings = SettingsStorage.loadSettings();
    const orchestratorSettings = settings.orchestrator || settings.modelGov;
    const optimization = orchestratorSettings?.optimizationGoal || 'balanced';
    const candidates = pool.map((m) => {
      const scores = OrchestratorStorage.getModelScores(m.id);
      let taskScore = 0;
      if (flags.isCoding) taskScore = scores.coding;
      else if (flags.isReasoning) taskScore = scores.reasoning;
      else if (flags.isVision) taskScore = scores.vision;
      else taskScore = (scores.coding + scores.reasoning) / 2;

      let capabilityMultiplier = 1.0;
      if (flags.isVision && m.supportsVision) capabilityMultiplier = 1.12;
      else if ((flags.isCoding || flags.isReasoning) && m.supportsTools) capabilityMultiplier = 1.1;
      const taskScoreAdj = taskScore * capabilityMultiplier;

      const intel = m.intelligenceTier ? OrchestratorRouter.INTELLIGENCE_SCORE[m.intelligenceTier] : 60;
      const speed = m.speedTier ? OrchestratorRouter.SPEED_SCORE[m.speedTier] : 70;
      const cost = m.costPer1kTokens != null ? OrchestratorRouter.costFromDollars(m.costPer1kTokens) : scores.costEfficiency;

      let finalScore = 0;
      if (optimization === 'quality') {
        finalScore = taskScoreAdj * 0.65 + intel * 0.35;
      } else if (optimization === 'cost') {
        finalScore = cost * capabilityMultiplier;
      } else {
        finalScore = taskScoreAdj * 0.5 + intel * 0.2 + speed * 0.15 + cost * 0.15;
      }

      return { model: m, finalScore };
    });
    candidates.sort((a, b) => b.finalScore - a.finalScore);
    return candidates;
  }

  private static prepareRouting(
    prompt: string,
    allModels: RouterModel[],
    request?: CompletionRequest
  ): { enabledModels: RouterModel[]; flags: { isCoding: boolean; isReasoning: boolean; isVision: boolean }; override: { provider: string; model: string } | null } {
    const settings = SettingsStorage.loadSettings();
    const orchestratorSettings = settings.orchestrator || settings.modelGov;
    const govEnabledIds = orchestratorSettings?.enabledModels || [];
    const govOverrides = orchestratorSettings?.categoryOverrides || {};

    const pool = allModels.filter((m) =>
      govEnabledIds.includes(m.id) ||
      govEnabledIds.includes(`${m.providerId}-${m.id}`)
    );
    const enabledModels = pool.length > 0 ? pool : allModels;

    const classification = classifyTask(request ?? { messages: [{ role: 'user', content: prompt }] });
    const flags = {
      isCoding: classification.isCoding,
      isReasoning: classification.isReasoning,
      isVision: classification.isVision
    };

    let overrideId = '';
    if (flags.isCoding && govOverrides.coding) overrideId = govOverrides.coding;
    else if (flags.isReasoning && govOverrides.reasoning) overrideId = govOverrides.reasoning;
    else if (flags.isVision && govOverrides.vision) overrideId = govOverrides.vision;
    else if (!flags.isCoding && !flags.isReasoning && !flags.isVision && govOverrides.conversations) overrideId = govOverrides.conversations;

    let override: { provider: string; model: string } | null = null;
    if (overrideId) {
      const found = allModels.find((m) => m.id === overrideId || `${m.providerId}-${m.id}` === overrideId);
      if (found) override = { provider: found.providerId, model: OrchestratorRouter.stripProviderPrefix(found.providerId, found.id) };
    }
    return { enabledModels, flags, override };
  }
}

/** Catalog model shape the router accepts (the GUI passes its settings.models). */
export type RouterModel = {
  id: string;
  name: string;
  providerId: string;
  enabled: boolean;
  supportsVision?: boolean;
  supportsTools?: boolean;
  /** Input modalities this model can ingest (extends the supportsVision boolean). */
  inputModalities?: ('text' | 'image' | 'video' | 'audio' | '3d')[];
  /** Output modalities this model can generate. */
  outputModalities?: ('text' | 'image' | 'audio')[];
  /** Live availability; see AccessStatus. Defaults to `available` when absent. */
  accessStatus?: 'available' | 'locked' | 'rate_limited' | 'deprecated';
  // ── Extended registry signals used by rankModels scoring
  speedTier?: SpeedTier;
  intelligenceTier?: IntelligenceTier;
  costPer1kTokens?: number;
};
