/**
 * SuperAgent Browser Extension — Side Panel Controller
 * Handles interactive chat, agentic execution loop, live model catalog fetching,
 * and composer controls matching Desktop/Web Workspace.
 */

import { MessageBus } from '../src/shared/message-bus.js';
import { ActiveTabContext, AuthState, ModelOption, SectionContextData } from '../src/shared/types.js';
import { renderMarkdown } from '../src/shared/markdown.js';
import { ExtensionSessionStore } from '../src/shared/session-store.js';

class SidePanelController {
  private currentSessionId: string = `ext-chat-${Date.now()}`;
  private isGenerating = false;
  private currentAssistantBubble: HTMLElement | null = null;
  private currentAssistantText = '';
  private currentThoughtBubble: HTMLElement | null = null;
  private currentThoughtBox: HTMLElement | null = null;
  private currentThoughtText = '';

  // Models State (Dynamically fetched from backend settings-read)
  private availableModels: ModelOption[] = [];
  private selectedModelId: string = '';
  private approvalMode: 'ask' | 'always' | 'never' = 'ask';
  private contextMode: 'full' | 'section' | 'selection' | 'none' | 'picking' = 'full';
  private selectedSection: SectionContextData | null = null;
  private seenEventSeqs = new Set<number>();

  // Header Elements
  private statusDot = document.getElementById('statusDot') as HTMLElement;
  private statusText = document.getElementById('statusText') as HTMLElement;
  private btnNewChat = document.getElementById('btnNewChat') as HTMLButtonElement;
  private btnSettings = document.getElementById('btnSettings') as HTMLButtonElement;

  // Navigation Tabs
  private tabChat = document.getElementById('tabChat') as HTMLButtonElement;
  private tabAgent = document.getElementById('tabAgent') as HTMLButtonElement;
  private tabInspector = document.getElementById('tabInspector') as HTMLButtonElement;
  private chatPanel = document.getElementById('chatPanel') as HTMLElement;
  private agentPanel = document.getElementById('agentPanel') as HTMLElement;
  private inspectorPanel = document.getElementById('inspectorPanel') as HTMLElement;

  // Messages Containers
  private messagesContainer = document.getElementById('messagesContainer') as HTMLElement;
  private agentStepsContainer = document.getElementById('agentStepsContainer') as HTMLElement;
  private emptyState = document.getElementById('emptyState') as HTMLElement;

  // The Compose Div Elements
  private chatInput = document.getElementById('chatInput') as HTMLTextAreaElement;
  private btnSend = document.getElementById('btnSend') as HTMLButtonElement;
  private chipPageContext = document.getElementById('chipPageContext') as HTMLElement;
  private chipContextIcon = document.getElementById('chipContextIcon') as HTMLElement;
  private chipContextLabel = document.getElementById('chipContextLabel') as HTMLElement;
  private contextMenu = document.getElementById('contextMenu') as HTMLElement;
  private btnRemoveContext = document.getElementById('btnRemoveContext') as HTMLButtonElement;
  private btnAttachContext = document.getElementById('btnAttachContext') as HTMLButtonElement;

  // Approval Dropdown
  private btnApprovalTrigger = document.getElementById('btnApprovalTrigger') as HTMLButtonElement;
  private approvalMenu = document.getElementById('approvalMenu') as HTMLElement;
  private currentApprovalText = document.getElementById('currentApprovalText') as HTMLElement;

  // Dynamic Model Selector Popover
  private btnModelTrigger = document.getElementById('btnModelTrigger') as HTMLButtonElement;
  private modelTriggerLabel = document.getElementById('modelTriggerLabel') as HTMLElement;
  private modelIcon = document.getElementById('modelIcon') as HTMLElement;
  private modelMenu = document.getElementById('modelMenu') as HTMLElement;

  // Inspector Elements
  private storageOutput = document.getElementById('storageOutput') as HTMLElement;
  private networkOutput = document.getElementById('networkOutput') as HTMLElement;
  private elementOutput = document.getElementById('elementOutput') as HTMLElement;
  private selectorInput = document.getElementById('selectorInput') as HTMLInputElement;

  // Login Modal
  private loginModal = document.getElementById('loginModal') as HTMLElement;
  private loginPassword = document.getElementById('loginPassword') as HTMLInputElement;
  private btnLoginSubmit = document.getElementById('btnLoginSubmit') as HTMLButtonElement;
  private loginError = document.getElementById('loginError') as HTMLElement;

