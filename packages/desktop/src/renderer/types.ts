import { TrajectoryStep } from './pages/Workspace/TrajectoryCanvas';

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
  isRunning?: boolean;
  startedAt?: number;
  lastError?: string;
}

/** Theme preference: light, dark, or system-managed. */
export type ThemeMode = 'light' | 'dark' | 'system';
