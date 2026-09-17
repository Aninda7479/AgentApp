import { describe, it, expect } from 'vitest';
import {
  OPENCODE_BASE_URL,
  OPENCODE_PRESET_MODELS,
  OPENCODE_PROVIDER_CONFIG,
  generateOpenCodeSessionId,
  generateOpenCodeRequestId,
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

  it('includes verified live-working free models in presets', () => {
    const ids = OPENCODE_PRESET_MODELS.map(m => m.id);
    expect(ids).toContain('big-pickle');
    expect(ids).toContain('mimo-v2.5-free');
    expect(ids).toContain('nemotron-3-ultra-free');
    expect(ids).toContain('nemotron-3.5-lightning-free');
    expect(ids).toContain('ling-3.0-flash-fin-free');

    const bigPickle = OPENCODE_PRESET_MODELS.find(m => m.id === 'big-pickle');
    expect(bigPickle?.free).toBe(true);
    expect(bigPickle?.ctx).toBe('200k');
  });

  it('generates canonical 30-character session and request IDs', () => {
    const sessId = generateOpenCodeSessionId();
    expect(sessId).toMatch(/^ses_[0-9a-f]{12}[0-9A-Za-z]{14}$/);
    expect(sessId.length).toBe(30);

    const reqId = generateOpenCodeRequestId();
    expect(reqId).toMatch(/^msg_[0-9a-f]{12}[0-9A-Za-z]{14}$/);
    expect(reqId.length).toBe(30);

    const headers = getOpenCodeHeaders();
    expect(headers['x-session-id']).toBe(headers['x-opencode-session']);
    expect(headers['Authorization']).toBe('Bearer public');
    expect(headers['User-Agent']).toContain('opencode/1.18.31');
    expect(headers['x-opencode-client']).toBe('desktop');

    const authHeaders = getOpenCodeHeaders('zen_test_key_123');
    expect(authHeaders['Authorization']).toBe('Bearer zen_test_key_123');
  });

  it('detects verified free models accurately', () => {
    expect(isOpenCodeFreeModel('big-pickle')).toBe(true);
    expect(isOpenCodeFreeModel('mimo-v2.5-free')).toBe(true);
    expect(isOpenCodeFreeModel('nemotron-3-ultra-free')).toBe(true);
    expect(isOpenCodeFreeModel('claude-sonnet-4-5')).toBe(false);
  });

  it('falls back to preset catalog if network fails', async () => {
    const models = await fetchOpenCodeModels('', 'http://127.0.0.1:59999/invalid');
    expect(models.length).toBe(OPENCODE_PRESET_MODELS.length);
    expect(models.map(m => m.id)).toContain('big-pickle');
  });
});

