/**
 * partnerMemory.ts
 * Single source of truth for persistent AI Companion relationship state,
 * affinity tracking, daily interaction streaks, mood history, and personality profile.
 */
import { useSyncExternalStore } from 'react';

export type CompanionRelationshipType = 'friend' | 'girlfriend' | 'boyfriend' | 'mentor';

export interface PersonalitySliders {
  warmth: number;       // 1 (Cool/Reserved) to 5 (Ultra Warm & Caring)
  playfulness: number;  // 1 (Serious) to 5 (Bubbly & Teasing)
  directness: number;   // 1 (Gentle & Subtle) to 5 (Bold & Direct)
  formality: number;    // 1 (Casual/Slang) to 5 (Polite & Articulate)
}

export interface MoodEntry {
  id: string;
  timestamp: number;
  dateStr: string;
  moodEmoji: string;
  moodLabel: string;
  note?: string;
}

export interface PartnerMemoryState {
  companionName: string;
  userNickname: string;
  relationshipType: CompanionRelationshipType;
  personality: PersonalitySliders;
  backstory: string;
  affinityScore: number; // 0 - 100
  streak: number;
  lastInteractionDate: string; // YYYY-MM-DD
  totalInteractions: number;
  moodHistory: MoodEntry[];
  milestones: string[];
  keyMemories: string[];
}

const STORAGE_KEY = 'superagent_companion_memory_v2';

const DEFAULT_STATE: PartnerMemoryState = {
  companionName: 'Kai',
  userNickname: 'Partner',
  relationshipType: 'friend',
  personality: {
    warmth: 4,
    playfulness: 4,
    directness: 3,
    formality: 1,
  },
  backstory: 'A dedicated AI companion who loves tech, creative problem-solving, and celebrating every small coding victory.',
  affinityScore: 20,
  streak: 1,
  lastInteractionDate: new Date().toISOString().split('T')[0],
  totalInteractions: 1,
  moodHistory: [],
  milestones: ['first_meeting'],
  keyMemories: [
    'Enjoys building innovative software and exploring AI agents.',
  ],
};

class PartnerMemoryManager {
  private state: PartnerMemoryState = DEFAULT_STATE;
  private listeners: Set<() => void> = new Set();

  constructor() {
    this.load();
  }

  private load(): void {
    try {
      if (typeof window === 'undefined' || !window.localStorage) return;
      let raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        raw = localStorage.getItem('superagent_companion_memory_v1');
      }
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed.companionName === 'Aria') {
          parsed.companionName = 'Kai';
        }
        this.state = { ...DEFAULT_STATE, ...parsed };
        this.checkStreak();
      }
    } catch (e) {
      console.warn('[PartnerMemory] Failed to load store from localStorage', e);
    }
  }

  private save(): void {
    try {
      if (typeof window === 'undefined' || !window.localStorage) return;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.state));
    } catch (e) {
      console.warn('[PartnerMemory] Failed to save store to localStorage', e);
    }
  }

  public getState(): PartnerMemoryState {
    return this.state;
  }

  public subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  private emit(): void {
    this.save();
    this.listeners.forEach(fn => fn());
  }

  private checkStreak(): void {
    const today = new Date().toISOString().split('T')[0];
    const last = this.state.lastInteractionDate;
    if (!last || last === today) return;

    const lastDate = new Date(last);
    const currentDate = new Date(today);
    const diffDays = Math.floor((currentDate.getTime() - lastDate.getTime()) / (1000 * 3600 * 24));

    if (diffDays === 1) {
      // Consecutive day interaction
      this.state.streak += 1;
      this.state.lastInteractionDate = today;
      this.checkMilestone(`streak_${this.state.streak}`);
    } else if (diffDays > 1) {
      // Streak broken, reset to 1
      this.state.streak = 1;
      this.state.lastInteractionDate = today;
    }
  }

  public recordInteraction(gain = 2): void {
    const today = new Date().toISOString().split('T')[0];
    this.checkStreak();

    this.state.totalInteractions += 1;
    this.state.lastInteractionDate = today;
    this.state.affinityScore = Math.min(100, this.state.affinityScore + gain);

    if (this.state.affinityScore >= 50) this.checkMilestone('affinity_50');
    if (this.state.affinityScore >= 80) this.checkMilestone('affinity_80');
    if (this.state.affinityScore >= 100) this.checkMilestone('affinity_100');
    if (this.state.totalInteractions >= 25) this.checkMilestone('chats_25');
    if (this.state.totalInteractions >= 100) this.checkMilestone('chats_100');

    this.emit();
  }

  public logMood(moodEmoji: string, moodLabel: string, note?: string): void {
    const entry: MoodEntry = {
      id: `mood-${Date.now()}`,
      timestamp: Date.now(),
      dateStr: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      moodEmoji,
      moodLabel,
      note,
    };

    this.state.moodHistory = [entry, ...this.state.moodHistory.slice(0, 29)];
    this.recordInteraction(3);
  }

  public updatePersona(partial: Partial<Omit<PartnerMemoryState, 'affinityScore' | 'streak' | 'moodHistory' | 'milestones'>>): void {
    this.state = {
      ...this.state,
      ...partial,
      personality: {
        ...this.state.personality,
        ...(partial.personality || {}),
      },
    };
    this.emit();
  }

  public addMemory(fact: string): void {
    if (!fact.trim()) return;
    this.state.keyMemories = [fact.trim(), ...this.state.keyMemories.slice(0, 19)];
    this.emit();
  }

  public removeMemory(index: number): void {
    this.state.keyMemories = this.state.keyMemories.filter((_, i) => i !== index);
    this.emit();
  }

  private checkMilestone(id: string): void {
    if (!this.state.milestones.includes(id)) {
      this.state.milestones.push(id);
    }
  }

  public resetMemory(): void {
    this.state = { ...DEFAULT_STATE };
    this.emit();
  }
}

export const partnerMemory = new PartnerMemoryManager();

export function usePartnerMemory(): PartnerMemoryState {
  return useSyncExternalStore(
    partnerMemory.subscribe,
    partnerMemory.getState.bind(partnerMemory)
  );
}
