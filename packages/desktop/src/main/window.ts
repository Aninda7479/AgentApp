import { BrowserWindow, BrowserWindowConstructorOptions, app, ipcMain } from 'electron';
import path from 'path';

export interface ManagedWindowOptions extends BrowserWindowConstructorOptions {
  name?: string;
  isMainWindow?: boolean;
}

export class WindowManager {
  private windows: Map<number, BrowserWindow> = new Map();
  private windowsByName: Map<string, number> = new Map();
  private mainWindowId: number | null = null;

  constructor() {
    this.setupIpcHandlers();
  }

  public createMainWindow(options: ManagedWindowOptions = {}): BrowserWindow {
    const defaultOptions: ManagedWindowOptions = {
      width: 1280,
      height: 800,
      minWidth: 900,
      minHeight: 600,
      frame: false, // Frameless window for Codex UI clone
      titleBarStyle: 'hidden',
      backgroundColor: '#09090b',
      webPreferences: {
        nodeIntegration: true,
        contextIsolation: false,
        webSecurity: true
      },
      ...options,
      isMainWindow: true
    };

    const win = this.createWindow('main', defaultOptions);
    this.mainWindowId = win.id;
    return win;
  }

  public createWindow(name: string, options: ManagedWindowOptions = {}): BrowserWindow {
    // If window with this name already exists and is not destroyed, focus it
    if (this.windowsByName.has(name)) {
      const existingId = this.windowsByName.get(name)!;
      const existingWin = this.windows.get(existingId);
      if (existingWin && !existingWin.isDestroyed()) {
        if (existingWin.isMinimized()) existingWin.restore();
        existingWin.focus();
        return existingWin;
      }
    }

    const { name: _n, isMainWindow, ...browserOptions } = options;

    const win = new BrowserWindow({
      width: 1000,
      height: 700,
      backgroundColor: '#09090b',
      frame: false,
      titleBarStyle: 'hidden',
      webPreferences: {
        nodeIntegration: true,
        contextIsolation: false
      },
      ...browserOptions
    });

    const windowId = win.id;
    this.windows.set(windowId, win);
    this.windowsByName.set(name, windowId);

    if (isMainWindow) {
      this.mainWindowId = windowId;
    }

    win.on('closed', () => {
      this.windows.delete(windowId);
      this.windowsByName.delete(name);
      if (this.mainWindowId === windowId) {
        this.mainWindowId = null;
      }
    });

    return win;
  }

  public getWindow(id: number): BrowserWindow | undefined {
    return this.windows.get(id);
  }

  public getWindowByName(name: string): BrowserWindow | undefined {
    const id = this.windowsByName.get(name);
    return id !== undefined ? this.windows.get(id) : undefined;
  }

  public getMainWindow(): BrowserWindow | null {
    if (this.mainWindowId !== null) {
      const win = this.windows.get(this.mainWindowId);
      if (win && !win.isDestroyed()) {
        return win;
      }
    }
    return null;
  }

  public getAllWindows(): BrowserWindow[] {
    return Array.from(this.windows.values()).filter(win => !win.isDestroyed());
  }

  public closeWindow(id: number): void {
    const win = this.windows.get(id);
    if (win && !win.isDestroyed()) {
      win.close();
    }
  }

  public closeAllWindows(): void {
    for (const win of this.windows.values()) {
      if (!win.isDestroyed()) {
        win.close();
      }
    }
    this.windows.clear();
    this.windowsByName.clear();
    this.mainWindowId = null;
  }

  private setupIpcHandlers(): void {
    // Only setup IPC if ipcMain is available
    if (typeof ipcMain !== 'undefined' && ipcMain.on) {
      ipcMain.on('window-minimize', (event) => {
        const win = BrowserWindow.fromWebContents(event.sender);
        if (win && !win.isDestroyed()) win.minimize();
      });

      ipcMain.on('window-maximize', (event) => {
        const win = BrowserWindow.fromWebContents(event.sender);
        if (win && !win.isDestroyed()) {
          if (win.isMaximized()) {
            win.unmaximize();
          } else {
            win.maximize();
          }
        }
      });

      ipcMain.on('window-close', (event) => {
        const win = BrowserWindow.fromWebContents(event.sender);
        if (win && !win.isDestroyed()) win.close();
      });
    }
  }
}

export const windowManager = new WindowManager();
