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

const BROWSER_EXTENSION_SYSTEM_PROMPT = `You are SuperAgent, an intelligent AI assistant and autonomous agent integrated into the user's browser side panel.

<identity>
You assist the user with browsing, research, page analysis, coding, web navigation, and data extraction directly from their active browser window.
</identity>

<browser_context_instructions>
1. **Live Page Context**: When the user prompt includes a \`[Current Web Page Context]\` block, the user's active webpage URL, Title, and readable text content are ALREADY EXTRACTED and provided directly to you.
2. **Direct Answers & Summaries**: Always use the provided page content immediately to answer questions, explain concepts, summarize, or extract data.
3. **No Unnecessary Scraping**: DO NOT attempt to run shell commands or external headless browser tools to fetch the page — you already have the live content in front of you.
4. **Formatting**: Present your answers in clear, structured, well-formatted Markdown with headings, bullet points, and concise highlights.
</browser_context_instructions>`;

// Initialize network request observation & verify session
NetworkObserver.initialize();
AuthBridge.verifySession().then(updateBadge);

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

        if (includePageContext && pageContextMode !== 'none') {
          const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
          const activeTab = tabs[0];
          if (activeTab?.id && activeTab.url) {
            let pageText = '';
            let storageContext = '';
            let networkContext = '';

            if (pageContextMode === 'section' && selectedSection?.text) {
              pageText = `[Attached Section: ${selectedSection.selector || 'DOM Element'}]\n${selectedSection.text}`;
            } else if (pageContextMode === 'selection' && selectedSection?.text) {
              pageText = `[Attached Selected Text]\n${selectedSection.text}`;
            } else {
              try {
                const res = await ToolRelay.execute({
                  tool: 'extract_page_content',
                  input: {},
                  tabId: activeTab.id
                });
                if (res.success && res.result?.text) {
                  pageText = res.result.text.slice(0, 20000);
                }
              } catch {}
            }

            const promptLower = (prompt || '').toLowerCase();

            // Storage, Session & Cookies Context
            if (
              promptLower.includes('storage') ||
              promptLower.includes('cookie') ||
              promptLower.includes('session') ||
              promptLower.includes('token') ||
              promptLower.includes('auth') ||
              promptLower.includes('state') ||
              promptLower.includes('inspect')
            ) {
              try {
                const [localRes, sessionRes, cookieRes] = await Promise.all([
                  ToolRelay.execute({ tool: 'get_local_storage', input: {}, tabId: activeTab.id }),
                  ToolRelay.execute({ tool: 'get_session_storage', input: {}, tabId: activeTab.id }),
                  ToolRelay.execute({ tool: 'get_cookies', input: {}, tabId: activeTab.id })
                ]);

                storageContext = `\n--- SITE STORAGE & COOKIES ---\n` +
                  `localStorage: ${JSON.stringify(localRes.result || {}, null, 2)}\n` +
                  `sessionStorage: ${JSON.stringify(sessionRes.result || {}, null, 2)}\n` +
                  `Cookies: ${JSON.stringify((cookieRes.result || []).map((c: any) => ({ name: c.name, value: c.value, domain: c.domain, secure: c.secure })), null, 2)}\n` +
                  `--- END SITE STORAGE ---\n`;
              } catch {}
            }

            // Network Requests & Failed Status Codes Context
            if (
              promptLower.includes('network') ||
              promptLower.includes('request') ||
              promptLower.includes('api') ||
              promptLower.includes('fetch') ||
              promptLower.includes('failed') ||
              promptLower.includes('error') ||
              promptLower.includes('http') ||
              promptLower.includes('inspect')
            ) {
              try {
                const [networkRes, failedRes] = await Promise.all([
                  ToolRelay.execute({ tool: 'get_network_requests', input: {}, tabId: activeTab.id }),
                  ToolRelay.execute({ tool: 'get_failed_requests', input: {}, tabId: activeTab.id })
                ]);

                const recent = (networkRes.result || []).slice(-15);
                const failed = failedRes.result || [];

                networkContext = `\n--- CAPTURED NETWORK TELEMETRY ---\n` +
                  `Recent Requests (${recent.length}): ${JSON.stringify(recent, null, 2)}\n` +
                  `Failed Requests (4xx/5xx): ${JSON.stringify(failed, null, 2)}\n` +
                  `--- END NETWORK TELEMETRY ---\n`;
              } catch {}
            }

            const headerInfo = pageContextMode === 'section' && selectedSection?.selector
              ? `[Current Web Page Section Context: ${selectedSection.selector}]`
              : `[Current Web Page Context]`;

            finalPrompt = `${headerInfo}\nURL: ${activeTab.url}\nTitle: ${activeTab.title || ''}\n${pageText ? `\n--- CONTEXT CONTENT START ---\n${pageText}\n--- CONTEXT CONTENT END ---\n` : ''}${storageContext}${networkContext}\n[User Instruction]\n${prompt}`;
          }
        }

        await apiClient.connectWebSocket().catch(() => {});

        const finalModelConfig = {
          systemPrompt: BROWSER_EXTENSION_SYSTEM_PROMPT,
          ...modelConfig
        };

        return await apiClient.invokeIpc('agent-run', {
          sessionId,
          prompt: finalPrompt,
          config: finalModelConfig,
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
