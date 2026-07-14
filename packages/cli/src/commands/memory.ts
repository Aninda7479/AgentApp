import { SlashCommandRouter, SlashCommandContext, SlashCommandResult } from './router.js';
import { SessionContext } from '../types.js';
import { SkillStore, LearningLoopEngine } from '@superagent/core';

/**
 * Handles `/memory`: shows the agent's persistent memory profile — the
 * installed skills (from the SkillStore) and the learned insights (from the
 * LearningLoopEngine). Maps to the Claude `/memory` slash command.
 */
export async function handleMemoryCommand(_args: string[], context: SessionContext): Promise<CLIMemoryResult> {
  const skills = context.skillStore.listSkills();
  const insights = await context.learningEngine.getInsights();

  const lines: string[] = ['=== SuperAgent Memory Profile ==='];
  lines.push(`Skills installed: ${skills.length}`);
  for (const s of skills.slice(0, 20)) {
    lines.push(`- ${s.metadata.name}: ${s.metadata.description ?? '(no description)'}`);
  }
  lines.push('');
  lines.push(`Learned insights: ${insights.length}`);
  for (const i of insights.slice(0, 20)) {
    lines.push(`- [${i.topic}] ${i.lesson}`);
  }
  return {
    success: true,
    message: lines.join('\n'),
    data: { skills, insights }
  };
}

/** Result envelope for the /memory command. */
export interface CLIMemoryResult {
  success: boolean;
  message: string;
  data?: unknown;
}

/** Registers the `/memory` slash command: view skills and learned insights. */
export function registerMemoryCommand(router: SlashCommandRouter, session: SessionContext): void {
  router.register(
    'memory',
    async (_ctx: SlashCommandContext): Promise<SlashCommandResult> => {
      const res = await handleMemoryCommand([], session);
      return { success: res.success, command: 'memory', output: res.message, data: res.data };
    },
    {
      description: 'View agent memory profile: installed skills and learned insights',
      aliases: ['mem', 'profile'],
      usage: '/memory'
    }
  );
}
