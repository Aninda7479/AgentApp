/**
 * Canonical reasoning-effort tier, normalized across every provider.
 * Each provider exposes "thinking" differently (an OpenAI `reasoning_effort`
 * token, an Anthropic `thinking.budget_tokens`, a Gemini `thinkingBudget`, …);
 * this is the single internal scale the orchestrator reasons about, and the
 * `reasoning-effort.ts` module maps it onto the per-provider request shape.
 */
export type ReasoningEffort = 'low' | 'medium' | 'high';

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
  | 'omniroute'
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
  frequencyPenalty?: number;
  presencePenalty?: number;
  maxTokens?: number;
  tools?: ToolDefinition[];
  stream?: boolean;
  /** Desired reasoning effort; the router/adapter map it onto the provider's
   *  native "thinking" control. Ignored when the target model can't reason. */
  reasoningEffort?: ReasoningEffort;
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

/** Input/output modality a model can consume or produce. */
export type Modality = 'text' | 'image' | 'video' | 'audio' | '3d';

/**
 * Live availability of a model for routing. The router skips anything other
 * than `available` so a locked/rate-limited/deprecated model is never selected
 * (mission point: resilience to a provider going down). Defaults to `available`
 * so callers that don't set it keep working.
 */
export type AccessStatus = 'available' | 'locked' | 'rate_limited' | 'deprecated';

/** Coarse latency tier used by cost/latency-dominant routing. */
export type SpeedTier = 'fast' | 'balanced' | 'slow';

/** Coarse capability tier used by quality-dominant routing. */
export type IntelligenceTier = 'low' | 'mid' | 'high' | 'frontier';

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
  // ── Extended capability registry (all optional; additive over the legacy
  //    supports* booleans so existing callers/tests keep working) ──────────
  /** Modalities the model accepts as input. */
  inputModalities?: Modality[];
  /** Modalities the model can emit. */
  outputModalities?: Modality[];
  /** Domain specialties the model is strong at (coding, translation, 3d, …). */
  specialties?: string[];
  /** Coarse latency tier. */
  speedTier?: SpeedTier;
  /** Coarse capability tier. */
  intelligenceTier?: IntelligenceTier;
  /** Live availability for routing (see AccessStatus). */
  accessStatus?: AccessStatus;
  /** True when served by a local process (Ollama) — zero-cost, zero external risk. */
  isLocal?: boolean;
  /** Reasoning-effort levels this model's provider exposes, if any. */
  reasoningEffortLevels?: string[];
  /** Approximate blended cost in USD per 1k tokens (input+output), if known. */
  costPer1kTokens?: number;
  /** Provider moderation strictness (one more registry field for informed routing). */
  moderationLevel?: 'none' | 'low' | 'standard' | 'strict';
}

/** Interface that every LLM provider adapter must implement. */
export interface BaseProviderAdapter {
  readonly provider: AIProvider;
  complete(request: CompletionRequest): Promise<CompletionResponse>;
  streamComplete?(request: CompletionRequest, onChunk: (chunk: string) => void): Promise<CompletionResponse>;
  listModels?(): Promise<ModelCapability[]>;
}

