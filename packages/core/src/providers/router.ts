import {
  CompletionRequest,
  CompletionResponse,
  BYOKConfig,
  AIProvider,
  BaseProviderAdapter
} from '../types/agent.js';
import { BYOKProviderManager } from './byok.js';
import { createProviderAdapter } from './models.js';

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
}
