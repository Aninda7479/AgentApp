/**
 * Provider Registry Service for SuperAgent Desktop
 */

import { providerStore } from '../stores/providerStore';
import { IpcBridge } from '../core/ipc';
import type { ProviderConnection, ModelConfig } from '../core/types';
import { ChatRepository } from './ChatRepository';

export class ProviderRegistry {
  static NON_OPENAI_COMPATIBLE_IDS = ['ollama', 'ollama-cloud'];

  static resolveActiveProvider(selectedModelName: string): ProviderConnection | undefined {
    const { providers, models } = providerStore.getState();
    return (
      providers.find((p) => models.some((m) => m.providerId === p.id && m.name === selectedModelName && m.enabled)) ||
      providers[0]
    );
  }

  static resolveEngineProviderId(provider: ProviderConnection): string {
    if (provider.type === 'env' || provider.type === 'key') return provider.id;
    if (ProviderRegistry.NON_OPENAI_COMPATIBLE_IDS.includes(provider.id)) return provider.id;
    return 'custom';
  }

  static resolveModelId(activeProvider: ProviderConnection | undefined, selectedModelName: string): string {
    const { models } = providerStore.getState();
    const config =
      models.find((m) => m.providerId === activeProvider?.id && m.name === selectedModelName && m.enabled) ||
      models.find((m) => m.providerId === activeProvider?.id && m.name === selectedModelName);

    return config && activeProvider ? config.id.replace(`${activeProvider.id}-`, '') : selectedModelName;
  }

  static detectFree(
    id: string,
    name: string,
    pricing?: { prompt?: string; completion?: string; input?: string; output?: string }
  ): boolean {
    const hay = `${id} ${name}`.toLowerCase();
    if (hay.includes('free')) return true;
    if (pricing) {
      const isZero = (s?: string) => s == null || /^\s*\$?\s*0(\.0+)?\s*$/.test(s);
      const inZero = isZero(pricing.prompt ?? pricing.input);
      const outZero = isZero(pricing.completion ?? pricing.output);
      if (inZero && outZero) return true;
    }
    return false;
  }

  static async connect(provider: ProviderConnection, newModels: ModelConfig[]): Promise<void> {
    providerStore.connect(provider, newModels);
    await ChatRepository.persistAll();
  }

  static async disconnect(providerId: string): Promise<void> {
    providerStore.disconnect(providerId);
    await ChatRepository.persistAll();
  }

  static async toggleModel(modelId: string): Promise<void> {
    providerStore.toggleModel(modelId);
    await ChatRepository.persistAll();
  }

  static async autoDetect(): Promise<void> {
    if (!IpcBridge.isDesktop()) return;
    try {
      const detected = await IpcBridge.autoDetectProviders();
      if (!Array.isArray(detected)) return;

      const currentProviders = providerStore.getState().providers;
      const currentIds = new Set(currentProviders.map((p) => p.id));

      for (const d of detected) {
        if (currentIds.has(d.id)) continue;
        const provider: ProviderConnection = {
          id: d.id,
          name: d.name,
          type: d.type,
          apiKey: d.apiKey,
          baseUrl: d.baseUrl,
        };
        const models: ModelConfig[] = d.models.map((m) => ({
          id: `${d.id}-${m.id}`,
          name: m.name,
          providerId: d.id,
          enabled: false,
          contextLimit: 'n/a',
        }));

        providerStore.connect(provider, models);
      }
      await ChatRepository.persistAll();
    } catch (err) {
      console.warn('[ProviderRegistry] Auto detect failed silently:', err);
    }
  }
}

export const ProvidersService = ProviderRegistry;
