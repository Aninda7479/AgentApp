import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  saveProject,
  readProject,
  deleteProject,
  saveChat,
  readChat,
  deleteChat,
  updateProject,
  updateChat,
  readConversationStore,
  writeConversationStore
} from '../src/storage/conversation-store.js';
import type { StoredChat, StoredProject, StoreData } from '../src/storage/types.js';

/**
 * Exercises the project/chat CRUD surface and the full-store round-trip in a
 * temp user-data dir. Writing a store with fewer chats/projects must prune the
 * orphaned on-disk directories (mission point: storage stays tidy, nothing
 * lingers stale).
 */
describe('conversation-store CRUD', () => {
  let dir: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'superagent-web-crud-'));
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  const project = (): StoredProject => ({
    name: 'My Project',
    folders: ['/tmp/x'],
    allowedCommands: ['ls'],
    storageKey: 'my-project'
  });

  const chat = (id: string, projectKey?: string): StoredChat => ({
    id,
    title: 'T',
    project: 'My Project',
    model: 'gpt',
    timestamp: '',
    steps: [],
    projectStorageKey: projectKey
  });

  it('saves and reads a project back', () => {
    const saved = saveProject(dir, project());
    expect(saved.storageKey).toBe('my-project');
    const got = readProject(dir, 'my-project');
    expect(got).not.toBeNull();
    expect(got!.name).toBe('My Project');
    expect(got!.folders).toEqual(['/tmp/x']);
    expect(got!.allowedCommands).toEqual(['ls']);
  });

  it('returns null for a missing project', () => {
    expect(readProject(dir, 'nope')).toBeNull();
  });

  it('deletes a project', () => {
    saveProject(dir, project());
    deleteProject(dir, 'my-project');
    expect(readProject(dir, 'my-project')).toBeNull();
  });

  it('updates a project via an updater', () => {
    saveProject(dir, project());
    const updated = updateProject(dir, 'my-project', (p) => ({ ...p, name: 'Renamed' }));
    expect(updated).not.toBeNull();
    expect(updated!.name).toBe('Renamed');
    expect(readProject(dir, 'my-project')!.name).toBe('Renamed');
  });

  it('associates a chat with its project on save', () => {
    saveProject(dir, project());
    saveChat(dir, { ...chat('c1', 'my-project'), project: 'My Project' });
    const got = readChat(dir, 'c1', 'my-project');
    expect(got).not.toBeNull();
    expect(got!.projectStorageKey).toBe('my-project');
  });

  it('returns null for a missing chat', () => {
    expect(readChat(dir, 'missing')).toBeNull();
  });

  it('updates a chat via an updater', () => {
    saveChat(dir, chat('c1'));
    const updated = updateChat(dir, 'c1', (c) => ({ ...c, title: 'Updated' }));
    expect(updated).not.toBeNull();
    expect(updated!.title).toBe('Updated');
  });

  it('deletes a chat', () => {
    saveChat(dir, chat('c1'));
    deleteChat(dir, 'c1');
    expect(readChat(dir, 'c1')).toBeNull();
  });

  it('round-trips the full store and prunes orphans on rewrite', () => {
    const data: StoreData = {
      connectedProviders: [],
      modelsCatalog: [],
      projects: [project()],
      chats: [chat('c1', 'my-project'), { ...chat('c2'), project: '' }]
    };
    writeConversationStore(data, dir);
    const loaded = readConversationStore(dir);
    expect(loaded.projects.length).toBe(1);
    expect(loaded.projects[0].name).toBe('My Project');
    expect(loaded.chats.length).toBe(2);

    // Rewrite with one fewer chat — the dropped chat's directory must be gone.
    writeConversationStore({ ...data, chats: [chat('c1', 'my-project')] }, dir);
    const reloaded = readConversationStore(dir);
    expect(reloaded.chats.length).toBe(1);
    expect(reloaded.chats[0].id).toBe('c1');
    expect(fs.existsSync(path.join(dir, 'conversation', 'chats', 'c2'))).toBe(false);
  });
});
