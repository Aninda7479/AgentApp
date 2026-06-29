import { KeyInput } from '../types.js';

export interface QueuedTurn {
  id: string;
  prompt: string;
  timestamp: number;
}

export class TurnQueueManager {
  private queue: QueuedTurn[] = [];

  public enqueue(prompt: string): QueuedTurn | null {
    const trimmed = prompt.trim();
    if (!trimmed) {
      return null;
    }
    const item: QueuedTurn = {
      id: `turn-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      prompt: trimmed,
      timestamp: Date.now(),
    };
    this.queue.push(item);
    return item;
  }

  public dequeue(): QueuedTurn | undefined {
    return this.queue.shift();
  }

  public getQueue(): QueuedTurn[] {
    return [...this.queue];
  }

  public count(): number {
    return this.queue.length;
  }

  public clear(): void {
    this.queue = [];
  }
}

export function handleQueueShortcut(
  currentInput: string,
  key: KeyInput,
  onQueue: (prompt: string) => void,
  clearInput: () => void
): boolean {
  if ((key.name === 'tab' || key.tab) && !key.shift) {
    if (currentInput.trim().length > 0) {
      onQueue(currentInput.trim());
      clearInput();
      return true;
    }
  }
  return false;
}
