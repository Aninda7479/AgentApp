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
    const electron = typeof window !== 'undefined' && (window as any).require
      ? (window as any).require('electron')
      : null;
    if (electron && mediaPath) {
      electron.shell.openPath(mediaPath);
    } else {
      fallback();
    }
  }
}
