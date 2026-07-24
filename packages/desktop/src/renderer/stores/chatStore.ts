/**
 * Chat & Project Store for SuperAgent Desktop
 * Manages projects, metadata-only chats, resident step cache, and active selection.
 * Uses useSyncExternalStore pattern for reactivity.
 */

import { useSyncExternalStore } from 'react';
import type { StoredProject, StoredChat, TrajectoryStep } from '../core/types';

const EMPTY_STEPS: TrajectoryStep[] = [];

export interface ChatStoreState {
  projects: StoredProject[];
  chats: StoredChat[];
  activeChatId: string | null;
  activeProject: string;
  draftProject: string;
  residentSteps: Map<string, TrajectoryStep[]>;
  activePanels: string[]; // List of chatIds displayed side-by-side in WorkspaceView
}

class ChatStoreManager {
  private state: ChatStoreState = {
    projects: [],
    chats: [],
    activeChatId: null,
    activeProject: '',
    draftProject: '',
    residentSteps: new Map(),
    activePanels: [],
  };

  private listeners: Set<() => void> = new Set();
  private RESIDENT_CAP = 5;

  public getState(): ChatStoreState {
    return this.state;
  }

  public subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  private emit(): void {
    this.listeners.forEach((fn) => fn());
  }

  public setState(updater: (prev: ChatStoreState) => Partial<ChatStoreState>): void {
    const next = updater(this.state);
    this.state = { ...this.state, ...next };
    this.emit();
  }

  public setProjects(projects: StoredProject[]): void {
    this.setState(() => ({ projects }));
  }

  public setChats(chats: StoredChat[]): void {
    this.setState(() => ({ chats }));
  }

  public setActiveChatId(activeChatId: string | null): void {
    this.setState((prev) => {
      const activePanels = activeChatId && !prev.activePanels.includes(activeChatId)
        ? [...prev.activePanels, activeChatId]
        : prev.activePanels;
      return { activeChatId, activePanels };
    });
  }

  public setActiveProject(activeProject: string): void {
    this.setState(() => ({ activeProject }));
  }

  public setDraftProject(draftProject: string): void {
    this.setState(() => ({ draftProject }));
  }

  public openPanel(chatId: string): void {
    this.setState((prev) => ({
      activePanels: prev.activePanels.includes(chatId) ? prev.activePanels : [...prev.activePanels, chatId],
      activeChatId: chatId,
    }));
  }

  public closePanel(chatId: string): void {
    this.setState((prev) => {
      const activePanels = prev.activePanels.filter((id) => id !== chatId);
      const activeChatId = prev.activeChatId === chatId ? (activePanels[activePanels.length - 1] || null) : prev.activeChatId;
      return { activePanels, activeChatId };
    });
  }

  public setSteps(chatId: string, steps: TrajectoryStep[]): void {
    this.setState((prev) => {
      const newMap = new Map(prev.residentSteps);
      newMap.set(chatId, steps);

      // Enforce LRU resident capacity
      if (newMap.size > this.RESIDENT_CAP) {
        const keys = Array.from(newMap.keys());
        for (const k of keys) {
          if (k !== prev.activeChatId && !prev.activePanels.includes(k)) {
            newMap.delete(k);
            if (newMap.size <= this.RESIDENT_CAP) break;
          }
        }
      }

      // Also update meta chat record steps for active view
      const updatedChats = prev.chats.map((c) => (c.id === chatId ? { ...c, steps } : c));
      return { residentSteps: newMap, chats: updatedChats };
    });
  }

  public updateSteps(chatId: string, updater: (prev: TrajectoryStep[]) => TrajectoryStep[]): void {
    const currentSteps = this.state.residentSteps.get(chatId) || EMPTY_STEPS;
    const nextSteps = updater(currentSteps);
    this.setSteps(chatId, nextSteps);
  }

  public getSteps(chatId: string): TrajectoryStep[] {
    return this.state.residentSteps.get(chatId) || EMPTY_STEPS;
  }
}

export const chatStore = new ChatStoreManager();

export function useChatStore<T>(selector: (state: ChatStoreState) => T): T {
  return useSyncExternalStore(
    chatStore.subscribe,
    () => selector(chatStore.getState()),
    () => selector(chatStore.getState())
  );
}
