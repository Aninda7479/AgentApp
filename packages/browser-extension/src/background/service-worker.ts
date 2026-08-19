/**
 * SuperAgent Browser Extension — Manifest V3 Background Service Worker
 */

import { AuthBridge } from './auth-bridge.js';
import { NetworkObserver } from './network-observer.js';
import { ToolRelay } from './tool-relay.js';
import { apiClient } from './api-client.js';
import { MemoryBridge } from './memory-bridge.js';
import { ExtensionSessionStore } from '../shared/session-store.js';
import { ActiveTabContext, ExtensionMessage, AuthState } from '../shared/types.js';

const BROWSER_EXTENSION_SYSTEM_PROMPT = `You are SuperAgent in the browser side panel.
Always reason step by step before calling tools or providing answers. Enclose all your internal thinking, reasoning process, and planned actions within <think>...</think> tags so it displays cleanly in the user's Thinking Process accordion.
When asked to analyze content, solve problems, or interact with a webpage:
1. Inside <think>...</think> tags, understand the user's request, examine any attached webpage context, compute any mathematical solutions, and outline the actions you are going to take.
2. If you need to click buttons, select options, or fill inputs on the page, call the appropriate browser tools (e.g. browser_get_page_elements, browser_click_element, browser_type_in_element).
3. Always provide a clear, concise, and structured Markdown answer to the user after your thinking and tool interactions.`;
const sessionContextMap = new Map<string, string>();

// Initialize network request observation & verify session
NetworkObserver.initialize();
AuthBridge.verifySession().then(updateBadge);

// Handle autonomous browser tool execution from the server
apiClient.onWebSocketEvent(async (event) => {
  if (event.channel === 'execute-client-tool' && event.data) {
    const { id, sessionId, tool, input } = event.data;
    try {
      const activeTab = await getActiveWebTab();
      const res = await ToolRelay.execute({
        tool,
        input: input || {},
        tabId: activeTab?.id
      });
      apiClient.sendWebSocket({
        action: 'CLIENT_TOOL_RESULT',
        id,
        sessionId,
        result: res
      });
    } catch (err: any) {
      apiClient.sendWebSocket({
        action: 'CLIENT_TOOL_RESULT',
        id,
        sessionId,
        result: { success: false, error: err.message || String(err) }
      });
    }
  } else if (event.channel === 'session-sync' && event.data?.pendingTool) {
    const { id, sessionId, tool, input } = event.data.pendingTool;
    try {
      const activeTab = await getActiveWebTab();
      const res = await ToolRelay.execute({
        tool,
        input: input || {},
        tabId: activeTab?.id
      });
      apiClient.sendWebSocket({
        action: 'CLIENT_TOOL_RESULT',
        id,
        sessionId,
        result: res
      });
    } catch (err: any) {
      apiClient.sendWebSocket({
        action: 'CLIENT_TOOL_RESULT',
        id,
        sessionId,
        result: { success: false, error: err.message || String(err) }
      });
    }
  }
});

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
});

