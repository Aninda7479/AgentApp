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

/**
 * @deprecated Use {@link TrajectoryStep} for trajectory rendering.
 * Retained for backward compatibility with the streaming API client.
 */
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
  port: number; // Default 1469
  isTauri: boolean;
}

// ═══════════════════════════════════════════════════════════════
// Trajectory Step Model — the canonical UI rendering primitive.
// Each step represents a single visual element in the chat canvas:
// a user message, agent response, tool call, tool result, or thought.
// ═══════════════════════════════════════════════════════════════

export interface TrajectoryAttachment {
  name: string;
  path: string;
  mediaType: 'image' | 'pdf' | 'ppt' | 'audio' | 'video' | 'code' | 'file';
  size?: number;
  url?: string;
}

export interface TrajectoryCodeBlock {
  language: string;
  code: string;
  filename?: string;
}

/** A single step in the agent execution trajectory (user message, assistant reply, tool call, etc.). */
export interface TrajectoryStep {
  id: string;
  type: 'user' | 'assistant' | 'tool_call' | 'tool_result' | 'thought';
  content: string;
  timestamp?: string;
  status?: 'pending' | 'running' | 'success' | 'error';
  toolName?: string;
  model?: string;
  metadata?: {
    model?: string;
    cwd?: string;
    command?: string;
    toolArgs?: Record<string, any>;
    toolInput?: any;
    toolResult?: string;
    exitCode?: number;
    durationMs?: number;
    filename?: string;
    originalCode?: string;
    modifiedCode?: string;
    mediaType?: 'image' | 'pdf' | 'ppt' | 'audio' | 'video' | 'code' | 'file';
    mediaPath?: string;
    attachments?: TrajectoryAttachment[];
    codeBlocks?: TrajectoryCodeBlock[];
    sandboxMode?: 'sandboxed' | 'full';
    addedLines?: number;
    removedLines?: number;
    filesExplored?: number;
    foldersExplored?: number;
    workedDuration?: string;
    regenerationSeq?: number;
    [key: string]: any;
  };
}

/** A user→agent turn, grouping one or more user steps with their agent response steps. */
export interface AgentTurn {
  userSteps: TrajectoryStep[];
  agentSteps: TrajectoryStep[];
}
