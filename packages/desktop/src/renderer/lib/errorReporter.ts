/**
 * Centralized error reporting for the RENDERER process.
 *
 * `reportError` logs to the console AND notifies subscribers (App.tsx wires a
 * subscriber that shows a red toast). `safeInvoke` is a crash-safe IPC invoke
 * for callers that want an explicit promise (it delegates to the canonical
 * bridge in `./electron`, which already wraps every `invoke` with the same
 * error envelope).
 *
 * Note: this module no longer patches the live `ipcRenderer.invoke`. Under
 * `contextIsolation: true` the preload's `contextBridge` object is frozen and
 * cannot be mutated; the envelope now lives permanently in `./electron`.
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

/** Resolves the renderer ipc surface via the canonical bridge. */
function getIpc(): any | null {
  // Lazy import avoids a hard dependency cycle at module init.
  const { getIpc: bridge } = require('./electron') as typeof import('./electron');
  return bridge();
}

/**
 * Historically patched the live `ipcRenderer.invoke` so every call in the
 * renderer was crash-safe. Under `contextIsolation` the preload bridge is
 * frozen and the envelope is applied permanently in `./electron`, so this is
 * now a no-op kept for API compatibility.
 */
export function installSafeInvoke(): void {
  /* envelope is applied in ./electron for every invoke */
}

/**
 * Explicitly safe IPC invoke for new code. Returns null on failure instead of
 * throwing. Delegates to `./electron.invoke`, which already applies the
 * error envelope (reports toasts, resolves null on error).
 */
export async function safeInvoke<T = unknown>(channel: string, ...args: unknown[]): Promise<T | null> {
  const { invoke } = await import('./electron');
  return (await invoke(channel, ...args)) as T | null;
}
