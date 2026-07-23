/**
 * AgentEngine — Real AI streaming engine for SuperAgent
 *
 * Architecture (matching OpenCode/Codex patterns):
 *  1. Build messages array with system + conversation history
 *  2. Call provider API with stream: true → SSE token stream
 *  3. Intercept tool_call events → execute tools → feed results back
 *  4. Emit typed events to renderer via IPC
 *
 * This engine is provider-agnostic: OpenAI, Anthropic, Google, Ollama
 * all go through the same interface.
 */

import fs from 'fs';
import path from 'path';
import { SandboxRunner } from '../sandbox/runtime.js';
import { PermissionMode } from '../sandbox/permissions.js';
import { InternetAccessLevel } from '../storage/settings-store.js';
import { chunkedCompactMessages, extractTextContent } from '../memory/compactor.js';
import { MessageHistoryStore } from '../storage/message-history.js';
import { saveChatConfig, readChatConfig } from '../storage/conversation-store.js';
import type { StoredChatConfig } from '../storage/conversation-types.js';
import { UsageTracker } from '../storage/usage-tracker.js';
import { providerLimiter, toolLimiter } from '../concurrency/limiter.js';
import { resolveProviderFamily, resolveBaseUrl } from './provider-meta.js';
import { capabilityRegistry } from './models.js';
import { synthesizeEnsemble } from '../orchestrator/best-of-n.js';
import {
  ContentBlock,
  ImageAttachment,
  type CompletionRequest,
  type AIProvider,
  type ToolCall
} from '../types/agent.js';
import { OrchestratorRouter } from '../orchestrator/router.js';
import type { RouterModel, RerouteEvent } from '../orchestrator/router.js';
import { BYOKProviderManager } from './byok.js';
import { SettingsStorage } from '../storage/settings-store.js';
import { toOpenAIMessages, toAnthropicMessages } from './multimodal.js';

// Re-export type definitions
export {
  type AgentEventType,
  type AgentEvent,
  type ToolDefinition,
  type ChatMessage,
  type AgentEngineConfig,
  type BestOfNCandidate,
  type BestOfNConfig
} from './ai-engine-types.js';

// Re-export orchestration/utility helpers
export {
  buildRouterPool,
  buildBridgeRequest,
  sanitizeSchemaForGemini,
  isCommandAllowed,
  isContextOverflowError
} from './ai-engine-helpers.js';

// Re-export built-in tools
export { createBuiltinTools } from './builtin-tools.js';

// Import internally required types and helpers
import {
  AgentEvent,
  ToolDefinition,
  ChatMessage,
  AgentEngineConfig,
  BestOfNConfig,
  BestOfNCandidate
} from './ai-engine-types.js';

import {
  buildRouterPool,
  buildBridgeRequest,
  sanitizeSchemaForGemini,
  isContextOverflowError
} from './ai-engine-helpers.js';

import { createBuiltinTools } from './builtin-tools.js';

const SUMMARY_PREFIX = '[COMPACTED CONTEXT SUMMARY]';
const MAX_SYSTEM_PROMPT_CHARS = 12000;
const MAX_TOOL_RESULT_CHARS = 4000;

// ─── Agent Engine ─────────────────────────────────────────────────────────────

export class AgentEngine {
  private config: AgentEngineConfig;
  private tools: ToolDefinition[];
  protected history: ChatMessage[];
  private abortController: AbortController | null = null;
  private sandbox: SandboxRunner;
  public readonly sessionId: string;
  private contextWindow: number;

  constructor(config: AgentEngineConfig, sessionId?: string) {
    this.config = config;
    this.sessionId = sessionId || `session-${Date.now()}`;

    const effectiveRoot = config.projectRoot || process.cwd();

    this.sandbox = new SandboxRunner({
      projectRoot: effectiveRoot,
      allowedCommands: config.allowedCommands,
      permissionMode: config.permissionMode ?? 'auto-approve-edits',
      unsandboxed: config.unsandboxed ?? false,
      requestApproval: config.requestApproval
    });

    this.tools = [
      ...createBuiltinTools(
        this.sandbox,
        effectiveRoot,
        // Wire the per-run internet policy: when the caller set config.internetAccess
        // (via a project/chat override), it governs web-fetch; otherwise the
        // global persisted setting applies. Raw shell `curl`/`wget` are NOT gated
        // by this — documented limitation, scoped separately from the sandbox.
        () => config.internetAccess,
        {
          provider: config.provider,
          apiKey: config.apiKey,
          baseUrl: config.baseUrl,
          model: config.model,
          projectRoot: effectiveRoot,
          permissionMode: config.permissionMode,
        },
        config.allowSubagents ?? true
      ),
      ...(config.extraTools ?? [])
    ];
    this.history = [];

    // System prompt matching OpenCode's AGENTS.md pattern
    const rawPrompt = config.systemPrompt || `You are SuperAgent, a powerful autonomous AI coding assistant.

You have access to tools to read files, list directories, search codebases, run shell commands, and write files.
Use tools progressively — don't dump the whole codebase; fetch what you need when you need it.

Key guidelines:
- Think step by step before acting
- Read relevant files before making edits
- Verify changes compile/work after editing
- Be concise but thorough in explanations
- When you edit files, mention which files changed and the diff summary`;

    // Truncate excessively long system prompts to prevent context overflow
    // which causes the model to produce garbled/gibberish output.
    const sysPrompt = rawPrompt.length > MAX_SYSTEM_PROMPT_CHARS
      ? rawPrompt.substring(0, MAX_SYSTEM_PROMPT_CHARS) + '\n\n[System prompt truncated due to length]'
      : rawPrompt;

    this.record({ role: 'system', content: sysPrompt });
    this.contextWindow = config.contextWindow ?? 128000;

    // Register in the global registry so every live agent is supervised
    // (count / abortAll / enumeration), even those we did not create via
    // MultiAgentManager.create (best-of-N candidates, subagents, direct `new`).
    multiAgentManager.register(this);
  }

