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
  // Separate listener set for lastUsedModel-only changes so that
  // setLastUsedModel() does NOT trigger the main subscriber, which would
  // read state.providers (still []) and wipe the connected-providers UI.
  private modelListeners: Set<() => void> = new Set();

  public getState(): ProviderStoreState {
    return this.state;
  }

  public subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  /** Subscribe only to lastUsedModel changes (does not fire on provider/model list changes). */
  public subscribeModel = (listener: () => void): (() => void) => {
    this.modelListeners.add(listener);
    return () => this.modelListeners.delete(listener);
  };

  private emit(): void {
    this.listeners.forEach((fn) => fn());
  }

  private emitModel(): void {
    this.modelListeners.forEach((fn) => fn());
  }

  public setState(updater: (prev: ProviderStoreState) => Partial<ProviderStoreState>): void {
    const next = updater(this.state);
    this.state = { ...this.state, ...next };
    this.emit();
  }

  public setProviders(providers: ProviderConnection[]): void {
    if (providers.length === 0 && this.state.providers.length > 0) {
      return;
    }
    if (JSON.stringify(this.state.providers) === JSON.stringify(providers)) {
      return;
    }
    this.setState(() => ({ providers }));
  }

  public setModels(models: ModelConfig[]): void {
    if (models.length === 0 && this.state.models.length > 0) {
      return;
    }
    if (JSON.stringify(this.state.models) === JSON.stringify(models)) {
      return;
    }
    this.setState(() => ({ models }));
  }

  public setLastUsedModel(lastUsedModel: string): void {
    if (this.state.lastUsedModel === lastUsedModel) return;
    this.state = { ...this.state, lastUsedModel };
    this.emitModel();
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

/** Hook that only re-renders when lastUsedModel changes (not on provider/model list changes). */
export function useLastUsedModel(): string {
  return useSyncExternalStore(
    providerStore.subscribeModel,
    () => providerStore.getState().lastUsedModel,
    () => providerStore.getState().lastUsedModel
  );
}
