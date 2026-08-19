/**
 * SuperAgent Browser Extension — Manifest V3 Background Service Worker
 */

import { AuthBridge } from './auth-bridge.js';
import { NetworkObserver } from './network-observer.js';
import { ToolRelay } from './tool-relay.js';
import { apiClient } from './api-client.js';
import { MemoryBridge } from './memory-bridge.js';
import { ExtensionSessionStore } from '../shared/session-store.js';
import { ActiveTabContext, ExtensionMessage } from '../shared/types.js';

// Initialize network request observation
NetworkObserver.initialize();

// ─── Lifecycle & Context Menus ──────────────────────────────────────────────

chrome.runtime.onInstalled.addListener(() => {
  console.log('[SuperAgent Extension] Installed');

  // Set side panel to open on action click
  if (chrome.sidePanel?.setPanelBehavior) {
    chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});
  }

  // Create context menu item
  if (chrome.contextMenus) {
    chrome.contextMenus.create({
      id: 'superagent-ask-selection',
      title: 'Ask SuperAgent about "%s"',
      contexts: ['selection']
    });
  }

  // Initial auth status check
  AuthBridge.verifySession().then(updateBadge);
});

chrome.runtime.onStartup.addListener(() => {
  AuthBridge.verifySession().then(updateBadge);
  apiClient.connectWebSocket();
});

// ─── Context Menu Listener ──────────────────────────────────────────────────

if (chrome.contextMenus?.onClicked) {
  chrome.contextMenus.onClicked.addListener(async (info, tab) => {
    if (info.menuItemId === 'superagent-ask-selection' && info.selectionText) {
      // Open side panel
      if (tab?.id && chrome.sidePanel?.open) {
        await chrome.sidePanel.open({ tabId: tab.id }).catch(() => {});
      }
      // Broadcast prompt event to side panel
      chrome.runtime.sendMessage({
        type: 'AGENT_RUN_START',
        payload: {
          prompt: `Regarding this selected text: "${info.selectionText}"\n\nPlease analyze or answer.`,
          sessionId: `ext-chat-${Date.now()}`,
          modelConfig: {}
        }
      }).catch(() => {});
    }
  });
}

// ─── WebSocket Event Relay to Sidepanel/Popup ───────────────────────────────

apiClient.onWebSocketEvent((event) => {
  chrome.runtime.sendMessage({
    type: 'AGENT_EVENT',
    payload: event
  }).catch(() => {
    // Side panel might be closed, harmless
  });
});

// ─── Status Badge Updater ───────────────────────────────────────────────────

function updateBadge(auth: { authenticated: boolean; authRequired: boolean }): void {
  if (auth.authenticated || !auth.authRequired) {
    chrome.action.setBadgeText({ text: 'ON' });
    chrome.action.setBadgeBackgroundColor({ color: '#22c55e' }); // Emerald Green
  } else {
    chrome.action.setBadgeText({ text: 'LOCK' });
    chrome.action.setBadgeBackgroundColor({ color: '#ef4444' }); // Amber/Red
  }
}

// ─── Message Handling ───────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((message: ExtensionMessage, sender, sendResponse) => {
  const handleAsync = async () => {
    switch (message.type) {
      case 'GET_AUTH_STATE': {
        const state = await AuthBridge.verifySession();
        updateBadge(state);
        return state;
      }

      case 'LOGIN_REQUEST': {
        const res = await AuthBridge.login(message.payload.password);
        const state = await AuthBridge.verifySession();
        updateBadge(state);
        return res;
      }

      case 'LOGOUT_REQUEST': {
        await AuthBridge.logout();
        const state = await AuthBridge.verifySession();
        updateBadge(state);
        return { success: true };
      }

      case 'GET_MODELS': {
        return await apiClient.fetchModels();
      }

      case 'GET_ACTIVE_TAB_CONTEXT': {
        const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
        const activeTab = tabs[0];
        if (!activeTab || !activeTab.id) {
          return { url: '', title: '' } as ActiveTabContext;
        }

        // Query content script for selected text
        let selectedText = '';
        try {
          const tabRes = await new Promise<any>((resolve) => {
            chrome.tabs.sendMessage(activeTab.id!, { type: 'GET_SELECTION' }, (r) => {
              resolve(r || {});
            });
          });
          selectedText = tabRes?.selectedText || '';
        } catch {}

        return {
          tabId: activeTab.id,
          url: activeTab.url || '',
          title: activeTab.title || '',
          favicon: activeTab.favIconUrl,
          selectedText
        } as ActiveTabContext;
      }

      case 'EXECUTE_TOOL': {
        return await ToolRelay.execute(message.payload);
      }

      case 'AGENT_RUN_START': {
        const { prompt, sessionId, modelConfig, includePageContext } = message.payload;
        let finalPrompt = prompt;

        if (includePageContext) {
          const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
          const activeTab = tabs[0];
          if (activeTab?.url) {
            finalPrompt = `[Current Web Page Context]\nURL: ${activeTab.url}\nTitle: ${activeTab.title || ''}\n\n[User Instruction]\n${prompt}`;
          }
        }

        return await apiClient.invokeIpc('agent-run', {
          sessionId,
          prompt: finalPrompt,
          config: modelConfig,
          currentAttachments: []
        });
      }

      case 'AGENT_RUN_STOP': {
        return await apiClient.invokeIpc('agent-stop', message.payload.sessionId);
      }

      case 'GET_SERVER_CONFIG': {
        return await ExtensionSessionStore.getServerConfig();
      }

      case 'SET_SERVER_CONFIG': {
        const updated = await ExtensionSessionStore.setServerConfig(message.payload);
        apiClient.disconnectWebSocket();
        apiClient.connectWebSocket();
        return updated;
      }

      case 'PING_SERVER': {
        const ok = await apiClient.checkHealth();
        return { ok };
      }

      case 'GET_MEMORY_PROFILE': {
        return await MemoryBridge.getUserProfile();
      }

      case 'GET_LEARNED_INSIGHTS': {
        return await MemoryBridge.getLearnedInsights();
      }

      default:
        return { error: 'Unknown message type' };
    }
  };

  handleAsync().then(sendResponse).catch((err) => sendResponse({ error: err.message }));
  return true; // Keep message channel open for async response
});
