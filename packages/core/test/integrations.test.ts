import { describe, it, expect } from 'vitest';
import {
  MCP_CATALOG,
  resolveMcpServer,
  searchMcpCatalog,
  getMcpCatalogEntry,
  PLUGIN_CATALOG,
  getPlugin,
  defaultPluginState,
  type McpCatalogEntry
} from '../src/index.js';

describe('Integrations Catalog (Steps 100 - 109)', () => {
  describe('Step 100: MCP Catalog Definitions', () => {
    it('should expose a curated list of popular MCP servers', () => {
      expect(Array.isArray(MCP_CATALOG)).toBe(true);
      expect(MCP_CATALOG.length).toBeGreaterThanOrEqual(10);

      const ids = MCP_CATALOG.map((e) => e.id);
      expect(ids).toContain('filesystem');
      expect(ids).toContain('github');
      expect(ids).toContain('postgres');
      // ids are unique
      expect(new Set(ids).size).toBe(ids.length);
    });

    it('should mark required keys correctly', () => {
      const github = getMcpCatalogEntry('github')!;
      expect(github).toBeDefined();
      const tokenKey = github.envKeys.find((k) => k.key === 'GITHUB_PERSONAL_ACCESS_TOKEN')!;
      expect(tokenKey.required).toBe(true);
      expect(tokenKey.secret).toBe(true);
      expect(tokenKey.url).toContain('github.com');
    });
  });

  describe('Step 101: MCP Server Resolution', () => {
    it('should resolve a command-only server without keys', () => {
      const memory = getMcpCatalogEntry('memory')!;
      const resolved = resolveMcpServer(memory, {});
      expect(resolved.name).toBe('Memory');
      expect(resolved.transport).toBe('stdio');
      expect(resolved.commandOrUrl).toContain('@modelcontextprotocol/server-memory');
      expect(Object.keys(resolved.env)).toHaveLength(0);
    });

    it('should fill command/arg placeholders and collect env for keyed servers', () => {
      const github = getMcpCatalogEntry('github')!;
      const resolved = resolveMcpServer(github, {
        GITHUB_PERSONAL_ACCESS_TOKEN: 'ghp_demo'
      });
      expect(resolved.commandOrUrl).toContain('@modelcontextprotocol/server-github');
      expect(resolved.env.GITHUB_PERSONAL_ACCESS_TOKEN).toBe('ghp_demo');
    });

    it('should inject a value into an argument placeholder', () => {
      const sqlite = getMcpCatalogEntry('sqlite')!;
      const resolved = resolveMcpServer(sqlite, { DB_PATH: '/tmp/app.db' });
      expect(resolved.commandOrUrl).toContain('--db-path');
      expect(resolved.commandOrUrl).toContain('/tmp/app.db');
    });

    it('should return the raw url for sse/http transports', () => {
      const entry: McpCatalogEntry = {
        id: 'remote',
        name: 'Remote',
        description: 'remote',
        transport: 'sse',
        command: 'http://localhost:9000/sse',
        args: [],
        envKeys: [
          { key: 'TOKEN', label: 'Token', required: true, secret: true }
        ],
        tags: []
      };
      const resolved = resolveMcpServer(entry, { TOKEN: 'abc' });
      expect(resolved.transport).toBe('sse');
      expect(resolved.commandOrUrl).toBe('http://localhost:9000/sse');
      expect(resolved.env.TOKEN).toBe('abc');
    });

    it('should omit empty key values from env', () => {
      const github = getMcpCatalogEntry('github')!;
      const resolved = resolveMcpServer(github, { GITHUB_PERSONAL_ACCESS_TOKEN: '' });
      expect(resolved.env.GITHUB_PERSONAL_ACCESS_TOKEN).toBeUndefined();
    });
  });

  describe('Step 102: MCP Catalog Search', () => {
    it('should return the whole catalog for an empty query', () => {
      expect(searchMcpCatalog('').length).toBe(MCP_CATALOG.length);
    });

    it('should match by name, description, and tags', () => {
      expect(searchMcpCatalog('github').map((e) => e.id)).toContain('github');
      expect(searchMcpCatalog('database').map((e) => e.id)).toEqual(
        expect.arrayContaining(['postgres', 'sqlite'])
      );
    });
  });

  describe('Step 103: Plugin Catalog Definitions', () => {
    it('should expose the seven built-in plugins', () => {
      const ids = PLUGIN_CATALOG.map((p) => p.id);
      expect(ids).toEqual(
        expect.arrayContaining([
          'browser-use',
          'computer-use',
          'document',
          'pdf',
          'spreadsheets',
          'presentations',
          'visualize'
        ])
      );
      expect(new Set(ids).size).toBe(ids.length);
    });

    it('should map each plugin to a distinct capability', () => {
      const caps = PLUGIN_CATALOG.map((p) => p.capability);
      expect(new Set(caps).size).toBe(PLUGIN_CATALOG.length);
    });

    it('should look up a plugin by id', () => {
      const plugin = getPlugin('pdf');
      expect(plugin).toBeDefined();
      expect(plugin!.capability).toBe('pdf');
    });

    it('should produce a default-enabled state map', () => {
      const state = defaultPluginState();
      expect(state['browser-use']).toBe(true);
      expect(state['visualize']).toBe(false);
      expect(Object.keys(state).length).toBe(PLUGIN_CATALOG.length);
    });
  });
});
