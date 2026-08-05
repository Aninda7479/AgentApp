import { SettingsStorage } from '@superagent/core';
import { windowManager } from './window';

/**
 * Optional Electron auto-updater wiring.
 *
 * `electron-updater` is a runtime dependency (declared in `dependencies`, not
 * `devDependencies`) so that electron-builder bundles it into the packaged
 * app.asar. This module still loads it lazily and no-ops gracefully if the
 * import fails for any reason, so dev runs behave exactly as before.
 *
 * Updates are served from the GitHub Releases feed configured under the
 * `build.publish` key in package.json. To point at a private feed instead, set:
 *   SUPERAGENT_UPDATE_SERVER=https://example.com/update/...
 * Disable entirely with SUPERAGENT_DISABLE_UPDATER=1.
 */
export async function setupAutoUpdater(): Promise<void> {
  if (process.env.SUPERAGENT_DISABLE_UPDATER === '1') return;

  try {
    // @ts-ignore - optional dependency, present only in packaged builds
    const updaterModule = await import('electron-updater');
    const autoUpdater = updaterModule.autoUpdater || updaterModule.default?.autoUpdater;

    if (!autoUpdater) {
      throw new Error('autoUpdater is not defined in electron-updater module');
    }

    autoUpdater.logger = console;
    autoUpdater.autoDownload = true;
    autoUpdater.autoInstallOnAppQuit = true;

    const feed = process.env.SUPERAGENT_UPDATE_SERVER;
    if (feed) {
      // @ts-ignore - generic provider config
      autoUpdater.setFeedURL({ provider: 'generic', url: feed });
    }

    const settings = SettingsStorage.loadSettings();
    const releaseChannel = settings?.general?.releaseChannel || 'stable';
    autoUpdater.channel = releaseChannel === 'beta' ? 'beta' : 'latest';
    console.log(`[updater] Release channel configured: ${autoUpdater.channel}`);

    function notifyRenderer(status: string, message: string, version?: string, progress?: any) {
      const win = windowManager.getMainWindow();
      if (win && win.webContents) {
        win.webContents.send('update-status-changed', { status, message, version, progress });
      }
    }

    autoUpdater.on('checking-for-update', () => {
      console.log('[updater] checking-for-update');
      notifyRenderer('checking', 'Checking for updates…');
    });

    autoUpdater.on('update-available', (info: { version?: string }) => {
      console.log(`[updater] update available: v${info?.version ?? '?'}`);
      notifyRenderer('available', `Update available: v${info?.version ?? '?'}`, info?.version);
    });

    autoUpdater.on('update-not-available', (info: { version?: string }) => {
      console.log(`[updater] update not available: v${info?.version ?? '?'}`);
      notifyRenderer('not-available', `You are on the latest version (v${info?.version ?? '?'}).`, info?.version);
    });

    autoUpdater.on('download-progress', (progressObj: any) => {
      const speedMB = (progressObj.bytesPerSecond / (1024 * 1024)).toFixed(1);
      const percent = Math.round(progressObj.percent);
      const msg = `Downloading update: ${percent}% (${speedMB} MB/s)`;
      notifyRenderer('downloading', msg, undefined, {
        percent,
        bytesPerSecond: progressObj.bytesPerSecond,
        transferred: progressObj.transferred,
        total: progressObj.total
      });
    });

    autoUpdater.on('update-downloaded', (info: { version?: string }) => {
      console.log(`[updater] update downloaded: v${info?.version ?? '?'}; will install on quit`);
      notifyRenderer('downloaded', `Update downloaded: v${info?.version ?? '?'}. Ready to install!`, info?.version);
    });

    autoUpdater.on('error', (err: Error) => {
      const message = err?.message ?? String(err);
      console.error('[updater] error:', message);
      notifyRenderer('error', message);
    });

    await autoUpdater.checkForUpdatesAndNotify();
  } catch (err) {
    // electron-updater not installed (dev) or dynamic import failed — skip.
    console.log('[updater] disabled (electron-updater not installed or failed to configure)', err);
  }
}
