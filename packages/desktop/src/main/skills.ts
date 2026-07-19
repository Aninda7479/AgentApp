import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { app } from 'electron';
import { SkillStore, SkillDefinition, STORAGE_DIRS, getUserDataDirectory } from '@superagent/core';

/** A skill discovered from a `skills/` directory, ready for the renderer. */
export interface DiscoveredSkill {
  id: string;
  name: string;
  description: string;
  instructions: string;
}

/** Where a skill will be imported: global → `~/.superagent/skills`, project → `<root>/.superagent/skills`. */
export type SkillScope = 'global' | 'project';

/** A skill found in a source dir that is not yet present in its destination. */
export interface ImportableSkill {
  id: string;
  name: string;
  description: string;
  /** Absolute path to the skill folder (the dir containing SKILL.md). */
  sourcePath: string;
  /** Skill subfolder name (basename of `sourcePath`). */
  folderName: string;
  /** Destination scope — global sources copy to `~/.superagent/skills`, project sources to `<root>/.superagent/skills`. */
  scope: SkillScope;
}

/** Injectable base dirs so tests can use temp locations instead of the real home. */
export interface SkillPaths {
  home: string;
  appData: string;
}

function resolvePaths(opts?: Partial<SkillPaths>): SkillPaths {
  return {
    home: opts?.home ?? os.homedir(),
    appData: opts?.appData ?? getUserDataDirectory()
  };
}

/** The app's global skills folder: `~/.superagent/skills`. */
export function getGlobalSkillsDir(opts?: Partial<SkillPaths>): string {
  return path.join(resolvePaths(opts).appData, STORAGE_DIRS.skills);
}

/**
 * Candidate source `skills/` dirs to scan, each tagged with the scope of the
 * destination it would import into.
 *
 * - Global (always): `~/.claude/skills`, `~/.agents/skills` → `~/.superagent/skills`.
 * - Project (only when `projectRoot` is given): `<root>/.cloud|/.agents|/.claude/skills`
 *   → `<root>/.superagent/skills`.
 *
 * Missing directories are skipped.
 */
export function candidateSources(
  projectRoot?: string,
  opts?: Partial<SkillPaths>
): { dir: string; scope: SkillScope }[] {
  const { home } = resolvePaths(opts);
  const sources: { dir: string; scope: SkillScope }[] = [
    { dir: path.join(home, '.claude', 'skills'), scope: 'global' },
    { dir: path.join(home, '.agents', 'skills'), scope: 'global' }
  ];
  if (projectRoot) {
    sources.push(
      { dir: path.join(projectRoot, '.cloud', 'skills'), scope: 'project' },
      { dir: path.join(projectRoot, '.agents', 'skills'), scope: 'project' },
      { dir: path.join(projectRoot, '.claude', 'skills'), scope: 'project' }
    );
  }
  return sources.filter((s) => fs.existsSync(s.dir));
}

/** Destination folder for a given scope. */
export function destinationForScope(
  scope: SkillScope,
  projectRoot?: string,
  opts?: Partial<SkillPaths>
): string {
  return scope === 'global'
    ? getGlobalSkillsDir(opts)
    : path.join(projectRoot as string, '.superagent', 'skills');
}

/** Set of skill ids already present in `dir` (empty set if the dir is missing). */
async function existingSkillIds(dir: string): Promise<Set<string>> {
  const ids = new Set<string>();
  if (!fs.existsSync(dir)) return ids;
  try {
    const store = new SkillStore();
    await store.discoverSkills(dir);
    for (const s of store.listSkills()) ids.add(s.id);
  } catch {
    // Unreadable directory — treat as empty.
  }
  return ids;
}

/**
 * Recursively copies a folder (SKILL.md + any assets) from `from` to `to`.
 * `to` is created if needed. Existing files are overwritten; the caller is
 * responsible for skipping an already-imported destination.
 */
function copyFolderSync(from: string, to: string): void {
  if (!fs.existsSync(to)) {
    fs.mkdirSync(to, { recursive: true });
  }
  const entries = fs.readdirSync(from, { withFileTypes: true });
  for (const entry of entries) {
    const src = path.join(from, entry.name);
    const dest = path.join(to, entry.name);
    if (entry.isDirectory()) {
      copyFolderSync(src, dest);
    } else {
      fs.copyFileSync(src, dest);
    }
  }
}

