import { EventEmitter } from 'events';
import { ChannelAdapter, ChannelAdapterConfig, IncomingMessage, OutgoingMessage, ChannelType } from './types';
import { FetchFunction } from './telegram';

/** Slack-specific adapter configuration. */
export interface SlackAdapterConfig extends ChannelAdapterConfig {
  botToken?: string;
  appToken?: string;
  signingSecret?: string;
  apiBaseUrl?: string;
}

/** Slack channel adapter using the Slack Web API for message exchange. */
export class SlackChannelAdapter extends EventEmitter implements ChannelAdapter {
  public readonly channelType: ChannelType = 'slack';
  private connected: boolean = false;
  private config: SlackAdapterConfig = { enabled: false };
  private messageHandler?: (message: IncomingMessage) => void | Promise<void>;
  private customFetch?: FetchFunction;

  constructor(customFetch?: FetchFunction) {
    super();
    this.customFetch = customFetch;
  }

  public get isConnected(): boolean {
    return this.connected;
  }

  public async initialize(config: SlackAdapterConfig): Promise<void> {
    this.config = {
      apiBaseUrl: 'https://slack.com/api',
      ...config
    };
  }

  public async start(): Promise<void> {
    if (!this.config.enabled) {
      throw new Error('Slack adapter is disabled in configuration.');
    }
    if (!this.config.botToken) {
      throw new Error('Slack botToken is required.');
    }

    this.connected = true;
    this.emit('started');
  }

  public async stop(): Promise<void> {
    this.connected = false;
    this.emit('stopped');
  }

  public onMessage(handler: (message: IncomingMessage) => void | Promise<void>): void {
    this.messageHandler = handler;
  }

  public async sendMessage(message: OutgoingMessage): Promise<boolean> {
    if (!this.connected) {
      throw new Error('Slack adapter is not connected.');
    }

    const url = `${this.config.apiBaseUrl}/chat.postMessage`;
    const payload: Record<string, unknown> = {
      channel: message.channelId,
      text: message.content
    };

    if (message.replyToMessageId) {
      payload.thread_ts = message.replyToMessageId;
    }

    try {
      const fetchFn = this.customFetch || (globalThis.fetch as FetchFunction);
      if (!fetchFn) {
        this.emit('simulatedSend', message);
        return true;
      }

      const response = await fetchFn(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          'Authorization': `Bearer ${this.config.botToken}`
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        this.emit('error', new Error(`Slack API returned HTTP ${response.status}`));
        return false;
      }

      const data = await response.json();
      return Boolean(data && data.ok);
    } catch (err) {
      this.emit('error', err);
      return false;
    }
  }

  public processEventPayload(payload: any): void {
    if (!payload) return;

    // Slack Event API format
    if (payload.type === 'event_callback' && payload.event) {
      const ev = payload.event;

      // Handle standard message events
      if (ev.type === 'message' && !ev.subtype) {
        const incoming: IncomingMessage = {
          id: String(ev.client_msg_id || ev.ts || Date.now()),
          channelType: 'slack',
          channelId: String(ev.channel || ''),
          senderId: String(ev.user || 'unknown'),
          senderName: String(ev.user || 'SlackUser'),
          content: ev.text || '',
          timestamp: ev.ts ? parseFloat(ev.ts) * 1000 : Date.now(),
          metadata: { payload }
        };

        if (this.messageHandler) {
          Promise.resolve(this.messageHandler(incoming)).catch((err) => this.emit('error', err));
        }
      }
    }
  }
}
