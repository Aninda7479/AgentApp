import { ModelCapability, ModelCapabilityRegistry, SettingsStorage, BYOKProviderManager, getProviderMeta } from '@superagent/core';
import { SessionContext, CLICommandResult } from '../types.js';

/** Static methods for listing and switching AI models and providers. */
export class ModelSwitcher {
  /** Returns all registered model capabilities from the context registry. */
  public static listAvailableModels(context: SessionContext): ModelCapability[] {
    return context.capabilityRegistry.getAllCapabilities();
  }

  /** Returns a formatted list of enabled model IDs from user Settings for copy-pasting. */
  public static formatModelIdsList(context?: SessionContext): string {
    const saved = SettingsStorage.loadSettings();

    // Only include providers that are actually connected (have API keys or are keyless local endpoints)
    const connectedProviders = new Set<string>();
    for (const p of saved.providers ?? []) {
      if (p.apiKey || p.id === 'ollama' || p.id === 'omniroute' || p.id === 'custom') {
        connectedProviders.add(p.id);
      }
    }
    try {
      for (const cfg of new BYOKProviderManager().getAllConfigs()) {
        if (cfg.apiKey || cfg.provider === 'ollama' || cfg.provider === 'omniroute' || cfg.provider === 'custom') {
          connectedProviders.add(cfg.provider);
        }
      }
    } catch {}

    const allSettingsModels = saved.models ?? [];
    const enabledSettingsModels = allSettingsModels.filter(m => {
      if (m.enabled === false) return false;
      const pId = m.providerId || 'custom';
      return connectedProviders.size === 0 || connectedProviders.has(pId);
    });

    const lines: string[] = [];

    if (enabledSettingsModels.length > 0) {
      lines.push('=== Enabled AI Model IDs (from Settings) ===\n');

      const byProvider = new Map<string, Array<{ id: string; name: string }>>();
      for (const m of enabledSettingsModels) {
        const pId = m.providerId || 'custom';
        const list = byProvider.get(pId) || [];
        let displayId = m.id;
        if (pId && displayId.toLowerCase().startsWith(`${pId.toLowerCase()}-`)) {
          displayId = displayId.slice(pId.length + 1);
        }
        if (!list.some(x => x.id === displayId)) {
          list.push({ id: displayId, name: m.name || displayId });
          byProvider.set(pId, list);
        }
      }

      for (const [provider, items] of byProvider.entries()) {
        lines.push(`[Provider: ${provider}]`);
        for (const item of items) {
          lines.push(`  ${item.id.padEnd(36)} (${item.name})`);
        }
        lines.push('');
      }
    } else {
      const registry = context?.capabilityRegistry ?? new ModelCapabilityRegistry();
      const models = registry.getAllCapabilities();

      lines.push('=== Enabled AI Model IDs (Default Pool - No custom settings configured) ===\n');

      const byProvider = new Map<string, Array<{ id: string; name: string }>>();
      for (const m of models) {
        const list = byProvider.get(m.provider) || [];
        if (!list.some(x => x.id === m.id)) {
          list.push({ id: m.id, name: m.name });
          byProvider.set(m.provider, list);
        }
      }

      for (const [provider, items] of byProvider.entries()) {
        lines.push(`[Provider: ${provider}]`);
        for (const item of items) {
          lines.push(`  ${item.id.padEnd(36)} (${item.name})`);
        }
        lines.push('');
      }
    }

    lines.push('[Special Routing]');
    lines.push('  orchestrator                         (Model Orchestrator Pool)\n');

    lines.push('Usage:');
    lines.push('  npm run start:cli -- --model xxxxxx --chat "Your prompt"');

    return lines.join('\n');
  }

