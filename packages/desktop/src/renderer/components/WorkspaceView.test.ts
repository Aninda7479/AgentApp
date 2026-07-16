import { describe, it, expect } from 'vitest';
import { composerModelsFromCatalog } from './WorkspaceView.js';
import type { ModelConfig } from '../logic/types.js';

/**
 * Regression test for the universal first-run blocker (ux-critic 2026-07-16,
 * CRITICAL): the composer's model list must reflect CONNECTED providers, not
 * the per-model Model-Governance `enabled` toggle. Imported models default to
 * enabled:false in enrichModel, so gating on `enabled` left the composer at
 * "Models: None" with a disabled send button for every first-run user. The
 * helper must offer connected-provider models even when none are `enabled`.
 */

const mk = (id: string, name: string, enabled: boolean): ModelConfig => ({
  id,
  name,
  providerId: 'openrouter',
  enabled,
  inputModalities: ['text'],
  outputModalities: ['text']
}) as ModelConfig;

describe('composerModelsFromCatalog', () => {
  it('returns no models when no provider is connected', () => {
    expect(composerModelsFromCatalog([])).toEqual([]);
  });

  it('offers the single connected model even when it is disabled (enabled:false)', () => {
    // This is the exact first-run shape: connect OpenRouter, 1 model imported,
    // enabled:false — previously the composer showed nothing + disabled send.
    expect(composerModelsFromCatalog([mk('openrouter-auto', 'Auto Router', false)])).toEqual(['Auto Router']);
  });

  it('offers "Model Governance" + every connected model when several are imported (all disabled)', () => {
    const catalog = [
      mk('or-a', 'Model A', false),
      mk('or-b', 'Model B', false),
      mk('or-c', 'Model C', false)
    ];
    expect(composerModelsFromCatalog(catalog)).toEqual(['Model Governance', 'Model A', 'Model B', 'Model C']);
  });

  it('does not filter out enabled models — both enabled and disabled are offered', () => {
    const catalog = [mk('or-a', 'Model A', true), mk('or-b', 'Model B', false)];
    expect(composerModelsFromCatalog(catalog)).toEqual(['Model Governance', 'Model A', 'Model B']);
  });
});
