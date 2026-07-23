import { BrowserWindow, globalShortcut, app, screen } from 'electron';
import path from 'path';

export interface HotkeyOverlayOptions {
  shortcut?: string;
  preloadPath: string;
}

export class HotkeyOverlayManager {
  private overlayWindow: BrowserWindow | null = null;
  private shortcut: string;
  private preloadPath: string;

  constructor(options: HotkeyOverlayOptions) {
    this.shortcut = options.shortcut || 'CommandOrControl+Alt+Space';
    this.preloadPath = options.preloadPath;
  }

  public initialize(): void {
    this.registerGlobalShortcut();
  }

  public registerGlobalShortcut(): boolean {
    try {
      globalShortcut.unregister(this.shortcut);
      const ret = globalShortcut.register(this.shortcut, () => {
        this.toggleOverlay();
      });

      if (!ret) {
        console.warn(`[HotkeyOverlay] Registration failed for shortcut: ${this.shortcut}`);
      } else {
        console.log(`[HotkeyOverlay] Successfully registered global shortcut: ${this.shortcut}`);
      }
      return ret;
    } catch (err) {
      console.error(`[HotkeyOverlay] Error registering global shortcut:`, err);
      return false;
    }
  }

  public showOverlay(): void {
    if (!this.overlayWindow || this.overlayWindow.isDestroyed()) {
      this.createOverlayWindow();
    }

    if (this.overlayWindow) {
      const primaryDisplay = screen.getPrimaryDisplay();
      const { width: displayWidth, height: displayHeight } = primaryDisplay.workAreaSize;
      const winWidth = 750;
      const winHeight = 220; // Expanded to accommodate screen snippet preview
      const x = Math.round((displayWidth - winWidth) / 2);
      const y = Math.round(displayHeight * 0.22); // Position 22% from top like Raycast/Spotlight

      this.overlayWindow.setPosition(x, y);
      this.overlayWindow.show();
      this.overlayWindow.focus();
    }
  }

  public async showOverlayWithCapture(): Promise<void> {
    this.showOverlay();
    if (this.overlayWindow && !this.overlayWindow.isDestroyed()) {
      this.overlayWindow.webContents.send('overlay-trigger-capture');
    }
  }

  public hideOverlay(): void {
    if (this.overlayWindow && !this.overlayWindow.isDestroyed()) {
      this.overlayWindow.hide();
    }
  }

  public toggleOverlay(): void {
    if (this.overlayWindow && !this.overlayWindow.isDestroyed() && this.overlayWindow.isVisible()) {
      this.hideOverlay();
    } else {
      this.showOverlay();
    }
  }

  public setShortcut(newShortcut: string): boolean {
    this.shortcut = newShortcut;
    return this.registerGlobalShortcut();
  }

  public destroy(): void {
    globalShortcut.unregister(this.shortcut);
    if (this.overlayWindow && !this.overlayWindow.isDestroyed()) {
      this.overlayWindow.destroy();
      this.overlayWindow = null;
    }
  }

  private createOverlayWindow(): void {
    this.overlayWindow = new BrowserWindow({
      width: 750,
      height: 180,
      frame: false,
      transparent: true,
      alwaysOnTop: true,
      skipTaskbar: true,
      resizable: false,
      show: false,
      backgroundColor: '#00000000',
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true,
        preload: this.preloadPath,
      },
    });

    const overlayHtmlPath = path.join(__dirname, '..', 'overlay.html');
    this.overlayWindow.loadFile(overlayHtmlPath).catch(() => {
      // Fallback if overlay.html is in assets or root src
      this.overlayWindow?.loadURL(`file://${path.join(app.getAppPath(), 'src', 'overlay.html')}`);
    });

    this.overlayWindow.on('blur', () => {
      // Hide on click outside
      this.hideOverlay();
    });
  }
}
