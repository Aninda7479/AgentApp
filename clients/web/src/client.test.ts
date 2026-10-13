import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DaemonClient } from './client';
import { getDefaultConfig } from './config';

describe('DaemonClient', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('initializes with default config pointing to port 1469', () => {
    const config = getDefaultConfig();
    expect(config.httpBaseUrl).toContain('1469');
    expect(config.wsBaseUrl).toContain('1469');
    expect(config.wsBaseUrl).toContain('/api/ws');

    const client = new DaemonClient(config);
    expect(client.getConnectionState()).toBe('disconnected');
    expect(client.getConfig().httpBaseUrl).toBe(config.httpBaseUrl);
  });

  it('notifies state listeners when connection state changes', () => {
    const client = new DaemonClient();
    const states: string[] = [];

    const unsub = client.onStateChange((state) => {
      states.push(state);
    });

    expect(states).toEqual(['disconnected']);
    unsub();
  });

  it('dispatches IPC requests with correct json envelope', async () => {
    const client = new DaemonClient({
      httpBaseUrl: 'http://localhost:1469',
      wsBaseUrl: 'ws://localhost:1469/api/ws',
      defaultSessionId: 'test-sess',
    });

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: { status: 'ok', version: '0.44.0' } }),
    });
    global.fetch = mockFetch;

    const res = await client.invoke<{ status: string; version: string }>('system-info', 'arg1');
    expect(mockFetch).toHaveBeenCalledWith(
      'http://localhost:1469/api/ipc/system-info',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ args: ['arg1'] }),
      })
    );
    expect(res).toEqual({ status: 'ok', version: '0.44.0' });
  });

  it('dispatches event callbacks for channel listeners', () => {
    const client = new DaemonClient();
    const events: unknown[] = [];

    const unsub = client.on('test-channel', (data) => {
      events.push(data);
    });

    // Simulate WS message handling via private emitter
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (client as unknown as { handleWsMessage: (msg: string) => void }).handleWsMessage(
      JSON.stringify({ channel: 'test-channel', data: { hello: 'world' } })
    );

    expect(events).toEqual([{ hello: 'world' }]);
    unsub();
  });
});
