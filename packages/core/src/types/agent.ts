export type AIProvider = 'openai' | 'anthropic' | 'gemini' | 'deepseek' | 'deepinfra' | 'custom';

export interface BYOKConfig {
  provider: AIProvider;
  apiKey: string;
  baseUrl?: string;
  modelName?: string;
}

export interface AgentMessage {
  id: string;
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  timestamp: number;
  toolCalls?: ToolCall[];
}

export interface ToolCall {
  id: string;
  toolName: string;
  args: Record<string, any>;
  result?: any;
  status: 'pending' | 'executing' | 'completed' | 'failed';
}

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, any>;
  execute: (args: Record<string, any>, config: BYOKConfig) => Promise<any>;
}

export interface MediaGenerationRequest {
  type: 'image' | 'audio' | 'video' | 'pdf' | 'ppt';
  prompt: string;
  options?: Record<string, any>;
}

export interface ExecutionTrajectory {
  sessionId: string;
  messages: AgentMessage[];
  activeTool?: ToolCall;
  permissionMode: 'auto' | 'manual' | 'read-only';
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  name?: string;
  toolCallId?: string;
  toolCalls?: ToolCall[];
}

export interface CompletionRequest {
  messages: ChatMessage[];
  model?: string;
  temperature?: number;
  maxTokens?: number;
  tools?: ToolDefinition[];
  stream?: boolean;
}

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

export interface BaseProviderAdapter {
  readonly provider: AIProvider;
  complete(request: CompletionRequest): Promise<CompletionResponse>;
  streamComplete?(request: CompletionRequest, onChunk: (chunk: string) => void): Promise<CompletionResponse>;
  listModels?(): Promise<ModelCapability[]>;
}

