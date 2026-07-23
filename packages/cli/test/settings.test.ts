import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import { existsSync } from 'fs';
import { SettingsStorage, getSettingsFilePath, getModelsFilePath } from '@superagent/core';

describe('Settings Storage Unit Tests', () => {
  const filePath = getSettingsFilePath();
  const modelsPath = getModelsFilePath();
  let backupContent: string | null = null;
  let modelsBackupContent: string | null = null;

  beforeEach(async () => {
    SettingsStorage.clearCache();
    // Backup original settings if they exist
    if (existsSync(filePath)) {
      try {
        backupContent = await fs.readFile(filePath, 'utf-8');
        await fs.unlink(filePath);
      } catch {
        // ignore
      }
    }
    if (existsSync(modelsPath)) {
      try {
        modelsBackupContent = await fs.readFile(modelsPath, 'utf-8');
        await fs.unlink(modelsPath);
      } catch {
        // ignore
      }
    }
  });

  afterEach(async () => {
    SettingsStorage.clearCache();
    // Restore backup
    try {
      if (backupContent !== null) {
        const dir = path.dirname(filePath);
        await fs.mkdir(dir, { recursive: true });
        await fs.writeFile(filePath, backupContent, 'utf-8');
      } else if (existsSync(filePath)) {
        await fs.unlink(filePath);
      }

      if (modelsBackupContent !== null) {
        const dir = path.dirname(modelsPath);
        await fs.mkdir(dir, { recursive: true });
        await fs.writeFile(modelsPath, modelsBackupContent, 'utf-8');
      } else if (existsSync(modelsPath)) {
        await fs.unlink(modelsPath);
      }
    } catch {
      // ignore cleanup errors
    }
  });

  it('should save and load settings successfully', () => {
    SettingsStorage.saveSettings({
      theme: { cli: 'dracula', desktop: 'system' },
      lastUsedModel: { provider: 'gemini', model: 'gemini-1.5-pro' },
      general: { workMode: 'coding', confirmShellCommands: true }
    });
    const loaded = SettingsStorage.loadSettings();
    expect(loaded.theme?.cli).toBe('dracula');
    expect(loaded.theme?.desktop).toBe('system');
    expect(loaded.lastUsedModel?.provider).toBe('gemini');
    expect(loaded.lastUsedModel?.model).toBe('gemini-1.5-pro');
    expect(loaded.general?.workMode).toBe('coding');
    expect(loaded.general?.confirmShellCommands).toBe(true);
  });

  it('should update single settings section successfully', () => {
    SettingsStorage.saveSettings({ theme: { cli: 'nord' } });
    SettingsStorage.saveSettings({ lastUsedModel: { model: 'gpt-4o' } });

    const loaded = SettingsStorage.loadSettings();
    expect(loaded.theme?.cli).toBe('nord');
    expect(loaded.lastUsedModel?.model).toBe('gpt-4o');
  });

  it('should save models to models.json separately from settings.json', async () => {
    const dummyModels = [
      { id: 'test-model-1', name: 'Test Model 1', providerId: 'test-prov', enabled: true }
    ];
    SettingsStorage.saveSettings({
      theme: { cli: 'cyberpunk' },
      models: dummyModels
    });

    SettingsStorage.clearCache();
    const loaded = SettingsStorage.loadSettings();
    expect(loaded.models).toEqual(dummyModels);

    // Verify models.json exists on disk and settings.json does not contain models
    expect(existsSync(modelsPath)).toBe(true);
    const settingsRaw = JSON.parse(await fs.readFile(filePath, 'utf-8'));
    expect(settingsRaw.models).toBeUndefined();

    const modelsRaw = JSON.parse(await fs.readFile(modelsPath, 'utf-8'));
    expect(modelsRaw).toEqual(dummyModels);
  });
});

