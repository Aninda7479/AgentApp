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
import { resolveProviderFamily } from './provider-meta.js';

/** Creates the appropriate provider adapter based on the provider family. */
export function createProviderAdapter(config: BYOKConfig): BaseProviderAdapter {
  const family = resolveProviderFamily(config.provider);

  if (family === 'anthropic') {
    return new AnthropicAdapter({ ...config, provider: 'anthropic' });
  }
  if (family === 'gemini') {
    return new GeminiAdapter({ ...config, provider: 'gemini' });
  }

  // OpenAI-compatible family (OpenAI, DeepSeek, DeepInfra, OpenRouter, Kimi, …).
  // `openai`/`chatgpt` use the dedicated OpenAI adapter (richer model list);
  // every other provider reuses the generic OpenAI-compatible adapter which
  // honours `baseUrl` so self-hosted / proxy endpoints work out of the box.
  if (config.provider === 'openai' || config.provider === 'chatgpt') {
    return new OpenAIAdapter({ ...config, provider: 'openai' });
  }
  return new CustomAdapter(config);
}

/** Central registry of model capabilities (context window, features) with default presets. */
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
        supportsReasoning: false,
        inputModalities: ['text', 'image'],
        outputModalities: ['text'],
        specialties: ['vision', 'general'],
        speedTier: 'balanced',
        intelligenceTier: 'high',
        accessStatus: 'available',
        reasoningEffortLevels: [],
        moderationLevel: 'standard'
      },
      {
        id: 'o3-mini',
        name: 'o3-mini',
        provider: 'openai',
        contextWindow: 200000,
        maxOutputTokens: 100000,
        supportsVision: false,
        supportsTools: true,
        supportsReasoning: true,
        inputModalities: ['text'],
        outputModalities: ['text'],
        specialties: ['reasoning', 'math', 'coding'],
        speedTier: 'slow',
        intelligenceTier: 'high',
        accessStatus: 'available',
        reasoningEffortLevels: ['low', 'medium', 'high'],
        moderationLevel: 'standard'
      },
      {
        id: 'gpt-4o-mini',
        name: 'GPT-4o Mini',
        provider: 'openai',
        contextWindow: 128000,
        maxOutputTokens: 4096,
        supportsVision: true,
        supportsTools: true,
        supportsReasoning: false,
        inputModalities: ['text', 'image'],
        outputModalities: ['text'],
        specialties: ['vision', 'general', 'cost-efficient'],
        speedTier: 'fast',
        intelligenceTier: 'mid',
        accessStatus: 'available',
        reasoningEffortLevels: [],
        moderationLevel: 'standard'
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
        supportsReasoning: true,
        inputModalities: ['text', 'image'],
        outputModalities: ['text'],
        specialties: ['coding', 'reasoning', 'vision', 'agents'],
        speedTier: 'balanced',
        intelligenceTier: 'high',
        accessStatus: 'available',
        reasoningEffortLevels: ['low', 'medium', 'high'],
        moderationLevel: 'standard'
      },
      {
        id: 'claude-3-5-sonnet-20241022',
        name: 'Claude 3.5 Sonnet',
        provider: 'anthropic',
        contextWindow: 200000,
        maxOutputTokens: 8192,
        supportsVision: true,
        supportsTools: true,
        supportsReasoning: false,
        inputModalities: ['text', 'image'],
        outputModalities: ['text'],
        specialties: ['coding', 'vision', 'agents'],
        speedTier: 'balanced',
        intelligenceTier: 'high',
        accessStatus: 'available',
        reasoningEffortLevels: [],
        moderationLevel: 'standard'
      },
      {
        id: 'claude-3-opus-20240229',
        name: 'Claude 3 Opus',
        provider: 'anthropic',
        contextWindow: 200000,
        maxOutputTokens: 4096,
        supportsVision: true,
        supportsTools: true,
        supportsReasoning: false,
        inputModalities: ['text', 'image'],
        outputModalities: ['text'],
        specialties: ['reasoning', 'vision', 'long-form'],
        speedTier: 'slow',
        intelligenceTier: 'frontier',
        accessStatus: 'available',
        reasoningEffortLevels: [],
        moderationLevel: 'standard'
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
        supportsReasoning: true,
        inputModalities: ['text', 'image'],
        outputModalities: ['text'],
        specialties: ['vision', 'long-context', 'cost-efficient'],
        speedTier: 'fast',
        intelligenceTier: 'high',
        accessStatus: 'available',
        reasoningEffortLevels: ['low', 'medium', 'high'],
        moderationLevel: 'standard'
      },
      {
        id: 'gemini-1.5-pro',
        name: 'Gemini 1.5 Pro',
        provider: 'gemini',
        contextWindow: 2000000,
        maxOutputTokens: 8192,
        supportsVision: true,
        supportsTools: true,
        supportsReasoning: false,
        inputModalities: ['text', 'image'],
        outputModalities: ['text'],
        specialties: ['vision', 'long-context'],
        speedTier: 'balanced',
        intelligenceTier: 'high',
        accessStatus: 'available',
        reasoningEffortLevels: [],
        moderationLevel: 'standard'
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
        supportsReasoning: false,
        inputModalities: ['text'],
        outputModalities: ['text'],
        specialties: ['coding', 'cost-efficient'],
        speedTier: 'fast',
        intelligenceTier: 'mid',
        accessStatus: 'available',
        reasoningEffortLevels: [],
        moderationLevel: 'low'
      },
      {
        id: 'deepseek-reasoner',
        name: 'DeepSeek Reasoner',
        provider: 'deepseek',
        contextWindow: 64000,
        maxOutputTokens: 8192,
        supportsVision: false,
        supportsTools: true,
        supportsReasoning: true,
        inputModalities: ['text'],
        outputModalities: ['text'],
        specialties: ['reasoning', 'math', 'cost-efficient'],
        speedTier: 'slow',
        intelligenceTier: 'high',
        accessStatus: 'available',
        reasoningEffortLevels: ['low', 'medium', 'high'],
        moderationLevel: 'low'
      },
      // OpenRouter — free-tier default models (no-cost entry points).
      // The free roster rotates constantly; these IDs were verified against
      // https://openrouter.ai/collections/free-models on 2026-07-20.
      // `openrouter/free` is OpenRouter's auto-router: it always resolves to a
      // currently-available free model and filters for vision / tool-use /
      // structured-output as needed — the most robust no-cost entry point.
      {
        id: 'openrouter/free',
        name: 'OpenRouter Free (auto-router)',
        provider: 'openrouter',
        contextWindow: 200000,
        maxOutputTokens: 8192,
        supportsVision: true,
        supportsTools: true,
        supportsReasoning: false,
        inputModalities: ['text', 'image'],
        outputModalities: ['text'],
        specialties: ['general', 'cost-efficient', 'routing'],
        speedTier: 'balanced',
        intelligenceTier: 'mid',
        accessStatus: 'available',
        reasoningEffortLevels: [],
        moderationLevel: 'low'
      },
      {
        id: 'openai/gpt-oss-20b:free',
        name: 'OpenAI gpt-oss-20b (free)',
        provider: 'openrouter',
        contextWindow: 131072,
        maxOutputTokens: 8192,
        supportsVision: false,
        supportsTools: true,
        supportsReasoning: true,
        inputModalities: ['text'],
        outputModalities: ['text'],
        specialties: ['coding', 'reasoning', 'cost-efficient'],
        speedTier: 'fast',
        intelligenceTier: 'mid',
        accessStatus: 'available',
        reasoningEffortLevels: [],
        moderationLevel: 'low'
      },
      {
        id: 'google/gemma-4-31b-it:free',
        name: 'Google Gemma 4 31B (free)',
        provider: 'openrouter',
        contextWindow: 262144,
        maxOutputTokens: 8192,
        supportsVision: false,
        supportsTools: true,
        supportsReasoning: false,
        inputModalities: ['text'],
        outputModalities: ['text'],
        specialties: ['general', 'multilingual'],
        speedTier: 'balanced',
        intelligenceTier: 'high',
        accessStatus: 'available',
        reasoningEffortLevels: [],
        moderationLevel: 'low'
      },
      {
        id: 'nvidia/nemotron-nano-12b-v2-vl:free',
        name: 'NVIDIA Nemotron Nano 12B VL (free)',
        provider: 'openrouter',
        contextWindow: 131072,
        maxOutputTokens: 8192,
        supportsVision: true,
        supportsTools: true,
        supportsReasoning: false,
        inputModalities: ['text', 'image'],
        outputModalities: ['text'],
        specialties: ['vision', 'general'],
        speedTier: 'fast',
        intelligenceTier: 'mid',
        accessStatus: 'available',
        reasoningEffortLevels: [],
        moderationLevel: 'low'
      },
      {
        id: 'cohere/north-mini-code:free',
        name: 'Cohere North Mini Code (free)',
        provider: 'openrouter',
        contextWindow: 131072,
        maxOutputTokens: 8192,
        supportsVision: false,
        supportsTools: true,
        supportsReasoning: false,
        inputModalities: ['text'],
        outputModalities: ['text'],
        specialties: ['coding', 'cost-efficient'],
        speedTier: 'fast',
        intelligenceTier: 'mid',
        accessStatus: 'available',
        reasoningEffortLevels: [],
        moderationLevel: 'low'
      },
      {
        id: 'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free',
        name: 'NVIDIA Nemotron 3 Nano Omni 30B Reasoning (free)',
        provider: 'openrouter',
        contextWindow: 262144,
        maxOutputTokens: 8192,
        supportsVision: false,
        supportsTools: true,
        supportsReasoning: true,
        inputModalities: ['text'],
        outputModalities: ['text'],
        specialties: ['reasoning', 'math'],
        speedTier: 'balanced',
        intelligenceTier: 'high',
        accessStatus: 'available',
        reasoningEffortLevels: [],
        moderationLevel: 'low'
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

/**
 * Shared, lazily-populated capability registry. `registerDefaults()` runs in
 * the constructor, and `getAvailableModels` augments it with live-discovered
 * models. Imported by the orchestration layer (e.g. `ai-engine.buildRouterPool`)
 * to enrich the routing pool with tier/cost signals without re-instantiating.
 */
export const capabilityRegistry = new ModelCapabilityRegistry();
