/**
 * SuperAgent Browser Extension — Global Memory & Knowledge Bridge
 * Connects the extension to UserProfileStore, LearningLoopEngine, and SkillStore
 */

import { apiClient } from './api-client.js';

export interface UserProfileEntry {
  key: string;
  value: unknown;
  category: 'preference' | 'identity' | 'environment' | 'custom';
  updatedAt: number;
}

export interface LearnedInsight {
  id: string;
  topic: string;
  lesson: string;
  category: 'error_prevention' | 'user_preference' | 'workflow_optimization';
  timestamp: number;
}

export class MemoryBridge {
  public static async getUserProfile(): Promise<UserProfileEntry[]> {
    try {
      const data = await apiClient.invokeIpc<Record<string, UserProfileEntry>>('store-read', 'user_profile.json');
      if (data && typeof data === 'object') {
        return Object.values(data);
      }
      return [];
    } catch {
      return [];
    }
  }

  public static async getLearnedInsights(): Promise<LearnedInsight[]> {
    try {
      const data = await apiClient.invokeIpc<LearnedInsight[]>('store-read', 'learned_insights.json');
      return Array.isArray(data) ? data : [];
    } catch {
      return [];
    }
  }

  public static async getGlobalSkills(): Promise<any[]> {
    try {
      const skills = await apiClient.invokeIpc<any[]>('skills-list');
      return Array.isArray(skills) ? skills : [];
    } catch {
      return [];
    }
  }

  public static async getOrchestratorInstructions(): Promise<string> {
    try {
      const instructions = await apiClient.invokeIpc<string>('orchestrator-read-instructions');
      return typeof instructions === 'string' ? instructions : '';
    } catch {
      return '';
    }
  }
}
