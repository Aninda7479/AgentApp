import { TrajectoryStep } from './components/TrajectoryCanvas';

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
}

export type ThemeMode = 'light' | 'dark' | 'system';
