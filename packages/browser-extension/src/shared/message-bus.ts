/**
 * SuperAgent Browser Extension — Message Bus
 */

import { ExtensionMessage } from './types.js';

export class MessageBus {
  public static async send<T = any>(message: ExtensionMessage): Promise<T> {
    if (typeof chrome === 'undefined' || !chrome.runtime?.sendMessage) {
      throw new Error('Chrome runtime is not available');
    }
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(message, (response) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve(response);
        }
      });
    });
  }

  public static async sendToTab<T = any>(tabId: number, message: ExtensionMessage): Promise<T> {
    if (typeof chrome === 'undefined' || !chrome.tabs?.sendMessage) {
      throw new Error('Chrome tabs API is not available');
    }
    return new Promise((resolve, reject) => {
      chrome.tabs.sendMessage(tabId, message, (response) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve(response);
        }
      });
    });
  }

  public static onMessage(
    listener: (
      message: ExtensionMessage,
      sender: chrome.runtime.MessageSender,
      sendResponse: (response?: any) => void
    ) => boolean | void
  ): () => void {
    if (typeof chrome === 'undefined' || !chrome.runtime?.onMessage) {
      return () => {};
    }
    chrome.runtime.onMessage.addListener(listener);
    return () => chrome.runtime.onMessage.removeListener(listener);
  }
}
