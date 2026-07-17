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
import { BYOKProviderManager } from './byok.js';
import { createProviderAdapter } from './models.js';
import { SettingsStorage } from '../storage/settings-store.js';
import { ModelGovStorage } from '../storage/model-gov.js';
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

/** Options for the model router. */
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
 * provider was skipped or a request rerouted. This is the visibility half of
 * the health monitor: the router already reroutes silently; this makes that
 * audible.
 *
 * `reason` is one of:
 * - `'health-skip'`  — a provider was passed over because a healthier one was
 *   available (it will only be tried as a last resort if everything else fails).
 * - `'health-last-resort'` — every provider is unhealthy, so an unhealthy
 *   provider is being attempted anyway (no healthier option exists).
 * - `'error'` — an attempt against a provider failed; `to` names the next
 *   provider that will be tried, or is absent when this was the final attempt.
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
export class ModelRouter {
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
    // Difficulty-driven reasoning-effort cascade: escalate effort for
    // reasoning/coding tasks scaled by difficulty, but only when the caller
    // hasn't set an explicit effort (caller wins — never downgrade/override).
    const explicitEffort = reasoningEffort ?? this.reasoningEffort;
    const classification = classifyTask(request);
    const effort =
      explicitEffort ??
      (classification.isReasoning || classification.isCoding
        ? deriveReasoningEffortFromDifficulty(classification.difficulty)
        : undefined);
    const req: CompletionRequest =
      effort && !request.reasoningEffort ? { ...request, reasoningEffort: effort } : request;

    const allConfigs = byokManager.getAllConfigs();
    if (allConfigs.length === 0) {
      throw new Error('No provider configuration available for model router');
    }

    const targetProvider = overrideProvider || this.preferredProvider;
    const sortedConfigs: BYOKConfig[] = [];

    if (targetProvider) {
      const primary = allConfigs.find(c => c.provider === targetProvider);
      if (primary) {
        sortedConfigs.push(primary);
      }
    }

    // Add remaining configs according to fallback order or appearance
    for (const provider of this.fallbackOrder) {
      const cfg = allConfigs.find(c => c.provider === provider);
      if (cfg && !sortedConfigs.some(s => s.provider === cfg.provider)) {
        sortedConfigs.push(cfg);
      }
    }

    // Add any others
    for (const cfg of allConfigs) {
      if (!sortedConfigs.some(s => s.provider === cfg.provider)) {
        sortedConfigs.push(cfg);
      }
    }

    // Health-aware ordering (mission: resilience to a provider going down). Try
    // healthy providers first; demote rate-limited ones and, last, locked/
    // deprecated ones. We never *drop* a config purely on health — a fully
    // degraded set still falls through and fails fast with a clear error rather
    // than being silently skipped. The stable reorder preserves the user's
    // preferred order within each health tier.
    const ranked = sortedConfigs.map((c, i) => ({ c, i, r: ModelRouter.healthRank(c.provider) }));
    ranked.sort((a, b) => (a.r - b.r) || (a.i - b.i));
    const ordered = ranked.map((x) => x.c);
    const hasHealthy = ordered.some((c) => ModelRouter.healthRank(c.provider) === 0);

    const errors: string[] = [];

    // Surface resilience decisions up front: when a healthier provider exists,
    // every unhealthy provider is being *deprioritized* (it will only be tried
    // if all healthier ones fail). Emitting this before the loop means the user
    // sees the skip even when the down provider is never actually contacted.
    if (hasHealthy) {
      for (const config of ordered) {
        const status = providerHealth.getStatus(config.provider);
        if (status !== 'available') {
          onReroute?.({
            from: config.provider,
            reason: 'health-skip',
            status,
            detail: 'healthier provider available; will only be tried as last resort'
          });
        }
      }
    }

    for (let i = 0; i < ordered.length; i++) {
      const config = ordered[i];
      const status = providerHealth.getStatus(config.provider);
      // When NO provider is healthy, an unhealthy one is attempted as a genuine
      // last resort — note that explicitly (it differs from a routine skip).
      if (!hasHealthy && status !== 'available') {
        onReroute?.({
          from: config.provider,
          reason: 'health-last-resort',
          status,
          detail: 'no healthier provider available'
        });
      }
      try {
        const adapter: BaseProviderAdapter = createProviderAdapter(config);
        const response = await adapter.complete(req);
        providerHealth.recordSuccess(config.provider);
        return response;
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        errors.push(`[${config.provider}]: ${message}`);
        providerHealth.recordFailure(config.provider, err);
        const next = ordered[i + 1];
        onReroute?.({
          from: config.provider,
          to: next?.provider,
          reason: 'error',
          status: classifyProviderError(err),
          detail: message
        });
      }
    }

