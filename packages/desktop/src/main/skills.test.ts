import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import {
  checkSkillsToImport,
  importSkills,
  candidateSources,
  getGlobalSkillsDir,
  listSkills,
  saveSkill,
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
    `---\nname: "${name}"\ndescription: "${name} skill"\n---\n${body}\n`,
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

    expect(fs.existsSync(path.join(getGlobalSkillsDir(opts), 'claude-skill', 'SKILL.md'))).toBe(true);
    expect(fs.existsSync(path.join(getGlobalSkillsDir(opts), 'agents-skill', 'SKILL.md'))).toBe(true);
    expect(fs.existsSync(path.join(root, '.superagent', 'skills', 'project-skill', 'SKILL.md'))).toBe(true);

    const after = await checkSkillsToImport(root, opts);
    expect(after.canImport).toBe(false);
  });

  it('listSkills properly tags scopes and origins', async () => {
    const opts = makePaths(tmp);
    writeSkill(path.join(opts.home, '.claude', 'skills'), 'claude-skill');
    writeSkill(path.join(opts.home, '.agents', 'skills'), 'agents-skill');
    writeSkill(path.join(opts.home, '.codex', 'skills'), 'codex-skill');
    writeSkill(getGlobalSkillsDir(opts), 'custom-global-skill');

    const root = path.join(tmp, 'project');
    writeSkill(path.join(root, '.superagent', 'skills'), 'local-superagent-skill');
    writeSkill(path.join(root, '.claude', 'skills'), 'local-claude-skill');

    const discovered = await listSkills(root, opts);
    
    // Check scopes and origins
    const claude = discovered.find(d => d.id === 'claude-skill');
    expect(claude).toBeDefined();
    expect(claude?.scope).toBe('global');
    expect(claude?.origin).toBe('claude');

    const agent = discovered.find(d => d.id === 'agents-skill');
    expect(agent).toBeDefined();
    expect(agent?.scope).toBe('global');
    expect(agent?.origin).toBe('agent');

    const codex = discovered.find(d => d.id === 'codex-skill');
    expect(codex).toBeDefined();
    expect(codex?.scope).toBe('global');
    expect(codex?.origin).toBe('codex');

    const customGlobal = discovered.find(d => d.id === 'custom-global-skill');
    expect(customGlobal).toBeDefined();
    expect(customGlobal?.scope).toBe('global');
    expect(customGlobal?.origin).toBe('superagent');

    const localSuper = discovered.find(d => d.id === 'local-superagent-skill');
    expect(localSuper).toBeDefined();
    expect(localSuper?.scope).toBe('project');
    expect(localSuper?.origin).toBe('project');

    const localClaude = discovered.find(d => d.id === 'local-claude-skill');
    expect(localClaude).toBeDefined();
    expect(localClaude?.scope).toBe('project');
    expect(localClaude?.origin).toBe('project');
  });

  it('saveSkill writes a custom skill globally', async () => {
    const opts = makePaths(tmp);
    const saveRes = await saveSkill('My Fancy Skill', 'A very nice skill description', 'Write premium code.', opts);
    expect(saveRes.success).toBe(true);
    expect(saveRes.skillId).toBe('my-fancy-skill');

    const expectedFile = path.join(getGlobalSkillsDir(opts), 'my-fancy-skill', 'SKILL.md');
    expect(fs.existsSync(expectedFile)).toBe(true);

    const content = fs.readFileSync(expectedFile, 'utf-8');
    expect(content).toContain('name: "My Fancy Skill"');
    expect(content).toContain('description: "A very nice skill description"');
    expect(content).toContain('Write premium code.');
  });
});
