import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import {
  SecureStorageManager,
  BYOKProviderManager,
  OpenAIAdapter,
  AnthropicAdapter,
  GeminiAdapter,
  CustomAdapter,
  ModelCapabilityRegistry,
  ModelRouter,
  CompletionRequest,
  AIProvider
} from '../src/index.js';
import { AgentEngine } from '../src/providers/ai-engine.js';

describe('Phase 1 Core Provider Suite (Steps 001-008)', () => {
  const tempStorageDir = path.join(os.tmpdir(), `superagent-test-${Date.now()}`);
  const tempStorageFile = path.join(tempStorageDir, 'credentials');

  afterEach(() => {
    vi.restoreAllMocks();
    if (fs.existsSync(tempStorageFile)) {
      fs.unlinkSync(tempStorageFile);
    }
    if (fs.existsSync(tempStorageDir)) {
      fs.rmdirSync(tempStorageDir);
    }
  });

  describe('Step 002: Secure Storage Manager', () => {
    it('should encrypt and decrypt BYOK credentials on disk', async () => {
      const storage = new SecureStorageManager({
        storagePath: tempStorageFile,
        secretKey: 'test-secret-key-123'
      });

      await storage.saveCredential({
        provider: 'openai',
        apiKey: 'sk-test-openai-secret-key-12345',
        modelName: 'gpt-4o'
      });

      // Verify encrypted file format on disk
      const rawDiskContent = fs.readFileSync(tempStorageFile, 'utf8');
      expect(rawDiskContent).not.toContain('sk-test-openai-secret-key-12345');
      expect(rawDiskContent).toContain('iv');
      expect(rawDiskContent).toContain('authTag');

      const retrieved = await storage.getCredential('openai');
      expect(retrieved).toBeDefined();
      expect(retrieved?.apiKey).toBe('sk-test-openai-secret-key-12345');
      expect(retrieved?.modelName).toBe('gpt-4o');
    });

    it('should return masked keys when listing credentials', async () => {
      const storage = new SecureStorageManager({ storagePath: tempStorageFile });
      await storage.saveCredential({
        provider: 'anthropic',
        apiKey: 'sk-ant-api03-abcdef1234567890-test'
      });

      const list = await storage.listCredentials();
      expect(list).toHaveLength(1);
      expect(list[0].provider).toBe('anthropic');
      expect(list[0].maskedKey).not.toBe('sk-ant-api03-abcdef1234567890-test');
      expect(list[0].maskedKey).toContain('...');
    });

    it('should support deleting and clearing credentials', async () => {
      const storage = new SecureStorageManager({ storagePath: tempStorageFile });
      await storage.saveCredential({ provider: 'gemini', apiKey: 'AIzaSyTest123' });

      let deleted = await storage.deleteCredential('gemini');
      expect(deleted).toBe(true);

      const retrieved = await storage.getCredential('gemini');
      expect(retrieved).toBeNull();
    });
  });

  describe('Step 003: OpenAI Provider Client Adapter', () => {
    it('should format requests and parse responses for OpenAI API', async () => {
      const adapter = new OpenAIAdapter({
        provider: 'openai',
        apiKey: 'sk-openai-mock-key'
      });

      const mockResponse = {
        id: 'chatcmpl-123',
        choices: [{ message: { content: 'Hello from OpenAI!' } }],
        usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 }
      };

      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockResponse
      }));

      const req: CompletionRequest = {
        messages: [{ role: 'user', content: 'Hi' }]
      };

      const res = await adapter.complete(req);
      expect(res.provider).toBe('openai');
      expect(res.content).toBe('Hello from OpenAI!');
      expect(res.usage?.totalTokens).toBe(15);
    });

    it('should list OpenAI capability registry models', async () => {
      const adapter = new OpenAIAdapter({ provider: 'openai', apiKey: 'sk-test' });
      const models = await adapter.listModels();
      expect(models.some(m => m.id === 'gpt-4o')).toBe(true);
      expect(models.some(m => m.id === 'o3-mini')).toBe(true);
    });
  });

  describe('Step 004: Anthropic Provider Client Adapter', () => {
    it('should format requests with Anthropic headers and system prompt extraction', async () => {
      const adapter = new AnthropicAdapter({
        provider: 'anthropic',
        apiKey: 'sk-ant-mock-key'
      });

      let capturedHeaders: Record<string, string> = {};
      let capturedBody: Record<string, unknown> = {};

      vi.stubGlobal('fetch', vi.fn().mockImplementation(async (_url: string, init: RequestInit) => {
        capturedHeaders = init.headers as Record<string, string>;
        capturedBody = JSON.parse(init.body as string) as Record<string, unknown>;
        return {
          ok: true,
          json: async () => ({
            id: 'msg_ant_123',
            content: [{ type: 'text', text: 'Hello from Claude!' }],
            usage: { input_tokens: 12, output_tokens: 8 }
          })
        };
      }));

      const req: CompletionRequest = {
        messages: [
          { role: 'system', content: 'You are a helpful assistant.' },
          { role: 'user', content: 'Who are you?' }
        ]
      };

      const res = await adapter.complete(req);
      expect(res.provider).toBe('anthropic');
      expect(res.content).toBe('Hello from Claude!');
      expect(capturedHeaders['x-api-key']).toBe('sk-ant-mock-key');
      expect(capturedHeaders['anthropic-version']).toBe('2023-06-01');
      expect(capturedBody.system).toBe('You are a helpful assistant.');
    });
  });

  describe('Step 005: Gemini Provider Client Adapter', () => {
    it('should translate roles and call Gemini endpoint', async () => {
      const adapter = new GeminiAdapter({
        provider: 'gemini',
        apiKey: 'AIzaSyMockGeminiKey'
      });

      let capturedHeaders: Record<string, string> = {};
      let capturedBody: { contents?: Array<{ role: string; parts: Array<{ text: string }> }> } = {};

      vi.stubGlobal('fetch', vi.fn().mockImplementation(async (_url: string, init: RequestInit) => {
        capturedHeaders = init.headers as Record<string, string>;
        capturedBody = JSON.parse(init.body as string);
        return {
          ok: true,
          json: async () => ({
            candidates: [{ content: { parts: [{ text: 'Hello from Gemini!' }] } }]
          })
        };
      }));

      const req: CompletionRequest = {
        messages: [{ role: 'user', content: 'Hi Gemini' }]
      };

      const res = await adapter.complete(req);
      expect(res.provider).toBe('gemini');
      expect(res.content).toBe('Hello from Gemini!');
      expect(capturedHeaders['x-goog-api-key']).toBe('AIzaSyMockGeminiKey');
      expect(capturedBody.contents?.[0].role).toBe('user');
    });
  });

  describe('Step 006: DeepSeek & Custom Provider Adapter', () => {
    it('should handle DeepSeek API requests', async () => {
      const adapter = new CustomAdapter({
        provider: 'deepseek',
        apiKey: 'sk-deepseek-mock'
      });

      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: 'DeepSeek response' } }]
        })
      }));

      const res = await adapter.complete({ messages: [{ role: 'user', content: 'Code this' }] });
      expect(res.provider).toBe('deepseek');
      expect(res.content).toBe('DeepSeek response');
    });

    it('should handle custom OpenAI-compatible endpoints', async () => {
      const adapter = new CustomAdapter({
        provider: 'custom',
        apiKey: '',
        baseUrl: 'http://localhost:11434/v1',
        modelName: 'llama3'
      });

      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: 'Ollama response' } }]
        })
      }));

      const res = await adapter.complete({ messages: [{ role: 'user', content: 'Test local' }] });
      expect(res.provider).toBe('custom');
      expect(res.content).toBe('Ollama response');
    });
  });

  describe('Step 007: Dynamic Models Registry', () => {
    it('should register and retrieve model capabilities', async () => {
      const registry = new ModelCapabilityRegistry();
      const cap = registry.getCapability('gpt-4o');
      expect(cap).toBeDefined();
      expect(cap?.supportsVision).toBe(true);

      const byok = new BYOKProviderManager();
      byok.registerKey({ provider: 'openai', apiKey: 'sk-test' });
      const models = await registry.getAvailableModels(byok);
      expect(models.length).toBeGreaterThan(0);
    });
  });

  describe('Step 008: Default Model Selection & Fallback Router', () => {
    it('should fallback to secondary provider when primary fails', async () => {
      const byok = new BYOKProviderManager();
      byok.registerKey({ provider: 'openai', apiKey: 'sk-openai-fail' });
      byok.registerKey({ provider: 'anthropic', apiKey: 'sk-anthropic-success' });

      const router = new ModelRouter({ preferredProvider: 'openai' });

      vi.stubGlobal('fetch', vi.fn().mockImplementation(async (url: string) => {
        if (url.includes('openai.com')) {
          return { ok: false, status: 429, text: async () => 'Rate limit exceeded' };
        }
        return {
          ok: true,
          json: async () => ({
            id: 'msg_ant_fallback',
            content: [{ type: 'text', text: 'Fallback response from Claude' }]
          })
        };
      }));

      const response = await router.completeWithFallback(
        { messages: [{ role: 'user', content: 'Test fallback' }] },
        byok
      );

      expect(response.provider).toBe('anthropic');
      expect(response.content).toBe('Fallback response from Claude');
    });
  });

  describe('AgentEngine tool name parsing', () => {
    it('should correctly accumulate tool names without duplicating repeated names', async () => {
      const engine = new AgentEngine({
        provider: 'openai',
        apiKey: 'test-key',
        model: 'gpt-4o'
      });

      const chunks = [
        `data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_1","function":{"name":"list_dir"}}]}}]}\n`,
        `data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"name":"list_dir","arguments":"{\\"path\\":\\".\\"}"}}]}}]}\n`,
        `data: [DONE]\n`
      ];

      vi.stubGlobal('fetch', vi.fn().mockImplementation(async () => {
        const encoder = new TextEncoder();
        const stream = new ReadableStream({
          start(controller) {
            for (const chunk of chunks) {
              controller.enqueue(encoder.encode(chunk));
            }
            controller.close();
          }
        });
        return {
          ok: true,
          body: stream
        };
      }));

      const result = await (engine as any).streamFromProvider(() => {}, new AbortController().signal);
      expect(result.toolCalls).toHaveLength(1);
      expect(result.toolCalls[0].name).toBe('list_dir');
      expect(result.toolCalls[0].args).toEqual({ path: '.' });
    });
  });
});
