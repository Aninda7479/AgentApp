import { EventEmitter } from 'events';
import { ChannelAdapter, IncomingMessage, OutgoingMessage, ChannelType } from './channels/types';

/** Lifecycle state of the omnichannel gateway daemon. */
export type DaemonState = 'stopped' | 'starting' | 'running' | 'stopping' | 'error';

/** Log entry for a dispatched inbound or outbound message. */
export interface MessageLogRecord {
  direction: 'inbound' | 'outbound';
  timestamp: number;
  channelType: ChannelType;
  channelId: string;
  senderOrRecipient: string;
  messageId?: string;
  success?: boolean;
}

/** Multi-channel gateway daemon that routes messages across registered adapters. */
export class OmnichannelGatewayDaemon extends EventEmitter {
  private adapters: Map<ChannelType, ChannelAdapter> = new Map();
  private state: DaemonState = 'stopped';
  private messageLogs: MessageLogRecord[] = [];
  private maxLogSize: number = 1000;

  constructor() {
    super();
  }

  public registerAdapter(adapter: ChannelAdapter): void {
    if (this.adapters.has(adapter.channelType)) {
      throw new Error(`Adapter for channel '${adapter.channelType}' is already registered.`);
    }

    this.adapters.set(adapter.channelType, adapter);
    adapter.onMessage(async (msg: IncomingMessage) => {
      this.handleIncomingMessage(msg);
    });

    this.emit('adapterRegistered', adapter.channelType);
  }

  public unregisterAdapter(channelType: ChannelType): boolean {
    const adapter = this.adapters.get(channelType);
    if (!adapter) return false;

    if (adapter.isConnected) {
      adapter.stop().catch((err) => this.emit('error', err));
    }

    this.adapters.delete(channelType);
    this.emit('adapterUnregistered', channelType);
    return true;
  }

  public getAdapter(channelType: ChannelType): ChannelAdapter | undefined {
    return this.adapters.get(channelType);
  }

  public getRegisteredChannelTypes(): ChannelType[] {
    return Array.from(this.adapters.keys());
  }

  public getState(): DaemonState {
    return this.state;
  }

  public async start(): Promise<void> {
    if (this.state === 'running' || this.state === 'starting') {
      return;
    }

    this.state = 'starting';
    this.emit('stateChanged', this.state);

    try {
      for (const [type, adapter] of this.adapters.entries()) {
        if (!adapter.isConnected) {
          await adapter.start();
        }
      }
      this.state = 'running';
      this.emit('stateChanged', this.state);
    } catch (error) {
      this.state = 'error';
      this.emit('stateChanged', this.state);
      this.emit('error', error);
      throw error;
    }
  }

  public async stop(): Promise<void> {
    if (this.state === 'stopped' || this.state === 'stopping') {
      return;
    }

    this.state = 'stopping';
    this.emit('stateChanged', this.state);

    for (const [type, adapter] of this.adapters.entries()) {
      if (adapter.isConnected) {
        try {
          await adapter.stop();
        } catch (err) {
          this.emit('error', err);
        }
      }
    }

    this.state = 'stopped';
    this.emit('stateChanged', this.state);
  }

  public async dispatchMessage(message: OutgoingMessage): Promise<boolean> {
    const adapter = this.adapters.get(message.channelType);
    if (!adapter) {
      throw new Error(`No channel adapter registered for '${message.channelType}'`);
    }

    if (!adapter.isConnected) {
      throw new Error(`Channel adapter '${message.channelType}' is not currently connected`);
    }

    let success = false;
    try {
      success = await adapter.sendMessage(message);
    } catch (err) {
      success = false;
      this.emit('error', err);
    }

    this.logMessage({
      direction: 'outbound',
      timestamp: Date.now(),
      channelType: message.channelType,
      channelId: message.channelId,
      senderOrRecipient: message.channelId,
      success
    });

    return success;
  }

  private handleIncomingMessage(message: IncomingMessage): void {
    this.logMessage({
      direction: 'inbound',
      timestamp: message.timestamp,
      channelType: message.channelType,
      channelId: message.channelId,
      senderOrRecipient: message.senderId,
      messageId: message.id,
      success: true
    });

    this.emit('message', message);
  }

  private logMessage(record: MessageLogRecord): void {
    this.messageLogs.push(record);
    if (this.messageLogs.length > this.maxLogSize) {
      this.messageLogs.shift();
    }
  }

  public getMessageLogs(): MessageLogRecord[] {
    return [...this.messageLogs];
  }

  public clearMessageLogs(): void {
    this.messageLogs = [];
  }
}
