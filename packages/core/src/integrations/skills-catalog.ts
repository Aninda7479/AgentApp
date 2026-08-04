import { BUILTIN_SKILLS } from '../prompts/index.js';

/** Readiness status surfaced in the Settings UI. */
export type SkillStatus = 'active' | 'under-development' | 'incomplete';

/** Whether the skill was discovered on disk or comes from the curated catalog. */
export type SkillSource = 'discovered' | 'catalog';

/** A single skill entry for the Settings → Skills panel. */
export interface SkillCatalogEntry {
  /** Stable skill id (matches the slash-command name, e.g. `skill-creator`). */
  id: string;
  /** Display name. */
  name: string;
  /** One-line description. */
  description: string;
  /** Readiness status. Catalog items default to `under-development`. */
  status: SkillStatus;
  /** Origin of the skill. */
  source: SkillSource;
  /** Optional full instructions (only present for discovered skills). */
  instructions?: string;
}

/** The curated skill catalog (dynamically mapped from our in-code BUILTIN_SKILLS). */
export const SKILL_CATALOG: SkillCatalogEntry[] = BUILTIN_SKILLS.map((s) => ({
  id: s.id,
  name: s.name,
  description: s.description,
  status: 'active',
  source: 'catalog'
}));