  constructor() {
    this.bindEvents();
    this.checkAuthStatus();
    this.loadRealModels();
    this.listenToAgentEvents();
    this.initSessionId();

    // Periodic heartbeat check to detect server drops and automatic reconnects
    setInterval(() => this.checkAuthStatus(), 5000);
    window.addEventListener('focus', () => this.checkAuthStatus());
  }

  private async initSessionId(): Promise<void> {
    try {
      const persistedId = await ExtensionSessionStore.getCurrentSessionId();
      this.currentSessionId = persistedId;
      // Sync with the server for this session on startup
      MessageBus.send({
        type: 'SYNC_SESSION',
        payload: {
          sessionId: this.currentSessionId,
          lastSeq: 0
        }
      }).catch(() => {});
    } catch {}
  }

  // ─── Agent Streaming Events ────────────────────────────────────────────────

  private listenToAgentEvents(): void {
    MessageBus.onMessage((msg) => {
      if (msg.type === 'AGENT_EVENT' && msg.payload) {
        this.handleAgentEvent(msg.payload);
      } else if (msg.type === 'CONNECTION_STATE_CHANGED') {
        if (!msg.payload?.connected) {
          this.setOfflineState();
        } else {
          this.checkAuthStatus();
          if (this.isGenerating) {
            const maxSeq = this.seenEventSeqs.size > 0 ? Math.max(...Array.from(this.seenEventSeqs)) : 0;
            MessageBus.send({
              type: 'SYNC_SESSION',
              payload: {
                sessionId: this.currentSessionId,
                lastSeq: maxSeq
              }
            }).catch(() => {});
          }
        }
      } else if (msg.type === 'ELEMENT_PICKED' && msg.payload) {
        this.setContextMode('section', msg.payload);
        this.switchTab('chat');
      } else if (msg.type === 'ELEMENT_PICKER_CANCELLED') {
        if (this.contextMode === 'picking') {
          this.setContextMode('full');
        }
      }
    });
  }

  private handleAgentEvent(event: any): void {
    const { channel, data } = event;
    const evt = data || event;
    if (!evt || typeof evt !== 'object') return;

    if (channel === 'session-sync' || evt.type === 'session_sync') {
      const payload = evt.data || evt;
      const { sessionId, isRunning, replayEvents, fullAssistantText } = payload;
      if (sessionId && sessionId !== this.currentSessionId) return;

      if (Array.isArray(replayEvents) && replayEvents.length > 0) {
        for (const reEvt of replayEvents) {
          this.handleAgentEvent({ channel: 'agent-event', data: reEvt });
        }
      } else if (fullAssistantText && !this.currentAssistantText) {
        if (!this.currentAssistantBubble) {
          this.currentAssistantBubble = this.appendMessage('assistant', '');
        }
        this.currentAssistantText = fullAssistantText;
        this.currentAssistantBubble.innerHTML = renderMarkdown(this.currentAssistantText);
        this.scrollToBottom();
      }

      if (isRunning === false) {
        this.setGenerating(false);
      }
      return;
    }

    if (evt.sessionId && evt.sessionId !== this.currentSessionId) {
      return;
    }

    if (evt.seq !== undefined) {
      if (this.seenEventSeqs.has(evt.seq)) {
        return; // Drop duplicate event delivery
      }
      this.seenEventSeqs.add(evt.seq);
    }

    if (evt.type === 'token' && (evt.content !== undefined || evt.text !== undefined)) {
      const text = evt.content !== undefined ? evt.content : evt.text;
      // Close active thought accumulation so new thoughts create a new block if needed
      if (this.currentThoughtBubble) {
        const dots = this.currentThoughtBubble.querySelector('.thinking-dots');
        if (dots) dots.remove();
        this.currentThoughtBubble = null;
        this.currentThoughtBox = null;
        this.currentThoughtText = '';
      }
      if (!this.currentAssistantBubble) {
        this.currentAssistantText = '';
        this.currentAssistantBubble = this.appendMessage('assistant', '');
      }
      this.currentAssistantText += text;
      this.currentAssistantBubble.innerHTML = renderMarkdown(this.currentAssistantText);
      this.scrollToBottom();
    } else if (evt.type === 'replace_tokens' && evt.content !== undefined) {
      if (!this.currentAssistantBubble) {
        this.currentAssistantBubble = this.appendMessage('assistant', '');
      }
      this.currentAssistantText = evt.content;
      this.currentAssistantBubble.innerHTML = renderMarkdown(this.currentAssistantText);
      this.scrollToBottom();
    } else if (evt.type === 'thought' && evt.content) {
      this.appendThoughtChunk(evt.content);
    } else if (evt.type === 'tool_call' || evt.type === 'tool_use') {
      this.currentAssistantBubble = null;
      this.currentThoughtBubble = null;
      this.renderToolCall(evt);
    } else if (evt.type === 'tool_result' || evt.type === 'tool_output') {
      this.currentAssistantBubble = null;
      this.currentThoughtBubble = null;
      this.renderToolResult(evt);
    } else if (evt.type === 'finished' || evt.type === 'done') {
      this.setGenerating(false);
      this.currentAssistantBubble = null;
      this.currentThoughtBubble = null;
      this.currentThoughtBox = null;
      this.currentThoughtText = '';
    } else if (evt.type === 'error') {
      this.appendMessage('assistant', `⚠️ ${evt.error || evt.message || 'Agent execution failed'}`);
      this.setGenerating(false);
      this.currentAssistantBubble = null;
      this.currentThoughtBubble = null;
      this.currentThoughtBox = null;
      this.currentThoughtText = '';
    }
  }

