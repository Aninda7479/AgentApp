export type SubagentStatus = 'idle' | 'running' | 'completed' | 'failed' | 'terminated';

export interface SubagentTask {
  id: string;
  parentId: string;
  task: string;
  status: SubagentStatus;
  createdAt: number;
  completedAt?: number;
  result?: string;
  error?: string;
}

export type SubagentExecutor = (subagentId: string, task: string) => Promise<string>;

export class SubagentManager {
  private subagents: Map<string, SubagentTask> = new Map();

  public async forkSubagent(
    parentId: string,
    task: string,
    executor?: SubagentExecutor
  ): Promise<SubagentTask> {
    const id = `subagent-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const subagent: SubagentTask = {
      id,
      parentId,
      task,
      status: 'running',
      createdAt: Date.now()
    };

    this.subagents.set(id, subagent);

    if (executor) {
      Promise.resolve()
        .then(() => executor(id, task))
        .then(result => {
          const active = this.subagents.get(id);
          if (active && active.status === 'running') {
            active.status = 'completed';
            active.result = result;
            active.completedAt = Date.now();
          }
        })
        .catch(err => {
          const active = this.subagents.get(id);
          if (active && active.status === 'running') {
            active.status = 'failed';
            active.error = err instanceof Error ? err.message : String(err);
            active.completedAt = Date.now();
          }
        });
    }

    return subagent;
  }

  public getSubagent(id: string): SubagentTask | undefined {
    return this.subagents.get(id);
  }

  public listSubagents(parentId?: string): SubagentTask[] {
    const all = Array.from(this.subagents.values());
    if (parentId) {
      return all.filter(sub => sub.parentId === parentId);
    }
    return all;
  }

  public terminateSubagent(id: string): boolean {
    const sub = this.subagents.get(id);
    if (!sub || sub.status === 'completed' || sub.status === 'failed') {
      return false;
    }
    sub.status = 'terminated';
    sub.completedAt = Date.now();
    return true;
  }
}
