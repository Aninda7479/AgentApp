/**
 * Centralized error logging for the MAIN process.
 *
 * Every catchable failure in the app should route through `logError` so it shows
 * up consistently in the devtools/main console as `[ERROR] <context> - <message>`
 * and (when registered) forwards to the renderer as a toast.
 */

let notifyRenderer: ((context: string, message: string) => void) | null = null;

/** main.ts calls this once the main window exists, so main errors can toast in the UI. */
export function registerErrorToasts(fn: (context: string, message: string) => void): void {
  notifyRenderer = fn;
}

/** Normalizes an unknown thrown value into a human-readable string. */
export function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === 'string') return err;
  try {
    return JSON.stringify(err);
  } catch {
    return String(err);
  }
}

/**
 * Logs an error with a stable, grep-able prefix and (optionally) surfaces it as a
 * toast in the desktop UI. Never throws — logging must be safe to call anywhere.
 */
export function logError(context: string, err: unknown): void {
  const message = errorMessage(err);
  // eslint-disable-next-line no-console
  console.error('[ERROR]', context, '-', message);
  if (err instanceof Error && err.stack) {
    // eslint-disable-next-line no-console
    console.error('[ERROR-STACK]', context, '\n' + err.stack);
  }
  if (notifyRenderer) {
    try {
      notifyRenderer(context, message);
    } catch {
      /* logging must never throw */
    }
  }
}

/** Distinct envelope returned by safeHandle so the renderer can detect a failed IPC. */
export interface IpcErrorEnvelope {
  __ipcError: true;
  error: string;
  channel: string;
}
