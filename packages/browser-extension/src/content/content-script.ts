/**
 * SuperAgent Browser Extension — Content Script
 * Injected into active tabs to bridge page context, DOM inspection, and storage execution.
 */

import { ContentStorageTools } from './storage-tools.js';
import { ContentElementTools } from './element-tools.js';
import { ContentPageTools } from './page-tools.js';
import { ToolExecutionRequest, ToolExecutionResponse, SectionContextData } from '../shared/types.js';

// ─── Inject Main World Script ───────────────────────────────────────────────

function injectMainWorldScript(): void {
  if (typeof document === 'undefined' || typeof chrome === 'undefined' || !chrome.runtime?.getURL) {
    return;
  }
  try {
    const script = document.createElement('script');
    script.src = chrome.runtime.getURL('main-world.js');
    script.onload = () => script.remove();
    (document.head || document.documentElement).appendChild(script);
  } catch (e) {
    console.warn('[SuperAgent ContentScript] Main world script injection deferred:', e);
  }
}

injectMainWorldScript();
ContentStorageTools.initialize();

// ─── Selection Tracking ─────────────────────────────────────────────────────

let lastNonEmptySelection = '';

if (typeof document !== 'undefined') {
  document.addEventListener('selectionchange', () => {
    try {
      const sel = window.getSelection()?.toString()?.trim();
      if (sel && sel.length > 0) {
        lastNonEmptySelection = sel;
      }
    } catch {}
  });

  document.addEventListener('mouseup', () => {
    try {
      const sel = window.getSelection()?.toString()?.trim();
      if (sel && sel.length > 0) {
        lastNonEmptySelection = sel;
      }
    } catch {}
  });
}

// ─── Interactive Element / Section Picker ───────────────────────────────────

export class ElementPicker {
  private static isActive = false;
  private static overlayEl: HTMLElement | null = null;
  private static bannerEl: HTMLElement | null = null;
  private static badgeEl: HTMLElement | null = null;
  private static currentHoverEl: HTMLElement | null = null;
  private static callback: ((result: SectionContextData | null) => void) | null = null;

  public static start(cb?: (result: SectionContextData | null) => void): void {
    if (typeof document === 'undefined') {
      if (cb) cb({ selector: 'body', tag: 'body', text: 'Mock Section', charCount: 12 });
      return;
    }

    if (this.isActive) {
      this.cleanup();
    }

    this.isActive = true;
    this.callback = cb || null;

    this.createDomElements();
    this.attachListeners();
  }

  public static cancel(): void {
    if (!this.isActive) return;
    const cb = this.callback;
    this.cleanup();

    if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
      try {
        chrome.runtime.sendMessage({ type: 'ELEMENT_PICKER_CANCELLED' }, () => {
          const _err = chrome.runtime.lastError;
        });
      } catch {}
    }

