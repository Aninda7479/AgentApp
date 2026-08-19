/**
 * SuperAgent Browser Extension — Main World Script
 * Injected into the page's MAIN execution world to access window.localStorage,
 * window.sessionStorage, window.indexedDB, and window.caches with page origin privileges.
 */

(() => {
  const BRIDGE_CHANNEL = '__SUPERAGENT_MAIN_WORLD_BRIDGE__';

  window.addEventListener('message', async (event) => {
    // Only accept messages from same window originated by our content script
    if (event.source !== window || !event.data || event.data.channel !== BRIDGE_CHANNEL) {
      return;
    }

    const { id, action, payload } = event.data;

    try {
      let result: any = null;

      switch (action) {
        // ─── Local Storage ──────────────────────────────────────────────────
        case 'GET_LOCAL_STORAGE': {
          if (payload?.key) {
            result = window.localStorage.getItem(payload.key);
          } else {
            const all: Record<string, string> = {};
            for (let i = 0; i < window.localStorage.length; i++) {
              const k = window.localStorage.key(i);
              if (k) all[k] = window.localStorage.getItem(k) || '';
            }
            result = all;
          }
          break;
        }

        case 'SET_LOCAL_STORAGE': {
          window.localStorage.setItem(payload.key, String(payload.value));
          result = { success: true, key: payload.key };
          break;
        }

        // ─── Session Storage ────────────────────────────────────────────────
        case 'GET_SESSION_STORAGE': {
          if (payload?.key) {
            result = window.sessionStorage.getItem(payload.key);
          } else {
            const all: Record<string, string> = {};
            for (let i = 0; i < window.sessionStorage.length; i++) {
              const k = window.sessionStorage.key(i);
              if (k) all[k] = window.sessionStorage.getItem(k) || '';
            }
            result = all;
          }
          break;
        }

        case 'SET_SESSION_STORAGE': {
          window.sessionStorage.setItem(payload.key, String(payload.value));
          result = { success: true, key: payload.key };
          break;
        }

        // ─── IndexedDB ──────────────────────────────────────────────────────
        case 'LIST_INDEXEDDB_DATABASES': {
          if (window.indexedDB?.databases) {
            const dbs = await window.indexedDB.databases();
            result = dbs;
          } else {
            result = [];
          }
          break;
        }

        case 'QUERY_INDEXEDDB': {
          const { dbName, storeName, queryLimit } = payload;
          result = await new Promise((resolve, reject) => {
            const req = window.indexedDB.open(dbName);
            req.onerror = () => reject(req.error);
            req.onsuccess = () => {
              const db = req.result;
              try {
                const tx = db.transaction(storeName, 'readonly');
                const store = tx.objectStore(storeName);
                const getAllReq = store.getAll(null, queryLimit || 100);
                getAllReq.onsuccess = () => resolve(getAllReq.result);
                getAllReq.onerror = () => reject(getAllReq.error);
              } catch (e) {
                reject(e);
              }
            };
          });
          break;
        }

        // ─── Cache Storage ──────────────────────────────────────────────────
        case 'GET_CACHE_STORAGE': {
          if (window.caches) {
            const keys = await window.caches.keys();
            result = keys;
          } else {
            result = [];
          }
          break;
        }

        default:
          throw new Error(`Unknown main-world action: ${action}`);
      }

      window.postMessage(
        {
          channel: BRIDGE_CHANNEL,
          id,
          isResponse: true,
          success: true,
          result
        },
        '*'
      );
    } catch (err: any) {
      window.postMessage(
        {
          channel: BRIDGE_CHANNEL,
          id,
          isResponse: true,
          success: false,
          error: err?.message || String(err)
        },
        '*'
      );
    }
  });
})();
