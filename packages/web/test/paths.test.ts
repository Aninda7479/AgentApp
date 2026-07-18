import { describe, it, expect } from 'vitest';
import * as path from 'path';
import {
  normalizeStorageKey,
  isValidStorageId,
  getConversationRoots,
  getProjectDirectory,
  getProjectConfigPath,
  getChatDirectory,
  getChatJsonPath
} from '../src/storage/paths.js';

/**
 * Covers the filesystem-path helpers that decide where projects and chats
 * physically live on disk. `normalizeStorageKey` is the safety-critical one:
 * it must never emit a path segment that can escape its directory or collide
 * with an OS-reserved name.
 */
describe('storage path helpers', () => {
  const userData = '/tmp/fake-userdata';

  describe('normalizeStorageKey', () => {
    it('lowercases and replaces spaces with dashes', () => {
      expect(normalizeStorageKey('My Project')).toBe('my-project');
    });

    it('collapses unsafe characters into single dashes', () => {
      expect(normalizeStorageKey('A/B:C?D')).toBe('a-b-c-d');
    });

    it('trims leading/trailing dashes', () => {
      expect(normalizeStorageKey('---Weird Name---')).toBe('weird-name');
    });

    it('collapses repeated dots', () => {
      expect(normalizeStorageKey('a...b')).toBe('a.b');
    });

    it('strips trailing dots/spaces', () => {
      expect(normalizeStorageKey('name. ')).toBe('name');
    });

    it('falls back to a project- prefix when the result is empty', () => {
      const key = normalizeStorageKey('///');
      expect(key.startsWith('project-')).toBe(true);
    });
  });

  describe('getConversationRoots', () => {
    it('nests projects and chats under a conversation dir', () => {
      const roots = getConversationRoots(userData);
      expect(roots.baseDir).toBe(path.join(userData, 'conversation'));
      expect(roots.projectsDir).toBe(path.join(userData, 'conversation', 'projects'));
      expect(roots.chatsDir).toBe(path.join(userData, 'conversation', 'chats'));
    });
  });

  describe('project + chat path builders', () => {
    it('builds a sanitized project directory path', () => {
      expect(getProjectDirectory(userData, 'My Project')).toBe(
        path.join(userData, 'conversation', 'projects', 'my-project')
      );
    });

    it('builds a project config path', () => {
      expect(getProjectConfigPath(userData, 'my-project')).toBe(
        path.join(userData, 'conversation', 'projects', 'my-project', 'project-config.json')
      );
    });

    it('nests a chat under its project when a project key is given', () => {
      expect(getChatDirectory(userData, 'c1', 'my-project')).toBe(
        path.join(userData, 'conversation', 'projects', 'my-project', 'c1')
      );
      expect(getChatJsonPath(userData, 'c1', 'my-project')).toBe(
        path.join(userData, 'conversation', 'projects', 'my-project', 'c1', 'chat.json')
      );
    });

    it('places standalone chats in the top-level chats dir', () => {
      expect(getChatDirectory(userData, 'c1')).toBe(
        path.join(userData, 'conversation', 'chats', 'c1')
      );
      expect(getChatJsonPath(userData, 'c1')).toBe(
        path.join(userData, 'conversation', 'chats', 'c1', 'chat.json')
      );
    });

    it('keeps a generated storage ID verbatim (no lowercasing)', () => {
      const id = 'A1B2-C3D4-E5F6-G7H8';
      expect(isValidStorageId(id)).toBe(true);
      expect(getProjectDirectory(userData, id)).toBe(
        path.join(userData, 'conversation', 'projects', id)
      );
    });
  });
});
