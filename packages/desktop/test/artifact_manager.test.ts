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

  it('populates seed artifacts if store is empty', async () => {
    const list = await manager.scanArtifacts();
    expect(list.length).toBeGreaterThanOrEqual(2);
    const calc = list.find((a) => a.id === 'quick-calc');
    expect(calc).toBeDefined();
    expect(calc?.manifest.name).toBe('Quick Calculator');
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
});
