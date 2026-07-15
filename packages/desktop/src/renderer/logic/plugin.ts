/**
 * `PluginService` — owns plugin enable/disable state. Toggling updates React
 * state (via `ctx`) and persists the merged plugin map back to settings.json by
 * reading the current settings first. The design layer calls `toggle`.
 */
import type { AppContext } from './types';

export class PluginService {
  /**
   * Toggles a plugin's enabled flag. Updates `ctx`'s plugin-enabled map and,
   * when IPC is available, reads the current settings store, merges the new
   * plugin map, and writes it back so the change survives a restart.
   */
  static toggle(ctx: AppContext, id: string, enabled: boolean): void {
    ctx.setPluginEnabled((prev) => {
      const next = { ...prev, [id]: enabled };
      if (ctx.ipc) {
        ctx.ipc.invoke('settings-read').then((current: any) => {
          ctx.ipc?.invoke('settings-write', { ...current, plugins: next });
        });
      }
      return next;
    });
  }
}
