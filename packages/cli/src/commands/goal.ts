import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { SlashCommandRouter, SlashCommandContext, SlashCommandResult } from './router.js';
import { getConfigDirectory } from '@superagent/core';

/** A persisted autonomous goal. */
export interface Goal {
  text: string;
  /** Optional machine-checkable completion condition. */
  doneWhen?: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * Read/write store for the agent's long-running goal, persisted to
 * `goal.json` in the config directory. Maps to Claude's `/goal` slash command
 * which sets a completion condition the agent works autonomously toward.
 */
export class GoalStore {
  /** Resolves the goal.json path. */
  public static getPath(overrideDir?: string): string {
    const dir = overrideDir ?? getConfigDirectory();
    return join(dir, 'goal.json');
  }

  /** Loads the active goal, or null when none is set. */
  public static load(overrideDir?: string): Goal | null {
    const path = this.getPath(overrideDir);
    if (!existsSync(path)) return null;
    try {
      return JSON.parse(readFileSync(path, 'utf8')) as Goal;
    } catch {
      return null;
    }
  }

  /** Persists a new goal. */
  public static set(text: string, doneWhen?: string, overrideDir?: string): Goal {
    const now = new Date().toISOString();
    const goal: Goal = { text, doneWhen, createdAt: now, updatedAt: now };
    const dir = overrideDir ?? getConfigDirectory();
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    writeFileSync(this.getPath(dir), JSON.stringify(goal, null, 2), 'utf8');
    return goal;
  }

  /** Clears the active goal. */
  public static clear(overrideDir?: string): void {
    const path = this.getPath(overrideDir);
    if (existsSync(path)) {
      try {
        writeFileSync(path, JSON.stringify(null), 'utf8');
      } catch {
        /* best effort */
      }
    }
  }

  /** Renders a goal as a human-readable multi-line string. */
  public static format(goal: Goal | null): string {
    if (!goal) return 'No active goal set. Use /goal <condition> to define one.';
    const lines = [
      '=== SuperAgent Active Goal ===',
      `Goal: ${goal.text}`,
      goal.doneWhen ? `Done when: ${goal.doneWhen}` : 'Done when: (no explicit condition — agent decides)',
      `Set at: ${goal.createdAt}`
    ];
    return lines.join('\n');
  }
}

/** Registers the `/goal` slash command: set, view, or clear the agent goal. */
export function registerGoalCommand(router: SlashCommandRouter): void {
  router.register(
    'goal',
    (ctx: SlashCommandContext): SlashCommandResult => {
      if (ctx.args.length === 0) {
        const goal = GoalStore.load();
        return { success: true, command: ctx.command, output: GoalStore.format(goal), data: goal };
      }
      if (ctx.args[0] === 'clear' || ctx.args[0] === 'unset') {
        GoalStore.clear();
        return { success: true, command: ctx.command, output: 'Goal cleared.' };
      }
      const text = ctx.rawArgs;
      const goal = GoalStore.set(text);
      return {
        success: true,
        command: ctx.command,
        output: `Goal set.\n${GoalStore.format(goal)}`,
        data: goal
      };
    },
    {
      description: 'Set, view, or clear the agent goal the session works autonomously toward',
      aliases: ['objective'],
      usage: '/goal <condition> | /goal clear'
    }
  );
}
