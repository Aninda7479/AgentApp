import { EventEmitter } from 'events';
import { ChannelAdapter, ChannelAdapterConfig, IncomingMessage, OutgoingMessage, ChannelType } from './types';
import { FetchFunction } from './telegram';

export interface DiscordAdapterConfig extends ChannelAdapterConfig {
  botToken?: string;
  applicationId?: string;
  apiBaseUrl?: string;
}

export class DiscordChannelAdapter extends EventEmitter implements ChannelAdapter {
  public readonly channelType: ChannelType = 'discord';
  private connected: boolean = false;
  private config: DiscordAdapterConfig = { enabled: false };
  private messageHandler?: (message: IncomingMessage) => void | Promise<void>;
  private customFetch?: FetchFunction;

  constructor(customFetch?: FetchFunction) {
    super();
    this.customFetch = customFetch;
  }

  public get isConnected(): boolean {
    return this.connected;
  }

  public async initialize(config: DiscordAdapterConfig): Promise<void> {
    this.config = {
      apiBaseUrl: 'https://discord.com/api/v10',
      ...config
    };
  }

  public async start(): Promise<void> {
    if (!this.config.enabled) {
      throw new Error('Discord adapter is disabled in configuration.');
    }
    if (!this.config.botToken) {
      throw new Error('Discord botToken is required.');
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
      throw new Error('Discord adapter is not connected.');
    }

    const url = `${this.config.apiBaseUrl}/channels/${message.channelId}/messages`;
    const payload: Record<string, unknown> = {
      content: message.content
    };

    if (message.replyToMessageId) {
      payload.message_reference = { message_id: message.replyToMessageId };
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
          'Content-Type': 'application/json',
          'Authorization': `Bot ${this.config.botToken}`
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        this.emit('error', new Error(`Discord API returned HTTP ${response.status}`));
        return false;
      }

      return true;
    } catch (err) {
      this.emit('error', err);
      return false;
    }
  }

  public processGatewayPayload(payload: any): void {
    if (!payload) return;

    // Discord MESSAGE_CREATE event handling
    if (payload.t === 'MESSAGE_CREATE' && payload.d) {
      const data = payload.d;

      // Ignore messages sent by bots if necessary or self
      const incoming: IncomingMessage = {
        id: String(data.id || Date.now()),
        channelType: 'discord',
        channelId: String(data.channel_id || ''),
        senderId: String(data.author ? data.author.id : 'unknown'),
        senderName: data.author ? (data.author.username || 'DiscordUser') : 'DiscordUser',
        content: data.content || '',
        timestamp: data.timestamp ? new Date(data.timestamp).getTime() : Date.now(),
        metadata: { payload }
      };

      if (this.messageHandler) {
        Promise.resolve(this.messageHandler(incoming)).catch((err) => this.emit('error', err));
      }
    }
  }
}