  /**
   * Updates the engine configuration at runtime WITHOUT resetting the
   * conversation `history`. The chat-completion path reads `this.config`
   * live on every `run()` (see `buildInitialHistory` / `runTurn`), so a model /
   * provider / apiKey / baseUrl change takes effect on the very next turn while
   * the prior context is preserved — this is what lets a single conversation
   * switch models mid-stream (e.g. model Y → X → Z) and keep its memory.
   *
   * The mutation is performed in-place on the existing `this.config` object (not
   * replaced) so closures captured at construction that reference `config`
   * (e.g. the sandbox's `() => config.internetAccess`) keep seeing the live
   * value. History is intentionally left untouched.
   */
  public updateConfig(partial: Partial<AgentEngineConfig>): void {
    const c = this.config;
    if (partial.provider !== undefined) c.provider = partial.provider;
    if (partial.apiKey !== undefined) c.apiKey = partial.apiKey;
    if (partial.baseUrl !== undefined) c.baseUrl = partial.baseUrl;
    if (partial.model !== undefined) c.model = partial.model;
    if (partial.internetAccess !== undefined) (c as { internetAccess?: unknown }).internetAccess = partial.internetAccess;
    if (partial.permissionMode !== undefined) (c as { permissionMode?: unknown }).permissionMode = partial.permissionMode;
    if (partial.contextWindow !== undefined) this.contextWindow = partial.contextWindow ?? this.contextWindow;
  }

  private estimateTokens(text: string): number {
    if (!text) return 0;
    return Math.max(1, Math.ceil(text.length / 4));
  }

  public estimateContextUsage(): { used: number; limit: number; pct: number } {
    let used = 0;
    for (const m of this.history) {
      used += this.estimateTokens(extractTextContent(m.content));
    }
    for (const t of this.tools) {
      used += this.estimateTokens(t.name) + this.estimateTokens(t.description) + this.estimateTokens(JSON.stringify(t.parameters));
    }
    const limit = this.contextWindow;
    const pct = limit > 0 ? Number(((used / limit) * 100).toFixed(2)) : 0;
    return { used, limit, pct };
  }

  /**
   * Records a message into both the in-RAM working set (the model context) and
   * the disk-backed canonical transcript (`MessageHistoryStore`). The full
   * transcript lives on disk so it can be scrolled through / resumed later
   * without occupying RAM; only the compacted working set stays in memory.
   */
  private record(message: ChatMessage): void {
    this.history.push(message);
    MessageHistoryStore.append(this.sessionId, message);
  }

  /**
   * Continuously bounds the in-RAM model context using the SAME compaction
   * primitive as the `/compact` command (`chunkedCompactMessages`): the whole
   * conversation is condensed into a single summary block. The model therefore
   * works from one condensed memory of the entire chat — by default no verbatim
   * recent window is retained (`compactKeepRecent = 0`), which is exactly what
   * `/compact` produces. Compaction is a cheap, local heuristic (no model call),
   * so it can run every turn. The full raw transcript still lives on disk
   * (`MessageHistoryStore`) for scroll-up / resume, so nothing is truly lost.
   */
  private rollingCompact(): { tokensBefore: number; tokensAfter: number } {
    const tokensBefore = this.estimateContextUsage().used;
    const ratio = this.config.compactAtRatio ?? 0.6;
    const budget = Math.floor(this.contextWindow * ratio);
    const keep = this.config.compactKeepRecent ?? 0;

    const hasSummary = this.history.some(
      (m) => m.role === 'system' && extractTextContent(m.content).startsWith(SUMMARY_PREFIX)
    );

    // Short conversations (under budget, no prior summary) are left verbatim —
    // there is nothing to gain from summarizing three messages.
    if (tokensBefore <= budget && !hasSummary) {
      return { tokensBefore, tokensAfter: tokensBefore };
    }

    // Flatten any existing summary block back into the conversation pool so the
    // /compact primitive re-summarizes the WHOLE conversation into ONE block
    // (no duplicate summaries, and when keep=0 no verbatim recent window).
    const pool: Array<{ role: ChatMessage['role']; content: string }> = [];
    for (const m of this.history) {
      const txt = extractTextContent(m.content);
      if (m.role === 'system' && txt.startsWith(SUMMARY_PREFIX)) {
        // Feed the prior condensed memory back in as an assistant turn so it is
        // merged into the new single summary rather than preserved separately.
        pool.push({ role: 'assistant', content: txt });
        continue;
      }
      pool.push({ role: m.role, content: txt });
    }

    const res = chunkedCompactMessages(pool, { keepRecentCount: keep });
    if (!res.wasCompacted) {
      return { tokensBefore, tokensAfter: tokensBefore };
    }

    this.history = res.messages.map(
      (m) => ({ role: m.role, content: m.content }) as ChatMessage
    );

    // Merge consecutive system messages into one to avoid confusing models
    // that expect a single system message at the start of the conversation.
    const merged: ChatMessage[] = [];
    for (const m of this.history) {
      if (m.role === 'system' && merged.length > 0 && merged[merged.length - 1].role === 'system') {
        const prev = merged[merged.length - 1];
        const prevText = typeof prev.content === 'string' ? prev.content : extractTextContent(prev.content);
        const curText = typeof m.content === 'string' ? m.content : extractTextContent(m.content);
        merged[merged.length - 1] = { ...prev, content: prevText + '\n\n' + curText };
      } else {
        merged.push(m);
      }
    }
    this.history = merged;

    const tokensAfter = this.estimateContextUsage().used;
    return { tokensBefore, tokensAfter };
  }

  public compactHistory(): { tokensBefore: number; tokensAfter: number } {
    return this.rollingCompact();
  }

  /**
   * Rebuild the bounded working set from the on-disk transcript (resume).
   * Loads the full canonical transcript but immediately compacts it, so RAM
   * stays bounded regardless of how long the original chat was.
   */
  public async rehydrateFromStore(): Promise<void> {
    const full = await MessageHistoryStore.loadFull(this.sessionId);
    if (full.length === 0) return;
    this.history = full;
    this.rollingCompact();
  }

  /** Page of the full transcript for UI scroll-up (oldest-first, async). */
  public async loadHistoryRange(offset: number, limit: number): Promise<ChatMessage[]> {
    return MessageHistoryStore.loadRange(this.sessionId, offset, limit);
  }

  /** Total message count in the canonical transcript (for UI paging). */
  public async historyLength(): Promise<number> {
    return MessageHistoryStore.count(this.sessionId);
  }

  /** Drop this session's transcript from disk and memory. */
  public async clearHistory(): Promise<void> {
    this.history = [];
    await MessageHistoryStore.clear(this.sessionId);
  }

