import * as fs from 'fs/promises';
import * as path from 'path';

/** A labeled section within project instructions. */
export interface InstructionSection {
  title: string;
  content: string;
}

/** Parsed project instructions from AGENT.md, CLAUDE.md, .cursorrules, etc. */
export interface ProjectInstruction {
  filePath: string;
  sourceType: 'agent' | 'claude' | 'cursor' | 'system' | 'custom';
  rawContent: string;
  sections: InstructionSection[];
  rules: string[];
}

/** Parses and merges project instruction files (AGENT.md, CLAUDE.md, etc.). */
export class ProjectInstructionsParser {
  private sanitizeContent(content: string): string {
    return content.replace(/sk-[a-zA-Z0-9_-]+/g, '[REDACTED_TOKEN]');
  }

  public parseContent(content: string, filePath: string = 'inline'): ProjectInstruction {
    const sanitized = this.sanitizeContent(content);
    const fileName = path.basename(filePath).toLowerCase();

    let sourceType: ProjectInstruction['sourceType'] = 'custom';
    if (fileName.includes('agent')) sourceType = 'agent';
    else if (fileName.includes('claude')) sourceType = 'claude';
    else if (fileName.includes('cursor')) sourceType = 'cursor';
    else if (fileName.includes('system')) sourceType = 'system';

    const lines = sanitized.split('\n');
    const sections: InstructionSection[] = [];
    const rules: string[] = [];

    let currentTitle = 'General';
    let currentLines: string[] = [];

    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith('#')) {
        if (currentLines.length > 0) {
          sections.push({ title: currentTitle, content: currentLines.join('\n').trim() });
          currentLines = [];
        }
        currentTitle = trimmed.replace(/^#+\s*/, '');
      } else {
        currentLines.push(line);
        if (trimmed.startsWith('-') || trimmed.startsWith('*') || /^\d+\./.test(trimmed)) {
          const ruleText = trimmed.replace(/^([-*]|\d+\.)\s*/, '');
          if (ruleText.length > 0) {
            rules.push(ruleText);
          }
        }
      }
    }

    if (currentLines.length > 0) {
      sections.push({ title: currentTitle, content: currentLines.join('\n').trim() });
    }

    return {
      filePath,
      sourceType,
      rawContent: sanitized,
      sections,
      rules
    };
  }

  public async parseFile(filePath: string): Promise<ProjectInstruction> {
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      return this.parseContent(content, filePath);
    } catch (err) {
      throw new Error(`Failed to read instruction file at ${filePath}: ${(err as Error).message}`);
    }
  }

  public async discoverAndParse(workspacePath: string): Promise<ProjectInstruction[]> {
    const targetFiles = ['AGENT.md', 'AGENTS.md', 'CLAUDE.md', '.cursorrules', 'SYSTEM.md'];
    const discovered: ProjectInstruction[] = [];

    for (const file of targetFiles) {
      const fullPath = path.join(workspacePath, file);
      try {
        const stat = await fs.stat(fullPath);
        if (stat.isFile()) {
          const instruction = await this.parseFile(fullPath);
          discovered.push(instruction);
        }
      } catch {
        // File does not exist or cannot be accessed
      }
    }

    return discovered;
  }

  public mergeInstructions(instructions: ProjectInstruction[]): { combinedPrompt: string; rules: string[] } {
    const allRules: string[] = [];
    const promptParts: string[] = [];

    for (const inst of instructions) {
      allRules.push(...inst.rules);
      promptParts.push(`--- Instructions from ${path.basename(inst.filePath)} ---\n${inst.rawContent}`);
    }

    return {
      combinedPrompt: promptParts.join('\n\n'),
      rules: Array.from(new Set(allRules))
    };
  }
}
