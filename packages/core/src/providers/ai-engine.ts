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

/** Types of events emitted during agent execution. */
export type AgentEventType =
  | 'token'          // streaming text token
  | 'tool_call'      // agent decided to call a tool
  | 'tool_result'    // tool returned a result
  | 'thought'        // agent reasoning step
  | 'done'           // generation complete
  | 'error'          // error occurred
  | 'abort'          // user stopped
  | 'bestofn'        // best-of-N merge result (parallel multi-model orchestration)
  | 'reroute';       // orchestrator avoided/failed-over a provider (resilience visible)

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
}

// ─── Orchestration helpers ────────────────────────────────────────────────────

/**
 * Builds a RouterModel[] pool for the orchestration router from the user's
 * configured models (SettingsStorage). Vision/tool capability isn't stored as a
 * boolean on ModelSettings, so it is derived from ModelGovStorage scores — the
 * same source model-gov.ts uses — keeping the pool consistent with the rest of
 * the governance layer.
 */
export function buildRouterPool(models: ModelSettings[]): RouterModel[] {
  return models.map((m) => {
    const scores = ModelGovStorage.getModelScores(m.id);
    // Best-effort enrichment with the extended registry signals (speed/intelligence
    // tier, dollar cost). The catalog id may carry a `${providerId}-` prefix the
    // registry doesn't, so try the stripped native id as a fallback. Missing
    // metadata leaves the fields undefined and the router falls back to its
    // neutral midpoint — never a hard error.
    const cap =
      capabilityRegistry.getCapability(m.id) ??
      capabilityRegistry.getCapability(m.id.includes('-') ? m.id.slice(m.id.indexOf('-') + 1) : m.id);
    return {
      id: m.id,
      name: m.name,
      providerId: m.providerId,
      enabled: m.enabled,
      supportsVision: scores.vision >= 75,
      supportsTools: scores.coding >= 70 || scores.reasoning >= 75,
      inputModalities: m.inputModalities as RouterModel['inputModalities'],
      accessStatus: 'available',
      speedTier: cap?.speedTier,
      intelligenceTier: cap?.intelligenceTier,
      costPer1kTokens: cap?.costPer1kTokens
    };
  });
}

/**
 * Builds a CompletionRequest from a prompt + attachments, encoding each image
 * attachment as an image_url content block so the modality bridge can detect a
 * vision input and plan accordingly.
 */
