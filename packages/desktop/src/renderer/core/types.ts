/**
 * Core Domain Types & Interfaces for SuperAgent Desktop Renderer
 * Single source of truth. Strictly typed without 'any'.
 */

export type InheritableSandbox = 'inherit' | 'sandboxed' | 'full-access';
export type InheritableApproval = 'inherit' | 'always' | 'ask' | 'never';
export type InheritableInternet = 'inherit' | 'all' | 'observation' | 'none';
export type ThemeMode = 'light' | 'dark' | 'system';

export interface PartnerController {
  activeId: string | null;
  importModel: (id: string, path: string) => Promise<unknown>;
  setActive: (id: string) => void;
  startPet: () => Promise<void>;
}

export interface NavigationSnapshot {
  activeTab: string;
  settingsCategory: string;
  activeProject: string;
  activeChatId: string | null;
  activeDiff: { filename: string; originalCode: string; modifiedCode: string } | null;
}

export interface UpdateStatus {
  status: 'checking' | 'available' | 'not-available' | 'unsupported' | 'error';
  version?: string;
  message?: string;
}

export interface AppContext {
  ipc: unknown;
  getProjects(): StoredProject[];
  getChats(): StoredChat[];
  getConnectedProviders(): ProviderConnection[];
  getModelsCatalog(): ModelConfig[];
  getMcpServers(): MCPServerInfo[];
  getActiveChatId(): string | null;
  getActiveProject(): string;
  getDraftProject(): string;
  getInternetAccessLevel(): InheritableInternet;
  getFullAccess(): boolean;
  getDefaultPermissions(): boolean;
  getThemeMode(): ThemeMode;
  getComposerAttachments(): ComposerAttachment[];
  getTrajectorySteps(): TrajectoryStep[];
  getLastUsedModel(): string;
  [key: string]: unknown;
}

export interface StandaloneChatConfig {
  allowedCommands: string[];
  allowedSkills: string[];
  memory: string;
  instructions: string;
}

export interface AgentScopeSettings {
  sandbox?: InheritableSandbox;
  approval?: InheritableApproval;
  internet?: InheritableInternet;
}

export interface StoredProject {
  name: string;
  folders: string[];
  allowedCommands?: string[];
  allowedSkills?: string[];
  memory?: string;
  instructions?: string;
  settings?: AgentScopeSettings;
  storageKey?: string;
}

export interface TrajectoryStepMetadata {
  filename?: string;
  originalCode?: string;
  modifiedCode?: string;
  mediaType?: 'image' | 'pdf' | 'ppt' | 'audio';
  mediaPath?: string;
  addedLines?: number;
  removedLines?: number;
  filesExplored?: number;
  foldersExplored?: number;
  workedDuration?: string;
  regenerationSeq?: number;
  [key: string]: unknown;
}

export interface TrajectoryStep {
  id: string;
  type: 'user' | 'assistant' | 'tool_call' | 'tool_result' | 'thought';
  content: string;
  timestamp?: string;
  status?: 'pending' | 'running' | 'success' | 'error';
  toolName?: string;
  metadata?: TrajectoryStepMetadata;
}

export interface StoredChat {
  id: string;
  title: string;
  project: string;
  model: string;
  timestamp: string;
  steps: TrajectoryStep[];
  projectStorageKey?: string;
  settings?: AgentScopeSettings;
  standaloneConfig?: StandaloneChatConfig;
  isRunning?: boolean;
  startedAt?: number;
  lastError?: string;
  queuedCount?: number;
}

export interface ProviderConnection {
  id: string;
  name: string;
  type: 'env' | 'key' | 'custom';
  apiKey?: string;
  baseUrl?: string;
  organizationId?: string;
  enabledModels?: string[];
}

export interface ModelConfig {
  id: string;
  name: string;
  providerId: string;
  enabled: boolean;
  contextLimit?: string;
  isFree?: boolean;
  description?: string;
  inputModalities?: string[];
  outputModalities?: string[];
}

export interface MCPServerInfo {
  id: string;
  name: string;
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  status: 'connected' | 'connecting' | 'disconnected' | 'error';
  toolsCount?: number;
  errorMessage?: string;
  transport?: 'stdio' | 'sse';
  commandOrUrl?: string;
  enabled?: boolean;
}

export interface ComposerOptions {
  model?: string;
  mode?: string;
  attachments?: string[];
  approvalMode?: 'always' | 'ask' | 'never';
  sandbox?: boolean;
}

export interface ComposerAttachment {
  filename: string;
  sourcePath?: string;
  buffer?: number[];
  fullPath?: string;
}

export interface AgentEventContextUsage {
  used: number;
  limit: number;
  pct: number;
}

export interface AgentEvent {
  type: 'start_turn' | 'token' | 'replace_tokens' | 'tool_call' | 'tool_result' | 'thought' | 'done' | 'error' | 'abort' | 'chat-name' | 'context';
  sessionId: string;
  content?: string;
  toolName?: string;
  toolArgs?: Record<string, unknown>;
  toolResult?: string;
  error?: string;
  chatName?: string;
  context?: AgentEventContextUsage;
}

export interface QueuedRunItem {
  chatId: string;
  prompt: string;
  options: ComposerOptions;
  attachments: ComposerAttachment[];
}

export interface ContextUsage {
  used: number;
  limit: number;
  pct: number;
}
