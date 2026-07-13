import fs from 'fs';
import path from 'path';
import { SettingsStorage } from '@superagent/core';
import { getChatDirectory, getChatJsonPath, getConversationRoots, getProjectConfigPath, getProjectDirectory, normalizeStorageKey } from './paths.js';
import type { ConversationRoots, StoreData, StoredChat, StoredProject } from './types.js';

type ProjectRecord = StoredProject & { storageKey: string };

function ensureDirectory(dir: string): void {
  fs.mkdirSync(dir, { recursive: true });
}

function readJson<T>(filePath: string): T | null {
  if (!fs.existsSync(filePath)) return null;
  const raw = fs.readFileSync(filePath, 'utf-8').trim();
  if (!raw) return null;
  return JSON.parse(raw) as T;
}

function writeJson(filePath: string, data: unknown): void {
  ensureDirectory(path.dirname(filePath));
  const tmpPath = `${filePath}.tmp`;
  fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2), 'utf-8');
  if (fs.existsSync(filePath)) {
    fs.copyFileSync(filePath, `${filePath}.bak`);
  }
  if (fs.existsSync(filePath)) {
    fs.rmSync(filePath, { force: true });
  }
  fs.copyFileSync(tmpPath, filePath);
  fs.unlinkSync(tmpPath);
}

function uniqueStorageKey(baseKey: string, usedKeys: Set<string>): string {
  let candidate = baseKey;
  let suffix = 2;
  while (usedKeys.has(candidate)) {
    candidate = `${baseKey}-${suffix}`;
    suffix += 1;
  }
  usedKeys.add(candidate);
  return candidate;
}

function readProjectRecord(projectDir: string, folderName: string): ProjectRecord | null {
  const configPath = path.join(projectDir, 'project-config.json');
  let folders: string[] = [];
  let allowedCommands: string[] = [];
  let displayName = folderName;

  try {
    const config = readJson<{ name?: string; folders?: string[]; allowedCommands?: string[] }>(configPath);
    if (config) {
      displayName = config.name?.trim() || folderName;
      folders = config.folders ?? [];
      allowedCommands = config.allowedCommands ?? [];
    } else {
      writeJson(configPath, { name: displayName, folders: [], allowedCommands: [] });
    }
  } catch (e) {
    console.error(`Failed to read project config for ${folderName}:`, e);
  }

  return {
    name: displayName,
    folders,
    allowedCommands,
    storageKey: folderName
  };
}

function readChatRecord(chatJsonPath: string, projectName: string, projectKey?: string): StoredChat | null {
  try {
    const chat = readJson<StoredChat>(chatJsonPath);
    if (!chat) return null;
    return {
      ...chat,
      project: projectName,
      projectStorageKey: projectKey
    };
  } catch (e) {
    console.error(`Failed to read chat JSON at ${chatJsonPath}:`, e);
    return null;
  }
}

function resolveProjectKey(project: StoredProject, usedKeys: Set<string>): ProjectRecord {
  const storageKey = uniqueStorageKey(normalizeStorageKey(project.storageKey || project.name), usedKeys);
  return {
    ...project,
    name: project.name.trim(),
    folders: project.folders ?? [],
    allowedCommands: project.allowedCommands ?? [],
    storageKey
  };
}

function readProjectsAndChats(roots: ConversationRoots): { projects: ProjectRecord[]; chats: StoredChat[] } {
  const projects: ProjectRecord[] = [];
  const chats: StoredChat[] = [];
  const seenChats = new Set<string>();

  ensureDirectory(roots.projectsDir);
  ensureDirectory(roots.chatsDir);

  try {
    for (const folderName of fs.readdirSync(roots.projectsDir)) {
      const projectDir = path.join(roots.projectsDir, folderName);
      if (!fs.statSync(projectDir).isDirectory()) continue;

      const project = readProjectRecord(projectDir, folderName);
      if (!project) continue;
      projects.push(project);

      for (const chatFolder of fs.readdirSync(projectDir)) {
        if (chatFolder === 'project-config.json') continue;
        const chatDir = path.join(projectDir, chatFolder);
        if (!fs.statSync(chatDir).isDirectory()) continue;

        const chatJsonPath = path.join(chatDir, 'chat.json');
        const chat = fs.existsSync(chatJsonPath) ? readChatRecord(chatJsonPath, project.name, project.storageKey) : null;
        if (chat) {
          const chatKey = `${project.storageKey}/${chat.id}`;
          if (!seenChats.has(chatKey)) {
            seenChats.add(chatKey);
            chats.push(chat);
          }
        }
      }
    }
  } catch (e) {
    console.error('Failed to read project conversations:', e);
  }

  try {
    for (const chatFolder of fs.readdirSync(roots.chatsDir)) {
      const chatDir = path.join(roots.chatsDir, chatFolder);
      if (!fs.statSync(chatDir).isDirectory()) continue;

      const chatJsonPath = path.join(chatDir, 'chat.json');
      if (!fs.existsSync(chatJsonPath)) continue;

      const chat = readChatRecord(chatJsonPath, '', undefined);
      if (chat) {
        const chatKey = `standalone/${chat.id}`;
        if (!seenChats.has(chatKey)) {
          seenChats.add(chatKey);
          chats.push({ ...chat, project: '' });
        }
      }
    }
  } catch (e) {
    console.error('Failed to read standalone conversations:', e);
  }

  return { projects, chats };
}

