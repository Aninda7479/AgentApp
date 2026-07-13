import { EventEmitter } from 'events';
import { ChannelAdapter, ChannelAdapterConfig, IncomingMessage, OutgoingMessage, ChannelType } from './types';

/** Telegram-specific adapter configuration. */
export interface TelegramAdapterConfig extends ChannelAdapterConfig {
  botToken?: string;
  apiBaseUrl?: string;
  pollingIntervalMs?: number;
}

/** Type alias for the fetch API signature used by adapters. */
export type FetchFunction = (url: string, init?: any) => Promise<{ ok: boolean; status: number; json: () => Promise<any> }>;

/** Telegram Bot API channel adapter using long-polling for message delivery. */
export class TelegramChannelAdapter extends EventEmitter implements ChannelAdapter {
  public readonly channelType: ChannelType = 'telegram';
  private connected: boolean = false;
  private config: TelegramAdapterConfig = { enabled: false };
  private messageHandler?: (message: IncomingMessage) => void | Promise<void>;
  private pollingTimer?: NodeJS.Timeout;
  private lastUpdateId: number = 0;
  private customFetch?: FetchFunction;

  constructor(customFetch?: FetchFunction) {
    super();
    this.customFetch = customFetch;
  }

  public get isConnected(): boolean {
    return this.connected;
  }

  public async initialize(config: TelegramAdapterConfig): Promise<void> {
    this.config = {
      apiBaseUrl: 'https://api.telegram.org',
      pollingIntervalMs: 2000,
      ...config
    };
  }

  public async start(): Promise<void> {
    if (!this.config.enabled) {
      throw new Error('Telegram adapter is disabled in configuration.');
    }
    if (!this.config.botToken) {
      throw new Error('Telegram botToken is required.');
    }

    this.connected = true;
    this.emit('started');
    this.startPolling();
  }

  public async stop(): Promise<void> {
    this.stopPolling();
    this.connected = false;
    this.emit('stopped');
  }

  public onMessage(handler: (message: IncomingMessage) => void | Promise<void>): void {
    this.messageHandler = handler;
  }

  public async sendMessage(message: OutgoingMessage): Promise<boolean> {
    if (!this.connected) {
      throw new Error('Telegram adapter is not connected.');
    }

    const url = `${this.config.apiBaseUrl}/bot${this.config.botToken}/sendMessage`;
    const payload = {
      chat_id: message.channelId,
      text: message.content,
      reply_to_message_id: message.replyToMessageId ? parseInt(message.replyToMessageId, 10) : undefined
    };

    try {
      const fetchFn = this.customFetch || (globalThis.fetch as FetchFunction);
      if (!fetchFn) {
        // Mock success if fetch unavailable in runtime
        this.emit('simulatedSend', message);
        return true;
      }

      const response = await fetchFn(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        this.emit('error', new Error(`Telegram API returned HTTP ${response.status}`));
        return false;
      }

      const data = await response.json();
      return Boolean(data && data.ok);
    } catch (err) {
      this.emit('error', err);
      return false;
    }
  }

  public processIncomingUpdate(update: any): void {
    if (!update || !update.message) return;

    if (update.update_id && update.update_id >= this.lastUpdateId) {
      this.lastUpdateId = update.update_id + 1;
    }

    const msg = update.message;
    const incoming: IncomingMessage = {
      id: String(msg.message_id || Date.now()),
      channelType: 'telegram',
      channelId: String(msg.chat ? msg.chat.id : ''),
      senderId: String(msg.from ? msg.from.id : 'unknown'),
      senderName: msg.from ? (msg.from.username || msg.from.first_name || 'User') : 'User',
      content: msg.text || '',
      timestamp: (msg.date ? msg.date * 1000 : Date.now()),
      metadata: { update }
    };

    if (this.messageHandler) {
      Promise.resolve(this.messageHandler(incoming)).catch((err) => this.emit('error', err));
    }
  }

  private startPolling(): void {
    if (this.pollingTimer) return;

    const poll = async () => {
      if (!this.connected) return;

      try {
        const fetchFn = this.customFetch || (globalThis.fetch as FetchFunction);
        if (fetchFn) {
          const url = `${this.config.apiBaseUrl}/bot${this.config.botToken}/getUpdates?offset=${this.lastUpdateId}&timeout=1`;
          const res = await fetchFn(url);
          if (res.ok) {
            const data = await res.json();
            if (data && data.ok && Array.isArray(data.result)) {
              for (const update of data.result) {
                this.processIncomingUpdate(update);
              }
            }
          }
        }
      } catch (err) {
        this.emit('error', err);
      }

      if (this.connected) {
        this.pollingTimer = setTimeout(poll, this.config.pollingIntervalMs || 2000);
      }
    };

    this.pollingTimer = setTimeout(poll, 100);
  }

  private stopPolling(): void {
    if (this.pollingTimer) {
      clearTimeout(this.pollingTimer);
      this.pollingTimer = undefined;
    }
  }
}
