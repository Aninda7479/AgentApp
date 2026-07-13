import { KeyInput } from '../types.js';

/** A user prompt awaiting sequential execution. */
export interface QueuedTurn {
  id: string;
  prompt: string;
  timestamp: number;
}

/** FIFO queue for managing turns to be processed in order. */
export class TurnQueueManager {
  private queue: QueuedTurn[] = [];

  /** Adds a prompt to the queue; returns null if empty after trim. */
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

  /** Removes and returns the next turn from the queue. */
  public dequeue(): QueuedTurn | undefined {
    return this.queue.shift();
  }

  /** Returns a shallow copy of all queued turns. */
  public getQueue(): QueuedTurn[] {
    return [...this.queue];
  }

  /** Returns the number of queued turns. */
  public count(): number {
    return this.queue.length;
  }

  /** Clears all queued turns. */
  public clear(): void {
    this.queue = [];
  }
}

/**
 * Handles Tab key shortcut to queue the current input as a turn.
 * @param currentInput - Current text in the input field
 * @param key - Keyboard input event
 * @param onQueue - Callback to enqueue the prompt
 * @param clearInput - Callback to clear the input field
 * @returns true if the shortcut was matched and handled
 */
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
