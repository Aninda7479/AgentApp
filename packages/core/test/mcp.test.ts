import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as http from 'node:http';
import {
  MCPClient,
  createStdioTransport,
  createSSETransport,
  createHTTPTransport,
  MCPToolRegistry,
  MCPResourceManager,
  MCPPermissionGuard,
  IDEContextBridge
} from '../src/index.js';

describe('Model Context Protocol (MCP) Suite (Steps 027 - 034)', () => {
  describe('Step 027: MCP Client Core SDK Integration', () => {
    it('should initialize MCPClient with proper parameters', () => {
      const client = new MCPClient({ name: 'test-client', version: '1.0.0' });
      expect(client).toBeDefined();
      expect(client.isConnected()).toBe(false);
      expect(client.rawClient).toBeDefined();
    });
  });

  describe('Step 028: MCP STDIO Transport Handler', () => {
    it('should create STDIO transport instance', () => {
      const transport = createStdioTransport({
        command: 'node',
        args: ['-e', 'console.log("hello")']
      });
      expect(transport).toBeDefined();
    });
  });

  describe('Step 029: MCP SSE Transport Handler', () => {
    it('should create SSE transport instance with bearer token', () => {
      const transport = createSSETransport({
        url: 'http://localhost:8080/sse',
        bearerToken: 'secret-token'
      });
      expect(transport).toBeDefined();
    });
  });

  describe('Step 030: MCP Streamable HTTP Transport Handler', () => {
    it('should create HTTP transport instance with session ID', () => {
      const transport = createHTTPTransport({
        url: 'http://localhost:8080/mcp',
        sessionId: 'session-123'
      });
      expect(transport).toBeDefined();
    });
  });

  describe('Step 033: MCP Access Permission Guard', () => {
    it('should allow tools in auto mode', async () => {
      const guard = new MCPPermissionGuard({ mode: 'auto' });
      const allowed = await guard.verifyPermission({
        serverName: 'dbServer',
        toolName: 'dropTable',
        args: {},
        annotations: { destructiveHint: true }
      });
      expect(allowed).toBe(true);
    });

    it('should block destructive tools in read-only mode', async () => {
      const guard = new MCPPermissionGuard({ mode: 'read-only' });
      const allowed = await guard.verifyPermission({
        serverName: 'dbServer',
        toolName: 'deleteUser',
        args: {},
        annotations: { destructiveHint: true }
      });
      expect(allowed).toBe(false);
    });

    it('should execute permission request handler in manual mode', async () => {
      const onRequest = vi.fn().mockResolvedValue(true);
      const guard = new MCPPermissionGuard({ mode: 'manual', onPermissionRequest: onRequest });
      const allowed = await guard.verifyPermission({
        serverName: 'fsServer',
        toolName: 'writeFile',
        args: { path: '/tmp/test' }
      });
      expect(allowed).toBe(true);
      expect(onRequest).toHaveBeenCalledTimes(1);
    });
  });

  describe('Step 031: MCP Dynamic Tool Discovery & Registration', () => {
    it('should discover and register tools from MCP clients', async () => {
      const registry = new MCPToolRegistry({ prefixToolName: true });
      const mockClient = new MCPClient({ name: 'mock-server', version: '1.0.0' });

      vi.spyOn(mockClient, 'isConnected').mockReturnValue(true);
      vi.spyOn(mockClient, 'listTools').mockResolvedValue({
        tools: [
          {
            name: 'calculate',
            description: 'Perform calculation',
            inputSchema: { type: 'object', properties: { expr: { type: 'string' } } }
          }
        ]
      } as any);
      vi.spyOn(mockClient, 'callTool').mockResolvedValue({ content: [{ type: 'text', text: '42' }] });

      registry.registerServer('math', mockClient);
      const tools = await registry.discoverTools('math');

      expect(tools.length).toBe(1);
      expect(tools[0].name).toBe('math_calculate');

      const result = await tools[0].execute({ expr: '6*7' }, { provider: 'openai', apiKey: 'key' });
      expect(mockClient.callTool).toHaveBeenCalledWith('calculate', { expr: '6*7' });
      expect(result).toEqual({ content: [{ type: 'text', text: '42' }] });
    });
  });

  describe('Step 032: MCP Resource & Prompt Template Manager', () => {
    it('should manage resources and inject prompt templates', async () => {
      const manager = new MCPResourceManager();
      const mockClient = new MCPClient({ name: 'mock-server', version: '1.0.0' });

      vi.spyOn(mockClient, 'listResources').mockResolvedValue({ resources: [{ uri: 'file://a.txt', name: 'a.txt' }] } as any);
      vi.spyOn(mockClient, 'readResource').mockResolvedValue({ contents: [{ uri: 'file://a.txt', text: 'hello' }] } as any);
      vi.spyOn(mockClient, 'getPrompt').mockResolvedValue({
        messages: [
          { role: 'user', content: { type: 'text', text: 'Explain quantum physics' } }
        ]
      } as any);

      manager.registerClient('docs', mockClient);

      const resources = await manager.listResources('docs');
      expect(resources.resources.length).toBe(1);

      const content = await manager.readResource('docs', 'file://a.txt');
      expect(content.contents[0].text).toBe('hello');

      const injectedMessages = await manager.injectPromptTemplate('docs', 'explain', { topic: 'quantum physics' });
      expect(injectedMessages.length).toBe(1);
      expect(injectedMessages[0].role).toBe('user');
      expect(injectedMessages[0].content).toBe('Explain quantum physics');
    });
  });

  describe('Step 034: IDE Active Context Bridge', () => {
    let bridge: IDEContextBridge;
    const testPort = 19195;

    beforeEach(async () => {
      bridge = new IDEContextBridge({ port: testPort });
      await bridge.start();
    });

    afterEach(async () => {
      await bridge.stop();
    });

    it('should update context and receive HTTP POST updates', async () => {
      const updated = bridge.updateContext({ activeFile: '/src/index.ts' });
      expect(bridge.getContext().activeFile).toBe('/src/index.ts');

      // Test HTTP POST endpoint
      const postData = JSON.stringify({ activeFile: '/src/app.ts', openFiles: ['/src/app.ts'] });
      
      const response: any = await new Promise((resolve, reject) => {
        const req = http.request(
          `http://127.0.0.1:${testPort}/ide/context`,
          { method: 'POST', headers: { 'Content-Type': 'application/json' } },
          (res) => {
            let data = '';
            res.on('data', (chunk) => (data += chunk));
            res.on('end', () => resolve(JSON.parse(data)));
          }
        );
        req.on('error', reject);
        req.write(postData);
        req.end();
      });

      expect(response.success).toBe(true);
      expect(bridge.getContext().activeFile).toBe('/src/app.ts');
    });
  });
});
