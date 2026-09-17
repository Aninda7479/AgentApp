import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';

describe('SuperAgent PWA (Chrome Installable App)', () => {
  const root = resolve(__dirname, '..');

  it('provides a valid manifest.webmanifest with all Chromium installability properties', () => {
    const manifestPath = resolve(root, 'src/manifest.webmanifest');
    expect(existsSync(manifestPath)).toBe(true);

    const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8'));
    expect(manifest.name).toBe('SuperAgent');
    expect(manifest.short_name).toBe('SuperAgent');
    expect(manifest.start_url).toBe('/');
    expect(manifest.display).toBe('standalone');
    expect(manifest.theme_color).toBeDefined();
    expect(manifest.background_color).toBeDefined();

    // Verify icons meet Chrome criteria: >= 192x192 and >= 512x512
    const icon192 = manifest.icons.find((i: { sizes: string; purpose?: string }) => i.sizes === '192x192' && (!i.purpose || i.purpose === 'any'));
    const icon512 = manifest.icons.find((i: { sizes: string; purpose?: string }) => i.sizes === '512x512' && (!i.purpose || i.purpose === 'any'));
    const maskable = manifest.icons.find((i: { purpose?: string }) => i.purpose === 'maskable');

    expect(icon192).toBeDefined();
    expect(icon512).toBeDefined();
    expect(maskable).toBeDefined();
  });

  it('provides backward-compatible manifest.json', () => {
    const manifestJsonPath = resolve(root, 'src/manifest.json');
    expect(existsSync(manifestJsonPath)).toBe(true);

    const manifest = JSON.parse(readFileSync(manifestJsonPath, 'utf-8'));
    expect(manifest.name).toBe('SuperAgent');
    expect(manifest.display).toBe('standalone');
  });

  it('provides service worker sw.js with required lifecycle and safety rules', () => {
    const swPath = resolve(root, 'src/sw.js');
    expect(existsSync(swPath)).toBe(true);

    const swCode = readFileSync(swPath, 'utf-8');
    // Must listen to install, activate, fetch
    expect(swCode).toContain("addEventListener('install'");
    expect(swCode).toContain("addEventListener('activate'");
    expect(swCode).toContain("addEventListener('fetch'");

    // Must never cache WebSocket or API requests
    expect(swCode).toContain('/api/');
    expect(swCode).toContain('/ws');

    // Must include skipWaiting and clients.claim
    expect(swCode).toContain('skipWaiting');
    expect(swCode).toContain('clients.claim');
  });

  it('has all required generated icons in assets directory', () => {
    const assetsDir = resolve(root, 'assets');
    expect(existsSync(resolve(assetsDir, 'icon-192.png'))).toBe(true);
    expect(existsSync(resolve(assetsDir, 'icon-512.png'))).toBe(true);
    expect(existsSync(resolve(assetsDir, 'icon-192-maskable.png'))).toBe(true);
    expect(existsSync(resolve(assetsDir, 'icon-512-maskable.png'))).toBe(true);
    expect(existsSync(resolve(assetsDir, 'apple-touch-icon.png'))).toBe(true);
    expect(existsSync(resolve(assetsDir, 'icon-32.png'))).toBe(true);
    expect(existsSync(resolve(assetsDir, 'icon-16.png'))).toBe(true);
  });
});
