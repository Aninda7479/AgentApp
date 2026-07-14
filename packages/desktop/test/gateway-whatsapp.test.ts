import { describe, it, expect } from 'vitest';
import { WhatsAppChannelAdapter } from '../src/gateway/channels/whatsapp';

describe('WhatsApp channel adapter', () => {
  it('sends a text message through the Cloud API', async () => {
    const calls: { url: string; init: any }[] = [];
    const customFetch: any = async (url: string, init: any) => {
      calls.push({ url, init });
      return { ok: true, status: 200, json: async () => ({ messages: [{ id: 'wamid.TEST' }] }) };
    };

    const adapter = new WhatsAppChannelAdapter(customFetch);
    await adapter.initialize({ enabled: true, botToken: 'TOK', phoneNumberId: '12345', verifyToken: 'vtoken' });
    await adapter.start();

    const ok = await adapter.sendMessage({
      channelType: 'whatsapp',
      channelId: '+15551234567',
      content: 'Hello from SuperAgent'
    });

    expect(ok).toBe(true);
    expect(calls.length).toBe(1);
    expect(calls[0].url).toContain('/v19.0/12345/messages');
    expect(calls[0].init.headers.Authorization).toBe('Bearer TOK');
    const body = JSON.parse(calls[0].init.body);
    expect(body.text.body).toBe('Hello from SuperAgent');
    expect(body.to).toBe('+15551234567');
    expect(body.messaging_product).toBe('whatsapp');

    await adapter.stop();
  });

  it('verifies the webhook subscription handshake', () => {
    const adapter = new WhatsAppChannelAdapter();
    adapter.initialize({ enabled: false, verifyToken: 'secret' });

    const challenge = adapter.verifyWebhookHub({
      'hub.mode': 'subscribe',
      'hub.verify_token': 'secret',
      'hub.challenge': 'abc123'
    });
    expect(challenge).toBe('abc123');

    const bad = adapter.verifyWebhookHub({
      'hub.mode': 'subscribe',
      'hub.verify_token': 'wrong',
      'hub.challenge': 'x'
    });
    expect(bad).toBeNull();
  });

  it('parses inbound webhook messages and forwards them to the handler', () => {
    const adapter = new WhatsAppChannelAdapter();
    adapter.initialize({ enabled: false });

    const received: any[] = [];
    adapter.onMessage((m) => received.push(m));

    const payload = {
      entry: [{
        changes: [{
          value: {
            messages: [{
              from: '+15557654321',
              id: 'wamid.IN',
              timestamp: '1700000000',
              text: { body: 'Hi there' },
              profile: { name: 'Alice' }
            }]
          }
        }]
      }]
    };

    const parsed = adapter.processIncomingWebhook(payload);
    expect(parsed.length).toBe(1);
    expect(parsed[0].content).toBe('Hi there');
    expect(parsed[0].channelId).toBe('+15557654321');
    expect(parsed[0].senderName).toBe('Alice');
    expect(received.length).toBe(1);
  });

  it('refuses to send before being started', async () => {
    const adapter = new WhatsAppChannelAdapter();
    adapter.initialize({ enabled: false });
    await expect(
      adapter.sendMessage({ channelType: 'whatsapp', channelId: 'x', content: 'y' })
    ).rejects.toThrow(/not connected/i);
  });
});
