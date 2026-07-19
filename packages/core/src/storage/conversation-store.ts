import fs from 'fs';
import path from 'path';
import { SettingsStorage } from './settings-store.js';
import {
  getChatDirectory,
  getChatJsonPath,
  getChatConfigPath,
  getConversationRoots,
  getProjectConfigPath,
  getProjectDirectory,
  normalizeStorageKey,
  isValidStorageId
} from './conversation-paths.js';
import type {
  ConversationRoots,
  StoreData,
  StoredChat,
  StoredChatConfig,
  StoredProject
} from './conversation-types.js';
import { CHAT_FILE_KEYS, CHAT_CONFIG_KEYS } from './conversation-types.js';

type ProjectRecord = StoredProject & { storageKey: string };

/** Ensures a directory exists, creating it recursively if needed. */
function ensureDirectory(dir: string): void {
  fs.mkdirSync(dir, { recursive: true });
}

/** Reads and parses a JSON file, returning null if missing, empty, or corrupt. */
function readJson<T>(filePath: string): T | null {
  if (!fs.existsSync(filePath)) return null;
  const raw = fs.readFileSync(filePath, 'utf-8').trim();
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    // Corrupt/truncated file — fall back to the last good backup if present so
    // user conversation data is not silently lost.
    const bakPath = `${filePath}.bak`;
    if (fs.existsSync(bakPath)) {
      try {
        const bakRaw = fs.readFileSync(bakPath, 'utf-8').trim();
        if (bakRaw) {
          console.warn(`Recovered ${filePath} from backup (primary file was corrupt).`);
          return JSON.parse(bakRaw) as T;
        }
      } catch {
        /* ignore backup parse failure */
      }
    }
    console.error(`Failed to parse JSON at ${filePath}; content dropped.`);
    return null;
  }
}

/** Atomically writes JSON to disk using a temp file + backup strategy. */
function writeJson(filePath: string, data: unknown): void {
  ensureDirectory(path.dirname(filePath));
  const tmpPath = `${filePath}.tmp`;
  fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2), 'utf-8');
  // Keep the previous version as a .bak before replacing it.
  if (fs.existsSync(filePath)) {
    fs.copyFileSync(filePath, `${filePath}.bak`);
    fs.rmSync(filePath, { force: true });
  }
  fs.copyFileSync(tmpPath, filePath);
  fs.unlinkSync(tmpPath);
}

/** Generates a unique storage key by appending a numeric suffix if needed. */
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

/** Reads a project's config.json from its directory, creating a default if missing. */
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

/** Splits a `StoredChat` into its `chat.json` (transcript) and `config.json`
 *  (session/memory) file payloads, based on the shared key lists. */
function splitChat(chat: StoredChat): {
  chatFile: Partial<StoredChat>;
  configFile: Partial<StoredChatConfig>;
} {
  const chatFile: Record<string, unknown> = {};
  const configFile: Record<string, unknown> = {};
  for (const k of CHAT_FILE_KEYS) if (k in chat) chatFile[k] = (chat as unknown as Record<string, unknown>)[k];
  for (const k of CHAT_CONFIG_KEYS) if (k in chat) configFile[k] = (chat as unknown as Record<string, unknown>)[k];
  return { chatFile: chatFile as Partial<StoredChat>, configFile: configFile as Partial<StoredChatConfig> };
}

/** Reads and deserializes a single chat into a StoredChat record, merging the
 *  separate `config.json` (model, memory/context, etc.) when present. */
function readChatRecord(
  chatJsonPath: string,
  projectName: string,
  projectKey?: string,
  configPath?: string
): StoredChat | null {
  try {
    const chat = readJson<StoredChat>(chatJsonPath);
    if (!chat) return null;
    const config = configPath ? readJson<StoredChatConfig>(configPath) : null;
    return {
      ...chat,
      ...(config || {}),
      project: projectName,
      projectStorageKey: projectKey
    };
  } catch (e) {
    console.error(`Failed to read chat JSON at ${chatJsonPath}:`, e);
    return null;
  }
}

/** Resolves a unique storage key for a project and builds its record. */
function resolveProjectKey(project: StoredProject, usedKeys: Set<string>): ProjectRecord {
  const baseKey =
    project.storageKey && isValidStorageId(project.storageKey)
      ? project.storageKey
      : normalizeStorageKey(project.storageKey || project.name);
  const storageKey = uniqueStorageKey(baseKey, usedKeys);
  return {
    ...project,
    name: project.name.trim(),
    folders: project.folders ?? [],
    allowedCommands: project.allowedCommands ?? [],
    storageKey
  };
}

/** Scans the filesystem to discover all projects and their chats. */
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
        const chat = fs.existsSync(chatJsonPath)
          ? readChatRecord(chatJsonPath, project.name, project.storageKey, getChatConfigPath(roots.userDataDir, chatFolder, project.storageKey))
          : null;
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

      const chat = readChatRecord(chatJsonPath, '', undefined, getChatConfigPath(roots.userDataDir, chatFolder));
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

