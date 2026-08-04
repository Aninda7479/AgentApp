import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { SkillStore, SkillDefinition, STORAGE_DIRS, getUserDataDirectory } from '@superagent/core';

/** A skill discovered from a `skills/` directory, ready for the renderer. */
export interface DiscoveredSkill {
  id: string;
  name: string;
  description: string;
  instructions: string;
  scope: 'global' | 'project';
  origin: 'superagent' | 'claude' | 'agent' | 'codex' | 'project';
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
 * Missing directories are skipped.
 */
export function candidateSources(
  projectRoot?: string,
  opts?: Partial<SkillPaths>
): { dir: string; scope: SkillScope }[] {
  const { home } = resolvePaths(opts);
  const sources: { dir: string; scope: SkillScope }[] = [
    { dir: path.join(home, '.claude', 'skills'), scope: 'global' },
    { dir: path.join(home, '.agents', 'skills'), scope: 'global' },
    { dir: path.join(home, '.codex', 'skills'), scope: 'global' }
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
 * Discovers skills from the app-userdata `skills/` folder, global .claude/.agents/.codex folders,
 * and project-local folders. Scopes and tags them with their origin.
 */
export async function listSkills(
  projectRoot?: string,
  opts?: Partial<SkillPaths>
): Promise<DiscoveredSkill[]> {
  const { home } = resolvePaths(opts);
  const discovered: DiscoveredSkill[] = [];
  const seenIds = new Set<string>();

  // 1. Scan Global folders
  const globalConfigs = [
    { dir: getGlobalSkillsDir(opts), origin: 'superagent' as const },
    { dir: path.join(home, '.claude', 'skills'), origin: 'claude' as const },
    { dir: path.join(home, '.agents', 'skills'), origin: 'agent' as const },
    { dir: path.join(home, '.codex', 'skills'), origin: 'codex' as const }
  ];

  for (const cfg of globalConfigs) {
    if (fs.existsSync(cfg.dir)) {
      const store = new SkillStore();
      try {
        await store.discoverSkills(cfg.dir);
        for (const s of store.listSkills()) {
          const key = `global:${s.id}`;
          if (!seenIds.has(key)) {
            seenIds.add(key);
            discovered.push({
              id: s.id,
              name: s.metadata.name,
              description: s.metadata.description,
              instructions: s.instructions,
              scope: 'global',
              origin: cfg.origin
            });
          }
        }
      } catch {
        // ignore unreadable
      }
    }
  }

  // 2. Scan Project folders (if projectRoot is provided)
  if (projectRoot) {
    const projectConfigs = [
      { dir: path.join(projectRoot, '.superagent', 'skills') },
      { dir: path.join(projectRoot, '.cloud', 'skills') },
      { dir: path.join(projectRoot, '.agents', 'skills') },
      { dir: path.join(projectRoot, '.claude', 'skills') }
    ];

    for (const cfg of projectConfigs) {
      if (fs.existsSync(cfg.dir)) {
        const store = new SkillStore();
        try {
          await store.discoverSkills(cfg.dir);
          for (const s of store.listSkills()) {
            const key = `project:${s.id}`;
            if (!seenIds.has(key)) {
              seenIds.add(key);
              discovered.push({
                id: s.id,
                name: s.metadata.name,
                description: s.metadata.description,
                instructions: s.instructions,
                scope: 'project',
                origin: 'project'
              });
            }
          }
        } catch {
          // ignore unreadable
        }
      }
    }
  }

  return discovered;
}

/** Saves a custom skill globally under `~/.superagent/skills/<skill-id>/SKILL.md`. */
export async function saveSkill(
  name: string,
  description: string,
  instructions: string,
  opts?: Partial<SkillPaths>
): Promise<{ success: boolean; error?: string; skillId: string }> {
  try {
    const skillId = name.toLowerCase().replace(/[^a-z0-9_-]+/g, '-');
    if (!skillId) {
      throw new Error('Invalid skill name.');
    }
    const globalSkillsDir = getGlobalSkillsDir(opts);
    const destPath = path.join(globalSkillsDir, skillId);
    if (!fs.existsSync(destPath)) {
      fs.mkdirSync(destPath, { recursive: true });
    }
    const skillContent = `---
name: "${name}"
description: "${description}"
---

${instructions}
`;
    fs.writeFileSync(path.join(destPath, 'SKILL.md'), skillContent, 'utf-8');
    return { success: true, skillId };
  } catch (err: any) {
    return { success: false, error: err.message, skillId: '' };
  }
}

/** Scans candidate directories and reports importable skills. */
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
  const seen = new Set<string>();

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

/** Imports new discovered skills into the active scopes. */
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
