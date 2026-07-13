import { AgentMessage } from '../types/agent.js';

/** Priority level for a queued agent turn. */
export type TurnPriority = 'normal' | 'high' | 'system';

/** A single turn waiting to be processed by the agent. */
export interface QueuedTurn {
  id: string;
  prompt: string;
  priority: TurnPriority;
  timestamp: number;
  metadata?: Record<string, unknown>;
}

/** Priority-based queue for managing agent conversation turns. */
export class TurnQueue {
  private queue: QueuedTurn[] = [];
  private isProcessingFlag: boolean = false;

  public enqueue(prompt: string, priority: TurnPriority = 'normal', metadata?: Record<string, unknown>): QueuedTurn {
    const item: QueuedTurn = {
      id: `turn-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      prompt,
      priority,
      timestamp: Date.now(),
      metadata
    };

    if (priority === 'system' || priority === 'high') {
      const firstNormalIdx = this.queue.findIndex(q => q.priority === 'normal');
      if (firstNormalIdx !== -1) {
        this.queue.splice(firstNormalIdx, 0, item);
      } else {
        this.queue.push(item);
      }
    } else {
      this.queue.push(item);
    }

    return item;
  }

  public dequeue(): QueuedTurn | undefined {
    return this.queue.shift();
  }

  public peek(): QueuedTurn | undefined {
    return this.queue[0];
  }

  public size(): number {
    return this.queue.length;
  }

  public isEmpty(): boolean {
    return this.queue.length === 0;
  }

  public clear(): void {
    this.queue = [];
  }

  public getPendingItems(): QueuedTurn[] {
    return [...this.queue];
  }

  public isProcessing(): boolean {
    return this.isProcessingFlag;
  }

  public setProcessing(processing: boolean): void {
    this.isProcessingFlag = processing;
  }
}
