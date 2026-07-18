import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import {
  checkSkillsToImport,
  importSkills,
  candidateSources,
  getGlobalSkillsDir,
  type SkillPaths
} from './skills';

/** Build a fake user home + app-data under a temp root and return the opts. */
function makePaths(root: string): SkillPaths {
  return {
    home: path.join(root, 'home'),
    appData: path.join(root, 'appdata')
  };
}

/** Write a minimal skill folder `<dir>/<name>/SKILL.md` with frontmatter. */
function writeSkill(dir: string, name: string, body = 'Do the thing.'): string {
  const skillDir = path.join(dir, name);
  fs.mkdirSync(skillDir, { recursive: true });
  fs.writeFileSync(
    path.join(skillDir, 'SKILL.md'),
    `---\nname: ${name}\ndescription: ${name} skill\n---\n${body}\n`,
    'utf-8'
  );
  return skillDir;
}

describe('skill import (global + project sources)', async () => {
  let tmp: string;

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'superagent-skills-'));
  });

  afterEach(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it('discovers skills from global + project sources with correct scope', async () => {
    const opts = makePaths(tmp);
    writeSkill(path.join(opts.home, '.claude', 'skills'), 'claude-skill');
    writeSkill(path.join(opts.home, '.agents', 'skills'), 'agents-skill');
    const root = path.join(tmp, 'project');
    writeSkill(path.join(root, '.cloud', 'skills'), 'project-skill');

    const res = await checkSkillsToImport(root, opts);
    expect(res.canImport).toBe(true);
    const ids = res.skills.map((s) => s.id).sort();
    expect(ids).toEqual(['agents-skill', 'claude-skill', 'project-skill']);

    const global = res.skills.filter((s) => s.scope === 'global').map((s) => s.id).sort();
    const project = res.skills.filter((s) => s.scope === 'project').map((s) => s.id);
    expect(global).toEqual(['agents-skill', 'claude-skill']);
    expect(project).toEqual(['project-skill']);
  });

  it('returns only existing source dirs from candidateSources', async () => {
    const opts = makePaths(tmp);
    writeSkill(path.join(opts.home, '.claude', 'skills'), 'a');
    const root = path.join(tmp, 'project');
    writeSkill(path.join(root, '.agents', 'skills'), 'b');

    const dirs = candidateSources(root, opts).map((s) => s.dir);
    expect(dirs).toContain(path.join(opts.home, '.claude', 'skills'));
    expect(dirs).toContain(path.join(root, '.agents', 'skills'));
    // .agents at home and .cloud/.claude at project were not created → excluded
    expect(dirs).not.toContain(path.join(opts.home, '.agents', 'skills'));
  });

  it('imports global skills into ~/.superagent/skills and project skills into <root>/.superagent/skills', async () => {
    const opts = makePaths(tmp);
    writeSkill(path.join(opts.home, '.claude', 'skills'), 'claude-skill');
    writeSkill(path.join(opts.home, '.agents', 'skills'), 'agents-skill');
    const root = path.join(tmp, 'project');
    writeSkill(path.join(root, '.cloud', 'skills'), 'project-skill');

    const res = await importSkills(root, opts);
    expect(res.success).toBe(true);
    expect(res.importedCount).toBe(3);

    // Global skills → global app dir
    expect(fs.existsSync(path.join(getGlobalSkillsDir(opts), 'claude-skill', 'SKILL.md'))).toBe(true);
    expect(fs.existsSync(path.join(getGlobalSkillsDir(opts), 'agents-skill', 'SKILL.md'))).toBe(true);
    // Project skill → project-local app dir
    expect(fs.existsSync(path.join(root, '.superagent', 'skills', 'project-skill', 'SKILL.md'))).toBe(true);

    // Re-check: nothing left to import (already present)
    const after = await checkSkillsToImport(root, opts);
    expect(after.canImport).toBe(false);
  });

  it('does not overwrite an already-imported skill folder', async () => {
    const opts = makePaths(tmp);
    const src = writeSkill(path.join(opts.home, '.claude', 'skills'), 'claude-skill', 'original body');

    const first = await importSkills(undefined, opts);
    expect(first.success).toBe(true);
    expect(first.importedCount).toBe(1);

    // Mutate the source after import
    fs.writeFileSync(path.join(src, 'SKILL.md'), '---\nname: claude-skill\n---\nmutated body\n', 'utf-8');

    // Re-import: destination folder already exists → skipped, content preserved
    const second = await importSkills(undefined, opts);
    expect(second.success).toBe(true);
    expect(second.importedCount).toBe(0);

    const destBody = fs.readFileSync(path.join(getGlobalSkillsDir(opts), 'claude-skill', 'SKILL.md'), 'utf-8');
    expect(destBody).toContain('original body');
    expect(destBody).not.toContain('mutated body');
  });

  it('reports nothing to import when there are no source dirs', async () => {
    const opts = makePaths(tmp);
    const res = await checkSkillsToImport(undefined, opts);
    expect(res.canImport).toBe(false);
    expect(res.skills).toEqual([]);
  });
});