async function getActiveWebTab(): Promise<chrome.tabs.Tab | null> {
  try {
    // 1. Try active tab in last focused window first
    let tabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    let validTab = tabs.find((t) => t.id && (t.url || (t as any).pendingUrl)?.match(/^https?:\/\//i));
    if (validTab) return validTab;

    // 2. Try active tab in current window
    tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    validTab = tabs.find((t) => t.id && (t.url || (t as any).pendingUrl)?.match(/^https?:\/\//i));
    if (validTab) return validTab;

    // 3. Fallback to any active HTTP/HTTPS tab anywhere
    tabs = await chrome.tabs.query({ active: true });
    validTab = tabs.find((t) => t.id && (t.url || (t as any).pendingUrl)?.match(/^https?:\/\//i));
    if (validTab) return validTab;

    // 4. If all active tabs are internal browser pages (e.g. edge://extensions), search ALL open tabs across all windows for a valid webpage!
    const allTabs = await chrome.tabs.query({});
    const anyWebTab = allTabs.find((t) => t.id && (t.url || (t as any).pendingUrl)?.match(/^https?:\/\//i));
    if (anyWebTab) return anyWebTab;

    // 5. Ultimate fallback (exclude browser-internal urls)
    const fallbackTab = tabs.find((t) => t.id && t.url && !t.url.match(/^(chrome|edge|devtools|chrome-extension|about|view-source):/i));
    return fallbackTab || tabs[0] || null;
  } catch {
    return null;
  }
}

// ─── Context Menu Listener ──────────────────────────────────────────────────

function safeBroadcast(message: any): void {
  try {
    chrome.runtime.sendMessage(message, () => {
      // Accessing chrome.runtime.lastError marks it as handled and prevents
      // "Unchecked runtime.lastError: Could not establish connection. Receiving end does not exist."
      const _err = chrome.runtime.lastError;
    });
  } catch {}
}

if (chrome.contextMenus?.onClicked) {
  chrome.contextMenus.onClicked.addListener(async (info, tab) => {
    if (info.menuItemId === 'superagent-ask-selection' && info.selectionText) {
      // Open side panel
      if (tab?.id && chrome.sidePanel?.open) {
        await chrome.sidePanel.open({ tabId: tab.id }).catch(() => {});
      }
      // Broadcast prompt event to side panel
      safeBroadcast({
        type: 'AGENT_RUN_START',
        payload: {
          prompt: `Regarding this selected text: "${info.selectionText}"\n\nPlease analyze or answer.`,
          sessionId: `ext-chat-${Date.now()}`,
          modelConfig: {}
        }
      });
    }
  });
}

// ─── WebSocket Event Relay to Sidepanel/Popup ───────────────────────────────

apiClient.onWebSocketEvent((event) => {
  safeBroadcast({
    type: 'AGENT_EVENT',
    payload: event
  });
});

apiClient.onConnectionChange((connected) => {
  safeBroadcast({
    type: 'CONNECTION_STATE_CHANGED',
    payload: { connected }
  });
  AuthBridge.verifySession().then(updateBadge);
});

// ─── Status Badge Updater ───────────────────────────────────────────────────

function updateBadge(auth: AuthState): void {
  if (!auth.connected) {
    chrome.action.setBadgeText({ text: 'OFF' });
    chrome.action.setBadgeBackgroundColor({ color: '#64748b' }); // Slate Gray
  } else if (auth.authenticated || !auth.authRequired) {
    chrome.action.setBadgeText({ text: 'ON' });
    chrome.action.setBadgeBackgroundColor({ color: '#22c55e' }); // Emerald Green
  } else {
    chrome.action.setBadgeText({ text: 'LOCK' });
    chrome.action.setBadgeBackgroundColor({ color: '#f59e0b' }); // Amber
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
              const _err = chrome.runtime.lastError;
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
        const { prompt, sessionId, modelConfig, includePageContext, pageContextMode, selectedSection } = message.payload;
        let finalPrompt = prompt;

        const currentContextKey = `${pageContextMode}:${selectedSection?.text || 'full'}`;
        const previousContextKey = sessionContextMap.get(sessionId);
        const shouldAttachContext = includePageContext && pageContextMode !== 'none' && (!previousContextKey || previousContextKey !== currentContextKey);

        if (shouldAttachContext) {
          sessionContextMap.set(sessionId, currentContextKey);
          const activeTab = await getActiveWebTab();
          if (activeTab?.id && activeTab.url) {
            let pageText = '';
            let headerInfo = '[Current Web Page Context]';

            if (pageContextMode === 'section' && selectedSection?.text) {
              const rawSection = selectedSection.text.trim();
              headerInfo = `[Current Web Page Section: ${selectedSection.selector || 'DOM Element'}]`;
              pageText = `--- SECTION CONTENT (${selectedSection.selector || 'Element'}) ---\n${rawSection}\n--- END SECTION ---`;
            } else if (pageContextMode === 'selection' && selectedSection?.text) {
              const rawSelection = selectedSection.text.trim();
              headerInfo = `[Current Web Page: Highlighted Selection]`;
              pageText = `--- SELECTED TEXT ---\n${rawSelection}\n--- END SELECTED TEXT ---`;
            } else if (pageContextMode === 'full') {
              try {
                const res = await ToolRelay.execute({
                  tool: 'extract_page_content',
                  input: {},
                  tabId: activeTab.id
                });
                if (res.success && res.result?.text) {
                  const rawFull = res.result.text.trim();
                  pageText = `--- PAGE CONTENT ---\n${rawFull}\n--- END PAGE CONTENT ---`;
                }
              } catch {}
            }

            finalPrompt = `${headerInfo}\nURL: ${activeTab.url}\nTitle: ${activeTab.title || ''}\n\n${pageText}\n\n[User Instruction]\n${prompt}`;
          }
        }

        const finalModelConfig = {
          systemPrompt: BROWSER_EXTENSION_SYSTEM_PROMPT,
          chatOnly: true,  // Skip all 30 workspace tools (~7k tokens) — browser-specific tools are attached via extraTools
          browserTools: true,
          ...modelConfig
        };

        console.log('[ServiceWorker] Starting AGENT_RUN for session:', sessionId, 'Model:', finalModelConfig.model);
        await apiClient.connectWebSocket().catch((err) => {
          console.warn('[ServiceWorker] WebSocket connection error:', err);
        });

        const res = await apiClient.invokeIpc('agent-run', {
          sessionId,
          prompt: finalPrompt,
          config: finalModelConfig,
          currentAttachments: []
        });
        console.log('[ServiceWorker] agent-run IPC response:', res);
        return res;
      }

      case 'AGENT_RUN_STOP': {
        return await apiClient.invokeIpc('agent-stop', message.payload.sessionId);
      }

      case 'SYNC_SESSION': {
        const sent = apiClient.sendWebSocket({
          action: 'SYNC_SESSION',
          sessionId: message.payload?.sessionId,
          lastSeq: message.payload?.lastSeq
        });
        return { success: sent };
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
