import * as fs from 'fs';
import * as path from 'path';
import { app } from 'electron';
import { SkillStore, SkillDefinition, STORAGE_DIRS } from '@superagent/core';

/** A skill discovered from a `skills/` directory, ready for the renderer. */
export interface DiscoveredSkill {
  id: string;
  name: string;
  description: string;
  instructions: string;
}

/**
 * Discovers skills from the given directory (if any) and the app-userdata
 * `skills/` folder. Missing directories are ignored. Always returns an array.
 */
export function listSkills(dir?: string): DiscoveredSkill[] {
  const dirs: string[] = [];
  if (dir && fs.existsSync(dir)) dirs.push(dir);
  try {
    const userSkills = path.join(app.getPath('userData'), STORAGE_DIRS.skills);
    if (fs.existsSync(userSkills)) dirs.push(userSkills);
  } catch {
    // app.getPath can throw in some sandboxed contexts; ignore.
  }

  const store = new SkillStore();
  for (const d of dirs) {
    try {
      store.discoverSkills(d);
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
