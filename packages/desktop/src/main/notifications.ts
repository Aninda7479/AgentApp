import { EventEmitter } from 'events';

/** Data for creating a desktop notification. */
export interface NotificationPayload {
  title: string;
  body: string;
  icon?: string;
  silent?: boolean;
  subtitle?: string;
  urgency?: 'normal' | 'critical' | 'low';
  data?: Record<string, unknown>;
}

/** Persistent record of a notification that was sent. */
export interface DesktopNotificationRecord {
  id: string;
  title: string;
  body: string;
  timestamp: number;
  silent: boolean;
  data?: Record<string, unknown>;
}

/** Options for the DesktopNotificationSystem constructor. */
export interface DesktopNotificationOptions {
  electronProvider?: {
    Notification: any;
  };
}

/** System for displaying desktop notifications with history tracking. */
export class DesktopNotificationSystem extends EventEmitter {
  private history: DesktopNotificationRecord[] = [];
  private electronProvider: any;

  constructor(options: DesktopNotificationOptions = {}) {
    super();
    this.electronProvider = options.electronProvider;

    if (!this.electronProvider) {
      try {
        this.electronProvider = require('electron');
      } catch {
        this.electronProvider = null;
      }
    }
  }

  public isSupported(): boolean {
    if (!this.electronProvider || !this.electronProvider.Notification) {
      return false;
    }
    return typeof this.electronProvider.Notification.isSupported === 'function'
      ? this.electronProvider.Notification.isSupported()
      : true;
  }

  public sendNotification(payload: NotificationPayload): DesktopNotificationRecord {
    const id = `notif_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const record: DesktopNotificationRecord = {
      id,
      title: payload.title,
      body: payload.body,
      timestamp: Date.now(),
      silent: payload.silent ?? false,
      data: payload.data
    };

    this.history.push(record);

    if (this.electronProvider && this.electronProvider.Notification) {
      try {
        const NotificationClass = this.electronProvider.Notification;
        const notif = new NotificationClass({
          title: payload.title,
          body: payload.body,
          icon: payload.icon,
          silent: payload.silent,
          subtitle: payload.subtitle,
          urgency: payload.urgency
        });

        notif.on('click', () => {
          this.emit('click', id, record);
        });

        notif.on('close', () => {
          this.emit('close', id, record);
        });

        notif.show();
      } catch (err) {
        this.emit('error', err);
      }
    } else {
      // Stub emit for head-less / testing environments
      this.emit('sent_stub', record);
    }

    return record;
  }

  public getHistory(): DesktopNotificationRecord[] {
    return [...this.history];
  }

  public clearHistory(): void {
    this.history = [];
    this.emit('historyCleared');
  }
}