  /**
   * Persist this agent's per-chat session/memory state to the chat's
   * `config.json`: last-used model/provider/baseUrl/contextWindow plus the
   * current compacted context summary (the agent's working "memory"). Hosts
   * call this after a run so a chat reopens with the same model and context,
   * without replaying the whole transcript.
   */
  public persistChatConfig(
    userDataDir: string,
    chatId: string,
    projectKey?: string
  ): Promise<StoredChatConfig> {
    let contextSummary: string | undefined;
    for (const m of this.history) {
      const txt = extractTextContent(m.content);
      if (m.role === 'system' && txt.startsWith(SUMMARY_PREFIX)) {
        contextSummary = txt;
        break;
      }
    }
    return saveChatConfig(
      userDataDir,
      chatId,
      {
        model: this.config.model,
        provider: this.config.provider,
        baseUrl: this.config.baseUrl,
        contextWindow: this.contextWindow,
        contextSummary
      },
      projectKey
    );
  }

  /** Load this chat's persisted `config.json` (model, memory/context). */
  public async loadChatConfig(
    userDataDir: string,
    chatId: string,
    projectKey?: string
  ): Promise<StoredChatConfig | null> {
    return readChatConfig(userDataDir, chatId, projectKey);
  }

  public getSandbox(): SandboxRunner {
    return this.sandbox;
  }

  /** Add a user message to history (plain text or multimodal content blocks). */
  public addUserMessage(content: string | ContentBlock[]): void {
    this.record({ role: 'user', content });
  }

  /** Stop the current generation */
  public abort(): void {
    this.abortController?.abort();
  }

  /** Get tool definitions in OpenAI JSON Schema format */
  private getToolSchemas() {
    return this.tools.map(t => ({
      type: 'function' as const,
      function: {
        name: t.name,
        description: t.description,
        parameters: t.parameters,
        strict: true
      }
    }));
  }

  /** Main streaming agent run */
  public async run(
    userPrompt: string,
    onEvent: (event: AgentEvent) => void,
    attachments?: ImageAttachment[] | string[]
  ): Promise<void> {
    this.abortController = new AbortController();
    // (Re)register so reused/persistent engines stay visible while active.
    multiAgentManager.register(this);

    let mappedAttachments: ImageAttachment[] | undefined = undefined;
    if (attachments && attachments.length > 0) {
      if (typeof attachments[0] === 'string') {
        mappedAttachments = [];
        for (const attPath of (attachments as string[])) {
          try {
            const resolved = path.resolve(attPath);
            if (fs.existsSync(resolved)) {
              const buf = fs.readFileSync(resolved);
              const ext = resolved.split('.').pop()?.toLowerCase() ?? '';
              let mime = 'image/png';
              if (ext === 'jpg' || ext === 'jpeg') mime = 'image/jpeg';
              else if (ext === 'gif') mime = 'image/gif';
              else if (ext === 'webp') mime = 'image/webp';
              
              mappedAttachments.push({
                path: resolved,
                mediaType: mime,
                dataUrl: `data:${mime};base64,${buf.toString('base64')}`,
                size: buf.length
              });
            }
          } catch {
            // ignore
          }
        }
      } else {
        mappedAttachments = attachments as ImageAttachment[];
      }
    }

    // Build the user message.
    if (mappedAttachments && mappedAttachments.length > 0) {
      const content: ContentBlock[] = [{ type: 'text', text: userPrompt }];
      for (const att of mappedAttachments) {
        content.push({ type: 'image_url', image_url: { url: att.dataUrl } });
      }
      this.addUserMessage(content);
    } else {
      this.addUserMessage(userPrompt);
    }

    let iterations = 0;
    const MAX_ITERATIONS = 10; // prevent infinite loops
    let autoCompactions = 0;
    const MAX_AUTO_COMPACTIONS = 3;
    // Runaway-loop guard: detects a model re-issuing the identical tool call
    // (it can't "see" its own prior action when tool calls aren't persisted, or
    // simply gets stuck). Breaks early instead of burning calls to MAX_ITERATIONS.
    let lastToolSig = '';
    let consecutiveSameToolSig = 0;
    const MAX_SAME_TOOL_REPEATS = 2; // allow one legit retry, stop on the 3rd identical turn

    const emitContext = () => {
      onEvent({
        type: 'context',
        sessionId: this.sessionId,
        context: this.estimateContextUsage()
      });
    };

    emitContext();

    try {
      while (iterations < MAX_ITERATIONS) {
        iterations++;

        // Keep the in-RAM model context bounded every turn (cheap, local). The
        // full raw transcript is already on disk via `record`, so compacting the
        // working set here never loses the user's scrollable history.
        this.rollingCompact();

        // ── Stream from provider ────────────────────────────────────────
        let fullContent = '';
        let toolCalls: Array<{ id: string; name: string; args: Record<string, unknown> }> = [];
        try {
          const r = await this.streamFromProvider(
            onEvent,
            this.abortController.signal
          );
          fullContent = r.fullContent;
          toolCalls = r.toolCalls;
        } catch (streamErr: unknown) {
          const msg = (streamErr as Error).message || String(streamErr);
          if (
            isContextOverflowError(msg) &&
            autoCompactions < MAX_AUTO_COMPACTIONS &&
            this.history.length > 6
          ) {
            this.compactHistory();
            autoCompactions++;
            emitContext();
            continue; // retry this turn with compacted history
          }
          throw streamErr;
        }

        // Append assistant message to history (including the tool calls it made,
        // so the next turn can echo them back and the model sees its own action).
        this.record({
          role: 'assistant',
          content: fullContent,
          toolCalls: toolCalls.length > 0
            ? toolCalls.map((tc) => ({ id: tc.id, toolName: tc.name, args: tc.args ?? {}, status: 'completed' as const }))
            : undefined
        });
        emitContext();

        // ── No tool calls → done ────────────────────────────────────────
        if (toolCalls.length === 0) {
          onEvent({ type: 'done', sessionId: this.sessionId });
          return;
        }

        // ── Runaway-loop guard ──────────────────────────────────────────
        const toolSig = toolCalls
          .map((tc) => `${tc.name}:${JSON.stringify(tc.args ?? {})}`)
          .sort()
          .join('|');
        if (toolSig === lastToolSig) {
          consecutiveSameToolSig++;
        } else {
          consecutiveSameToolSig = 0;
          lastToolSig = toolSig;
        }
        if (consecutiveSameToolSig >= MAX_SAME_TOOL_REPEATS) {
          onEvent({
            type: 'error',
            sessionId: this.sessionId,
            error: 'Agent is repeating the same tool call without making progress. Stopping to avoid an infinite loop.'
          });
          return;
        }

        // ── Execute tool calls in sequence ──────────────────────────────
        for (const tc of toolCalls) {
          const tool = this.tools.find(t => t.name === tc.name);

          onEvent({
            type: 'tool_call',
            sessionId: this.sessionId,
            toolName: tc.name,
            toolArgs: tc.args,
            content: `Calling ${tc.name}(${JSON.stringify(tc.args)})`
          });

          let result: any;
          if (!tool) {
            result = `Error: Unknown tool "${tc.name}"`;
          } else {
            try {
              // Bound concurrent tool execution so CPU/IO-bound local work
              // (local models, media gen, compaction) can't monopolize the
              // shared event loop across 100+ agents.
              result = await toolLimiter.run('__tools__', () =>
                Promise.resolve(tool.execute(tc.args))
              );
            } catch (err: unknown) {
              result = `Tool error: ${(err as Error).message}`;
            }
          }

          const resultText = typeof result === 'string' ? result : JSON.stringify(result, null, 2);

          onEvent({
            type: 'tool_result',
            sessionId: this.sessionId,
            toolName: tc.name,
            toolResult: resultText,
            content: resultText.slice(0, 200) // truncated for display
          });

          // Truncate large tool results before storing in history to prevent
          // context window overflow which causes garbled/gibberish model output.
          const historyResult = resultText.length > MAX_TOOL_RESULT_CHARS
            ? resultText.substring(0, MAX_TOOL_RESULT_CHARS) + '\n\n... (truncated for context)'
            : resultText;

          // Add tool result to history
          this.record({
            role: 'tool',
            content: historyResult,
            toolCallId: tc.id,
            name: tc.name
          });
        }

        // Loop: continue with tool results fed back to model
      }

      // Exceeded max iterations
      onEvent({
        type: 'error',
        sessionId: this.sessionId,
        error: 'Max iterations reached. Agent stopped.'
      });

    } catch (err: unknown) {
      if ((err as Error).name === 'AbortError') {
        onEvent({ type: 'abort', sessionId: this.sessionId });
      } else {
        let errMsg = (err as Error).message || String(err);
        
        // Enrich local connection refusal errors (e.g. Ollama or custom local server not running)
        const cause = (err as any).cause;
        if (cause && (cause.code === 'ECONNREFUSED' || cause.message?.includes('ECONNREFUSED'))) {
          const baseUrl = this.config.baseUrl || (this.config.provider === 'ollama' ? 'http://localhost:11434' : this.config.provider === 'omniroute' ? 'http://localhost:20128/v1' : '');
          if (baseUrl.includes('localhost') || baseUrl.includes('127.0.0.1')) {
            const providerName = this.config.provider === 'ollama' ? 'Ollama (Local)' : this.config.provider === 'omniroute' ? 'OmniRoute Local' : 'Local server';
            errMsg = `${providerName} connection refused. Is the local service running on ${baseUrl}?`;
          }
        } else if (errMsg === 'fetch failed' && (this.config.provider === 'ollama' || this.config.provider === 'omniroute')) {
          const providerName = this.config.provider === 'omniroute' ? 'OmniRoute Local' : 'Ollama';
          const defaultUrl = this.config.provider === 'omniroute' ? 'http://localhost:20128/v1' : 'http://localhost:11434';
          errMsg = `${providerName} connection failed. Is the server running on ${this.config.baseUrl || defaultUrl}?`;
        }

        onEvent({
          type: 'error',
          sessionId: this.sessionId,
          error: errMsg
        });
      }
    } finally {
      // Drop from the global registry once the agent is no longer running so
      // `count` / `abortAll` / `list` stay accurate under heavy concurrency.
      multiAgentManager.unregister(this.sessionId);
    }
  }

