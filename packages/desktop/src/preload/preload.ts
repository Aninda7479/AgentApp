/**
 * Preload script — the ONLY bridge between the sandboxed/isolated renderer and
 * the privileged Electron main process.
 *
 * Renderer windows run with `contextIsolation: true` + `nodeIntegration: false`
 * (and the OS sandbox on all windows except the pet), so they cannot `require()`
 * Node/Electron or touch `ipcRenderer` directly. This script — which executes in
 * a context that *does* have Node — exposes a small, frozen, typed API on
 * `window.superagent` via `contextBridge`. It never exposes the raw
 * `ipcRenderer`, `shell`, or any Node module; only narrow functions.
 *
 * Every channel the renderer may *invoke* or *send* is checked against
 * ALLOWED_CHANNELS (defense-in-depth; main.ts also validates the sender). This
 * set is exported and imported by main.ts so the two stay in sync.
 */
import type { IpcRendererEvent } from 'electron';
import { contextBridge, ipcRenderer } from 'electron';

/** Channels the renderer is permitted to initiate (invoke/send). */
export const ALLOWED_CHANNELS = new Set<string>([
  // settings / store
  'settings-read',
  'settings-write',
  'global-memory-read',
  'global-memory-add-profile',
  'global-memory-delete-profile',
  'global-memory-add-insight',
  'global-memory-delete-insight',
  'global-memory-save-instructions',
  'store-read',
  'store-write',
  // chat trajectory steps (lazy per-chat disk read)
  'chat-steps-read',
  // agent engine
  'agent-run',
  'agent-stop',
  'agent-list',
  'agent-compact',
  'agent-permission-response',
  // providers / orchestrator
  'auto-detect-providers',
  'provider-test-connection',
  'provider-proxy',
  'provider-health-diagnostics',
  'orchestrator-read-instructions',
  'orchestrator-write-instructions',
  'orchestrator-update-instructions',
  'orchestrator-optimize-instructions-by-ai',
  // media / transcription / whisper
  'media-transcribe',
  'whisper-local-status',
  'whisper-local-progress',
  'whisper-local-download',
  'whisper-local-delete',
  'whisper-local-setdir',
  // file picking + chat media
  'select-files',
  'select-project-folders',
  'pick-image-file',
  'copy-file-to-chat',
  'save-chat-media-buffer',
  'read-file-base64',
  'screenshot_screen',
  // browser automation
  'browser-screenshot',
  'browser-navigate',
  'browser-close',
  // mcp
  'mcp-list',
  'mcp-catalog',
  'mcp-connect',
  'mcp-disconnect',
  'mcp-call',
  'mcp-install',
  // skills / plugins
  'skills-list',
  'skills-catalog',
  'skills-import-check',
  'skills-import-perform',
  'plugins-catalog',
  // partner / pet
  'partner-list',
  'partner-get',
  'partner-get-active',
  'partner-set-active',
  'partner-remove',
  'partner-install',
  'partner-export',
  'partner-import-json',
  'partner-import-model',
  'partner-import-model-folder',
  'partner-pick-model-file',
  'partner-pick-model-folder',
  'pet-start',
  'pet-stop',
  'pet-status',
  'pet-set-visible',
  'pet-set-partner',
  'pet-say',
  // 3D studio
  'three-d-list-models',
  'three-d-generate',
  'three-d-delete-model',
  'three-d-import-external-model',
  // artifacts
  'artifact:list',
  'artifact:start',
  'artifact:stop',
  'artifact:open',
  'artifact:openFolder',
  'artifact:create',
  'artifact:delete',
  'artifact:stateChanged',
  // circle search
  'circle-search-get-screen-image',
  'circle-search-submit',
  // kanban
  'kanban-load',
  'kanban-save',
  // usage
  'usage-records',
  'usage-summary',
  'usage-pricing',
  'usage-clear',
  // web server
  'web-start',
  'web-stop',
  'web-status',
  'web-change-password',
  // updates / system
  'check-for-updates',
  'app-version',
  'system-info',
  // voice daemon (renderer -> main signalling)
  'voice-daemon-audio-captured',
  // window controls (overlay windows)
  'window-close',
  'window-minimize',
  'window-maximize',
  // external link opening
  'open-external',
  // privileged ops routed through main (see main.ts handlers)
  'shell-open-path',
  'loop-read',
  // ── main → renderer EVENT channels (renderer subscribes via ipc.on) ──
  // These are emitted by the main process and received by the renderer; the
  // allowlist gates `on`/`off` too, so they must be listed or subscriptions
  // throw and white-screen the UI.
  'agent-event',
  'agent-permission-request',
  'app-error',
  'circle-search-window-shown',
  'circle-search-stream-chunk',
  'pet-running',
  'pet-behavior',
  'pet-context',
  'pet-mood',
  'pet-partner',
  'voice-daemon-event',
  'voice-daemon-inject',
  // fire-and-forget sends from the renderer with no main-side handler
  'voice-recording-failed',
  'circle-search-hide',
]);

function check(channel: string): string {
  if (!ALLOWED_CHANNELS.has(channel)) {
    throw new Error(`[preload] blocked IPC channel not in allowlist: ${channel}`);
  }
  return channel;
}

const listenersMap = new WeakMap<(...args: any[]) => void, (...args: any[]) => void>();

/**
 * `on` strips the Electron event object before invoking the renderer listener
 * (the raw event exposes `sender`/ipcRenderer, which must never leak). To maintain
 * parameter-index compatibility with listeners defined as `(event, payload) => void`,
 * we pass `null` as the first argument, and then forward the payload.
 * Returns an unsubscribe function for clean teardown.
 */
function subscribe(channel: string, listener: (...args: any[]) => void): () => void {
  const wrapped = (_event: IpcRendererEvent, ...args: any[]) => listener(null, ...args);
  listenersMap.set(listener, wrapped);
  ipcRenderer.on(check(channel), wrapped);
  return () => {
    ipcRenderer.off(check(channel), wrapped);
    listenersMap.delete(listener);
  };
}

function unsubscribe(channel: string, listener: (...args: any[]) => void): void {
  const wrapped = listenersMap.get(listener);
  if (wrapped) {
    ipcRenderer.off(check(channel), wrapped);
    listenersMap.delete(listener);
  } else {
    ipcRenderer.off(check(channel), listener);
  }
}

const api = {
  isElectron: true,
  ipc: {
    invoke: (channel: string, ...args: any[]): Promise<any> =>
      ipcRenderer.invoke(check(channel), ...args),
    send: (channel: string, ...args: any[]): void => {
      ipcRenderer.send(check(channel), ...args);
    },
    on: (channel: string, listener: (...args: any[]) => void): (() => void) =>
      subscribe(channel, listener),
    off: (channel: string, listener: (...args: any[]) => void): void => {
      unsubscribe(channel, listener);
    },
  },
  // Privileged helpers — implemented as IPC handlers in main.ts (sender-validated).
  shell: {
    openPath: (targetPath: string): Promise<string> =>
      ipcRenderer.invoke(check('shell-open-path'), targetPath),
  },
  loop: {
    read: (workspacePath: string): Promise<string | null> =>
      ipcRenderer.invoke(check('loop-read'), workspacePath),
  },
};

// contextBridge objects are frozen by Electron; expose once.
contextBridge.exposeInMainWorld('superagent', api);

export {};
