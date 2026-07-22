import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { join } from 'path';
import { existsSync, rmSync, writeFileSync, mkdirSync } from 'fs';
import {
  MCPClient,
  MCPClientManager,
  createMCPTool,
  MCPToolRegistry,
  MCPResourceManager,
  MCPPermissionGuard,
  createStdioTransport,
  createSSETransport,
  createHTTPTransport,
  MCPStdioTransport,
  MCPSSETransport,
  MCPHTTPTransport,
  MCPToolContext,
} from '../src/index.js';
import {
  MCPConfigStore,
  registerMCPCommand,
  SlashCommandRouter,
} from '../../cli/src/index.js';

/**
 * CERTAIN-6 — MCP list/connect smoke (offline mock)
 *
 * Tests the full MCP user journey across Core + CLI surfaces:
 *   1. MCPClient init + connection state
 *   2. MCPClientManager: addServer / listServers
 *   3. createMCPTool: list + add actions via agent tool interface
 *   4. MCPToolRegistry: register server → discoverTools → execute → unregister
 *   5. MCPToolRegistry: prefix naming and unprefix modes
 *   6. MCPPermissionGuard: all modes (auto, read-only, manual, allow/block lists)
 *   7. MCPResourceManager: list resources, inject prompts, error on missing server
 *   8. Transport factory functions: stdio, SSE, HTTP
 *   9. CLI MCPConfigStore: load, upsert, remove, formatList
 *  10. CLI /mcp command: list, add (stdio + sse), get, remove via router
 *  11. CLI /mcp error paths: bad URL, unknown subcommand, missing args
 */
