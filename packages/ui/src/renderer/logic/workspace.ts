/**
 * Design-side helpers for the Workspace surface. Currently hosts the
 * desktop media-opener used when the trajectory canvas fires an
 * `openMedia` action click, keeping the IPC boundary out of JSX.
 */
export class WorkspaceService {
  /**
   * Opens a local media file with the OS shell via `openExternalPath`.
   * Outside the desktop shell files cannot be opened directly,
   * so `fallback` is invoked instead (e.g. to surface a toast).
   */
  static openMedia(mediaPath: string | undefined, fallback: () => void): void {
    if (!mediaPath) {
      fallback();
      return;
    }
    import('../lib/ipc.js')
      .then(({ openExternalPath }) => openExternalPath(mediaPath))
      .catch(() => fallback());
  }
}
