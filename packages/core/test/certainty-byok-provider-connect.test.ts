import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import {
  BYOKProviderManager,
  SecureStorageManager,
  ModelCapabilityRegistry,
  OpenAIAdapter,
  AnthropicAdapter,
  GeminiAdapter,
  CustomAdapter,
  createProviderAdapter,
  resolveProviderFamily,
  resolveBaseUrl,
  getProviderMeta,
  SUPPORTED_PROVIDERS,
  BYOKConfig,
} from '../src/index.js';

/**
 * CERTAIN-5 — BYOK provider connect + list models (offline mock)
 *
 * Tests the full user journey at the Core layer:
 *   1. Register provider key in memory
 *   2. List available models for that provider (adapter.listModels)
 *   3. Retrieve models via ModelCapabilityRegistry.getAvailableModels
 *   4. Persist credentials to encrypted storage and reload
 *   5. Multi-provider registration + aggregated model list
 *   6. Keyless providers (ollama, custom) accepted without API key
 *   7. Missing API key rejected for key-requiring providers
 *   8. Adapter factory maps every known provider to the correct adapter class
 *   9. Provider metadata resolves family and base URL correctly
 */
describe('CERTAIN-5: BYOK provider connect + list models', () => {
  const tempDir = path.join(os.tmpdir(), `cert5-${Date.now()}`);
  const credFile = path.join(tempDir, 'credentials');

  beforeEach(() => {
    fs.mkdirSync(tempDir, { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  // ── 1. Single provider connect → list models ───────────────────────────

  describe('single provider connect + list models', () => {
    it('OpenAI: register key → adapter.listModels returns gpt-4o family', async () => {
      const byok = new BYOKProviderManager();
      byok.registerKey({ provider: 'openai', apiKey: 'sk-test-openai' });

      const adapter = createProviderAdapter(byok.getKey('openai')!);
      expect(adapter).toBeInstanceOf(OpenAIAdapter);

      const models = await adapter.listModels!();
      expect(models.length).toBeGreaterThanOrEqual(3);
      expect(models.map((m) => m.id)).toContain('gpt-4o');
      expect(models.map((m) => m.id)).toContain('o3-mini');
      expect(models.map((m) => m.id)).toContain('gpt-4o-mini');

      for (const m of models) {
        expect(m.provider).toBe('openai');
        expect(m.contextWindow).toBeGreaterThan(0);
        expect(m.maxOutputTokens).toBeGreaterThan(0);
      }
    });

    it('Anthropic: register key → adapter.listModels returns claude family', async () => {
      const byok = new BYOKProviderManager();
      byok.registerKey({ provider: 'anthropic', apiKey: 'sk-ant-test' });

      const adapter = createProviderAdapter(byok.getKey('anthropic')!);
      expect(adapter).toBeInstanceOf(AnthropicAdapter);

      const models = await adapter.listModels!();
      expect(models.length).toBeGreaterThanOrEqual(3);
      expect(models.map((m) => m.id)).toContain('claude-3-7-sonnet-20250219');
      expect(models.map((m) => m.id)).toContain('claude-3-5-sonnet-20241022');
      expect(models.map((m) => m.id)).toContain('claude-3-opus-20240229');

      for (const m of models) {
        expect(m.provider).toBe('anthropic');
        expect(m.supportsVision).toBe(true);
        expect(m.supportsTools).toBe(true);
      }
    });

    it('Gemini: register key → adapter.listModels returns gemini family', async () => {
      const byok = new BYOKProviderManager();
      byok.registerKey({ provider: 'gemini', apiKey: 'AIzaSyTest' });

      const adapter = createProviderAdapter(byok.getKey('gemini')!);
      expect(adapter).toBeInstanceOf(GeminiAdapter);

      const models = await adapter.listModels!();
      expect(models.length).toBeGreaterThanOrEqual(2);
      expect(models.map((m) => m.id)).toContain('gemini-2.5-flash');
      expect(models.map((m) => m.id)).toContain('gemini-1.5-pro');

      for (const m of models) {
        expect(m.provider).toBe('gemini');
        expect(m.supportsVision).toBe(true);
      }
    });

    it('DeepSeek: register key → adapter.listModels returns deepseek models', async () => {
      const byok = new BYOKProviderManager();
      byok.registerKey({ provider: 'deepseek', apiKey: 'sk-ds-test' });

      const adapter = createProviderAdapter(byok.getKey('deepseek')!);
      expect(adapter).toBeInstanceOf(CustomAdapter);

      const models = await adapter.listModels!();
      expect(models.length).toBeGreaterThanOrEqual(2);
      expect(models.map((m) => m.id)).toContain('deepseek-chat');
      expect(models.map((m) => m.id)).toContain('deepseek-reasoner');
    });
  });

  // ── 2. ModelCapabilityRegistry aggregation ──────────────────────────────

  describe('ModelCapabilityRegistry.getAvailableModels', () => {
    it('returns models from all registered providers', async () => {
      const byok = new BYOKProviderManager();
      byok.registerKey({ provider: 'openai', apiKey: 'sk-test' });
      byok.registerKey({ provider: 'anthropic', apiKey: 'sk-ant-test' });
      byok.registerKey({ provider: 'gemini', apiKey: 'AIzaSyTest' });

      const registry = new ModelCapabilityRegistry();
      const models = await registry.getAvailableModels(byok);

      expect(models.length).toBeGreaterThanOrEqual(8);

      const providerIds = new Set(models.map((m) => m.provider));
      expect(providerIds.has('openai')).toBe(true);
      expect(providerIds.has('anthropic')).toBe(true);
      expect(providerIds.has('gemini')).toBe(true);
    });

    it('returns empty array when no providers registered', async () => {
      const byok = new BYOKProviderManager();
      const registry = new ModelCapabilityRegistry();
      const models = await registry.getAvailableModels(byok);
      expect(models).toEqual([]);
    });

    it('models have valid capability fields', async () => {
      const byok = new BYOKProviderManager();
      byok.registerKey({ provider: 'openai', apiKey: 'sk-test' });

      const registry = new ModelCapabilityRegistry();
      const models = await registry.getAvailableModels(byok);

      for (const m of models) {
        expect(typeof m.id).toBe('string');
        expect(m.id.length).toBeGreaterThan(0);
        expect(typeof m.name).toBe('string');
        expect(m.name.length).toBeGreaterThan(0);
        expect(typeof m.contextWindow).toBe('number');
        expect(m.contextWindow).toBeGreaterThan(0);
        expect(typeof m.maxOutputTokens).toBe('number');
        expect(typeof m.supportsVision).toBe('boolean');
        expect(typeof m.supportsTools).toBe('boolean');
        // inputModalities/outputModalities are optional in adapter listModels();
        // the registry fills them in from defaults when available.
        if (m.inputModalities) expect(Array.isArray(m.inputModalities)).toBe(true);
        if (m.outputModalities) expect(Array.isArray(m.outputModalities)).toBe(true);
      }
    });
  });

  // ── 3. Encrypted credential persistence + reload ───────────────────────

  describe('encrypted credential persistence', () => {
    it('save → loadFromStorage restores keys into BYOK manager', async () => {
      const storage = new SecureStorageManager({ storagePath: credFile });

      await storage.saveCredential({ provider: 'openai', apiKey: 'sk-persist-openai' });
      await storage.saveCredential({ provider: 'anthropic', apiKey: 'sk-persist-ant' });

      const byok = new BYOKProviderManager();
      await byok.loadFromStorage(storage);

      expect(byok.getKey('openai')?.apiKey).toBe('sk-persist-openai');
      expect(byok.getKey('anthropic')?.apiKey).toBe('sk-persist-ant');
      expect(byok.getAllConfigs()).toHaveLength(2);
    });

    it('persisted credentials are encrypted on disk', async () => {
      const storage = new SecureStorageManager({ storagePath: credFile });
      await storage.saveCredential({ provider: 'openai', apiKey: 'sk-secret-not-in-plain' });

      const raw = fs.readFileSync(credFile, 'utf8');
      expect(raw).not.toContain('sk-secret-not-in-plain');
      expect(raw).toContain('iv');
      expect(raw).toContain('authTag');
    });

    it('registerAndPersistKey writes to both memory and disk', async () => {
      const storage = new SecureStorageManager({ storagePath: credFile });
      const byok = new BYOKProviderManager({ storagePath: credFile });

      await byok.registerAndPersistKey({ provider: 'gemini', apiKey: 'AIzaSyDual' });

      // In-memory
      expect(byok.getKey('gemini')?.apiKey).toBe('AIzaSyDual');

      // On disk — load into a fresh manager
      const byok2 = new BYOKProviderManager();
      await byok2.loadFromStorage(storage);
      expect(byok2.getKey('gemini')?.apiKey).toBe('AIzaSyDual');
    });

    it('listCredentials returns masked keys only', async () => {
      const storage = new SecureStorageManager({ storagePath: credFile });
      await storage.saveCredential({ provider: 'openai', apiKey: 'sk-full-key-visible' });

      const list = await storage.listCredentials();
      expect(list).toHaveLength(1);
      expect(list[0].maskedKey).not.toBe('sk-full-key-visible');
      expect(list[0].maskedKey).toContain('...');
    });
  });

  // ── 4. Multi-provider connect + aggregated models ───────────────────────

  describe('multi-provider connect', () => {
    it('register 4 providers → all model families represented', async () => {
      const byok = new BYOKProviderManager();
      byok.registerKey({ provider: 'openai', apiKey: 'sk-test' });
      byok.registerKey({ provider: 'anthropic', apiKey: 'sk-ant-test' });
      byok.registerKey({ provider: 'gemini', apiKey: 'AIzaSyTest' });
      byok.registerKey({ provider: 'deepseek', apiKey: 'sk-ds-test' });

      expect(byok.getAllConfigs()).toHaveLength(4);

      const registry = new ModelCapabilityRegistry();
      const models = await registry.getAvailableModels(byok);

      const families = new Set(models.map((m) => m.provider));
      expect(families.size).toBeGreaterThanOrEqual(4);
    });

    it('getActiveConfig returns first registered provider', () => {
      const byok = new BYOKProviderManager();
      byok.registerKey({ provider: 'anthropic', apiKey: 'sk-ant' });
      byok.registerKey({ provider: 'openai', apiKey: 'sk-oai' });

      const active = byok.getActiveConfig();
      expect(active.provider).toBe('anthropic');
      expect(active.apiKey).toBe('sk-ant');
    });
  });

  // ── 5. Keyless providers ───────────────────────────────────────────────

  describe('keyless providers', () => {
    it('ollama accepted without API key', () => {
      const byok = new BYOKProviderManager();
      byok.registerKey({ provider: 'ollama', apiKey: '' });
      expect(byok.getKey('ollama')).toBeDefined();
    });

    it('custom accepted without API key', () => {
      const byok = new BYOKProviderManager();
      byok.registerKey({ provider: 'custom', apiKey: '', baseUrl: 'http://localhost:11434/v1' });
      expect(byok.getKey('custom')).toBeDefined();
    });

    it('vertex accepted without API key', () => {
      const byok = new BYOKProviderManager();
      byok.registerKey({ provider: 'vertex', apiKey: '' });
      expect(byok.getKey('vertex')).toBeDefined();
    });
  });

  // ── 6. Missing API key rejection ───────────────────────────────────────

  describe('missing API key rejection', () => {
    it('throws for openai without key', () => {
      const byok = new BYOKProviderManager();
      expect(() => byok.registerKey({ provider: 'openai', apiKey: '' })).toThrow(
        'API key is required for provider: openai'
      );
    });

    it('throws for anthropic without key', () => {
      const byok = new BYOKProviderManager();
      expect(() => byok.registerKey({ provider: 'anthropic', apiKey: '' })).toThrow(
        'API key is required for provider: anthropic'
      );
    });

    it('throws for gemini without key', () => {
      const byok = new BYOKProviderManager();
      expect(() => byok.registerKey({ provider: 'gemini', apiKey: '' })).toThrow(
        'API key is required for provider: gemini'
      );
    });

    it('getActiveConfig throws when no providers registered', () => {
      const byok = new BYOKProviderManager();
      expect(() => byok.getActiveConfig()).toThrow('No BYOK API key configured');
    });
  });

  // ── 7. Adapter factory maps every known provider ───────────────────────

  describe('adapter factory — all known providers', () => {
    const expectedMappings: Array<[string, new (...args: any[]) => any]> = [
      ['openai', OpenAIAdapter],
      ['chatgpt', OpenAIAdapter],
      ['anthropic', AnthropicAdapter],
      ['claude', AnthropicAdapter],
      ['gemini', GeminiAdapter],
      ['google', GeminiAdapter],
      ['deepseek', CustomAdapter],
      ['deepinfra', CustomAdapter],
      ['openrouter', CustomAdapter],
      ['kimi', CustomAdapter],
      ['moonshot', CustomAdapter],
      ['mistral', CustomAdapter],
      ['grok', CustomAdapter],
      ['perplexity', CustomAdapter],
      ['nvidia', CustomAdapter],
      ['vertex', CustomAdapter],
      ['custom', CustomAdapter],
      ['ollama', CustomAdapter],
    ];

    for (const [providerId, ExpectedClass] of expectedMappings) {
      it(`${providerId} → ${ExpectedClass.name}`, () => {
        const adapter = createProviderAdapter({
          provider: providerId as any,
          apiKey: 'test-key',
        });
        expect(adapter).toBeInstanceOf(ExpectedClass);
      });
    }

    it('custom-1719500000 (dynamic custom) → CustomAdapter', () => {
      const adapter = createProviderAdapter({
        provider: 'custom-1719500000' as any,
        apiKey: 'test-key',
      });
      expect(adapter).toBeInstanceOf(CustomAdapter);
    });
  });

  // ── 8. Provider metadata ───────────────────────────────────────────────

  describe('provider metadata', () => {
    it('every SUPPORTED_PROVIDERS entry has metadata', () => {
      for (const id of SUPPORTED_PROVIDERS) {
        const meta = getProviderMeta(id);
        expect(meta).toBeDefined();
        expect(meta!.id).toBe(id);
        expect(meta!.name.length).toBeGreaterThan(0);
        expect(['openai', 'anthropic', 'gemini', 'ollama']).toContain(meta!.family);
      }
    });

    it('resolveProviderFamily maps known providers correctly', () => {
      const cases: Array<[string, string]> = [
        ['openai', 'openai'],
        ['chatgpt', 'openai'],
        ['deepseek', 'openai'],
        ['openrouter', 'openai'],
        ['anthropic', 'anthropic'],
        ['claude', 'anthropic'],
        ['gemini', 'gemini'],
        ['google', 'gemini'],
        ['ollama', 'ollama'],
      ];

      for (const [id, expected] of cases) {
        expect(resolveProviderFamily(id)).toBe(expected);
      }
    });

    it('unknown provider defaults to openai family', () => {
      expect(resolveProviderFamily('some-new-provider')).toBe('openai');
    });

    it('custom-* provider defaults to openai family', () => {
      expect(resolveProviderFamily('custom-12345')).toBe('openai');
    });

    it('resolveBaseUrl uses registered default for known providers', () => {
      expect(resolveBaseUrl('openai')).toBe('https://api.openai.com/v1');
      expect(resolveBaseUrl('anthropic')).toBe('https://api.anthropic.com');
      expect(resolveBaseUrl('deepseek')).toBe('https://api.deepseek.com/v1');
    });

    it('resolveBaseUrl prefers user-provided baseUrl', () => {
      expect(resolveBaseUrl('openai', 'https://my-proxy.example.com/v1')).toBe(
        'https://my-proxy.example.com/v1'
      );
    });

    it('resolveBaseUrl falls back to OpenAI for unknown providers', () => {
      expect(resolveBaseUrl('unknown-provider')).toBe('https://api.openai.com/v1');
    });
  });

  // ── 9. End-to-end offline journey ──────────────────────────────────────

  describe('end-to-end offline journey', () => {
    it('full flow: register → persist → reload → list models → select', async () => {
      // Step 1: User connects OpenAI provider
      const storage = new SecureStorageManager({ storagePath: credFile });
      const byok1 = new BYOKProviderManager({ storagePath: credFile });
      await byok1.registerAndPersistKey({ provider: 'openai', apiKey: 'sk-journey-test' });

      // Step 2: User also connects Anthropic
      await byok1.registerAndPersistKey({ provider: 'anthropic', apiKey: 'sk-ant-journey' });

      // Step 3: App restarts — reload from disk
      const byok2 = new BYOKProviderManager();
      await byok2.loadFromStorage(storage);

      expect(byok2.getAllConfigs()).toHaveLength(2);
      expect(byok2.getKey('openai')?.apiKey).toBe('sk-journey-test');
      expect(byok2.getKey('anthropic')?.apiKey).toBe('sk-ant-journey');

      // Step 4: Registry discovers models from both providers
      const registry = new ModelCapabilityRegistry();
      const models = await registry.getAvailableModels(byok2);

      expect(models.length).toBeGreaterThanOrEqual(6);

      // Step 5: User selects a model — verify it resolves to correct provider
      const gpt4o = models.find((m) => m.id === 'gpt-4o');
      expect(gpt4o).toBeDefined();
      expect(gpt4o!.provider).toBe('openai');
      expect(gpt4o!.supportsVision).toBe(true);

      const claude = models.find((m) => m.id === 'claude-3-7-sonnet-20250219');
      expect(claude).toBeDefined();
      expect(claude!.provider).toBe('anthropic');
      expect(claude!.supportsTools).toBe(true);

      // Step 6: Adapter created correctly for the selected model
      const adapter = createProviderAdapter(byok2.getKey('openai')!);
      expect(adapter).toBeInstanceOf(OpenAIAdapter);
    });
  });
});
