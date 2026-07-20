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

// ─── Orchestration helpers ────────────────────────────────────────────────────

/**
 * Builds a RouterModel[] pool for the orchestration router from the user's
 * configured models (SettingsStorage). Vision/tool capability isn't stored as a
 * boolean on ModelSettings, so it is derived from OrchestratorStorage scores — the
 * same source storage.ts uses — keeping the pool consistent with the rest of
 * the Orchestrator layer.
 */
export function buildRouterPool(models: ModelSettings[]): RouterModel[] {
  return models.map((m) => {
    const scores = OrchestratorStorage.getModelScores(m.id);
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
      outputModalities: m.outputModalities as RouterModel['outputModalities'],
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
  parameters: Record<string, any>; // JSON Schema
  execute: (args: Record<string, any>, config?: any) => Promise<any>;
}

/**
 * Google's Gemini `functionDeclarations[].parameters` accepts only a strict
 * subset of JSON Schema (a proto-derived Schema type). Standard-JSON-Schema
 * keywords like `additionalProperties`, `$schema`, `strict`, and `examples`
 * are rejected outright with HTTP 400
 * ("Unknown name \"additionalProperties\" ... Cannot find field"), which fails
 * the entire request and every tool call routed to Gemini.
 *
 * This recursively deep-copies a tool schema and drops the unsupported keywords
 * while preserving everything Gemini does understand (type, properties,
 * required, enum, description, format, nullable, items). The OpenAI path keeps
 * `additionalProperties: false` (needed for its `strict: true` mode) — this
 * sanitizer is ONLY applied on the Gemini branch.
 */
const GEMINI_UNSUPPORTED_SCHEMA_KEYS = new Set([
  'additionalProperties',
  '$schema',
  'strict',
  'examples',
  'default',
  '$id',
  '$ref',
  'definitions',
  '$defs'
]);

export function sanitizeSchemaForGemini(schema: unknown): any {
  if (Array.isArray(schema)) {
    return schema.map((item) => sanitizeSchemaForGemini(item));
  }
  if (schema && typeof schema === 'object') {
    const out: Record<string, any> = {};
    for (const [key, value] of Object.entries(schema as Record<string, unknown>)) {
      if (GEMINI_UNSUPPORTED_SCHEMA_KEYS.has(key)) continue;
      out[key] = sanitizeSchemaForGemini(value);
    }
    return out;
  }
  return schema;
}

// ─── Built-in Agent Tools ─────────────────────────────────────────────────────
// Matching the same tools used by OpenCode/Codex (file ops, search, shell)

import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import { SandboxRunner } from '../sandbox/runtime.js';
import { PermissionMode, ConfirmationHandler } from '../sandbox/permissions.js';
import { InternetAccessLevel } from '../storage/settings-store.js';
import { enforceNetworkAllowed } from '../security/internet-access.js';
import { createThreeDTool } from '../tools/threed.js';
import { chunkedCompactMessages, extractTextContent } from '../memory/compactor.js';
import { MessageHistoryStore } from '../storage/message-history.js';
import { saveChatConfig, readChatConfig } from '../storage/conversation-store.js';
import type { StoredChatConfig } from '../storage/conversation-types.js';

/** Tag marking AgentEngine's own condensed-history block inside `history`. */
const SUMMARY_PREFIX = '[COMPACTED CONTEXT SUMMARY]';
import { UsageTracker } from '../storage/usage-tracker.js';
import { providerLimiter, toolLimiter } from '../concurrency/limiter.js';
import { ComputerUse } from '../automation/computer-use.js';
import { PlaywrightBrowserEngine } from '../automation/browser.js';
import { BrowserLifecycleService } from '../automation/browser-service.js';
import { resolveProviderFamily, resolveBaseUrl } from './provider-meta.js';
import { capabilityRegistry } from './models.js';
import { BestOfNStrategy, synthesizeEnsemble } from '../orchestrator/best-of-n.js';
import { ContentBlock, ImageAttachment, type CompletionRequest, type AIProvider, type ReasoningEffort, type ToolCall } from '../types/agent.js';
import { OrchestratorRouter } from '../orchestrator/router.js';
import type { RouterModel, RerouteEvent } from '../orchestrator/router.js';
import { BYOKProviderManager } from './byok.js';
import { SettingsStorage, type ModelSettings } from '../storage/settings-store.js';
import { OrchestratorStorage } from '../orchestrator/storage.js';
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

function globToRegExp(glob: string): RegExp {
  const escaped = glob
    .replace(/[.+^${}()|\\]/g, '\\$&')
    .replace(/\*/g, '.*')
    .replace(/\?/g, '.');
  return new RegExp(`^${escaped}$`);
}

function walkFiles(root: string, visit: (file: string) => void): void {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(root, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const full = path.join(root, entry.name);
    if (entry.isDirectory()) {
      walkFiles(full, visit);
    } else if (entry.isFile()) {
      visit(full);
    }
  }
}

function grepSearch(dir: string, pattern: string, fileGlob?: string): string {
  let regex: RegExp;
  try {
    regex = new RegExp(pattern);
  } catch {
    return `Error: invalid search pattern: ${pattern}`;
  }

  let globRegex: RegExp | null = null;
  if (fileGlob) {
    globRegex = globToRegExp(fileGlob);
  }

  const results: string[] = [];
  let fileCount = 0;
  let matchCount = 0;

  walkFiles(dir, (file) => {
    if (globRegex && !globRegex.test(path.basename(file))) return;
    fileCount++;

    try {
      const content = fs.readFileSync(file, 'utf8');
      if (content.includes('\0')) return; // skip binary files

      const lines = content.split('\n');
      for (let i = 0; i < lines.length; i++) {
        if (regex.test(lines[i])) {
          matchCount++;
          if (results.length < 50) {
            const relative = path.relative(dir, file);
            results.push(`${relative}:${i + 1}:${lines[i].trim()}`);
          }
        }
      }
    } catch {
      // ignore unreadable files
    }
  });

  if (results.length === 0) return '(no matches found)';
  const summary = `Found ${matchCount} match(es) across ${fileCount} file(s).`;
  if (matchCount > 50) {
    return `${results.join('\n')}\n\n... (truncated, showing 50 of ${matchCount} matches)`;
  }
  return `${results.join('\n')}\n\n${summary}`;
}

export function createBuiltinTools(
  runnerOrRoot?: SandboxRunner | string,
  allowedCommandsOrRoot?: string[] | string,
  /** Resolves the effective internet-access level for this run. When omitted
   *  the global persisted setting is used. Passed into `enforceNetworkAllowed`
   *  so a per-project / per-chat internet policy actually takes effect. */
  getInternetLevel?: () => InternetAccessLevel | undefined,
  /** Parent engine connection, used by the `run_subagent` tool to spawn a
   *  child agent. Omitted for the top-level call outside an engine. */
  parentConfig?: {
    provider: string;
    apiKey: string;
    baseUrl?: string;
    model: string;
    projectRoot?: string;
    permissionMode?: PermissionMode;
  },
  /** When false, the `run_subagent` tool is omitted (used for child agents to
   *  prevent unbounded recursion). Defaults to true. */
  allowSubagents: boolean = true
): ToolDefinition[] {
  let runner: SandboxRunner;
  let projectRoot: string;

  if (runnerOrRoot instanceof SandboxRunner) {
    runner = runnerOrRoot;
    projectRoot = typeof allowedCommandsOrRoot === 'string' ? allowedCommandsOrRoot : (runner.getProjectRoot() || process.cwd());
  } else {
    projectRoot = (runnerOrRoot as string) || process.cwd();
    const allowed = Array.isArray(allowedCommandsOrRoot) ? allowedCommandsOrRoot : undefined;
    runner = new SandboxRunner({
      projectRoot,
      allowedCommands: allowed
    });
  }

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
        const res = await runner.readFile(filePath as string);
        if (!res) return `Error: path is outside the project root: ${filePath}`;
        if (res.isBinary) return '[Binary File]';
        const lines = res.content.split('\n');
        if (lines.length > 500) {
          return lines.slice(0, 500).join('\n') + `\n\n... (truncated, ${lines.length - 500} more lines)`;
        }
        return res.content;
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
        const resolved = runner.resolvePath(dirPath as string);
        if (!resolved) return `Error: path is outside the project root: ${dirPath}`;
        try {
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
        if (!pattern) return '(no matches found)';
        let dir: string;
        if (directory) {
          const resolved = runner.resolvePath(directory as string);
          if (!resolved) return `Error: path is outside the project root: ${directory}`;
          dir = resolved;
        } else {
          dir = projectRoot ?? process.cwd();
        }
        return grepSearch(dir, pattern as string, fileGlob as string | undefined);
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
        const res = await runner.runCommand(command as string);
        return res.stdout || res.stderr || '(no output)';
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
        const res = await runner.writeFile(filePath as string, content as string);
        if (!res.written) return `Error writing file: ${res.error ?? 'write failed'}`;
        const lines = (content as string).split('\n').length;
        return `Successfully wrote ${lines} lines to ${filePath}`;
      }
    },
    {
      name: 'web_fetch',
      description: 'Fetch the contents of a public URL over the internet (read-only GET). Useful for reading docs, web pages, or API responses. Subject to the "Internet Access" policy.',
      parameters: {
        type: 'object',
        properties: {
          url: { type: 'string', description: 'The fully-qualified URL to fetch' },
          method: { type: 'string', description: 'HTTP method, defaults to GET. Only GET is permitted under "Observation only" access.' }
        },
        required: ['url'],
        additionalProperties: false
      },
      execute: async ({ url, method }) => {
        const httpMethod = (method as string) || 'GET';
        try {
          enforceNetworkAllowed(
            { kind: 'web-fetch', url: url as string, method: httpMethod },
            // Honor the per-run (project / chat) internet policy when set;
            // otherwise fall back to the global persisted setting.
            getInternetLevel ? getInternetLevel() : undefined
          );
        } catch (err: unknown) {
          return `Blocked by Internet Access policy: ${(err as Error).message}`;
        }
        try {
          const response = await fetch(url as string, {
            method: httpMethod,
            headers: { 'User-Agent': 'SuperAgent/0.1 (+https://github.com/Aninda7479/AgentApp)' },
            signal: AbortSignal.timeout(15000)
          });
          const text = await response.text();
          const body = String(text);
          const truncated = body.length > 8000 ? body.slice(0, 8000) + `\n\n... (truncated, ${body.length - 8000} more chars)` : body;
          return `HTTP ${response.status} ${response.statusText}\n\n${truncated}`;
        } catch (err: unknown) {
          return `Error fetching ${url}: ${(err as Error).message}`;
        }
      }
    },
    createThreeDTool(projectRoot),
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
    },
    // Sub-agent delegation: spawns an independent child AgentEngine that can
    // use its own tools. This is what makes "run N sub-agents" real — the model
    // calls this tool (possibly several times in one turn) and each call runs a
    // full isolated agent that reports back. Children omit run_subagent to
    // avoid unbounded recursion (see `allowSubagents`).
    ...(allowSubagents && parentConfig
      ? [
          {
            name: 'run_subagent',
            description:
              'Delegate a self-contained task to an independent sub-agent that has its own tools (read files, run shell commands, search, write). Use to parallelize independent work, isolate noisy context, or break a big task into focused pieces. Returns the sub-agent\'s final answer plus the tools it used. Prefer one focused sub-agent per independent task.',
            parameters: {
              type: 'object',
              properties: {
                name: { type: 'string', description: 'Short label for the sub-agent (e.g. "time-checker")' },
                task: {
                  type: 'string',
                  description:
                    'The complete, self-contained task for the sub-agent. Include all context it needs — it does not see this conversation.'
                },
                run_in_background: {
                  type: 'boolean',
                  description: 'Reserved for future async use; the sub-agent still returns before you proceed. (Default false)'
                }
              },
              required: ['task'],
              additionalProperties: false
            },
            execute: async (args: Record<string, any>) => {
              const { name, task } = args as { name?: string; task?: string };
              if (!parentConfig) return 'Error: sub-agent parent configuration unavailable.';
              const child = new AgentEngine({
                provider: parentConfig.provider,
                apiKey: parentConfig.apiKey,
                baseUrl: parentConfig.baseUrl,
                model: parentConfig.model,
                projectRoot: parentConfig.projectRoot || process.cwd(),
                permissionMode: parentConfig.permissionMode || 'auto-approve-edits',
                allowSubagents: false
              });
              let answer = '';
              const toolLines: string[] = [];
              try {
                await child.run(task as string, (ev: any) => {
                  if (ev.type === 'token' && ev.content) answer += ev.content;
                  if (ev.type === 'tool_call') {
                    toolLines.push(`- used ${ev.toolName}(${JSON.stringify(ev.toolArgs ?? {})})`);
                  }
                  if (ev.type === 'error') toolLines.push(`- error: ${ev.error}`);
                });
              } catch (err: unknown) {
                return `Sub-agent failed: ${(err as Error).message}`;
              }
              const header = name ? `Sub-agent "${name}":\n` : 'Sub-agent:\n';
              const body = answer.trim() || '(no textual answer)';
              const toolSummary = toolLines.length > 0 ? `\nTools used:\n${toolLines.join('\n')}` : '';
              return `${header}${body}${toolSummary}`;
            }
          }
        ]
      : [])
  ];
}

