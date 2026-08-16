import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  chunkTelegramMessage,
  sendTelegramMessage,
  testTelegramConnection,
  getTelegramConfig
} from '../src/integrations/telegram.js';
import { createBuiltinTools } from '../src/providers/builtin-tools.js';

describe('Telegram Integration & Tooling', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  describe('chunkTelegramMessage', () => {
    it('returns single chunk when text is within limit', () => {
      const text = 'Hello Telegram!';
      const chunks = chunkTelegramMessage(text, 4096);
      expect(chunks).toEqual(['Hello Telegram!']);
    });

    it('splits message larger than max length cleanly on line boundaries', () => {
      const line1 = 'A'.repeat(3000);
      const line2 = 'B'.repeat(2000);
      const fullText = `${line1}\n${line2}`;

      const chunks = chunkTelegramMessage(fullText, 4096);
      expect(chunks.length).toBe(2);
      expect(chunks[0]).toBe(line1);
      expect(chunks[1]).toBe(line2);
    });

    it('handles empty or blank text gracefully', () => {
      expect(chunkTelegramMessage('', 4096)).toEqual(['']);
    });
  });

  describe('sendTelegramMessage', () => {
    it('returns error when bot token is missing', async () => {
      const res = await sendTelegramMessage({
        botToken: '',
        chatId: '12345',
        text: 'test'
      });
      expect(res.success).toBe(false);
      expect(res.error).toContain('Telegram Bot Token is not configured');
    });

    it('returns error when chat ID is missing', async () => {
      const res = await sendTelegramMessage({
        botToken: '123:ABC',
        chatId: '',
        text: 'test'
      });
      expect(res.success).toBe(false);
      expect(res.error).toContain('Telegram Chat ID is not configured');
    });

    it('returns error when message text is empty', async () => {
      const res = await sendTelegramMessage({
        botToken: '123:ABC',
        chatId: '12345',
        text: '   '
      });
      expect(res.success).toBe(false);
      expect(res.error).toContain('Cannot send an empty message');
    });

    it('successfully sends message when API returns ok', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        status: 200,
        statusText: 'OK',
        json: async () => ({
          ok: true,
          result: {
            message_id: 42
          }
        })
      } as any);

      const res = await sendTelegramMessage({
        botToken: '123:ABC',
        chatId: '12345',
        text: 'Hello World!'
      });

      expect(res.success).toBe(true);
      expect(res.messageId).toBe(42);
      expect(res.chunksSent).toBe(1);
    });

    it('handles Telegram API error responses', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        status: 400,
        statusText: 'Bad Request',
        json: async () => ({
          ok: false,
          description: 'Bad Request: chat not found'
        })
      } as any);

      const res = await sendTelegramMessage({
        botToken: '123:ABC',
        chatId: '99999',
        text: 'Hello!'
      });

      expect(res.success).toBe(false);
      expect(res.error).toContain('chat not found');
    });
  });

  describe('testTelegramConnection', () => {
    it('successfully tests connection and retrieves bot name', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        status: 200,
        statusText: 'OK',
        json: async () => ({
          ok: true,
          result: {
            id: 123456,
            first_name: 'SuperAgentBot',
            username: 'superagent_bot'
          }
        })
      } as any);

      const res = await testTelegramConnection('123:ABC');
      expect(res.success).toBe(true);
      expect(res.botName).toBe('SuperAgentBot');
      expect(res.username).toBe('@superagent_bot');
    });

    it('does not send message when sendTestMessage is false', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        status: 200,
        statusText: 'OK',
        json: async () => ({
          ok: true,
          result: {
            id: 123456,
            first_name: 'SuperAgentBot',
            username: 'superagent_bot'
          }
        })
      } as any);
      globalThis.fetch = mockFetch;

      const res = await testTelegramConnection('123:ABC', '99999', false);
      expect(res.success).toBe(true);
      expect(res.botName).toBe('SuperAgentBot');
      // Only getMe was called, sendMessage was not
      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(mockFetch.mock.calls[0][0]).toContain('/getMe');
    });

    it('sends test message when sendTestMessage is true and chatId is provided', async () => {
      const mockFetch = vi.fn()
        .mockResolvedValueOnce({
          status: 200,
          statusText: 'OK',
          json: async () => ({
            ok: true,
            result: {
              id: 123456,
              first_name: 'SuperAgentBot',
              username: 'superagent_bot'
            }
          })
        } as any)
        .mockResolvedValueOnce({
          status: 200,
          statusText: 'OK',
          json: async () => ({
            ok: true,
            result: {
              message_id: 888
            }
          })
        } as any);
      globalThis.fetch = mockFetch;

      const res = await testTelegramConnection('123:ABC', '99999', true);
      expect(res.success).toBe(true);
      expect(res.botName).toBe('SuperAgentBot');
      expect(mockFetch).toHaveBeenCalledTimes(2);
      expect(mockFetch.mock.calls[0][0]).toContain('/getMe');
      expect(mockFetch.mock.calls[1][0]).toContain('/sendMessage');
    });
  });

  describe('Telegram Settings Persistence', () => {
    it('persists and loads telegram configuration via SettingsStorage', async () => {
      const { SettingsStorage } = await import('../src/storage/settings-store.js');
      SettingsStorage.saveSettings({
        telegram: {
          enabled: true,
          botToken: '987654:ABCDEF',
          chatId: '12345678'
        }
      });

      const loaded = SettingsStorage.loadSettings();
      expect(loaded.telegram).toBeDefined();
      expect(loaded.telegram?.botToken).toBe('987654:ABCDEF');
      expect(loaded.telegram?.chatId).toBe('12345678');
      expect(loaded.telegram?.enabled).toBe(true);

      const resolved = getTelegramConfig();
      expect(resolved.botToken).toBe('987654:ABCDEF');
      expect(resolved.chatId).toBe('12345678');
    });
  });

  describe('notify_message built-in tool', () => {
    it('registers notify_message in createBuiltinTools and executes cleanly', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        status: 200,
        statusText: 'OK',
        json: async () => ({
          ok: true,
          result: {
            message_id: 100
          }
        })
      } as any);

      const tools = createBuiltinTools();
      const notifyTool = tools.find((t) => t.name === 'notify_message');
      expect(notifyTool).toBeDefined();

      const result = await notifyTool?.execute({
        platform: 'telegram',
        message: 'Task completed successfully!',
        chat_id: '123456'
      });

      // Will report delivered or missing token depending on env
      expect(typeof result).toBe('string');
    });
  });
});
