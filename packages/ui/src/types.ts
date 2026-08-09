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
  timestamp: string;
}

export interface ChatSession {
  id: string;
  title: string;
  updatedAt: string;
  messageCount: number;
}

export type ProviderType = 'openai' | 'anthropic' | 'gemini' | 'ollama' | 'openrouter' | 'deepseek' | 'groq';

export interface ModelOption {
  id: string;
  name: string;
  provider: ProviderType;
  contextWindow?: string;
  isFree?: boolean;
}

export interface ModelConfig {
  provider: ProviderType;
  modelId: string;
  apiKey?: string;
  baseUrl?: string;
  temperature?: number;
}

export interface ArtifactItem {
  id: string;
  title: string;
  type: 'code' | 'markdown' | 'table' | 'json';
  content: string;
  filepath?: string;
  timestamp: string;
}

export interface ServerConfig {
  host: string;
  port: number; // Default 14692
  isTauri: boolean;
}
