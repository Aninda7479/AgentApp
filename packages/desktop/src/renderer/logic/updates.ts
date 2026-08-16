/**
 * `UpdateService` — drives the Settings → Updates panel. Triggers a manual
 * update check in the main process and surfaces the result (or an "unsupported"
 * notice when running outside the desktop shell) by switching to the Updates
 * category and setting the status state via `ctx`.
 */
import type { AppContext } from './types';

export class UpdateService {
  /**
   * Triggers a manual update check. In web mode it queries the /api/update/check endpoint.
   * In desktop mode it invokes `check-for-updates` via IPC and stores the result.
   */
  static check(ctx: AppContext): void {
    // Surface the Updates panel so the result is visible.
    ctx.setActiveTab('settings');
    ctx.setSettingsCategory('updates');
    ctx.setUpdateStatus({ status: 'checking', message: 'Checking for updates…' });

    if (!ctx.ipc) {
      if (typeof fetch !== 'undefined') {
        fetch('/api/update/check')
          .then(async (res) => {
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data = await res.json();
            if (data.hasUpdate && data.latest) {
              ctx.setUpdateStatus({
                status: 'available',
                version: data.latest,
                message: `Version ${data.latest} is available.`
              });
            } else {
              ctx.setUpdateStatus({
                status: 'not-available',
                message: 'SuperAgent is up to date.'
              });
            }
          })
          .catch(() => {
            ctx.setUpdateStatus({
              status: 'unsupported',
              message: 'Updates are only managed automatically in the desktop app.'
            });
          });
      } else {
        ctx.setUpdateStatus({ status: 'unsupported', message: 'Updates are only available in the desktop app.' });
      }
      return;
    }

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
