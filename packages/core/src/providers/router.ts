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

export interface RouterOptions {
  preferredProvider?: AIProvider;
  fallbackOrder?: AIProvider[];
}

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
        return { provider: found.providerId, model: found.id.replace(`${found.providerId}-`, '') };
      }
    }

    // 2. Map Capability Priority
    let targetOrder: string[] = [];
    if (isCoding) {
      targetOrder = ['claude-3-7-sonnet', 'claude-3-5-sonnet', 'o3-mini', 'gpt-4o', 'deepseek-chat', 'gemini-1.5-pro'];
    } else if (isReasoning) {
      targetOrder = ['o3-mini', 'deepseek-reasoner', 'o1', 'claude-3-7-sonnet', 'gemini-2.5-flash'];
    } else if (isVision) {
      targetOrder = ['gpt-4o', 'claude-3-5-sonnet', 'gemini-1.5-pro', 'gemini-2.5-flash'];
    } else {
      targetOrder = ['gpt-4o-mini', 'gemini-2.5-flash', 'deepseek-chat', 'gpt-4o'];
    }

    // Try to find matching model in our filtered pool
    for (const modelName of targetOrder) {
      const found = enabledModels.find(m => m.id.toLowerCase().includes(modelName) || m.name.toLowerCase().includes(modelName));
      if (found) return { provider: found.providerId, model: found.id.replace(`${found.providerId}-`, '') };
    }

    // Default Fallback: Select the first enabled model
    const firstEnabled = enabledModels[0];
    return { provider: firstEnabled.providerId, model: firstEnabled.id.replace(`${firstEnabled.providerId}-`, '') };
  }
}
