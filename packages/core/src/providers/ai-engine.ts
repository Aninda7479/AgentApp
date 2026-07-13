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
import { UsageTracker } from '../storage/usage-tracker.js';
import { ComputerUse } from '../automation/computer-use.js';
import { PlaywrightBrowserEngine } from '../automation/browser.js';
import { BrowserLifecycleService } from '../automation/browser-service.js';
import { resolveProviderFamily, resolveBaseUrl } from './provider-meta.js';

const execAsync = promisify(exec);

async function getBrowser(): Promise<PlaywrightBrowserEngine> {
  return await BrowserLifecycleService.getSharedInstance();
}

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
    },
    {
      name: 'screenshot_screen',
      description: 'Capture a PNG screenshot of the user\'s desktop display. Returns the file path of the saved screenshot.',
      parameters: {
        type: 'object',
        properties: {},
        additionalProperties: false
      },
      execute: async () => {
        try {
          const path = await ComputerUse.takeScreenshot();
          return `Screenshot captured successfully and saved to: ${path}`;
        } catch (err: unknown) {
          return `Error capturing screenshot: ${(err as Error).message}`;
        }
      }
    },
    {
      name: 'mouse_control',
      description: 'Control the mouse cursor on the screen. Move, left click, right click, or double click.',
      parameters: {
        type: 'object',
        properties: {
          action: { type: 'string', enum: ['move', 'left_click', 'right_click', 'double_click'], description: 'The mouse action to perform' },
          x: { type: 'number', description: 'Screen X coordinate (required for move)' },
          y: { type: 'number', description: 'Screen Y coordinate (required for move)' }
        },
        required: ['action'],
        additionalProperties: false
      },
      execute: async ({ action, x, y }) => {
        try {
          if (action === 'move') {
            if (x === undefined || y === undefined) {
              return 'Error: Coordinates x and y are required for move action';
            }
            return await ComputerUse.moveMouse(x as number, y as number);
          }
          let clickType: 'left' | 'right' | 'double' = 'left';
          if (action === 'right_click') clickType = 'right';
          if (action === 'double_click') clickType = 'double';
          return await ComputerUse.clickMouse(clickType);
        } catch (err: unknown) {
          return `Mouse action failed: ${(err as Error).message}`;
        }
      }
    },
    {
      name: 'keyboard_type',
      description: 'Simulate keyboard typing or key presses on the computer.',
      parameters: {
        type: 'object',
        properties: {
          text: { type: 'string', description: 'Alphanumeric text to type out' },
          key: { type: 'string', description: 'Special key command to press (e.g. "{ENTER}", "{TAB}", "{BACKSPACE}", "{ESC}")' }
        },
        additionalProperties: false
      },
      execute: async ({ text, key }) => {
        try {
          if (text) {
            return await ComputerUse.typeText(text as string);
          }
          if (key) {
            return await ComputerUse.pressKey(key as string);
          }
          return 'Error: Either text or key parameter must be provided';
        } catch (err: unknown) {
          return `Keyboard action failed: ${(err as Error).message}`;
        }
      }
    },
    {
      name: 'browser_navigate',
      description: 'Navigate the headless browser to the specified URL.',
      parameters: {
        type: 'object',
        properties: {
          url: { type: 'string', description: 'The absolute URL to load (e.g. https://www.google.com)' }
        },
        required: ['url'],
        additionalProperties: false
      },
      execute: async ({ url }) => {
        try {
          const browser = await getBrowser();
          const res = await browser.navigate(url as string);
          return `Successfully navigated to ${res.url} (HTTP status: ${res.status}). Page Title: "${res.title}"`;
        } catch (err: unknown) {
          return `Navigation failed: ${(err as Error).message}`;
        }
      }
    },
    {
      name: 'browser_screenshot',
      description: 'Capture a PNG screenshot of the current page. Returns the saved screenshot path.',
      parameters: {
        type: 'object',
        properties: {
          fullPage: { type: 'boolean', description: 'Capture the entire scrollable height of the webpage' }
        },
        additionalProperties: false
      },
      execute: async ({ fullPage }) => {
        try {
          const browser = await getBrowser();
          const logsDir = path.join(process.cwd(), 'logs');
          fs.mkdirSync(logsDir, { recursive: true });
          const screenshotPath = path.join(logsDir, `browser-screenshot-${Date.now()}.png`);
          await browser.takeScreenshot({ path: screenshotPath, fullPage: !!fullPage });
          return `Screenshot captured and saved to: ${screenshotPath}`;
        } catch (err: unknown) {
          return `Screenshot failed: ${(err as Error).message}`;
        }
      }
    },
    {
      name: 'browser_click',
      description: 'Click on a webpage element specified by CSS selector, text content, or coordinates.',
      parameters: {
        type: 'object',
        properties: {
          selector: { type: 'string', description: 'CSS selector of the target element' },
          text: { type: 'string', description: 'Click element matching this inner text (if selector not provided)' },
          x: { type: 'number', description: 'Optional pixel X coordinate' },
          y: { type: 'number', description: 'Optional pixel Y coordinate' }
        },
        additionalProperties: false
      },
      execute: async ({ selector, text, x, y }) => {
        try {
          const browser = await getBrowser();
          const page = browser.getPage();
          if (selector) {
            await page.click(selector as string);
            return `Clicked element matching selector: "${selector}"`;
          } else if (text) {
            await page.click(`text="${text}"`);
            return `Clicked element with text: "${text}"`;
          } else if (x !== undefined && y !== undefined) {
            await page.mouse.click(x as number, y as number);
            return `Clicked at coordinates: (${x}, ${y})`;
          }
          return 'Error: Please specify selector, text, or coordinates (x, y)';
        } catch (err: unknown) {
          return `Click failed: ${(err as Error).message}`;
        }
      }
    },
    {
      name: 'browser_type',
      description: 'Type text into a webpage input field specified by its CSS selector.',
      parameters: {
        type: 'object',
        properties: {
          selector: { type: 'string', description: 'CSS selector of the input field' },
          text: { type: 'string', description: 'The text to type into the field' },
          pressEnter: { type: 'boolean', description: 'Submit by pressing Enter after typing' }
        },
        required: ['selector', 'text'],
        additionalProperties: false
      },
      execute: async ({ selector, text, pressEnter }) => {
        try {
          const browser = await getBrowser();
          const page = browser.getPage();
          await page.fill(selector as string, text as string);
          if (pressEnter) {
            await page.press(selector as string, 'Enter');
            return `Typed "${text}" into selector "${selector}" and pressed Enter.`;
          }
          return `Typed "${text}" into selector "${selector}".`;
        } catch (err: unknown) {
          return `Type action failed: ${(err as Error).message}`;
        }
      }
    },
    {
      name: 'browser_press_key',
      description: 'Press a keyboard key on the active element or page globally.',
      parameters: {
        type: 'object',
        properties: {
          key: { type: 'string', description: 'Key name (e.g. "Enter", "Escape", "ArrowDown", "Backspace")' },
          selector: { type: 'string', description: 'CSS selector of the element to focus before pressing key' }
        },
        required: ['key'],
        additionalProperties: false
      },
      execute: async ({ key, selector }) => {
        try {
          const browser = await getBrowser();
          const page = browser.getPage();
          if (selector) {
            await page.press(selector as string, key as string);
            return `Pressed key "${key}" on element: "${selector}"`;
          } else {
            await page.keyboard.press(key as string);
            return `Pressed key "${key}" globally on the page.`;
          }
        } catch (err: unknown) {
          return `Press key failed: ${(err as Error).message}`;
        }
      }
    },
    {
      name: 'browser_scroll',
      description: 'Scroll the viewport of the webpage.',
      parameters: {
        type: 'object',
        properties: {
          direction: { type: 'string', enum: ['up', 'down', 'top', 'bottom'], description: 'Scroll direction' },
          selector: { type: 'string', description: 'CSS selector of target element to scroll into view' },
          amount: { type: 'number', description: 'Scroll distance in pixels (defaults to 300)' }
        },
        additionalProperties: false
      },
      execute: async ({ direction, selector, amount }) => {
        try {
          const browser = await getBrowser();
          const page = browser.getPage();
          if (selector) {
            await page.locator(selector as string).scrollIntoViewIfNeeded();
            return `Scrolled element into view: "${selector}"`;
          }
          const dist = amount !== undefined ? (amount as number) : 300;
          if (direction === 'down' || !direction) {
            await page.evaluate((d) => window.scrollBy(0, d), dist);
          } else if (direction === 'up') {
            await page.evaluate((d) => window.scrollBy(0, -d), dist);
          } else if (direction === 'top') {
            await page.evaluate(() => window.scrollTo(0, 0));
          } else if (direction === 'bottom') {
            await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
          }
          return `Scrolled page ${direction || 'down'}.`;
        } catch (err: unknown) {
          return `Scroll failed: ${(err as Error).message}`;
        }
      }
    },
    {
      name: 'browser_get_elements',
      description: 'List interactive page elements (links, buttons, inputs) with selectors and texts.',
      parameters: {
        type: 'object',
        properties: {},
        additionalProperties: false
      },
      execute: async () => {
        try {
          const browser = await getBrowser();
          const page = browser.getPage();
          const list = await page.evaluate(() => {
            const selectables = document.querySelectorAll('button, a, input, select, textarea, [role="button"]');
            return Array.from(selectables).slice(0, 100).map((el, i) => {
              const rect = el.getBoundingClientRect();
              return {
                index: i,
                tag: el.tagName.toLowerCase(),
                text: el.textContent?.trim().slice(0, 50) || '',
                type: (el as any).type || '',
                id: el.id || '',
                className: el.className || '',
                placeholder: (el as any).placeholder || '',
                visible: rect.width > 0 && rect.height > 0
              };
            });
          });
          return JSON.stringify(list, null, 2);
        } catch (err: unknown) {
          return `Get elements failed: ${(err as Error).message}`;
        }
      }
    },
    {
      name: 'browser_get_content',
      description: 'Get page inner text or raw HTML source.',
      parameters: {
        type: 'object',
        properties: {
          format: { type: 'string', enum: ['text', 'html'], description: 'Output format (default is text)' }
        },
        additionalProperties: false
      },
      execute: async ({ format }) => {
        try {
          const browser = await getBrowser();
          const page = browser.getPage();
          if (format === 'html') {
            return await page.content();
          }
          return await page.innerText('body');
        } catch (err: unknown) {
          return `Get content failed: ${(err as Error).message}`;
        }
      }
    },
    {
      name: 'browser_close',
      description: 'Close the active browser instance and clear session cookies/history.',
      parameters: {
        type: 'object',
        properties: {},
        additionalProperties: false
      },
      execute: async () => {
        await BrowserLifecycleService.closeSharedInstance();
        return 'Browser successfully shut down.';
      }
    }
  ];
}

