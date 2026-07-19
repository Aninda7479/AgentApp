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

/** A persisted chat conversation with its trajectory steps and metadata.
 *  This is the merged view returned to callers: transcript fields (`chat.json`)
 *  plus session/memory fields (`config.json`). On disk those live in two files;
 *  `readChat` / `saveChat` split and merge them transparently. */
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
  /** Session/memory fields persisted in `config.json` (see `StoredChatConfig`). */
  provider?: string;
  baseUrl?: string;
  contextWindow?: number;
  memory?: string;
  contextSummary?: string;
}

/**
 * Per-chat configuration persisted separately from the chat transcript
 * (`chat.json`). Keeps session/memory state — last-used model, provider,
 * context window, and the agent's working memory/context — out of the
 * message-only `chat.json` so the transcript stays pure conversation data.
 */
export interface StoredChatConfig {
  /** Last-used model for this chat. */
  model?: string;
  /** Last-used provider for this chat. */
  provider?: string;
  /** Last-used base URL (for custom/self-hosted providers). */
  baseUrl?: string;
  /** Context-window size (tokens) of the last-used model. */
  contextWindow?: number;
  /**
   * Persisted agent memory / context for this chat — e.g. a condensed summary
   * of prior turns, user preferences, or project facts the agent should
   * remember across sessions.
   */
  memory?: string;
  /** The most recent compacted context summary, for fast resume without
   *  replaying the whole transcript. */
  contextSummary?: string;
  /** ISO timestamp of the last config update. */
  updatedAt?: string;
}

/** Keys that belong in `chat.json` (transcript / conversation-only data). */
export const CHAT_FILE_KEYS = [
  'id',
  'title',
  'project',
  'timestamp',
  'steps',
  'projectStorageKey',
  'isRunning',
  'startedAt',
  'lastError'
] as const;

/** Keys that belong in `config.json` (session / memory state). */
export const CHAT_CONFIG_KEYS = [
  'model',
  'provider',
  'baseUrl',
  'contextWindow',
  'memory',
  'contextSummary',
  'updatedAt'
] as const;

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
