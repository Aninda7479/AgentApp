/**
 * SuperAgent Browser Extension — Unit Test Suite
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { ExtensionSessionStore } from '../src/shared/session-store.js';
import { ContentPageTools } from '../src/content/page-tools.js';
import { ContentElementTools } from '../src/content/element-tools.js';
import { ElementPicker } from '../src/content/content-script.js';
import { ToolRelay } from '../src/background/tool-relay.js';

describe('SuperAgent Browser Extension Test Suite', () => {
  beforeEach(async () => {
    await ExtensionSessionStore.clearAuthToken();
  });

  describe('Session Store', () => {
    it('should initialize with default server configuration', async () => {
      const config = await ExtensionSessionStore.getServerConfig();
      expect(config.baseUrl).toContain('1469');
      expect(config.autoConnect).toBe(true);
    });

    it('should store and retrieve auth tokens correctly', async () => {
      await ExtensionSessionStore.setAuthToken('test_sa_token_123');
      const token = await ExtensionSessionStore.getAuthToken();
      expect(token).toBe('test_sa_token_123');
    });

    it('should update server config accurately', async () => {
      const updated = await ExtensionSessionStore.setServerConfig({
        baseUrl: 'http://192.168.1.100:1469',
        selectedModel: 'claude-3-5-sonnet-20241022'
      });
      expect(updated.baseUrl).toBe('http://192.168.1.100:1469');
      expect(updated.selectedModel).toBe('claude-3-5-sonnet-20241022');
    });

    it('should generate and preserve session IDs', async () => {
      const sid = await ExtensionSessionStore.getCurrentSessionId();
      expect(sid).toMatch(/^ext-chat-/);
      await ExtensionSessionStore.setCurrentSessionId('custom-sid-777');
      const retrieved = await ExtensionSessionStore.getCurrentSessionId();
      expect(retrieved).toBe('custom-sid-777');
    });

    it('should return connected: false by default when not initialized', async () => {
      const auth = await ExtensionSessionStore.getAuthState();
      expect(auth.connected).toBe(false);
    });

    it('should store and update auth state with connected flag', async () => {
      await ExtensionSessionStore.setAuthState({
        connected: true,
        authenticated: true,
        authRequired: true,
        username: 'admin'
      });
      const auth = await ExtensionSessionStore.getAuthState();
      expect(auth.connected).toBe(true);
      expect(auth.authenticated).toBe(true);
      expect(auth.username).toBe('admin');
    });
  });

  describe('Page Tools', () => {
    it('should extract metadata from DOM', () => {
      const meta = ContentPageTools.getPageMetadata();
      expect(meta).toBeDefined();
      expect(typeof meta.url).toBe('string');
    });
  });

  describe('Element Tools', () => {
    it('should query elements with formatted summaries', () => {
      const summaries = ContentElementTools.queryElements('body');
      expect(Array.isArray(summaries)).toBe(true);
      if (summaries.length > 0) {
        expect(summaries[0].tag).toBe('body');
        expect(summaries[0].rect).toBeDefined();
      }
    });

    it('should generate a simplified DOM tree structure', () => {
      const tree = ContentElementTools.getElementTree('body', 2);
      expect(tree).toBeDefined();
      expect(tree.tag).toBe('body');
    });
  });

  describe('Element Picker & Section Context', () => {
    it('should start and complete element picking gracefully in mock environment', () => {
      let result: any = null;
      ElementPicker.start((res) => {
        result = res;
      });
      expect(result).toBeDefined();
      expect(result.selector).toBeDefined();
      expect(result.text).toBeDefined();
    });

    it('should handle cancel without error', () => {
      expect(() => ElementPicker.cancel()).not.toThrow();
    });
  });

  describe('Tool Relay', () => {
    it('should handle unconfigured tab gracefully', async () => {
      // In non-browser Node/Vitest env where chrome.tabs query returns empty
      const res = await ToolRelay.execute({
        tool: 'extract_page_content',
        input: {}
      });
      expect(res).toBeDefined();
    });
  });
});