  /**
   * Run a SINGLE generation turn (no tool-call loop) against the current
   * history and return its text + any tool calls. Pure/stateless with respect
   * to `this.history` so it can be reused by {@link runBestOfN} across N
   * parallel candidates without mutating shared state between them.
   */
  public async runTurn(
    onEvent: (event: AgentEvent) => void,
    signal?: AbortSignal
  ): Promise<{ fullContent: string; toolCalls: Array<{ id: string; name: string; args: Record<string, unknown> }> }> {
    multiAgentManager.register(this);
    try {
      return await this.streamFromProvider(onEvent, signal ?? this.abortController?.signal ?? new AbortController().signal);
    } finally {
      multiAgentManager.unregister(this.sessionId);
    }
  }

  /**
   * Best-of-N parallel orchestration (mission point 2: route a task to
   * whichever models are actually good at it, then combine). Runs several
   * task-matched models at once and combine their outputs.
   */
  public static async runBestOfN(
    userPrompt: string,
    onEvent: (event: AgentEvent) => void,
    config: BestOfNConfig,
    attachments?: ImageAttachment[]
  ): Promise<void> {
    const base: BestOfNCandidate = {
      provider: config.provider,
      model: config.model,
      apiKey: config.apiKey,
      baseUrl: config.baseUrl
    };
    const candidates = (config.candidates && config.candidates.length > 0)
      ? config.candidates
      : [base];
    const strategy = config.strategy ?? 'consensus';
    const doMerge = config.merge ?? true;
    const sessionId = config.sessionId ?? `session-${Date.now()}`;

    // Degrade to a normal single-model run when there's only one candidate and
    // the caller requested no merge — keeps the historical run() path identical.
    if (candidates.length === 1 && !doMerge) {
      const engine = new AgentEngine(config, sessionId);
      await engine.run(userPrompt, onEvent, attachments);
      return;
    }

    const engine = new AgentEngine(config, sessionId);
    const sharedHistory = engine.buildHistory(userPrompt, attachments);

    const abort = new AbortController();
    const perCandidate = candidates.map((c) => {
      const candConfig: AgentEngineConfig = {
        ...config,
        provider: c.provider,
        model: c.model,
        apiKey: c.apiKey ?? config.apiKey,
        baseUrl: c.baseUrl ?? config.baseUrl
      };
      const candEngine = new AgentEngine(candConfig, `${sessionId}-cand`);
      // Independent history copy per candidate; tool results are not fed back
      // during the parallel phase (tool-needing candidates fall back below).
      candEngine.history = sharedHistory.map((m) => ({ ...m }));
      return candEngine.runTurn(onEvent, abort.signal);
    });

    const results = await Promise.all(
      perCandidate.map((p) => p.then((r) => ({ ok: true as const, r }), (e: unknown) => ({ ok: false as const, e })))
    );

    const texts: string[] = [];
    const toolFallback = results.some((res) => res.ok && res.r.toolCalls.length > 0);
    const metaCandidates = candidates.map((c) => ({ provider: c.provider, model: c.model }));

    for (const res of results) {
      if (res.ok) texts.push(res.r.fullContent);
    }

    // A candidate needed tools → best-of-N merging isn't meaningful; run the
    // first candidate as a full agentic loop instead (correctness over merge).
    if (toolFallback) {
      onEvent({
        type: 'bestofn',
        sessionId: sessionId,
        candidates: metaCandidates,
        strategy,
        mergedCount: 0,
        toolFallback: true
      });
      const leadConfig: AgentEngineConfig = {
        ...config,
        provider: candidates[0].provider,
        model: candidates[0].model,
        apiKey: candidates[0].apiKey ?? config.apiKey,
        baseUrl: candidates[0].baseUrl ?? config.baseUrl
      };
      const lead = new AgentEngine(leadConfig, sessionId);
      if (attachments && attachments.length > 0) {
        const content: ContentBlock[] = [{ type: 'text', text: userPrompt }];
        for (const att of attachments) content.push({ type: 'image_url', image_url: { url: att.dataUrl } });
        lead.addUserMessage(content);
      } else {
        lead.addUserMessage(userPrompt);
      }
      await lead.run(userPrompt, onEvent, attachments);
      return;
    }

    if (texts.length === 0) {
      const firstErr = (results.find((r) => !r.ok) as { e: unknown } | undefined)?.e;
      onEvent({
        type: 'error',
        sessionId: sessionId,
        error: firstErr ? (firstErr as Error).message || String(firstErr) : 'All best-of-N candidates failed.'
      });
      return;
    }

    const merged = doMerge ? synthesizeEnsemble(texts, strategy) : null;
    const mergedText = doMerge ? merged!.text : texts.join('\n\n');
    onEvent({
      type: 'bestofn',
      sessionId: sessionId,
      content: mergedText,
      candidates: metaCandidates,
      strategy,
      mergedCount: texts.length,
      agreement: doMerge ? merged!.agreement : undefined,
      clusters: doMerge ? merged!.clusters : undefined
    });
    onEvent({ type: 'done', sessionId: sessionId });
  }

