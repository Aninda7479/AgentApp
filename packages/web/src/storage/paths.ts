import path from 'path';
import type { ConversationRoots } from './types.js';

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

export function getConversationRoots(userDataDir: string): ConversationRoots {
  const baseDir = path.join(userDataDir, 'Conversation');
  return {
    userDataDir,
    baseDir,
    projectsDir: path.join(baseDir, 'Projects'),
    chatsDir: path.join(baseDir, 'Chats')
  };
}

export function getProjectDirectory(userDataDir: string, projectKey: string): string {
  return path.join(getConversationRoots(userDataDir).projectsDir, normalizeStorageKey(projectKey));
}

export function getProjectConfigPath(userDataDir: string, projectKey: string): string {
  return path.join(getProjectDirectory(userDataDir, projectKey), 'project-config.json');
}

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

export function getChatJsonPath(
  userDataDir: string,
  chatId: string,
  projectKey?: string
): string {
  return path.join(getChatDirectory(userDataDir, chatId, projectKey), 'chat.json');
}
