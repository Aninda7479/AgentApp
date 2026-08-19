/**
 * SuperAgent Browser Extension — Shared Type Definitions
 */

export type Role = 'system' | 'user' | 'assistant' | 'tool';

export interface TextBlock {
  type: 'text';
  text: string;
}

export interface ToolUseBlock {
  type: 'tool_use';
  id: string;
  name: string;
  input: Record<string, unknown>;
}

export interface ToolResultBlock {
  type: 'tool_result';
  tool_use_id: string;
  content: string;
  is_error?: boolean;
}

export type ContentBlock = TextBlock | ToolUseBlock | ToolResultBlock;

export interface ChatMessage {
  id: string;
  role: Role;
  content: ContentBlock[];
  timestamp: number;
}

export interface ModelOption {
  id: string;
  name: string;
  provider: string;
  contextWindow?: string;
  isFree?: boolean;
  enabled?: boolean;
  isAutoRoute?: boolean;
  description?: string;
}

export interface ServerConfig {
  baseUrl: string;
  token?: string;
  autoConnect: boolean;
  selectedModel: string;
  selectedProvider: string;
}

export interface AuthState {
  connected: boolean;
  authenticated: boolean;
  authRequired: boolean;
  username?: string;
  token?: string;
  lastChecked?: number;
  error?: string;
}

export interface ActiveTabContext {
  tabId?: number;
  url: string;
  title: string;
  favicon?: string;
  selectedText?: string;
}

// ─── Tool Call Definitions ──────────────────────────────────────────────────

export type BrowserToolName =
  // Storage tools
  | 'get_local_storage'
  | 'set_local_storage'
  | 'get_session_storage'
  | 'set_session_storage'
  | 'list_indexeddb_databases'
  | 'query_indexeddb'
  | 'get_cookies'
  | 'set_cookie'
  | 'delete_cookie'
  | 'get_cache_storage'
  // Network tools
  | 'get_network_requests'
  | 'get_failed_requests'
  | 'get_request_headers'
  | 'capture_network_har'
  | 'get_websocket_frames'
  | 'get_response_body'
  | 'get_performance_metrics'
  // Page tools
  | 'extract_page_content'
  | 'capture_screenshot'
  | 'get_page_metadata'
  | 'find_on_page'
  | 'click_element'
  | 'type_in_element'
  // DOM element tools
  | 'query_elements'
  | 'get_element_styles'
  | 'get_element_tree'
  | 'get_element_attributes'
  | 'get_event_listeners'
  | 'get_accessibility_tree'
  | 'highlight_element'
  | 'measure_element';

export interface ToolExecutionRequest {
  tool: BrowserToolName | string;
  input: Record<string, any>;
  tabId?: number;
}

export interface ToolExecutionResponse {
  success: boolean;
  result?: any;
  error?: string;
}

// ─── Network Log Entry ──────────────────────────────────────────────────────

export interface NetworkLogEntry {
  id: string;
  url: string;
  method: string;
  statusCode?: number;
  type: string;
  timeStamp: number;
  fromCache?: boolean;
  requestHeaders?: Record<string, string>;
  responseHeaders?: Record<string, string>;
  error?: string;
}

// ─── Runtime Messages ───────────────────────────────────────────────────────

export interface SectionContextData {
  selector: string;
  tag?: string;
  id?: string;
  classes?: string[];
  text: string;
  charCount?: number;
}

export type ExtensionMessage =
  | { type: 'PING' }
  | { type: 'GET_AUTH_STATE' }
  | { type: 'AUTH_STATE_CHANGED'; payload: AuthState }
  | { type: 'LOGIN_REQUEST'; payload: { password: string; baseUrl?: string } }
  | { type: 'LOGOUT_REQUEST' }
  | { type: 'GET_MODELS' }
  | { type: 'GET_ACTIVE_TAB_CONTEXT' }
  | { type: 'ACTIVE_TAB_CONTEXT_RESPONSE'; payload: ActiveTabContext }
  | { type: 'EXECUTE_TOOL'; payload: ToolExecutionRequest }
  | { type: 'START_ELEMENT_PICKER' }
  | { type: 'CANCEL_ELEMENT_PICKER' }
  | { type: 'ELEMENT_PICKED'; payload: SectionContextData }
  | { type: 'ELEMENT_PICKER_CANCELLED' }
  | { type: 'SELECTION_CHANGED'; payload: { text: string } }
  | {
      type: 'AGENT_RUN_START';
      payload: {
        prompt: string;
        sessionId: string;
        modelConfig: any;
        includePageContext?: boolean;
        pageContextMode?: 'full' | 'section' | 'selection' | 'none';
        selectedSection?: SectionContextData;
        approvalMode?: string;
      };
    }
  | { type: 'AGENT_RUN_STOP'; payload: { sessionId: string } }
  | { type: 'AGENT_EVENT'; payload: any }
  | { type: 'CONNECTION_STATE_CHANGED'; payload: { connected: boolean } }
  | { type: 'GET_SERVER_CONFIG' }
  | { type: 'SET_SERVER_CONFIG'; payload: Partial<ServerConfig> }
  | { type: 'PING_SERVER' }
  | { type: 'GET_MEMORY_PROFILE' }
  | { type: 'GET_LEARNED_INSIGHTS' }
  | { type: 'SYNC_SESSION'; payload: { sessionId: string; lastSeq?: number } };
