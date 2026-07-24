/**
 * Strongly Typed IPC Bridge Wrapper for SuperAgent Desktop
 * Delegates to the canonical getIpc and isElectron helpers from lib/electron.
 */

import type { ProviderConnection, ModelConfig, StoredProject, StoredChat, TrajectoryStep } from './types';
import { getIpc, isElectron } from '../lib/electron';

export interface ElectronIpcBridge {
  invoke(channel: string, ...args: unknown[]): Promise<unknown>;
  on(channel: string, listener: (event: unknown, ...args: unknown[]) => void): void;
  removeListener(channel: string, listener: (event: unknown, ...args: unknown[]) => void): void;
}

export class IpcBridge {
  static getIpc(): ElectronIpcBridge | null {
    return getIpc();
  }

  static isDesktop(): boolean {
    return isElectron();
  }

  static async invoke<T>(channel: string, ...args: unknown[]): Promise<T> {
    const ipc = IpcBridge.getIpc();
    if (!ipc) {
      throw new Error(`[IPC Error] Environment is not Desktop Electron. Channel: ${channel}`);
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
    if (!IpcBridge.isDesktop()) return {};
    return IpcBridge.invoke('store-read');
  }

  static async writeStore(data: {
    connectedProviders: ProviderConnection[];
    modelsCatalog: ModelConfig[];
    projects: StoredProject[];
    chats: StoredChat[];
  }): Promise<void> {
    if (!IpcBridge.isDesktop()) return;
    return IpcBridge.invoke('store-write', data);
  }

  static async readChatSteps(chatId: string): Promise<TrajectoryStep[]> {
    if (!IpcBridge.isDesktop()) return [];
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
  }): Promise<{ success?: boolean; error?: string }> {
    return IpcBridge.invoke('agent-run', payload);
  }

  static async stopAgent(sessionId: string): Promise<void> {
    return IpcBridge.invoke('agent-stop', sessionId);
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
}