    if (cb) cb(null);
  }

  private static createDomElements(): void {
    const banner = document.createElement('div');
    banner.id = '__superagent_picker_banner';
    banner.style.cssText = `
      position: fixed;
      top: 14px;
      left: 50%;
      transform: translateX(-50%);
      z-index: 2147483647;
      background: rgba(16, 23, 38, 0.95);
      border: 1px solid rgba(255, 178, 62, 0.6);
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.6), 0 0 20px rgba(255, 178, 62, 0.25);
      border-radius: 9999px;
      padding: 8px 18px;
      display: flex;
      align-items: center;
      gap: 12px;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      font-size: 13px;
      color: #eceef6;
      backdrop-filter: blur(8px);
      pointer-events: auto;
      user-select: none;
      transition: all 0.2s ease;
    `;

    banner.innerHTML = `
      <span style="display: inline-flex; align-items: center; gap: 6px;">
        <span style="font-size: 15px;">🎯</span>
        <strong style="color: #ffb23e;">SuperAgent Inspector</strong>: Click any section, div or article to attach
      </span>
      <button id="__superagent_cancel_btn" style="
        background: rgba(255, 255, 255, 0.1);
        border: 1px solid rgba(255, 255, 255, 0.2);
        color: #b4b7c9;
        font-size: 11px;
        font-weight: 600;
        padding: 3px 10px;
        border-radius: 9999px;
        cursor: pointer;
        transition: all 0.15s ease;
      ">Cancel (Esc)</button>
    `;

    document.body.appendChild(banner);
    this.bannerEl = banner;

    const cancelBtn = banner.querySelector('#__superagent_cancel_btn') as HTMLButtonElement;
    if (cancelBtn) {
      cancelBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.cancel();
      });
      cancelBtn.addEventListener('mouseenter', () => {
        cancelBtn.style.background = 'rgba(239, 68, 68, 0.3)';
        cancelBtn.style.borderColor = '#ef4444';
        cancelBtn.style.color = '#ffffff';
      });
      cancelBtn.addEventListener('mouseleave', () => {
        cancelBtn.style.background = 'rgba(255, 255, 255, 0.1)';
        cancelBtn.style.borderColor = 'rgba(255, 255, 255, 0.2)';
        cancelBtn.style.color = '#b4b7c9';
      });
    }

    const overlay = document.createElement('div');
    overlay.id = '__superagent_picker_overlay';
    overlay.style.cssText = `
      position: fixed;
      pointer-events: none;
      z-index: 2147483646;
      border: 2px solid #ffb23e;
      background: rgba(255, 178, 62, 0.18);
      border-radius: 4px;
      transition: all 0.05s ease-out;
      display: none;
    `;
    document.body.appendChild(overlay);
    this.overlayEl = overlay;

    const badge = document.createElement('div');
    badge.id = '__superagent_picker_badge';
    badge.style.cssText = `
      position: absolute;
      top: -24px;
      left: 0;
      background: #ffb23e;
      color: #1a1206;
      font-family: 'JetBrains Mono', Consolas, monospace;
      font-size: 10px;
      font-weight: 700;
      padding: 2px 6px;
      border-radius: 4px;
      white-space: nowrap;
      pointer-events: none;
      box-shadow: 0 2px 6px rgba(0, 0, 0, 0.4);
    `;
    overlay.appendChild(badge);
    this.badgeEl = badge;
  }

  private static onMouseMove = (e: MouseEvent): void => {
    if (!ElementPicker.isActive) return;

    const target = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null;
    if (!target || target.closest('#__superagent_picker_banner') || target.id === '__superagent_picker_overlay') {
      return;
    }

    ElementPicker.currentHoverEl = target;
    const rect = target.getBoundingClientRect();

    if (ElementPicker.overlayEl && ElementPicker.badgeEl) {
      ElementPicker.overlayEl.style.display = 'block';
      ElementPicker.overlayEl.style.left = `${rect.left}px`;
      ElementPicker.overlayEl.style.top = `${rect.top}px`;
      ElementPicker.overlayEl.style.width = `${rect.width}px`;
      ElementPicker.overlayEl.style.height = `${rect.height}px`;

      const selector = ElementPicker.getOptimalSelector(target);
      const textLen = (target.innerText || target.textContent || '').trim().length;
      ElementPicker.badgeEl.textContent = `${selector} · ${textLen.toLocaleString()} chars`;

      if (rect.top < 28) {
        ElementPicker.badgeEl.style.top = '4px';
        ElementPicker.badgeEl.style.left = '4px';
      } else {
        ElementPicker.badgeEl.style.top = '-24px';
        ElementPicker.badgeEl.style.left = '0';
      }
    }
  };

  private static onClick = (e: MouseEvent): void => {
    if (!ElementPicker.isActive) return;

    const target = e.target as HTMLElement;
    if (target?.closest('#__superagent_picker_banner')) {
      return;
    }

    e.preventDefault();
    e.stopPropagation();

    const chosen = ElementPicker.currentHoverEl || (document.elementFromPoint(e.clientX, e.clientY) as HTMLElement);
    if (!chosen) {
      ElementPicker.cancel();
      return;
    }

    const selector = ElementPicker.getOptimalSelector(chosen);
    const text = ElementPicker.extractCleanText(chosen);
    const classes = Array.from(chosen.classList || []);

    const result: SectionContextData = {
      selector,
      tag: chosen.tagName.toLowerCase(),
      id: chosen.id || undefined,
      classes: classes.length > 0 ? classes : undefined,
      text,
      charCount: text.length
    };

    const cb = ElementPicker.callback;
    ElementPicker.showSuccessFlash(result);
    ElementPicker.cleanup();

    if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
      try {
        chrome.runtime.sendMessage({
          type: 'ELEMENT_PICKED',
          payload: result
        }, () => {
          const _err = chrome.runtime.lastError;
        });
      } catch {}
    }

    if (cb) cb(result);
  };

  private static onKeyDown = (e: KeyboardEvent): void => {
    if (e.key === 'Escape') {
      ElementPicker.cancel();
    }
  };

  private static attachListeners(): void {
    window.addEventListener('mousemove', this.onMouseMove, { passive: true });
    window.addEventListener('click', this.onClick, { capture: true });
    window.addEventListener('keydown', this.onKeyDown, { capture: true });
  }

  private static removeListeners(): void {
    window.removeEventListener('mousemove', this.onMouseMove);
    window.removeEventListener('click', this.onClick, { capture: true });
    window.removeEventListener('keydown', this.onKeyDown, { capture: true });
  }

  private static getOptimalSelector(el: HTMLElement): string {
    if (el.id) {
      return `${el.tagName.toLowerCase()}#${el.id}`;
    }
    const classList = Array.from(el.classList || []).filter((c) => !c.startsWith('__superagent') && c.length < 30);
    if (classList.length > 0) {
      const classSelector = `${el.tagName.toLowerCase()}.${classList.slice(0, 2).join('.')}`;
      try {
        if (document.querySelectorAll(classSelector).length === 1) {
          return classSelector;
        }
      } catch {}
    }

    let path = '';
    let curr: HTMLElement | null = el;
    let depth = 0;
    while (curr && curr !== document.body && curr !== document.documentElement && depth < 3) {
      let segment = curr.tagName.toLowerCase();
      if (curr.id) {
        segment += `#${curr.id}`;
        path = path ? `${segment} > ${path}` : segment;
        break;
      }
      const cList = Array.from(curr.classList || []).filter((c) => !c.startsWith('__superagent') && c.length < 25);
      if (cList.length > 0) {
        segment += `.${cList[0]}`;
      }
      path = path ? `${segment} > ${path}` : segment;
      curr = curr.parentElement;
      depth++;
    }
    return path || el.tagName.toLowerCase();
  }

  private static extractCleanText(el: HTMLElement): string {
    const clone = el.cloneNode(true) as HTMLElement;
    const toRemove = clone.querySelectorAll('script, style, noscript, svg, canvas, iframe, #__superagent_picker_banner, #__superagent_picker_overlay');
    toRemove.forEach((r) => r.remove());

    const rawText = clone.innerText || clone.textContent || '';
    return rawText
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
      .join('\n');
  }

  private static showSuccessFlash(data: SectionContextData): void {
    const toast = document.createElement('div');
    toast.style.cssText = `
      position: fixed;
      bottom: 24px;
      left: 50%;
      transform: translateX(-50%);
      z-index: 2147483647;
      background: #10b981;
      color: #ffffff;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      font-size: 13px;
      font-weight: 600;
      padding: 8px 18px;
      border-radius: 9999px;
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
      display: flex;
      align-items: center;
      gap: 8px;
    `;
    toast.innerHTML = `✓ Attached <strong>${data.selector}</strong> (${(data.charCount || 0).toLocaleString()} chars) to SuperAgent Context`;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 2600);
  }

  private static cleanup(): void {
    this.isActive = false;
    this.removeListeners();
    if (this.bannerEl) {
      this.bannerEl.remove();
      this.bannerEl = null;
    }
    if (this.overlayEl) {
      this.overlayEl.remove();
      this.overlayEl = null;
    }
    this.badgeEl = null;
    this.currentHoverEl = null;
    this.callback = null;
  }
}

