import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { readChat, saveChat, getChatJsonPath } from '../src/storage/conversation-store.js';
import type { StoredChat } from '../src/storage/types.js';

/**
 * Exercises the conversation store's durability behaviour in a temp user-data
 * dir. In particular, a corrupt `chat.json` must be recovered from its `.bak`
 * rather than silently dropped (mission point 1: the user owns their data).
 */
describe('conversation-store read durability', () => {
  let dir: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'superagent-web-test-'));
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  const chat = (id: string): StoredChat => ({
    id,
    title: 'Test chat',
    messages: [],
    createdAt: 0,
    updatedAt: 0,
    project: ''
  });

  it('saves and reads a chat back', async () => {
    await saveChat(dir, chat('c1'));
    const got = await readChat(dir, 'c1');
    expect(got).not.toBeNull();
    expect(got!.id).toBe('c1');
  });

  it('recovers a corrupt chat.json from its .bak backup', async () => {
    await saveChat(dir, chat('c1'));
    const chatJsonPath = getChatJsonPath(dir, 'c1');
    // Simulate a crash leaving a truncated/garbage primary file, but a good .bak.
    fs.writeFileSync(chatJsonPath, '{ "id": "c1", "title": "CORRUPT');
    fs.writeFileSync(`${chatJsonPath}.bak`, JSON.stringify(chat('c1')));

    const got = await readChat(dir, 'c1');
    expect(got).not.toBeNull();
    expect(got!.id).toBe('c1');
  });

  it('returns null for a corrupt chat.json with no backup', async () => {
    const chatDir = path.join(dir, 'chats', 'c2');
    fs.mkdirSync(chatDir, { recursive: true });
    fs.writeFileSync(path.join(chatDir, 'chat.json'), 'not json at all');
    expect(await readChat(dir, 'c2')).toBeNull();
  });
});
