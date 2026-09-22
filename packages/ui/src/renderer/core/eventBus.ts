/**
 * Agent Event Bus for SuperAgent Desktop
 * Single IPC subscriber for 'agent-event', dispatching to registered session listeners.
 */

import { IpcBridge } from './ipc';
import type { AgentEvent } from './types';

export type SessionEventListener = (event: AgentEvent) => void;

class AgentEventBusManager {
  private listeners: Map<string, Set<SessionEventListener>> = new Map();
  private isListening = false;

  private getListenersForSession(sessionId: string): Set<SessionEventListener> {
    const matched = new Set<SessionEventListener>();
    const clean = sessionId.replace(/^session-/, '');
    const pref = `session-${clean}`;

    for (const key of [sessionId, clean, pref]) {
      const set = this.listeners.get(key);
      if (set) {
        set.forEach((listener) => matched.add(listener));
      }
    }
    return matched;
  }

  public init(): void {
    if (this.isListening) return;
    const ipc = IpcBridge.getIpc();
    if (!ipc) return;

    ipc.on('agent-event', (_evt: unknown, ...args: unknown[]) => {
      const agentEvent = args[0] as AgentEvent | undefined;
      if (!agentEvent || !agentEvent.sessionId) return;

      const sessionListeners = this.getListenersForSession(agentEvent.sessionId);
      sessionListeners.forEach((listener) => {
        try {
          listener(agentEvent);
        } catch (err) {
          console.error(`[AgentEventBus] Listener error for session ${agentEvent.sessionId}:`, err);
        }
      });
    });

    this.isListening = true;
  }

  public subscribe(sessionId: string, listener: SessionEventListener): () => void {
    this.init();
    let set = this.listeners.get(sessionId);
    if (!set) {
      set = new Set();
      this.listeners.set(sessionId, set);
    }
    set.add(listener);

    return () => {
      this.unsubscribe(sessionId, listener);
    };
  }

  public unsubscribe(sessionId: string, listener: SessionEventListener): void {
    const clean = sessionId.replace(/^session-/, '');
    const pref = `session-${clean}`;
    for (const key of [sessionId, clean, pref]) {
      const set = this.listeners.get(key);
      if (set) {
        set.delete(listener);
        if (set.size === 0) {
          this.listeners.delete(key);
        }
      }
    }
  }

  public clearSession(sessionId: string): void {
    const clean = sessionId.replace(/^session-/, '');
    const pref = `session-${clean}`;
    this.listeners.delete(sessionId);
    this.listeners.delete(clean);
    this.listeners.delete(pref);
  }
}

export const agentEventBus = new AgentEventBusManager();
