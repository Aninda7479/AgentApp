/**
 * Provider & Model Store for SuperAgent Desktop
 * Manages connected AI providers, models catalog, and active model selection.
 */

import { useSyncExternalStore } from 'react';
import type { ProviderConnection, ModelConfig } from '../core/types';

export interface ProviderStoreState {
  providers: ProviderConnection[];
  models: ModelConfig[];
  lastUsedModel: string;
}

class ProviderStoreManager {
  private state: ProviderStoreState = {
    providers: [],
    models: [],
    lastUsedModel: '',
  };

  private listeners: Set<() => void> = new Set();

  public getState(): ProviderStoreState {
    return this.state;
  }

  public subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  private emit(): void {
    this.listeners.forEach((fn) => fn());
  }

  public setState(updater: (prev: ProviderStoreState) => Partial<ProviderStoreState>): void {
    const next = updater(this.state);
    this.state = { ...this.state, ...next };
    this.emit();
  }

  public setProviders(providers: ProviderConnection[]): void {
    this.setState(() => ({ providers }));
  }

  public setModels(models: ModelConfig[]): void {
    this.setState(() => ({ models }));
  }

  public setLastUsedModel(lastUsedModel: string): void {
    this.setState(() => ({ lastUsedModel }));
  }

  public connect(provider: ProviderConnection, newModels: ModelConfig[]): void {
    this.setState((prev) => {
      const providers = [...prev.providers.filter((p) => p.id !== provider.id), provider];
      const models = [...prev.models.filter((m) => m.providerId !== provider.id), ...newModels];
      return { providers, models };
    });
  }

  public disconnect(providerId: string): void {
    this.setState((prev) => ({
      providers: prev.providers.filter((p) => p.id !== providerId),
      models: prev.models.filter((m) => m.providerId !== providerId),
    }));
  }

  public toggleModel(modelId: string): void {
    this.setState((prev) => ({
      models: prev.models.map((m) => (m.id === modelId ? { ...m, enabled: !m.enabled } : m)),
    }));
  }
}

export const providerStore = new ProviderStoreManager();

export function useProviderStore<T>(selector: (state: ProviderStoreState) => T): T {
  return useSyncExternalStore(
    providerStore.subscribe,
    () => selector(providerStore.getState()),
    () => selector(providerStore.getState())
  );
}
