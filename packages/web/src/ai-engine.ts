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

// ─── Event Types ──────────────────────────────────────────────────────────────

export type AgentEventType =
  | 'token'          // streaming text token
  | 'tool_call'      // agent decided to call a tool
  | 'tool_result'    // tool returned a result
  | 'thought'        // agent reasoning step
  | 'done'           // generation complete
  | 'error'          // error occurred
  | 'abort';         // user stopped

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
}

// ─── Tool Definitions ─────────────────────────────────────────────────────────

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>; // JSON Schema
  execute: (args: Record<string, unknown>) => Promise<string>;
}

// ─── Built-in Agent Tools ─────────────────────────────────────────────────────
// Matching the same tools used by OpenCode/Codex (file ops, search, shell)

import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

function makeSafeExec(projectRoot: string) {
  return async (command: string): Promise<string> => {
    try {
      const { stdout, stderr } = await execAsync(command, {
        cwd: projectRoot,
        timeout: 30000,
        maxBuffer: 1024 * 1024 * 4 // 4MB
      });
      return stdout || stderr || '(no output)';
    } catch (err: unknown) {
      const e = err as { message?: string; stdout?: string; stderr?: string };
      return `Error: ${e.message || String(err)}\n${e.stderr || ''}`.trim();
    }
  };
}

export function createBuiltinTools(projectRoot: string = process.cwd()): ToolDefinition[] {
  const safeExec = makeSafeExec(projectRoot);

  return [
    {
      name: 'read_file',
      description: 'Read the complete contents of a file at the given path. Use for viewing source code, configs, or text documents.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Relative or absolute path to the file' }
        },
        required: ['path'],
        additionalProperties: false
      },
      execute: async ({ path: filePath }) => {
        try {
          const resolved = path.isAbsolute(filePath as string)
            ? filePath as string
            : path.join(projectRoot, filePath as string);
          const content = fs.readFileSync(resolved, 'utf-8');
          const lines = content.split('\n');
          if (lines.length > 500) {
            return lines.slice(0, 500).join('\n') + `\n\n... (truncated, ${lines.length - 500} more lines)`;
          }
          return content;
        } catch (err: unknown) {
          return `Error reading file: ${(err as Error).message}`;
        }
      }
    },

    {
      name: 'list_dir',
      description: 'List the files and folders in a directory. Returns names, types, and sizes.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Relative or absolute directory path. Use "." for project root.' }
        },
        required: ['path'],
        additionalProperties: false
      },
      execute: async ({ path: dirPath }) => {
        try {
          const resolved = path.isAbsolute(dirPath as string)
            ? dirPath as string
            : path.join(projectRoot, dirPath as string);
          const entries = fs.readdirSync(resolved, { withFileTypes: true });
          const lines = entries.slice(0, 200).map(e => {
            if (e.isDirectory()) return `[DIR]  ${e.name}/`;
            try {
              const stat = fs.statSync(path.join(resolved, e.name));
              return `[FILE] ${e.name}  (${stat.size} bytes)`;
            } catch {
              return `[FILE] ${e.name}`;
            }
          });
          return lines.join('\n') || '(empty directory)';
        } catch (err: unknown) {
          return `Error listing directory: ${(err as Error).message}`;
        }
      }
    },

    {
      name: 'grep_search',
      description: 'Search for a text pattern across files in the project. Returns matching file names and line snippets.',
      parameters: {
        type: 'object',
        properties: {
          pattern: { type: 'string', description: 'The search pattern (literal text or regex)' },
          directory: { type: 'string', description: 'Directory to search in (default: project root)' },
          fileGlob: { type: 'string', description: 'Optional file glob filter e.g. "*.ts" or "*.tsx"' }
        },
        required: ['pattern'],
        additionalProperties: false
      },
      execute: async ({ pattern, directory, fileGlob }) => {
        const dir = directory ? path.join(projectRoot, directory as string) : projectRoot;
        const globStr = fileGlob ? `--include="${fileGlob}"` : '';
        const cmd = `grep -rn --color=never ${globStr} "${(pattern as string).replace(/"/g, '\\"')}" "${dir}"`;
        const result = await safeExec(cmd);
        const lines = result.split('\n').slice(0, 50);
        return lines.join('\n') || '(no matches found)';
      }
    },

    {
      name: 'run_command',
      description: 'Execute a shell command in the project directory. Use for building, testing, installing packages, etc.',
      parameters: {
        type: 'object',
        properties: {
          command: { type: 'string', description: 'The shell command to execute' }
        },
        required: ['command'],
        additionalProperties: false
      },
      execute: async ({ command }) => {
        return safeExec(command as string);
      }
    },

    {
      name: 'write_file',
      description: 'Write or overwrite content to a file at the given path. Creates parent directories if needed.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'File path to write to (relative to project root)' },
          content: { type: 'string', description: 'The complete file content to write' }
        },
        required: ['path', 'content'],
        additionalProperties: false
      },
      execute: async ({ path: filePath, content }) => {
        try {
          const resolved = path.isAbsolute(filePath as string)
            ? filePath as string
            : path.join(projectRoot, filePath as string);
          fs.mkdirSync(path.dirname(resolved), { recursive: true });
          fs.writeFileSync(resolved, content as string, 'utf-8');
          const lines = (content as string).split('\n').length;
          return `Successfully wrote ${lines} lines to ${filePath}`;
        } catch (err: unknown) {
          return `Error writing file: ${(err as Error).message}`;
        }
      }
    }
  ];
}

