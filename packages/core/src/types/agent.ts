/** Supported AI provider identifiers. */
export type AIProvider =
  | 'openai'
  | 'chatgpt'
  | 'anthropic'
  | 'claude'
  | 'gemini'
  | 'google'
  | 'deepseek'
  | 'deepinfra'
  | 'openrouter'
  | 'kimi'
  | 'moonshot'
  | 'mistral'
  | 'grok'
  | 'perplexity'
  | 'vertex'
  | 'ollama'
  | 'custom';

/** Configuration for a Bring-Your-Own-Key provider connection. */
export interface BYOKConfig {
  provider: AIProvider;
  apiKey: string;
  baseUrl?: string;
  modelName?: string;
}

/** A single message in an agent conversation trajectory. */
export interface AgentMessage {
  id: string;
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  timestamp: number;
  toolCalls?: ToolCall[];
}

/** A tool invocation record with its execution status. */
export interface ToolCall {
  id: string;
  toolName: string;
  args: Record<string, any>;
  result?: any;
  status: 'pending' | 'executing' | 'completed' | 'failed';
}

/** Definition of a tool available to the agent, including its schema and executor. */
export interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, any>;
  execute: (args: Record<string, any>, config: BYOKConfig) => Promise<any>;
}

/** Request payload for generating a multimodal media asset. */
export interface MediaGenerationRequest {
  type: 'image' | 'audio' | 'video' | 'pdf' | 'ppt';
  prompt: string;
  options?: Record<string, any>;
}

/** Full conversation trajectory for an agent session. */
export interface ExecutionTrajectory {
  sessionId: string;
  messages: AgentMessage[];
  activeTool?: ToolCall;
  permissionMode: 'auto' | 'manual' | 'read-only';
}

/**
 * A single content block within a multimodal chat message.
 * - `text` blocks carry plain text.
 * - `image_url` blocks carry an image, either as an `https:` URL or a
 *   `data:image/<ext>;base64,<bytes>` URL (used for locally attached files).
 */
export type ContentBlock =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string; detail?: 'low' | 'auto' | 'high' } };

/**
 * A validated image attachment, ready to be embedded in a chat message.
 * `dataUrl` is a `data:image/<ext>;base64,<bytes>` URL.
 */
export interface ImageAttachment {
  path: string;
  mediaType: string;
  dataUrl: string;
  size: number;
}

/** A chat message used in completion requests to provider APIs. */
export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  /** Plain text, or a multimodal array of text/image blocks. */
  content: string | ContentBlock[];
  name?: string;
  toolCallId?: string;
  toolCalls?: ToolCall[];
}

/** Request payload to complete a chat with an LLM provider. */
export interface CompletionRequest {
  messages: ChatMessage[];
  model?: string;
  temperature?: number;
  maxTokens?: number;
  tools?: ToolDefinition[];
  stream?: boolean;
}

/** Response from an LLM completion request. */
export interface CompletionResponse {
  id: string;
  provider: AIProvider;
  model: string;
  content: string;
  toolCalls?: ToolCall[];
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

/** Capabilities and limits of a specific AI model. */
export interface ModelCapability {
  id: string;
  name: string;
  provider: AIProvider;
  contextWindow: number;
  maxOutputTokens: number;
  supportsVision: boolean;
  supportsTools: boolean;
  supportsReasoning: boolean;
}

/** Interface that every LLM provider adapter must implement. */
export interface BaseProviderAdapter {
  readonly provider: AIProvider;
  complete(request: CompletionRequest): Promise<CompletionResponse>;
  streamComplete?(request: CompletionRequest, onChunk: (chunk: string) => void): Promise<CompletionResponse>;
  listModels?(): Promise<ModelCapability[]>;
}