// ─── Message Types ────────────────────────────────────────────────────────────

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  toolCallId?: string;
  name?: string;
}

// ─── Provider Config ──────────────────────────────────────────────────────────

export interface AgentEngineConfig {
  provider: string;
  apiKey: string;
  baseUrl?: string;
  model: string;
  systemPrompt?: string;
  projectRoot?: string;
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
    this.tools = createBuiltinTools(config.projectRoot);
    this.history = [];

    // System prompt matching OpenCode's AGENTS.md pattern
    const sysPrompt = config.systemPrompt || `You are SuperAgent, a powerful autonomous AI coding assistant.

You have access to tools to read files, list directories, search codebases, run shell commands, and write files.
Use tools progressively — don't dump the whole codebase; fetch what you need when you need it.

Key guidelines:
- Think step by step before acting
- Read relevant files before making edits
- Verify changes compile/work after editing
- Be concise but thorough in explanations
- When you edit files, mention which files changed and the diff summary`;

    this.history.push({ role: 'system', content: sysPrompt });
  }

  /** Add a user message to history */
  public addUserMessage(content: string): void {
    this.history.push({ role: 'user', content });
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
    onEvent: (event: AgentEvent) => void
  ): Promise<void> {
    this.abortController = new AbortController();
    this.addUserMessage(userPrompt);

    let iterations = 0;
    const MAX_ITERATIONS = 10; // prevent infinite loops

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
    const family = resolveProviderFamily(this.config.provider);

    let res: { fullContent: string; toolCalls: Array<{ id: string; name: string; args: Record<string, unknown> }> };

    if (family === 'anthropic') {
      res = await this.streamAnthropic(onEvent, signal);
    } else if (family === 'gemini') {
      res = await this.streamGemini(onEvent, signal);
    } else if (family === 'ollama') {
      res = await this.streamOllama(onEvent, signal);
    } else {
      // Everything else (OpenAI, DeepSeek, DeepInfra, OpenRouter, Kimi, …)
      // speaks the OpenAI-compatible Chat Completions protocol.
      res = await this.streamOpenAI(onEvent, signal);
    }

    // Compute estimated token usage: 1 token ~ 4 characters
    const inputChars = this.history.reduce((acc, m) => acc + (typeof m.content === 'string' ? m.content.length : 0), 0);
    const promptTokens = Math.max(1, Math.round(inputChars / 4));
    const completionTokens = Math.max(1, Math.round(res.fullContent.length / 4));

    // Track usage in centralized storage
    UsageTracker.trackUsage(
      this.config.provider,
      this.config.model,
      promptTokens,
      completionTokens
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
  }

  // ── OpenAI / Custom (OpenAI-compatible) Streaming ────────────────────────
  private async streamOpenAI(
    onEvent: (event: AgentEvent) => void,
    signal: AbortSignal
  ): Promise<{ fullContent: string; toolCalls: Array<{ id: string; name: string; args: Record<string, unknown> }> }> {
    const baseUrl = resolveBaseUrl(this.config.provider, this.config.baseUrl);
    const url = `${baseUrl}/chat/completions`;

    // Convert history to OpenAI format (handle tool messages)
    const messages = this.history.map(msg => {
      if (msg.role === 'tool') {
        return {
          role: 'tool' as const,
          content: msg.content,
          tool_call_id: msg.toolCallId || 'unknown'
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
    const anthropicHost = resolveBaseUrl('anthropic', this.config.baseUrl).replace(/\/v1\/?$/, '');
    const url = `${anthropicHost}/v1/messages`;

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
              content: m.content
            }]
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
      system: systemMsg,
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
    const geminiHost = resolveBaseUrl('google', this.config.baseUrl).replace(/\/+$/, '');
    const url = `${geminiHost}/v1beta/models/${model}:streamGenerateContent?key=${this.config.apiKey}&alt=sse`;

    // Convert to Gemini format
    const contents = this.history
      .filter(m => m.role !== 'system')
      .map(m => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }]
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
    if (systemInstruction) {
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
      content: m.content
    }));

    const payload = {
      model: this.config.model || 'llama3.2',
      messages,
      stream: true,
      options: {
        temperature: this.config.temperature ?? 0.4
      }
    };

    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (this.config.apiKey) headers['Authorization'] = `Bearer ${this.config.apiKey}`;

    const response = await fetch(url, {
      method: 'POST',
      headers,
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