function findProjectRecord(roots: ConversationRoots, matcher: (project: ProjectRecord) => boolean): ProjectRecord | null {
  try {
    for (const folderName of fs.readdirSync(roots.projectsDir)) {
      const projectDir = path.join(roots.projectsDir, folderName);
      if (!fs.statSync(projectDir).isDirectory()) continue;
      const project = readProjectRecord(projectDir, folderName);
      if (project && matcher(project)) {
        return project;
      }
    }
  } catch (e) {
    console.error('Failed to resolve project record:', e);
  }
  return null;
}

/** Reads the full conversation store (providers, models, projects, chats) from disk. */
export function readConversationStore(userDataDir: string): StoreData {
  const roots = getConversationRoots(userDataDir);

  let providers = [] as StoreData['connectedProviders'];
  let models = [] as StoreData['modelsCatalog'];

  try {
    const settings = SettingsStorage.loadSettings();
    providers = (settings.providers as StoreData['connectedProviders']) ?? [];
    models = (settings.models as StoreData['modelsCatalog']) ?? [];
  } catch (e) {
    console.error('Failed to read unified settings:', e);
  }

  const { projects, chats } = readProjectsAndChats(roots);

  return {
    connectedProviders: providers,
    modelsCatalog: models,
    projects,
    chats
  };
}

function buildProjectRecords(projects: StoredProject[]): ProjectRecord[] {
  const usedKeys = new Set<string>();
  return projects.map((project) => resolveProjectKey(project, usedKeys));
}

/** Writes the full conversation store to disk, cleaning up removed projects/chats. */
export function writeConversationStore(data: StoreData, userDataDir: string): void {
  const roots = getConversationRoots(userDataDir);
  ensureDirectory(roots.projectsDir);
  ensureDirectory(roots.chatsDir);

  try {
    SettingsStorage.saveSettings({
      providers: data.connectedProviders as any,
      models: data.modelsCatalog as any
    });
  } catch (e) {
    console.error('Failed to write unified settings:', e);
  }

  const projectRecords = buildProjectRecords(data.projects ?? []);
  const activeProjectKeys = new Set(projectRecords.map((project) => project.storageKey));
  const projectByName = new Map(projectRecords.map((project) => [project.name, project]));
  const projectByKey = new Map(projectRecords.map((project) => [project.storageKey, project]));
  const activeChatFolders = new Set<string>();

  for (const project of projectRecords) {
    const projectDir = getProjectDirectory(userDataDir, project.storageKey);
    ensureDirectory(projectDir);
    writeJson(getProjectConfigPath(userDataDir, project.storageKey), {
      name: project.name,
      folders: project.folders ?? [],
      allowedCommands: project.allowedCommands ?? []
    });
  }

  for (const chat of data.chats ?? []) {
    const matchedProject =
      (chat.projectStorageKey && projectByKey.get(chat.projectStorageKey)) ||
      projectByName.get(chat.project);

    const targetProjectKey = matchedProject?.storageKey;
    const targetChatDir = getChatDirectory(userDataDir, chat.id, targetProjectKey);
    ensureDirectory(targetChatDir);
    writeJson(getChatJsonPath(userDataDir, chat.id, targetProjectKey), {
      ...chat,
      projectStorageKey: targetProjectKey
    });

    activeChatFolders.add(targetProjectKey ? `${targetProjectKey}/${chat.id}` : `standalone/${chat.id}`);
  }

  try {
    for (const folderName of fs.readdirSync(roots.projectsDir)) {
      const projectDir = path.join(roots.projectsDir, folderName);
      if (!fs.statSync(projectDir).isDirectory()) continue;

      if (!activeProjectKeys.has(folderName)) {
        fs.rmSync(projectDir, { recursive: true, force: true });
        continue;
      }

      for (const chatFolder of fs.readdirSync(projectDir)) {
        if (chatFolder === 'project-config.json') continue;
        const chatDir = path.join(projectDir, chatFolder);
        if (!fs.statSync(chatDir).isDirectory()) continue;
        if (!activeChatFolders.has(`${folderName}/${chatFolder}`)) {
          fs.rmSync(chatDir, { recursive: true, force: true });
        }
      }
    }
  } catch (e) {
    console.error('Error cleaning project directories:', e);
  }

  try {
    for (const chatFolder of fs.readdirSync(roots.chatsDir)) {
      const chatDir = path.join(roots.chatsDir, chatFolder);
      if (!fs.statSync(chatDir).isDirectory()) continue;
      if (!activeChatFolders.has(`standalone/${chatFolder}`)) {
        fs.rmSync(chatDir, { recursive: true, force: true });
      }
    }
  } catch (e) {
    console.error('Error cleaning standalone chat directories:', e);
  }
}

