/**
 * Persistent store for SuperAgent Desktop.
 * Organizes files dynamically under:
 * - AppData/Roaming/OpenSource/AgentApp/Conversation/Projects/ProjectName/ChatName
 * - AppData/Roaming/OpenSource/AgentApp/Conversation/Chats/ChatName
 */
import fs from 'fs';
import path from 'path';
import { app } from 'electron';

export interface StoredProvider {
  id: string;
  name: string;
  type: 'env' | 'key' | 'custom';
  apiKey: string;
  baseUrl: string;
}

export interface StoredModel {
  id: string;
  name: string;
  providerId: string;
  enabled: boolean;
  description?: string;
  contextLimit?: string;
  outputLimit?: string;
  inputModalities?: string[];
  outputModalities?: string[];
  pricing?: { inputPer1M?: string; outputPer1M?: string; cachedInputPer1M?: string };
  caching?: boolean;
  type?: string;
}

export interface StoredProject {
  name: string;
  folders: string[];
  allowedCommands?: string[]; // Terminal commands allowed without permission
}

export interface StoredChat {
  id: string;
  title: string;
  project: string; // empty/null for standalone
  model: string;
  timestamp: string;
  steps: any[];
}

export interface StoreData {
  connectedProviders: StoredProvider[];
  modelsCatalog: StoredModel[];
  projects?: StoredProject[];
  chats?: StoredChat[];
}

const EMPTY_STORE: StoreData = {
  connectedProviders: [],
  modelsCatalog: [],
  projects: [],
  chats: []
};

// Returns the path to the legacy providers configuration file
function getProvidersFilePath(): string {
  return path.join(app.getPath('userData'), 'providers-store.json');
}

// Helper to get base conversation paths
function getConversationPaths() {
  const base = path.join(app.getPath('userData'), 'Conversation');
  return {
    projectsDir: path.join(base, 'Projects'),
    chatsDir: path.join(base, 'Chats')
  };
}

export function readStore(): StoreData {
  const providersPath = getProvidersFilePath();
  const { projectsDir, chatsDir } = getConversationPaths();

  let providers: StoredProvider[] = [];
  let models: StoredModel[] = [];

  // 1. Read provider connections and model catalog from providers-store.json
  try {
    if (fs.existsSync(providersPath)) {
      const raw = fs.readFileSync(providersPath, 'utf-8');
      const parsed = JSON.parse(raw);
      providers = parsed.connectedProviders ?? [];
      models = parsed.modelsCatalog ?? [];
    }
  } catch (e) {
    console.error('Failed to read providers-store.json:', e);
  }

  const projects: StoredProject[] = [];
  const chats: StoredChat[] = [];

  // Ensure directories exist
  fs.mkdirSync(projectsDir, { recursive: true });
  fs.mkdirSync(chatsDir, { recursive: true });

  // 2. Read Projects and their chats
  try {
    const projectFolders = fs.readdirSync(projectsDir);
    for (const projName of projectFolders) {
      const projPath = path.join(projectsDir, projName);
      if (!fs.statSync(projPath).isDirectory()) continue;

      // Read project configuration file (e.g. project-config.json)
      const configPath = path.join(projPath, 'project-config.json');
      let folders: string[] = [];
      let allowedCommands: string[] = [];

      if (fs.existsSync(configPath)) {
        try {
          const configRaw = fs.readFileSync(configPath, 'utf-8');
          const config = JSON.parse(configRaw);
          folders = config.folders ?? [];
          allowedCommands = config.allowedCommands ?? [];
        } catch (e) {
          console.error(`Failed to read project config for ${projName}:`, e);
        }
      } else {
        // Create default config file if not existing
        const defaultConfig = { folders: [], allowedCommands: [] };
        fs.writeFileSync(configPath, JSON.stringify(defaultConfig, null, 2), 'utf-8');
      }

      projects.push({
        name: projName,
        folders,
        allowedCommands
      });

      // Scan chats under this project folder
      const chatFolders = fs.readdirSync(projPath);
      for (const chatFolder of chatFolders) {
        const chatPath = path.join(projPath, chatFolder);
        if (chatFolder === 'project-config.json' || !fs.statSync(chatPath).isDirectory()) continue;

        const chatJsonPath = path.join(chatPath, 'chat.json');
        if (fs.existsSync(chatJsonPath)) {
          try {
            const chatRaw = fs.readFileSync(chatJsonPath, 'utf-8');
            const chatObj = JSON.parse(chatRaw) as StoredChat;
            // Force the correct project name scope just in case
            chatObj.project = projName;
            chats.push(chatObj);
          } catch (e) {
            console.error(`Failed to read chat JSON under ${projName}/${chatFolder}:`, e);
          }
        }
      }
    }
  } catch (e) {
    console.error('Failed to read projects from directory:', e);
  }

  // 3. Read Standalone Chats
  try {
    const standaloneChatFolders = fs.readdirSync(chatsDir);
    for (const chatFolder of standaloneChatFolders) {
      const chatPath = path.join(chatsDir, chatFolder);
      if (!fs.statSync(chatPath).isDirectory()) continue;

      const chatJsonPath = path.join(chatPath, 'chat.json');
      if (fs.existsSync(chatJsonPath)) {
        try {
          const chatRaw = fs.readFileSync(chatJsonPath, 'utf-8');
          const chatObj = JSON.parse(chatRaw) as StoredChat;
          chatObj.project = ''; // Standalone chat
          chats.push(chatObj);
        } catch (e) {
          console.error(`Failed to read standalone chat JSON under ${chatFolder}:`, e);
        }
      }
    }
  } catch (e) {
    console.error('Failed to read standalone chats from directory:', e);
  }

  return {
    connectedProviders: providers,
    modelsCatalog: models,
    projects,
    chats
  };
}

