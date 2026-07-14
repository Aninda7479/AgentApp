import { OmnichannelGatewayDaemon } from './daemon';
import { TelegramChannelAdapter } from './channels/telegram';
import { WhatsAppChannelAdapter } from './channels/whatsapp';
import { DiscordChannelAdapter } from './channels/discord';
import { SlackChannelAdapter } from './channels/slack';

export * from './daemon';
export * from './channels/types';
export * from './channels/telegram';
export * from './channels/whatsapp';
export * from './channels/discord';
export * from './channels/slack';

/**
 * Builds an omnichannel gateway daemon with all built-in channel adapters
 * pre-registered (Telegram, WhatsApp, Discord, Slack). Adapters start only when
 * their configuration has `enabled: true` (call `daemon.start()` to spin them up).
 */
export function createDefaultGateway(): OmnichannelGatewayDaemon {
  const daemon = new OmnichannelGatewayDaemon();
  daemon.registerAdapter(new TelegramChannelAdapter());
  daemon.registerAdapter(new WhatsAppChannelAdapter());
  daemon.registerAdapter(new DiscordChannelAdapter());
  daemon.registerAdapter(new SlackChannelAdapter());
  return daemon;
}
