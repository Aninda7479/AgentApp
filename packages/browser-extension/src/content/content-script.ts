/**
 * SuperAgent Browser Extension — Content Script
 * Injected into active tabs to bridge page context, DOM inspection, and storage execution.
 */

import { ContentStorageTools } from './storage-tools.js';
import { ContentElementTools } from './element-tools.js';
import { ContentPageTools } from './page-tools.js';
import { ToolExecutionRequest, ToolExecutionResponse } from '../shared/types.js';

// ─── Inject Main World Script ───────────────────────────────────────────────

function injectMainWorldScript(): void {
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

// ─── Message Dispatcher ─────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((message: any, sender, sendResponse) => {
  if (message.type === 'GET_SELECTION') {
    const selectedText = window.getSelection()?.toString() || '';
    sendResponse({ selectedText });
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
