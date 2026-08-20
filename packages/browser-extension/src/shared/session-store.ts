/**
 * SuperAgent Browser Extension — Session Storage Wrapper
 */

import { ServerConfig, AuthState, ChatMessage } from './types.js';
import { STORAGE_KEYS, DEFAULT_SERVER_CONFIG } from './constants.js';

// In-memory fallback for test environments where chrome.storage is not mocked
const memoryStorage = new Map<string, any>();

async function getStorageItem<T>(key: string, area: 'local' | 'session' = 'local'): Promise<T | null> {
  if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage[area]) {
    try {
      const result = await chrome.storage[area].get(key);
      return result[key] ?? null;
    } catch {
      return memoryStorage.get(key) ?? null;
    }
  }
  return memoryStorage.get(key) ?? null;
}

async function setStorageItem<T>(key: string, value: T, area: 'local' | 'session' = 'local'): Promise<void> {
  if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage[area]) {
    try {
      await chrome.storage[area].set({ [key]: value });
      return;
    } catch {
      memoryStorage.set(key, value);
      return;
    }
  }
  memoryStorage.set(key, value);
}

async function removeStorageItem(key: string, area: 'local' | 'session' = 'local'): Promise<void> {
  if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage[area]) {
    try {
      await chrome.storage[area].remove(key);
      return;
    } catch {
      memoryStorage.delete(key);
      return;
    }
  }
  memoryStorage.delete(key);
}

export class ExtensionSessionStore {
  public static async getServerConfig(): Promise<ServerConfig> {
    const config = await getStorageItem<ServerConfig>(STORAGE_KEYS.SERVER_CONFIG, 'local');
    return { ...DEFAULT_SERVER_CONFIG, ...(config || {}) };
  }

  public static async setServerConfig(config: Partial<ServerConfig>): Promise<ServerConfig> {
    const current = await this.getServerConfig();
    const updated = { ...current, ...config };
    await setStorageItem(STORAGE_KEYS.SERVER_CONFIG, updated, 'local');
    return updated;
  }

  public static async getAuthToken(): Promise<string | null> {
    return await getStorageItem<string>(STORAGE_KEYS.AUTH_TOKEN, 'session') 
      || await getStorageItem<string>(STORAGE_KEYS.AUTH_TOKEN, 'local');
  }

  public static async setAuthToken(token: string): Promise<void> {
    await setStorageItem(STORAGE_KEYS.AUTH_TOKEN, token, 'session');
    await setStorageItem(STORAGE_KEYS.AUTH_TOKEN, token, 'local');
  }

  public static async clearAuthToken(): Promise<void> {
    await removeStorageItem(STORAGE_KEYS.AUTH_TOKEN, 'session');
    await removeStorageItem(STORAGE_KEYS.AUTH_TOKEN, 'local');
  }

  public static async getAuthState(): Promise<AuthState> {
    const state = await getStorageItem<AuthState>(STORAGE_KEYS.AUTH_STATE, 'session');
    return state || { connected: false, authenticated: false, authRequired: true };
  }

  public static async setAuthState(state: AuthState): Promise<void> {
    await setStorageItem(STORAGE_KEYS.AUTH_STATE, state, 'session');
  }

  public static async getApprovalMode(): Promise<'ask' | 'always' | 'never'> {
    const mode = await getStorageItem<'ask' | 'always' | 'never'>(STORAGE_KEYS.APPROVAL_MODE, 'local');
    return mode || 'ask';
  }

  public static async setApprovalMode(mode: 'ask' | 'always' | 'never'): Promise<void> {
    await setStorageItem(STORAGE_KEYS.APPROVAL_MODE, mode, 'local');
  }

  public static async getCurrentSessionId(): Promise<string> {
    const id = await getStorageItem<string>(STORAGE_KEYS.CURRENT_SESSION_ID, 'local');
    if (!id) {
      const newId = `ext-chat-${Date.now()}`;
      await setStorageItem(STORAGE_KEYS.CURRENT_SESSION_ID, newId, 'local');
      return newId;
    }
    return id;
  }

  public static async setCurrentSessionId(sessionId: string): Promise<void> {
    await setStorageItem(STORAGE_KEYS.CURRENT_SESSION_ID, sessionId, 'local');
  }
}
