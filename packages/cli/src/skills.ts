import * as fs from 'fs';
import * as path from 'path';
import os from 'os';

/** A runnable skill surfaced in the `/` palette and selectable with arrow keys. */
export interface RunnableSkill {
  id: string;
  name: string;
  description: string;
  /** The prompt that is sent to the engine when the skill is launched. */
  prompt: string;
  /** True for skills discovered on disk. */
  discovered?: boolean;
  /** Origin badge indicating where the skill was loaded from. */
  origin?: string;
}

/**
 * Built-in skills ship with the CLI so the `/` palette always has runnable
 * "functions" to offer even before a project registers its own.
 */
const BUILTIN_SKILLS: RunnableSkill[] = [
  {
    id: 'explain',
    name: 'explain',
    description: 'Explain how the selected code / file works, step by step',
    prompt:
      'Explain the currently relevant code in this project. Walk through the key files, their responsibilities, and how data flows between them. Be concrete and cite file paths.',
    origin: 'builtin',
  },
  {
    id: 'write-tests',
    name: 'write-tests',
    description: 'Generate a test suite for the project using its existing framework',
    prompt:
      'Look at this project, detect its language and test framework, and write a meaningful test suite covering the core modules. Create the test files and run them to verify they pass.',
    origin: 'builtin',
  },
  {
    id: 'scaffold',
    name: 'scaffold',
    description: 'Scaffold a new project (pick a sensible stack and structure)',
    prompt:
      'Scaffold a new project in this directory. Choose a sensible language and folder structure for the goal, create the entry files, and verify it builds/runs.',
    origin: 'builtin',
  },
  {
    id: 'refactor',
    name: 'refactor',
    description: 'Review the codebase and apply safe refactors',
    prompt:
      'Review this codebase for duplication, dead code, and unclear structure. Propose and apply safe refactors, then verify nothing breaks.',
    origin: 'builtin',
  },
  {
    id: 'docs',
    name: 'docs',
    description: 'Generate a README and inline documentation for the project',
    prompt:
      'Generate clear documentation for this project: a README with setup, usage, and architecture notes, plus any missing inline doc comments for public APIs.',
    origin: 'builtin',
  },
  {
    id: 'fix',
    name: 'fix',
    description: 'Find and fix the most likely bug reported in the last message',
    prompt:
      'Find and fix the bug described in the user request. Reproduce it, locate the root cause, apply a minimal fix, and verify it with a test or command.',
    origin: 'builtin',
  },
];

/** Parses a SKILL.md file into a {@link RunnableSkill}. */
function parseSkillFile(filePath: string, origin: string): RunnableSkill | null {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    let dirName = path.basename(path.dirname(filePath));
    if (dirName === 'skills' || dirName === '.claude' || dirName === '.superagent') {
      dirName = path.basename(filePath).replace(/\.md$/i, '');
    }
    let name = dirName;
    let description = 'Discovered skill';
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
      origin,
    };
  } catch {
    return null;
  }
}

/** Discovers `SKILL.md` or `*.md` skill files in local and global `.superagent` and `.claude` directories. */
function discoverProjectSkills(root: string): RunnableSkill[] {
  const homeDir = os.homedir();
  const searchLocations: Array<{ dir: string; origin: string }> = [
    { dir: path.join(root, '.superagent', 'skills'), origin: 'local .superagent' },
    { dir: path.join(root, '.claude', 'skills'), origin: 'local .claude' },
    { dir: path.join(root, '.agents', 'skills'), origin: 'local .agents' },
    { dir: path.join(root, 'skills'), origin: 'local skills' },
    { dir: path.join(homeDir, '.superagent', 'skills'), origin: 'global .superagent' },
    { dir: path.join(homeDir, '.claude', 'skills'), origin: 'global .claude' },
  ];

  const found: RunnableSkill[] = [];
  const seenIds = new Set<string>();

  for (const { dir, origin } of searchLocations) {
    if (!fs.existsSync(dir)) continue;
    try {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (entry.name.startsWith('.') || entry.name.startsWith('_')) continue;
        let skillPath: string | null = null;
        if (entry.isDirectory()) {
          const candidateSkill = path.join(dir, entry.name, 'SKILL.md');
          const candidateReadme = path.join(dir, entry.name, 'README.md');
          const candidatePrompt = path.join(dir, entry.name, 'prompt.md');
          if (fs.existsSync(candidateSkill)) skillPath = candidateSkill;
          else if (fs.existsSync(candidatePrompt)) skillPath = candidatePrompt;
          else if (fs.existsSync(candidateReadme)) skillPath = candidateReadme;
        } else if (entry.name.toLowerCase().endsWith('.md') && entry.name.toLowerCase() !== 'readme.md') {
          skillPath = path.join(dir, entry.name);
        }

        if (skillPath && fs.existsSync(skillPath)) {
          const s = parseSkillFile(skillPath, origin);
          if (s && !seenIds.has(s.id)) {
            seenIds.add(s.id);
            found.push(s);
          }
        }
      }
    } catch {
      /* ignore unreadable directories */
    }
  }
  return found;
}

/**
 * Returns the combined list of runnable skills: built-in skills plus all skills
 * discovered in local/global .superagent and .claude skill directories.
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

