import { EventEmitter } from 'events';
import { ChannelAdapter, ChannelAdapterConfig, IncomingMessage, OutgoingMessage, ChannelType } from './types';

/** WhatsApp-specific adapter configuration. */
export interface WhatsAppAdapterConfig extends ChannelAdapterConfig {
  /** Meta (system/user) access token used to call the Cloud API. */
  botToken?: string;
  /** WhatsApp Business phone number ID (the recipient endpoint). */
  phoneNumberId?: string;
  /** Token you set when configuring the webhook in the Meta app dashboard. */
  verifyToken?: string;
  /** Graph API base URL (default: https://graph.facebook.com). */
  apiBaseUrl?: string;
  /** API version segment (default: v19.0). */
  apiVersion?: string;
}

/** Type alias for the fetch API signature used by adapters. */
type FetchFunction = (url: string, init?: any) => Promise<{ ok: boolean; status: number; json: () => Promise<any> }>;

/**
 * WhatsApp Cloud API channel adapter.
 *
 * Uses Meta's Graph API for outbound messages and exposes a webhook parser so an
 * HTTP endpoint (the Meta webhook) can feed inbound messages into the daemon.
 * Inbound delivery requires a publicly reachable webhook URL pointing at
 * `processIncomingWebhook` (see the gateway HTTP wiring).
 */
export class WhatsAppChannelAdapter extends EventEmitter implements ChannelAdapter {
  public readonly channelType: ChannelType = 'whatsapp';
  private connected: boolean = false;
  private config: WhatsAppAdapterConfig = { enabled: false };
  private messageHandler?: (message: IncomingMessage) => void | Promise<void>;
  private customFetch?: FetchFunction;

  constructor(customFetch?: FetchFunction) {
    super();
    this.customFetch = customFetch;
  }

  public get isConnected(): boolean {
    return this.connected;
  }

  public async initialize(config: WhatsAppAdapterConfig): Promise<void> {
    this.config = {
      apiBaseUrl: 'https://graph.facebook.com',
      apiVersion: 'v19.0',
      ...config
    };
  }

  public async start(): Promise<void> {
    if (!this.config.enabled) {
      throw new Error('WhatsApp adapter is disabled in configuration.');
    }
    if (!this.config.botToken) {
      throw new Error('WhatsApp botToken (Meta access token) is required.');
    }
    if (!this.config.phoneNumberId) {
      throw new Error('WhatsApp phoneNumberId is required.');
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
      throw new Error('WhatsApp adapter is not connected.');
    }

    const base = (this.config.apiBaseUrl || 'https://graph.facebook.com').replace(/\/+$/, '');
    const version = this.config.apiVersion || 'v19.0';
    const url = `${base}/${version}/${this.config.phoneNumberId}/messages`;

    const payload = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: message.channelId,
      type: 'text',
      text: { preview_url: false, body: message.content }
    };

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
          Authorization: `Bearer ${this.config.botToken}`
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        this.emit('error', new Error(`WhatsApp API returned HTTP ${response.status}`));
        return false;
      }

      const data = await response.json();
      return Boolean(data && (data.messages || data.success));
    } catch (err) {
      this.emit('error', err);
      return false;
    }
  }

  /**
   * Verifies the Meta webhook subscription handshake.
   * Returns the `hub.challenge` to echo back when the token matches.
   */
  public verifyWebhookHub(params: {
    'hub.mode'?: string;
    'hub.verify_token'?: string;
    'hub.challenge'?: string;
  }): string | null {
    const mode = params['hub.mode'];
    const token = params['hub.verify_token'];
    const challenge = params['hub.challenge'];
    if (mode === 'subscribe' && token === this.config.verifyToken && challenge != null) {
      return challenge;
    }
    return null;
  }

  /**
   * Parses a Meta webhook payload (the `entry[].changes[].value.messages` shape)
   * and emits an {@link IncomingMessage} for each WhatsApp message.
   */
  public processIncomingWebhook(payload: any): IncomingMessage[] {
    const messages: IncomingMessage[] = [];
    if (!payload || !Array.isArray(payload.entry)) return messages;

    for (const entry of payload.entry) {
      const changes = entry?.changes || [];
      for (const change of changes) {
        const value = change?.value;
        if (!value || !Array.isArray(value.messages)) continue;
        for (const msg of value.messages) {
          const incoming: IncomingMessage = {
            id: String(msg.id || Date.now()),
            channelType: 'whatsapp',
            channelId: String(msg.from || ''),
            senderId: String(msg.from || 'unknown'),
            senderName: msg.profile?.name || msg.from || 'User',
            content: msg.text?.body || msg.body || '',
            timestamp: msg.timestamp ? Number(msg.timestamp) * 1000 : Date.now(),
            metadata: { msg }
          };
          messages.push(incoming);
          if (this.messageHandler) {
            Promise.resolve(this.messageHandler(incoming)).catch((err) => this.emit('error', err));
          }
        }
      }
    }
    return messages;
  }
}
