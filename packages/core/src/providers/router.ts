import {
  CompletionRequest,
  CompletionResponse,
  BYOKConfig,
  AIProvider,
  BaseProviderAdapter
} from '../types/agent.js';
import { BYOKProviderManager } from './byok.js';
import { createProviderAdapter } from './models.js';
import { SettingsStorage } from '../storage/settings-store.js';
import { ModelGovStorage } from '../storage/model-gov.js';

/** Options for the model router. */
export interface RouterOptions {
  preferredProvider?: AIProvider;
  fallbackOrder?: AIProvider[];
}

/** Routes completion requests to the best available provider with fallback and task-based model selection. */
export class ModelRouter {
  private preferredProvider?: AIProvider;
  private fallbackOrder: AIProvider[];

  constructor(options?: RouterOptions) {
    this.preferredProvider = options?.preferredProvider;
    this.fallbackOrder = options?.fallbackOrder || ['openai', 'anthropic', 'gemini', 'deepseek', 'custom'];
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
    overrideProvider?: AIProvider
  ): Promise<CompletionResponse> {
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

    const errors: string[] = [];

    for (const config of sortedConfigs) {
      try {
        const adapter: BaseProviderAdapter = createProviderAdapter(config);
        const response = await adapter.complete(request);
        return response;
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        errors.push(`[${config.provider}]: ${message}`);
      }
    }

    throw new Error(`All provider fallbacks failed:\n${errors.join('\n')}`);
  }

  /**
   * Strips the canonical `${providerId}-` prefix from a catalog model id to
   * recover the provider-native model id. Strips repeatedly so a malformed
   * double-prefixed id (e.g. `nvidia-nvidia/llama-3.1-...`) still resolves to
   * the correct native id instead of leaking a stray prefix to the API.
   */
  private static stripProviderPrefix(providerId: string, id: string): string {
    const prefix = `${providerId}-`;
    let out = id;
    while (out.startsWith(prefix)) {
      out = out.substring(prefix.length);
    }
    return out;
  }

  public static routeModelForTask(
    prompt: string,
    allModels: RouterModel[]
  ): { provider: string; model: string } | null {
    if (allModels.length === 0) {
      throw new Error(
        'No models are configured or enabled. Add a provider and enable at least one model in Model Governance, or pick a model manually.'
      );
    }
    const prepared = ModelRouter.prepareRouting(prompt, allModels);
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
   */
  public static selectCandidateModels(
    prompt: string,
    allModels: RouterModel[],
    count: number = 2
  ): Array<{ provider: string; model: string }> {
    if (allModels.length === 0) return [];
    const prepared = ModelRouter.prepareRouting(prompt, allModels);
    if (prepared.override) return [prepared.override];
    const ranked = ModelRouter.rankModels(
      prepared.flags,
      ModelRouter.resolveCandidatePool(prepared.flags, prepared.enabledModels)
    );
    const n = Math.max(1, Math.min(count, ranked.length));
    return ranked.slice(0, n).map((c) => ({
      provider: c.model.providerId,
      model: ModelRouter.stripProviderPrefix(c.model.providerId, c.model.id)
    }));
  }

  /** Classifies a (lowercased) prompt into the task categories the router scores. */
  private static classifyTask(lowerPrompt: string): { isCoding: boolean; isReasoning: boolean; isVision: boolean } {
    const isCoding = /\b(code|write|refactor|debug|compile|build|test|regex|script|function|class|json|html|css|javascript|typescript|python|c\+\+|java)\b/.test(lowerPrompt);
    const isReasoning = /\b(analyze|solve|logic|math|proof|algorithm|complexity|optimize|reason|think|deduce|plan)\b/.test(lowerPrompt);
    const isVision = /\b(image|picture|photo|video|frame|canvas|screenshot|png|jpg|jpeg|svg|draw)\b/.test(lowerPrompt);
    return { isCoding, isReasoning, isVision };
  }

  /**
   * Resolves the enabled model pool (the user's Model Gov selection, or all
   * models when none are enabled) and applies the capability gate: when the task
   * needs a modality some models actually support, restrict to those so a
   * non-capable model can never win a vision/tool task. Falls back to the full
   * pool when no capable model is present so routing still returns something.
   */
  private static resolveCandidatePool(
    flags: { isCoding: boolean; isReasoning: boolean; isVision: boolean },
    enabledModels: RouterModel[]
  ): RouterModel[] {
    const capable = enabledModels.filter((m) =>
      (flags.isVision && m.supportsVision) ||
      ((flags.isCoding || flags.isReasoning) && m.supportsTools)
    );
    return capable.length > 0 ? capable : enabledModels;
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

      let finalScore = 0;
      if (optimization === 'quality') finalScore = taskScoreAdj;
      else if (optimization === 'cost') finalScore = scores.costEfficiency * capabilityMultiplier;
      else finalScore = (taskScoreAdj * 0.7) + (scores.costEfficiency * 0.3); // balanced

      return { model: m, finalScore };
    });
    candidates.sort((a, b) => b.finalScore - a.finalScore);
    return candidates;
  }

  /** Shared pool + override resolution used by both routeModelForTask and
   *  selectCandidateModels so single-model and multi-model routing agree. */
  private static prepareRouting(
    prompt: string,
    allModels: RouterModel[]
  ): { enabledModels: RouterModel[]; flags: { isCoding: boolean; isReasoning: boolean; isVision: boolean }; override: { provider: string; model: string } | null } {
    const settings = SettingsStorage.loadSettings();
    const govEnabledIds = settings.modelGov?.enabledModels || [];
    const govOverrides = settings.modelGov?.categoryOverrides || {};

    const pool = allModels.filter((m) =>
      govEnabledIds.includes(m.id) ||
      govEnabledIds.includes(`${m.providerId}-${m.id}`)
    );
    const enabledModels = pool.length > 0 ? pool : allModels;

    const flags = ModelRouter.classifyTask(prompt.toLowerCase());

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
};
