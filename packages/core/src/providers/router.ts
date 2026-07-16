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
    allModels: Array<{ id: string; name: string; providerId: string; enabled: boolean }>
  ): { provider: string; model: string } | null {
    if (allModels.length === 0) return null;

    // Load custom Model Gov pool
    const settings = SettingsStorage.loadSettings();
    const govEnabledIds = settings.modelGov?.enabledModels || [];
    const govOverrides = settings.modelGov?.categoryOverrides || {};
    
    // Filter models by the dynamic pool selected by the user in settings
    const pool = allModels.filter(m => 
      govEnabledIds.includes(m.id) || 
      govEnabledIds.includes(`${m.providerId}-${m.id}`)
    );
    const enabledModels = pool.length > 0 ? pool : allModels;

    const lowerPrompt = prompt.toLowerCase();
    const inst = ModelGovStorage.loadInstructions().toLowerCase();

    // 1. Analyze Task Category
    const isCoding = /\b(code|write|refactor|debug|compile|build|test|regex|script|function|class|json|html|css|javascript|typescript|python|c\+\+|java)\b/.test(lowerPrompt);
    const isReasoning = /\b(analyze|solve|logic|math|proof|algorithm|complexity|optimize|reason|think|deduce|plan)\b/.test(lowerPrompt);
    const isVision = /\b(image|picture|photo|video|frame|canvas|screenshot|png|jpg|jpeg|svg|draw)\b/.test(lowerPrompt);

    // 2. Check for Category Override configs
    let overrideId = '';
    if (isCoding && govOverrides.coding) overrideId = govOverrides.coding;
    else if (isReasoning && govOverrides.reasoning) overrideId = govOverrides.reasoning;
    else if (isVision && govOverrides.vision) overrideId = govOverrides.vision;
    else if (!isCoding && !isReasoning && !isVision && govOverrides.conversations) overrideId = govOverrides.conversations;

    if (overrideId) {
      const found = allModels.find(m => m.id === overrideId || `${m.providerId}-${m.id}` === overrideId);
      if (found) {
        return { provider: found.providerId, model: ModelRouter.stripProviderPrefix(found.providerId, found.id) };
      }
    }

    // 3. Dynamic Selection sorting based on task capabilities and optimization goals
    const optimization = settings.modelGov?.optimizationGoal || 'balanced';

    const candidates = enabledModels.map(m => {
      const scores = ModelGovStorage.getModelScores(m.id);
      let taskScore = 0;
      if (isCoding) taskScore = scores.coding;
      else if (isReasoning) taskScore = scores.reasoning;
      else if (isVision) taskScore = scores.vision;
      else taskScore = (scores.coding + scores.reasoning) / 2; // general chat capability

      // Score = Capability * Weight + Cost * Weight
      let finalScore = 0;
      if (optimization === 'quality') {
        finalScore = taskScore;
      } else if (optimization === 'cost') {
        finalScore = scores.costEfficiency;
      } else {
        // Balanced: 70% capability + 30% cost-efficiency
        finalScore = (taskScore * 0.7) + (scores.costEfficiency * 0.3);
      }

      return {
        model: m,
        finalScore
      };
    });

    // Sort descending
    candidates.sort((a, b) => b.finalScore - a.finalScore);

    if (candidates.length > 0) {
      const best = candidates[0].model;
      return { provider: best.providerId, model: ModelRouter.stripProviderPrefix(best.providerId, best.id) };
    }

    // Default Fallback
    const firstEnabled = enabledModels[0];
    return { provider: firstEnabled.providerId, model: ModelRouter.stripProviderPrefix(firstEnabled.providerId, firstEnabled.id) };
  }
}
