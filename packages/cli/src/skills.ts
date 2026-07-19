import * as fs from 'fs';
import * as path from 'path';

/** A runnable skill surfaced in the `/` palette and selectable with arrow keys. */
export interface RunnableSkill {
  id: string;
  name: string;
  description: string;
  /** The prompt that is sent to the engine when the skill is launched. */
  prompt: string;
  /** True for skills discovered on disk in the current project. */
  discovered?: boolean;
}

/**
 * Built-in skills ship with the CLI so the `/` palette always has runnable
 * "functions" to offer even before a project registers its own. Each skill is a
 * reusable agentic workflow expressed as a prompt the engine executes with its
 * tools — matching how Claude Code exposes skills as launchable routines.
 */
const BUILTIN_SKILLS: RunnableSkill[] = [
  {
    id: 'explain',
    name: 'explain',
    description: 'Explain how the selected code / file works, step by step',
    prompt:
      'Explain the currently relevant code in this project. Walk through the key files, their responsibilities, and how data flows between them. Be concrete and cite file paths.',
  },
  {
    id: 'write-tests',
    name: 'write-tests',
    description: 'Generate a test suite for the project using its existing framework',
    prompt:
      'Look at this project, detect its language and test framework, and write a meaningful test suite covering the core modules. Create the test files and run them to verify they pass.',
  },
  {
    id: 'scaffold',
    name: 'scaffold',
    description: 'Scaffold a new project (pick a sensible stack and structure)',
    prompt:
      'Scaffold a new project in this directory. Choose a sensible language and folder structure for the goal, create the entry files, and verify it builds/runs.',
  },
  {
    id: 'refactor',
    name: 'refactor',
    description: 'Review the codebase and apply safe refactors',
    prompt:
      'Review this codebase for duplication, dead code, and unclear structure. Propose and apply safe refactors, then verify nothing breaks.',
  },
  {
    id: 'docs',
    name: 'docs',
    description: 'Generate a README and inline documentation for the project',
    prompt:
      'Generate clear documentation for this project: a README with setup, usage, and architecture notes, plus any missing inline doc comments for public APIs.',
  },
  {
    id: 'fix',
    name: 'fix',
    description: 'Find and fix the most likely bug reported in the last message',
    prompt:
      'Find and fix the bug described in the user request. Reproduce it, locate the root cause, apply a minimal fix, and verify it with a test or command.',
  },
];

/** Parses a SKILL.md file into a {@link RunnableSkill}. */
function parseSkillFile(filePath: string): RunnableSkill | null {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    let name = path.basename(path.dirname(filePath));
    let description = 'Project skill';
    const fm = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
    if (fm) {
      for (const line of fm[1].split('\n')) {
        const idx = line.indexOf(':');
        if (idx < 0) continue;
        const key = line.slice(0, idx).trim().toLowerCase();
        const val = line.slice(idx + 1).trim().replace(/^['"]|['"]$/g, '');
        if (key === 'name') name = val;
        else if (key === 'description') description = val;
      }
    } else {
      const h = content.split('\n').find((l) => l.trim().startsWith('# '));
      if (h) name = h.replace(/^#\s*/, '').trim();
    }
    const id = name.toLowerCase().replace(/[^a-z0-9_-]+/g, '-');
    return {
      id,
      name,
      description,
      prompt: `Use the "${name}" skill. ${description}\n\n${content}`,
      discovered: true,
    };
  } catch {
    return null;
  }
}

/** Discovers `SKILL.md` files in the project (`.superagent/skills`, `skills/`). */
function discoverProjectSkills(root: string): RunnableSkill[] {
  const dirs = [path.join(root, '.superagent', 'skills'), path.join(root, 'skills')];
  const found: RunnableSkill[] = [];
  for (const dir of dirs) {
    if (!fs.existsSync(dir)) continue;
    try {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const skillPath = entry.isDirectory()
          ? path.join(dir, entry.name, 'SKILL.md')
          : path.join(dir, entry.name);
        if (!skillPath.toLowerCase().endsWith('skill.md')) continue;
        const s = parseSkillFile(skillPath);
        if (s) found.push(s);
      }
    } catch {
      /* ignore unreadable dirs */
    }
  }
  return found;
}

/**
 * Returns the combined list of runnable skills: built-in skills plus any skills
 * discovered in the current project. Used to populate the `/` palette.
 */
export function getRunnableSkills(root: string = process.cwd()): RunnableSkill[] {
  const builtins = BUILTIN_SKILLS.map((s) => ({ ...s }));
  const discovered = discoverProjectSkills(root);
  const seen = new Set(builtins.map((s) => s.id));
  for (const d of discovered) {
    if (!seen.has(d.id)) {
      seen.add(d.id);
      builtins.push(d);
    }
  }
  return builtins;
}
