import type { StoredProject } from '../types';
import { FormatService } from './format';

/**
 * Backend / Electron boundary helpers for project (folder) selection and
 * project-object construction. Kept in the logic layer so the project
 * modals (`CreateProjectModal`, `ConfigureProjectModal`) stay thin design
 * shells that only wire the results into local state.
 */
export class ProjectService {
  /**
   * Opens the native folder picker through the `select-project-folders` IPC
   * channel. Returns the chosen absolute paths, or `null` when running
   * outside the Electron shell (so callers can fall back to mock data).
   * An empty array means the picker opened but the user cancelled.
   */
  static async selectProjectFolders(): Promise<string[] | null> {
    const ipc = typeof window !== 'undefined' && (window as any).require
      ? (window as any).require('electron').ipcRenderer
      : null;
    if (!ipc) return null;
    try {
      const selected: string[] = await ipc.invoke('select-project-folders');
      return selected || [];
    } catch (e) {
      console.error('Failed to select folders', e);
      return [];
    }
  }

  /**
   * Merges freshly picked folder paths into an existing list, dropping
   * duplicates so the same folder cannot be added twice.
   */
  static mergeFolders(existing: string[], selected: string[]): string[] {
    const next = [...existing];
    selected.forEach(p => {
      if (!next.includes(p)) next.push(p);
    });
    return next;
  }

  /**
   * Derives a sensible default project name from a folder path by taking
   * its final path segment (e.g. `C:/work/MySite` → `MySite`).
   */
  static deriveNameFromPath(path: string): string {
    const normalized = path.replace(/\\/g, '/');
    const parts = normalized.split('/');
    return parts[parts.length - 1] || 'New Project';
  }

  /**
   * Builds a validated `StoredProject` from a name + folder list, trimming
   * the name. The caller is responsible for pre-checking that the name is
   * non-blank and at least one folder exists.
   */
  static buildProject(name: string, folders: string[]): StoredProject {
    // Assign a random storage ID so the project folder never collides on disk.
    return { name: name.trim(), folders, storageKey: FormatService.generateStorageId() };
  }
}
