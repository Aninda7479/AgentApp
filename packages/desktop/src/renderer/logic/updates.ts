/**
 * `UpdateService` — drives the Settings → Updates panel. Triggers a manual
 * update check in the main process and surfaces the result (or an "unsupported"
 * notice when running outside the desktop shell) by switching to the Updates
 * category and setting the status state via `ctx`.
 */
import type { AppContext } from './types';

export class UpdateService {
  /**
   * Triggers a manual update check. Outside the desktop app (no IPC) it reports
   * "unsupported". Otherwise it navigates to the Updates panel, shows a
   * "checking" status, invokes `check-for-updates`, and stores the result.
   */
  static check(ctx: AppContext): void {
    if (!ctx.ipc) {
      ctx.setUpdateStatus({ status: 'unsupported', message: 'Updates are only available in the desktop app.' });
      return;
    }
    // Surface the Updates panel so the result is visible.
    ctx.setActiveTab('settings');
    ctx.setSettingsCategory('updates');
    ctx.setUpdateStatus({ status: 'checking', message: 'Checking for updates…' });
    ctx.ipc
      .invoke('check-for-updates')
      .then((res: import('./types').UpdateStatus | null) => {
        if (res) ctx.setUpdateStatus(res);
      })
      .catch((err: Error) => {
        ctx.setUpdateStatus({ status: 'error', message: err.message });
      });
  }
}
