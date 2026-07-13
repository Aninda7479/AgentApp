import { TrajectoryStep } from './components/TrajectoryCanvas';

/** Persisted project record with folder paths and command permissions. */
export interface StoredProject {
  name: string;
  folders: string[];
  allowedCommands?: string[];
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
