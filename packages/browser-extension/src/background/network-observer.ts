/**
 * SuperAgent Browser Extension — Network Observer & DevTools Inspector
 * Manages chrome.webRequest rolling buffer and chrome.debugger CDP sessions
 */

import { NetworkLogEntry } from '../shared/types.js';

const MAX_LOG_PER_TAB = 500;
const networkLogsByTab = new Map<number, NetworkLogEntry[]>();

export class NetworkObserver {
  private static isInitialized = false;

  public static initialize(): void {
    if (this.isInitialized || typeof chrome === 'undefined' || !chrome.webRequest) return;
    this.isInitialized = true;

    // Track completed requests
    chrome.webRequest.onCompleted.addListener(
      (details) => {
        if (details.tabId < 0) return;
        const entries = networkLogsByTab.get(details.tabId) || [];
        entries.push({
          id: details.requestId,
          url: details.url,
          method: details.method,
          statusCode: details.statusCode,
          type: details.type,
          timeStamp: details.timeStamp,
          fromCache: details.fromCache
        });
        if (entries.length > MAX_LOG_PER_TAB) entries.shift();
        networkLogsByTab.set(details.tabId, entries);
      },
      { urls: ['<all_urls>'] },
      ['responseHeaders']
    );

    // Track failed requests
    chrome.webRequest.onErrorOccurred.addListener(
      (details) => {
        if (details.tabId < 0) return;
        const entries = networkLogsByTab.get(details.tabId) || [];
        entries.push({
          id: details.requestId,
          url: details.url,
          method: details.method,
          type: details.type,
          timeStamp: details.timeStamp,
          error: details.error
        });
        if (entries.length > MAX_LOG_PER_TAB) entries.shift();
        networkLogsByTab.set(details.tabId, entries);
      },
      { urls: ['<all_urls>'] }
    );

    // Clean up tabs on close
    if (chrome.tabs?.onRemoved) {
      chrome.tabs.onRemoved.addListener((tabId) => {
        networkLogsByTab.delete(tabId);
      });
    }
  }

  public static getTabNetworkLog(tabId: number): NetworkLogEntry[] {
    return networkLogsByTab.get(tabId) || [];
  }

  public static getFailedRequests(tabId: number): NetworkLogEntry[] {
    const entries = this.getTabNetworkLog(tabId);
    return entries.filter(e => Boolean(e.error) || (typeof e.statusCode === 'number' && e.statusCode >= 400));
  }

  // ─── Chrome Debugger CDP Session ──────────────────────────────────────────

  public static async captureHar(tabId: number, durationMs: number = 3000): Promise<any[]> {
    if (typeof chrome === 'undefined' || !chrome.debugger) {
      throw new Error('chrome.debugger API is not available');
    }

    const target = { tabId };
    const harRequests: any[] = [];

    await new Promise<void>((resolve, reject) => {
      chrome.debugger.attach(target, '1.3', () => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve();
        }
      });
    });

    try {
      await chrome.debugger.sendCommand(target, 'Network.enable');

      const eventListener = (source: chrome.debugger.Debuggee, method: string, params?: any) => {
        if (source.tabId === tabId && method === 'Network.responseReceived') {
          harRequests.push(params);
        }
      };

      chrome.debugger.onEvent.addListener(eventListener);

      await new Promise(r => setTimeout(r, durationMs));

      chrome.debugger.onEvent.removeListener(eventListener);
      await chrome.debugger.sendCommand(target, 'Network.disable').catch(() => {});
    } finally {
      await new Promise<void>((resolve) => {
        chrome.debugger.detach(target, () => resolve());
      });
    }

    return harRequests;
  }
}
