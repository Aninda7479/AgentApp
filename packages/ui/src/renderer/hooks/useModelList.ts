/**
 * React Hook for Grouped/Filtered Enabled AI Models
 * Ensures only enabled models are visible in the composer selector.
 */

import { useMemo } from 'react';
import { useProviderStore } from '../stores/providerStore';
import type { ModelConfig, ProviderConnection } from '../core/types';

export interface GroupedModelList {
  provider: ProviderConnection;
  models: ModelConfig[];
}

export function useModelList(): {
  groupedModels: GroupedModelList[];
  enabledModels: ModelConfig[];
  allModels: ModelConfig[];
} {
  const providers = useProviderStore((s) => s.providers) || [];
  const models = useProviderStore((s) => s.models) || [];

  const enabledModels = useMemo(() => models.filter((m) => m.enabled), [models]);

  const groupedModels = useMemo(() => {
    return providers
      .map((provider) => ({
        provider,
        models: models.filter((m) => m.providerId === provider.id && m.enabled),
      }))
      .filter((group) => group.models.length > 0); // Drop providers with no enabled models
  }, [providers, models]);

  return {
    groupedModels,
    enabledModels,
    allModels: enabledModels,
  };
}
