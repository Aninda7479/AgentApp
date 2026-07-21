/**
 * `RunManager` — the single owner of per-chat run orchestration in the Desktop
 * renderer. It sits between the Composer (which just wants to "send a prompt")
 * and `AgentService.sendPrompt` (which starts exactly one run for one chat), and
 * adds two capabilities the app lacked:
 *
 *   1. **Chat queue** — if you send a prompt to a chat that is already running,
 *      the prompt is enqueued and automatically run once the in-flight response
 *      ends (drained on the session's terminal `agent-event`).
 *   2. **Multi-chat concurrency** — it keeps one `StreamingRefs` bundle *per
 *      chat* (keyed by chatId) so several chats can stream simultaneously
 *      without their token buffers / step ids clobbering each other. The old
 *      design had a single global bundle, which is why only one chat could ever
 *      stream at a time.
 *
 * The `running` set is the synchronous source of truth for the queue decision
 * (it must be instant, independent of React render timing); the per-chat
 * `isRunning` field on `StoredChat` remains the display source of truth. The
 * `starter` callback is injected by `App.tsx` so this module never imports
 * `AgentService` (avoids a circular dependency).
 */
import type { AppContext, ComposerOptions, ComposerAttachment } from './types';
import type { StreamingRefs } from './agent';

/** A prompt waiting to run for a chat whose previous response is still in flight. */
export interface QueuedItem {
  prompt: string;
  options: ComposerOptions;
  /** Attachment snapshots taken at enqueue time (composer is cleared immediately). */
  attachments: ComposerAttachment[];
}

export class RunManager {
  /** chatId → whether a run is currently in flight for that chat (synchronous). */
  private running = new Set<string>();
  /** chatId → ordered list of prompts waiting to run after the current run ends. */
  private queues = new Map<string, QueuedItem[]>();
  /** chatId → the streaming-ref bundle the `agent-event` handler writes into. */
  private streamRefs = new Map<string, StreamingRefs>();
  /**
   * Injected by `App.tsx`; invoked by `onTerminal` to actually start the next
   * queued run. Kept as a callback so this module doesn't import `AgentService`.
   */
  private starter: ((item: QueuedItem) => void) | null = null;

  /** Injects the function that starts a queued run (set once by `App.tsx`). */
  setStarter(fn: (item: QueuedItem) => void): void {
    this.starter = fn;
  }

  /** True while any chat has a run in flight (drives the global "generating" UI). */
  isAnyGenerating(): boolean {
    return this.running.size > 0;
  }

  /** True while the given chat has a run in flight. */
  isRunning(chatId: string): boolean {
    return this.running.has(chatId);
  }

  /** Number of prompts waiting in the given chat's queue (for the sidebar badge). */
  queueDepth(chatId: string): number {
    return this.queues.get(chatId)?.length ?? 0;
  }

  /** Marks a chat as having an in-flight run (call before starting the engine). */
  markRunning(chatId: string): void {
    this.running.add(chatId);
  }

  /** Marks a chat as idle (call on the terminal `agent-event`). */
  markIdle(chatId: string): void {
    this.running.delete(chatId);
  }

  /** Appends a prompt to a chat's queue. */
  enqueue(chatId: string, item: QueuedItem): void {
    const list = this.queues.get(chatId) ?? [];
    list.push(item);
    this.queues.set(chatId, list);
  }

  /** Removes and returns the next queued prompt for a chat, or null if empty. */
  dequeue(chatId: string): QueuedItem | null {
    const list = this.queues.get(chatId);
    if (!list || list.length === 0) return null;
    const [next, ...rest] = list;
    if (rest.length > 0) this.queues.set(chatId, rest);
    else this.queues.delete(chatId);
    return next;
  }

  /**
   * Returns the streaming-ref bundle for a chat, creating one on first use.
   * Because each chat gets its own bundle, concurrent chats stream into their
   * own buffers/step ids and never interfere.
   */
  getStreamRefs(chatId: string): StreamingRefs {
    let refs = this.streamRefs.get(chatId);
    if (!refs) {
      refs = {
        chatIdRef: { current: null },
        bufferRef: { current: '' },
        stepIdRef: { current: null },
        responseSeqRef: { current: 0 }
      };
      this.streamRefs.set(chatId, refs);
    }
    return refs;
  }

  /**
   * Called by the `agent-event` streaming handler when a chat's run terminates
   * (done/error/abort). Marks the chat idle and, if prompts are queued, kicks
   * off the next one via the injected `starter`.
   */
  onTerminal(chatId: string): void {
    this.markIdle(chatId);
    const next = this.dequeue(chatId);
    if (next) this.starter?.(next);
  }

  /** Drops all per-chat state — used on full store reset / logout. */
  reset(): void {
    this.running.clear();
    this.queues.clear();
    this.streamRefs.clear();
  }
}

/** Process-wide singleton shared by `agent.ts`, `agentStream.ts`, and `App.tsx`. */
export const runManager = new RunManager();
