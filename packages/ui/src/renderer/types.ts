import { TrajectoryStep } from './pages/Workspace/TrajectoryCanvas';

/**
 * Inheritable values for the per-scope (Project / Chat) "Sandbox & Internet"
 * controls. `'inherit'` falls through to the next scope up (Chat → Project →
 * global). Only concrete values override the parent scope.
 */
export type InheritableSandbox = 'inherit' | 'sandboxed' | 'full-access';
export type InheritableApproval = 'inherit' | 'always' | 'ask' | 'never';
export type InheritableInternet = 'inherit' | 'all' | 'observation' | 'none';

/**
 * Per-standalone-chat configuration (project-less chats). Mirrors the
 * project-scope fields on {@link StoredProject}, but scoped to a single chat so
 * each standalone chat carries its own permissions/skills/memory/instructions
 * instead of a single cumulative config shared by all standalone chats.
 */
export interface StandaloneChatConfig {
  /** Pre-approved shell commands for this chat. */
  allowedCommands: string[];
  /** Chat-only skills enabled for this chat (by id). */
  allowedSkills: string[];
  /** Memory surfaced to the agent for this chat. */
  memory: string;
  /** Standing instructions prepended to this chat's runs. */
  instructions: string;
}

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
  /**
   * Per-chat config for standalone (project-less) chats: permissions, chat-only
   * skills, memory, and instructions. Undefined for project-nested chats.
   */
  standaloneConfig?: StandaloneChatConfig;
  isRunning?: boolean;
  startedAt?: number;
  lastError?: string;
  /** Number of prompts queued behind the in-flight run for this chat (drained
   *  automatically when the current response ends). Drives the sidebar badge. */
  queuedCount?: number;
}

/** Theme preference: light, dark, or system-managed. */
export type ThemeMode = 'light' | 'dark' | 'system';
