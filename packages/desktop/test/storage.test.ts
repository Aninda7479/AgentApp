import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { existsSync } from 'fs';
import * as fsPromises from 'fs/promises';
import { getSettingsFilePath } from '@superagent/core';
import {
  readConversationStore,
  writeConversationStore,
  getChatJsonPath,
  getConversationRoots
} from '../src/main/storage/index.js';

describe('Desktop storage helpers', () => {
  let tempRoot: string;
  const settingsPath = getSettingsFilePath();
  let settingsBackup: string | null = null;

  beforeEach(async () => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'agentapp-storage-'));
    if (existsSync(settingsPath)) {
      settingsBackup = await fsPromises.readFile(settingsPath, 'utf-8');
    } else {
      settingsBackup = null;
    }
  });

  afterEach(async () => {
    fs.rmSync(tempRoot, { recursive: true, force: true });
    if (settingsBackup !== null) {
      await fsPromises.mkdir(path.dirname(settingsPath), { recursive: true });
      await fsPromises.writeFile(settingsPath, settingsBackup, 'utf-8');
    } else if (existsSync(settingsPath)) {
      await fsPromises.unlink(settingsPath);
    }
  });

  it('stores projects and chats in dedicated folders with safe project keys', async () => {
    await writeConversationStore(
      {
        connectedProviders: [
          { id: 'chatgpt', name: 'ChatGPT', type: 'key', apiKey: 'sk-test', baseUrl: 'https://api.openai.com/v1' }
        ],
        modelsCatalog: [
          { id: 'gpt-4o', name: 'GPT-4o', providerId: 'chatgpt', enabled: true }
        ],
        projects: [
          {
            name: 'My:Project',
            folders: ['D:\\Work\\My Project'],
            allowedCommands: ['npm test']
          }
        ],
        chats: [
          {
            id: 'chat-1',
            title: 'Project chat',
            project: 'My:Project',
            model: 'gpt-4o',
            timestamp: '2026-07-01',
            steps: [{ id: 'step-1', type: 'assistant', content: 'hello' } as any]
          },
          {
            id: 'chat-2',
            title: 'Standalone chat',
            project: '',
            model: 'gpt-4o',
            timestamp: '2026-07-01',
            steps: [{ id: 'step-2', type: 'assistant', content: 'hi' } as any]
          }
        ]
      },
      tempRoot
    );

    const roots = getConversationRoots(tempRoot);
    const projectFolders = fs.readdirSync(roots.projectsDir);
    expect(projectFolders).toHaveLength(1);
    expect(projectFolders[0]).not.toContain(':');

    const projectChatPath = getChatJsonPath(tempRoot, 'chat-1', projectFolders[0]);
    expect(fs.existsSync(projectChatPath)).toBe(true);
    expect(fs.existsSync(getChatJsonPath(tempRoot, 'chat-2'))).toBe(true);

    const loaded = await readConversationStore(tempRoot);
    expect(loaded.connectedProviders).toHaveLength(1);
    expect(loaded.modelsCatalog).toHaveLength(1);
    expect(loaded.projects).toHaveLength(1);
    expect(loaded.projects?.[0].name).toBe('My:Project');
    expect(loaded.chats).toHaveLength(2);
    expect(loaded.chats?.find((chat) => chat.id === 'chat-1')?.project).toBe('My:Project');
    expect(loaded.chats?.find((chat) => chat.id === 'chat-2')?.project).toBe('');
  });
});
