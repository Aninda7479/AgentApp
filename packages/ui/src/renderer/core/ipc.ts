/**
 * Strongly Typed IPC Bridge Wrapper for SuperAgent Desktop
 * Delegates to the canonical getIpc and isDesktopApp helpers from lib/ipc.
 */

import type { ProviderConnection, ModelConfig, StoredProject, StoredChat, TrajectoryStep, AgentEvent } from './types';
import { getIpc, isDesktopApp } from '../lib/ipc';

export interface DesktopIpcBridge {
  invoke(channel: string, ...args: unknown[]): Promise<unknown>;
  on(channel: string, listener: (event: unknown, ...args: unknown[]) => void): void;
  removeListener(channel: string, listener: (event: unknown, ...args: unknown[]) => void): void;
}

export class IpcBridge {
  static getIpc(): DesktopIpcBridge | null {
    return getIpc();
  }

  static isDesktop(): boolean {
    return isDesktopApp();
  }

  static async invoke<T>(channel: string, ...args: unknown[]): Promise<T> {
    const ipc = IpcBridge.getIpc();
    if (!ipc) {
      throw new Error(`[IPC Error] Environment is not Desktop app. Channel: ${channel}`);
    }
    const res = (await ipc.invoke(channel, ...args)) as { __ipcError?: boolean; error?: string } | T;
    if (res && typeof res === 'object' && '__ipcError' in res && res.__ipcError) {
      throw new Error(`[IPC Error: ${channel}] ${res.error || 'Unknown IPC Error'}`);
    }
    return res as T;
  }

  // Domain specific IPC calls
  static async readStore(): Promise<{
    connectedProviders?: ProviderConnection[];
    modelsCatalog?: ModelConfig[];
    projects?: StoredProject[];
    chats?: StoredChat[];
  }> {
    try {
      const data = await IpcBridge.invoke<{
        connectedProviders?: ProviderConnection[];
        modelsCatalog?: ModelConfig[];
        projects?: StoredProject[];
        chats?: StoredChat[];
      }>('store-read');
      return data || {};
    } catch {
      return {};
    }
  }

  static async writeStore(data: {
    connectedProviders: ProviderConnection[];
    modelsCatalog: ModelConfig[];
    projects: StoredProject[];
    chats: StoredChat[];
  }): Promise<void> {
    try {
      await IpcBridge.invoke('store-write', data);
    } catch {}
  }

  static async readChatSteps(chatId: string): Promise<TrajectoryStep[]> {
    try {
      const steps = await IpcBridge.invoke<TrajectoryStep[]>('chat-steps-read', chatId);
      return Array.isArray(steps) ? steps : [];
    } catch {
      return [];
    }
  }

  static async runAgent(payload: {
    sessionId: string;
    prompt: string;
    config: Record<string, unknown>;
    currentAttachments?: string[];
    history?: {
      role: string;
      content: string;
      tool_call_id?: string;
      tool_calls?: { id: string; name: string; arguments: string }[];
    }[];
  }): Promise<{ success?: boolean; error?: string }> {
    return IpcBridge.invoke('agent-run', payload);
  }

  static async stopAgent(sessionId: string): Promise<void> {
    return IpcBridge.invoke('agent-stop', sessionId);
  }

  static async listRunningAgents(): Promise<string[]> {
    try {
      const res = await IpcBridge.invoke<{ sessions?: string[]; activeSessions?: string[] }>('agent-list');
      return Array.isArray(res?.sessions) ? res.sessions : (Array.isArray(res?.activeSessions) ? res.activeSessions : []);
    } catch {
      return [];
    }
  }

  static async getAgentStatus(sessionId: string): Promise<{
    sessionId: string;
    isRunning: boolean;
    events: AgentEvent[];
    fullAssistantText: string;
    fullThoughtText: string;
    lastUpdated: number;
  } | null> {
    try {
      const res = await IpcBridge.invoke<{
        sessionId: string;
        isRunning: boolean;
        events: AgentEvent[];
        fullAssistantText: string;
        fullThoughtText: string;
        lastUpdated: number;
      }>('agent-status', sessionId);
      return res || null;
    } catch {
      return null;
    }
  }

  static async autoDetectProviders(): Promise<Array<{
    id: string;
    name: string;
    type: 'env' | 'key' | 'custom';
    apiKey: string;
    baseUrl: string;
    models: Array<{ id: string; name: string }>;
  }>> {
    if (!IpcBridge.isDesktop()) return [];
    return IpcBridge.invoke('auto-detect-providers');
  }

  static async generateChatTitle(payload: {
    prompt: string;
    response?: string;
    model?: string;
    provider?: string;
    apiKey?: string;
    baseUrl?: string;
  }): Promise<{ title?: string } | null> {
    try {
      const res = await IpcBridge.invoke<{ title?: string }>('chat-generate-title', payload);
      return res || null;
    } catch {
      return null;
    }
  }
}
