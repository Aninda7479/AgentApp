import { ModelCapability, SettingsStorage } from '@superagent/core';
import { SessionContext, CLICommandResult } from '../types.js';

/** Static methods for listing and switching AI models and providers. */
export class ModelSwitcher {
  /** Returns all registered model capabilities from the context registry. */
  public static listAvailableModels(context: SessionContext): ModelCapability[] {
    return context.capabilityRegistry.getAllCapabilities();
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
    const matched = models.find(
      m => m.id.toLowerCase() === targetModel.toLowerCase() || m.name.toLowerCase() === targetModel.toLowerCase()
    );

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

    // Fallback for custom model IDs not in the registry
    context.activeModel = targetModel;
    SettingsStorage.saveSettings({
      lastUsedModel: {
        model: targetModel
      }
    });
    return {
      success: true,
      message: `Active model set to custom identifier '${targetModel}'. Provider remains '${context.activeProvider}'.`,
      data: { model: targetModel, provider: context.activeProvider }
    };
  }

  /** Switches the active provider and picks the first matching model. */
  public static switchProvider(context: SessionContext, provider: string): CLICommandResult {
    const validProviders = ['openai', 'anthropic', 'gemini', 'deepseek', 'custom'];
    const p = provider.toLowerCase();
    
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
    return ModelSwitcher.switchProvider(context, args[1]);
  }

  if (subCommand === 'set' && args[1]) {
    return ModelSwitcher.switchModel(context, args[1]);
  }

  // Direct model switch e.g. /model gpt-4o
  return ModelSwitcher.switchModel(context, args[0]);
}
