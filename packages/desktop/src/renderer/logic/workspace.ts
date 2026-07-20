/**
 * Design-side helpers for the Workspace surface. Currently hosts the
 * Electron-shell media-opener used when the trajectory canvas fires an
 * `openMedia` action click, keeping the Electron boundary out of JSX.
 */
export class WorkspaceService {
  /**
   * Opens a local media file with the OS shell via Electron's
   * `shell.openPath`. Outside the Electron shell files cannot be opened,
   * so `fallback` is invoked instead (e.g. to surface a toast).
   */
  static openMedia(mediaPath: string | undefined, fallback: () => void): void {
    if (!mediaPath) {
      fallback();
      return;
    }
    // `openPath` is routed through the main process (renderer has no `shell`
    // under contextIsolation). On a non-Electron host the bridge no-ops.
    import('../lib/electron.js')
      .then(({ openExternalPath }) => openExternalPath(mediaPath))
      .catch(() => fallback());
  }
}
