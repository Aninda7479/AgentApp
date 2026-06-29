import {
  ModelCapability,
  BYOKConfig,
  BaseProviderAdapter
} from '../types/agent.js';
import { BYOKProviderManager } from './byok.js';
import { OpenAIAdapter } from './openai.js';
import { AnthropicAdapter } from './anthropic.js';
import { GeminiAdapter } from './gemini.js';
import { CustomAdapter } from './custom.js';

export function createProviderAdapter(config: BYOKConfig): BaseProviderAdapter {
  switch (config.provider) {
    case 'openai':
      return new OpenAIAdapter(config);
    case 'anthropic':
      return new AnthropicAdapter(config);
    case 'gemini':
      return new GeminiAdapter(config);
    case 'deepseek':
    case 'custom':
      return new CustomAdapter(config);
    default:
      throw new Error(`Unsupported provider: ${config.provider}`);
  }
}

export class ModelCapabilityRegistry {
  private capabilities: Map<string, ModelCapability> = new Map();

  constructor() {
    this.registerDefaults();
  }

  private registerDefaults(): void {
    const defaults: ModelCapability[] = [
      // OpenAI
      {
        id: 'gpt-4o',
        name: 'GPT-4o',
        provider: 'openai',
        contextWindow: 128000,
        maxOutputTokens: 4096,
        supportsVision: true,
        supportsTools: true,
        supportsReasoning: false
      },
      {
        id: 'o3-mini',
        name: 'o3-mini',
        provider: 'openai',
        contextWindow: 200000,
        maxOutputTokens: 100000,
        supportsVision: false,
        supportsTools: true,
        supportsReasoning: true
      },
      {
        id: 'gpt-4o-mini',
        name: 'GPT-4o Mini',
        provider: 'openai',
        contextWindow: 128000,
        maxOutputTokens: 4096,
        supportsVision: true,
        supportsTools: true,
        supportsReasoning: false
      },
      // Anthropic
      {
        id: 'claude-3-7-sonnet-20250219',
        name: 'Claude 3.7 Sonnet',
        provider: 'anthropic',
        contextWindow: 200000,
        maxOutputTokens: 8192,
        supportsVision: true,
        supportsTools: true,
        supportsReasoning: true
      },
      {
        id: 'claude-3-5-sonnet-20241022',
        name: 'Claude 3.5 Sonnet',
        provider: 'anthropic',
        contextWindow: 200000,
        maxOutputTokens: 8192,
        supportsVision: true,
        supportsTools: true,
        supportsReasoning: false
      },
      {
        id: 'claude-3-opus-20240229',
        name: 'Claude 3 Opus',
        provider: 'anthropic',
        contextWindow: 200000,
        maxOutputTokens: 4096,
        supportsVision: true,
        supportsTools: true,
        supportsReasoning: false
      },
      // Gemini
      {
        id: 'gemini-2.5-flash',
        name: 'Gemini 2.5 Flash',
        provider: 'gemini',
        contextWindow: 1000000,
        maxOutputTokens: 8192,
        supportsVision: true,
        supportsTools: true,
        supportsReasoning: true
      },
      {
        id: 'gemini-1.5-pro',
        name: 'Gemini 1.5 Pro',
        provider: 'gemini',
        contextWindow: 2000000,
        maxOutputTokens: 8192,
        supportsVision: true,
        supportsTools: true,
        supportsReasoning: false
      },
      // DeepSeek
      {
        id: 'deepseek-chat',
        name: 'DeepSeek Chat',
        provider: 'deepseek',
        contextWindow: 64000,
        maxOutputTokens: 8192,
        supportsVision: false,
        supportsTools: true,
        supportsReasoning: false
      },
      {
        id: 'deepseek-reasoner',
        name: 'DeepSeek Reasoner',
        provider: 'deepseek',
        contextWindow: 64000,
        maxOutputTokens: 8192,
        supportsVision: false,
        supportsTools: true,
        supportsReasoning: true
      }
    ];

    for (const item of defaults) {
      this.registerCapability(item);
    }
  }

  public registerCapability(capability: ModelCapability): void {
    this.capabilities.set(capability.id, capability);
  }

  public getCapability(modelId: string): ModelCapability | undefined {
    return this.capabilities.get(modelId);
  }

  public getAllCapabilities(): ModelCapability[] {
    return Array.from(this.capabilities.values());
  }

  public async getAvailableModels(byokManager: BYOKProviderManager): Promise<ModelCapability[]> {
    const configs = byokManager.getAllConfigs();
    if (configs.length === 0) {
      return [];
    }

    const availableModels: ModelCapability[] = [];

    for (const config of configs) {
      try {
        const adapter = createProviderAdapter(config);
        if (adapter.listModels) {
          const models = await adapter.listModels();
          for (const m of models) {
            this.registerCapability(m);
            availableModels.push(m);
          }
        }
      } catch {
        // Ignore adapters that fail initialization during discovery
      }
    }

    return availableModels;
  }
}
