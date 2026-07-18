import { TrajectoryStep } from './pages/Workspace/TrajectoryCanvas';

/**
 * Inheritable values for the per-scope (Project / Chat) "Sandbox & Internet"
 * controls. `'inherit'` falls through to the next scope up (Chat → Project →
 * global). Only concrete values override the parent scope.
 */
export type InheritableSandbox = 'inherit' | 'sandboxed' | 'full-access';
export type InheritableApproval = 'inherit' | 'always' | 'ask' | 'never';
export type InheritableInternet = 'inherit' | 'all' | 'observation' | 'none';

/** Sandbox + internet settings attached to a Project or Chat scope. */
export interface AgentScopeSettings {
  /** Sandbox on/off. Default 'inherit' (use parent scope). */
  sandbox?: InheritableSandbox;
  /** Command-approval behavior. Default 'inherit'. */
  approval?: InheritableApproval;
  /** Internet-access level. Default 'inherit'. */
  internet?: InheritableInternet;
}

/** Persisted project record with folder paths and command permissions. */
export interface StoredProject {
  name: string;
  folders: string[];
  allowedCommands?: string[];
  /** Skills scoped to this project only (by id). */
  allowedSkills?: string[];
  /** Project-level memory surfaced to the agent for this project. */
  memory?: string;
  /** Project-level instructions prepended to agent runs in this project. */
  instructions?: string;
  /** Per-scope sandbox + internet overrides for this project. */
  settings?: AgentScopeSettings;
  storageKey?: string;
}

/** A single chat conversation with its trajectory steps and metadata. */
export interface StoredChat {
  id: string;
  title: string;
  project: string;
  model: string;
  timestamp: string;
  steps: TrajectoryStep[];
  projectStorageKey?: string;
  /** Per-scope sandbox + internet overrides for this chat (wins over project/global). */
  settings?: AgentScopeSettings;
  isRunning?: boolean;
  startedAt?: number;
  lastError?: string;
}

/** Theme preference: light, dark, or system-managed. */
export type ThemeMode = 'light' | 'dark' | 'system';
