import { SlashCommandRouter, SlashCommandContext, SlashCommandResult } from './router.js';

/** Lifecycle state of a background task or subagent. */
export type TaskStatus = 'queued' | 'running' | 'done' | 'failed';

/** A tracked background task or spawned subagent. */
export interface BackgroundTask {
  id: string;
  name: string;
  status: TaskStatus;
  startedAt: string;
  finishedAt?: string;
  log: string[];
}

/**
 * Tracks background tasks / spawned subagents (maps to the Claude `/tasks`
 * slash command and the Subagent Orchestration + Scheduled-Tasks features
 * described in the docs). Pure in-memory with a stable incrementing id so it
 * is fully deterministic and testable; the `/tasks` command exposes
 * list/add/done/fail/rm/clear operations.
 */
export class TaskManager {
  private tasks: Map<string, BackgroundTask> = new Map();
  private seq = 0;

  /** Registers a new task in the `queued` state and returns it. */
  public add(name: string): BackgroundTask {
    const id = `task-${++this.seq}`;
    const task: BackgroundTask = {
      id,
      name: name.trim() || id,
      status: 'queued',
      startedAt: new Date().toISOString(),
      log: []
    };
    this.tasks.set(id, task);
    return task;
  }

  /** Returns a task by id, or undefined if not found. */
  public get(id: string): BackgroundTask | undefined {
    return this.tasks.get(id);
  }

  /** Lists all tasks, most-recently-added first. */
  public list(): BackgroundTask[] {
    return Array.from(this.tasks.values()).reverse();
  }

  /** Updates mutable fields of a task (status, finishedAt, name). */
  public update(id: string, patch: Partial<Pick<BackgroundTask, 'status' | 'name'>>): BackgroundTask | undefined {
    const task = this.tasks.get(id);
    if (!task) return undefined;
    if (patch.status !== undefined) {
      task.status = patch.status;
      if (patch.status === 'done' || patch.status === 'failed') {
        task.finishedAt = new Date().toISOString();
      }
    }
    if (patch.name !== undefined) task.name = patch.name;
    return task;
  }

  /** Appends a log line to a task. */
  public log(id: string, line: string): void {
    const task = this.tasks.get(id);
    if (task) task.log.push(line);
  }

  /** Removes a single task by id. Returns true if it existed. */
  public remove(id: string): boolean {
    return this.tasks.delete(id);
  }

  /** Clears all tracked tasks. */
  public clear(): void {
    this.tasks.clear();
  }

  /** Renders the task list as a human-readable multi-line string. */
  public static formatList(tasks: BackgroundTask[]): string {
    if (tasks.length === 0) {
      return 'No active background tasks. Use /tasks add <name> to start one.';
    }
    const icon: Record<TaskStatus, string> = { queued: '⏳', running: '▶', done: '✓', failed: '✗' };
    const lines: string[] = ['=== Background Tasks ==='];
    for (const t of tasks) {
      lines.push(`${icon[t.status]} ${t.id}  ${t.name}  [${t.status}]`);
    }
    lines.push('');
    lines.push(`Total: ${tasks.length} task(s).`);
    return lines.join('\n');
  }
}

/** Registers the `/tasks` slash command for background task management. */
export function registerTasksCommand(router: SlashCommandRouter, manager: TaskManager): void {
  router.register(
    'tasks',
    async (ctx: SlashCommandContext): Promise<SlashCommandResult> => {
      const [sub, ...rest] = ctx.args;

      if (!sub || sub === 'list') {
        return {
          success: true,
          command: ctx.command,
          output: TaskManager.formatList(manager.list()),
          data: manager.list()
        };
      }

      if (sub === 'add') {
        const name = rest.join(' ');
        if (!name) {
          return { success: false, command: ctx.command, output: 'Usage: /tasks add <name>', error: 'Missing task name' };
        }
        const task = manager.add(name);
        return {
          success: true,
          command: ctx.command,
          output: `Created ${task.id}: "${task.name}" (status: queued).`,
          data: task
        };
      }

      if (sub === 'done' || sub === 'finish' || sub === 'fail') {
        const id = rest[0];
        if (!id) {
          return { success: false, command: ctx.command, output: `Usage: /tasks ${sub} <id>`, error: 'Missing task id' };
        }
        const status: TaskStatus = sub === 'fail' ? 'failed' : 'done';
        const updated = manager.update(id, { status });
        if (!updated) {
          return { success: false, command: ctx.command, output: `No task found with id "${id}"`, error: 'Task not found' };
        }
        return {
          success: true,
          command: ctx.command,
          output: `Marked ${id} as ${status}.`,
          data: updated
        };
      }

      if (sub === 'rm' || sub === 'remove') {
        const id = rest[0];
        if (!id || !manager.remove(id)) {
          return { success: false, command: ctx.command, output: `No task found with id "${id ?? ''}"`, error: 'Task not found' };
        }
        return { success: true, command: ctx.command, output: `Removed ${id}.` };
      }

      if (sub === 'clear') {
        const count = manager.list().length;
        manager.clear();
        return { success: true, command: ctx.command, output: `Cleared ${count} task(s).` };
      }

      return {
        success: false,
        command: ctx.command,
        output: 'Usage: /tasks [list | add <name> | done <id> | fail <id> | rm <id> | clear]',
        error: `Unknown tasks subcommand: ${sub}`
      };
    },
    {
      description: 'List and manage background tasks / subagents',
      aliases: ['task', 'bg'],
      usage: '/tasks [list | add <name> | done <id> | fail <id> | rm <id> | clear]'
    }
  );
}
