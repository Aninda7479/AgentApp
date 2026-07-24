/**
 * Session Store for SuperAgent Desktop
 * Manages active parallel agent runs and prompt queues per chat session.
 */

import { useSyncExternalStore } from 'react';
import type { QueuedRunItem, ContextUsage } from '../core/types';

export interface ActiveSessionState {
  chatId: string;
  isGenerating: boolean;
  startedAt: number;
  lastError?: string;
  contextUsage?: ContextUsage | null;
}

export interface SessionStoreState {
  runningSessions: Map<string, ActiveSessionState>;
  queues: Map<string, QueuedRunItem[]>;
}

class SessionStoreManager {
  private state: SessionStoreState = {
    runningSessions: new Map(),
    queues: new Map(),
  };

  private listeners: Set<() => void> = new Set();

  public getState(): SessionStoreState {
    return this.state;
  }

  public subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  private emit(): void {
    this.listeners.forEach((fn) => fn());
  }

  public markRunning(chatId: string, startedAt: number = Date.now()): void {
    const newSessions = new Map(this.state.runningSessions);
    newSessions.set(chatId, {
      chatId,
      isGenerating: true,
      startedAt,
      contextUsage: null,
    });
    this.state = { ...this.state, runningSessions: newSessions };
    this.emit();
  }

  public markIdle(chatId: string, error?: string): void {
    const newSessions = new Map(this.state.runningSessions);
    const existing = newSessions.get(chatId);
    if (existing) {
      if (error) {
        newSessions.set(chatId, { ...existing, isGenerating: false, lastError: error });
      } else {
        newSessions.delete(chatId);
      }
    }
    this.state = { ...this.state, runningSessions: newSessions };
    this.emit();
  }

  public updateContextUsage(chatId: string, usage: ContextUsage): void {
    const newSessions = new Map(this.state.runningSessions);
    const existing = newSessions.get(chatId);
    if (existing) {
      newSessions.set(chatId, { ...existing, contextUsage: usage });
      this.state = { ...this.state, runningSessions: newSessions };
      this.emit();
    }
  }

  public isRunning(chatId: string): boolean {
    return this.state.runningSessions.get(chatId)?.isGenerating ?? false;
  }

  public isAnyGenerating(): boolean {
    return Array.from(this.state.runningSessions.values()).some((s) => s.isGenerating);
  }

  public enqueue(chatId: string, item: QueuedRunItem): void {
    const newQueues = new Map(this.state.queues);
    const list = newQueues.get(chatId) || [];
    list.push(item);
    newQueues.set(chatId, list);
    this.state = { ...this.state, queues: newQueues };
    this.emit();
  }

  public dequeue(chatId: string): QueuedRunItem | null {
    const newQueues = new Map(this.state.queues);
    const list = newQueues.get(chatId);
    if (!list || list.length === 0) return null;
    const [next, ...rest] = list;
    if (rest.length > 0) newQueues.set(chatId, rest);
    else newQueues.delete(chatId);
    this.state = { ...this.state, queues: newQueues };
    this.emit();
    return next;
  }

  public getQueueDepth(chatId: string): number {
    return this.state.queues.get(chatId)?.length ?? 0;
  }
}

export const sessionStore = new SessionStoreManager();

export function useSessionStore<T>(selector: (state: SessionStoreState) => T): T {
  return useSyncExternalStore(
    sessionStore.subscribe,
    () => selector(sessionStore.getState()),
    () => selector(sessionStore.getState())
  );
}
