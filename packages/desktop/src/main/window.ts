import { BrowserWindow, BrowserWindowConstructorOptions, app, ipcMain, shell } from 'electron';
import path from 'path';
import fs from 'fs';

/** Resolves the packaged brand icon (.ico on Windows, .png elsewhere), or undefined if absent. */
function appIconPath(): string | undefined {
  const ext = process.platform === 'win32' ? 'ico' : 'png';
  const p = path.join(app.getAppPath(), 'assets', `icon.${ext}`);
  if (fs.existsSync(p)) return p;

  const fallback = path.join(app.getAppPath(), 'assets', 'icon.png');
  return fs.existsSync(fallback) ? fallback : undefined;
}

/** Options for creating a managed BrowserWindow, with optional name and main-window flag. */
export interface ManagedWindowOptions extends BrowserWindowConstructorOptions {
  name?: string;
  isMainWindow?: boolean;
}

/** Manages all BrowserWindows in the app — creation, lookup, and lifecycle. */
export class WindowManager {
  private windows: Map<number, BrowserWindow> = new Map();
  private windowsByName: Map<string, number> = new Map();
  private mainWindowId: number | null = null;

  constructor() {
    this.setupIpcHandlers();
  }

  /** Creates the primary application window with frameless defaults. */
  public createMainWindow(options: ManagedWindowOptions = {}): BrowserWindow {
    const defaultOptions: ManagedWindowOptions = {
      width: 1280,
      height: 800,
      minWidth: 900,
      minHeight: 600,
      frame: false, // Frameless window 
      titleBarStyle: 'hidden',
      backgroundColor: '#09090b',
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true,
        webSecurity: true,
        preload: path.join(__dirname, '..', 'preload', 'preload.js')
      },
      ...options,
      isMainWindow: true
    };

    const win = this.createWindow('main', defaultOptions);
    this.mainWindowId = win.id;
    return win;
  }

  /** Creates or focuses an existing named window. */
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
      icon: appIconPath(),
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true,
        webSecurity: true,
        preload: path.join(__dirname, '..', 'preload', 'preload.js')
      },
      ...browserOptions
    });

    // Open external links (http/https) in the OS default browser rather than a
    // new Electron tab/window. Anything else is denied.
    if (win.webContents?.setWindowOpenHandler) {
      win.webContents.setWindowOpenHandler(({ url }) => {
        if (/^https?:\/\//i.test(url)) {
          shell.openExternal(url).catch(() => {});
          return { action: 'deny' };
        }
        return { action: 'deny' };
      });
    }

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

  /** Returns the window matching the given Electron ID, if it exists. */
  public getWindow(id: number): BrowserWindow | undefined {
    return this.windows.get(id);
  }

  /** Returns the window registered under the given name, if it exists. */
  public getWindowByName(name: string): BrowserWindow | undefined {
    const id = this.windowsByName.get(name);
    return id !== undefined ? this.windows.get(id) : undefined;
  }

  /** Returns the main application window, or null if destroyed. */
  public getMainWindow(): BrowserWindow | null {
    if (this.mainWindowId !== null) {
      const win = this.windows.get(this.mainWindowId);
      if (win && !win.isDestroyed()) {
        return win;
      }
    }
    return null;
  }

  /** Returns all non-destroyed windows. */
  public getAllWindows(): BrowserWindow[] {
    return Array.from(this.windows.values()).filter(win => !win.isDestroyed());
  }

  /** Closes the window matching the given ID. */
  public closeWindow(id: number): void {
    const win = this.windows.get(id);
    if (win && !win.isDestroyed()) {
      win.close();
    }
  }

  /** Closes all managed windows and resets internal state. */
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

  /** Creates the fullscreen transparent Circle-to-Search overlay window. */
  public createCircleSearchWindow(): BrowserWindow {
    const name = 'circle-search';
    if (this.windowsByName.has(name)) {
      const existingId = this.windowsByName.get(name)!;
      const existingWin = this.windows.get(existingId);
      if (existingWin && !existingWin.isDestroyed()) {
        existingWin.show();
        return existingWin;
      }
    }

    const { screen } = require('electron');
    const primaryDisplay = screen.getPrimaryDisplay();
    const { width, height } = primaryDisplay.bounds; // Use full display bounds for overlay

    const win = new BrowserWindow({
      width,
      height,
      x: 0,
      y: 0,
      frame: false,
      transparent: true,
      alwaysOnTop: true,
      skipTaskbar: true,
      resizable: false,
      focusable: true,
      hasShadow: false,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true,
        webSecurity: true,
        preload: path.join(__dirname, '..', 'preload', 'preload.js')
      }
    });

    const windowId = win.id;
    this.windows.set(windowId, win);
    this.windowsByName.set(name, windowId);

    win.on('closed', () => {
      this.windows.delete(windowId);
      this.windowsByName.delete(name);
    });

    return win;
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

/** Singleton window manager used across the main process. */
export const windowManager = new WindowManager();