export function writeStore(data: StoreData): void {
  const providersPath = getProvidersFilePath();
  const { projectsDir, chatsDir } = getConversationPaths();

  // 1. Write provider connections and model catalog to providers-store.json
  try {
    fs.mkdirSync(path.dirname(providersPath), { recursive: true });
    const providersJson = {
      connectedProviders: data.connectedProviders,
      modelsCatalog: data.modelsCatalog
    };
    fs.writeFileSync(providersPath, JSON.stringify(providersJson, null, 2), 'utf-8');
  } catch (e) {
    console.error('Failed to write providers-store.json:', e);
  }

  // Keep track of active directories to delete stale ones
  const activeProjectFolders = new Set<string>();
  const activeChatFolders = new Set<string>(); // Format: "project/chat" or "standalone/chat"

  // 2. Write projects
  const projectsList = data.projects ?? [];
  for (const proj of projectsList) {
    const projPath = path.join(projectsDir, proj.name);
    activeProjectFolders.add(proj.name);

    fs.mkdirSync(projPath, { recursive: true });
    const configPath = path.join(projPath, 'project-config.json');
    const configData = {
      folders: proj.folders ?? [],
      allowedCommands: proj.allowedCommands ?? []
    };
    fs.writeFileSync(configPath, JSON.stringify(configData, null, 2), 'utf-8');
  }

  // 3. Write chats
  const chatsList = data.chats ?? [];
  for (const chat of chatsList) {
    let targetChatDir = '';
    if (chat.project && activeProjectFolders.has(chat.project)) {
      targetChatDir = path.join(projectsDir, chat.project, chat.id);
      activeChatFolders.add(`${chat.project}/${chat.id}`);
    } else {
      targetChatDir = path.join(chatsDir, chat.id);
      activeChatFolders.add(`standalone/${chat.id}`);
    }

    fs.mkdirSync(targetChatDir, { recursive: true });
    const chatJsonPath = path.join(targetChatDir, 'chat.json');
    fs.writeFileSync(chatJsonPath, JSON.stringify(chat, null, 2), 'utf-8');
  }

  // 4. Delete stale project folders
  try {
    if (fs.existsSync(projectsDir)) {
      const projectFolders = fs.readdirSync(projectsDir);
      for (const projFolder of projectFolders) {
        const fullProjPath = path.join(projectsDir, projFolder);
        if (!fs.statSync(fullProjPath).isDirectory()) continue;

        if (!activeProjectFolders.has(projFolder)) {
          // Remove deleted project folder
          fs.rmSync(fullProjPath, { recursive: true, force: true });
        } else {
          // Clean deleted chats inside active project
          const chatFolders = fs.readdirSync(fullProjPath);
          for (const chatFolder of chatFolders) {
            if (chatFolder === 'project-config.json') continue;
            const fullChatPath = path.join(fullProjPath, chatFolder);
            if (!fs.statSync(fullChatPath).isDirectory()) continue;

            if (!activeChatFolders.has(`${projFolder}/${chatFolder}`)) {
              fs.rmSync(fullChatPath, { recursive: true, force: true });
            }
          }
        }
      }
    }
  } catch (e) {
    console.error('Error cleaning project directories:', e);
  }

  // 5. Delete stale standalone chat folders
  try {
    if (fs.existsSync(chatsDir)) {
      const standaloneChatFolders = fs.readdirSync(chatsDir);
      for (const chatFolder of standaloneChatFolders) {
        const fullChatPath = path.join(chatsDir, chatFolder);
        if (!fs.statSync(fullChatPath).isDirectory()) continue;

        if (!activeChatFolders.has(`standalone/${chatFolder}`)) {
          fs.rmSync(fullChatPath, { recursive: true, force: true });
        }
      }
    }
  } catch (e) {
    console.error('Error cleaning standalone chat directories:', e);
  }
}
