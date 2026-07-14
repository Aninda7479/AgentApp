import { describe, it, expect, afterEach } from 'vitest';
import { join } from 'path';
import { existsSync, rmSync, readFileSync } from 'fs';
import {
  SlashCommandRouter,
  registerConfigCommand,
  handleConfigCommand,
  registerCostCommand,
  createSessionContext
} from '../src/index.js';
import { loadSettings } from '@superagent/core';

const TMP = join(process.cwd(), 'tmp', 'config_test_dir');

describe('config command (/config)', () => {
  afterEach(() => {
    if (existsSync(TMP)) rmSync(TMP, { recursive: true, force: true });
  });

  it('views settings as JSON', () => {
    const res = handleConfigCommand(['view']);
    expect(res.success).toBe(true);
    expect(res.message).toContain('=== SuperAgent Configuration ===');
  });

  it('gets, sets, and resets a dotted key', () => {
    const set = handleConfigCommand(['set', 'theme.cli', 'cyberpunk']);
    expect(set.success).toBe(true);
    expect(set.message).toContain('cyberpunk');

    const got = handleConfigCommand(['get', 'theme.cli']);
    expect(got.success).toBe(true);
    expect(got.message).toContain('cyberpunk');

    const reset = handleConfigCommand(['reset', 'theme.cli']);
    expect(reset.success).toBe(true);
  });

  it('rejects forbidden keys', () => {
    const res = handleConfigCommand(['set', 'someUnknownKey', 'x']);
    expect(res.success).toBe(false);
    expect(res.error).toContain('Forbidden key');
  });

  it('coerces booleans, numbers, and JSON values', () => {
    const b = handleConfigCommand(['set', 'general.verbose', 'true']);
    expect(b.success).toBe(true);
    const n = handleConfigCommand(['set', 'modelGov.maxTokens', '2048']);
    expect(n.success).toBe(true);
    const o = handleConfigCommand(['set', 'internetAccess.allowlist', '["example.com"]']);
    expect(o.success).toBe(true);
  });

  it('exposes /config through the router', async () => {
    const router = new SlashCommandRouter();
    registerConfigCommand(router);
    const res = await router.execute('/config view');
    expect(res.success).toBe(true);
  });

  it('persists to the settings file', () => {
    handleConfigCommand(['set', 'theme.cli', 'ocean']);
    const loaded = loadSettings();
    expect((loaded.theme as Record<string, unknown>)?.cli).toBe('ocean');
    // Clean up so we don't leak state into other tests.
    handleConfigCommand(['reset', 'theme.cli']);
  });
});

describe('cost command (/cost)', () => {
  it('reports token and cost metrics', () => {
    const session = createSessionContext();
    const router = new SlashCommandRouter();
    registerCostCommand(router, session);
    // execute is registered synchronously; call via handler path
    const res = router.execute('/cost');
    expect(res).toBeDefined();
    return res.then((r) => {
      expect(r.success).toBe(true);
      expect(r.output).toContain('=== Session Cost & Token Meter ===');
      expect(r.output).toContain('Est. Cost:');
    });
  });
});
