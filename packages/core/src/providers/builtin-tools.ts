import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import { SandboxRunner } from '../sandbox/runtime.js';
import { PermissionMode } from '../sandbox/permissions.js';
import { InternetAccessLevel } from '../storage/settings-store.js';
import { enforceNetworkAllowed } from '../security/internet-access.js';
import { createThreeDTool } from '../tools/threed.js';
import { ComputerUse } from '../automation/computer-use.js';
import { PlaywrightBrowserEngine } from '../automation/browser.js';
import { BrowserLifecycleService } from '../automation/browser-service.js';
import { ToolDefinition } from './ai-engine-types.js';
import { AgentEngine } from './ai-engine.js';
import { LearningLoopEngine } from '../memory/learn.js';
import { UserProfileStore } from '../memory/profile.js';
import { ProjectInstructionsParser } from '../memory/instructions.js';

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
    // ── Memory retrieval tool ──────────────────────────────────────────────
    {
      name: 'memory',
      description:
        'Retrieve persistent memory: learned insights, user profile, or project instructions. ' +
        'Use scope="global" for cross-project memory (learnings, user profile), scope="project" for ' +
        'project-scoped memory (AGENT.md/CLAUDE.md instructions). Supports search filtering and pagination.',
      parameters: {
        type: 'object',
        properties: {
          scope: {
            type: 'string',
            enum: ['global', 'project'],
            description:
              '"global" returns cross-project memory (learned insights, user profile entries). ' +
              '"project" returns project-scoped memory (instruction files like AGENT.md, CLAUDE.md, .cursorrules).'
          },
          type: {
            type: 'string',
            enum: ['all', 'learnings', 'profile', 'instructions'],
            description:
              'What kind of memory to retrieve. "all" returns everything for the given scope. ' +
              'Default: "all".'
          },
          query: {
            type: 'string',
            description: 'Optional search/filter term to narrow results (case-insensitive substring match).'
          },
          skip: {
            type: 'number',
            description: 'Number of items to skip for pagination (default 0).'
          },
          limit: {
            type: 'number',
            description: 'Maximum number of items to return (default 20, max 100).'
          }
        },
        required: ['scope'],
        additionalProperties: false
      },
      execute: async (args: Record<string, any>) => {
        const scope = (args.scope as string) || 'global';
        const type = (args.type as string) || 'all';
        const query = (args.query as string) || undefined;
        const skip = Math.max(0, Number(args.skip) || 0);
        const limit = Math.min(100, Math.max(1, Number(args.limit) || 20));

        const sections: string[] = [];

        if (scope === 'global') {
          // ── Global memory: learnings + user profile ─────────────────────
          if (type === 'all' || type === 'learnings') {
            try {
              const engine = new LearningLoopEngine();
              const insights = await engine.getInsights(query);
              const paged = insights.slice(skip, skip + limit);
              if (paged.length > 0) {
                const lines = paged.map((i) => {
                  const date = new Date(i.timestamp).toISOString().slice(0, 10);
                  return `  [${i.category}] ${i.topic} (${date})\n    ${i.lesson}`;
                });
                sections.push(
                  `## Learned Insights (${paged.length} of ${insights.length} total)\n` +
                  lines.join('\n')
                );
              } else {
                sections.push('## Learned Insights\n  (none found)');
              }
            } catch {
              sections.push('## Learned Insights\n  (unavailable)');
            }
          }

          if (type === 'all' || type === 'profile') {
            try {
              const store = new UserProfileStore();
              const entries = query ? await store.search(query) : await store.listAll();
              const paged = entries.slice(skip, skip + limit);
              if (paged.length > 0) {
                const lines = paged.map((e) => {
                  const val = typeof e.value === 'string' ? e.value : JSON.stringify(e.value);
                  return `  [${e.category}] ${e.key}: ${val}`;
                });
                sections.push(
                  `## User Profile (${paged.length} of ${entries.length} total)\n` +
                  lines.join('\n')
                );
              } else {
                sections.push('## User Profile\n  (no entries found)');
              }
            } catch {
              sections.push('## User Profile\n  (unavailable)');
            }
          }
        } else if (scope === 'project') {
          // ── Project memory: instruction files ──────────────────────────
          if (type === 'all' || type === 'instructions') {
            try {
              const parser = new ProjectInstructionsParser();
              const instructions = await parser.discoverAndParse(projectRoot);
              const { combinedPrompt, rules } = parser.mergeInstructions(instructions);

              if (query) {
                // Filter: only keep instructions whose content matches the query
                const q = query.toLowerCase();
                const filtered = instructions.filter(
                  (i) =>
                    i.rawContent.toLowerCase().includes(q) ||
                    i.rules.some((r) => r.toLowerCase().includes(q))
                );
                if (filtered.length > 0) {
                  const { combinedPrompt: filteredPrompt, rules: filteredRules } =
                    parser.mergeInstructions(filtered);
                  const truncated =
                    filteredPrompt.length > 4000
                      ? filteredPrompt.substring(0, 4000) + '\n\n... (truncated)'
                      : filteredPrompt;
                  sections.push(
                    `## Project Instructions (${filtered.length} file(s) matched)\n` +
                    truncated +
                    (filteredRules.length > 0
                      ? `\n\n### Extracted Rules\n${filteredRules.map((r) => `- ${r}`).join('\n')}`
                      : '')
                  );
                } else {
                  sections.push('## Project Instructions\n  (no matching instructions found)');
                }
              } else {
                const truncated =
                  combinedPrompt.length > 4000
                    ? combinedPrompt.substring(0, 4000) + '\n\n... (truncated)'
                    : combinedPrompt;
                if (instructions.length > 0) {
                  sections.push(
                    `## Project Instructions (${instructions.length} file(s): ${instructions.map((i) => path.basename(i.filePath)).join(', ')})\n` +
                    truncated +
                    (rules.length > 0
                      ? `\n\n### Extracted Rules\n${rules.map((r) => `- ${r}`).join('\n')}`
                      : '')
                  );
                } else {
                  sections.push(
                    '## Project Instructions\n  (no instruction files found in project root — ' +
                    'create AGENT.md, CLAUDE.md, or .cursorrules to add project-specific instructions)'
                  );
                }
              }
            } catch {
              sections.push('## Project Instructions\n  (error reading instruction files)');
            }
          }
        } else {
          sections.push(`Error: Unknown scope "${scope}". Use "global" or "project".`);
        }

        return sections.join('\n\n') || '(no memory data)';
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
