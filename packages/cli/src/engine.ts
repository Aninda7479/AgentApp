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
  resolveBaseUrl,
  BYOKProviderManager,
  SettingsStorage,
} from '@superagent/core';
import { PermissionLevel } from './shortcuts/permissions.js';

/** A fully-resolved connection the engine can actually talk to. */
export interface ResolvedConnection {
  provider: string;
  model: string;
  apiKey: string;
  baseUrl: string;
}

/** Resolves an API key for a provider from env, settings, BYOK, then defaults. */
export function resolveApiKey(provider: string): string {
  const up = provider.toUpperCase().replace(/-/g, '_');
  const fromEnv = process.env[`${up}_API_KEY`];
  if (fromEnv) return fromEnv;

  // OpenRouter (and its models, e.g. tencent/hy3:free) is the canonical free
  // provider. Prefer the key stored in core's settings/BYOK over the loose
  // ANTHROPIC_* env vars, which may hold a real Anthropic key that OpenRouter
  // would reject.
  if (provider === 'openrouter') {
    try {
      const saved = SettingsStorage.loadSettings();
      const p = saved.providers?.find((x) => x.id === 'openrouter');
      if (p?.apiKey) return p.apiKey;
    } catch {
      /* ignore */
    }
  }

  if (provider === 'anthropic') {
    if (process.env.ANTHROPIC_AUTH_TOKEN) return process.env.ANTHROPIC_AUTH_TOKEN;
    if (process.env.ANTHROPIC_API_KEY) return process.env.ANTHROPIC_API_KEY;
  }

  if (process.env.OPENROUTER_API_KEY) return process.env.OPENROUTER_API_KEY;

  // Fall back to a saved BYOK key or settings provider entry.
  try {
    const byok = new BYOKProviderManager();
    const cfg = byok.getKey(provider);
    if (cfg?.apiKey) return cfg.apiKey;
  } catch {
    /* ignore */
  }
  try {
    const saved = SettingsStorage.loadSettings();
    const p = saved.providers?.find((x) => x.id === provider);
    if (p?.apiKey) return p.apiKey;
  } catch {
    /* ignore */
  }
  return '';
}

/** Resolves the base URL for a provider from env, settings, then core defaults. */
export function resolveProviderBaseUrl(provider: string): string {
  const up = provider.toUpperCase().replace(/-/g, '_');
  const fromEnv = process.env[`${up}_BASE_URL`];
  if (fromEnv) return fromEnv;

  if (provider === 'openrouter') {
    try {
      const saved = SettingsStorage.loadSettings();
      const p = saved.providers?.find((x) => x.id === 'openrouter');
      if (p?.baseUrl) return p.baseUrl;
    } catch {
      /* ignore */
    }
    if (process.env.ANTHROPIC_BASE_URL) return process.env.ANTHROPIC_BASE_URL;
  }

  if (provider === 'anthropic' && process.env.ANTHROPIC_BASE_URL) {
    return process.env.ANTHROPIC_BASE_URL;
  }
  return resolveBaseUrl(provider) || '';
}

/** Builds a connection for the given provider/model from all available sources. */
export function resolveConnection(provider: string, model: string): ResolvedConnection {
  return {
    provider,
    model,
    apiKey: resolveApiKey(provider),
    baseUrl: resolveProviderBaseUrl(provider),
  };
}

/**
 * Detects the best default connection. Priority:
 *  1. A configured OpenRouter provider in core settings (the canonical free
 *     provider; its key/baseUrl are authoritative).
 *  2. An Anthropic-compatible proxy configured via ANTHROPIC_BASE_URL/_AUTH_TOKEN.
 *  3. The caller's provider/model.
 */
export function detectDefaultConnection(
  optsProvider: string,
  optsModel?: string
): ResolvedConnection {
  try {
    const saved = SettingsStorage.loadSettings();
    const orProv = saved.providers?.find((p) => p.id === 'openrouter' && p.apiKey);
    if (orProv) {
      const model =
        process.env.ANTHROPIC_MODEL && process.env.ANTHROPIC_MODEL.toLowerCase().includes('tencent')
          ? process.env.ANTHROPIC_MODEL
          : 'tencent/hy3:free';
      return {
        provider: 'openrouter',
        model,
        apiKey: orProv.apiKey,
        baseUrl: orProv.baseUrl || 'https://openrouter.ai/api/v1',
      };
    }
  } catch {
    /* ignore */
  }

  const proxyBase = process.env.ANTHROPIC_BASE_URL;
  const proxyKey = process.env.ANTHROPIC_AUTH_TOKEN || process.env.ANTHROPIC_API_KEY;
  if (proxyBase && proxyKey) {
    return {
      provider: 'anthropic',
      model: process.env.ANTHROPIC_MODEL || 'tencent/hy3:free',
      apiKey: proxyKey,
      baseUrl: proxyBase,
    };
  }
  return resolveConnection(optsProvider, optsModel || 'gpt-4o');
}

/** Maps the TUI's 3-state permission to the engine's sandbox permission mode. */
function mapPermission(permission: PermissionLevel): PermissionMode {
  if (permission === 'deny') return 'deny-all';
  // 'auto' and 'ask' both run autonomously in the TUI for now (the TUI has no
  // blocking approval prompt yet); 'ask' is surfaced as a label only.
  return 'full-autonomy';
}

/** Events emitted to the UI while a turn streams. */
export interface ChatHandlers {
  onToken: (text: string) => void;
  onThinking?: (thinking: boolean) => void;
  onToolCall?: (name: string, args: Record<string, unknown>) => void;
  onToolResult?: (name: string, result: string) => void;
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
