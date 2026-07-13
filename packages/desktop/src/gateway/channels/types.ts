/** Supported messaging channel identifiers. */
export type ChannelType = 'telegram' | 'discord' | 'slack' | string;

/** An inbound message received from a channel adapter. */
export interface IncomingMessage {
  id: string;
  channelType: ChannelType;
  channelId: string;
  senderId: string;
  senderName: string;
  content: string;
  timestamp: number;
  metadata?: Record<string, unknown>;
}

/** An outbound message to be dispatched through a channel adapter. */
export interface OutgoingMessage {
  channelType: ChannelType;
  channelId: string;
  content: string;
  replyToMessageId?: string;
  metadata?: Record<string, unknown>;
}

/** Configuration options for initializing a channel adapter. */
export interface ChannelAdapterConfig {
  enabled: boolean;
  botToken?: string;
  appToken?: string;
  signingSecret?: string;
  apiBaseUrl?: string;
  pollingIntervalMs?: number;
  [key: string]: unknown;
}

/** Interface all channel adapters (Telegram, Slack, Discord) must implement. */
export interface ChannelAdapter {
  readonly channelType: ChannelType;
  readonly isConnected: boolean;
  initialize(config: ChannelAdapterConfig): Promise<void>;
  start(): Promise<void>;
  stop(): Promise<void>;
  sendMessage(message: OutgoingMessage): Promise<boolean>;
  onMessage(handler: (message: IncomingMessage) => void | Promise<void>): void;
}
