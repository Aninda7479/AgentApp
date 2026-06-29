import { EventEmitter } from 'events';

export interface TrayMenuItem {
  id: string;
  label: string;
  type?: 'normal' | 'separator' | 'checkbox' | 'radio';
  checked?: boolean;
  enabled?: boolean;
  click?: () => void;
}

export interface SystemTrayOptions {
  iconPath?: string;
  tooltip?: string;
  electronProvider?: {
    Tray: any;
    Menu: any;
    nativeImage: any;
  };
}

export type DaemonStatus = 'online' | 'offline' | 'busy' | 'idle';

export class SystemTrayManager extends EventEmitter {
  private trayInstance: any = null;
  private currentStatus: DaemonStatus = 'offline';
  private currentTooltip: string = 'SuperAgent Gateway';
  private menuItems: TrayMenuItem[] = [];
  private electronProvider: any;

  constructor(options: SystemTrayOptions = {}) {
    super();
    this.currentTooltip = options.tooltip || 'SuperAgent Gateway';
    this.electronProvider = options.electronProvider;
    
    if (!this.electronProvider) {
      try {
        // Dynamic import fallback for Electron runtime
        this.electronProvider = require('electron');
      } catch {
        // Headless or non-electron test environment
        this.electronProvider = null;
      }
    }
  }

  public initTray(iconPath?: string): boolean {
    if (!this.electronProvider || !this.electronProvider.Tray) {
      // Stub mode for headless/test environment
      this.emit('initialized', { stub: true });
      return false;
    }

    try {
      const { Tray, nativeImage } = this.electronProvider;
      const image = iconPath ? nativeImage.createFromPath(iconPath) : nativeImage.createEmpty();
      this.trayInstance = new Tray(image);
      this.trayInstance.setToolTip(this.currentTooltip);

      this.trayInstance.on('click', () => {
        this.emit('click');
      });

      this.trayInstance.on('double-click', () => {
        this.emit('double-click');
      });

      this.updateContextMenu();
      this.emit('initialized', { stub: false });
      return true;
    } catch (error) {
      this.emit('error', error);
      return false;
    }
  }

  public updateStatus(status: DaemonStatus, customTooltip?: string): void {
    this.currentStatus = status;
    if (customTooltip) {
      this.currentTooltip = customTooltip;
    } else {
      this.currentTooltip = `SuperAgent Gateway (${status.toUpperCase()})`;
    }

    if (this.trayInstance && typeof this.trayInstance.setToolTip === 'function') {
      this.trayInstance.setToolTip(this.currentTooltip);
    }
    this.emit('statusChanged', { status: this.currentStatus, tooltip: this.currentTooltip });
  }

  public setMenuItems(items: TrayMenuItem[]): void {
    this.menuItems = items;
    this.updateContextMenu();
  }

  public getMenuItems(): TrayMenuItem[] {
    return [...this.menuItems];
  }

  public getStatus(): DaemonStatus {
    return this.currentStatus;
  }

  public getTooltip(): string {
    return this.currentTooltip;
  }

  private updateContextMenu(): void {
    if (!this.trayInstance || !this.electronProvider || !this.electronProvider.Menu) {
      return;
    }

    const { Menu } = this.electronProvider;
    const template = this.menuItems.map((item) => ({
      label: item.label,
      type: item.type || 'normal',
      checked: item.checked ?? false,
      enabled: item.enabled ?? true,
      click: () => {
        if (item.click) item.click();
        this.emit('menuItemClick', item.id);
      }
    }));

    const menu = Menu.buildFromTemplate(template);
    this.trayInstance.setContextMenu(menu);
  }

  public destroy(): void {
    if (this.trayInstance && typeof this.trayInstance.destroy === 'function') {
      this.trayInstance.destroy();
    }
    this.trayInstance = null;
    this.emit('destroyed');
  }
}
