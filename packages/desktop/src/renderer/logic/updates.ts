/**
 * `UpdateService` — drives the Settings → Updates panel. Triggers a manual
 * update check in the main process / Tauri v2 updater and surfaces the result.
 */
import type { AppContext, UpdateStatus } from './types';
import { isTauriEnv } from '../tauriBridge';

let cachedPendingUpdate: any = null;

export class UpdateService {
  /**
   * Triggers a manual update check.
   * - In Tauri (desktop app): uses @tauri-apps/plugin-updater.
   * - In Web / Electron: queries IPC or API endpoint.
   */
  static async check(ctx: AppContext): Promise<void> {
    ctx.setActiveTab('settings');
    ctx.setSettingsCategory('updates');
    ctx.setUpdateStatus({ status: 'checking', message: 'Checking GitHub releases for updates…' });

    // 1. Tauri v2 Desktop Environment
    if (isTauriEnv()) {
      try {
        const { check } = await import('@tauri-apps/plugin-updater');
        const update = await check();

        if (update) {
          cachedPendingUpdate = update;
          ctx.setUpdateStatus({
            status: 'available',
            version: update.version,
            message: `Version v${update.version} is available!`
          });
        } else {
          cachedPendingUpdate = null;
          ctx.setUpdateStatus({
            status: 'not-available',
            message: 'SuperAgent is up to date.'
          });
        }
      } catch (err: any) {
        const errMsg = err?.message || String(err);
        const lowerMsg = errMsg.toLowerCase();

        if (
          lowerMsg.includes('404') ||
          lowerMsg.includes('not found') ||
          lowerMsg.includes('could not fetch')
        ) {
          ctx.setUpdateStatus({
            status: 'not-available',
            message: 'SuperAgent is up to date.'
          });
        } else {
          ctx.setUpdateStatus({
            status: 'error',
            message: `Update check failed: ${errMsg}`
          });
        }
      }
      return;
    }

    // 2. Electron / Legacy IPC Environment
    if (ctx.ipc) {
      try {
        const res = await ctx.ipc.invoke('check-for-updates');
        if (res) ctx.setUpdateStatus(res);
      } catch (err: any) {
        ctx.setUpdateStatus({ status: 'error', message: err?.message || String(err) });
      }
      return;
    }

    // 3. Web fallback
    if (typeof fetch !== 'undefined') {
      try {
        const res = await fetch('/api/update/check');
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
      } catch {
        ctx.setUpdateStatus({
          status: 'unsupported',
          message: 'Updates are only managed automatically in the desktop app.'
        });
      }
    } else {
      ctx.setUpdateStatus({ status: 'unsupported', message: 'Updates are only available in the desktop app.' });
    }
  }

  /**
   * Downloads and installs the pending update.
   */
  static async downloadAndInstall(ctx: AppContext): Promise<void> {
    if (isTauriEnv() && cachedPendingUpdate) {
      ctx.setUpdateStatus({
        status: 'downloading',
        message: 'Downloading update...',
        progress: { percent: 0, bytesPerSecond: 0, transferred: 0, total: 0 }
      });

      try {
        let downloaded = 0;
        let totalLength = 0;

        await cachedPendingUpdate.downloadAndInstall((event: any) => {
          switch (event.event) {
            case 'Started':
              totalLength = event.data.contentLength || 0;
              break;
            case 'Progress':
              downloaded += event.data.chunkLength;
              if (totalLength > 0) {
                const pct = Math.round((downloaded / totalLength) * 100);
                ctx.setUpdateStatus({
                  status: 'downloading',
                  message: `Downloading update (${pct}%)…`,
                  progress: {
                    percent: pct,
                    bytesPerSecond: 0,
                    transferred: downloaded,
                    total: totalLength
                  }
                });
              }
              break;
            case 'Finished':
              ctx.setUpdateStatus({
                status: 'downloaded',
                message: 'Update downloaded and verified! Restart to apply.'
              });
              break;
          }
        });

        ctx.setUpdateStatus({
          status: 'downloaded',
          message: 'Update ready to install. Restart the app to apply.'
        });
      } catch (err: any) {
        ctx.setUpdateStatus({
          status: 'error',
          message: err?.message || 'Download failed'
        });
      }
      return;
    }

    if (ctx.ipc) {
      try {
        await ctx.ipc.invoke('download-update');
      } catch (err: any) {
        ctx.setUpdateStatus({ status: 'error', message: err?.message || 'Download failed' });
      }
    }
  }

  /**
   * Restarts the application and applies the downloaded update.
   */
  static async quitAndInstall(ctx: AppContext): Promise<void> {
    if (isTauriEnv()) {
      try {
        const { relaunch } = await import('@tauri-apps/plugin-process');
        await relaunch();
      } catch (err: any) {
        console.error('[UpdateService] Relaunch error:', err);
      }
      return;
    }

    if (ctx.ipc) {
      ctx.ipc.invoke('quit-and-install');
    }
  }
}