  /**
   * Orchestrated, bridge-aware completion (mission point #1: a model's input
   * limits shouldn't block a task). Builds a request from the prompt +
   * attachments and routes it through ModelRouter.completeWithBridge, which
   * inserts a vision/transcription model ahead of a target that can't read the
   * input modality, then answers on the augmented text-only request. The handoff
   * is surfaced as a 'thought' event so it is visible, not silent.
   */
  public static async runOrchestrated(
    userPrompt: string,
    onEvent: (event: AgentEvent) => void,
    opts: {
      config: AgentEngineConfig;
      attachments?: ImageAttachment[];
      pool?: RouterModel[];
      byokManager: BYOKProviderManager;
      sessionId?: string;
      onReroute?: (e: RerouteEvent) => void;
    }
  ): Promise<void> {
    const sessionId = opts.sessionId ?? `session-${Date.now()}`;
    const pool = opts.pool ?? buildRouterPool(SettingsStorage.loadSettings().models ?? []);
    const request = buildBridgeRequest(userPrompt, opts.attachments);
    const router = new OrchestratorRouter({ preferredProvider: opts.config.provider as AIProvider });

    const res = await router.completeWithBridge(
      request,
      opts.byokManager,
      pool,
      {
        overrideProvider: opts.config.provider as AIProvider,
        onBridge: (plan) => {
          if (plan.needsBridge) {
            onEvent({ type: 'thought', sessionId, content: `[Orchestrator] ${plan.reason}` });
          }
        },
        onReroute: (e: RerouteEvent) => {
          const label =
            e.reason === 'error'
              ? `rerouted from ${e.from}${e.to ? ` → ${e.to}` : ''} (failed: ${e.detail ?? e.status})`
              : e.reason === 'health-skip'
                ? `skipped ${e.from} (${e.status}: healthier option available)`
                : `last resort: ${e.from} (${e.status}: no healthier provider)`;
          onEvent({ type: 'reroute', sessionId, content: `[Orchestrator] ${label}` });
          opts.onReroute?.(e);
        },
        reasoningEffort: opts.config.reasoningEffort
      }
    );

    onEvent({ type: 'token', sessionId, content: res.content });
    onEvent({ type: 'done', sessionId });
  }

  /** Build the initial history (system + this turn's user message, plain or
   *  multimodal) shared by every best-of-N candidate. Returns a fresh array so
   *  each candidate engine owns an independent copy (no shared-state mutation). */
  private buildHistory(userPrompt: string, attachments?: ImageAttachment[]): ChatMessage[] {
    const rawPrompt = this.config.systemPrompt || `You are SuperAgent, a powerful autonomous AI coding assistant.

You have access to tools to read files, list directories, search codebases, run shell commands, and write files.
Use tools progressively — don't dump the whole codebase; fetch what you need when you need it.

Key guidelines:
- Think step by step before acting
- Read relevant files before making edits
- Verify changes compile/work after editing
- Be concise but thorough in explanations
- When you edit files, mention which files changed and the diff summary`;
    const sysPrompt = rawPrompt.length > MAX_SYSTEM_PROMPT_CHARS
      ? rawPrompt.substring(0, MAX_SYSTEM_PROMPT_CHARS) + '\n\n[System prompt truncated due to length]'
      : rawPrompt;
    const history: ChatMessage[] = [{ role: 'system', content: sysPrompt }];
    if (attachments && attachments.length > 0) {
      const content: ContentBlock[] = [{ type: 'text', text: userPrompt }];
      for (const att of attachments) content.push({ type: 'image_url', image_url: { url: att.dataUrl } });
      history.push({ role: 'user', content });
    } else {
      history.push({ role: 'user', content: userPrompt });
    }
    return history;
  }

  /** Stream a single turn from the configured provider */
  private async streamFromProvider(
    onEvent: (event: AgentEvent) => void,
    signal: AbortSignal
  ): Promise<{ fullContent: string; toolCalls: Array<{ id: string; name: string; args: Record<string, unknown> }> }> {
    const family = resolveProviderFamily(this.config.provider);

    let res: { fullContent: string; toolCalls: Array<{ id: string; name: string; args: Record<string, unknown> }> };

    const startMs = Date.now();
    try {
      res = await providerLimiter.run(this.config.provider, async () => {
        if (family === 'anthropic') {
          return this.streamAnthropic(onEvent, signal);
        } else if (family === 'gemini') {
          return this.streamGemini(onEvent, signal);
        } else if (family === 'ollama') {
          return this.streamOllama(onEvent, signal);
        } else {
          return this.streamOpenAI(onEvent, signal);
        }
      });
      const durationMs = Date.now() - startMs;

      // Compute estimated token usage: 1 token ~ 4 characters
      const inputChars = this.history.reduce((acc, m) => acc + (typeof m.content === 'string' ? m.content.length : 0), 0);
      const promptTokens = Math.max(1, Math.round(inputChars / 4));
      const completionTokens = Math.max(1, Math.round(res.fullContent.length / 4));

      // Track usage in centralized storage
      UsageTracker.trackUsage(
        this.config.provider,
        this.config.model,
        promptTokens,
        completionTokens,
        undefined,
        undefined,
        durationMs,
        'success'
      );

      // Emit usage stats back to renderer
      onEvent({
        type: 'token',
        sessionId: this.sessionId,
        usage: {
          promptTokens,
          completionTokens,
          totalTokens: promptTokens + completionTokens
        }
      });

      return res;
    } catch (err) {
      const durationMs = Date.now() - startMs;
      UsageTracker.trackUsage(
        this.config.provider,
        this.config.model,
        0,
        0,
        undefined,
        undefined,
        durationMs,
        'failure'
      );
      throw err;
    }
  }

