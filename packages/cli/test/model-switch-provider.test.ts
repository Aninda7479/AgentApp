import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import { existsSync } from 'fs';
import { getSettingsFilePath } from '@superagent/core';
import { createSessionContext } from '../src/types.js';
import { ModelSwitcher } from '../src/commands/model.js';

/**
 * Regression tests for `/model provider <name>`.
 *
 * The provider set is validated against the canonical provider registry (via
 * `getProviderMeta`), so every provider the app actually supports — including
 * ones not in the old hardcoded subset (openrouter, nvidia, kimi, ollama, …) —
 * must be switchable. Previously a hardcoded allowlist rejected valid providers.
 */
describe('ModelSwitcher.switchProvider registry validation', () => {
  const filePath = getSettingsFilePath();
  let backup: string | null = null;

  beforeEach(async () => {
    if (existsSync(filePath)) {
      try {
        backup = await fs.readFile(filePath, 'utf-8');
        await fs.unlink(filePath);
      } catch {
        /* ignore */
      }
    }
  });

  afterEach(async () => {
    try {
      if (backup !== null) {
        await fs.writeFile(filePath, backup, 'utf-8');
        backup = null;
      } else if (existsSync(filePath)) {
        await fs.unlink(filePath);
      }
    } catch {
      /* ignore cleanup */
    }
  });

  it('switches to a registry-supported provider outside the old hardcoded subset (e.g. nvidia)', () => {
    const ctx = createSessionContext();
    const res = ModelSwitcher.switchProvider(ctx, 'nvidia');
    expect(res.success).toBe(true);
    expect(ctx.activeProvider).toBe('nvidia');
  });

  it('switches to openrouter, another non-hardcoded provider', () => {
    const ctx = createSessionContext();
    const res = ModelSwitcher.switchProvider(ctx, 'openrouter');
    expect(res.success).toBe(true);
    expect(ctx.activeProvider).toBe('openrouter');
  });

  it('rejects a provider that is not in the registry', () => {
    const ctx = createSessionContext();
    const before = ctx.activeProvider;
    const res = ModelSwitcher.switchProvider(ctx, 'definitely-not-a-provider');
    expect(res.success).toBe(false);
    // Provider must not change on a rejected switch.
    expect(ctx.activeProvider).toBe(before);
  });
});
