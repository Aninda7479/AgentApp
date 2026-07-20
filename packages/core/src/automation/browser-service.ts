import { PlaywrightBrowserEngine } from './browser.js';
import { SettingsStorage } from '../storage/settings-store.js';

/**
 * After this much idle time with no automation/screenshot call, the shared
 * Playwright Chromium is torn down so it stops eating ~500 MB+ of RAM.
 * Mirrors the local-Whisper worker idle-unload (desktop/src/main/whisper-local.ts).
 * Every `getSharedInstance()` call resets the timer, so the browser stays up
 * for the whole duration of any automation session and is freed shortly after.
 */
const IDLE_UNLOAD_MS = 5 * 60 * 1000;
let idleTimer: ReturnType<typeof setTimeout> | null = null;

function resetIdleTimer(): void {
  if (idleTimer) clearTimeout(idleTimer);
  idleTimer = setTimeout(() => {
    idleTimer = null;
    void BrowserLifecycleService.closeSharedInstance();
  }, IDLE_UNLOAD_MS);
}

export class BrowserLifecycleService {
  private static instance: PlaywrightBrowserEngine | null = null;

  /**
   * Retrieves the global shared PlaywrightBrowserEngine instance.
   * Configures dynamically based on current user AppSettings.
   */
  public static async getSharedInstance(): Promise<PlaywrightBrowserEngine> {
    // Any use of the browser keeps it alive; it is released only after a
    // sustained idle window (see IDLE_UNLOAD_MS).
    resetIdleTimer();
    if (!this.instance) {
      let config: any = { headless: true };
      try {
        const settings = SettingsStorage.loadSettings();
        if (settings.browserUse) {
          config = {
            headless: settings.browserUse.headless !== false,
            viewport: settings.browserUse.width && settings.browserUse.height
              ? { width: settings.browserUse.width, height: settings.browserUse.height }
              : { width: 1280, height: 720 },
            userAgent: settings.browserUse.userAgent,
            timeout: settings.browserUse.timeout ? settings.browserUse.timeout * 1000 : 30000,
            connectToActiveChrome: settings.browserUse.connectToActiveChrome || false,
            chromeDebugPort: settings.browserUse.chromeDebugPort || 9222,
            useUserProfile: settings.browserUse.useUserProfile || false,
            userProfilePath: settings.browserUse.userProfilePath || ''
          };
        }
      } catch {
        // Fallback
      }
      this.instance = new PlaywrightBrowserEngine(config);
    }
    if (!this.instance.isInitialized()) {
      await this.instance.initialize();
    }
    return this.instance;
  }

  /**
   * Discards the shared browser context and cleans up session locks.
   */
  public static async closeSharedInstance(): Promise<void> {
    if (idleTimer) {
      clearTimeout(idleTimer);
      idleTimer = null;
    }
    if (this.instance) {
      await this.instance.close();
      this.instance = null;
    }
  }
}