    throw new Error(`All provider fallbacks failed:\n${errors.join('\n')}`);
  }

  /**
   * Completes a request with automatic modality bridging (mission point #1:
   * don't let one model's input limitations block a task). If the request
   * carries an input modality (e.g. an image) the *target* model can't read, a
   * capable bridge model (vision/transcription) is inserted AHEAD of it to
   * transduce the input into text; the target then runs on the augmented,
   * text-only request. The handoff is reported via `onBridge` (and a console
   * note) so it is visible, never silent.
   *
   * When no bridge is needed — target already supports the modality, or no
   * capable bridge model exists in the pool — this degrades to
   * {@link completeWithFallback} on the raw request, so callers never branch.
   *
   * @param request    the completion request (may contain image_url blocks).
   * @param byokManager provider configs for the live adapters.
   * @param pool       the RouterModel catalog used for capability gating/planning.
   * @param options    overrideProvider forces the target; onBridge surfaces the plan.
   */
  public async completeWithBridge(
    request: CompletionRequest,
    byokManager: BYOKProviderManager,
    pool: RouterModel[],
    options?: {
      overrideProvider?: AIProvider;
      onBridge?: (plan: ModalityBridgePlan) => void;
      onReroute?: (e: RerouteEvent) => void;
    },
    reasoningEffort?: ReasoningEffort
  ): Promise<CompletionResponse> {
    // Difficulty-driven reasoning-effort cascade (see completeWithFallback):
    // escalate for reasoning/coding tasks by difficulty, never override an
    // explicit caller effort.
    const explicitEffort = reasoningEffort ?? this.reasoningEffort;
    const classification = classifyTask(request);
    const effort =
      explicitEffort ??
      (classification.isReasoning || classification.isCoding
        ? deriveReasoningEffortFromDifficulty(classification.difficulty)
        : undefined);
    const onReroute = options?.onReroute;
    const required = detectInputModalities(request);
    if (required.length === 0 || pool.length === 0) {
      return this.completeWithFallback(request, byokManager, options?.overrideProvider, effort, onReroute);
    }

    // Resolve the target model the final answer will come from.
    const fallback = { provider: pool[0].providerId, model: pool[0].id };
    let selection: { provider: string; model: string };
    if (options?.overrideProvider) {
      const forced = pool.find((m) => m.providerId === options.overrideProvider);
      selection = forced
        ? { provider: forced.providerId, model: forced.id }
        : (ModelRouter.routeModelForTask(lastUserText(request), pool) ?? fallback);
    } else {
      selection = ModelRouter.routeModelForTask(lastUserText(request), pool) ?? fallback;
    }
    const targetModel = findRouterModel(pool, selection.provider, selection.model) ?? pool[0];

    const plan = planModalityBridge({ requiredModalities: required, targetModel, pool });
    if (options?.onBridge) options.onBridge(plan);
    if (!plan.needsBridge || !plan.bridgeModel) {
      return this.completeWithFallback(request, byokManager, options?.overrideProvider, effort, onReroute);
    }

    // 1) Bridge call — the vision/transcription model reads the raw attachment.
    const bridgeConfig = byokManager.getKey(plan.bridgeModel.providerId);
    if (!bridgeConfig) {
      return this.completeWithFallback(request, byokManager, options?.overrideProvider, effort, onReroute);
    }
    const bridgeReq = withBridgeInstruction(request, bridgeInstruction(plan.bridgeType!));
    if (effort && !bridgeReq.reasoningEffort) bridgeReq.reasoningEffort = effort;
    const bridgeAdapter = createProviderAdapter(bridgeConfig);
    const bridgeResp = await bridgeAdapter.complete(bridgeReq);
    const bridgeText = bridgeResp.content ?? '';

    // 2) Target call — augmented, text-only request (attachments stripped).
    const targetReq = augmentRequestForBridge(
      request,
      bridgeText,
      plan.bridgeType === 'transcription' ? 'Transcript' : 'Image description'
    );
    if (effort && !targetReq.reasoningEffort) targetReq.reasoningEffort = effort;
    return this.completeWithFallback(targetReq, byokManager, options?.overrideProvider, effort, onReroute);
  }

  /**
   * Recovers the provider-native model id from a catalog model id.
   *
   * The desktop UI builds catalog ids as exactly one `${providerId}-${nativeId}`
   * prefix (see `enrichModel`), so we strip that single prefix and return the
   * native id the provider API expects. Stripping exactly ONE prefix matters:
   * several real providers' native ids themselves begin with the providerId
   * (e.g. Claude `claude-sonnet-4-5`, DeepSeek `deepseek-chat`). A repeat-strip
   * loop would corrupt those into `sonnet-4-5` / `chat`, so we stop after the
   * one canonical prefix.
   */
  /** Strips the `<providerId>-` prefix from a model id (e.g. `openai-gpt-4o` → `gpt-4o`). */
  static stripProviderPrefix(providerId: string, id: string): string {
    const prefix = `${providerId}-`;
    return id.startsWith(prefix) ? id.substring(prefix.length) : id;
  }

  /**
   * Health tier used to order fallback attempts: healthy first (0), rate-limited
   * next (1, cooldown-based), locked/deprecated last (2 — retrying is pointless
   * but we keep them as a last resort so a degraded set still fails clearly
   * rather than being silently dropped). Consults the shared ProviderHealthTracker.
   */
  private static healthRank(provider: string): number {
    const status = providerHealth.getStatus(provider);
    if (status === 'available') return 0;
    if (status === 'rate_limited') return 1;
    return 2; // locked | deprecated
  }

  public static routeModelForTask(
    prompt: string,
    allModels: RouterModel[],
    request?: CompletionRequest
  ): { provider: string; model: string } | null {
    if (allModels.length === 0) {
      throw new Error(
        'No models are configured or enabled. Add a provider and enable at least one model in Model Governance, or pick a model manually.'
      );
    }
    const prepared = ModelRouter.prepareRouting(prompt, allModels, request);
    if (prepared.override) return prepared.override;
    const ranked = ModelRouter.rankModels(
      prepared.flags,
      ModelRouter.resolveCandidatePool(prepared.flags, prepared.enabledModels)
    );
    if (ranked.length > 0) {
      const best = ranked[0].model;
      return { provider: best.providerId, model: ModelRouter.stripProviderPrefix(best.providerId, best.id) };
    }
    const firstEnabled = prepared.enabledModels[0];
    return { provider: firstEnabled.providerId, model: ModelRouter.stripProviderPrefix(firstEnabled.providerId, firstEnabled.id) };
  }

  /**
   * Returns the top-`count` capable models for a task, in ranked order. This is
   * the selection half of best-of-N / parallel-multi-model orchestration
   * (mission point 2): the GUI passes these N candidates to the engine, which
   * runs each and merges their outputs. It shares the EXACT pool / override /
   * capability-gating / scoring logic with routeModelForTask so single-model and
   * multi-model routing never diverge.
   *
   * The candidate breadth escalates for high-difficulty tasks (difficulty-driven
   * ensemble cascade): a hard task widens the parallel pool so the synthesis
   * step merges more independent perspectives (quality + bias-resistance), while
   * an explicit `count` is never reduced — only escalated upward when needed.
   */
  public static selectCandidateModels(
    prompt: string,
    allModels: RouterModel[],
    count: number = 2,
    request?: CompletionRequest
  ): Array<{ provider: string; model: string }> {
    if (allModels.length === 0) return [];
    const classification = classifyTask(request ?? { messages: [{ role: 'user', content: prompt }] });
    const effectiveCount = candidateCountForDifficulty(classification.difficulty, count);
    const prepared = ModelRouter.prepareRouting(prompt, allModels, request);
    if (prepared.override) return [prepared.override];
    const ranked = ModelRouter.rankModels(
      prepared.flags,
      ModelRouter.resolveCandidatePool(prepared.flags, prepared.enabledModels)
    );
    const n = Math.max(1, Math.min(effectiveCount, ranked.length));
    return ranked.slice(0, n).map((c) => ({
      provider: c.model.providerId,
      model: ModelRouter.stripProviderPrefix(c.model.providerId, c.model.id)
    }));
  }

  /**
   * Resolves the enabled model pool (the user's Model Gov selection, or all
   * models when none are enabled) and applies the capability gate: when the task
   * needs a modality some models actually support, restrict to those so a
   * non-capable model can never win a vision/tool task. Each active modality the
   * task requires must be satisfied — a mixed "vision + coding" task needs a
   * model that is BOTH vision-capable AND tool-capable, so a tool-only model
   * cannot be selected to do vision work.
   *
   * Availability pre-filter (mission: resilience to a provider going down): any
   * model whose `accessStatus` is `locked` / `rate_limited` / `deprecated` is
   * dropped before the capability gate, so a banned or throttled model is never
   * selected. The field defaults to `available` (when absent) so callers that
   * don't set it keep working. The pool is never emptied by this filter — if it
   * would remove everything, the full enabled pool is used instead, so routing
   * always returns a candidate rather than throwing.
   */
  private static resolveCandidatePool(
    flags: { isCoding: boolean; isReasoning: boolean; isVision: boolean },
    enabledModels: RouterModel[]
  ): RouterModel[] {
    const isAvailable = (m: RouterModel) =>
      m.accessStatus === undefined || m.accessStatus === 'available';
    const live = enabledModels.filter(isAvailable);
    const pool = live.length > 0 ? live : enabledModels;

    const needsVision = flags.isVision;
    const needsTools = flags.isCoding || flags.isReasoning;
    const capable = pool.filter(
      (m) => (!needsVision || m.supportsVision === true) && (!needsTools || m.supportsTools === true)
    );
    return capable.length > 0 ? capable : pool;
  }

  /**
   * Coarse tier → 0–100 score maps used to fold the extended registry signals
   * (speedTier / intelligenceTier) into `rankModels`. A model lacking a tier is
   * scored at the neutral midpoint (see `rankModels`) so it is neither rewarded
   * nor penalised relative to pre-tier routing.
   */
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

  /** Maps a USD-per-1k-tokens figure to a 0–100 cost score (free = 100, lower is better). */
  private static costFromDollars(costPer1k: number): number {
    if (costPer1k <= 0) return 100;
    return 100 / (1 + costPer1k);
  }

  /** Scores and sorts models for a task by capability, task-fit, and the user's
   *  optimization goal (quality / cost / balanced). Descending by finalScore. */
  private static rankModels(
    flags: { isCoding: boolean; isReasoning: boolean; isVision: boolean },
    pool: RouterModel[]
  ): Array<{ model: RouterModel; finalScore: number }> {
    const optimization = SettingsStorage.loadSettings().modelGov?.optimizationGoal || 'balanced';
    const candidates = pool.map((m) => {
      const scores = ModelGovStorage.getModelScores(m.id);
      let taskScore = 0;
      if (flags.isCoding) taskScore = scores.coding;
      else if (flags.isReasoning) taskScore = scores.reasoning;
      else if (flags.isVision) taskScore = scores.vision;
      else taskScore = (scores.coding + scores.reasoning) / 2; // general chat capability

      let capabilityMultiplier = 1.0;
      if (flags.isVision && m.supportsVision) capabilityMultiplier = 1.12;
      else if ((flags.isCoding || flags.isReasoning) && m.supportsTools) capabilityMultiplier = 1.1;
      const taskScoreAdj = taskScore * capabilityMultiplier;

      // Extended registry signals beyond the governance scores. Absent values
      // fall back to a neutral midpoint so models without tier metadata rank
      // exactly as before this change (backward-compatible).
      const intel = m.intelligenceTier ? ModelRouter.INTELLIGENCE_SCORE[m.intelligenceTier] : 60;
      const speed = m.speedTier ? ModelRouter.SPEED_SCORE[m.speedTier] : 70;
      const cost = m.costPer1kTokens != null ? ModelRouter.costFromDollars(m.costPer1kTokens) : scores.costEfficiency;

      let finalScore = 0;
      if (optimization === 'quality') {
        // Task fit dominates; the intelligence tier breaks ties among equally-fit models.
        finalScore = taskScoreAdj * 0.65 + intel * 0.35;
      } else if (optimization === 'cost') {
        finalScore = cost * capabilityMultiplier;
      } else {
        // Balanced: blend task fit, intelligence, latency (speed), and cost.
        finalScore = taskScoreAdj * 0.5 + intel * 0.2 + speed * 0.15 + cost * 0.15;
      } // balanced

      return { model: m, finalScore };
    });
    candidates.sort((a, b) => b.finalScore - a.finalScore);
    return candidates;
  }

  /** Shared pool + override resolution used by both routeModelForTask and
   *  selectCandidateModels so single-model and multi-model routing agree.
   *  When `request` is supplied, classification is modality-aware (real
   *  attachments set the vision/audio flags), improving single-pass routing for
   *  multimodal turns without disturbing the bridge path. */
  private static prepareRouting(
    prompt: string,
    allModels: RouterModel[],
    request?: CompletionRequest
  ): { enabledModels: RouterModel[]; flags: { isCoding: boolean; isReasoning: boolean; isVision: boolean }; override: { provider: string; model: string } | null } {
    const settings = SettingsStorage.loadSettings();
    const govEnabledIds = settings.modelGov?.enabledModels || [];
    const govOverrides = settings.modelGov?.categoryOverrides || {};

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
      if (found) override = { provider: found.providerId, model: ModelRouter.stripProviderPrefix(found.providerId, found.id) };
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
  /** Live availability; see AccessStatus. Defaults to `available` when absent. */
  accessStatus?: 'available' | 'locked' | 'rate_limited' | 'deprecated';
  // ── Extended registry signals used by rankModels scoring (all optional;
  //    absent values fall back to a neutral midpoint so models without tier
  //    metadata rank exactly as before — backward-compatible) ────────────────
  /** Coarse latency tier. */
  speedTier?: SpeedTier;
  /** Coarse capability tier. */
  intelligenceTier?: IntelligenceTier;
  /** Approximate blended cost in USD per 1k tokens (input+output), if known. */
  costPer1kTokens?: number;
};
