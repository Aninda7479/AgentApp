import { describe, it, expect } from 'vitest';
import { composerModelsFromCatalog, composerEmptyStateMessage } from './WorkspaceView.js';
import type { ModelConfig } from '../logic/types.js';

/**
 * The workspace/composer model dropdown must reflect the per-model `enabled`
 * toggle from Settings → Models: only ENABLED models are offered, and disabled
 * models are excluded. Connected-provider models default to enabled:true in
 * enrichModel, so a fresh connection still populates the dropdown (no first-run
 * blocker), and the toggle is what hides models the user doesn't want.
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
  it('returns no models when nothing is connected', () => {
    expect(composerModelsFromCatalog([])).toEqual([]);
  });

  it('offers the single enabled connected model', () => {
    expect(composerModelsFromCatalog([mk('openrouter-auto', 'Auto Router', true)])).toEqual(['Auto Router']);
  });

  it('offers "Orchestrator" + every ENABLED model when several are enabled', () => {
    const catalog = [
      mk('or-a', 'Model A', true),
      mk('or-b', 'Model B', true),
      mk('or-c', 'Model C', true)
    ];
    expect(composerModelsFromCatalog(catalog)).toEqual(['Orchestrator', 'Model A', 'Model B', 'Model C']);
  });

  it('excludes disabled models — only enabled ones are offered', () => {
    const catalog = [mk('or-a', 'Model A', true), mk('or-b', 'Model B', false)];
    expect(composerModelsFromCatalog(catalog)).toEqual(['Model A']);
  });

  it('returns nothing when every connected model is disabled', () => {
    const catalog = [
      mk('or-a', 'Model A', false),
      mk('or-b', 'Model B', false)
    ];
    expect(composerModelsFromCatalog(catalog)).toEqual([]);
  });

  it('shows "Orchestrator" once there are 2+ enabled models, dropping disabled ones', () => {
    const catalog = [
      mk('or-a', 'Model A', true),
      mk('or-b', 'Model B', true),
      mk('or-c', 'Model C', false)
    ];
    expect(composerModelsFromCatalog(catalog)).toEqual(['Orchestrator', 'Model A', 'Model B']);
  });
});

describe('composerEmptyStateMessage', () => {
  it('returns null when at least one model is enabled (composer usable)', () => {
    expect(composerEmptyStateMessage([mk('or-a', 'Model A', true)])).toBeNull();
  });

  it('tells the user to connect a provider when the catalog is empty', () => {
    expect(composerEmptyStateMessage([])).toMatch(/connect/i);
  });

  it('tells the user to enable a model (not connect) when a provider is connected but all models are disabled', () => {
    const msg = composerEmptyStateMessage([mk('or-a', 'Model A', false), mk('or-b', 'Model B', false)]);
    expect(msg).not.toBeNull();
    // Points at enabling, and explicitly acknowledges a provider is already connected.
    expect(msg).toMatch(/enable/i);
    expect(msg).toMatch(/connected/i);
    // It must NOT be the "connect a provider" remediation (that's the empty-catalog case).
    expect(msg).not.toMatch(/add one/i);
  });
});
