/**
 * SuperAgent Browser Extension — Constants
 */

import { ModelOption, ServerConfig } from './types.js';

export const DEFAULT_PORT = 1469;
export const DEFAULT_BASE_URL = `http://localhost:${DEFAULT_PORT}`;

export const STORAGE_KEYS = {
  SERVER_CONFIG: 'sa_server_config',
  AUTH_TOKEN: 'sa_auth_token',
  AUTH_STATE: 'sa_auth_state',
  APPROVAL_MODE: 'sa_approval_mode',
  CHAT_SESSIONS: 'sa_chat_sessions',
  CURRENT_SESSION_ID: 'sa_current_session_id',
  NETWORK_LOG: 'sa_network_log',
  SETTINGS: 'sa_settings'
} as const;

export const DEFAULT_SERVER_CONFIG: ServerConfig = {
  baseUrl: DEFAULT_BASE_URL,
  token: '',
  autoConnect: true,
  selectedModel: '',
  selectedProvider: ''
};
