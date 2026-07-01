import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import { existsSync } from 'fs';
import { SettingsStorage, getSettingsFilePath } from '@superagent/core';

describe('Settings Storage Unit Tests', () => {
  const filePath = getSettingsFilePath();
  let backupContent: string | null = null;

  beforeEach(async () => {
    // Backup original settings if they exist
    if (existsSync(filePath)) {
      try {
        backupContent = await fs.readFile(filePath, 'utf-8');
        await fs.unlink(filePath);
      } catch {
        // ignore
      }
    }
  });

  afterEach(async () => {
    // Restore backup
    try {
      if (backupContent !== null) {
        const dir = path.dirname(filePath);
        await fs.mkdir(dir, { recursive: true });
        await fs.writeFile(filePath, backupContent, 'utf-8');
      } else if (existsSync(filePath)) {
        await fs.unlink(filePath);
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
});
