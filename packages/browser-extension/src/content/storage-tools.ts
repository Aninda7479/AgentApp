/**
 * SuperAgent Browser Extension — Site Storage Tools
 * Invokes main-world storage execution via window.postMessage bridge
 */

const BRIDGE_CHANNEL = '__SUPERAGENT_MAIN_WORLD_BRIDGE__';

export class ContentStorageTools {
  private static pendingRequests = new Map<string, { resolve: (res: any) => void; reject: (err: any) => void }>();
  private static isBridgeReady = false;

  public static initialize(): void {
    if (this.isBridgeReady) return;
    this.isBridgeReady = true;

    window.addEventListener('message', (event) => {
      if (event.source !== window || !event.data || event.data.channel !== BRIDGE_CHANNEL) {
        return;
      }
      if (event.data.isResponse && event.data.id) {
        const pending = this.pendingRequests.get(event.data.id);
        if (pending) {
          this.pendingRequests.delete(event.data.id);
          if (event.data.success) {
            pending.resolve(event.data.result);
          } else {
            pending.reject(new Error(event.data.error || 'Main world execution failed'));
          }
        }
      }
    });
  }

  private static async invokeMainWorld<T = any>(action: string, payload?: any): Promise<T> {
    this.initialize();
    const id = `req-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

    return new Promise<T>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(new Error(`Storage bridge request timed out for action: ${action}`));
      }, 5000);

      this.pendingRequests.set(id, {
        resolve: (val) => {
          clearTimeout(timeout);
          resolve(val);
        },
        reject: (err) => {
          clearTimeout(timeout);
          reject(err);
        }
      });

      window.postMessage(
        {
          channel: BRIDGE_CHANNEL,
          id,
          action,
          payload
        },
        '*'
      );
    });
  }

  public static async getLocalStorage(key?: string): Promise<any> {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        if (key) {
          return window.localStorage.getItem(key);
        }
        const all: Record<string, string> = {};
        for (let i = 0; i < window.localStorage.length; i++) {
          const k = window.localStorage.key(i);
          if (k) all[k] = window.localStorage.getItem(k) || '';
        }
        return all;
      }
    } catch {}
    return await this.invokeMainWorld('GET_LOCAL_STORAGE', { key });
  }

  public static async setLocalStorage(key: string, value: any): Promise<any> {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.setItem(key, String(value));
        return { success: true, key };
      }
    } catch {}
    return await this.invokeMainWorld('SET_LOCAL_STORAGE', { key, value });
  }

  public static async getSessionStorage(key?: string): Promise<any> {
    try {
      if (typeof window !== 'undefined' && window.sessionStorage) {
        if (key) {
          return window.sessionStorage.getItem(key);
        }
        const all: Record<string, string> = {};
        for (let i = 0; i < window.sessionStorage.length; i++) {
          const k = window.sessionStorage.key(i);
          if (k) all[k] = window.sessionStorage.getItem(k) || '';
        }
        return all;
      }
    } catch {}
    return await this.invokeMainWorld('GET_SESSION_STORAGE', { key });
  }

  public static async setSessionStorage(key: string, value: any): Promise<any> {
    try {
      if (typeof window !== 'undefined' && window.sessionStorage) {
        window.sessionStorage.setItem(key, String(value));
        return { success: true, key };
      }
    } catch {}
    return await this.invokeMainWorld('SET_SESSION_STORAGE', { key, value });
  }

  public static async listIndexedDbDatabases(): Promise<any> {
    return await this.invokeMainWorld('LIST_INDEXEDDB_DATABASES');
  }

  public static async queryIndexedDb(dbName: string, storeName: string, queryLimit?: number): Promise<any> {
    return await this.invokeMainWorld('QUERY_INDEXEDDB', { dbName, storeName, queryLimit });
  }

  public static async getCacheStorage(): Promise<any> {
    return await this.invokeMainWorld('GET_CACHE_STORAGE');
  }
}