  /** Returns a formatted string of all available models with capability badges. */
  public static formatModelList(context: SessionContext): string {
    const models = this.listAvailableModels(context);
    if (models.length === 0) {
      return 'No models registered in registry.';
    }

    const lines: string[] = ['=== Available AI Models ==='];
    for (const m of models) {
      const isCurrent = m.id === context.activeModel || m.name.toLowerCase() === context.activeModel.toLowerCase();
      const prefix = isCurrent ? '-> * ' : '   * ';
      const caps: string[] = [];
      if (m.supportsVision) caps.push('Vision');
      if (m.supportsTools) caps.push('Tools');
      if (m.supportsReasoning) caps.push('Reasoning');

      lines.push(`${prefix}${m.name} (${m.id}) [Provider: ${m.provider}]`);
      lines.push(`     Context: ${m.contextWindow.toLocaleString()} tokens | Capabilities: ${caps.join(', ')}`);
    }

    lines.push(`\nActive Provider: ${context.activeProvider}`);
    lines.push(`Active Model: ${context.activeModel}`);
    return lines.join('\n');
  }

  /** Switches the active model by ID or name, persisting the selection. */
  public static switchModel(context: SessionContext, targetModel: string): CLICommandResult {
    const models = this.listAvailableModels(context);
    let matched = models.find(
      m => m.id.toLowerCase() === targetModel.toLowerCase() || m.name.toLowerCase() === targetModel.toLowerCase()
    );

    // If not matched in static registry, check saved settings catalog (from UI / API discovery)
    if (!matched) {
      const saved = SettingsStorage.loadSettings();
      if (saved.models && saved.models.length > 0) {
        const found = saved.models.find(
          m => m.name?.toLowerCase() === targetModel.toLowerCase() || m.id?.toLowerCase() === targetModel.toLowerCase()
        );
        if (found && found.id) {
          let rawId = found.id;
          const pId = found.providerId || context.activeProvider;
          if (pId && rawId.toLowerCase().startsWith(`${pId.toLowerCase()}-`)) {
            rawId = rawId.slice(pId.length + 1);
          }
          if (found.providerId) {
            context.activeProvider = found.providerId;
          }
          context.activeModel = rawId;
          SettingsStorage.saveSettings({
            lastUsedModel: {
              model: rawId,
              provider: context.activeProvider
            }
          });
          return {
            success: true,
            message: `Active model switched to '${found.name || rawId}' (${rawId}) [Provider: ${context.activeProvider}].`,
            data: { model: rawId, provider: context.activeProvider }
          };
        }
      }
    }

    if (matched) {
      context.activeModel = matched.id;
      context.activeProvider = matched.provider;
      SettingsStorage.saveSettings({
        lastUsedModel: {
          model: matched.id,
          provider: matched.provider
        }
      });
      return {
        success: true,
        message: `Active model switched to '${matched.name}' (${matched.id}) [Provider: ${matched.provider}].`,
        data: { model: matched.id, provider: matched.provider }
      };
    }

    // Not in the registry. Suggest a close match when the user likely
    // mistyped a known model, then set the raw target as a custom identifier
    // (preserving the legitimate BYO/custom-model flow from fcd8e09). Clean
    // provider prefix if user passed e.g. "openrouter-tencent/hunyuan-a1".
    let customModelId = targetModel;
    if (context.activeProvider && customModelId.toLowerCase().startsWith(`${context.activeProvider.toLowerCase()}-`)) {
      customModelId = customModelId.slice(context.activeProvider.length + 1);
    }

    const lower = targetModel.toLowerCase();
    const candidates = this.listAvailableModels(context).filter(
      m =>
        m.id.toLowerCase().includes(lower) ||
        m.name.toLowerCase().includes(lower) ||
        lower.includes(m.id.toLowerCase()) ||
        lower.includes(m.name.toLowerCase())
    );
    const suggestions = candidates
      .filter((m, i, a) => a.indexOf(m) === i)
      .slice(0, 3)
      .map(m => m.name);
    const hint = suggestions.length ? ` Did you mean: ${suggestions.join(', ')}?` : '';
    const message =
      `Model '${targetModel}' not found in registry — set as custom identifier (${customModelId}).${hint} ` +
      `Verify its provider with /model provider <provider> (current: ${context.activeProvider}).`;

    context.activeModel = customModelId;
    SettingsStorage.saveSettings({
      lastUsedModel: {
        model: customModelId,
        provider: context.activeProvider
      }
    });
    return {
      success: true,
      message,
      data: { model: customModelId, provider: context.activeProvider }
    };
  }

