import { TrajectoryStep } from './components/TrajectoryCanvas';

export interface StoredProject {
  name: string;
  folders: string[];
  allowedCommands?: string[];
}

export interface StoredChat {
  id: string;
  title: string;
  project: string;
  model: string;
  timestamp: string;
  steps: TrajectoryStep[];
}

export type ThemeMode = 'light' | 'dark';
