import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  SettingsStorage,
  InternetAccessLevel
} from '../src/storage/settings-store.js';
import {
  getInternetAccessLevel,
  isNetworkAllowed,
  enforceNetworkAllowed,
  InternetAccessDeniedError,
  describeInternetAccessLevel
} from '../src/security/internet-access.js';

describe('Internet Access control', () => {
  beforeEach(() => {
    process.env.VITEST = '1';
    SettingsStorage.clearCache();
  });

  afterEach(() => {
    SettingsStorage.clearCache();
    SettingsStorage.saveSettings({ internetAccess: { level: 'all' } });
  });

  it('defaults to "all" when nothing is configured', () => {
    expect(getInternetAccessLevel()).toBe('all');
    expect(isNetworkAllowed({ kind: 'web-fetch', url: 'https://example.com', method: 'GET' })).toBe(true);
  });

  it('"none" blocks all agent network actions except the provider API and localhost', () => {
    SettingsStorage.saveSettings({ internetAccess: { level: 'none' } });
    expect(getInternetAccessLevel()).toBe('none');
    expect(isNetworkAllowed({ kind: 'web-fetch', url: 'https://example.com' })).toBe(false);
    expect(isNetworkAllowed({ kind: 'search' })).toBe(false);
    expect(isNetworkAllowed({ kind: 'browser', url: 'http://example.com' })).toBe(false);
    // Provider API is always allowed so the assistant can still answer.
    expect(isNetworkAllowed({ kind: 'api' })).toBe(true);
    // Loopback services are exempt.
    expect(isNetworkAllowed({ kind: 'browser', url: 'http://localhost:3000' })).toBe(true);
    expect(() => enforceNetworkAllowed({ kind: 'web-fetch', url: 'https://example.com' }))
      .toThrow(InternetAccessDeniedError);
  });

  it('"observation" allows read-only GET but blocks mutating requests', () => {
    SettingsStorage.saveSettings({ internetAccess: { level: 'observation' } });
    expect(getInternetAccessLevel()).toBe('observation');
    expect(isNetworkAllowed({ kind: 'web-fetch', url: 'https://example.com', method: 'GET' })).toBe(true);
    expect(isNetworkAllowed({ kind: 'web-fetch', url: 'https://example.com', method: 'HEAD' })).toBe(true);
    expect(isNetworkAllowed({ kind: 'web-fetch', url: 'https://example.com', method: 'POST' })).toBe(false);
    expect(isNetworkAllowed({ kind: 'upload' })).toBe(false);
    expect(() => enforceNetworkAllowed({ kind: 'web-fetch', url: 'https://example.com', method: 'POST' }))
      .toThrow(InternetAccessDeniedError);
  });

  it('persists the level through saveSettings', () => {
    const level: InternetAccessLevel = 'none';
    SettingsStorage.saveSettings({ internetAccess: { level } });
    expect(SettingsStorage.loadSettings().internetAccess?.level).toBe('none');
    // Other top-level keys are preserved.
    SettingsStorage.saveSettings({ general: { workMode: 'everyday' } });
    expect(SettingsStorage.loadSettings().internetAccess?.level).toBe('none');
  });

  it('describeInternetAccessLevel returns human-readable text', () => {
    expect(describeInternetAccessLevel('none')).toMatch(/cannot reach the internet/i);
    expect(describeInternetAccessLevel('observation')).toMatch(/read public web pages/i);
    expect(describeInternetAccessLevel('all')).toMatch(/freely/i);
  });
});
