/**
 * `WindowService` — wraps the Electron window-control IPC calls (minimize /
 * maximize / close) used by the title bar. The design layer just calls
 * `control`; there is no renderer-side state to manage.
 */
export class WindowService {
  /**
   * Sends a minimize / maximize / close command to the Electron main process via
   * `ipcRenderer.send`. Outside Electron (web / test) it logs a warning and does
   * nothing, so callers can invoke it unconditionally.
   */
  static control(action: 'minimize' | 'maximize' | 'close'): void {
    if (typeof window !== 'undefined' && (window as any).require) {
      try {
        const { ipcRenderer } = (window as any).require('electron');
        ipcRenderer.send(`window-${action}`);
      } catch (e) {
        console.warn(`Window control ${action} failed outside Electron`, e);
      }
    }
  }

  /**
   * Detects whether the app is running inside the Electron shell. The web build
   * injects a mock `window.require`, so that is NOT a reliable signal — the
   * stable marker is Electron's unique "Electron" user-agent string.
   */
  static isElectron(): boolean {
    return typeof navigator !== 'undefined' && /electron/i.test(navigator.userAgent || '');
  }
}
