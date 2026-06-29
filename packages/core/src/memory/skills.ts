import * as fs from 'fs/promises';
import * as path from 'path';

export interface SkillMetadata {
  name: string;
  description: string;
  tags?: string[];
  version?: string;
}

export interface SkillDefinition {
  id: string;
  metadata: SkillMetadata;
  instructions: string;
  directoryPath?: string;
}

export class SkillStore {
  private skillsMap: Map<string, SkillDefinition> = new Map();

  public registerSkill(skill: SkillDefinition): void {
    this.skillsMap.set(skill.id.toLowerCase(), skill);
    this.skillsMap.set(skill.metadata.name.toLowerCase(), skill);
  }

  public parseSkillContent(content: string, directoryPath?: string): SkillDefinition {
    let name = 'Unnamed Skill';
    let description = 'No description provided';
    const tags: string[] = [];

    // Parse simple frontmatter if present (--- name: foo ... ---)
    const frontmatterMatch = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
    let bodyContent = content;

    if (frontmatterMatch) {
      bodyContent = content.substring(frontmatterMatch[0].length).trim();
      const yamlLines = frontmatterMatch[1].split('\n');
      for (const line of yamlLines) {
        const [k, ...vParts] = line.split(':');
        if (k && vParts.length > 0) {
          const key = k.trim().toLowerCase();
          const val = vParts.join(':').trim().replace(/^['"]|['"]$/g, '');
          if (key === 'name') name = val;
          else if (key === 'description') description = val;
          else if (key === 'tags') {
            const parsedTags = val.replace(/[\[\]]/g, '').split(',').map(t => t.trim()).filter(Boolean);
            tags.push(...parsedTags);
          }
        }
      }
    } else {
      // Fallback: search for # title
      const lines = content.split('\n');
      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.startsWith('# ')) {
          name = trimmed.replace(/^#\s*/, '');
          break;
        }
      }
    }

    const id = name.toLowerCase().replace(/[^a-z0-9_-]+/g, '-');

    return {
      id,
      metadata: {
        name,
        description,
        tags: Array.from(new Set(tags))
      },
      instructions: bodyContent,
      directoryPath
    };
  }

  public async parseSkillFile(filePath: string): Promise<SkillDefinition> {
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      const dirPath = path.dirname(filePath);
      return this.parseSkillContent(content, dirPath);
    } catch (err) {
      throw new Error(`Failed to read SKILL file at ${filePath}: ${(err as Error).message}`);
    }
  }

  public async discoverSkills(directoryPath: string): Promise<SkillDefinition[]> {
    const discovered: SkillDefinition[] = [];
    try {
      const entries = await fs.readdir(directoryPath, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory()) {
          const skillFilePath = path.join(directoryPath, entry.name, 'SKILL.md');
          try {
            const stat = await fs.stat(skillFilePath);
            if (stat.isFile()) {
              const skill = await this.parseSkillFile(skillFilePath);
              this.registerSkill(skill);
              discovered.push(skill);
            }
          } catch {
            // No SKILL.md in subfolder
          }
        } else if (entry.isFile() && entry.name.toUpperCase() === 'SKILL.MD') {
          const skillFilePath = path.join(directoryPath, entry.name);
          const skill = await this.parseSkillFile(skillFilePath);
          this.registerSkill(skill);
          discovered.push(skill);
        }
      }
    } catch {
      // Directory access error
    }
    return discovered;
  }

  public searchSkills(query: string): SkillDefinition[] {
    const q = query.toLowerCase();
    const results = new Set<SkillDefinition>();

    for (const skill of this.skillsMap.values()) {
      const nameMatch = skill.metadata.name.toLowerCase().includes(q);
      const descMatch = skill.metadata.description.toLowerCase().includes(q);
      const tagMatch = skill.metadata.tags?.some(t => t.toLowerCase().includes(q));

      if (nameMatch || descMatch || tagMatch) {
        results.add(skill);
      }
    }

    return Array.from(results);
  }

  public getSkill(idOrName: string): SkillDefinition | undefined {
    return this.skillsMap.get(idOrName.toLowerCase());
  }

  public listSkills(): SkillDefinition[] {
    const uniqueSkills = new Set<SkillDefinition>(this.skillsMap.values());
    return Array.from(uniqueSkills);
  }
}
