import { SlashCommandRouter, SlashCommandContext, SlashCommandResult } from './router.js';

export interface LoopCommandDeps {
  startLoop?: (prompt?: string, interval?: string) => string;
  stopLoop?: (id: string) => boolean;
  listLoops?: () => any[];
  clearLoops?: () => void;
}

export function registerLoopCommand(router: SlashCommandRouter, deps: LoopCommandDeps): void {
  router.register(
    'loop',
    async (ctx: SlashCommandContext): Promise<SlashCommandResult> => {
      const args = ctx.args;
      
      if (!deps.startLoop || !deps.stopLoop || !deps.listLoops || !deps.clearLoops) {
        return {
          success: false,
          command: ctx.command,
          error: 'Loop execution is not supported in this environment.'
        };
      }

      if (args[0] === 'list' || args[0] === 'status') {
        const tasks = deps.listLoops();
        if (tasks.length === 0) {
          return { success: true, command: ctx.command, output: 'No active loop tasks running.' };
        }
        const lines = ['=== Active Loop Tasks ==='];
        for (const t of tasks) {
          lines.push(`ID: ${t.id} | Interval: ${t.interval} | Prompt: "${t.prompt}" | Next Run: ${t.nextRunAt}`);
        }
        return { success: true, command: ctx.command, output: lines.join('\n') };
      }

      if (args[0] === 'stop' || args[0] === 'cancel') {
        const id = args[1];
        if (!id) {
          return { success: false, command: ctx.command, error: 'Please specify the loop task ID to stop: /loop stop <id>' };
        }
        const stopped = deps.stopLoop(id);
        if (stopped) {
          return { success: true, command: ctx.command, output: `Stopped loop task: ${id}` };
        } else {
          return { success: false, command: ctx.command, error: `Loop task ID not found: ${id}` };
        }
      }

      if (args[0] === 'clear') {
        deps.clearLoops();
        return { success: true, command: ctx.command, output: 'All active loop tasks stopped.' };
      }

      // Parse optional interval
      let interval: string | undefined = undefined;
      let prompt: string | undefined = undefined;

      if (args[0] && /^\d+[smhd]$/i.test(args[0])) {
        interval = args[0];
        prompt = ctx.rawArgs.substring(interval.length).trim() || undefined;
      } else {
        prompt = ctx.rawArgs.trim() || undefined;
      }

      try {
        const taskId = deps.startLoop(prompt, interval);
        const tasks = deps.listLoops();
        const t = tasks.find(x => x.id === taskId);
        return {
          success: true,
          command: ctx.command,
          output: `Loop started successfully.\nTask ID: ${taskId}\nInterval: ${t?.interval || interval || '10m'}\nPrompt: "${t?.prompt || prompt || 'Default maintenance'}"\nNext Run: ${t?.nextRunAt}`,
          data: t
        };
      } catch (err) {
        return {
          success: false,
          command: ctx.command,
          error: `Failed to start loop: ${(err as Error).message}`
        };
      }
    },
    {
      description: 'Start, stop, or list recurring agent prompts/maintenance tasks',
      aliases: ['proactive'],
      usage: '/loop [interval] [prompt] | /loop list | /loop stop <id> | /loop clear'
    }
  );
}
