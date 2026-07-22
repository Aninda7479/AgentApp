import { BrowserWindow, screen, Tray } from 'electron';
import path from 'path';

export class SystemTrayCardWindow {
  private window: BrowserWindow | null = null;
  private isVisible: boolean = false;

  constructor() {}

  public getOrCreateWindow(): BrowserWindow {
    if (this.window && !this.window.isDestroyed()) {
      return this.window;
    }

    const distPath = path.join(__dirname, '..', '..');
    const htmlPath = path.join(distPath, 'tray.html');

    this.window = new BrowserWindow({
      width: 380,
      height: 520,
      show: false,
      frame: false,
      fullscreenable: false,
      resizable: false,
      transparent: true,
      alwaysOnTop: true,
      skipTaskbar: true,
      backgroundColor: '#00000000',
      webPreferences: {
        nodeIntegration: true,
        contextIsolation: false
      }
    });

    this.window.loadFile(htmlPath);

    // Hide window when it loses focus (clicked outside)
    this.window.on('blur', () => {
      this.hide();
    });

    return this.window;
  }

  public toggle(trayInstance: Tray): void {
    if (this.isVisible && this.window && !this.window.isDestroyed()) {
      this.hide();
    } else {
      this.show(trayInstance);
    }
  }

  public show(trayInstance: Tray): void {
    const win = this.getOrCreateWindow();
    this.positionWindow(trayInstance, win);
    win.show();
    win.focus();
    this.isVisible = true;
  }

  public hide(): void {
    if (this.window && !this.window.isDestroyed()) {
      this.window.hide();
    }
    this.isVisible = false;
  }

  private positionWindow(tray: Tray, win: BrowserWindow): void {
    if (!tray || typeof tray.getBounds !== 'function') {
      win.center();
      return;
    }

    const trayBounds = tray.getBounds();
    const display = screen.getDisplayMatching(trayBounds);
    const workArea = display.workArea;
    const [winWidth, winHeight] = win.getSize();

    // Default calculations (bottom taskbar vs top menu bar)
    let x = Math.round(trayBounds.x + trayBounds.width / 2 - winWidth / 2);
    let y = Math.round(trayBounds.y - winHeight - 8);

    // If tray is at top of screen (macOS or Windows top taskbar)
    if (trayBounds.y < workArea.y + workArea.height / 2) {
      y = Math.round(trayBounds.y + trayBounds.height + 8);
    }

    // Clamp horizontal boundaries to remain inside work area
    if (x + winWidth > workArea.x + workArea.width) {
      x = workArea.x + workArea.width - winWidth - 12;
    }
    if (x < workArea.x) {
      x = workArea.x + 12;
    }

    // Clamp vertical boundaries
    if (y + winHeight > workArea.y + workArea.height) {
      y = workArea.y + workArea.height - winHeight - 12;
    }
    if (y < workArea.y) {
      y = workArea.y + 12;
    }

    win.setPosition(x, y, false);
  }

  public destroy(): void {
    if (this.window && !this.window.isDestroyed()) {
      this.window.destroy();
    }
    this.window = null;
    this.isVisible = false;
  }
}