describe('CERTAIN-6: MCP list/connect smoke (offline mock)', () => {
  // ── 1. MCPClient core init ────────────────────────────────────────────

  describe('MCPClient initialization', () => {
    it('creates a client with config and starts disconnected', () => {
      const client = new MCPClient({ name: 'test-client', version: '1.0.0' });
      expect(client).toBeDefined();
      expect(client.isConnected()).toBe(false);
      expect(client.rawClient).toBeDefined();
    });

    it('exposes server capabilities as undefined before connect', () => {
      const client = new MCPClient({ name: 'test-client', version: '1.0.0' });
      expect(client.getServerCapabilities()).toBeUndefined();
      expect(client.getServerVersion()).toBeUndefined();
    });
  });

  // ── 2. MCPClientManager (core/tools/mcp.ts) ─────────────────────────

  describe('MCPClientManager', () => {
    let manager: MCPClientManager;

    beforeEach(() => {
      manager = new MCPClientManager();
    });

    it('starts with an empty server list', () => {
      expect(manager.listServers()).toEqual([]);
    });

    it('adds a server and lists it', () => {
      manager.addServer('fs', 'npx -y @modelcontextprotocol/server-filesystem .');
      const servers = manager.listServers();
      expect(servers).toHaveLength(1);
      expect(servers[0].name).toBe('fs');
      expect(servers[0].command).toContain('server-filesystem');
    });

    it('adds multiple servers', () => {
      manager.addServer('fs', 'npx fs-server');
      manager.addServer('db', 'npx db-server');
      expect(manager.listServers()).toHaveLength(2);
    });

    it('replaces a server with the same name', () => {
      manager.addServer('fs', 'v1');
      manager.addServer('fs', 'v2');
      const servers = manager.listServers();
      expect(servers).toHaveLength(1);
      expect(servers[0].command).toBe('v2');
    });
  });

  // ── 3. createMCPTool agent interface ──────────────────────────────────

  describe('createMCPTool', () => {
    it('returns a tool definition with correct name and schema', () => {
      const manager = new MCPClientManager();
      const tool = createMCPTool(manager);
      expect(tool.name).toBe('mcp_manager');
      expect(tool.description).toContain('MCP');
      expect(tool.parameters.properties.action).toBeDefined();
    });

    it('list action returns empty array initially', async () => {
      const manager = new MCPClientManager();
      const tool = createMCPTool(manager);
      const result = await tool.execute({ action: 'list' }, { provider: 'openai', apiKey: 'k' });
      expect(result).toEqual({ servers: [] });
    });

    it('add action registers a server and list shows it', async () => {
      const manager = new MCPClientManager();
      const tool = createMCPTool(manager);
      await tool.execute(
        { action: 'add', name: 'git', command: 'mcp-git' },
        { provider: 'openai', apiKey: 'k' }
      );
      const list = await tool.execute({ action: 'list' }, { provider: 'openai', apiKey: 'k' });
      expect((list as any).servers).toHaveLength(1);
      expect((list as any).servers[0].name).toBe('git');
    });

    it('add action throws when name or command is missing', async () => {
      const manager = new MCPClientManager();
      const tool = createMCPTool(manager);
      await expect(
        tool.execute({ action: 'add', name: 'x' }, { provider: 'openai', apiKey: 'k' })
      ).rejects.toThrow('Name and command are required');
    });
  });

  // ── 4. MCPToolRegistry: register → discover → execute → unregister ───

  describe('MCPToolRegistry', () => {
    it('discovers tools from a connected server with prefix', async () => {
      const registry = new MCPToolRegistry({ prefixToolName: true });
      const client = new MCPClient({ name: 'mock', version: '1.0.0' });

      vi.spyOn(client, 'isConnected').mockReturnValue(true);
      vi.spyOn(client, 'listTools').mockResolvedValue({
        tools: [
          { name: 'read', description: 'Read file', inputSchema: { type: 'object', properties: { path: { type: 'string' } } } },
          { name: 'write', description: 'Write file', inputSchema: { type: 'object', properties: { path: { type: 'string' }, content: { type: 'string' } } } },
        ],
      } as any);
      vi.spyOn(client, 'callTool').mockResolvedValue({ content: [{ type: 'text', text: 'ok' }] });

      registry.registerServer('fs', client);
      const tools = await registry.discoverTools('fs');

      expect(tools).toHaveLength(2);
      expect(tools[0].name).toBe('fs_read');
      expect(tools[1].name).toBe('fs_write');

      const result = await tools[0].execute({ path: '/tmp/test' }, { provider: 'openai', apiKey: 'k' });
      expect(client.callTool).toHaveBeenCalledWith('read', { path: '/tmp/test' });
      expect(result).toEqual({ content: [{ type: 'text', text: 'ok' }] });
    });

    it('discovers tools without prefix when prefixToolName=false', async () => {
      const registry = new MCPToolRegistry({ prefixToolName: false });
      const client = new MCPClient({ name: 'mock', version: '1.0.0' });

      vi.spyOn(client, 'isConnected').mockReturnValue(true);
      vi.spyOn(client, 'listTools').mockResolvedValue({
        tools: [{ name: 'calc', description: 'Calc', inputSchema: { type: 'object', properties: {} } }],
      } as any);

      registry.registerServer('math', client);
      const tools = await registry.discoverTools('math');
      expect(tools[0].name).toBe('calc');
    });

    it('skips disconnected servers', async () => {
      const registry = new MCPToolRegistry();
      const client = new MCPClient({ name: 'mock', version: '1.0.0' });
      vi.spyOn(client, 'isConnected').mockReturnValue(false);

      registry.registerServer('offline', client);
      const tools = await registry.discoverTools('offline');
      expect(tools).toEqual([]);
    });

    it('unregisterServer removes server and its tools', async () => {
      const registry = new MCPToolRegistry();
      const client = new MCPClient({ name: 'mock', version: '1.0.0' });
      vi.spyOn(client, 'isConnected').mockReturnValue(true);
      vi.spyOn(client, 'listTools').mockResolvedValue({
        tools: [{ name: 't', description: 'T', inputSchema: { type: 'object', properties: {} } }],
      } as any);

      registry.registerServer('s', client);
      await registry.discoverTools('s');
      expect(registry.getRegisteredTools()).toHaveLength(1);

      registry.unregisterServer('s');
      expect(registry.getRegisteredTools()).toEqual([]);
      expect(registry.getServer('s')).toBeUndefined();
    });

    it('getTool returns undefined for unknown tool', () => {
      const registry = new MCPToolRegistry();
      expect(registry.getTool('nope')).toBeUndefined();
    });

    it('getServer returns client for registered server', async () => {
      const registry = new MCPToolRegistry();
      const client = new MCPClient({ name: 'mock', version: '1.0.0' });
      registry.registerServer('x', client);
      expect(registry.getServer('x')).toBe(client);
    });
  });

  // ── 5. MCPToolRegistry with permission guard ──────────────────────────

  describe('MCPToolRegistry + permission guard integration', () => {
    it('blocks execution when guard denies permission', async () => {
      const guard = new MCPPermissionGuard({ mode: 'read-only' });
      const registry = new MCPToolRegistry({ guard, prefixToolName: true });
      const client = new MCPClient({ name: 'mock', version: '1.0.0' });

      vi.spyOn(client, 'isConnected').mockReturnValue(true);
      vi.spyOn(client, 'listTools').mockResolvedValue({
        tools: [{ name: 'delete', description: 'Delete all', inputSchema: { type: 'object', properties: {} }, annotations: { destructiveHint: true } }],
      } as any);

      registry.registerServer('db', client);
      const tools = await registry.discoverTools('db');
      expect(tools).toHaveLength(1);

      await expect(
        tools[0].execute({}, { provider: 'openai', apiKey: 'k' })
      ).rejects.toThrow('denied by permission guard');
    });

    it('allows execution when guard permits', async () => {
      const guard = new MCPPermissionGuard({ mode: 'auto' });
      const registry = new MCPToolRegistry({ guard });
      const client = new MCPClient({ name: 'mock', version: '1.0.0' });

      vi.spyOn(client, 'isConnected').mockReturnValue(true);
      vi.spyOn(client, 'listTools').mockResolvedValue({
        tools: [{ name: 'read', description: 'Read', inputSchema: { type: 'object', properties: {} } }],
      } as any);
      vi.spyOn(client, 'callTool').mockResolvedValue({ content: [{ type: 'text', text: 'data' }] });

      registry.registerServer('fs', client);
      const tools = await registry.discoverTools('fs');
      const result = await tools[0].execute({}, { provider: 'openai', apiKey: 'k' });
      expect(result).toEqual({ content: [{ type: 'text', text: 'data' }] });
    });

    it('setGuard dynamically changes permission behavior', async () => {
      const registry = new MCPToolRegistry({ prefixToolName: true });
      const client = new MCPClient({ name: 'mock', version: '1.0.0' });

      vi.spyOn(client, 'isConnected').mockReturnValue(true);
      vi.spyOn(client, 'listTools').mockResolvedValue({
        tools: [{ name: 't', description: 'T', inputSchema: { type: 'object', properties: {} }, annotations: { readOnlyHint: true } }],
      } as any);
      vi.spyOn(client, 'callTool').mockResolvedValue({ content: [{ type: 'text', text: 'ok' }] });

      registry.registerServer('s', client);
      const tools = await registry.discoverTools('s');

      // No guard — allowed
      await expect(tools[0].execute({}, { provider: 'openai', apiKey: 'k' })).resolves.toBeDefined();

      // Set read-only guard — tool has readOnlyHint=true so allowed
      const guard = new MCPPermissionGuard({ mode: 'read-only' });
      registry.setGuard(guard);
      await expect(tools[0].execute({}, { provider: 'openai', apiKey: 'k' })).resolves.toBeDefined();
    });
  });

  // ── 6. MCPPermissionGuard full coverage ───────────────────────────────

  describe('MCPPermissionGuard', () => {
    const baseCtx: MCPToolContext = {
      serverName: 's',
      toolName: 't',
      args: {},
    };

    it('auto mode: allows everything including destructive', async () => {
      const guard = new MCPPermissionGuard({ mode: 'auto' });
      expect(await guard.verifyPermission({ ...baseCtx, annotations: { destructiveHint: true } })).toBe(true);
    });

    it('read-only mode: allows read-only tools', async () => {
      const guard = new MCPPermissionGuard({ mode: 'read-only' });
      expect(await guard.verifyPermission({ ...baseCtx, annotations: { readOnlyHint: true } })).toBe(true);
    });

    it('read-only mode: blocks non-read-only tools', async () => {
      const guard = new MCPPermissionGuard({ mode: 'read-only' });
      expect(await guard.verifyPermission({ ...baseCtx, annotations: {} })).toBe(false);
    });

    it('read-only mode: blocks destructive tools', async () => {
      const guard = new MCPPermissionGuard({ mode: 'read-only' });
      expect(await guard.verifyPermission({ ...baseCtx, annotations: { destructiveHint: true } })).toBe(false);
    });

    it('manual mode: blocks destructive tools without handler', async () => {
      const guard = new MCPPermissionGuard({ mode: 'manual' });
      expect(await guard.verifyPermission({ ...baseCtx, annotations: { destructiveHint: true } })).toBe(false);
    });

    it('manual mode: allows non-destructive tools without handler', async () => {
      const guard = new MCPPermissionGuard({ mode: 'manual' });
      expect(await guard.verifyPermission({ ...baseCtx, annotations: {} })).toBe(true);
    });

    it('manual mode: delegates to onPermissionRequest handler', async () => {
      const handler = vi.fn().mockResolvedValue(true);
      const guard = new MCPPermissionGuard({ mode: 'manual', onPermissionRequest: handler });
      const ctx = { ...baseCtx, annotations: { destructiveHint: true } };
      expect(await guard.verifyPermission(ctx)).toBe(true);
      expect(handler).toHaveBeenCalledWith(ctx);
    });

    it('manual mode: handler returns false → blocked', async () => {
      const guard = new MCPPermissionGuard({ mode: 'manual', onPermissionRequest: vi.fn().mockResolvedValue(false) });
      expect(await guard.verifyPermission({ ...baseCtx, annotations: { destructiveHint: true } })).toBe(false);
    });

    it('allowTool overrides block for specific tool', async () => {
      const guard = new MCPPermissionGuard({ mode: 'read-only' });
      guard.allowTool('special');
      expect(await guard.verifyPermission({ ...baseCtx, toolName: 'special' })).toBe(true);
    });

    it('blockTool blocks even in auto mode', async () => {
      const guard = new MCPPermissionGuard({ mode: 'auto' });
      guard.blockTool('dangerous');
      expect(await guard.verifyPermission({ ...baseCtx, toolName: 'dangerous' })).toBe(false);
    });

    it('blockTool with full server__tool name format', async () => {
      const guard = new MCPPermissionGuard({ mode: 'auto' });
      guard.blockTool('s__t');
      expect(await guard.verifyPermission(baseCtx)).toBe(false);
    });

    it('allowTool with full server__tool name format', async () => {
      const guard = new MCPPermissionGuard({ mode: 'read-only' });
      guard.allowTool('s__t');
      expect(await guard.verifyPermission(baseCtx)).toBe(true);
    });

    it('setMode changes permission behavior', async () => {
      const guard = new MCPPermissionGuard({ mode: 'auto' });
      expect(await guard.verifyPermission({ ...baseCtx, annotations: { destructiveHint: true } })).toBe(true);
      guard.setMode('read-only');
      expect(await guard.verifyPermission({ ...baseCtx, annotations: { destructiveHint: true } })).toBe(false);
    });

    it('getMode returns current mode', () => {
      const guard = new MCPPermissionGuard({ mode: 'read-only' });
      expect(guard.getMode()).toBe('read-only');
    });
  });

  // ── 7. MCPResourceManager ─────────────────────────────────────────────

  describe('MCPResourceManager', () => {
    let manager: MCPResourceManager;

    beforeEach(() => {
      manager = new MCPResourceManager();
    });

    it('listResources returns resources from connected server', async () => {
      const client = new MCPClient({ name: 'mock', version: '1.0.0' });
      vi.spyOn(client, 'listResources').mockResolvedValue({
        resources: [{ uri: 'file://a.txt', name: 'a.txt' }],
      } as any);

      manager.registerClient('docs', client);
      const result = await manager.listResources('docs');
      expect(result.resources).toHaveLength(1);
      expect(result.resources[0].uri).toBe('file://a.txt');
    });

    it('readResource returns content from connected server', async () => {
      const client = new MCPClient({ name: 'mock', version: '1.0.0' });
      vi.spyOn(client, 'readResource').mockResolvedValue({
        contents: [{ uri: 'file://a.txt', text: 'hello world' }],
      } as any);

      manager.registerClient('docs', client);
      const result = await manager.readResource('docs', 'file://a.txt');
      expect(result.contents[0].text).toBe('hello world');
    });

    it('injectPromptTemplate returns agent messages from server prompt', async () => {
      const client = new MCPClient({ name: 'mock', version: '1.0.0' });
      vi.spyOn(client, 'getPrompt').mockResolvedValue({
        messages: [
          { role: 'user', content: { type: 'text', text: 'Explain topic' } },
          { role: 'assistant', content: { type: 'text', text: 'Here is the explanation' } },
        ],
      } as any);

      manager.registerClient('prompts', client);
      const messages = await manager.injectPromptTemplate('prompts', 'explain', { topic: 'AI' });
      expect(messages).toHaveLength(2);
      expect(messages[0].role).toBe('user');
      expect(messages[0].content).toBe('Explain topic');
      expect(messages[1].role).toBe('assistant');
      expect(messages[1].content).toBe('Here is the explanation');
      expect(messages[0].id).toContain('mcp_prompt_prompts_explain');
    });

    it('listPrompts returns prompts from connected server', async () => {
      const client = new MCPClient({ name: 'mock', version: '1.0.0' });
      vi.spyOn(client, 'listPrompts').mockResolvedValue({
        prompts: [{ name: 'greet', description: 'Greeting prompt' }],
      } as any);

      manager.registerClient('chat', client);
      const result = await manager.listPrompts('chat');
      expect(result.prompts).toHaveLength(1);
      expect(result.prompts[0].name).toBe('greet');
    });

    it('throws when server not found for listResources', async () => {
      await expect(manager.listResources('missing')).rejects.toThrow('not found');
    });

    it('throws when server not found for readResource', async () => {
      await expect(manager.readResource('missing', 'uri')).rejects.toThrow('not found');
    });

    it('throws when server not found for getPrompt', async () => {
      await expect(manager.getPrompt('missing', 'p')).rejects.toThrow('not found');
    });

    it('unregisterClient removes the client', async () => {
      const client = new MCPClient({ name: 'mock', version: '1.0.0' });
      manager.registerClient('temp', client);
      manager.unregisterClient('temp');
      await expect(manager.listResources('temp')).rejects.toThrow('not found');
    });

    it('handles string content in prompt messages', async () => {
      const client = new MCPClient({ name: 'mock', version: '1.0.0' });
      vi.spyOn(client, 'getPrompt').mockResolvedValue({
        messages: [{ role: 'user', content: 'plain string content' }],
      } as any);

      manager.registerClient('p', client);
      const messages = await manager.injectPromptTemplate('p', 'test');
      expect(messages[0].content).toBe('plain string content');
    });

    it('handles non-text content objects in prompt messages', async () => {
      const client = new MCPClient({ name: 'mock', version: '1.0.0' });
      vi.spyOn(client, 'getPrompt').mockResolvedValue({
        messages: [{ role: 'user', content: { type: 'image', data: 'base64...' } }],
      } as any);

      manager.registerClient('p', client);
      const messages = await manager.injectPromptTemplate('p', 'test');
      expect(messages[0].content).toContain('image');
    });
  });

  // ── 8. Transport factories ───────────────────────────────────────────

  describe('Transport factory functions', () => {
    it('createStdioTransport returns MCPStdioTransport instance', () => {
      const t = createStdioTransport({ command: 'echo', args: ['hello'] });
      expect(t).toBeInstanceOf(MCPStdioTransport);
    });

    it('createSSETransport returns MCPSSETransport instance', () => {
      const t = createSSETransport({ url: 'http://localhost:8080/sse' });
      expect(t).toBeInstanceOf(MCPSSETransport);
    });

    it('createSSETransport with bearer token', () => {
      const t = createSSETransport({ url: 'http://localhost:8080/sse', bearerToken: 'tok' });
      expect(t).toBeInstanceOf(MCPSSETransport);
    });

    it('createHTTPTransport returns MCPHTTPTransport instance', () => {
      const t = createHTTPTransport({ url: 'http://localhost:8080/mcp' });
      expect(t).toBeInstanceOf(MCPHTTPTransport);
    });

    it('createHTTPTransport with session ID', () => {
      const t = createHTTPTransport({ url: 'http://localhost:8080/mcp', sessionId: 's1' });
      expect(t).toBeInstanceOf(MCPHTTPTransport);
    });
  });

  // ── 9. CLI MCPConfigStore ─────────────────────────────────────────────

  describe('CLI MCPConfigStore', () => {
    const TMP = join(process.cwd(), 'tmp', `mcp-cert6-${Date.now()}`);

    afterEach(() => {
      if (existsSync(TMP)) rmSync(TMP, { recursive: true, force: true });
    });

    it('load returns empty list for missing config', () => {
      const doc = MCPConfigStore.load(TMP);
      expect(doc.mcpServers).toEqual([]);
    });

    it('upsert adds a server and load retrieves it', () => {
      MCPConfigStore.upsert(
        { name: 'fs', transport: 'stdio', command: 'npx', args: ['-y', 'fs-server', '.'] },
        TMP
      );
      const doc = MCPConfigStore.load(TMP);
      expect(doc.mcpServers).toHaveLength(1);
      expect(doc.mcpServers[0].name).toBe('fs');
      expect(doc.mcpServers[0].enabled).toBe(true);
      expect(doc.mcpServers[0].command).toBe('npx');
    });

    it('upsert replaces server with same name', () => {
      MCPConfigStore.upsert({ name: 'dup', transport: 'stdio', command: 'v1' }, TMP);
      MCPConfigStore.upsert({ name: 'dup', transport: 'stdio', command: 'v2' }, TMP);
      const doc = MCPConfigStore.load(TMP);
      expect(doc.mcpServers).toHaveLength(1);
      expect(doc.mcpServers[0].command).toBe('v2');
    });

    it('remove deletes a server and returns true', () => {
      MCPConfigStore.upsert({ name: 'x', transport: 'stdio', command: 'echo' }, TMP);
      expect(MCPConfigStore.remove('x', TMP)).toBe(true);
      expect(MCPConfigStore.load(TMP).mcpServers).toHaveLength(0);
    });

    it('remove returns false for unknown server', () => {
      expect(MCPConfigStore.remove('nope', TMP)).toBe(false);
    });

    it('formatList shows configured servers', () => {
      MCPConfigStore.upsert({ name: 'git', transport: 'stdio', command: 'mcp-git' }, TMP);
      MCPConfigStore.upsert({ name: 'remote', transport: 'sse', url: 'https://example.com/mcp' }, TMP);
      const text = MCPConfigStore.formatList(MCPConfigStore.load(TMP));
      expect(text).toContain('MCP Servers');
      expect(text).toContain('git');
      expect(text).toContain('remote');
      expect(text).toContain('sse');
      expect(text).toContain('2 server(s)');
    });

    it('formatList shows message when empty', () => {
      const text = MCPConfigStore.formatList({ mcpServers: [] });
      expect(text).toContain('No MCP servers');
    });

    it('handles invalid JSON gracefully', () => {
      mkdirSync(TMP, { recursive: true });
      writeFileSync(join(TMP, 'mcp.json'), '{bad json', 'utf8');
      const doc = MCPConfigStore.load(TMP);
      expect(doc.mcpServers).toEqual([]);
    });

    it('handles non-array mcpServers field', () => {
      mkdirSync(TMP, { recursive: true });
      writeFileSync(join(TMP, 'mcp.json'), JSON.stringify({ mcpServers: 'not-array' }), 'utf8');
      const doc = MCPConfigStore.load(TMP);
      expect(doc.mcpServers).toEqual([]);
    });

    it('disabled server shows (disabled) in formatList', () => {
      MCPConfigStore.upsert({ name: 'off', transport: 'stdio', command: 'x', enabled: false }, TMP);
      const text = MCPConfigStore.formatList(MCPConfigStore.load(TMP));
      expect(text).toContain('disabled');
    });

    it('getConfigPath returns valid path', () => {
      const p = MCPConfigStore.getConfigPath(TMP);
      expect(p).toContain('mcp.json');
    });
  });

  // ── 10. CLI /mcp command via router ──────────────────────────────────

  describe('CLI /mcp command via SlashCommandRouter', () => {
    const TMP = join(process.cwd(), 'tmp', `mcp-router-${Date.now()}`);

    afterEach(() => {
      if (existsSync(TMP)) rmSync(TMP, { recursive: true, force: true });
    });

    it('/mcp list shows no servers initially', async () => {
      const router = new SlashCommandRouter();
      registerMCPCommand(router, TMP);
      const result = await router.execute('/mcp list');
      expect(result.output).toContain('No MCP servers');
    });

    it('/mcp add stdio server → list shows it', async () => {
      const router = new SlashCommandRouter();
      registerMCPCommand(router, TMP);
      const add = await router.execute('/mcp add fs -- npx -y fs-server .');
      expect(add.success).toBe(true);
      expect(add.output).toContain('Added');

      const list = await router.execute('/mcp list');
      expect(list.output).toContain('fs');
    });

    it('/mcp add sse server with URL', async () => {
      const router = new SlashCommandRouter();
      registerMCPCommand(router, TMP);
      const add = await router.execute('/mcp add remote --sse -- https://example.com/mcp');
      expect(add.success).toBe(true);
      expect(add.output).toContain('sse');

      const list = await router.execute('/mcp list');
      expect(list.output).toContain('remote');
    });

    it('/mcp get returns server details', async () => {
      const router = new SlashCommandRouter();
      registerMCPCommand(router, TMP);
      await router.execute('/mcp add db -- npx db-server');
      const get = await router.execute('/mcp get db');
      expect(get.success).toBe(true);
      expect(get.output).toContain('db');
    });

    it('/mcp get returns error for unknown server', async () => {
      const router = new SlashCommandRouter();
      registerMCPCommand(router, TMP);
      const get = await router.execute('/mcp get nope');
      expect(get.success).toBe(false);
      expect(get.output).toContain('No server');
    });

    it('/mcp remove deletes a server', async () => {
      const router = new SlashCommandRouter();
      registerMCPCommand(router, TMP);
      await router.execute('/mcp add temp -- npx temp-server');
      const rm = await router.execute('/mcp remove temp');
      expect(rm.success).toBe(true);
      expect(rm.output).toContain('Removed');

      const list = await router.execute('/mcp list');
      expect(list.output).toContain('No MCP servers');
    });

    it('/mcp rm alias works', async () => {
      const router = new SlashCommandRouter();
      registerMCPCommand(router, TMP);
      await router.execute('/mcp add x -- echo hi');
      const rm = await router.execute('/mcp rm x');
      expect(rm.success).toBe(true);
    });

    it('/mcp remove returns error for unknown server', async () => {
      const router = new SlashCommandRouter();
      registerMCPCommand(router, TMP);
      const rm = await router.execute('/mcp remove ghost');
      expect(rm.success).toBe(false);
      expect(rm.output).toContain('No server');
    });

    it('/mcp (no args) defaults to list', async () => {
      const router = new SlashCommandRouter();
      registerMCPCommand(router, TMP);
      const result = await router.execute('/mcp');
      expect(result.output).toContain('No MCP servers');
    });

    it('/mcp add sse without valid URL fails', async () => {
      const router = new SlashCommandRouter();
      registerMCPCommand(router, TMP);
      const bad = await router.execute('/mcp add broken --sse -- not-a-url');
      expect(bad.success).toBe(false);
      expect(bad.error).toContain('URL');
    });

    it('/mcp unknown subcommand returns usage error', async () => {
      const router = new SlashCommandRouter();
      registerMCPCommand(router, TMP);
      const bad = await router.execute('/mcp foobar');
      expect(bad.success).toBe(false);
      expect(bad.output).toContain('Usage');
    });

    it('/mcp get without name returns error', async () => {
      const router = new SlashCommandRouter();
      registerMCPCommand(router, TMP);
      const bad = await router.execute('/mcp get');
      expect(bad.success).toBe(false);
      expect(bad.error).toContain('Missing name');
    });

    it('/mcp remove without name returns error', async () => {
      const router = new SlashCommandRouter();
      registerMCPCommand(router, TMP);
      const bad = await router.execute('/mcp remove');
      expect(bad.success).toBe(false);
      expect(bad.error).toContain('Missing name');
    });

    it('full CRUD lifecycle: add → get → list → remove → list', async () => {
      const router = new SlashCommandRouter();
      registerMCPCommand(router, TMP);

      await router.execute('/mcp add alpha -- npx alpha-server');
      const get1 = await router.execute('/mcp get alpha');
      expect(get1.success).toBe(true);

      const list1 = await router.execute('/mcp list');
      expect(list1.output).toContain('alpha');

      await router.execute('/mcp remove alpha');
      const list2 = await router.execute('/mcp list');
      expect(list2.output).toContain('No MCP servers');
    });
  });
});