/** Iterates project directories and returns the first one matching the predicate. */
function findProjectRecord(roots: ConversationRoots, matcher: (project: ProjectRecord) => boolean): ProjectRecord | null {
  if (!fs.existsSync(roots.projectsDir)) return null;
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

/** Builds unique project records from a list of projects. */
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
    const { chatFile, configFile } = splitChat(chat);
    writeJson(getChatJsonPath(userDataDir, chat.id, targetProjectKey), {
      ...chatFile,
      projectStorageKey: targetProjectKey
    });
    writeJson(getChatConfigPath(userDataDir, chat.id, targetProjectKey), {
      ...configFile,
      updatedAt: new Date().toISOString()
    });

    activeChatFolders.add(targetProjectKey ? `${targetProjectKey}/${chat.id}` : `standalone/${chat.id}`);
  }

  // Clean up stale project and chat directories no longer in the active set
  try {
    for (const folderName of fs.readdirSync(roots.projectsDir)) {
      const projectDir = getProjectDirectory(userDataDir, folderName);
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

/** Reads a single project record from disk by its storage key. */
export function readProject(userDataDir: string, projectKey: string): StoredProject | null {
  const projectDir = getProjectDirectory(userDataDir, projectKey);
  if (!fs.existsSync(projectDir) || !fs.statSync(projectDir).isDirectory()) {
    return null;
  }
  const project = readProjectRecord(projectDir, projectKey);
  return project ? { name: project.name, folders: project.folders, allowedCommands: project.allowedCommands, storageKey: project.storageKey } : null;
}

/** Saves a project config to disk, resolving a unique storage key. */
export function saveProject(userDataDir: string, project: StoredProject): StoredProject {
  const record = resolveProjectKey(project, new Set<string>());
  writeJson(getProjectConfigPath(userDataDir, record.storageKey), {
    name: record.name,
    folders: record.folders ?? [],
    allowedCommands: record.allowedCommands ?? []
  });
  return record;
}

/** Reads a single chat record from disk by ID, optionally scoped to a project. */
export function readChat(userDataDir: string, chatId: string, projectKey?: string): StoredChat | null {
  const chatJsonPath = getChatJsonPath(userDataDir, chatId, projectKey);
  if (!fs.existsSync(chatJsonPath)) return null;
  const projectName = projectKey ? readProject(userDataDir, projectKey)?.name || projectKey : '';
  return readChatRecord(chatJsonPath, projectName, projectKey);
}

/** Saves a chat record to disk, resolving its project association. The
 *  transcript goes to `chat.json`; session/memory state goes to `config.json`. */
export function saveChat(userDataDir: string, chat: StoredChat): void {
  const roots = getConversationRoots(userDataDir);
  const project =
    (chat.projectStorageKey ? findProjectRecord(roots, (item) => item.storageKey === chat.projectStorageKey) : null) ||
    (chat.project ? findProjectRecord(roots, (item) => item.name === chat.project) : null);
  const targetProjectKey = project?.storageKey;
  const chatDir = getChatDirectory(userDataDir, chat.id, targetProjectKey);
  ensureDirectory(chatDir);
  const { chatFile, configFile } = splitChat(chat);
  writeJson(getChatJsonPath(userDataDir, chat.id, targetProjectKey), {
    ...chatFile,
    projectStorageKey: targetProjectKey
  });
  writeJson(getChatConfigPath(userDataDir, chat.id, targetProjectKey), {
    ...configFile,
    updatedAt: new Date().toISOString()
  });
}

/** Deletes a project directory and all its contents from disk. */
export function deleteProject(userDataDir: string, projectKey: string): void {
  const projectDir = getProjectDirectory(userDataDir, projectKey);
  if (fs.existsSync(projectDir)) {
    fs.rmSync(projectDir, { recursive: true, force: true });
  }
}

/** Deletes a chat directory from disk, optionally scoped to a project. */
export function deleteChat(userDataDir: string, chatId: string, projectKey?: string): void {
  const chatDir = getChatDirectory(userDataDir, chatId, projectKey);
  if (fs.existsSync(chatDir)) {
    fs.rmSync(chatDir, { recursive: true, force: true });
  }
}

/** Reads a project, applies an updater function, and saves the result. */
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

/** Reads a chat, applies an updater function, and saves the result. */
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

/** Reads a chat's `config.json` (model, memory/context, etc.). */
export function readChatConfig(
  userDataDir: string,
  chatId: string,
  projectKey?: string
): StoredChatConfig | null {
  const configPath = getChatConfigPath(userDataDir, chatId, projectKey);
  if (!fs.existsSync(configPath)) return null;
  return readJson<StoredChatConfig>(configPath);
}

/** Writes a chat's `config.json`, merging with any existing config. */
export function saveChatConfig(
  userDataDir: string,
  chatId: string,
  config: StoredChatConfig,
  projectKey?: string
): StoredChatConfig {
  const existing = readChatConfig(userDataDir, chatId, projectKey) ?? {};
  const next: StoredChatConfig = { ...existing, ...config, updatedAt: new Date().toISOString() };
  const configPath = getChatConfigPath(userDataDir, chatId, projectKey);
  ensureDirectory(path.dirname(configPath));
  writeJson(configPath, next);
  return next;
}

/** Reads a chat's `config.json`, applies an updater, and saves it. */
export function updateChatConfig(
  userDataDir: string,
  chatId: string,
  updater: (config: StoredChatConfig) => StoredChatConfig,
  projectKey?: string
): StoredChatConfig | null {
  const existing = readChatConfig(userDataDir, chatId, projectKey);
  if (!existing) return null;
  const next = updater(existing);
  return saveChatConfig(userDataDir, chatId, next, projectKey);
}
