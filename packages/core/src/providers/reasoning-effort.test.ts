import { describe, it, expect } from 'vitest';
import {
  normalizeReasoningEffort,
  getReasoningRequestParams,
  applyReasoningEffort
} from './reasoning-effort.js';

describe('normalizeReasoningEffort', () => {
  it('returns the tier when advertised exactly', () => {
    expect(normalizeReasoningEffort('high', ['low', 'medium', 'high'])).toBe('high');
    expect(normalizeReasoningEffort('low', ['low', 'medium', 'high'])).toBe('low');
  });

  it('snaps to the nearest advertised level when not present', () => {
    // requested 'low' but only medium/high exist → nearest is 'medium'
    expect(normalizeReasoningEffort('low', ['medium', 'high'])).toBe('medium');
    // requested 'high' but only low exists → nearest is 'low'
    expect(normalizeReasoningEffort('high', ['low'])).toBe('low');
  });

  it('returns null when the model advertises no reasoning levels', () => {
    expect(normalizeReasoningEffort('high', [])).toBeNull();
    expect(normalizeReasoningEffort('high', undefined)).toBeNull();
  });

  it('falls back to the first advertised level when no ordinal match', () => {
    expect(normalizeReasoningEffort('high', ['custom-x'])).toBe('custom-x');
  });
});

describe('getReasoningRequestParams', () => {
  it('maps OpenAI family to reasoning_effort', () => {
    expect(getReasoningRequestParams('openai', 'high')).toEqual({ reasoning_effort: 'high' });
    expect(getReasoningRequestParams('deepseek', 'medium')).toEqual({ reasoning_effort: 'medium' });
  });

  it('maps Ollama (openai-compatible) to reasoning_effort', () => {
    expect(getReasoningRequestParams('ollama', 'low')).toEqual({ reasoning_effort: 'low' });
  });

  it('maps Anthropic to thinking with a budget, clamped below max_tokens', () => {
    expect(getReasoningRequestParams('anthropic', 'high', 3000)).toEqual({
      thinking: { type: 'enabled', budget_tokens: 2999 }
    });
    // no maxTokens → full ceiling
    expect(getReasoningRequestParams('anthropic', 'high')).toEqual({
      thinking: { type: 'enabled', budget_tokens: 8000 }
    });
    // never below the floor
    expect(getReasoningRequestParams('anthropic', 'low', 500)).toEqual({
      thinking: { type: 'enabled', budget_tokens: 1024 }
    });
  });

  it('maps Gemini to a thinkingConfig budget', () => {
    expect(getReasoningRequestParams('gemini', 'medium')).toEqual({
      generationConfig: { thinkingConfig: { thinkingBudget: 4096, includeThoughts: false } }
    });
  });
});

describe('applyReasoningEffort', () => {
  it('no-ops when effort is unset', () => {
    const payload: Record<string, unknown> = { model: 'x' };
    applyReasoningEffort(payload, 'openai', undefined);
    expect(payload.reasoning_effort).toBeUndefined();
  });

  it('sets a flat reasoning_effort for OpenAI-family providers', () => {
    const payload: Record<string, unknown> = { model: 'o3-mini' };
    applyReasoningEffort(payload, 'deepseek', 'high', 4096);
    expect(payload.reasoning_effort).toBe('high');
  });

  it('sets thinking and forces temperature 1.0 for Anthropic', () => {
    const payload: Record<string, unknown> = { model: 'claude-3-7-sonnet-20250219', max_tokens: 4096, temperature: 0.3 };
    applyReasoningEffort(payload, 'anthropic', 'high', 4096);
    expect(payload.thinking).toEqual({ type: 'enabled', budget_tokens: 4095 });
    expect(payload.temperature).toBe(1);
  });

  it('deep-merges thinkingConfig into Gemini generationConfig without clobbering siblings', () => {
    const payload: Record<string, unknown> = {
      contents: [],
      generationConfig: { temperature: 0.7, maxOutputTokens: 100 }
    };
    applyReasoningEffort(payload, 'gemini', 'low', 100);
    expect(payload.generationConfig).toEqual({
      temperature: 0.7,
      maxOutputTokens: 100,
      thinkingConfig: { thinkingBudget: 1024, includeThoughts: false }
    });
  });
});
