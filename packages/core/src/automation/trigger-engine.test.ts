import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TriggerEngine, TriggerConfig } from './trigger-engine.js';
import fs from 'fs';
import path from 'path';
import os from 'os';

describe('TriggerEngine', () => {
  let tmpDir: string;
  let storageFile: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'trigger-test-'));
    storageFile = path.join(tmpDir, 'triggers.json');
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('should add, retrieve, and list triggers', () => {
    const engine = new TriggerEngine({ storagePath: storageFile });
    const added = engine.addTrigger({
      name: 'Test Watcher',
      type: 'watcher',
      enabled: true,
      prompt: 'Check modified file',
      targetPath: tmpDir,
    });

    expect(added.id).toBeDefined();
    expect(added.runCount).toBe(0);

    const fetched = engine.getTrigger(added.id);
    expect(fetched?.name).toBe('Test Watcher');

    const list = engine.listTriggers();
    expect(list.length).toBe(1);
  });

  it('should execute trigger manually and call executor callback', async () => {
    const executorMock = vi.fn().mockResolvedValue(undefined);
    const engine = new TriggerEngine({ storagePath: storageFile, executor: executorMock });

    const added = engine.addTrigger({
      name: 'Test Cron',
      type: 'cron',
      enabled: true,
      prompt: 'Run security audit',
    });

    await engine.executeTrigger(added);

    expect(executorMock).toHaveBeenCalledTimes(1);
    const updated = engine.getTrigger(added.id);
    expect(updated?.runCount).toBe(1);
    expect(updated?.lastStatus).toBe('success');
  });

  it('should persist triggers to disk and reload them', () => {
    const engine1 = new TriggerEngine({ storagePath: storageFile });
    engine1.addTrigger({
      name: 'Persisted Trigger',
      type: 'webhook',
      enabled: true,
      prompt: 'Handle webhook event',
    });

    const engine2 = new TriggerEngine({ storagePath: storageFile });
    const list = engine2.listTriggers();
    expect(list.length).toBe(1);
    expect(list[0].name).toBe('Persisted Trigger');
  });
});
