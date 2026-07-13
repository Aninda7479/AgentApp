import { PlaywrightBrowserEngine } from './browser.js';
import { SettingsStorage } from '../storage/settings-store.js';

export class BrowserLifecycleService {
  private static instance: PlaywrightBrowserEngine | null = null;

  /**
   * Retrieves the global shared PlaywrightBrowserEngine instance.
   * Configures dynamically based on current user AppSettings.
   */
  public static async getSharedInstance(): Promise<PlaywrightBrowserEngine> {
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
    if (this.instance) {
      await this.instance.close();
      this.instance = null;
    }
  }
}