// ─── Message Types ────────────────────────────────────────────────────────────

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | RichContentPart[];
  toolCallId?: string;
  name?: string;
}

interface RichTextPart {
  type: 'text';
  text: string;
}

interface RichImagePart {
  type: 'image';
  mimeType: string;
  data: string;
}

type RichContentPart = RichTextPart | RichImagePart;

// ─── Provider Config ──────────────────────────────────────────────────────────

export interface AgentEngineConfig {
  provider: 'openai' | 'anthropic' | 'gemini' | 'ollama' | 'deepseek' | 'deepinfra' | 'custom';
  apiKey: string;
  baseUrl?: string;
  model: string;
  systemPrompt?: string;
  projectRoot?: string;
  /** Absolute paths to all files attached to this chat session */
  attachments?: string[];
  maxTokens?: number;
  temperature?: number;
}

// ─── Agent Engine ─────────────────────────────────────────────────────────────

export class AgentEngine {
  private config: AgentEngineConfig;
  private tools: ToolDefinition[];
  private history: ChatMessage[];
  private abortController: AbortController | null = null;
  public readonly sessionId: string;

  constructor(config: AgentEngineConfig, sessionId?: string) {
    this.config = config;
    this.sessionId = sessionId || `session-${Date.now()}`;

    // ── Determine working root ─────────────────────────────────────────────
    // For standalone chats (no project), sandbox to the chat attachments dir
    // so the agent cannot freely browse the whole filesystem.
    const effectiveRoot = config.projectRoot
      || (config.attachments?.[0] ? path.dirname(config.attachments[0]) : process.cwd());

    this.tools = createBuiltinTools(effectiveRoot);
    this.history = [];

    // ── Build system prompt ────────────────────────────────────────────────
    // Inject attached file paths so the AI knows exactly what to read.
    const attachmentSection = (config.attachments && config.attachments.length > 0)
      ? `\n\nThe following files are attached to this chat session and are available for you to inspect:\n${config.attachments.map(p => `- ${p}`).join('\n')}\n\nWhen the latest prompt includes image attachments, inspect them directly from the multimodal input first. Use the read_file tool only for text-based attachments such as source files, markdown, or extracted text. Do not use OCR or shell commands for an image unless direct visual inspection is insufficient.`
      : '';

    const scopeSection = config.projectRoot
      ? `\n\nYour working directory (project root) is: ${config.projectRoot}`
      : (config.attachments?.length
          ? `\n\nThis is a standalone chat (no project workspace). Your file access is restricted to the chat attachments folder: ${effectiveRoot}\nDo NOT attempt to read or list files outside this folder.`
          : '');

    const sysPrompt = config.systemPrompt || (`You are SuperAgent, a powerful autonomous AI coding assistant.

You have access to tools to read files, list directories, search codebases, run shell commands, and write files.
Use tools progressively — don't dump the whole codebase; fetch what you need when you need it.

Key guidelines:
- Think step by step before acting
- Read relevant files before making edits
- Verify changes compile/work after editing
- Be concise but thorough in explanations
- When you edit files, mention which files changed and the diff summary
- If a tool fails twice, stop retrying the same approach and explain the limitation instead` + attachmentSection + scopeSection);

    this.history.push({ role: 'system', content: sysPrompt });
  }

