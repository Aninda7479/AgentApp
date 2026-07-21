import fs from 'fs';
import fsp from 'fs/promises';
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
async function ensureDirectory(dir: string): Promise<void> {
  await fsp.mkdir(dir, { recursive: true });
}

/** Reads and parses a JSON file, returning null if missing, empty, or corrupt. */
async function readJson<T>(filePath: string): Promise<T | null> {
  let raw: string;
  try {
    raw = (await fsp.readFile(filePath, 'utf-8')).trim();
  } catch {
    return null;
  }
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    // Corrupt/truncated file — fall back to the last good backup if present so
    // user conversation data is not silently lost.
    const bakPath = `${filePath}.bak`;
    try {
      const bakRaw = (await fsp.readFile(bakPath, 'utf-8')).trim();
      if (bakRaw) {
        console.warn(`Recovered ${filePath} from backup (primary file was corrupt).`);
        return JSON.parse(bakRaw) as T;
      }
    } catch {
      /* ignore backup parse failure */
    }
    console.error(`Failed to parse JSON at ${filePath}; content dropped.`);
    return null;
  }
}

/** Atomically writes JSON to disk using a temp file + backup strategy. */
async function writeJson(filePath: string, data: unknown): Promise<void> {
  await ensureDirectory(path.dirname(filePath));
  const tmpPath = `${filePath}.tmp`;
  await fsp.writeFile(tmpPath, JSON.stringify(data, null, 2), 'utf-8');
  // Keep the previous version as a .bak before replacing it.
  try {
    await fsp.copyFile(filePath, `${filePath}.bak`);
  } catch {
    // First write — no existing file to back up.
  }

  // Try atomic rename first.
  try {
    await fsp.rename(tmpPath, filePath);
  } catch {
    // Fall back to copy-and-unlink if rename fails (common on Windows if
    // destination is locked or across mount points)
    try {
      await fsp.copyFile(tmpPath, filePath);
      await fsp.unlink(tmpPath);
    } catch (copyErr) {
      console.error(`Failed to write JSON to ${filePath} via backup copy:`, copyErr);
      try { await fsp.unlink(tmpPath); } catch { /* best-effort */ }
      throw copyErr;
    }
  }
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
async function readProjectRecord(projectDir: string, folderName: string): Promise<ProjectRecord> {
  const configPath = path.join(projectDir, 'project-config.json');
  let folders: string[] = [];
  let allowedCommands: string[] = [];
  let displayName = folderName;

  try {
    const config = await readJson<{ name?: string; folders?: string[]; allowedCommands?: string[] }>(configPath);
    if (config) {
      displayName = config.name?.trim() || folderName;
      folders = config.folders ?? [];
      allowedCommands = config.allowedCommands ?? [];
    } else {
      await writeJson(configPath, { name: displayName, folders: [], allowedCommands: [] });
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
async function readChatRecord(
  chatJsonPath: string,
  projectName: string,
  projectKey?: string,
  configPath?: string
): Promise<StoredChat | null> {
  try {
    const chat = await readJson<StoredChat>(chatJsonPath);
    if (!chat) return null;
    const config = configPath ? await readJson<StoredChatConfig>(configPath) : null;
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
async function readProjectsAndChats(roots: ConversationRoots): Promise<{ projects: ProjectRecord[]; chats: StoredChat[] }> {
  const projects: ProjectRecord[] = [];
  const chats: StoredChat[] = [];
  const seenChats = new Set<string>();

  await ensureDirectory(roots.projectsDir);
  await ensureDirectory(roots.chatsDir);

  try {
    const projectFolders = await fsp.readdir(roots.projectsDir);
    for (const folderName of projectFolders) {
      const projectDir = path.join(roots.projectsDir, folderName);
      const stat = await fsp.stat(projectDir);
      if (!stat.isDirectory()) continue;

      const project = await readProjectRecord(projectDir, folderName);
      projects.push(project);

      const chatFolders = await fsp.readdir(projectDir);
      for (const chatFolder of chatFolders) {
        if (chatFolder === 'project-config.json') continue;
        const chatDir = path.join(projectDir, chatFolder);
        const chatDirStat = await fsp.stat(chatDir);
        if (!chatDirStat.isDirectory()) continue;

        const chatJsonPath = path.join(chatDir, 'chat.json');
        let chat: StoredChat | null = null;
        try {
          await fsp.access(chatJsonPath);
          chat = await readChatRecord(chatJsonPath, project.name, project.storageKey, getChatConfigPath(roots.userDataDir, chatFolder, project.storageKey));
        } catch { /* file doesn't exist */ }
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
    const standaloneFolders = await fsp.readdir(roots.chatsDir);
    for (const chatFolder of standaloneFolders) {
      const chatDir = path.join(roots.chatsDir, chatFolder);
      const stat = await fsp.stat(chatDir);
      if (!stat.isDirectory()) continue;

      const chatJsonPath = path.join(chatDir, 'chat.json');
      let exists = false;
      try { await fsp.access(chatJsonPath); exists = true; } catch { /* no */ }
      if (!exists) continue;

      const chat = await readChatRecord(chatJsonPath, '', undefined, getChatConfigPath(roots.userDataDir, chatFolder));
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
async function findProjectRecord(roots: ConversationRoots, matcher: (project: ProjectRecord) => boolean): Promise<ProjectRecord | null> {
  let exists = false;
  try { await fsp.access(roots.projectsDir); exists = true; } catch { /* no */ }
  if (!exists) return null;
  try {
    const folders = await fsp.readdir(roots.projectsDir);
    for (const folderName of folders) {
      const projectDir = path.join(roots.projectsDir, folderName);
      const stat = await fsp.stat(projectDir);
      if (!stat.isDirectory()) continue;
      const project = await readProjectRecord(projectDir, folderName);
      if (matcher(project)) {
        return project;
      }
    }
  } catch (e) {
    console.error('Failed to resolve project record:', e);
  }
  return null;
}

/** Reads the full conversation store (providers, models, projects, chats) from disk. */
export async function readConversationStore(userDataDir: string): Promise<StoreData> {
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

  const { projects, chats } = await readProjectsAndChats(roots);

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
export async function writeConversationStore(data: StoreData, userDataDir: string): Promise<void> {
  const roots = getConversationRoots(userDataDir);
  await ensureDirectory(roots.projectsDir);
  await ensureDirectory(roots.chatsDir);

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
    await ensureDirectory(projectDir);
    await writeJson(getProjectConfigPath(userDataDir, project.storageKey), {
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
    await ensureDirectory(targetChatDir);
    const { chatFile, configFile } = splitChat(chat);
    await writeJson(getChatJsonPath(userDataDir, chat.id, targetProjectKey), {
      ...chatFile,
      projectStorageKey: targetProjectKey
    });
    await writeJson(getChatConfigPath(userDataDir, chat.id, targetProjectKey), {
      ...configFile,
      updatedAt: new Date().toISOString()
    });

    activeChatFolders.add(targetProjectKey ? `${targetProjectKey}/${chat.id}` : `standalone/${chat.id}`);
  }

  // Clean up stale project and chat directories no longer in the active set
  try {
    const projectFolders = await fsp.readdir(roots.projectsDir);
    for (const folderName of projectFolders) {
      const projectDir = getProjectDirectory(userDataDir, folderName);
      if (!activeProjectKeys.has(folderName)) {
        await fsp.rm(projectDir, { recursive: true, force: true });
        continue;
      }

      const chatFolders = await fsp.readdir(projectDir);
      for (const chatFolder of chatFolders) {
        if (chatFolder === 'project-config.json') continue;
        const chatDir = path.join(projectDir, chatFolder);
        const stat = await fsp.stat(chatDir);
        if (!stat.isDirectory()) continue;
        if (!activeChatFolders.has(`${folderName}/${chatFolder}`)) {
          await fsp.rm(chatDir, { recursive: true, force: true });
        }
      }
    }
  } catch (e) {
    console.error('Error cleaning project directories:', e);
  }

  try {
    const standaloneFolders = await fsp.readdir(roots.chatsDir);
    for (const chatFolder of standaloneFolders) {
      const chatDir = path.join(roots.chatsDir, chatFolder);
      const stat = await fsp.stat(chatDir);
      if (!stat.isDirectory()) continue;
      if (!activeChatFolders.has(`standalone/${chatFolder}`)) {
        await fsp.rm(chatDir, { recursive: true, force: true });
      }
    }
  } catch (e) {
    console.error('Error cleaning standalone chat directories:', e);
  }
}

/** Reads a single project record from disk by its storage key. */
export async function readProject(userDataDir: string, projectKey: string): Promise<StoredProject | null> {
  const projectDir = getProjectDirectory(userDataDir, projectKey);
  try {
    const stat = await fsp.stat(projectDir);
    if (!stat.isDirectory()) return null;
  } catch {
    return null;
  }
  const project = await readProjectRecord(projectDir, projectKey);
  return { name: project.name, folders: project.folders, allowedCommands: project.allowedCommands, storageKey: project.storageKey };
}

/** Saves a project config to disk, resolving a unique storage key. */
export async function saveProject(userDataDir: string, project: StoredProject): Promise<StoredProject> {
  const record = resolveProjectKey(project, new Set<string>());
  await writeJson(getProjectConfigPath(userDataDir, record.storageKey), {
    name: record.name,
    folders: record.folders ?? [],
    allowedCommands: record.allowedCommands ?? []
  });
  return record;
}

/** Reads a single chat record from disk by ID, optionally scoped to a project. */
export async function readChat(userDataDir: string, chatId: string, projectKey?: string): Promise<StoredChat | null> {
  const chatJsonPath = getChatJsonPath(userDataDir, chatId, projectKey);
  let exists = false;
  try { await fsp.access(chatJsonPath); exists = true; } catch { /* no */ }
  if (!exists) return null;
  const projectName = projectKey ? (await readProject(userDataDir, projectKey))?.name || projectKey : '';
  return readChatRecord(chatJsonPath, projectName, projectKey);
}

/** Saves a chat record to disk, resolving its project association. The
 *  transcript goes to `chat.json`; session/memory state goes to `config.json`. */
export async function saveChat(userDataDir: string, chat: StoredChat): Promise<void> {
  const roots = getConversationRoots(userDataDir);
  const project =
    (chat.projectStorageKey ? await findProjectRecord(roots, (item) => item.storageKey === chat.projectStorageKey) : null) ||
    (chat.project ? await findProjectRecord(roots, (item) => item.name === chat.project) : null);
  const targetProjectKey = project?.storageKey;
  const chatDir = getChatDirectory(userDataDir, chat.id, targetProjectKey);
  await ensureDirectory(chatDir);
  const { chatFile, configFile } = splitChat(chat);
  await writeJson(getChatJsonPath(userDataDir, chat.id, targetProjectKey), {
    ...chatFile,
    projectStorageKey: targetProjectKey
  });
  await writeJson(getChatConfigPath(userDataDir, chat.id, targetProjectKey), {
    ...configFile,
    updatedAt: new Date().toISOString()
  });
}

/** Deletes a project directory and all its contents from disk. */
export async function deleteProject(userDataDir: string, projectKey: string): Promise<void> {
  const projectDir = getProjectDirectory(userDataDir, projectKey);
  try {
    await fsp.rm(projectDir, { recursive: true, force: true });
  } catch { /* already gone */ }
}

/** Deletes a chat directory from disk, optionally scoped to a project. */
export async function deleteChat(userDataDir: string, chatId: string, projectKey?: string): Promise<void> {
  const chatDir = getChatDirectory(userDataDir, chatId, projectKey);
  try {
    await fsp.rm(chatDir, { recursive: true, force: true });
  } catch { /* already gone */ }
}

/** Reads a project, applies an updater function, and saves the result. */
export async function updateProject(
  userDataDir: string,
  projectKey: string,
  updater: (project: StoredProject) => StoredProject
): Promise<StoredProject | null> {
  const existing = await readProject(userDataDir, projectKey);
  if (!existing) return null;
  const next = updater(existing);
  await saveProject(userDataDir, { ...next, storageKey: existing.storageKey });
  return { ...next, storageKey: existing.storageKey };
}

/** Reads a chat, applies an updater function, and saves the result. */
export async function updateChat(
  userDataDir: string,
  chatId: string,
  updater: (chat: StoredChat) => StoredChat,
  projectKey?: string
): Promise<StoredChat | null> {
  const existing = await readChat(userDataDir, chatId, projectKey);
  if (!existing) return null;
  const next = updater(existing);
  await saveChat(userDataDir, { ...next, projectStorageKey: existing.projectStorageKey });
  return { ...next, projectStorageKey: existing.projectStorageKey };
}

/** Reads a chat's `config.json` (model, memory/context, etc.). */
export async function readChatConfig(
  userDataDir: string,
  chatId: string,
  projectKey?: string
): Promise<StoredChatConfig | null> {
  const configPath = getChatConfigPath(userDataDir, chatId, projectKey);
  return readJson<StoredChatConfig>(configPath);
}

/** Writes a chat's `config.json`, merging with any existing config. */
export async function saveChatConfig(
  userDataDir: string,
  chatId: string,
  config: StoredChatConfig,
  projectKey?: string
): Promise<StoredChatConfig> {
  const existing = (await readChatConfig(userDataDir, chatId, projectKey)) ?? {};
  const next: StoredChatConfig = { ...existing, ...config, updatedAt: new Date().toISOString() };
  const configPath = getChatConfigPath(userDataDir, chatId, projectKey);
  await ensureDirectory(path.dirname(configPath));
  await writeJson(configPath, next);
  return next;
}

/** Reads a chat's `config.json`, applies an updater, and saves it. */
export async function updateChatConfig(
  userDataDir: string,
  chatId: string,
  updater: (config: StoredChatConfig) => StoredChatConfig,
  projectKey?: string
): Promise<StoredChatConfig | null> {
  const existing = await readChatConfig(userDataDir, chatId, projectKey);
  if (!existing) return null;
  const next = updater(existing);
  return saveChatConfig(userDataDir, chatId, next, projectKey);
}
