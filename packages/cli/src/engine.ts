/**
 * engine.ts — Bridges the interactive TUI to the real streaming AI engine in
 * `@superagent/core` (AgentEngine). The previous TUI only echoed a stub string;
 * this module wires genuine multi-turn chat + tool use into the terminal.
 *
 * Responsibilities:
 *  - Resolve the live provider/model/apiKey/baseUrl from env vars, the BYOK
 *    manager, and persisted settings (so the user only needs `ANTHROPIC_*`
 *    style env vars, or a saved key, to chat).
 *  - Keep a single AgentEngine instance per session so conversation history
 *    persists across turns (the engine appends to its own history on each run).
 *  - Stream tokens / tool calls / errors to the UI through a small handler set.
 *  - Recreate the engine when the model or provider is switched (history resets).
 */

import {
  SuperAgentEngine,
  type AgentEngineConfig,
  type AgentEvent,
  type ImageAttachment,
  type PermissionMode,
  getActiveConnection,
  resolveConnection as coreResolveConnection,
  type ActiveConnection,
} from '@superagent/core';
import { PermissionLevel } from './shortcuts/permissions.js';

/**
 * A fully-resolved connection the engine can actually talk to. It is a plain
 * data shape owned by Core (`ActiveConnection`) — the CLI never computes keys,
 * base URLs, or default models itself. All resolution happens in Core so the
 * default connection (and credentials) are decided in exactly one place.
 */
export type ResolvedConnection = ActiveConnection;

/**
 * Resolves the active connection from Core (persisted settings / BYOK). This is
 * the single entry point the TUI uses; it honours explicit provider/model
 * overrides (CLI flags) and otherwise falls back to Core's default connection.
 * No terminal env vars or hardcoded providers/models are consulted here.
 */
export function detectDefaultConnection(provider?: string, model?: string): ResolvedConnection {
  return getActiveConnection(provider, model);
}

/** Resolves a connection for an explicit provider/model via Core. */
export function resolveConnection(provider: string, model: string): ResolvedConnection {
  return coreResolveConnection(provider, model);
}

/** Maps the TUI's 3-state permission to the engine's sandbox permission mode. */
function mapPermission(permission: PermissionLevel): PermissionMode {
  if (permission === 'deny') return 'deny-all';
  // 'auto' and 'ask' both run autonomously in the TUI for now (the TUI has no
  // blocking approval prompt yet); 'ask' is surfaced as a label only.
  return 'full-autonomy';
}

/** A lightweight token-usage snapshot for the status bar. */
export interface UsageInfo {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

/** Events emitted to the UI while a turn streams. */
export interface ChatHandlers {
  onToken: (text: string) => void;
  onThinking?: (thinking: boolean) => void;
  onToolCall?: (name: string, args: Record<string, unknown>) => void;
  onToolResult?: (name: string, result: string) => void;
  onUsage?: (usage: UsageInfo) => void;
  onError?: (message: string) => void;
  onDone?: (info: { elapsedMs: number }) => void;
}

/**
 * Wraps a persistent AgentEngine for one interactive chat session. Reuse the
 * same instance across turns to keep multi-turn context; call `setConnection`
 * to switch models (which resets history).
 */
export class ChatSession {
  private engine: SuperAgentEngine | null = null;
  private conn: ResolvedConnection;
  private permission: PermissionLevel;

  constructor(conn: ResolvedConnection, permission: PermissionLevel = 'auto') {
    this.conn = conn;
    this.permission = permission;
  }

  get provider(): string {
    return this.conn.provider;
  }
  get model(): string {
    return this.conn.model;
  }

  /** Updates the active connection and rebuilds the engine (history resets). */
  setConnection(conn: ResolvedConnection): void {
    this.conn = conn;
    this.engine = null;
  }

  setPermission(permission: PermissionLevel): void {
    this.permission = permission;
    // Recreate so the new sandbox mode takes effect on the next turn.
    this.engine = null;
  }

  private ensureEngine(): SuperAgentEngine {
    if (this.engine) return this.engine;
    const config: AgentEngineConfig = {
      provider: this.conn.provider,
      apiKey: this.conn.apiKey || 'missing-api-key',
      baseUrl: this.conn.baseUrl || undefined,
      model: this.conn.model,
      projectRoot: process.cwd(),
      permissionMode: mapPermission(this.permission),
      // Keep history manageable in a long session.
      contextWindow: 128000,
    };
    this.engine = new SuperAgentEngine(config);
    return this.engine;
  }

  /** Aborts an in-flight generation if any. */
  abort(): void {
    this.engine?.abort();
  }

  /** Runs one user turn, streaming output to the supplied handlers. */
  async send(prompt: string, attachments: ImageAttachment[], handlers: ChatHandlers): Promise<void> {
    const engine = this.ensureEngine();
    const start = Date.now();
    handlers.onThinking?.(true);
    try {
      await engine.run(
        prompt,
        (ev: AgentEvent) => {
           switch (ev.type) {
              case 'token':
                if (ev.content) handlers.onToken(ev.content);
                if (ev.usage) {
                  handlers.onUsage?.({
                    promptTokens: ev.usage.promptTokens,
                    completionTokens: ev.usage.completionTokens,
                    totalTokens: ev.usage.totalTokens,
                  });
                }
                break;
            case 'tool_call':
              handlers.onToolCall?.(ev.toolName || '', (ev.toolArgs as Record<string, unknown>) ?? {});
              break;
            case 'tool_result':
              handlers.onToolResult?.(ev.toolName || '', ev.toolResult || '');
              break;
            case 'error':
              handlers.onError?.(ev.error || 'Agent error');
              break;
            default:
              break;
          }
        },
        attachments
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      handlers.onError?.(msg);
    } finally {
      handlers.onThinking?.(false);
      handlers.onDone?.({ elapsedMs: Date.now() - start });
    }
  }
}
