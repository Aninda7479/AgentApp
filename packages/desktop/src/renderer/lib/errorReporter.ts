/**
 * Centralized error reporting for the RENDERER process.
 *
 * `reportError` logs to the console AND notifies subscribers (App.tsx wires a
 * subscriber that shows a red toast). `installSafeInvoke` patches the live
 * `ipcRenderer.invoke` so EVERY `ipc.invoke(...)` call in the renderer — including
 * all the pre-existing ones across components — can never produce an unhandled
 * rejection that white-screens the UI. `safeInvoke` is the explicit equivalent for
 * new code.
 */

export interface IpcErrorEnvelope {
  __ipcError: true;
  error: string;
  channel: string;
}

type ErrorListener = (context: string, message: string) => void;
const listeners = new Set<ErrorListener>();

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
 * Logs an error to the console and notifies all subscribers (which surface a toast).
 * Never throws.
 */
export function reportError(context: string, err: unknown): void {
  const message = errorMessage(err);
  // eslint-disable-next-line no-console
  console.error('[ERROR]', context, '-', message);
  if (err instanceof Error && err.stack) {
    // eslint-disable-next-line no-console
    console.error('[ERROR-STACK]', context, '\n' + err.stack);
  }
  for (const fn of listeners) {
    try {
      fn(context, message);
    } catch {
      /* logging must never throw */
    }
  }
}

/** Subscribe to renderer-side errors. Returns an unsubscribe function. */
export function subscribeError(fn: ErrorListener): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

/** Resolves the renderer ipcRenderer the same way the rest of the app does. */
function getIpc(): any | null {
  try {
    return (window as any).require('electron')?.ipcRenderer ?? null;
  } catch {
    return null;
  }
}

function wrapInvoke(invoke: (channel: string, ...args: any[]) => Promise<any>) {
  return async (channel: string, ...args: any[]): Promise<any> => {
    try {
      const result = await invoke(channel, ...args);
      if (result && typeof result === 'object' && (result as IpcErrorEnvelope).__ipcError) {
        reportError('ipc:' + channel, (result as IpcErrorEnvelope).error);
        return null;
      }
      return result;
    } catch (err) {
      reportError('ipc:' + channel, err);
      return null;
    }
  };
}

let patched = false;

/**
 * Patches the live `ipcRenderer.invoke` so all `ipc.invoke(...)` calls anywhere in
 * the renderer become crash-safe (catches rejections, logs them, returns null).
 * Idempotent and safe to call multiple times.
 */
export function installSafeInvoke(): void {
  if (patched) return;
  const ipc = getIpc();
  if (!ipc || typeof ipc.invoke !== 'function') return;
  const original = ipc.invoke.bind(ipc);
  ipc.invoke = wrapInvoke(original) as typeof ipc.invoke;
  patched = true;
}

/**
 * Explicitly safe IPC invoke for new code. Returns null on failure instead of
 * throwing.
 */
export async function safeInvoke<T = unknown>(channel: string, ...args: unknown[]): Promise<T | null> {
  installSafeInvoke();
  const ipc = getIpc();
  if (!ipc) {
    reportError('ipc:' + channel, 'ipcRenderer unavailable in renderer');
    return null;
  }
  return (ipc.invoke(channel, ...args) as Promise<T | null>);
}
