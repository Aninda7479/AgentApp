import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { initializeDirectories, getArtifactDirectory, createBuiltinTools } from '../src/index.js';

describe('Artifact Runner and Builtin Tools E2E', () => {
  it('correctly initializes the artifact directory on startup', () => {
    initializeDirectories();
    const artDir = getArtifactDirectory();
    expect(fs.existsSync(artDir)).toBe(true);
  });

  it('correctly registers and executes propose_artifact and create_artifact tools', async () => {
    initializeDirectories();
    const artDir = getArtifactDirectory();

    const tools = createBuiltinTools();
    const proposeTool = tools.find(t => t.name === 'propose_artifact');
    const createTool = tools.find(t => t.name === 'create_artifact');
    const listTool = tools.find(t => t.name === 'list_artifacts');
    const deleteTool = tools.find(t => t.name === 'delete_artifact');

    expect(proposeTool).toBeDefined();
    expect(createTool).toBeDefined();
    expect(listTool).toBeDefined();
    expect(deleteTool).toBeDefined();

    const testApp = {
      id: 'test-app-id',
      name: 'Test App',
      description: 'A mock app for testing',
      type: 'static' as const,
      entry: 'index.html',
      port: 3099,
      files: {
        'index.html': '<h1>Test</h1>'
      }
    };

    // 1. Propose artifact
    const proposeResult = await proposeTool!.execute(testApp);
    expect(proposeResult).toContain('PROPOSAL SUCCESSFUL');
    expect(proposeResult).toContain('Test App');

    // 2. Create artifact
    const createResult = await createTool!.execute(testApp);
    expect(createResult).toContain('Test App');
    expect(createResult).toContain('test-app-id');

    // Verify manifest & file written to disk
    const appFolder = path.join(artDir, 'test-app-id');
    expect(fs.existsSync(path.join(appFolder, 'manifest.json'))).toBe(true);
    expect(fs.readFileSync(path.join(appFolder, 'index.html'), 'utf-8')).toBe('<h1>Test</h1>');

    // 3. List artifacts
    const listResult = await listTool!.execute({});
    expect(listResult).toContain('Test App');
    expect(listResult).toContain('test-app-id');

    // 4. Delete artifact
    const deleteResult = await deleteTool!.execute({ id: 'test-app-id' });
    expect(deleteResult).toContain('deleted successfully');
    expect(fs.existsSync(appFolder)).toBe(false);
  });
});
