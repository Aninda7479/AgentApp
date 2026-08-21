/**
 * `SettingsService` — reads and writes the user's settings (theme, work mode,
 * permission toggles, internet-access level, last-used model) to the desktop
 * settings store via IPC. The design layer calls `write*` on each toggle and
 * `readInto` once at startup.
 */
import type { AppContext, InternetAccessLevel, ModelConfig, ProviderConnection, ThemeMode } from './types';

export class SettingsService {
  /** Persists the active theme (desktop) to settings.json. */
  static writeTheme(ctx: AppContext, mode: ThemeMode): void {
    if (ctx.ipc && mode) {
      ctx.ipc.invoke('settings-write', { theme: { desktop: mode } });
    }
  }

  /** Persists the coding/everyday work-mode toggle. */
  static writeWorkMode(ctx: AppContext, mode: 'coding' | 'everyday'): void {
    ctx.ipc?.invoke('settings-write', { general: { workMode: mode } });
  }

  /** Persists the "confirm shell commands" permission toggle. */
  static writeConfirmShell(ctx: AppContext, val: boolean): void {
    ctx.ipc?.invoke('settings-write', { general: { confirmShellCommands: val } });
  }

  /** Persists the "auto-review plan" toggle. */
  static writeAutoReview(ctx: AppContext, val: boolean): void {
    ctx.ipc?.invoke('settings-write', { general: { autoReviewPlan: val } });
  }

  /** Persists the "unsandboxed actions" (full access) toggle. */
  static writeUnsandboxed(ctx: AppContext, val: boolean): void {
    ctx.ipc?.invoke('settings-write', { general: { unsandboxedActions: val } });
  }

  /** Persists the internet-access level. */
  static writeInternet(ctx: AppContext, level: InternetAccessLevel): void {
    ctx.ipc?.invoke('settings-write', { internetAccess: { level } });
  }

  /**
   * Remembers the last model the user selected. Updates React state and writes
   * `{ provider, model }` to the settings store (the provider is resolved from
   * the live model catalog).
   */
  static persistLastUsedModel(ctx: AppContext, modelName: string): void {
    if (!modelName) return;
    ctx.setLastUsedModel(modelName);
    const catalog = ctx.getModelsCatalog();
    const modelConfig: ModelConfig | undefined =
      catalog.find((m) => m.name === modelName || m.id === modelName) ||
      catalog.find((m) => m.name.toLowerCase() === modelName.toLowerCase() || m.id.toLowerCase() === modelName.toLowerCase());
    const providerId = modelConfig?.providerId;
    let modelId = modelName;
    if (modelConfig) {
      modelId = modelConfig.id;
      if (providerId && modelId.startsWith(`${providerId}-`)) {
        modelId = modelId.slice(providerId.length + 1);
      }
    }
    ctx.ipc?.invoke('settings-write', {
      lastUsedModel: { provider: providerId, model: modelId }
    });
  }

  /**
   * Loads persisted settings from settings.json and maps them onto React state.
   * Called once at startup (before the hydrated flag is flipped by the caller).
   * Failures are logged but never fatal.
   */
  static async readInto(ctx: AppContext): Promise<void> {
    try {
      const settings = await ctx.ipc?.invoke('settings-read');
      if (!settings) return;
      if (settings.theme?.desktop) {
        ctx.setThemeMode(settings.theme.desktop);
      }
      if (settings.general) {
        if (settings.general.workMode) ctx.setWorkMode(settings.general.workMode);
        if (settings.general.confirmShellCommands !== undefined)
          ctx.setDefaultPermissions(settings.general.confirmShellCommands);
        if (settings.general.autoReviewPlan !== undefined) ctx.setAutoReview(settings.general.autoReviewPlan);
        if (settings.general.unsandboxedActions !== undefined) ctx.setFullAccess(settings.general.unsandboxedActions);
      }
      if (settings.internetAccess?.level) {
        ctx.setInternetAccessLevel(settings.internetAccess.level);
      }
      if (settings.lastUsedModel?.model) {
        ctx.setLastUsedModel(settings.lastUsedModel.model);
      }
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('Failed to load general settings:', err);
    }
  }
}
