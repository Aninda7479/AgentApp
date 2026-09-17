import { describe, it, expect } from 'vitest';
import {
  OPENCODE_BASE_URL,
  OPENCODE_PRESET_MODELS,
  OPENCODE_PROVIDER_CONFIG,
  generateOpenCodeSessionId,
  getOpenCodeHeaders,
  isOpenCodeFreeModel,
  fetchOpenCodeModels,
} from './opencode';

describe('OpenCode standalone logic', () => {
  it('defines correct OpenCode Zen base URL and provider config', () => {
    expect(OPENCODE_BASE_URL).toBe('https://opencode.ai/zen/v1');
    expect(OPENCODE_PROVIDER_CONFIG.id).toBe('opencode');
    expect(OPENCODE_PROVIDER_CONFIG.defaultUrl).toBe('https://opencode.ai/zen/v1');
  });

  it('includes popular free models in presets', () => {
    const ids = OPENCODE_PRESET_MODELS.map(m => m.id);
    expect(ids).toContain('big-pickle');
    expect(ids).toContain('deepseek-v4-flash-free');
    expect(ids).toContain('mimo-v2.5-free');

    const bigPickle = OPENCODE_PRESET_MODELS.find(m => m.id === 'big-pickle');
    expect(bigPickle?.free).toBe(true);
    expect(bigPickle?.ctx).toBe('200k');
  });

  it('generates valid session ID headers', () => {
    const sessId = generateOpenCodeSessionId();
    expect(sessId.startsWith('sess_')).toBe(true);
    expect(sessId.length).toBeGreaterThan(10);

    const headers = getOpenCodeHeaders();
    expect(headers['x-session-id']).toBeDefined();
    expect(headers['User-Agent']).toBe('opencode/1.0.0');
    expect(headers['Authorization']).toBeUndefined();

    const authHeaders = getOpenCodeHeaders('zen_test_key_123');
    expect(authHeaders['Authorization']).toBe('Bearer zen_test_key_123');
  });

  it('detects free models accurately', () => {
    expect(isOpenCodeFreeModel('big-pickle')).toBe(true);
    expect(isOpenCodeFreeModel('deepseek-v4-flash-free')).toBe(true);
    expect(isOpenCodeFreeModel('union-alpha')).toBe(true);
    expect(isOpenCodeFreeModel('claude-sonnet-4-5')).toBe(false);
  });

  it('falls back to preset catalog if network fails', async () => {
    // Calling fetchOpenCodeModels against an unreachable base URL triggers fallback
    const models = await fetchOpenCodeModels('', 'http://127.0.0.1:59999/invalid');
    expect(models.length).toBeGreaterThanOrEqual(OPENCODE_PRESET_MODELS.length);
    expect(models.map(m => m.id)).toContain('big-pickle');
  });
});
