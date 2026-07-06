export interface TrajectoryStep {
  id: string;
  type: 'user' | 'assistant' | 'tool_call' | 'tool_result' | 'thought';
  content: string;
  timestamp?: string;
  status?: 'pending' | 'running' | 'success' | 'error';
  toolName?: string;
  metadata?: {
    filename?: string;
    originalCode?: string;
    modifiedCode?: string;
    mediaType?: 'image' | 'pdf' | 'ppt' | 'audio';
    addedLines?: number;
    removedLines?: number;
    filesExplored?: number;
    foldersExplored?: number;
    workedDuration?: string;
    [key: string]: any;
  };
}

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
  allowedCommands?: string[];
  storageKey?: string;
}

export interface StoredChat {
  id: string;
  title: string;
  project: string;
  model: string;
  timestamp: string;
  steps: TrajectoryStep[];
  projectStorageKey?: string;
  isRunning?: boolean;
  startedAt?: number;
  lastError?: string;
}

export interface StoreData {
  connectedProviders: StoredProvider[];
  modelsCatalog: StoredModel[];
  projects?: StoredProject[];
  chats?: StoredChat[];
}

export interface ConversationRoots {
  userDataDir: string;
  baseDir: string;
  projectsDir: string;
  chatsDir: string;
}
