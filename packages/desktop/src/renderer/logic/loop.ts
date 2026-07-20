export interface LoopTask {
  id: string;
  interval: string; // e.g., '5m', '10s'
  intervalMs: number;
  prompt: string;
  isActive: boolean;
  createdAt: string;
  lastRunAt?: string;
  nextRunAt?: string;
}

export function parseIntervalToMs(interval: string): number {
  const match = interval.trim().match(/^(\d+)([smhd])$/i);
  if (!match) {
    return 10 * 60 * 1000;
  }
  const value = parseInt(match[1], 10);
  const unit = match[2].toLowerCase();
  switch (unit) {
    case 's':
      return value * 1000;
    case 'm':
      return value * 60 * 1000;
    case 'h':
      return value * 60 * 60 * 1000;
    case 'd':
      return value * 24 * 60 * 60 * 1000;
    default:
      return 10 * 60 * 1000;
  }
}

export async function loadLoopPrompt(workspacePath?: string | (() => string | undefined)): Promise<string> {
  const resolvedPath = typeof workspacePath === 'function' ? workspacePath() : workspacePath;
  if (resolvedPath) {
    try {
      // File reads happen in the main process (the renderer has no `fs` under
      // contextIsolation). The bridge routes this to the `loop-read` handler.
      const { readLoopPrompt } = await import('../lib/electron');
      const prompt = await readLoopPrompt(resolvedPath);
      if (prompt) return prompt.trim();
    } catch {
      // Fall through to default
    }
  }
  return 'Run a proactive session maintenance check, inspect build status or recent file changes, and address any pending issues.';
}

export class SessionLoopManager {
  private tasks: Map<string, { task: LoopTask; timer: NodeJS.Timeout }> = new Map();
  private onTrigger: (task: LoopTask) => void;
  private workspacePath?: string | (() => string | undefined);

  constructor(onTrigger: (task: LoopTask) => void, workspacePath?: string | (() => string | undefined)) {
    this.onTrigger = onTrigger;
    this.workspacePath = workspacePath;
  }

  public async start(intervalStr?: string, customPrompt?: string): Promise<LoopTask> {
    const interval = intervalStr || '10m';
    const intervalMs = parseIntervalToMs(interval);
    const prompt = customPrompt || (await loadLoopPrompt(this.workspacePath));
    const id = `loop-${Math.random().toString(36).substring(2, 9)}`;
    const now = new Date();
    
    const task: LoopTask = {
      id,
      interval,
      intervalMs,
      prompt,
      isActive: true,
      createdAt: now.toISOString(),
      nextRunAt: new Date(now.getTime() + intervalMs).toISOString()
    };

    const timer = setInterval(() => {
      const runTime = new Date();
      task.lastRunAt = runTime.toISOString();
      task.nextRunAt = new Date(runTime.getTime() + task.intervalMs).toISOString();
      this.onTrigger(task);
    }, intervalMs);

    this.tasks.set(id, { task, timer });
    return task;
  }

  public stop(id: string): boolean {
    const entry = this.tasks.get(id);
    if (!entry) return false;
    clearInterval(entry.timer);
    entry.task.isActive = false;
    this.tasks.delete(id);
    return true;
  }

  public getTasks(): LoopTask[] {
    return Array.from(this.tasks.values()).map(e => e.task);
  }

  public clear(): void {
    for (const entry of this.tasks.values()) {
      clearInterval(entry.timer);
    }
    this.tasks.clear();
  }
}