/** Reads a single project record by its storage key. */
export function readProject(userDataDir: string, projectKey: string): StoredProject | null {
  const projectDir = getProjectDirectory(userDataDir, projectKey);
  if (!fs.existsSync(projectDir) || !fs.statSync(projectDir).isDirectory()) {
    return null;
  }
  const project = readProjectRecord(projectDir, projectKey);
  return project ? { name: project.name, folders: project.folders, allowedCommands: project.allowedCommands, storageKey: project.storageKey } : null;
}

/** Creates or updates a project on disk and returns the resolved record. */
export function saveProject(userDataDir: string, project: StoredProject): StoredProject {
  const record = resolveProjectKey(project, new Set<string>());
  writeJson(getProjectConfigPath(userDataDir, record.storageKey), {
    name: record.name,
    folders: record.folders ?? [],
    allowedCommands: record.allowedCommands ?? []
  });
  return record;
}

/** Reads a single chat by ID, optionally scoped to a project. */
export function readChat(userDataDir: string, chatId: string, projectKey?: string): StoredChat | null {
  const chatJsonPath = getChatJsonPath(userDataDir, chatId, projectKey);
  if (!fs.existsSync(chatJsonPath)) return null;
  const projectName = projectKey ? readProject(userDataDir, projectKey)?.name || projectKey : '';
  return readChatRecord(chatJsonPath, projectName, projectKey);
}

/** Persists a chat record to disk under its matched project. */
export function saveChat(userDataDir: string, chat: StoredChat): void {
  const roots = getConversationRoots(userDataDir);
  const project =
    (chat.projectStorageKey ? findProjectRecord(roots, (item) => item.storageKey === chat.projectStorageKey) : null) ||
    (chat.project ? findProjectRecord(roots, (item) => item.name === chat.project) : null);
  const targetProjectKey = project?.storageKey;
  writeJson(getChatJsonPath(userDataDir, chat.id, targetProjectKey), {
    ...chat,
    projectStorageKey: targetProjectKey
  });
}

/** Deletes a project directory and all its chats from disk. */
export function deleteProject(userDataDir: string, projectKey: string): void {
  const projectDir = getProjectDirectory(userDataDir, projectKey);
  if (fs.existsSync(projectDir)) {
    fs.rmSync(projectDir, { recursive: true, force: true });
  }
}

/** Deletes a single chat directory from disk. */
export function deleteChat(userDataDir: string, chatId: string, projectKey?: string): void {
  const chatDir = getChatDirectory(userDataDir, chatId, projectKey);
  if (fs.existsSync(chatDir)) {
    fs.rmSync(chatDir, { recursive: true, force: true });
  }
}

/** Reads, transforms, and saves a project in one operation. */
export function updateProject(
  userDataDir: string,
  projectKey: string,
  updater: (project: StoredProject) => StoredProject
): StoredProject | null {
  const existing = readProject(userDataDir, projectKey);
  if (!existing) return null;
  const next = updater(existing);
  saveProject(userDataDir, { ...next, storageKey: existing.storageKey });
  return { ...next, storageKey: existing.storageKey };
}

/** Reads, transforms, and saves a chat in one operation. */
export function updateChat(
  userDataDir: string,
  chatId: string,
  updater: (chat: StoredChat) => StoredChat,
  projectKey?: string
): StoredChat | null {
  const existing = readChat(userDataDir, chatId, projectKey);
  if (!existing) return null;
  const next = updater(existing);
  saveChat(userDataDir, { ...next, projectStorageKey: existing.projectStorageKey });
  return { ...next, projectStorageKey: existing.projectStorageKey };
}

export { getConversationRoots, getChatDirectory, getChatJsonPath, getProjectDirectory, getProjectConfigPath };