// ─── Message Dispatcher ─────────────────────────────────────────────────────

if (typeof chrome !== 'undefined' && chrome.runtime?.onMessage) {
  chrome.runtime.onMessage.addListener((message: any, sender, sendResponse) => {
    if (message.type === 'PING') {
      sendResponse({ pong: true });
      return false;
    }

    if (message.type === 'GET_SELECTION') {
      const cur = typeof window !== 'undefined' ? window.getSelection()?.toString() || '' : '';
      const selectedText = cur || lastNonEmptySelection || '';
      sendResponse({ selectedText });
      return false;
    }

    if (message.type === 'START_ELEMENT_PICKER') {
      ElementPicker.start();
      sendResponse({ success: true, picking: true });
      return false;
    }

    if (message.type === 'CANCEL_ELEMENT_PICKER') {
      ElementPicker.cancel();
      sendResponse({ cancelled: true });
      return false;
    }

    if (message.type === 'EXECUTE_TOOL') {
      const request = message.payload as ToolExecutionRequest;
      executeTool(request)
        .then(sendResponse)
        .catch((err) => sendResponse({ success: false, error: err?.message || String(err) }));
      return true; // Keep channel open for async response
    }

    return false;
  });
}

async function executeTool(request: ToolExecutionRequest): Promise<ToolExecutionResponse> {
  const { tool, input } = request;

  try {
    let result: any = null;

    switch (tool) {
      // ─── Storage Tools ────────────────────────────────────────────────────
      case 'get_local_storage':
        result = await ContentStorageTools.getLocalStorage(input.key);
        break;
      case 'set_local_storage':
        result = await ContentStorageTools.setLocalStorage(input.key, input.value);
        break;
      case 'get_session_storage':
        result = await ContentStorageTools.getSessionStorage(input.key);
        break;
      case 'set_session_storage':
        result = await ContentStorageTools.setSessionStorage(input.key, input.value);
        break;
      case 'list_indexeddb_databases':
        result = await ContentStorageTools.listIndexedDbDatabases();
        break;
      case 'query_indexeddb':
        result = await ContentStorageTools.queryIndexedDb(input.dbName, input.storeName, input.queryLimit);
        break;
      case 'get_cache_storage':
        result = await ContentStorageTools.getCacheStorage();
        break;

      // ─── Page Tools ───────────────────────────────────────────────────────
      case 'extract_page_content':
        result = ContentPageTools.extractPageContent();
        break;
      case 'get_page_metadata':
        result = ContentPageTools.getPageMetadata();
        break;
      case 'find_on_page':
        result = ContentPageTools.findOnPage(input.query, input.caseSensitive);
        break;
      case 'click_element':
        result = ContentPageTools.clickElement(input.selector);
        break;
      case 'type_in_element':
        result = ContentPageTools.typeInElement(input.selector, input.text, input.clearFirst);
        break;

      // ─── Element Tools ────────────────────────────────────────────────────
      case 'query_elements':
        result = ContentElementTools.queryElements(input.selector || '*', input.limit || 20);
        break;
      case 'get_element_styles':
        result = ContentElementTools.getElementStyles(input.selector);
        break;
      case 'get_element_tree':
        result = ContentElementTools.getElementTree(input.selector || 'body', input.maxDepth || 3);
        break;
      case 'get_element_attributes':
        result = ContentElementTools.getElementAttributes(input.selector);
        break;
      case 'highlight_element':
        result = ContentElementTools.highlightElement(input.selector, input.durationMs || 3000);
        break;
      case 'measure_element':
        result = ContentElementTools.measureElement(input.selector);
        break;

      default:
        return { success: false, error: `Unrecognized content script tool: ${tool}` };
    }

    return { success: true, result };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Tool execution encountered an error' };
  }
}
