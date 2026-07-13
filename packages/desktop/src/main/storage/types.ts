import { TrajectoryStep } from '../../renderer/components/TrajectoryCanvas';

/** Persisted AI provider configuration with API key. */
export interface StoredProvider {
  id: string;
  name: string;
  type: 'env' | 'key' | 'custom';
  apiKey: string;
  baseUrl: string;
}

/** Persisted model catalog entry with capabilities and pricing. */
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

/** Persisted project record with folder paths and allowed commands. */
export interface StoredProject {
  name: string;
  folders: string[];
  allowedCommands?: string[];
  storageKey?: string;
}

/** Persisted chat conversation with trajectory steps. */
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

/** Top-level shape of the application's persisted data. */
export interface StoreData {
  connectedProviders: StoredProvider[];
  modelsCatalog: StoredModel[];
  projects?: StoredProject[];
  chats?: StoredChat[];
}

/** Resolved directory paths for conversation storage. */
export interface ConversationRoots {
  userDataDir: string;
  baseDir: string;
  projectsDir: string;
  chatsDir: string;
}
