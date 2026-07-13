import * as fs from 'fs/promises';
import * as path from 'path';
import { CLICommandResult } from '../types.js';

/** Metadata extracted from inspecting a project directory. */
export interface ProjectContextMetadata {
  projectName: string;
  version: string;
  description: string;
  language: string;
  frameworks: string[];
  entryPoints: string[];
  scripts: Record<string, string>;
  generatedAt: string;
}

/** Generates project context metadata and AGENTS.md for autonomous agents. */
export class ProjectContextGenerator {
  /** Scans a directory for package.json, tsconfig, and entry points to build metadata. */
  public static async inspectDirectory(targetDir: string): Promise<ProjectContextMetadata> {
    let projectName = path.basename(path.resolve(targetDir));
    let version = '1.0.0';
    let description = 'SuperAgent-enabled Project';
    const frameworks: string[] = [];
    let scripts: Record<string, string> = {};
    let language = 'JavaScript';

    const pkgPath = path.join(targetDir, 'package.json');
    try {
      const pkgContent = await fs.readFile(pkgPath, 'utf-8');
      const pkg = JSON.parse(pkgContent);
      if (pkg.name) projectName = pkg.name;
      if (pkg.version) version = pkg.version;
      if (pkg.description) description = pkg.description;
      if (pkg.scripts) scripts = pkg.scripts;

      const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };
      // Detect language and frameworks from dependencies
      if (allDeps.typescript) {
        language = 'TypeScript';
        frameworks.push('TypeScript');
      }
      if (allDeps.react) frameworks.push('React');
      if (allDeps.next) frameworks.push('Next.js');
      if (allDeps.vue) frameworks.push('Vue');
      if (allDeps.express) frameworks.push('Express');
      if (allDeps.commander) frameworks.push('Commander CLI');
      if (allDeps.ink) frameworks.push('Ink TUI');
    } catch {
      // package.json not present or unparseable
    }

    const tsconfigPath = path.join(targetDir, 'tsconfig.json');
    try {
      await fs.stat(tsconfigPath);
      language = 'TypeScript';
    } catch {
      // no tsconfig
    }

    const entryPoints: string[] = [];
    // Check common entry point locations
    const possibleEntries = ['src/index.ts', 'src/index.js', 'src/main.ts', 'src/app.ts', 'index.js', 'index.ts'];
    for (const e of possibleEntries) {
      try {
        await fs.stat(path.join(targetDir, e));
        entryPoints.push(e);
      } catch {
        // file does not exist
      }
    }

    return {
      projectName,
      version,
      description,
      language,
      frameworks,
      entryPoints,
      scripts,
      generatedAt: new Date().toISOString()
    };
  }

  /**
   * Creates .agent/context.json and AGENTS.md in the target directory.
   * @param targetDir - Directory to inspect and initialize
   * @param force - If true, overwrites existing context files
   */
  public static async generateContext(
    targetDir: string = process.cwd(),
    force: boolean = false
  ): Promise<CLICommandResult> {
    const absDir = path.resolve(targetDir);
    const agentDir = path.join(absDir, '.agent');
    await fs.mkdir(agentDir, { recursive: true });

    const metadata = await this.inspectDirectory(absDir);

    const contextJsonPath = path.join(agentDir, 'context.json');
    const agentsMdPath = path.join(absDir, 'AGENTS.md');

    if (!force) {
      try {
        await fs.stat(contextJsonPath);
        return {
          success: false,
          message: `Project context already initialized at ${contextJsonPath}. Use --force to overwrite.`
        };
      } catch {
        // File does not exist, safe to proceed
      }
    }

    await fs.writeFile(contextJsonPath, JSON.stringify(metadata, null, 2), 'utf-8');

    const agentsMdContent = `# ${metadata.projectName} — Agent Guidelines

## Project Summary
- **Name**: ${metadata.projectName}
- **Version**: ${metadata.version}
- **Language**: ${metadata.language}
- **Frameworks**: ${metadata.frameworks.join(', ') || 'Standard'}

## Primary Entrypoints
${metadata.entryPoints.map(e => `- \`${e}\``).join('\n') || '- `src/index.ts`'}

## Rules for Autonomous Agents
1. Maintain existing directory conventions and modular TypeScript/JavaScript structures.
2. Run automated verification tests before declaring tasks complete.
3. Ensure strict type coverage and clean error handling.
`;

    await fs.writeFile(agentsMdPath, agentsMdContent, 'utf-8');

    return {
      success: true,
      message: `Project context successfully initialized!\n  - Created ${contextJsonPath}\n  - Created ${agentsMdPath}`,
      data: { contextJsonPath, agentsMdPath, metadata }
    };
  }
}

/** Handles `/init` slash command: generates project context files. */
export async function handleInitCommand(args: string[], targetDir?: string): Promise<CLICommandResult> {
  const force = args.includes('--force') || args.includes('-f');
  const dirArg = args.find(a => !a.startsWith('-')) || targetDir || process.cwd();
  return await ProjectContextGenerator.generateContext(dirArg, force);
}
