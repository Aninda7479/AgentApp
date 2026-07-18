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
    const { autoUpdater } = await import('electron-updater');

    autoUpdater.logger = console;
    autoUpdater.autoDownload = true;
    autoUpdater.autoInstallOnAppQuit = true;

    const feed = process.env.SUPERAGENT_UPDATE_SERVER;
    if (feed) {
      // @ts-ignore - generic provider config
      autoUpdater.setFeedURL({ provider: 'generic', url: feed });
    }

    autoUpdater.on('update-available', (info: { version?: string }) => {
      console.log(`[updater] update available: v${info?.version ?? '?'}`);
    });
    autoUpdater.on('update-downloaded', (info: { version?: string }) => {
      console.log(`[updater] update downloaded: v${info?.version ?? '?'}; will install on quit`);
    });
    autoUpdater.on('error', (err: Error) => {
      console.error('[updater] error:', err?.message ?? err);
    });

    await autoUpdater.checkForUpdatesAndNotify();
  } catch {
    // electron-updater not installed (dev) or dynamic import failed — skip.
    console.log('[updater] disabled (electron-updater not installed)');
  }
}
