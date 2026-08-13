import { ServerConfig, ModelOption } from './types.js';

export const DEFAULT_HOMELAB_PORT = 1469;

export const DEFAULT_SERVER_CONFIG: ServerConfig = {
  host: 'localhost',
  port: DEFAULT_HOMELAB_PORT,
  isTauri: typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
};

export const AVAILABLE_MODELS: ModelOption[] = [
  { id: 'gpt-4o', name: 'GPT-4o', provider: 'openai', contextWindow: '128k' },
  { id: 'gpt-4o-mini', name: 'GPT-4o Mini', provider: 'openai', contextWindow: '128k', isFree: true },
  { id: 'claude-3-5-sonnet-20241022', name: 'Claude 3.5 Sonnet', provider: 'anthropic', contextWindow: '200k' },
  { id: 'claude-3-5-haiku-20241022', name: 'Claude 3.5 Haiku', provider: 'anthropic', contextWindow: '200k' },
  { id: 'gemini-1.5-pro', name: 'Gemini 1.5 Pro', provider: 'gemini', contextWindow: '2M' },
  { id: 'gemini-1.5-flash', name: 'Gemini 1.5 Flash', provider: 'gemini', contextWindow: '1M', isFree: true },
  { id: 'deepseek-chat', name: 'DeepSeek V3', provider: 'deepseek', contextWindow: '64k' },
  { id: 'deepseek-reasoner', name: 'DeepSeek R1', provider: 'deepseek', contextWindow: '64k' },
  { id: 'llama3', name: 'Llama 3 (Local)', provider: 'ollama', contextWindow: '8k', isFree: true },
  { id: 'llama3.3:70b', name: 'Llama 3.3 70B (Groq)', provider: 'groq', contextWindow: '128k', isFree: true }
];