// ─── Message Types ────────────────────────────────────────────────────────────

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
    const sysPrompt = config.systemPrompt || `You are SuperAgent, a powerful autonomous AI coding assistant.

You have access to tools to read files, list directories, search codebases, run shell commands, and write files.
Use tools progressively — don't dump the whole codebase; fetch what you need when you need it.

Key guidelines:
- Think step by step before acting
- Read relevant files before making edits
- Verify changes compile/work after editing
- Be concise but thorough in explanations
- When you edit files, mention which files changed and the diff summary`;

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
  ): StoredChatConfig {
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
  public loadChatConfig(
    userDataDir: string,
    chatId: string,
    projectKey?: string
  ): StoredChatConfig | null {
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

          // Add tool result to history
          this.record({
            role: 'tool',
            content: resultText,
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
          const baseUrl = this.config.baseUrl || (this.config.provider === 'ollama' ? 'http://localhost:11434' : '');
          if (baseUrl.includes('localhost') || baseUrl.includes('127.0.0.1')) {
            const providerName = this.config.provider === 'ollama' ? 'Ollama (Local)' : 'Local server';
            errMsg = `${providerName} connection refused. Is the local service running on ${baseUrl}?`;
          }
        } else if (errMsg === 'fetch failed' && this.config.provider === 'ollama') {
          errMsg = `Ollama connection failed. Is Ollama running on http://localhost:11434?`;
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

    const startMs = Date.now();
    try {
      // Bound concurrent outbound requests per provider so 100+ agents don't
      // fire a thundering herd at one provider (→ 429 storms, reroutes, collapse).
      res = await providerLimiter.run(this.config.provider, async () => {
        if (family === 'anthropic') {
          return this.streamAnthropic(onEvent, signal);
        } else if (family === 'gemini') {
          return this.streamGemini(onEvent, signal);
        } else if (family === 'ollama') {
          return this.streamOllama(onEvent, signal);
        } else {
          // Everything else (OpenAI, DeepSeek, DeepInfra, OpenRouter, Kimi, …)
          // speaks the OpenAI-compatible Chat Completions protocol.
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
   * Fetches a provider endpoint with a *connect* timeout: the request is aborted
   * if the provider does not return a response within `timeoutMs`, so a dead or
   * silently-hanging connection fails fast instead of stalling the whole agent
   * run (the renderer would otherwise spin forever). Once the response starts
   * streaming the timer is cleared, so long-but-healthy generations are never
   * cut off. User aborts (`signal`) are honored alongside the timeout.
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
      // Aborted by our connect-timeout (not the user) → surface a clear timeout error
      // instead of a generic AbortError (which the caller would treat as a user stop).
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

    const response = await this.fetchWithConnectTimeout(
      url,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.config.apiKey}`
        },
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

    // Convert to Gemini format, preserving tool calls (functionCall) and tool
    // results (functionResponse) so multi-turn tool use stays valid. Gemini
    // requires a model(functionCall) turn to be followed by a user
    // (functionResponse) turn — the persisted toolCalls make that possible.
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

    const systemInstruction = this.history.find(m => m.role === 'system')?.content;

    const tools = [{
      functionDeclarations: this.tools.map(t => ({
        name: t.name,
        description: t.description,
        // Gemini rejects standard JSON-Schema keywords like `additionalProperties`
        // (HTTP 400). Strip them before sending; see sanitizeSchemaForGemini.
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

    const messages = this.history.map(m => ({
      role: m.role,
      content: m.content
    }));

    const payload = {
      model: this.config.model || 'llama3.2',
      messages,
      stream: true,
      options: {
        temperature: this.config.temperature ?? 0.4,
        // Bound the generation length, mirroring the OpenAI path's `max_tokens`.
        // Without this, Ollama's default is effectively unbounded (num_predict
        // = -1), so a rambling local model can stream a huge response token by
        // token, amplifying any per-token work on the renderer side.
        num_predict: this.config.maxTokens ?? 4096
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

export function isContextOverflowError(message: string): boolean {
  if (!message) return false;
  return /context length|context window|maximum context|max.*context|token limit|too many tokens|request too large|exceeds.{0,24}context|context.{0,12}exceed|prompt is too long|input.{0,12}too long|input length|sequence too long/i.test(
    message
  );
}

