import { describe, it, expect, afterEach, vi } from 'vitest';
import { getRouteFromLocation, buildPath } from './urlSync';
import type { RouteState } from './urlSync';

/**
 * urlSync reads the route from the address bar. In the node test env there is
 * no real window, so we stub a minimal one to exercise both the file:// (hash)
 * and http(s) (pathname) shells and, crucially, the slug-normalization that
 * keeps settings deep-links (e.g. /settings/3d-model-gen) from rendering a
 * blank panel.
 */
function withWindow(path: string, protocol: string) {
  vi.stubGlobal('window', {
    location: { protocol, pathname: path, hash: '' }
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('getRouteFromLocation — settings slug normalization', () => {
  it('normalizes a friendly 3D slug to the canonical "3d" category', () => {
    withWindow('/settings/3d-model-gen', 'http:');
    expect(getRouteFromLocation().settingsCategory).toBe('3d');
  });

  it('normalizes the longer "3d-model-generation" slug too', () => {
    withWindow('/settings/3d-model-generation', 'http:');
    expect(getRouteFromLocation().settingsCategory).toBe('3d');
  });

  it('keeps the canonical "3d" id unchanged', () => {
    withWindow('/settings/3d', 'http:');
    expect(getRouteFromLocation().settingsCategory).toBe('3d');
  });

  it('normalizes "model-governance" to "model-gov"', () => {
    withWindow('/settings/model-governance', 'http:');
    expect(getRouteFromLocation().settingsCategory).toBe('model-gov');
  });

  it('falls back to "general" when no category segment is present', () => {
    withWindow('/settings', 'http:');
    expect(getRouteFromLocation().settingsCategory).toBe('general');
  });

  it('reads the slug from the hash in the file:// (desktop) shell', () => {
    withWindow('/settings/3d-model-gen', 'file:');
    (window as any).location.hash = '#/settings/3d-model-gen';
    expect(getRouteFromLocation().settingsCategory).toBe('3d');
  });

  it('treats a chat route as the trajectory tab with general settings', () => {
    withWindow('/chat/abc123', 'http:');
    const route = getRouteFromLocation();
    expect(route.activeTab).toBe('trajectory');
    expect(route.activeChatId).toBe('abc123');
    expect(route.settingsCategory).toBe('general');
  });
});

describe('buildPath — emits canonical ids (never a friendly slug)', () => {
  const state = (over: Partial<RouteState>): RouteState => ({
    activeTab: 'settings',
    activeChatId: null,
    settingsCategory: 'general',
    ...over
  });

  it('writes the canonical "3d" id, not "3d-model-gen"', () => {
    expect(buildPath(state({ settingsCategory: '3d' }))).toBe('/settings/3d');
  });

  it('omits the category for general', () => {
    expect(buildPath(state({ settingsCategory: 'general' }))).toBe('/settings');
  });
});
