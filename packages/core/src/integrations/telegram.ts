/**
 * Telegram Integration for SuperAgent
 *
 * Provides standalone Telegram messaging and notification functionality
 * via the official Telegram Bot API (outbound only).
 */

import { SettingsStorage, TelegramSettings } from '../storage/settings-store.js';

export interface TelegramSendOptions {
  /** Telegram Bot token (e.g., '123456:ABC-DEF...'). Falls back to settings or process.env.TELEGRAM_BOT_TOKEN */
  botToken?: string;
  /** Target Chat ID or Channel username/ID (e.g., '123456789' or '@mychannel'). Falls back to settings or process.env.TELEGRAM_CHAT_ID */
  chatId?: string | number;
  /** Message body to send */
  text: string;
  /** Formatting option ('Markdown' | 'HTML' | undefined) */
  parseMode?: 'Markdown' | 'HTML';
  /** Disables notification sound if true */
  disableNotification?: boolean;
}

export interface TelegramSendResult {
  success: boolean;
  messageId?: number;
  error?: string;
  chunksSent?: number;
}

export interface TelegramTestResult {
  success: boolean;
  botName?: string;
  username?: string;
  botId?: number;
  error?: string;
}

const TELEGRAM_MAX_LENGTH = 4096;

/**
 * Resolves current Telegram configuration from explicit args, settings.json, or environment variables.
 */
export function getTelegramConfig(override?: Partial<TelegramSettings>): TelegramSettings {
  let stored: TelegramSettings = {};
  try {
    const settings = SettingsStorage.loadSettings();
    if (settings?.telegram) {
      stored = settings.telegram;
    }
  } catch {
    // Ignore settings load failures in isolated environments
  }

  return {
    enabled: override?.enabled ?? stored.enabled ?? true,
    botToken: override?.botToken || stored.botToken || process.env.TELEGRAM_BOT_TOKEN || '',
    chatId: override?.chatId || stored.chatId || process.env.TELEGRAM_CHAT_ID || '',
    parseMode: override?.parseMode || stored.parseMode || 'Markdown',
  };
}

/**
 * Splits a long string into chunks of at most `maxLength`, respecting line boundaries if possible.
 */
export function chunkTelegramMessage(text: string, maxLength: number = TELEGRAM_MAX_LENGTH): string[] {
  if (!text || text.length <= maxLength) {
    return [text || ''];
  }

  const chunks: string[] = [];
  let remaining = text;

  while (remaining.length > 0) {
    if (remaining.length <= maxLength) {
      chunks.push(remaining);
      break;
    }

    // Try finding the last newline before maxLength
    let splitIndex = remaining.lastIndexOf('\n', maxLength);
    if (splitIndex === -1 || splitIndex < maxLength * 0.4) {
      // If no reasonable newline, try finding space
      splitIndex = remaining.lastIndexOf(' ', maxLength);
    }
    if (splitIndex === -1 || splitIndex < maxLength * 0.2) {
      // Hard split if no suitable whitespace
      splitIndex = maxLength;
    }

    const chunk = remaining.slice(0, splitIndex).trim();
    if (chunk) {
      chunks.push(chunk);
    }
    remaining = remaining.slice(splitIndex).trim();
  }

  return chunks;
}

/**
 * Sends an HTTP POST request to a Telegram Bot API method.
 */
async function callTelegramApi(botToken: string, method: string, payload: Record<string, unknown>): Promise<any> {
  const url = `https://api.telegram.org/bot${botToken}/${method}`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  const data = await response.json().catch(() => ({ ok: false, description: 'Invalid JSON response from Telegram' }));
  return { response, data };
}

/**
 * Sends a message (or chunked messages) to Telegram.
 */
export async function sendTelegramMessage(options: TelegramSendOptions): Promise<TelegramSendResult> {
  const config = getTelegramConfig({
    botToken: options.botToken,
    chatId: options.chatId ? String(options.chatId) : undefined,
    parseMode: options.parseMode,
  });

  const botToken = config.botToken;
  const chatId = options.chatId ? String(options.chatId) : config.chatId;

  if (!botToken) {
    return {
      success: false,
      error: 'Telegram Bot Token is not configured. Please set it in Settings → Telegram or pass botToken.',
    };
  }

  if (!chatId) {
    return {
      success: false,
      error: 'Telegram Chat ID is not configured. Please set it in Settings → Telegram or pass chatId.',
    };
  }

  const rawText = options.text || '';
  if (!rawText.trim()) {
    return {
      success: false,
      error: 'Cannot send an empty message to Telegram.',
    };
  }

  const chunks = chunkTelegramMessage(rawText, TELEGRAM_MAX_LENGTH);
  let lastMessageId: number | undefined;

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    const payload: Record<string, unknown> = {
      chat_id: chatId,
      text: chunk,
      disable_notification: options.disableNotification ?? false,
    };

    if (config.parseMode) {
      payload.parse_mode = config.parseMode;
    }

    let { response, data } = await callTelegramApi(botToken, 'sendMessage', payload);

    // If parse error occurs, retry once without parse_mode (fallback to raw text)
    if (!data.ok && config.parseMode && data.description && data.description.toLowerCase().includes('parse')) {
      delete payload.parse_mode;
      const retryResult = await callTelegramApi(botToken, 'sendMessage', payload);
      response = retryResult.response;
      data = retryResult.data;
    }

    if (!data.ok) {
      return {
        success: false,
        error: data.description || `Telegram API error: ${response.status} ${response.statusText}`,
        chunksSent: i,
      };
    }

    lastMessageId = data.result?.message_id;
  }

  return {
    success: true,
    messageId: lastMessageId,
    chunksSent: chunks.length,
  };
}

/**
 * Tests Telegram bot connectivity using `getMe` and optionally verifies sending a test message.
 */
export async function testTelegramConnection(
  botToken?: string,
  chatId?: string,
  sendTestMessage: boolean = true
): Promise<TelegramTestResult> {
  const config = getTelegramConfig({ botToken, chatId });
  const token = config.botToken;

  if (!token) {
    return {
      success: false,
      error: 'Telegram Bot Token is required to test connection.',
    };
  }

  try {
    const { data } = await callTelegramApi(token, 'getMe', {});

    if (!data.ok) {
      return {
        success: false,
        error: data.description || 'Invalid Telegram Bot Token.',
      };
    }

    const botName = data.result?.first_name || 'Telegram Bot';
    const username = data.result?.username ? `@${data.result.username}` : undefined;

    // If chatId is also provided and sendTestMessage is true, send a friendly test message
    const targetChatId = chatId || config.chatId;
    if (targetChatId && sendTestMessage) {
      const sendRes = await sendTelegramMessage({
        botToken: token,
        chatId: targetChatId,
        text: `🤖 *SuperAgent Telegram Connected!*\n\nSuccessfully verified connectivity for ${botName}${username ? ` (${username})` : ''}.`,
      });

      if (!sendRes.success) {
        return {
          success: false,
          botName,
          username,
          error: `Bot token is valid (${botName}), but sending test message to chat "${targetChatId}" failed: ${sendRes.error}`,
        };
      }
    }

    return {
      success: true,
      botName,
      username,
      botId: data.result?.id,
    };
  } catch (err: any) {
    return {
      success: false,
      error: err.message || String(err),
    };
  }
}
