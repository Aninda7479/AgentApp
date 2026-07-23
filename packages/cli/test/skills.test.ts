import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { getRunnableSkills } from '../src/skills.js';

describe('Skill Discovery Suite (.superagent & .claude)', () => {
  const tmpDir = path.join(os.tmpdir(), `test-skills-${Date.now()}`);

  beforeEach(() => {
    fs.mkdirSync(tmpDir, { recursive: true });
  });

  afterEach(() => {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {}
  });

  it('should include built-in skills by default', () => {
    const skills = getRunnableSkills(tmpDir);
    const ids = skills.map((s) => s.id);
    expect(ids).toContain('explain');
    expect(ids).toContain('write-tests');
    expect(ids).toContain('refactor');
  });

  it('should discover skills from local .superagent/skills', () => {
    const skillDir = path.join(tmpDir, '.superagent', 'skills', 'custom-super');
    fs.mkdirSync(skillDir, { recursive: true });
    fs.writeFileSync(
      path.join(skillDir, 'SKILL.md'),
      '---\nname: Custom Super Skill\ndescription: Custom superagent skill description\n---\nPrompt content'
    );

    const skills = getRunnableSkills(tmpDir);
    const discovered = skills.find((s) => s.id === 'custom-super-skill');
    expect(discovered).toBeDefined();
    expect(discovered?.name).toBe('Custom Super Skill');
    expect(discovered?.description).toBe('Custom superagent skill description');
    expect(discovered?.origin).toBe('local .superagent');
  });

  it('should discover skills from local .claude/skills', () => {
    const skillDir = path.join(tmpDir, '.claude', 'skills', 'custom-claude');
    fs.mkdirSync(skillDir, { recursive: true });
    fs.writeFileSync(
      path.join(skillDir, 'SKILL.md'),
      '---\nname: Custom Claude Skill\ndescription: Custom claude skill description\n---\nPrompt content'
    );

    const skills = getRunnableSkills(tmpDir);
    const discovered = skills.find((s) => s.id === 'custom-claude-skill');
    expect(discovered).toBeDefined();
    expect(discovered?.name).toBe('Custom Claude Skill');
    expect(discovered?.origin).toBe('local .claude');
  });
});
