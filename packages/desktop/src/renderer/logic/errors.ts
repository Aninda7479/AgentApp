/**
 * `ErrorService` — centralizes error wiring for the renderer. It wraps the
 * shared `errorReporter` helpers so the design layer only calls high-level
 * methods (`install`, `subscribe`, `bindAppError`) and never touches the
 * low-level IPC patching directly.
 */
import { installSafeInvoke, subscribeError } from '../lib/errorReporter';

export class ErrorService {
  /**
   * Installs the crash-safe `ipcRenderer.invoke` patch so that ANY `ipc.invoke`
   * call in the renderer can never produce an unhandled rejection that
   * white-screens the UI. Idempotent. Call once on mount.
   */
  static install(): void {
    installSafeInvoke();
  }

  /**
   * Subscribes to renderer-side errors (e.g. ones logged via `reportError`).
   * The handler typically shows a red toast. Returns an unsubscribe function
   * the caller should invoke on unmount.
   */
  static subscribe(handler: (context: string, message: string) => void): () => void {
    return subscribeError(handler);
  }

  /**
   * Binds the main-process `app-error` IPC channel to a handler so errors
   * forwarded from the main process (e.g. agent crashes) surface as toasts.
   * Returns a cleanup function that removes the listener on unmount.
   */
  static bindAppError(
    ipc: any | null,
    handler: (message: string) => void
  ): () => void {
    if (!ipc || typeof ipc.on !== 'function' || typeof ipc.removeListener !== 'function') {
      return () => {};
    }
    const onAppError = (_event: unknown, payload: { context?: string; message?: string }) => {
      handler(payload?.message || 'Unexpected error');
    };
    ipc.on('app-error', onAppError);
    return () => ipc.removeListener('app-error', onAppError);
  }
}
