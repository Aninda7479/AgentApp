/**
 * Canonical Electron/IPC bridge for the RENDERER.
 *
 * With `contextIsolation: true` + `nodeIntegration: false`, the renderer no longer
 * has direct access to `require('electron')` / `ipcRenderer`. Instead the preload
 * (`src/preload/preload.ts`) exposes a frozen `window.superagent` API via
 * `contextBridge`. This module is the single import target for every component
 * that needs IPC, replacing the previous scatter of
 * `(window as any).require('electron').ipcRenderer` casts.
 *
 * It also owns the `wrapInvoke` envelope (moved here from errorReporter): every
 * `invoke` is crash-safe — IPC errors are reported as toasts and resolve to
 * `null` instead of throwing and white-screening the UI. A `legacyRequireShim`
 * fallback keeps non-Electron hosts (and a transitional period with
 * `nodeIntegration` still on) working by resolving the old `window.require`.
 */

import { reportError, type IpcErrorEnvelope } from './errorReporter';

interface SuperagentApi {
  isElectron: boolean;
  ipc: {
    invoke: (channel: string, ...args: any[]) => Promise<any>;
    send: (channel: string, ...args: any[]) => void;
    on: (channel: string, listener: (...args: any[]) => void) => () => void;
    off: (channel: string, listener: (...args: any[]) => void) => void;
  };
  shell: { openPath: (targetPath: string) => Promise<string> };
  loop: { read: (workspacePath: string) => Promise<string | null> };
}

function superagent(): SuperagentApi | null {
  return (window as any).superagent ?? null;
}

/**
 * Legacy shim for when the preload bridge is absent (web build, or a window
 * still running with `nodeIntegration: true`). Resolves the old
 * `window.require('electron')` shape so callers keep working; returns null when
 * Electron is genuinely unavailable (pure web host).
 */
function legacyRequireShim(): { ipcRenderer: any } | null {
  try {
    const electron = (window as any).require?.('electron');
    if (electron?.ipcRenderer) return { ipcRenderer: electron.ipcRenderer };
  } catch {
    /* not in Electron */
  }
  return null;
}

/**
 * Resolves the active IPC surface as a DUAL value (so BOTH call-site styles
 * keep working):
 *   - callable: `ipc(channel, listenerFn)` registers a listener (on) and returns
 *     an unsubscribe fn; `await ipc(channel, ...args)` performs an invoke.
 *     This preserves the legacy `ipcRenderer(channel, ...)` convention still
 *     used by several components (VoiceIndicator, CircleSearchOverlay,
 *     PartnerOverlay, PetControls, companion/library, logic/window).
 *   - object: `ipc.invoke / ipc.send / ipc.on / ipc.off / ipc.removeListener`
 *     for the newer call sites (App.tsx, etc.).
 * Prefers the preload bridge; falls back to the legacy `window.require` shape.
 * Returns null when Electron is genuinely unavailable (pure web host).
 */
export function getIpc(): any | null {
  const api = superagent();
  if (api) {
    const bridge = makeIpcBridge(api.ipc, api.shell);
    return bridge;
  }
  // Legacy path (nodeIntegration still on / web shim).
  const legacy = legacyRequireShim();
  return legacy ? makeIpcBridge(legacy.ipcRenderer) : null;
}

/**
 * Builds the dual callable+object IPC bridge around a surface that exposes
 * `{ invoke, send, on, off }` (the preload `api.ipc` or a raw `ipcRenderer`).
 */
function makeIpcBridge(
  surface: { invoke: (...a: any[]) => any; send: (...a: any[]) => any; on: (...a: any[]) => any; off: (...a: any[]) => any },
  shell?: { openPath: (targetPath: string) => Promise<string> }
): any {
  // Crash-safe invoke (mirrors the wrapper used by the top-level `invoke` export):
  // IPC errors resolve to null instead of throwing and white-screening the UI.
  const safeInvoke = wrapInvoke((ch: string, ...a: any[]) => surface.invoke(ch, ...a));

  const bridge: any = (channel: string, ...args: any[]) => {
    // A function argument means "register a listener" (legacy ipcRenderer.on).
    const fn = args.find((a) => typeof a === 'function');
    if (fn) return surface.on(channel, fn);
    // Otherwise treat it as an invoke (returns a promise).
    return safeInvoke(channel, ...args);
  };

  bridge.invoke = safeInvoke;
  bridge.send = (ch: string, ...a: any[]) => surface.send(ch, ...a);
  bridge.on = (ch: string, fn: (...a: any[]) => void) => surface.on(ch, fn);
  bridge.off = (ch: string, fn: (...a: any[]) => void) => surface.off(ch, fn);
  // Aliases used by some call sites.
  bridge.removeListener = (ch: string, fn: (...a: any[]) => void) => surface.off(ch, fn);
  bridge.removeAllListeners = (_ch?: string) => {
    /* no-op: renderer can't clear main-side listeners */
  };
  if (shell) {
    bridge.shell = shell;
  }
  return bridge;
}

/** True when running inside the Electron shell (preload bridge present). */
export function isElectron(): boolean {
  return !!superagent();
}

function wrapInvoke(fn: (channel: string, ...args: any[]) => Promise<any>) {
  return async (channel: string, ...args: any[]): Promise<any> => {
    try {
      const result = await fn(channel, ...args);
      if (result && typeof result === 'object' && (result as IpcErrorEnvelope).__ipcError) {
        reportError('ipc:' + channel, (result as IpcErrorEnvelope).error);
        return null;
      }
      // App handlers universally signal failure with `{ ok: false, error }`.
      if (result && typeof result === 'object' && result.ok === false && result.error) {
        reportError('ipc:' + channel, result.error);
      }
      return result;
    } catch (err) {
      reportError('ipc:' + channel, err);
      return null;
    }
  };
}

export function invoke(channel: string, ...args: unknown[]): Promise<any> {
  const api = superagent();
  if (api) return wrapInvoke((ch, ...a) => api.ipc.invoke(ch, ...a))(channel, ...args);
  const legacy = legacyRequireShim();
  if (!legacy) {
    reportError('ipc:' + channel, 'ipcRenderer unavailable in renderer');
    return Promise.resolve(null);
  }
  return wrapInvoke((ch, ...a) => legacy.ipcRenderer.invoke(ch, ...a))(channel, ...args);
}

export function send(channel: string, ...args: unknown[]): void {
  const api = superagent();
  if (api) {
    api.ipc.send(channel, ...args);
    return;
  }
  legacyRequireShim()?.ipcRenderer.send(channel, ...args);
}

export function on(channel: string, listener: (...args: any[]) => void): () => void {
  const api = superagent();
  if (api) return api.ipc.on(channel, listener);
  return legacyRequireShim()?.ipcRenderer.on(channel, listener) ?? (() => {});
}

export function off(channel: string, listener: (...args: any[]) => void): void {
  const api = superagent();
  if (api) {
    api.ipc.off(channel, listener);
    return;
  }
  legacyRequireShim()?.ipcRenderer.off(channel, listener);
}

/** Open a file/folder with the OS shell (routed through the main process). */
export function openExternalPath(targetPath: string): Promise<string> {
  const api = superagent();
  if (api) return api.shell.openPath(targetPath);
  reportError('shell:openPath', 'shell bridge unavailable');
  return Promise.resolve('');
}

/** Read a workspace's `.superagent/loop.md` / `.claude/loop.md` (main process). */
export function readLoopPrompt(workspacePath: string): Promise<string | null> {
  const api = superagent();
  if (api) return api.loop.read(workspacePath);
  return Promise.resolve(null);
}
