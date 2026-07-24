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

  public init(): void {
    if (this.isListening) return;
    const ipc = IpcBridge.getIpc();
    if (!ipc) return;

    ipc.on('agent-event', (_evt: unknown, ...args: unknown[]) => {
      const agentEvent = args[0] as AgentEvent | undefined;
      if (!agentEvent || !agentEvent.sessionId) return;

      const sessionListeners = this.listeners.get(agentEvent.sessionId);
      if (sessionListeners) {
        sessionListeners.forEach((listener) => {
          try {
            listener(agentEvent);
          } catch (err) {
            console.error(`[AgentEventBus] Listener error for session ${agentEvent.sessionId}:`, err);
          }
        });
      }
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
    const set = this.listeners.get(sessionId);
    if (set) {
      set.delete(listener);
      if (set.size === 0) {
        this.listeners.delete(sessionId);
      }
    }
  }

  public clearSession(sessionId: string): void {
    this.listeners.delete(sessionId);
  }
}

export const agentEventBus = new AgentEventBusManager();