export function buildBridgeRequest(prompt: string, attachments?: ImageAttachment[]): CompletionRequest {
  const content: ContentBlock[] = [{ type: 'text', text: prompt }];
  if (attachments) {
    for (const att of attachments) {
      content.push({ type: 'image_url', image_url: { url: att.dataUrl } });
    }
  }
  return { messages: [{ role: 'user', content }] };
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
import { capabilityRegistry } from './models.js';
import { BestOfNStrategy, synthesizeEnsemble } from './best-of-n.js';
import { ContentBlock, ImageAttachment, type CompletionRequest, type AIProvider, type ReasoningEffort } from '../types/agent.js';
import { ModelRouter } from './router.js';
import type { RouterModel, RerouteEvent } from './router.js';
import { BYOKProviderManager } from './byok.js';
import { SettingsStorage, type ModelSettings } from '../storage/settings-store.js';
import { ModelGovStorage } from '../storage/model-gov.js';
import { toOpenAIMessages, toAnthropicMessages } from './multimodal.js';

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

/**
 * Returns true when `command` is permitted by the project's command allowlist.
 * An empty/undefined allowlist permits everything — confinement is opt-in, so
 * the user must explicitly pre-approve commands in project settings for the
 * restriction to take effect. Matching is prefix-based on the first token(s):
 * allowing "git" permits `git` and `git status`, but not `github-clone …`.
 * Mirrors the same guard in the desktop and web engines so run_command
 * enforces the same policy everywhere (mission point #1).
 */
export function isCommandAllowed(command: string, allowedCommands?: string[]): boolean {
  if (!allowedCommands || allowedCommands.length === 0) return true;
  const cmd = command.trim();
  if (cmd.length === 0) return false;
  const firstToken = cmd.split(/\s+/)[0];
  return allowedCommands.some((allowed) => {
    const a = allowed.trim();
    return a !== '' && (cmd === a || firstToken === a || cmd.startsWith(a + ' '));
  });
}

export function createBuiltinTools(projectRoot: string = process.cwd(), allowedCommands?: string[]): ToolDefinition[] {
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
        if (!isCommandAllowed(command as string, allowedCommands)) {
          return `Error: command is not in the project's allowed commands: ${command}. Add it to the project's allowed commands in settings to permit it.`;
        }
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
  content: string | ContentBlock[];
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
  /** Per-request reasoning-effort tier, honored by orchestrated (bridge) turns. */
  reasoningEffort?: ReasoningEffort;
  /** Pre-approved shell commands for this project. When non-empty, run_command
   *  only executes commands whose first token(s) match an entry (prefix-based).
   *  Opt-in: an empty/undefined list permits all commands. */
  allowedCommands?: string[];
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

// ─── Agent Engine ─────────────────────────────────────────────────────────────

export class AgentEngine {
  private config: AgentEngineConfig;
  private tools: ToolDefinition[];
  protected history: ChatMessage[];
  private abortController: AbortController | null = null;
  public readonly sessionId: string;

  constructor(config: AgentEngineConfig, sessionId?: string) {
    this.config = config;
    this.sessionId = sessionId || `session-${Date.now()}`;
    this.tools = createBuiltinTools(config.projectRoot, config.allowedCommands);
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

  /** Add a user message to history (plain text or multimodal content blocks). */
  public addUserMessage(content: string | ContentBlock[]): void {
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
    onEvent: (event: AgentEvent) => void,
    attachments?: ImageAttachment[]
  ): Promise<void> {
    this.abortController = new AbortController();

    // Build the user message. When attachments are present, emit a multimodal
    // content array (one text block + one image_url block per attachment);
    // otherwise keep the plain-string form for backward compatibility.
    if (attachments && attachments.length > 0) {
      const content: ContentBlock[] = [{ type: 'text', text: userPrompt }];
      for (const att of attachments) {
        content.push({ type: 'image_url', image_url: { url: att.dataUrl } });
      }
      this.addUserMessage(content);
    } else {
      this.addUserMessage(userPrompt);
    }

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
    return this.streamFromProvider(onEvent, signal ?? this.abortController?.signal ?? new AbortController().signal);
  }

  /**
   * Best-of-N parallel orchestration (mission point 2): run several
   * task-matched models at once and combine their outputs.
   *
   * - When `candidates` is omitted/empty it degrades to a single normal
   *   {@link run} on the base config — callers never need to branch.
   * - Candidates run in parallel via Promise.all. If ANY candidate decides to
   *   call a tool (agentic work), we fall back to a normal single-model
   *   run on the first candidate so tool execution stays correct — best-of-N
   *   merging only applies to plain generation turns.
   * - Final text from the surviving candidates is merged with {@link mergeBestOfN}
   *   (consensus / longest / first). Empty/errored candidates are dropped, so a
   *   single healthy model still yields a result. If every candidate errors, the
   *   best-of-N attempt is reported as one 'error' event (not N errors).
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
   *
   * This is ADDITIVE: the streaming AgentEngine.run() path is unchanged, so
   * callers that want orchestration (e.g. a multimodal turn) invoke this instead.
   * The caller supplies the BYOKProviderManager (no hidden secure-storage
   * coupling); the pool defaults to the user's configured models.
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
      /** Optional caller hook for raw reroute events (the engine also emits a
       *  'reroute' AgentEvent so the GUI can surface resilience decisions). */
      onReroute?: (e: RerouteEvent) => void;
    }
  ): Promise<void> {
    const sessionId = opts.sessionId ?? `session-${Date.now()}`;
    const pool = opts.pool ?? buildRouterPool(SettingsStorage.loadSettings().models ?? []);
    const request = buildBridgeRequest(userPrompt, opts.attachments);
    const router = new ModelRouter({ preferredProvider: opts.config.provider as AIProvider });

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
          // Surface the resilience decision (mission: the "can't be banned out
          // from under you" reroute must be visible, not silent). The caller may
          // also forward `e` to its own handler via opts.onReroute.
          const label =
            e.reason === 'error'
              ? `rerouted from ${e.from}${e.to ? ` → ${e.to}` : ''} (failed: ${e.detail ?? e.status})`
              : e.reason === 'health-skip'
                ? `skipped ${e.from} (${e.status}: healthier option available)`
                : `last resort: ${e.from} (${e.status}: no healthier provider)`;
          onEvent({ type: 'reroute', sessionId, content: `[Orchestrator] ${label}` });
          opts.onReroute?.(e);
        }
      },
      opts.config.reasoningEffort
    );

    onEvent({ type: 'token', sessionId, content: res.content });
    onEvent({ type: 'done', sessionId });
  }

  /** Build the initial history (system + this turn's user message, plain or
   *  multimodal) shared by every best-of-N candidate. Returns a fresh array so
   *  each candidate engine owns an independent copy (no shared-state mutation). */
  private buildHistory(userPrompt: string, attachments?: ImageAttachment[]): ChatMessage[] {
    const sysPrompt = this.config.systemPrompt || `You are SuperAgent, a powerful autonomous AI coding assistant.

You have access to tools to read files, list directories, search codebases, run shell commands, and write files.
Use tools progressively — don't dump the whole codebase; fetch what you need when you need it.

Key guidelines:
- Think step by step before acting
- Read relevant files before making edits
- Verify changes compile/work after editing
- Be concise but thorough in explanations
- When you edit files, mention which files changed and the diff summary`;
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

    // Convert history to OpenAI format (handles tool messages + multimodal content)
    const messages = toOpenAIMessages(this.history);

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

    // Anthropic separates system from messages (handles tool + multimodal content)
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
        parts: typeof m.content === 'string'
          ? [{ text: m.content }]
          : m.content
              .filter((b): b is { type: 'text'; text: string } => b.type === 'text')
              .map(b => ({ text: b.text }))
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
      role: m.role,
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
