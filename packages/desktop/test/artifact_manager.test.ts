import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { ArtifactManager } from '../src/main/artifact/artifactManager';

describe('ArtifactManager', () => {
  let tempDir: string;
  let manager: ArtifactManager;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'superagent-artifact-test-'));
    manager = new ArtifactManager(tempDir);
  });

  afterEach(async () => {
    await manager.destroyAll();
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('returns empty array when store is empty', async () => {
    const list = await manager.scanArtifacts();
    expect(list).toEqual([]);
  });

  it('creates custom artifact with files and manifest', async () => {
    const created = await manager.createArtifact({
      id: 'test-app',
      name: 'Test App',
      description: 'Unit test app',
      type: 'static',
      entry: 'index.html',
      port: 3099,
      files: {
        'index.html': '<h1>Hello Test</h1>'
      }
    });

    expect(created.id).toBe('test-app');
    expect(created.manifest.name).toBe('Test App');

    const manifestPath = path.join(tempDir, 'test-app', 'manifest.json');
    expect(fs.existsSync(manifestPath)).toBe(true);

    const htmlPath = path.join(tempDir, 'test-app', 'index.html');
    expect(fs.readFileSync(htmlPath, 'utf-8')).toBe('<h1>Hello Test</h1>');
  });

  it('starts and stops static HTTP server for artifact', async () => {
    await manager.createArtifact({
      id: 'demo-app',
      name: 'Demo',
      description: 'Demo app',
      type: 'static',
      entry: 'index.html',
      port: 3950,
      files: {
        'index.html': '<div>Working</div>'
      }
    });

    const started = await manager.startArtifact('demo-app');
    expect(started.status).toBe('running');
    expect(started.actualPort).toBeDefined();
    expect(started.url).toContain('http://127.0.0.1:');

    const stopped = await manager.stopArtifact('demo-app');
    expect(stopped.status).toBe('stopped');
    expect(stopped.actualPort).toBeUndefined();
  });

  it('blocks path traversal attempts in static HTTP server', async () => {
    await manager.createArtifact({
      id: 'secure-app',
      name: 'Secure',
      description: 'Security test app',
      type: 'static',
      entry: 'index.html',
      port: 3960,
      files: {
        'index.html': '<div>Safe Content</div>'
      }
    });

    const started = await manager.startArtifact('secure-app');
    expect(started.actualPort).toBeDefined();

    // Perform HTTP request attempting path traversal using URL encoded dots
    const res = await new Promise<{ statusCode?: number; data: string }>((resolve) => {
      import('http').then((http) => {
        http.get(`http://127.0.0.1:${started.actualPort}/%2e%2e%2f%2e%2e%2fpackage.json`, (response) => {
          let body = '';
          response.on('data', (chunk) => (body += chunk));
          response.on('end', () => resolve({ statusCode: response.statusCode, data: body }));
        });
      });
    });

    expect(res.statusCode).toBe(403);
    expect(res.data).toContain('403 Forbidden');
  });

  it('deletes an artifact and cleans up store directory', async () => {
    await manager.createArtifact({
      id: 'del-app',
      name: 'Delete Me',
      description: 'App to delete',
      type: 'static',
      entry: 'index.html',
      port: 3970,
      files: { 'index.html': '<h1>Delete</h1>' }
    });

    const success = await manager.deleteArtifact('del-app');
    expect(success).toBe(true);
    expect(manager.getArtifactState('del-app')).toBeUndefined();
    expect(fs.existsSync(path.join(tempDir, 'del-app'))).toBe(false);
  });
});
