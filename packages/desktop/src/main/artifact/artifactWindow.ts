import { BrowserWindow } from 'electron';
import path from 'path';

interface WindowOptions {
  id: string;
  title: string;
  url: string;
  width?: number;
  height?: number;
  resizable?: boolean;
}

/**
 * Manages dedicated floating windows for open micro-apps.
 */
export class ArtifactWindowManager {
  private windows: Map<string, BrowserWindow> = new Map();

  /**
   * Opens or focuses an existing window for a running micro-app.
   */
  public openArtifactWindow(options: WindowOptions): BrowserWindow {
    const existing = this.windows.get(options.id);
    if (existing && !existing.isDestroyed()) {
      existing.show();
      existing.focus();
      return existing;
    }

    const win = new BrowserWindow({
      width: options.width || 480,
      height: options.height || 640,
      minWidth: 320,
      minHeight: 400,
      resizable: options.resizable !== false,
      title: options.title,
      autoHideMenuBar: true,
      backgroundColor: '#0f172a',
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true
      }
    });

    win.loadURL(options.url);

    win.on('closed', () => {
      this.windows.delete(options.id);
    });

    this.windows.set(options.id, win);
    return win;
  }

  /**
   * Closes an artifact window if open.
   */
  public closeArtifactWindow(id: string): void {
    const win = this.windows.get(id);
    if (win && !win.isDestroyed()) {
      win.close();
    }
    this.windows.delete(id);
  }

  public closeAll(): void {
    for (const [, win] of this.windows) {
      if (!win.isDestroyed()) {
        win.close();
      }
    }
    this.windows.clear();
  }
}