/**
 * Discovers skills from the given directory (if any) and the app-userdata
 * `skills/` folder. Missing directories are ignored. Always returns an array.
 */
export async function listSkills(dir?: string | string[]): Promise<DiscoveredSkill[]> {
  const dirs: string[] = [];
  if (dir) {
    if (Array.isArray(dir)) {
      for (const d of dir) {
        if (d && fs.existsSync(d)) dirs.push(d);
      }
    } else {
      if (fs.existsSync(dir)) dirs.push(dir);
    }
  }
  try {
    const userSkills = path.join(app.getPath('userData'), STORAGE_DIRS.skills);
    if (fs.existsSync(userSkills)) dirs.push(userSkills);
    // Also surface the app's canonical global skills folder (~/.superagent/skills),
    // which is where global imports land.
    const globalSkills = path.join(getUserDataDirectory(), STORAGE_DIRS.skills);
    if (fs.existsSync(globalSkills)) dirs.push(globalSkills);
  } catch {
    // app.getPath can throw in some sandboxed contexts; ignore.
  }

  const store = new SkillStore();
  for (const d of dirs) {
    try {
      await store.discoverSkills(d);
    } catch {
      // Unreadable directory — skip.
    }
  }

  return store.listSkills().map((s: SkillDefinition) => ({
    id: s.id,
    name: s.metadata.name,
    description: s.metadata.description,
    instructions: s.instructions
  }));
}

/**
 * Scans the candidate skill source dirs and returns the skills that are not
 * already present in their destination. A skill's `id` is compared against the
 * ids already discovered in the destination folder for its scope, so an
 * already-imported skill is never reported as importable.
 *
 * `projectRoot` enables the project-local sources (and their local destination).
 * `opts.home` / `opts.appData` can override the base dirs for testing.
 */
export async function checkSkillsToImport(
  projectRoot?: string,
  opts?: Partial<SkillPaths>
): Promise<{ canImport: boolean; skills: ImportableSkill[] }> {
  const sources = candidateSources(projectRoot, opts);
  if (sources.length === 0) {
    return { canImport: false, skills: [] };
  }

  const existingByDest = new Map<string, Promise<Set<string>>>();
  const getExisting = (dest: string): Promise<Set<string>> => {
    if (!existingByDest.has(dest)) existingByDest.set(dest, existingSkillIds(dest));
    return existingByDest.get(dest) as Promise<Set<string>>;
  };

  const result: ImportableSkill[] = [];
  const seen = new Set<string>(); // `${scope}:${id}` — avoid dupes across source dirs of the same scope

  for (const src of sources) {
    const dest = destinationForScope(src.scope, projectRoot, opts);
    const existing = await getExisting(dest);
    const store = new SkillStore();
    try {
      await store.discoverSkills(src.dir);
    } catch {
      continue;
    }
    for (const s of store.listSkills()) {
      if (existing.has(s.id)) continue;
      const key = `${src.scope}:${s.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const sourcePath = s.directoryPath ?? path.join(src.dir, s.id);
      result.push({
        id: s.id,
        name: s.metadata.name || s.id,
        description: s.metadata.description || '',
        sourcePath,
        folderName: path.basename(sourcePath),
        scope: src.scope
      });
    }
  }

  return { canImport: result.length > 0, skills: result };
}

/**
 * Imports every skill reported by `checkSkillsToImport` into its scope's
 * destination folder, copying each skill folder. Skills whose destination
 * folder already exists are skipped (no clobbering). Returns the count imported.
 */
export async function importSkills(
  projectRoot?: string,
  opts?: Partial<SkillPaths>
): Promise<{ success: boolean; importedCount: number; message?: string }> {
  const check = await checkSkillsToImport(projectRoot, opts);
  if (!check.canImport) {
    return { success: true, importedCount: 0, message: 'No new skills to import.' };
  }

  let importedCount = 0;
  for (const skill of check.skills) {
    const destDir = destinationForScope(skill.scope, projectRoot, opts);
    const destPath = path.join(destDir, skill.folderName);
    if (fs.existsSync(destPath)) {
      // Already imported (by folder name) — skip to avoid clobbering.
      continue;
    }
    try {
      if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });
      copyFolderSync(skill.sourcePath, destPath);
      importedCount++;
    } catch (err) {
      console.error(`Failed to copy skill ${skill.id} from ${skill.sourcePath} to ${destPath}:`, err);
    }
  }

  return { success: true, importedCount };
}