  /**
   * Fetches a provider endpoint with a *connect* timeout.
   */
  private async fetchWithConnectTimeout(
    url: string,
    init: RequestInit,
    signal: AbortSignal,
    timeoutMs = 45_000
  ): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const combined: AbortSignal =
      typeof AbortSignal.any === 'function'
        ? AbortSignal.any([signal, controller.signal])
        : controller.signal;
    try {
      return await fetch(url, { ...init, signal: combined });
    } catch (e) {
      const err = e as Error | undefined;
      if (err?.name === 'AbortError' && !signal.aborted) {
        const te = new Error(
          `Provider did not respond within ${Math.round(timeoutMs / 1000)}s (request timed out). ` +
            `Check the provider connection, API key, and rate limits, then try again.`
        );
        te.name = 'TimeoutError';
        throw te;
      }
      throw e;
    } finally {
      clearTimeout(timer);
    }
  }

  // ── OpenAI / Custom (OpenAI-compatible) Streaming ────────────────────────
  private async streamOpenAI(
    onEvent: (event: AgentEvent) => void,
    signal: AbortSignal
  ): Promise<{ fullContent: string; toolCalls: Array<{ id: string; name: string; args: Record<string, unknown> }> }> {
    const baseUrl = resolveBaseUrl(this.config.provider, this.config.baseUrl);
    const url = `${baseUrl}/chat/completions`;

    const messages = toOpenAIMessages(this.history);
    const toolSchemas = this.getToolSchemas();

    const payload: Record<string, any> = {
      model: this.config.model,
      messages,
      stream: true,
      temperature: this.config.temperature ?? 0.7,
      max_tokens: this.config.maxTokens ?? 4096
    };

    if (this.config.frequencyPenalty !== undefined || this.config.provider === 'omniroute' || this.config.provider === 'custom') {
      payload.frequency_penalty = this.config.frequencyPenalty ?? 0.3;
    }
    if (this.config.presencePenalty !== undefined || this.config.provider === 'omniroute' || this.config.provider === 'custom') {
      payload.presence_penalty = this.config.presencePenalty ?? 0.3;
    }

    if (toolSchemas && toolSchemas.length > 0) {
      payload.tools = toolSchemas;
      payload.tool_choice = 'auto';
    }

    const headers: Record<string, string> = {
      'Content-Type': 'application/json'
    };
    if (this.config.apiKey) {
      headers['Authorization'] = `Bearer ${this.config.apiKey}`;
    }

    const response = await this.fetchWithConnectTimeout(
      url,
      {
        method: 'POST',
        headers,
        body: JSON.stringify(payload)
      },
      signal
    );

    if (!response.ok) {
      const err = await response.text();
      const pName = this.config.provider ? (this.config.provider === 'openrouter' ? 'OpenRouter' : this.config.provider.toUpperCase()) : 'API';
      throw new Error(`${pName} API error [${response.status}]: ${err}`);
    }

    let fullContent = '';
    const toolCallAccumulators: Map<number, { id: string; name: string; argsJson: string }> = new Map();

    const detectRepetitiveLoop = (text: string): { isLoop: boolean; cleanText: string } => {
      if (text.length < 30) return { isLoop: false, cleanText: text };
      const window = text.length > 500 ? text.slice(-500) : text;

      for (let len = 2; len <= 80; len++) {
        for (let offset = 0; offset < len; offset++) {
          const startIdx = window.length - len - offset;
          if (startIdx < 0) continue;
          const sub = window.slice(startIdx, window.length - offset);
          if (sub.length < len || !sub.trim()) continue;

          let occurrences = 0;
          let idx = window.length - offset;
          while (idx >= len) {
            if (window.slice(idx - len, idx) === sub) {
              occurrences++;
              idx -= len;
            } else {
              break;
            }
          }
          if (occurrences >= 3) {
            const cutoff = text.length - offset - (len * occurrences);
            const cleanText = text.slice(0, Math.max(0, cutoff)).trim();
            return { isLoop: true, cleanText };
          }
        }
      }
      return { isLoop: false, cleanText: text };
    };

    if (response.body) {
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let loopHalted = false;

      while (!loopHalted) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith('data: ') || trimmed === 'data: [DONE]') continue;

          try {
            const json = JSON.parse(trimmed.slice(6));
            const delta = json.choices?.[0]?.delta;
            if (!delta) continue;

            const textChunk = delta.content || delta.reasoning || delta.reasoning_content || delta.thought || '';
            if (textChunk) {
              fullContent += textChunk;
              const loopCheck = detectRepetitiveLoop(fullContent);
              if (loopCheck.isLoop) {
                fullContent = loopCheck.cleanText;
                onEvent({ type: 'replace_tokens', sessionId: this.sessionId, content: loopCheck.cleanText });
                loopHalted = true;
                try { await reader.cancel(); } catch {}
                break;
              }
              onEvent({ type: 'token', sessionId: this.sessionId, content: textChunk });
            }

            if (delta.tool_calls) {
              for (const tc of delta.tool_calls) {
                const idx = tc.index ?? 0;
                if (!toolCallAccumulators.has(idx)) {
                  toolCallAccumulators.set(idx, { id: tc.id || '', name: tc.function?.name || '', argsJson: '' });
                }
                const acc = toolCallAccumulators.get(idx)!;
                if (tc.id) acc.id = tc.id;
                if (tc.function?.name) {
                  if (!acc.name) {
                    acc.name = tc.function.name;
                  } else if (acc.name !== tc.function.name) {
                    acc.name += tc.function.name;
                  }
                }
                if (tc.function?.arguments) acc.argsJson += tc.function.arguments;
              }
            }
          } catch {
            // Ignore
          }
        }
      }
    }

    const toolCalls: Array<{ id: string; name: string; args: Record<string, unknown> }> = [];
    for (const [, acc] of toolCallAccumulators) {
      try {
        const args = JSON.parse(acc.argsJson || '{}');
        toolCalls.push({ id: acc.id, name: acc.name, args });
      } catch {
        toolCalls.push({ id: acc.id, name: acc.name, args: {} });
      }
    }

    return { fullContent, toolCalls };
  }

  // ── Anthropic Claude Streaming ────────────────────────────────────────────
  private async streamAnthropic(
    onEvent: (event: AgentEvent) => void,
    signal: AbortSignal
  ): Promise<{ fullContent: string; toolCalls: Array<{ id: string; name: string; args: Record<string, unknown> }> }> {
    const anthropicHost = resolveBaseUrl('anthropic', this.config.baseUrl).replace(/\/v1\/?$/, '');
    const url = `${anthropicHost}/v1/messages`;

    const { systemPrompt: systemMsg, messages: conversationMsgs } = toAnthropicMessages(this.history);

    const tools = this.tools.map(t => ({
      name: t.name,
      description: t.description,
      input_schema: t.parameters
    }));

    const payload = {
      model: this.config.model || 'claude-3-5-sonnet-20241022',
      system: systemMsg,
      messages: conversationMsgs,
      tools,
      stream: true,
      max_tokens: this.config.maxTokens ?? 4096
    };

    const response = await this.fetchWithConnectTimeout(
      url,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'anthropic-version': '2023-06-01',
          'x-api-key': this.config.apiKey,
          'anthropic-beta': 'tools-2024-04-04'
        },
        body: JSON.stringify(payload)
      },
      signal
    );

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`Anthropic API error [${response.status}]: ${err}`);
    }

    let fullContent = '';
    const toolCalls: Array<{ id: string; name: string; args: Record<string, unknown> }> = [];
    let currentToolId = '';
    let currentToolName = '';
    let currentToolInputJson = '';

    if (response.body) {
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          try {
            const event = JSON.parse(line.slice(6));
            if (event.type === 'content_block_delta') {
              if (event.delta?.type === 'text_delta') {
                fullContent += event.delta.text;
                onEvent({ type: 'token', sessionId: this.sessionId, content: event.delta.text });
              }
              if (event.delta?.type === 'input_json_delta') {
                currentToolInputJson += event.delta.partial_json;
              }
            }
            if (event.type === 'content_block_start') {
              if (event.content_block?.type === 'tool_use') {
                currentToolId = event.content_block.id;
                currentToolName = event.content_block.name;
                currentToolInputJson = '';
              }
            }
            if (event.type === 'content_block_stop' && currentToolName) {
              try {
                const args = JSON.parse(currentToolInputJson || '{}');
                toolCalls.push({ id: currentToolId, name: currentToolName, args });
              } catch {
                toolCalls.push({ id: currentToolId, name: currentToolName, args: {} });
              }
              currentToolName = '';
              currentToolInputJson = '';
            }
          } catch {
            // ignore
          }
        }
      }
    }

    return { fullContent, toolCalls };
  }

  // ── Google Gemini Streaming ───────────────────────────────────────────────
  private async streamGemini(
    onEvent: (event: AgentEvent) => void,
    signal: AbortSignal
  ): Promise<{ fullContent: string; toolCalls: Array<{ id: string; name: string; args: Record<string, unknown> }> }> {
    const model = this.config.model || 'gemini-2.0-flash';
    const geminiHost = resolveBaseUrl('google', this.config.baseUrl).replace(/\/+$/, '');
    const url = `${geminiHost}/v1beta/models/${model}:streamGenerateContent?key=${this.config.apiKey}&alt=sse`;

    const contents: Array<{ role: string; parts: Array<Record<string, unknown>> }> = [];
    for (const m of this.history) {
      if (m.role === 'system') continue;
      if (m.role === 'assistant' && m.toolCalls && m.toolCalls.length > 0) {
        const parts: Array<Record<string, unknown>> = [];
        if (typeof m.content === 'string' && m.content) {
          parts.push({ text: m.content });
        } else if (Array.isArray(m.content)) {
          for (const b of m.content) if (b.type === 'text' && b.text) parts.push({ text: b.text });
        }
        for (const tc of m.toolCalls) {
          parts.push({ functionCall: { name: tc.toolName, args: tc.args ?? {} } });
        }
        contents.push({ role: 'model', parts });
      } else if (m.role === 'tool') {
        const text = typeof m.content === 'string' ? m.content : JSON.stringify(m.content);
        contents.push({
          role: 'user',
          parts: [{ functionResponse: { name: m.name || 'tool', response: { result: text } } }]
        });
      } else {
        const role = m.role === 'assistant' ? 'model' : 'user';
        const parts: Array<Record<string, unknown>> = [];
        if (typeof m.content === 'string') {
          if (m.content) parts.push({ text: m.content });
        } else if (Array.isArray(m.content)) {
          for (const b of m.content) if (b.type === 'text' && b.text) parts.push({ text: b.text });
        }
        if (parts.length === 0) parts.push({ text: '' });
        contents.push({ role, parts });
      }
    }

    // Concatenate ALL system messages into a single instruction (not just the
    // first — rolling compaction can produce a summary as a second system msg).
    // Flatten multimodal ContentBlock[] to plain text so Gemini never receives
    // a serialized array where it expects a string.
    const systemParts: string[] = [];
    for (const m of this.history) {
      if (m.role === 'system') {
        const text = typeof m.content === 'string' ? m.content : extractTextContent(m.content);
        if (text) systemParts.push(text);
      }
    }
    const systemInstruction = systemParts.length > 0 ? systemParts.join('\n\n') : undefined;

    const tools = [{
      functionDeclarations: this.tools.map(t => ({
        name: t.name,
        description: t.description,
        parameters: sanitizeSchemaForGemini(t.parameters)
      }))
    }];

    const payload: Record<string, unknown> = { contents, tools };
    if (systemInstruction) {
      payload.systemInstruction = { parts: [{ text: systemInstruction }] };
    }

    const response = await this.fetchWithConnectTimeout(
      url,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      },
      signal
    );

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`Gemini API error [${response.status}]: ${err}`);
    }

    let fullContent = '';
    const toolCalls: Array<{ id: string; name: string; args: Record<string, unknown> }> = [];

    if (response.body) {
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          try {
            const event = JSON.parse(line.slice(6));
            const candidates = event.candidates || [];
            for (const candidate of candidates) {
              for (const part of (candidate.content?.parts || [])) {
                if (part.text) {
                  fullContent += part.text;
                  onEvent({ type: 'token', sessionId: this.sessionId, content: part.text });
                }
                if (part.functionCall) {
                  toolCalls.push({
                    id: `gemini-tc-${Date.now()}`,
                    name: part.functionCall.name,
                    args: part.functionCall.args || {}
                  });
                }
              }
            }
          } catch {
            // ignore
          }
        }
      }
    }

    return { fullContent, toolCalls };
  }

  // ── Ollama (local) Streaming ──────────────────────────────────────────────
  private async streamOllama(
    onEvent: (event: AgentEvent) => void,
    signal: AbortSignal
  ): Promise<{ fullContent: string; toolCalls: Array<{ id: string; name: string; args: Record<string, unknown> }> }> {
    const baseUrl = (this.config.baseUrl || 'http://localhost:11434').replace(/\/+$/, '');
    const url = `${baseUrl}/api/chat`;

    // Ollama only supports system, user, assistant roles. Convert multimodal
    // ContentBlock[] to plain text and remap 'tool' role to 'user' so the
    // model receives a valid message array instead of raw objects or unknown
    // roles that cause gibberish output.
    const messages = this.history
      .filter(m => m.role !== 'tool')
      .map(m => ({
        role: m.role === 'system' ? 'system' : m.role === 'assistant' ? 'assistant' : 'user',
        content: typeof m.content === 'string' ? m.content : extractTextContent(m.content)
      }));

    const tools = this.tools.map(t => ({
      type: 'function' as const,
      function: {
        name: t.name,
        description: t.description,
        parameters: t.parameters
      }
    }));

    const payload = {
      model: this.config.model || 'llama3.2',
      messages,
      tools,
      stream: true,
      options: {
        temperature: this.config.temperature ?? 0.4,
        num_predict: this.config.maxTokens ?? 4096,
        repeat_penalty: 1.1,
        frequency_penalty: this.config.frequencyPenalty ?? 0.3,
        presence_penalty: this.config.presencePenalty ?? 0.3
      }
    };

    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (this.config.apiKey) headers['Authorization'] = `Bearer ${this.config.apiKey}`;

    const response = await this.fetchWithConnectTimeout(
      url,
      {
        method: 'POST',
        headers,
        body: JSON.stringify(payload)
      },
      signal
    );

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`Ollama API error [${response.status}]: ${err}`);
    }

    let fullContent = '';
    const toolCalls: Array<{ id: string; name: string; args: Record<string, unknown> }> = [];

    const detectRepetitiveLoop = (text: string): { isLoop: boolean; cleanText: string } => {
      if (text.length < 30) return { isLoop: false, cleanText: text };
      const window = text.length > 500 ? text.slice(-500) : text;

      for (let len = 2; len <= 80; len++) {
        for (let offset = 0; offset < len; offset++) {
          const startIdx = window.length - len - offset;
          if (startIdx < 0) continue;
          const sub = window.slice(startIdx, window.length - offset);
          if (sub.length < len || !sub.trim()) continue;

          let occurrences = 0;
          let idx = window.length - offset;
          while (idx >= len) {
            if (window.slice(idx - len, idx) === sub) {
              occurrences++;
              idx -= len;
            } else {
              break;
            }
          }
          if (occurrences >= 3) {
            const cutoff = text.length - offset - (len * occurrences);
            const cleanText = text.slice(0, Math.max(0, cutoff)).trim();
            return { isLoop: true, cleanText };
          }
        }
      }
      return { isLoop: false, cleanText: text };
    };

    if (response.body) {
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let loopHalted = false;

      while (!loopHalted) {
        const { value, done } = await reader.read();
        if (done) break;
        const lines = decoder.decode(value, { stream: true }).split('\n');
        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const event = JSON.parse(line);
            const token = event.message?.content || '';
            if (token) {
              fullContent += token;
              const loopCheck = detectRepetitiveLoop(fullContent);
              if (loopCheck.isLoop) {
                fullContent = loopCheck.cleanText;
                onEvent({ type: 'replace_tokens', sessionId: this.sessionId, content: loopCheck.cleanText });
                loopHalted = true;
                try { await reader.cancel(); } catch {}
                break;
              }
              onEvent({ type: 'token', sessionId: this.sessionId, content: token });
            }
            // Ollama tool calls come as an array on message.tool_calls
            if (Array.isArray(event.message?.tool_calls)) {
              for (const tc of event.message.tool_calls) {
                toolCalls.push({
                  id: `ollama-tc-${Date.now()}-${toolCalls.length}`,
                  name: tc.function?.name || '',
                  args: tc.function?.arguments || {}
                });
              }
            }
          } catch {
            // ignore
          }
        }
      }
    }

    return { fullContent, toolCalls };
  }
}

