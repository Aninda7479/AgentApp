/** A single step in a conversation trajectory (user message, assistant reply, tool call, etc.). */
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

/** A configured AI provider with API credentials. */
export interface StoredProvider {
  id: string;
  name: string;
  type: 'env' | 'key' | 'custom';
  apiKey: string;
  baseUrl: string;
}

/** An AI model entry in the models catalog. */
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

/** A user-defined project with associated folders and allowed commands. */
export interface StoredProject {
  name: string;
  folders: string[];
  allowedCommands?: string[];
  storageKey?: string;
}

/** A persisted chat conversation with its trajectory steps and metadata. */
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

/** Top-level shape of all persisted conversation store data. */
export interface StoreData {
  connectedProviders: StoredProvider[];
  modelsCatalog: StoredModel[];
  projects?: StoredProject[];
  chats?: StoredChat[];
}

/** Root directory paths for the conversation storage filesystem layout. */
export interface ConversationRoots {
  userDataDir: string;
  baseDir: string;
  projectsDir: string;
  chatsDir: string;
}
