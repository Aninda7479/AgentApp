import { BestOfNStrategy } from '../orchestrator/best-of-n.js';
import type { RerouteEvent } from '../orchestrator/router.js';
import {
  ContentBlock,
  type AIProvider,
  type ReasoningEffort,
  type ToolCall
} from '../types/agent.js';
import { PermissionMode, ConfirmationHandler } from '../sandbox/permissions.js';
import { InternetAccessLevel } from '../storage/settings-store.js';

/** Types of events emitted during agent execution. */
export type AgentEventType =
  | 'token'          // streaming text token
  | 'replace_tokens'  // replace active streaming buffer with sanitized text
  | 'tool_call'      // agent decided to call a tool
  | 'tool_result'    // tool returned a result
  | 'thought'        // agent reasoning step
  | 'done'           // generation complete
  | 'error'          // error occurred
  | 'abort'          // user stopped
  | 'bestofn'        // best-of-N merge result (parallel multi-model orchestration)
  | 'reroute'        // orchestrator avoided/failed-over a provider (resilience visible)
  | 'context';       // live context-window usage estimate (used by the UI gauge)

export interface AgentEvent {
  type: AgentEventType;
  sessionId: string;
  content?: string;
  toolName?: string;
  toolArgs?: Record<string, unknown>;
  toolResult?: string;
  error?: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  /** best-of-N merge metadata, set on 'bestofn' events. */
  candidates?: Array<{ provider: string; model: string }>;
  strategy?: BestOfNStrategy;
  mergedCount?: number;
  toolFallback?: boolean;
  /** Agreement ratio 0..1 across candidates (1 = unanimous). A bias-resistance
   *  signal: high agreement means the answer is robust to any single model's
   *  biases; low agreement means the models diverged. */
  agreement?: number;
  /** Number of distinct (normalized) answers among the candidates. */
  clusters?: number;
  /** Resilience metadata, set on 'reroute' events: which provider was avoided,
   *  demoted, or failed over, and why. Surfaces the "can't be banned out from
   *  under you" promise to the GUI instead of failing silently. */
  reroute?: RerouteEvent;
  /** Live context-window usage estimate, emitted as the conversation grows so
   *  the workspace can render a "how full is the context window" gauge. `pct`
   *  is 0..100 against the orchestrator-selected model's context window. */
  context?: {
    used: number;
    limit: number;
    pct: number;
  };
}

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, any>; // JSON Schema
  execute: (args: Record<string, any>, config?: any) => Promise<any>;
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | ContentBlock[];
  toolCallId?: string;
  name?: string;
  /** For assistant turns that invoked tools: the calls made. Echoed back to the
   *  provider on the next turn so assistant↔tool messages stay correctly paired
   *  (OpenAI requires it) and the model can see its own prior action. Without
   *  this, a weak model re-issues the same call forever (the runaway-loop bug). */
  toolCalls?: ToolCall[];
}

export interface AgentEngineConfig {
  provider: string;
  apiKey: string;
  baseUrl?: string;
  model: string;
  systemPrompt?: string;
  projectRoot?: string;
  maxTokens?: number;
  temperature?: number;
  frequencyPenalty?: number;
  presencePenalty?: number;
  /** Per-request reasoning-effort tier, honored by orchestrated (bridge) turns. */
  reasoningEffort?: ReasoningEffort;
  /** Pre-approved shell commands for this project. When non-empty, run_command
   *  only executes commands whose first token(s) match an entry (prefix-based).
   *  Opt-in: an empty/undefined list permits all commands. */
  allowedCommands?: string[];
  /** Sandbox permission mode controlling approval gating. Defaults to
   *  'auto-approve-edits' when omitted. */
  permissionMode?: PermissionMode;
  /** Full system access: disables project-root path scoping for files. */
  unsandboxed?: boolean;
  /** User-in-the-loop approval callback. */
  requestApproval?: ConfirmationHandler;
  /** Additional tools merged into the agent's toolset. */
  extraTools?: ToolDefinition[];
  /** Absolute paths to all files attached to this chat session */
  attachments?: string[];
  /** Internet access governance level for this run */
  internetAccess?: InternetAccessLevel;
  /** Context-window size (in tokens) of the effective model. */
  contextWindow?: number;
  /** When false, the engine's toolset omits `run_subagent` so a sub-agent
   *  cannot spawn further sub-agents (prevents unbounded recursion). Defaults
   *  to true for the top-level agent. */
  allowSubagents?: boolean;
  /** Rolling-compaction tuning (see `rollingCompact`, which uses the `/compact`
   *  primitive). `compactKeepRecent` = how many recent messages to keep verbatim
   *  after compaction; `0` (default) condenses the WHOLE conversation into one
   *  summary, matching what `/compact` produces. */
  compactAtRatio?: number;
  compactKeepRecent?: number;
  compactSummaryMaxChars?: number;
}

/** A single parallel candidate for best-of-N orchestration. Extends the base
 *  config so a candidate can override provider/model/apiKey/baseUrl independently. */
export interface BestOfNCandidate {
  provider: string;
  model: string;
  apiKey?: string;
  baseUrl?: string;
}

/**
 * Config for {@link AgentEngine.runBestOfN} — runs several task-matched models
 * in parallel and merges their outputs (mission point 2: route a task to
 * whichever models are actually good at it, then combine). A strict superset of
 * AgentEngineConfig: when `candidates` is omitted, runBestOfN degrades to a
 * normal single-model run so callers never have to branch.
 */
export interface BestOfNConfig extends AgentEngineConfig {
  /** The N models to run in parallel. Falls back to `[config]` when empty. */
  candidates?: BestOfNCandidate[];
  /** Merge strategy (see mergeBestOfN). Defaults to 'consensus'. */
  strategy?: BestOfNStrategy;
  /** When true (default) final text is merged; only meaningful when no
   *  candidate needs tools. Set false to get per-candidate text unmerged. */
  merge?: boolean;
  /** Optional session id used for emitted events (defaults to a generated id). */
  sessionId?: string;
}