// ─── Multi-Agent Manager ──────────────────────────────────────────────────────

export class MultiAgentManager {
  private sessions: Map<string, AgentEngine> = new Map();

  /** Launch a new agent session */
  public create(config: AgentEngineConfig): AgentEngine {
    const engine = new AgentEngine(config);
    this.sessions.set(engine.sessionId, engine);
    return engine;
  }

  /**
   * Register an already-constructed engine. Called by `AgentEngine`'s
   * constructor so every live agent (including best-of-N candidates and
   * subagents) is visible in one global registry — giving hosts a real
   * `count`, a working `abortAll()`, and the ability to enumerate/supervise
   * all concurrent agents.
   */
  public register(engine: AgentEngine): void {
    this.sessions.set(engine.sessionId, engine);
  }

  /** Remove a session from the registry (called when an agent finishes/aborts). */
  public unregister(sessionId: string): void {
    this.sessions.delete(sessionId);
  }

  /** All currently registered engines. */
  public list(): AgentEngine[] {
    return Array.from(this.sessions.values());
  }

  /** Get a session by ID */
  public get(sessionId: string): AgentEngine | undefined {
    return this.sessions.get(sessionId);
  }

  /** Stop all running sessions */
  public abortAll(): void {
    for (const engine of this.sessions.values()) {
      engine.abort();
    }
  }

  /** Remove a session */
  public destroy(sessionId: string): void {
    const engine = this.sessions.get(sessionId);
    if (engine) {
      engine.abort();
      this.sessions.delete(sessionId);
    }
  }

  /** Count active sessions */
  public get count(): number {
    return this.sessions.size;
  }
}

export const multiAgentManager = new MultiAgentManager();