  /** Switches the active provider and picks the first matching model. */
  public static switchProvider(context: SessionContext, provider: string): CLICommandResult {
    const p = provider.toLowerCase();
    // Validate against the canonical provider registry so any supported
    // provider (openrouter, nvidia, kimi, ollama, …) is accepted, not just a
    // hardcoded subset. Custom BYO endpoints are registered with dynamic ids
    // like `custom-1719500000` (see provider-meta.ts); accept those too so a
    // connected custom provider is switchable — never hard-lock to a fixed list.
    const isCustomProvider = p.startsWith('custom');
    if (!getProviderMeta(p) && !isCustomProvider) {
      return {
        success: false,
        message: `'${provider}' is not a supported provider. Run /model list to see registered models, or connect it first.`
      };
    }

    context.activeProvider = p;
    // Auto-select first available model for the new provider
    const models = this.listAvailableModels(context).filter(m => m.provider === p);
    if (models.length > 0) {
      context.activeModel = models[0].id;
    }

    SettingsStorage.saveSettings({
      lastUsedModel: {
        provider: p,
        model: context.activeModel
      }
    });

    return {
      success: true,
      message: `Active provider switched to '${p}'. Active model is now '${context.activeModel}'.`,
      data: { provider: p, model: context.activeModel }
    };
  }

  /**
   * Persists API credentials for a provider into Core settings. This is how the
   * CLI provisions keys itself — the user never exports a key into the terminal
   * environment. Credentials are read back by Core's connection resolver, so the
   * engine picks them up on the next turn.
   */
  public static setProviderCredentials(
    context: SessionContext,
    provider: string,
    apiKey: string,
    baseUrl?: string
  ): CLICommandResult {
    const p = provider.toLowerCase();
    const saved = SettingsStorage.loadSettings();
    const providers = saved.providers ? [...saved.providers] : [];
    const idx = providers.findIndex((x) => x.id === p);
    const entry: Record<string, string> = { id: p, name: p, type: 'key', apiKey };
    if (baseUrl) entry.baseUrl = baseUrl;
    if (idx >= 0) providers[idx] = { ...providers[idx], ...entry } as any;
    else providers.push(entry as any);
    SettingsStorage.saveSettings({ providers });

    // Reflect the newly-connected provider into the live session so the next
    // turn uses it immediately.
    context.activeProvider = p;
    return {
      success: true,
      message: `Saved credentials for provider '${p}'. The active connection now uses them — start chatting or run /model to verify.`,
      data: { provider: p }
    };
  }
}

/** Handles `/model` slash command: lists models or switches active model/provider. */
export function handleModelCommand(args: string[], context: SessionContext): CLICommandResult {
  if (args.length === 0 || args[0] === 'list') {
    return {
      success: true,
      message: ModelSwitcher.formatModelList(context)
    };
  }

  const subCommand = args[0].toLowerCase();

  if (subCommand === 'provider' && args[1]) {
    // `/model provider <id> [<apiKey> [<baseUrl>]]` — switch provider, and if a
    // key is supplied, persist it via Core settings (CLI provisions keys itself).
    const switched = ModelSwitcher.switchProvider(context, args[1]);
    if (!switched.success) return switched;
    if (args[2]) {
      const base =
        args[3] ||
        (args[1].toLowerCase() === 'openrouter' ? 'https://openrouter.ai/api/v1' : undefined);
      return ModelSwitcher.setProviderCredentials(context, args[1], args[2], base);
    }
    return switched;
  }

  if (subCommand === 'set' && args[1]) {
    return ModelSwitcher.switchModel(context, args[1]);
  }

  // Direct model switch e.g. /model gpt-4o
  return ModelSwitcher.switchModel(context, args[0]);
}
