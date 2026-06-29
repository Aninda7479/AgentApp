export type ChannelType = 'telegram' | 'discord' | 'slack' | string;

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

export interface OutgoingMessage {
  channelType: ChannelType;
  channelId: string;
  content: string;
  replyToMessageId?: string;
  metadata?: Record<string, unknown>;
}

export interface ChannelAdapterConfig {
  enabled: boolean;
  botToken?: string;
  appToken?: string;
  signingSecret?: string;
  apiBaseUrl?: string;
  pollingIntervalMs?: number;
  [key: string]: unknown;
}

export interface ChannelAdapter {
  readonly channelType: ChannelType;
  readonly isConnected: boolean;
  initialize(config: ChannelAdapterConfig): Promise<void>;
  start(): Promise<void>;
  stop(): Promise<void>;
  sendMessage(message: OutgoingMessage): Promise<boolean>;
  onMessage(handler: (message: IncomingMessage) => void | Promise<void>): void;
}
