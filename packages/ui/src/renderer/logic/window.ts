import { getIpc, isDesktopApp } from '../lib/ipc';

/**
 * `WindowService` — wraps window-control IPC calls (minimize / maximize / close)
 * used by the title bar.
 */
export class WindowService {
  /**
   * Sends a minimize / maximize / close command to the desktop host.
   */
  static control(action: 'minimize' | 'maximize' | 'close'): void {
    const ipc = getIpc();
    if (ipc) {
      try {
        ipc.send(`window-${action}`);
      } catch (e) {
        console.warn(`Window control ${action} failed outside desktop`, e);
      }
    }
  }

  /**
   * Detects whether the app is running inside the desktop app shell (Tauri).
   */
  static isDesktop(): boolean {
    return isDesktopApp();
  }
}
