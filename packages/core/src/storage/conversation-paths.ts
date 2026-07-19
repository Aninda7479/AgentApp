import path from 'path';
import { STORAGE_DIRS } from './locations.js';
import type { ConversationRoots } from './conversation-types.js';

/** Sanitizes a name into a filesystem-safe storage key. */
export function normalizeStorageKey(name: string): string {
  const fallback = `project-${Date.now()}`;
  const cleaned = name
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/\.{2,}/g, '.')
    .slice(0, 80);
  const safe = cleaned || fallback;
  return safe
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '-')
    .replace(/[. ]+$/g, '') || fallback;
}

/** Returns the root directories for projects and chats under the user data folder. */
export function getConversationRoots(userDataDir: string): ConversationRoots {
  const baseDir = path.join(userDataDir, STORAGE_DIRS.conversation);
  return {
    userDataDir,
    baseDir,
    projectsDir: path.join(baseDir, 'projects'),
    chatsDir: path.join(baseDir, 'chats')
  };
}

/**
 * Returns true when `key` is already a generated storage ID of the form
 * `XXXX-XXXX-XXXX-XXXX` (charset `1-9A-Z`, dashes only). Such keys are stored
 * verbatim — `normalizeStorageKey` must NOT be applied to them, since it would
 * lowercase the uppercase glyphs and break the on-disk naming convention.
 */
export function isValidStorageId(key: string): boolean {
  return /^[1-9A-Z-]+$/.test(key);
}

/** Returns the filesystem path for a project's storage directory. */
export function getProjectDirectory(userDataDir: string, projectKey: string): string {
  const safeKey = isValidStorageId(projectKey) ? projectKey : normalizeStorageKey(projectKey);
  return path.join(getConversationRoots(userDataDir).projectsDir, safeKey);
}

/** Returns the path to a project's config JSON file. */
export function getProjectConfigPath(userDataDir: string, projectKey: string): string {
  return path.join(getProjectDirectory(userDataDir, projectKey), 'project-config.json');
}

/** Returns the directory for a chat, optionally scoped under a project. */
export function getChatDirectory(
  userDataDir: string,
  chatId: string,
  projectKey?: string
): string {
  if (projectKey) {
    return path.join(getProjectDirectory(userDataDir, projectKey), chatId);
  }
  return path.join(getConversationRoots(userDataDir).chatsDir, chatId);
}

/** Returns the path to a chat's JSON file. */
export function getChatJsonPath(
  userDataDir: string,
  chatId: string,
  projectKey?: string
): string {
  return path.join(getChatDirectory(userDataDir, chatId, projectKey), 'chat.json');
}

/** Returns the path to a chat's config JSON file (model, memory/context, etc.). */
export function getChatConfigPath(
  userDataDir: string,
  chatId: string,
  projectKey?: string
): string {
  return path.join(getChatDirectory(userDataDir, chatId, projectKey), 'config.json');
}
