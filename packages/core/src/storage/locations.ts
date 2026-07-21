import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

/**
 * Single source of truth for where the app stores all user data.
 *
 * Every platform resolves to `<home>/.superagent` (lowercase, identical casing on
 * Windows / macOS / Linux). Each subfolder name lives in {@link STORAGE_DIRS} so the
 * names are defined exactly once and imported everywhere else.
 */
export const APP_DIR_NAME = '.superagent';

/** Storage subfolder names — the single authority. Change a path here only. */
export const STORAGE_DIRS = {
  config: 'config',
  partners: 'partners',
  conversation: 'conversation',
  models: 'models',
  tasks: 'tasks',
  skills: 'skills',
  plugins: 'plugins',
  connectors: 'connectors',
  logs: 'logs',
  threeD: '3d-studio'
} as const;

/** Returns the OS-agnostic base data directory: `<home>/.superagent`. */
export function getUserDataDirectory(): string {
  if (process.env.VITEST) {
    const workerId = process.env.VITEST_WORKER_ID || '1';
    return path.join(process.cwd(), 'tmp', `test_tmp_settings_dir_${workerId}`);
  }

  return path.join(os.homedir(), APP_DIR_NAME);
}

/** Returns the global base path (`~/.superagent`). */
export function getGlobalBasePath(): string {
  return getUserDataDirectory();
}

/** Returns the project-local base path (`<projectRoot>/.superagent`). */
export function getLocalBasePath(projectRoot: string): string {
  return path.join(projectRoot, APP_DIR_NAME);
}

/** Creates all global storage directories if they don't already exist. */
export function initializeDirectories(): void {
  const base = getGlobalBasePath();
  for (const dir of Object.values(STORAGE_DIRS)) {
    const full = path.join(base, dir);
    if (!fs.existsSync(full)) fs.mkdirSync(full, { recursive: true });
  }
}

/** Returns the config directory (`~/.superagent/config`), creating it if needed. */
export function getConfigDirectory(base: string = getUserDataDirectory()): string {
  const configDirectory = path.join(base, STORAGE_DIRS.config);
  if (!fs.existsSync(configDirectory)) {
    fs.mkdirSync(configDirectory, { recursive: true });
  }
  return configDirectory;
}

/** Returns the partners directory (`~/.superagent/partners`). */
export function getPartnersDirectory(base: string = getUserDataDirectory()): string {
  return path.join(base, STORAGE_DIRS.partners);
}

/** Returns the conversation directory (`~/.superagent/conversation`). */
export function getConversationDirectory(base: string = getUserDataDirectory()): string {
  return path.join(base, STORAGE_DIRS.conversation);
}

/** Returns the logs directory (`~/.superagent/logs`). */
export function getLogsDirectory(base: string = getUserDataDirectory()): string {
  return path.join(base, STORAGE_DIRS.logs);
}

/**
 * Project-local data directory: `<projectRoot>/.superagent`.
 *
 * Mirrors the global `~/.superagent` but scoped to a single project, so each
 * project can carry its own skills, loop instructions, and context without
 * touching the user-global store.
 */
export function getProjectDataDirectory(projectRoot: string): string {
  return path.join(projectRoot, APP_DIR_NAME);
}

/** Project-local skills directory: `<projectRoot>/.superagent/skills`. */
export function getProjectSkillsDirectory(projectRoot: string): string {
  return path.join(projectRoot, APP_DIR_NAME, STORAGE_DIRS.skills);
}