  private buildUserContent(content: string, attachments: string[] = []): string | RichContentPart[] {
    const imageAttachments = attachments.filter(filePath => /\.(png|jpe?g|gif|webp|bmp)$/i.test(filePath));
    if (imageAttachments.length === 0) {
      return content;
    }

    const parts: RichContentPart[] = [{ type: 'text', text: content }];
    for (const filePath of imageAttachments) {
      try {
        const buffer = fs.readFileSync(filePath);
        const ext = path.extname(filePath).toLowerCase();
        const mimeType = ext === '.png'
          ? 'image/png'
          : ext === '.gif'
          ? 'image/gif'
          : ext === '.webp'
          ? 'image/webp'
          : ext === '.bmp'
          ? 'image/bmp'
          : 'image/jpeg';
        parts.push({
          type: 'image',
          mimeType,
          data: buffer.toString('base64')
        });
      } catch {
        // If image loading fails, fall back to the text-only prompt for that file.
      }
    }

    return parts.length > 1 ? parts : content;
  }

  /** Add a user message to history */
  public addUserMessage(content: string, attachments: string[] = []): void {
    this.history.push({ role: 'user', content: this.buildUserContent(content, attachments) });
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
    currentAttachments: string[] = []
  ): Promise<void> {
    this.abortController = new AbortController();
    this.addUserMessage(userPrompt, currentAttachments);

    let iterations = 0;
    const MAX_ITERATIONS = 16; // prevent infinite loops while allowing multi-step tool workflows

    try {
      while (iterations < MAX_ITERATIONS) {
        iterations++;

        // ── Stream from provider ────────────────────────────────────────
        const { fullContent, toolCalls } = await this.streamFromProvider(
          onEvent,
          this.abortController.signal
        );

        // Append assistant message to history
        this.history.push({ role: 'assistant', content: fullContent });

        // ── No tool calls → done ────────────────────────────────────────
        if (toolCalls.length === 0) {
          onEvent({ type: 'done', sessionId: this.sessionId });
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

          let result: string;
          if (!tool) {
            result = `Error: Unknown tool "${tc.name}"`;
          } else {
            try {
              result = await tool.execute(tc.args);
            } catch (err: unknown) {
              result = `Tool error: ${(err as Error).message}`;
            }
          }

          onEvent({
            type: 'tool_result',
            sessionId: this.sessionId,
            toolName: tc.name,
            toolResult: result,
            content: result.slice(0, 200) // truncated for display
          });

          // Add tool result to history
          this.history.push({
            role: 'tool',
            content: result,
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
        onEvent({
          type: 'error',
          sessionId: this.sessionId,
          error: (err as Error).message || String(err)
        });
      }
    }
  }

  /** Stream a single turn from the configured provider */
  private async streamFromProvider(
    onEvent: (event: AgentEvent) => void,
    signal: AbortSignal
  ): Promise<{ fullContent: string; toolCalls: Array<{ id: string; name: string; args: Record<string, unknown> }> }> {
    const { provider } = this.config;

    if (provider === 'openai' || provider === 'custom' || provider === 'deepseek' || provider === 'deepinfra') {
      return this.streamOpenAI(onEvent, signal);
    }
    if (provider === 'anthropic') {
      return this.streamAnthropic(onEvent, signal);
    }
    if (provider === 'gemini') {
      return this.streamGemini(onEvent, signal);
    }
    if (provider === 'ollama') {
      return this.streamOllama(onEvent, signal);
    }

    throw new Error(`Unsupported provider: ${provider}`);
  }

  // ── OpenAI / Custom (OpenAI-compatible) Streaming ────────────────────────
  private async streamOpenAI(
    onEvent: (event: AgentEvent) => void,
    signal: AbortSignal
  ): Promise<{ fullContent: string; toolCalls: Array<{ id: string; name: string; args: Record<string, unknown> }> }> {
    const defaultUrl = this.config.provider === 'deepseek'
      ? 'https://api.deepseek.com/v1'
      : this.config.provider === 'deepinfra'
      ? 'https://api.deepinfra.com/v1/openai'
      : 'https://api.openai.com/v1';
    const baseUrl = (this.config.baseUrl || defaultUrl).replace(/\/+$/, '');
    const url = `${baseUrl}/chat/completions`;

    // Convert history to OpenAI format (handle tool messages)
    const messages = this.history.map(msg => {
      if (msg.role === 'tool') {
        return {
          role: 'tool' as const,
          content: typeof msg.content === 'string' ? msg.content : '',
          tool_call_id: msg.toolCallId || 'unknown'
        };
      }
      if (Array.isArray(msg.content)) {
        return {
          role: msg.role as 'system' | 'user' | 'assistant',
          content: msg.content.map(part =>
            part.type === 'text'
              ? { type: 'text', text: part.text }
              : { type: 'image_url', image_url: { url: `data:${part.mimeType};base64,${part.data}` } }
          )
        };
      }
      return { role: msg.role as 'system' | 'user' | 'assistant', content: msg.content };
    });

    const payload = {
      model: this.config.model,
      messages,
      stream: true,
      tools: this.getToolSchemas(),
      tool_choice: 'auto',
      temperature: this.config.temperature ?? 0.4,
      max_tokens: this.config.maxTokens ?? 4096
    };

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.config.apiKey}`
      },
      body: JSON.stringify(payload),
      signal
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`OpenAI API error [${response.status}]: ${err}`);
    }

    let fullContent = '';
    const toolCallAccumulators: Map<number, { id: string; name: string; argsJson: string }> = new Map();

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
          const trimmed = line.trim();
          if (!trimmed.startsWith('data: ') || trimmed === 'data: [DONE]') continue;

          try {
            const json = JSON.parse(trimmed.slice(6));
            const delta = json.choices?.[0]?.delta;
            if (!delta) continue;

            // Text token
            if (delta.content) {
              fullContent += delta.content;
              onEvent({ type: 'token', sessionId: this.sessionId, content: delta.content });
            }

            // Tool call accumulation
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
            // Ignore partial JSON
          }
        }
      }
    }

    // Parse accumulated tool calls
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
    const url = 'https://api.anthropic.com/v1/messages';

    // Anthropic separates system from messages
    const systemMsg = this.history.find(m => m.role === 'system')?.content || '';
    const conversationMsgs = this.history
      .filter(m => m.role !== 'system')
      .map(m => {
        if (m.role === 'tool') {
          return {
            role: 'user' as const,
            content: [{
              type: 'tool_result' as const,
              tool_use_id: m.toolCallId || 'unknown',
              content: typeof m.content === 'string' ? m.content : ''
            }]
          };
        }
        if (Array.isArray(m.content)) {
          return {
            role: m.role as 'user' | 'assistant',
            content: m.content.map(part =>
              part.type === 'text'
                ? { type: 'text' as const, text: part.text }
                : {
                    type: 'image' as const,
                    source: {
                      type: 'base64' as const,
                      media_type: part.mimeType,
                      data: part.data
                    }
                  }
            )
          };
        }
        return { role: m.role as 'user' | 'assistant', content: m.content };
      });

    const tools = this.tools.map(t => ({
      name: t.name,
      description: t.description,
      input_schema: t.parameters
    }));

    const payload = {
      model: this.config.model || 'claude-3-5-sonnet-20241022',
      system: typeof systemMsg === 'string' ? systemMsg : '',
      messages: conversationMsgs,
      tools,
      stream: true,
      max_tokens: this.config.maxTokens ?? 4096
    };

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'anthropic-version': '2023-06-01',
        'x-api-key': this.config.apiKey,
        'anthropic-beta': 'tools-2024-04-04'
      },
      body: JSON.stringify(payload),
      signal
    });

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
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?key=${this.config.apiKey}&alt=sse`;

    // Convert to Gemini format
    const contents = this.history
      .filter(m => m.role !== 'system')
      .map(m => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: Array.isArray(m.content)
          ? m.content.map(part =>
              part.type === 'text'
                ? { text: part.text }
                : {
                    inlineData: {
                      mimeType: part.mimeType,
                      data: part.data
                    }
                  }
            )
          : [{ text: m.content }]
      }));

    const systemInstruction = this.history.find(m => m.role === 'system')?.content;

    const tools = [{
      functionDeclarations: this.tools.map(t => ({
        name: t.name,
        description: t.description,
        parameters: t.parameters
      }))
    }];

    const payload: Record<string, unknown> = { contents, tools };
    if (typeof systemInstruction === 'string' && systemInstruction) {
      payload.systemInstruction = { parts: [{ text: systemInstruction }] };
    }

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal
    });

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

    const messages = this.history.map(m => ({
      role: m.role === 'tool' ? 'tool' : m.role,
      content: Array.isArray(m.content)
        ? m.content.filter(part => part.type === 'text').map(part => part.text).join('\n')
        : m.content
    }));

    const payload = {
      model: this.config.model || 'llama3.2',
      messages,
      stream: true,
      options: {
        temperature: this.config.temperature ?? 0.4
      }
    };

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`Ollama API error [${response.status}]: ${err}`);
    }

    let fullContent = '';

    if (response.body) {
      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
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
              onEvent({ type: 'token', sessionId: this.sessionId, content: token });
            }
          } catch {
            // ignore
          }
        }
      }
    }

    return { fullContent, toolCalls: [] }; // Ollama tool-use varies by model
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