  private bindEvents(): void {
    // Tab switching
    this.tabChat.addEventListener('click', () => this.switchTab('chat'));
    this.tabAgent.addEventListener('click', () => this.switchTab('agent'));
    this.tabInspector.addEventListener('click', () => this.switchTab('inspector'));

    // Compose Actions
    this.btnSend.addEventListener('click', () => {
      if (this.isGenerating) {
        this.stopAgentRun();
      } else {
        this.sendMessage();
      }
    });

    this.chatInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        if (!this.isGenerating) {
          this.sendMessage();
        }
      }
    });

    // Auto-resize chat textarea
    this.chatInput.addEventListener('input', () => {
      this.chatInput.style.height = 'auto';
      this.chatInput.style.height = `${Math.min(this.chatInput.scrollHeight, 140)}px`;
    });

    // Page Context Dropdown & Remove Actions
    this.chipPageContext.addEventListener('click', (e) => {
      e.stopPropagation();
      this.contextMenu.classList.toggle('open');
      this.approvalMenu.classList.remove('open');
      this.modelMenu.classList.remove('open');
    });

    this.btnRemoveContext.addEventListener('click', (e) => {
      e.stopPropagation();
      if (this.contextMode !== 'none') {
        this.setContextMode('none');
      } else {
        this.setContextMode('full');
      }
      this.contextMenu.classList.remove('open');
    });

    this.btnAttachContext.addEventListener('click', (e) => {
      e.stopPropagation();
      this.contextMenu.classList.toggle('open');
      this.approvalMenu.classList.remove('open');
      this.modelMenu.classList.remove('open');
    });

    // Context Options Menu
    document.querySelectorAll('.context-option').forEach((opt) => {
      opt.addEventListener('click', async () => {
        const mode = (opt as HTMLElement).getAttribute('data-mode') as 'full' | 'inspect' | 'selection' | 'none';
        this.contextMenu.classList.remove('open');

        if (mode === 'full') {
          this.setContextMode('full');
        } else if (mode === 'inspect') {
          await this.startElementPicker();
        } else if (mode === 'selection') {
          await this.attachSelectedTextContext();
        } else if (mode === 'none') {
          this.setContextMode('none');
        }
      });
    });

    // Approval Mode Dropdown
    this.btnApprovalTrigger.addEventListener('click', (e) => {
      e.stopPropagation();
      this.approvalMenu.classList.toggle('open');
      this.modelMenu.classList.remove('open');
      this.contextMenu.classList.remove('open');
    });

    document.querySelectorAll('.approval-option').forEach((opt) => {
      opt.addEventListener('click', () => {
        const val = (opt as HTMLElement).getAttribute('data-value') as 'ask' | 'always' | 'never';
        this.setApprovalMode(val);
        this.approvalMenu.classList.remove('open');
      });
    });

    // Model Selector Popover Trigger
    this.btnModelTrigger.addEventListener('click', (e) => {
      e.stopPropagation();
      this.modelMenu.classList.toggle('open');
      this.approvalMenu.classList.remove('open');
      this.contextMenu.classList.remove('open');
    });

    // Click away to close popovers
    document.addEventListener('click', () => {
      this.contextMenu.classList.remove('open');
      this.approvalMenu.classList.remove('open');
      this.modelMenu.classList.remove('open');
    });

    // Quick Action Prompts
    document.querySelectorAll('.quick-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const prompt = btn.getAttribute('data-prompt') || '';
        this.chatInput.value = prompt;
        this.sendMessage();
      });
    });

    // Header Actions
    this.btnNewChat.addEventListener('click', () => this.startNewChat());
    this.btnSettings.addEventListener('click', () => {
      if (chrome.runtime?.openOptionsPage) {
        chrome.runtime.openOptionsPage();
      }
    });

    // Login modal
    this.btnLoginSubmit.addEventListener('click', () => this.handleLogin());
    this.loginPassword.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') this.handleLogin();
    });

    // Inspector Action Buttons
    document.getElementById('btnInspectLocalStorage')?.addEventListener('click', () => this.inspectStorage('get_local_storage'));
    document.getElementById('btnInspectSessionStorage')?.addEventListener('click', () => this.inspectStorage('get_session_storage'));
    document.getElementById('btnInspectCookies')?.addEventListener('click', () => this.inspectStorage('get_cookies'));
    document.getElementById('btnInspectIndexedDB')?.addEventListener('click', () => this.inspectStorage('list_indexeddb_databases'));

    document.getElementById('btnInspectNetwork')?.addEventListener('click', () => this.inspectNetwork(false));
    document.getElementById('btnInspectFailedNetwork')?.addEventListener('click', () => this.inspectNetwork(true));
    document.getElementById('btnQueryElements')?.addEventListener('click', () => this.inspectElements());
    document.getElementById('btnInspectPicker')?.addEventListener('click', () => this.inspectPickerAction());
  }

  private setApprovalMode(mode: 'ask' | 'always' | 'never'): void {
    this.approvalMode = mode;
    if (mode === 'ask') {
      this.currentApprovalText.textContent = 'Ask';
    } else if (mode === 'always') {
      this.currentApprovalText.textContent = 'Always';
    } else {
      this.currentApprovalText.textContent = 'Never';
    }
  }

  private async getActiveWebTab(): Promise<chrome.tabs.Tab | null> {
    if (typeof chrome === 'undefined' || !chrome.tabs?.query) return null;
    try {
      let tabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
      let validTab = tabs.find((t) => t.id && t.url && !t.url.startsWith('chrome-extension://') && !t.url.startsWith('chrome://'));
      if (validTab) return validTab;

      tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      validTab = tabs.find((t) => t.id && t.url && !t.url.startsWith('chrome-extension://') && !t.url.startsWith('chrome://'));
      if (validTab) return validTab;

      tabs = await chrome.tabs.query({ active: true });
      validTab = tabs.find((t) => t.id && t.url && !t.url.startsWith('chrome-extension://') && !t.url.startsWith('chrome://'));
      return validTab || tabs[0] || null;
    } catch {
      return null;
    }
  }

  private async ensureTabReady(tabId: number): Promise<boolean> {
    try {
      const isAlive = await new Promise((resolve) => {
        chrome.tabs.sendMessage(tabId, { type: 'PING' }, (res) => {
          if (chrome.runtime.lastError) resolve(false);
          else resolve(res?.pong === true);
        });
      });
      if (isAlive) return true;

      if (chrome.scripting?.executeScript) {
        await chrome.scripting.executeScript({
          target: { tabId },
          files: ['content-script.js']
        });
        await new Promise((r) => setTimeout(r, 120));
        return true;
      }
    } catch (e) {
      console.warn('[SidePanel] ensureTabReady error:', e);
    }
    return false;
  }

  public setContextMode(mode: 'full' | 'section' | 'selection' | 'none' | 'picking', section?: SectionContextData | null): void {
    this.contextMode = mode;
    this.selectedSection = section || null;

    document.querySelectorAll('.context-option').forEach((opt) => {
      const optMode = opt.getAttribute('data-mode');
      const isTarget = (mode === 'section' && optMode === 'inspect') || (mode === 'picking' && optMode === 'inspect') || optMode === mode;
      opt.classList.toggle('active', isTarget);
    });

    if (mode === 'full') {
      this.chipPageContext.className = 'chip active';
      this.chipContextIcon.textContent = '🌐';
      this.chipContextLabel.textContent = 'Full Page';
      this.btnRemoveContext.setAttribute('title', 'Detach context');
    } else if (mode === 'picking') {
      this.chipPageContext.className = 'chip section-mode picking';
      this.chipContextIcon.textContent = '🎯';
      this.chipContextLabel.textContent = 'Click section on page...';
      this.btnRemoveContext.setAttribute('title', 'Cancel inspect');
    } else if (mode === 'section' && section) {
      this.chipPageContext.className = 'chip section-mode';
      this.chipContextIcon.textContent = '🎯';
      const charStr = section.charCount ? ` (${section.charCount}c)` : '';
      this.chipContextLabel.textContent = `${section.selector || 'Section'}${charStr}`;
      this.btnRemoveContext.setAttribute('title', 'Clear selected section');
    } else if (mode === 'selection') {
      this.chipPageContext.className = 'chip active selection-mode';
      this.chipContextIcon.textContent = '📝';
      const count = section?.charCount || section?.text?.length || 0;
      this.chipContextLabel.textContent = count > 0 ? `Selected Text (${count}c)` : 'Selected Text (Highlight on page)';
      this.btnRemoveContext.setAttribute('title', 'Clear text selection');
    } else {
      this.chipPageContext.className = 'chip none-mode';
      this.chipContextIcon.textContent = '🚫';
      this.chipContextLabel.textContent = 'No Context';
      this.btnRemoveContext.setAttribute('title', 'Attach full page context');
    }
  }

  private async startElementPicker(): Promise<void> {
    try {
      const activeTab = await this.getActiveWebTab();
      if (!activeTab?.id) {
        this.appendMessage('assistant', '⚠️ No active web page found. Open a webpage in your browser and try again.');
        return;
      }

      await this.ensureTabReady(activeTab.id);

      // Set picking state on sidepanel UI
      this.setContextMode('picking');

      chrome.tabs.sendMessage(activeTab.id, { type: 'START_ELEMENT_PICKER' }, (res) => {
        const err = chrome.runtime.lastError;
        if (err) {
          console.warn('[SidePanel] START_ELEMENT_PICKER error:', err.message);
          this.setContextMode('full');
        }
      });
    } catch (e) {
      console.warn('[SidePanel] Failed to start element picker:', e);
      this.setContextMode('full');
    }
  }

  private async attachSelectedTextContext(): Promise<void> {
    try {
      const activeTab = await this.getActiveWebTab();
      if (!activeTab?.id) {
        this.setContextMode('selection', { selector: 'Selected Text', text: '', charCount: 0 });
        return;
      }

      await this.ensureTabReady(activeTab.id);

      const tabRes = await new Promise<any>((resolve) => {
        chrome.tabs.sendMessage(activeTab.id!, { type: 'GET_SELECTION' }, (r) => {
          const _err = chrome.runtime.lastError;
          resolve(r || {});
        });
      });

      const text = (tabRes?.selectedText || '').trim();
      this.setContextMode('selection', {
        selector: 'Selected Text',
        text,
        charCount: text.length
      });
    } catch (e) {
      this.setContextMode('selection', {
        selector: 'Selected Text',
        text: '',
        charCount: 0
      });
    }
  }

  private async inspectPickerAction(): Promise<void> {
    this.elementOutput.textContent = 'Hover and click any element on the active page...';
    try {
      const activeTab = await this.getActiveWebTab();
      if (!activeTab?.id) {
        this.elementOutput.textContent = 'Error: No active web page tab found.';
        return;
      }

      await this.ensureTabReady(activeTab.id);
      this.setContextMode('picking');

      chrome.tabs.sendMessage(activeTab.id, { type: 'START_ELEMENT_PICKER' }, (r) => {
        const err = chrome.runtime.lastError;
        if (err) {
          this.elementOutput.textContent = `Error: ${err.message}`;
          this.setContextMode('full');
        }
      });
    } catch (err: any) {
      this.elementOutput.textContent = `Error: ${err?.message || err}`;
    }
  }

  // ─── Real Model Fetching from Backend ──────────────────────────────────────

  private async loadRealModels(): Promise<void> {
    this.modelTriggerLabel.textContent = 'Loading models...';
    try {
      const data = await MessageBus.send({ type: 'GET_MODELS' });
      const models: ModelOption[] = Array.isArray(data?.models) ? data.models : [];

      this.availableModels = models;

      if (models.length === 0) {
        this.modelTriggerLabel.textContent = 'No models connected';
        this.modelIcon.textContent = '⚠️';
        this.chatInput.placeholder = data?.emptyStateMessage || 'No models connected. Connect a provider in Settings.';
        this.renderModelMenu([]);
        return;
      }

      this.chatInput.placeholder = 'Ask anything — or type / for skills, commands & tools';

      // Preserve previously selected model from memory or local storage
      let savedModelId = this.selectedModelId;
      if (!savedModelId && typeof chrome !== 'undefined' && chrome.storage?.local) {
        try {
          const stored = await chrome.storage.local.get('selectedModelId');
          if (stored?.selectedModelId) savedModelId = stored.selectedModelId;
        } catch {}
      }

      const validModel = models.find((m) => m.id === savedModelId || m.name === savedModelId);
      const selected = validModel ? (validModel.name || validModel.id) : (data?.selectedModel || models[0].id);

      this.selectModel(selected);
      this.renderModelMenu(models);
    } catch (e) {
      console.warn('[SidePanel] Could not load models:', e);
      this.modelTriggerLabel.textContent = 'Offline';
    }
  }

  private renderModelMenu(models: ModelOption[]): void {
    this.modelMenu.innerHTML = '';

    if (models.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'model-menu-empty';
      empty.textContent = 'No models connected. Open Settings → Providers in SuperAgent.';
      this.modelMenu.appendChild(empty);
      return;
    }

    models.forEach((m) => {
      const item = document.createElement('div');
      item.className = `model-menu-item${m.id === this.selectedModelId || m.name === this.selectedModelId ? ' selected' : ''}`;

      const isOrchestrator = m.isAutoRoute || m.id === 'Orchestrator';
      const icon = isOrchestrator ? '⚡' : m.provider === 'openai' ? '🟢' : m.provider === 'anthropic' ? '🟣' : m.provider === 'gemini' ? '🔵' : '🧠';

      item.innerHTML = `
        <div class="model-item-top">
          <span class="model-item-name">${icon} ${m.name}</span>
          ${m.contextWindow ? `<span class="model-item-tag">${m.contextWindow}</span>` : ''}
        </div>
        <div class="model-item-provider">${isOrchestrator ? 'Auto-routes each request to the best model' : `Provider: ${m.provider}`}</div>
      `;

      item.addEventListener('click', () => {
        this.selectModel(m.name || m.id);
        this.modelMenu.classList.remove('open');
      });

      this.modelMenu.appendChild(item);
    });
  }

  private selectModel(modelId: string): void {
    this.selectedModelId = modelId;
    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      chrome.storage.local.set({ selectedModelId: modelId }).catch(() => {});
    }

    const match = this.availableModels.find((m) => m.id === modelId || m.name === modelId);

    if (match) {
      this.modelTriggerLabel.textContent = match.name;
      this.modelIcon.textContent = match.isAutoRoute || match.id === 'Orchestrator' ? '⚡' : match.provider === 'openai' ? '🟢' : match.provider === 'anthropic' ? '🟣' : match.provider === 'gemini' ? '🔵' : '🧠';
    } else {
      this.modelTriggerLabel.textContent = modelId || 'Select model';
    }

    // Update active highlight in menu
    this.modelMenu.querySelectorAll('.model-menu-item').forEach((el, idx) => {
      const m = this.availableModels[idx];
      el.classList.toggle('selected', Boolean(m && (m.id === modelId || m.name === modelId)));
    });
  }

  // ─── Tabs Switching ────────────────────────────────────────────────────────

  private switchTab(tab: 'chat' | 'agent' | 'inspector'): void {
    [this.tabChat, this.tabAgent, this.tabInspector].forEach((t) => t.classList.remove('active'));
    [this.chatPanel, this.agentPanel, this.inspectorPanel].forEach((p) => p.classList.remove('active'));

    if (tab === 'chat') {
      this.tabChat.classList.add('active');
      this.chatPanel.classList.add('active');
    } else if (tab === 'agent') {
      this.tabAgent.classList.add('active');
      this.agentPanel.classList.add('active');
    } else if (tab === 'inspector') {
      this.tabInspector.classList.add('active');
      this.inspectorPanel.classList.add('active');
    }
  }

  // ─── Authentication & Tab Context ──────────────────────────────────────────

  private setOfflineState(): void {
    this.statusDot.className = 'status-dot';
    this.statusText.textContent = 'Offline';
    this.loginModal.classList.remove('active');
    this.modelTriggerLabel.textContent = 'Server Offline';
  }

  private async checkAuthStatus(): Promise<void> {
    try {
      const state: AuthState = await MessageBus.send({ type: 'GET_AUTH_STATE' });
      if (!state.connected) {
        this.setOfflineState();
      } else if (state.authenticated || !state.authRequired) {
        this.statusDot.className = 'status-dot connected';
        this.statusText.textContent = 'Online';
        this.loginModal.classList.remove('active');
        if (this.availableModels.length === 0 || this.modelTriggerLabel.textContent === 'Server Offline') {
          this.loadRealModels();
        }
      } else {
        this.statusDot.className = 'status-dot';
        this.statusText.textContent = 'Locked';
        this.loginModal.classList.add('active');
      }
    } catch {
      this.setOfflineState();
    }
  }

  private async handleLogin(): Promise<void> {
    const password = this.loginPassword.value;
    if (!password) return;

    this.loginError.style.display = 'none';
    this.btnLoginSubmit.textContent = 'Verifying...';

    const res = await MessageBus.send({
      type: 'LOGIN_REQUEST',
      payload: { password }
    });

    this.btnLoginSubmit.textContent = 'Connect Session';

    if (res?.success) {
      this.loginModal.classList.remove('active');
      this.checkAuthStatus();
    } else {
      this.loginError.textContent = res?.error || 'Invalid password.';
      this.loginError.style.display = 'block';
    }
  }

  private async startNewChat(): Promise<void> {
    this.currentSessionId = `ext-chat-${Date.now()}`;
    await ExtensionSessionStore.setCurrentSessionId(this.currentSessionId);
    this.seenEventSeqs.clear();
    this.messagesContainer.innerHTML = '';
    this.agentStepsContainer.innerHTML = '';
    this.messagesContainer.appendChild(this.emptyState);
    this.emptyState.style.display = 'flex';
  }

  // ─── Sending & Executing ────────────────────────────────────────────────────

  private async sendMessage(): Promise<void> {
    const prompt = this.chatInput.value.trim();
    if (!prompt || this.isGenerating) return;

    if (this.statusText.textContent === 'Offline') {
      this.emptyState.style.display = 'none';
      this.appendMessage('user', prompt);
      this.chatInput.value = '';
      this.chatInput.style.height = '42px';
      this.appendMessage('assistant', '⚠️ SuperAgent backend server is offline (http://localhost:1469). Please ensure the backend is running and try again.');
      this.checkAuthStatus();
      return;
    }

    this.emptyState.style.display = 'none';
    this.appendMessage('user', prompt);
    this.chatInput.value = '';
    this.chatInput.style.height = '42px';

    this.setGenerating(true);
    this.seenEventSeqs.clear();
    this.currentAssistantText = '';
    this.currentAssistantBubble = null;

    const selectedModel = this.availableModels.find((m) => m.id === this.selectedModelId || m.name === this.selectedModelId) || this.availableModels[0];

    const modelConfig = selectedModel
      ? {
          provider: selectedModel.isAutoRoute ? undefined : selectedModel.provider,
          model: selectedModel.isAutoRoute ? 'Orchestrator' : selectedModel.name || selectedModel.id
        }
      : {};

    if (this.contextMode === 'selection' && (!this.selectedSection || !this.selectedSection.text)) {
      try {
        const activeTab = await this.getActiveWebTab();
        if (activeTab?.id) {
          const tabRes = await new Promise<any>((resolve) => {
            chrome.tabs.sendMessage(activeTab.id!, { type: 'GET_SELECTION' }, (r) => {
              const _err = chrome.runtime.lastError;
              resolve(r || {});
            });
          });
          const text = (tabRes?.selectedText || '').trim();
          if (text) {
            this.selectedSection = { selector: 'Selected Text', text, charCount: text.length };
          }
        }
      } catch {}
    }

    try {
      await MessageBus.send({
        type: 'AGENT_RUN_START',
        payload: {
          prompt,
          sessionId: this.currentSessionId,
          modelConfig,
          includePageContext: this.contextMode !== 'none',
          pageContextMode: this.contextMode,
          selectedSection: this.selectedSection || undefined,
          approvalMode: this.approvalMode
        }
      });
    } catch (err: any) {
      this.appendMessage('assistant', `⚠️ Error starting agent: ${err?.message || err}`);
      this.setGenerating(false);
      this.checkAuthStatus();
    }
  }

  private async stopAgentRun(): Promise<void> {
    await MessageBus.send({
      type: 'AGENT_RUN_STOP',
      payload: { sessionId: this.currentSessionId }
    }).catch(() => {});
    this.setGenerating(false);
  }

  private setGenerating(generating: boolean): void {
    this.isGenerating = generating;
    if (generating) {
      this.btnSend.className = 'btn-send btn-stop';
      this.btnSend.setAttribute('title', 'Stop Generation');
      this.btnSend.innerHTML = `
        <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><rect x="4" y="4" width="16" height="16" rx="2"/></svg>
      `;
    } else {
      this.btnSend.className = 'btn-send';
      this.btnSend.setAttribute('title', 'Send Message');
      this.btnSend.innerHTML = `
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z"/></svg>
      `;
    }
  }

  private appendMessage(role: 'user' | 'assistant', text: string): HTMLElement {
    const bubble = document.createElement('div');
    bubble.className = `message-bubble ${role}`;
    if (role === 'assistant' && text) {
      bubble.innerHTML = renderMarkdown(text);
    } else {
      bubble.textContent = text;
    }
    this.messagesContainer.appendChild(bubble);
    this.scrollToBottom();
    return bubble;
  }

  private appendThoughtChunk(thoughtChunk: string): void {
    if (!this.currentThoughtBubble) {
      const details = document.createElement('details');
      details.className = 'thought-container';
      details.open = true;

      details.innerHTML = `
        <summary class="thought-summary">
          <span class="thought-icon">💭</span>
          <span class="thought-title">Thinking Process</span>
          <span class="thinking-dots">
            <span class="thinking-dot"></span>
            <span class="thinking-dot"></span>
            <span class="thinking-dot"></span>
          </span>
          <span class="thought-chevron">▼</span>
        </summary>
        <div class="thought-content"></div>
      `;

      this.messagesContainer.appendChild(details);
      this.currentThoughtBubble = details;
      this.currentThoughtBox = details.querySelector('.thought-content');
      this.currentThoughtText = '';
    }

    this.currentThoughtText += thoughtChunk;
    if (this.currentThoughtBox) {
      this.currentThoughtBox.textContent = this.currentThoughtText;
    }
    this.scrollToBottom();
  }

  private renderToolCall(toolEvt: any): void {
    const bubble = document.createElement('div');
    bubble.className = 'message-bubble tool';
    const name = toolEvt.toolName || toolEvt.name || toolEvt.tool || 'tool';
    const input = toolEvt.toolArgs || toolEvt.args || toolEvt.input || {};

    bubble.innerHTML = `
      <div class="tool-header">
        <span>⚡ Tool Executing: <strong>${name}</strong></span>
      </div>
      <div class="tool-output-box">${JSON.stringify(input, null, 2)}</div>
    `;

    this.messagesContainer.appendChild(bubble);
    this.agentStepsContainer.appendChild(bubble.cloneNode(true));
    this.scrollToBottom();
  }

  private renderToolResult(resultEvt: any): void {
    const bubble = document.createElement('div');
    bubble.className = 'message-bubble tool';
    const name = resultEvt.toolName || resultEvt.name || 'tool';
    const output = resultEvt.toolResult !== undefined ? resultEvt.toolResult : (resultEvt.content || resultEvt.output || resultEvt.result || '');

    bubble.innerHTML = `
      <div class="tool-header" style="color: var(--accent-success);">
        <span>✓ Tool Result: <strong>${name}</strong></span>
      </div>
      <div class="tool-output-box">${typeof output === 'object' ? JSON.stringify(output, null, 2) : String(output).slice(0, 2000)}</div>
    `;

    this.messagesContainer.appendChild(bubble);
    this.agentStepsContainer.appendChild(bubble.cloneNode(true));
    this.scrollToBottom();
  }

  private scrollToBottom(): void {
    this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
    this.agentStepsContainer.scrollTop = this.agentStepsContainer.scrollHeight;
  }

  // ─── Inspector Tool Actions ────────────────────────────────────────────────

  private async inspectStorage(tool: string): Promise<void> {
    this.storageOutput.textContent = `Executing ${tool}...`;
    const res = await MessageBus.send({
      type: 'EXECUTE_TOOL',
      payload: { tool, input: {} }
    });
    this.storageOutput.textContent = JSON.stringify(res.result || res.error, null, 2);
  }

  private async inspectNetwork(failedOnly: boolean): Promise<void> {
    this.networkOutput.textContent = 'Fetching network telemetry...';
    const tool = failedOnly ? 'get_failed_requests' : 'get_network_requests';
    const res = await MessageBus.send({
      type: 'EXECUTE_TOOL',
      payload: { tool, input: {} }
    });
    this.networkOutput.textContent = JSON.stringify(res.result || res.error, null, 2);
  }

  private async inspectElements(): Promise<void> {
    const selector = this.selectorInput.value.trim() || 'body';
    this.elementOutput.textContent = `Querying selector "${selector}"...`;
    const res = await MessageBus.send({
      type: 'EXECUTE_TOOL',
      payload: { tool: 'query_elements', input: { selector, limit: 15 } }
    });
    this.elementOutput.textContent = JSON.stringify(res.result || res.error, null, 2);
  }
}

document.addEventListener('DOMContentLoaded', () => {
  new SidePanelController();
});
