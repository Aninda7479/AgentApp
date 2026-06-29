import * as fs from 'fs/promises';
import * as path from 'path';
import { SkillDefinition } from '@superagent/core';
import { SessionContext, CLICommandResult } from '../types.js';

export class SkillCodifier {
  public static async listSkillsAndInsights(context: SessionContext): Promise<string> {
    const skills = context.skillStore.listSkills();
    const insights = await context.learningEngine.getInsights();

    const lines: string[] = ['=== Codified Skills & Learned Insights ==='];
    
    lines.push('\n[ Codified Skills ]');
    if (skills.length === 0) {
      lines.push('  No skills registered in current session.');
    } else {
      for (const s of skills) {
        lines.push(`  * ${s.metadata.name} (${s.id})`);
        lines.push(`    Description: ${s.metadata.description}`);
      }
    }

    lines.push('\n[ Learned Insights ]');
    if (insights.length === 0) {
      lines.push('  No insights recorded in engine.');
    } else {
      for (const ins of insights) {
        lines.push(`  * [${ins.category}] ${ins.topic}: ${ins.lesson}`);
      }
    }

    return lines.join('\n');
  }

  public static async codifySkill(
    context: SessionContext,
    name: string,
    description: string,
    instructions: string,
    workspaceDir: string = process.cwd()
  ): Promise<CLICommandResult> {
    const skillId = name.toLowerCase().replace(/[^a-z0-9_-]+/g, '-');
    const skillDir = path.join(workspaceDir, '.agent', 'skills', skillId);
    await fs.mkdir(skillDir, { recursive: true });

    const skillContent = `---
name: "${name}"
description: "${description}"
---

${instructions}
`;

    const skillFilePath = path.join(skillDir, 'SKILL.md');
    await fs.writeFile(skillFilePath, skillContent, 'utf-8');

    const skillDef: SkillDefinition = {
      id: skillId,
      metadata: { name, description },
      instructions,
      directoryPath: skillDir
    };

    context.skillStore.registerSkill(skillDef);

    return {
      success: true,
      message: `Skill '${name}' successfully codified and persisted to ${skillFilePath}`,
      data: skillDef
    };
  }

  public static async recordInsight(
    context: SessionContext,
    topic: string,
    lesson: string
  ): Promise<CLICommandResult> {
    const insight = await context.learningEngine.saveInsight(topic, lesson, 'user_preference');
    return {
      success: true,
      message: `Insight on '${topic}' recorded successfully.`,
      data: insight
    };
  }

  public static async autoExtractTrajectory(context: SessionContext): Promise<CLICommandResult> {
    const insights = await context.learningEngine.extractLearningsFromTrajectory(context.messages);
    return {
      success: true,
      message: `Extracted ${insights.length} insight(s) from current session trajectory.`,
      data: insights
    };
  }
}

export async function handleLearnCommand(args: string[], context: SessionContext): Promise<CLICommandResult> {
  if (args.length === 0 || args[0] === 'list') {
    const listStr = await SkillCodifier.listSkillsAndInsights(context);
    return {
      success: true,
      message: listStr
    };
  }

  const subCommand = args[0].toLowerCase();

  if (subCommand === 'auto') {
    return await SkillCodifier.autoExtractTrajectory(context);
  }

  if (subCommand === 'insight' && args.length >= 3) {
    const topic = args[1];
    const lesson = args.slice(2).join(' ');
    return await SkillCodifier.recordInsight(context, topic, lesson);
  }

  if (subCommand === 'skill' && args.length >= 3) {
    const name = args[1];
    const instructions = args.slice(2).join(' ');
    return await SkillCodifier.codifySkill(context, name, `Custom skill ${name}`, instructions);
  }

  // Fallback: treat whole arguments as a general insight lesson
  const text = args.join(' ');
  return await SkillCodifier.recordInsight(context, 'Session Note', text);
}
