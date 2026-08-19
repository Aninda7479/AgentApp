/**
 * SuperAgent Browser Extension — Unit Test Suite
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { ExtensionSessionStore } from '../src/shared/session-store.js';
import { ContentPageTools } from '../src/content/page-tools.js';
import { ContentElementTools } from '../src/content/element-tools.js';
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
