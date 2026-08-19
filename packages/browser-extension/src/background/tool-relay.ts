/**
 * SuperAgent Browser Extension — Tool Relay
 * Executes browser-native tools (Storage, Cookies, Network, DOM, Screenshot, Page Automation)
 */

import { BrowserToolName, ToolExecutionRequest, ToolExecutionResponse } from '../shared/types.js';
import { NetworkObserver } from './network-observer.js';

export class ToolRelay {
  public static async execute(request: ToolExecutionRequest): Promise<ToolExecutionResponse> {
    const { tool, input, tabId } = request;

    try {
      // Resolve active tab if not specified
      const targetTabId = tabId || await this.getActiveTabId();
      if (!targetTabId) {
        return { success: false, error: 'No active browser tab found to execute tool' };
      }

      // 1. Cookies Tools (Service Worker Native)
      if (tool === 'get_cookies') {
        const tab = await this.getTab(targetTabId);
        const url = new URL(tab?.url || 'http://localhost');
        const cookies = await chrome.cookies.getAll({ domain: url.hostname });
        return { success: true, result: cookies };
      }

      if (tool === 'set_cookie') {
        const tab = await this.getTab(targetTabId);
        const url = tab?.url || input.url;
        const cookie = await chrome.cookies.set({
          url,
          name: input.name,
          value: input.value,
          domain: input.domain,
          path: input.path || '/',
          secure: input.secure,
          httpOnly: input.httpOnly
        });
        return { success: true, result: cookie };
      }

      if (tool === 'delete_cookie') {
        const tab = await this.getTab(targetTabId);
        const url = tab?.url || input.url;
        const removed = await chrome.cookies.remove({ url, name: input.name });
        return { success: true, result: removed };
      }

      // 2. Screenshot Tool (Service Worker Native)
      if (tool === 'capture_screenshot') {
        const dataUrl = await chrome.tabs.captureVisibleTab({ format: input.format || 'png' });
        return { success: true, result: { dataUrl } };
      }

      // 3. Network Inspection Tools
      if (tool === 'get_network_requests') {
        const logs = NetworkObserver.getTabNetworkLog(targetTabId);
        return { success: true, result: logs };
      }

      if (tool === 'get_failed_requests') {
        const failed = NetworkObserver.getFailedRequests(targetTabId);
        return { success: true, result: failed };
      }

      if (tool === 'capture_network_har') {
        const har = await NetworkObserver.captureHar(targetTabId, input.durationMs || 3000);
        return { success: true, result: har };
      }

      // 4. Content Script Tools (DOM, Page, Storage in Isolated/Main World)
      const tab = await this.getTab(targetTabId);
      if (tab?.url) {
        const lower = tab.url.toLowerCase();
        if (
          lower.startsWith('chrome://') ||
          lower.startsWith('edge://') ||
          lower.startsWith('chrome-extension://') ||
          lower.startsWith('about:') ||
          lower.startsWith('devtools://')
        ) {
          return {
            success: false,
            error: `Cannot inspect browser-internal pages (${tab.url.split('/')[0]}//). Please switch to a regular website (e.g. https://google.com) to inspect its storage, DOM, or network.`
          };
        }
      }

      let response = await this.sendMessageToTab(targetTabId, request);

      // Auto-heal: If content script was disconnected or not yet injected, inject dynamically and retry!
      if (!response.success && response.error && response.error.includes('Receiving end does not exist')) {
        try {
          if (chrome.scripting?.executeScript) {
            await chrome.scripting.executeScript({
              target: { tabId: targetTabId },
              files: ['content-script.js']
            });
            await new Promise((r) => setTimeout(r, 100));
            response = await this.sendMessageToTab(targetTabId, request);
          }
        } catch (injectErr: any) {
          return {
            success: false,
            error: `Could not connect to page content script: ${injectErr?.message || response.error}. Try refreshing the webpage.`
          };
        }
      }

      return response;
    } catch (err: any) {
      return { success: false, error: err?.message || 'Tool execution encountered an internal error' };
    }
  }

  private static sendMessageToTab(tabId: number, request: ToolExecutionRequest): Promise<ToolExecutionResponse> {
    return new Promise<ToolExecutionResponse>((resolve) => {
      chrome.tabs.sendMessage(
        tabId,
        { type: 'EXECUTE_TOOL', payload: request },
        (res) => {
          if (chrome.runtime.lastError) {
            resolve({ success: false, error: chrome.runtime.lastError.message });
          } else {
            resolve(res || { success: false, error: 'No response from page content script' });
          }
        }
      );
    });
  }

  private static async getActiveTabId(): Promise<number | undefined> {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    return tabs[0]?.id;
  }

  private static async getTab(tabId: number): Promise<chrome.tabs.Tab | undefined> {
    try {
      return await chrome.tabs.get(tabId);
    } catch {
      return undefined;
    }
  }
}
