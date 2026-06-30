import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SystemTrayManager } from '../src/main/tray';
import { DesktopNotificationSystem } from '../src/main/notifications';
import { OmnichannelGatewayDaemon } from '../src/gateway/daemon';
import { TelegramChannelAdapter } from '../src/gateway/channels/telegram';
import { DiscordChannelAdapter } from '../src/gateway/channels/discord';
import { SlackChannelAdapter } from '../src/gateway/channels/slack';
import { ReleaseInstallerBuilder } from '../src/builder/installer';
import { IncomingMessage } from '../src/gateway/channels/types';

vi.mock('electron', () => ({}));

describe('Desktop Gateway Suite (Steps 094 - 100)', () => {
  describe('Step 094: System Tray Background Daemon Process', () => {
    it('should initialize system tray stub in headless test environment', () => {
      const trayManager = new SystemTrayManager();
      const initialized = trayManager.initTray();
      expect(initialized).toBe(false);
      expect(trayManager.getStatus()).toBe('offline');
    });

    it('should update system status and tooltip correctly', () => {
      const trayManager = new SystemTrayManager();
      trayManager.updateStatus('online', 'Custom Tooltip');
      expect(trayManager.getStatus()).toBe('online');
      expect(trayManager.getTooltip()).toBe('Custom Tooltip');
    });

    it('should store and retrieve menu items', () => {
      const trayManager = new SystemTrayManager();
      const menuItems = [
        { id: '1', label: 'Show App' },
        { id: '2', label: 'Quit' }
      ];
      trayManager.setMenuItems(menuItems);
      expect(trayManager.getMenuItems()).toEqual(menuItems);
    });

    it('should handle mock electron tray provider cleanly', () => {
      const mockTray = {
        setToolTip: vi.fn(),
        setContextMenu: vi.fn(),
        on: vi.fn(),
        destroy: vi.fn()
      };
      const mockMenu = {
        buildFromTemplate: vi.fn().mockReturnValue({})
      };
      const mockNativeImage = {
        createEmpty: vi.fn().mockReturnValue({}),
        createFromPath: vi.fn().mockReturnValue({})
      };

      const trayManager = new SystemTrayManager({
        electronProvider: {
          Tray: vi.fn().mockImplementation(function (this: any) {
            return mockTray;
          }),
          Menu: mockMenu,
          nativeImage: mockNativeImage
        }
      });

      const initialized = trayManager.initTray('test/icon.png');
      expect(initialized).toBe(true);
      expect(mockNativeImage.createFromPath).toHaveBeenCalledWith('test/icon.png');

      trayManager.setMenuItems([{ id: 'test', label: 'Test Item' }]);
      expect(mockMenu.buildFromTemplate).toHaveBeenCalled();

      trayManager.destroy();
      expect(mockTray.destroy).toHaveBeenCalled();
    });
  });

  describe('Step 095: Desktop Notification System', () => {
    it('should send desktop notifications and keep history', () => {
      const notifier = new DesktopNotificationSystem();
      const record = notifier.sendNotification({
        title: 'New Message',
        body: 'You have received a background task result.'
      });

      expect(record.title).toBe('New Message');
      expect(record.body).toBe('You have received a background task result.');
      expect(notifier.getHistory().length).toBe(1);
      expect(notifier.getHistory()[0].id).toBe(record.id);
    });

    it('should clear notification history on demand', () => {
      const notifier = new DesktopNotificationSystem();
      notifier.sendNotification({ title: 'Test 1', body: 'Body 1' });
      notifier.sendNotification({ title: 'Test 2', body: 'Body 2' });
      expect(notifier.getHistory().length).toBe(2);

      notifier.clearHistory();
      expect(notifier.getHistory().length).toBe(0);
    });
  });

  describe('Step 096: Omnichannel Background Gateway Daemon', () => {
    let daemon: OmnichannelGatewayDaemon;

    beforeEach(() => {
      daemon = new OmnichannelGatewayDaemon();
    });

    it('should register and unregister channel adapters', async () => {
      const adapter = new TelegramChannelAdapter();
      daemon.registerAdapter(adapter);
      expect(daemon.getRegisteredChannelTypes()).toContain('telegram');

      const success = daemon.unregisterAdapter('telegram');
      expect(success).toBe(true);
      expect(daemon.getRegisteredChannelTypes()).not.toContain('telegram');
    });

    it('should throw error when registering duplicate channel adapter', () => {
      const adapter1 = new TelegramChannelAdapter();
      const adapter2 = new TelegramChannelAdapter();
      daemon.registerAdapter(adapter1);
      expect(() => daemon.registerAdapter(adapter2)).toThrow();
    });

    it('should start and stop all registered adapters and update daemon state', async () => {
      const tgAdapter = new TelegramChannelAdapter();
      await tgAdapter.initialize({ enabled: true, botToken: 'test_token' });
      daemon.registerAdapter(tgAdapter);

      expect(daemon.getState()).toBe('stopped');
      await daemon.start();
      expect(daemon.getState()).toBe('running');
      expect(tgAdapter.isConnected).toBe(true);

      await daemon.stop();
      expect(daemon.getState()).toBe('stopped');
      expect(tgAdapter.isConnected).toBe(false);
    });
  });

  describe('Step 097: Telegram Bot Channel Adapter', () => {
    it('should initialize and manage connection state', async () => {
      const adapter = new TelegramChannelAdapter();
      await adapter.initialize({ enabled: true, botToken: '123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11' });
      expect(adapter.isConnected).toBe(false);

      await adapter.start();
      expect(adapter.isConnected).toBe(true);

      await adapter.stop();
      expect(adapter.isConnected).toBe(false);
    });

    it('should parse incoming Telegram updates and invoke message handler', async () => {
      const adapter = new TelegramChannelAdapter();
      await adapter.initialize({ enabled: true, botToken: 'mock_token' });
      await adapter.start();

      let receivedMsg: IncomingMessage | null = null;
      adapter.onMessage((msg) => {
        receivedMsg = msg;
      });

      adapter.processIncomingUpdate({
        update_id: 100,
        message: {
          message_id: 42,
          date: 1600000000,
          chat: { id: 999 },
          from: { id: 888, username: 'testuser' },
          text: 'Hello Telegram'
        }
      });

      expect(receivedMsg).not.toBeNull();
      if (receivedMsg) {
        const msg: IncomingMessage = receivedMsg;
        expect(msg.id).toBe('42');
        expect(msg.channelType).toBe('telegram');
        expect(msg.channelId).toBe('999');
        expect(msg.senderId).toBe('888');
        expect(msg.senderName).toBe('testuser');
        expect(msg.content).toBe('Hello Telegram');
      }

      await adapter.stop();
    });
  });

  describe('Step 098: Discord Bot Channel Adapter', () => {
    it('should process Discord gateway payloads correctly', async () => {
      const adapter = new DiscordChannelAdapter();
      await adapter.initialize({ enabled: true, botToken: 'mock_discord_token' });
      await adapter.start();

      let receivedMsg: IncomingMessage | null = null;
      adapter.onMessage((msg) => {
        receivedMsg = msg;
      });

      adapter.processGatewayPayload({
        t: 'MESSAGE_CREATE',
        d: {
          id: 'msg_101',
          channel_id: 'chan_55',
          author: { id: 'usr_77', username: 'DiscordFriend' },
          content: 'Hello Discord',
          timestamp: '2026-06-29T12:00:00Z'
        }
      });

      expect(receivedMsg).not.toBeNull();
      if (receivedMsg) {
        const msg: IncomingMessage = receivedMsg;
        expect(msg.id).toBe('msg_101');
        expect(msg.channelType).toBe('discord');
        expect(msg.channelId).toBe('chan_55');
        expect(msg.senderName).toBe('DiscordFriend');
        expect(msg.content).toBe('Hello Discord');
      }

      await adapter.stop();
    });
  });

  describe('Step 099: Slack Bot Channel Adapter', () => {
    it('should process Slack event callbacks correctly', async () => {
      const adapter = new SlackChannelAdapter();
      await adapter.initialize({ enabled: true, botToken: 'mock_slack_token' });
      await adapter.start();

      let receivedMsg: IncomingMessage | null = null;
      adapter.onMessage((msg) => {
        receivedMsg = msg;
      });

      adapter.processEventPayload({
        type: 'event_callback',
        event: {
          type: 'message',
          client_msg_id: 'slack_msg_1',
          channel: 'C123456',
          user: 'U654321',
          text: 'Hello Slack',
          ts: '1600000000.000200'
        }
      });

      expect(receivedMsg).not.toBeNull();
      if (receivedMsg) {
        const msg: IncomingMessage = receivedMsg;
        expect(msg.id).toBe('slack_msg_1');
        expect(msg.channelType).toBe('slack');
        expect(msg.channelId).toBe('C123456');
        expect(msg.senderId).toBe('U654321');
        expect(msg.content).toBe('Hello Slack');
      }

      await adapter.stop();
    });
  });

  describe('Step 100: Complete End-to-End Build & Release Installer', () => {
    it('should generate valid electron-builder configuration', () => {
      const builder = new ReleaseInstallerBuilder({
        appId: 'com.superagent.app',
        productName: 'SuperAgent Suite'
      });

      const config = builder.generateBuildConfig();
      expect(config.appId).toBe('com.superagent.app');
      expect(config.productName).toBe('SuperAgent Suite');
      expect(config.win.target).toContain('nsis');

      const validation = builder.validateConfig(config);
      expect(validation.valid).toBe(true);
      expect(validation.errors.length).toBe(0);
    });

    it('should run simulated release packaging build successfully', async () => {
      const builder = new ReleaseInstallerBuilder();
      const result = await builder.runSimulatedBuild();

      expect(result.success).toBe(true);
      expect(result.artifacts.length).toBeGreaterThan(0);
      expect(result.config.productName).toBe('SuperAgent Desktop');
    });
  });
});
