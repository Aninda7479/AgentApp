# Anthropic Claude Agent Ecosystem — Reference Guide

## 1. Overview & Core Philosophy

The Anthropic Claude Agent Ecosystem contains tools for both terminal-centric development and full operating system automation, supported by the Model Context Protocol (MCP). The ecosystem is divided into two primary clients:

```
                ┌─────────────────────────────────────────┐
                │          Claude Agent Ecosystem         │
                └────────────────────┬────────────────────┘
                                     │
         ┌───────────────────────────┴───────────────────────────┐
         ▼                                                       ▼
┌─────────────────┐                                     ┌─────────────────┐
│ Claude Desktop  │                                     │   Claude Code   │
│ - macOS/Windows │                                     │ - Developer CLI │
│ - Chat Mode     │                                     │ - PTY Terminal  │
│ - Cowork Mode   │                                     │ - Local Repos   │
└─────────────────┘                                     └─────────────────┘
```

1.  **Claude Desktop App**: A visual application available for macOS and Windows that acts as a workflow hub for:
    *   *Chat Mode*: Conversational Q&A, web search, and data processing.
    *   *Claude Cowork (Co-Work)*: An autonomous agent built for knowledge workers. It can read, edit, and organize local system files, automate web browsers, and run complex multi-step processes.
2.  **Claude Code CLI**: A terminal-based developer agent running directly inside your workspace directories. It builds project context, manages git workflows, refactors files, and executes test suites.

---

## 2. Comprehensive Feature Breakdown

### A. Claude Cowork (Co-Work) Features
*   **Operating System Interaction**: Cowork interacts directly with your local machine's file explorer, specific applications, and desktop browsers to gather information and automate work. (Desktop-only agent runtime; not in CLI)
*   **Long-Running Tasks & Cloud Handoff**: Supports complex projects that run autonomously in the background. Long-horizon tasks can hand off execution to the cloud, allowing them to continue running even if your physical computer goes offline.
*   **Scheduled Actions**: Automates recurring workflows (e.g. daily code syncs, hourly system health checks, weekly report aggregation). (Desktop ScheduledView UI only; no CLI; not wired to a scheduler)

### B. Claude Code Core Agentic Capabilities
*   **Codebase Comprehension**: Navigates file dependency layers, parses structures, and resolves import paths to build codebase maps. (Desktop agent runtime via read/list/grep tools; not in CLI)
*   **Terminal & PTY Automation**: Autonomous shell command execution (builds, lints, tests, package installations) with a configurable sandbox. (Desktop `run_command` tool; not in CLI runtime)
*   **Multimodal Asset Parsing**: Supports pasting screenshots or image paths directly into prompt contexts to analyze errors or mockups. (Desktop attachments; not in CLI runtime)

### C. Project Memory & Guidelines (`CLAUDE.md`)
*   **Custom Rules Loading**: Automatically reads `CLAUDE.md` in the project root to enforce code style rules, build commands, and testing configurations. (CLI `/init` only; not wired into desktop runtime)
*   **Setup Auto-Generation (`/init`)**: Scans code directories and project stack to build a tailored `CLAUDE.md` config. (CLI `/init` only; not in desktop)

### D. Subagent Orchestration
*   **Isolated Context Windows**: Spawns independent concurrent subagents to handle complex parallel tasks (e.g. security audits, mock test writing) without polluting the main session's token window. (Core `planner/subagents.ts` exists but is not wired into either client runtime)

### E. Model Context Protocol (MCP) Integration
Claude Desktop and Claude Code are designed as native MCP clients:
*   **Desktop Extensions (`.mcpb`)**: Users can install and update third-party tools via a click-to-install interface under settings, bypassing manual configuration files.
*   **Enterprise Administration**: IT administrators can centrally manage, audit, and configure available extensions across team or corporate accounts.
*   **Manual Configuration (`claude_desktop_config.json`)**: Configured servers are specified under the `mcpServers` parameter. Default paths:
    *   *macOS*: `~/Library/Application Support/Claude/claude_desktop_config.json`
    *   *Windows*: `%APPDATA%\Claude\claude_desktop_config.json`

#### Available Reference MCP Servers
> ⚠️ These describe *external* MCP servers the reference product connects to. SuperAgent ships an MCP **client** in `packages/core` (`mcp/*` with stdio/sse/http transports) but it is **not yet wired** into the CLI or desktop runtime, and these servers are not bundled. No ✅ until wired end-to-end.

*   *Filesystem*: Read, write, and inspect local directory structures securely.
*   *Git*: Perform git stage, commit, diff, branch management, and commit-history reviews.
*   *Fetch*: Scrape web page URLs and convert raw HTML into clean Markdown blocks.
*   *Brave Search / Google Search*: Execute live web search queries.
*   *Database (Postgres / SQLite / MySQL)*: Discover tables, suggest indices, and run raw SQL queries.
*   *Puppeteer / Playwright*: Script browser page automation and capture screenshot previews.
*   *Sequential Thinking*: Provides a structured reasoning server to guide deep bug investigation.
*   *Memory*: Implements a persistent knowledge graph to recall facts and entities.
*   *Jira & Confluence*: Connects to task dashboards and project wiki databases.
*   *Sentry*: Gathers exception traces and debug logs.

### F. History Compaction & Cost Management
*   **Token Optimization (`/compact`)**: Compresses older conversational trajectories using an LLM-summarization pass to free up context space while preserving key architectural choices.

---

## 3. Keyboard Shortcuts & Controls

| Shortcut | Action / Function |
| :--- | :--- |
| `Ctrl + O` | Toggle verbose transcript viewer (CLI-only; desktop has no equivalent) |
| `Ctrl + R` | Reverse search through past prompt history (CLI-only) |
| `Ctrl + G` (or `Ctrl + X, Ctrl + E`) | Open current prompt in configured external text editor (e.g., VS Code, Vim, Nano) (not implemented) |
| `Ctrl + C` | Cancel current agent execution or clear input buffer (double-press to halt/exit) (CLI-only) |
| `Ctrl + V` / `Cmd + V` | Paste image directly from clipboard into active prompt (desktop-only; CLI runtime doesn't run agent) |
| `Shift + Tab` | Cycle through execution permission modes (e.g., Manual Approve vs Auto Approve) (CLI-only; desktop uses settings toggles) |
| `Ctrl + B` | Background a long-running command to keep working (not implemented) |
| `Ctrl + L` | Redraw the terminal screen / clear visual output (does not clear context) (not implemented) |
| `Ctrl + ,` | Open Claude Code settings configuration / desktop settings panel (desktop-only; CLI has no Ctrl+,) |
| `Ctrl + D` | Exit active CLI session (CLI-only) |
| `Esc` / `Esc + Esc` | Clear current input prompt or rewind conversation / code changes (not in both) |
| `Alt + Enter` / `Option + Enter` | Insert newline in prompt composer without sending the message (desktop composer only) |
| `@<path>` | Mention/auto-complete file paths and directory context directly in prompt (not implemented) |

---

## 4. Built-in Slash Commands

> ✅ convention (verified against SuperAgent `packages/core` + `packages/cli` + `packages/desktop`): only features wired through core into **both** the CLI and desktop get ✅. CLI-only or desktop-only features are left unmarked.

| Slash Command | Description |
| :--- | :--- |
| `/compact` | Compress and summarize conversation history to free up context tokens (CLI `/compact` only; not in desktop) |
| `/clear` / `/reset` / `/new` ✅ | Hard reset current session and start a fresh context window |
| `/model` ✅ | Switch between underlying Claude models (e.g., Sonnet 3.7, Opus 3.5) mid-session |
| `/diff` ✅ | Open an interactive visual diff viewer to inspect pending file modifications |
| `/mcp` ✅ | List, inspect, add, or manage active Model Context Protocol (MCP) servers (CLI `/mcp` wired; desktop dashboard remains a mock) |
| `/init` | Analyze project and auto-generate project-level `CLAUDE.md` rules (CLI `/init` only; not in desktop) |
| `/goal` ✅ | Set a completion condition for Claude, which then works autonomously toward that end state |
| `/plan` ✅ | Enter plan mode for planning large architectural/complex changes |
| `/security-review` ✅ | Run automated security analysis on your codebase to identify vulnerabilities (SQL injection, XSS, etc.) |
| `/code-review` / `/review` ✅ | Audit current changes or code diffs for issues |
| `/cost` / `/stats` ✅ | View cumulative session costs and token statistics |
| `/config` ✅ | View or modify configuration options (e.g. `/config verbose=true`) |
| `/memory` ✅ | View agent memory profile: installed skills and learned insights |
| `/status` | View current session status and active settings (CLI `/status` only; no desktop view) |
| `/tasks` ✅ | List active background tasks or subagents |
| `/doctor` | Run setup checkup/diagnostics to troubleshoot local configuration (CLI `/doctor` only; not in desktop) |
| `/verify` | Run tests or app commands to verify recent changes (CLI `/verify` only; not in desktop) |
| `/btw` | Ask a side question without polluting the main conversation context window (CLI `/btw` only; not in desktop) |
| `/voice` | Toggle voice dictation mode / microphone dictation (not implemented) |
| `/bug` | Report issues with session logs directly to Anthropic (not implemented) |
| `/login` / `/logout` | Authenticate or log out from your account / manage credentials (web build only; no CLI/desktop command) |

---

## 5. Replication Blueprint (How to Implement in Super Agent)
To replicate Claude Code capabilities:
1. **Memory Hierarchy**: Support project-level guidelines (`AGENT.md` / `CLAUDE.md`) auto-loaded into system prompts.
2. **Context Compaction Algorithm**: Implement automatic token counting; when context exceeds threshold, invoke a fast summarizer LLM call to reduce trajectory to key milestone summaries.
3. **Subagent Protocol**: Implement background worker subprocesses with child event emitters that report back findings to parent coordinator agent.
4. **Rich Transcript Inspector**: Provide shortcut (`Ctrl+O`) to toggle between clean user UI and raw execution logs.



## Terminal Command Featurs.
Needs to be organized and implemented throw package/core to cli and desktop accordingly.


> claude --help
Usage: claude [options] [command] [prompt]

Claude Code - starts an interactive session by default, use -p/--print for non-interactive output

Arguments:
  prompt                                Your prompt

Options:
  --add-dir <directories...>            Additional directories to allow tool access to
  --agent <agent>                       Agent for the current session. Overrides the 'agent' setting.
  --agents <json>                       JSON object defining custom agents (e.g. '{"reviewer": {"description": "Reviews code", "prompt": "You are a code reviewer"}}')
  --allow-dangerously-skip-permissions  Enable bypassing all permission checks as an option, without it being enabled by default. Recommended only for sandboxes with no internet access.
  --allowedTools, --allowed-tools <tools...>
      Comma or space-separated list of tool names to allow (e.g. "Bash(git *) Edit")
  --append-system-prompt <prompt>       Append a system prompt to the default system prompt
  --ax-screen-reader                    Render screen-reader friendly output (flat text, no decorative borders or animations).
  --bg, --background                    Start the session as a background agent and return immediately (manage with `claude agents`)
  --bare                                Minimal mode: skip hooks, LSP, plugin sync, attribution, auto-memory, background prefetches, keychain reads, and CLAUDE.md auto-discovery. Sets CLAUDE_CODE_SIMPLE=1.
                                        Anthropic auth is strictly ANTHROPIC_API_KEY or apiKeyHelper via --settings (OAuth and keychain are never read). 3P providers (Bedrock/Vertex/Foundry) use their own
                                        credentials. Skills still resolve via /skill-name. Explicitly provide context via: --system-prompt[-file], --append-system-prompt[-file], --add-dir (CLAUDE.md dirs),
                                        --mcp-config, --settings, --agents, --plugin-dir.
  --betas <betas...>                    Beta headers to include in API requests (API key users only)
  --brief                               Enable SendUserMessage tool for agent-to-user communication
  --chrome                              Enable Claude in Chrome integration
  -c, --continue                        Continue the most recent conversation in the current directory
  --dangerously-skip-permissions        Bypass all permission checks. Recommended only for sandboxes with no internet access.
  -d, --debug [filter]                  Enable debug mode with optional category filtering (e.g., "api,hooks" or "!1p,!file")
  --debug-file <path>                   Write debug logs to a specific file path (implicitly enables debug mode)
  --disable-slash-commands              Disable all skills
  --disallowedTools, --disallowed-tools <tools...>
      Comma or space-separated list of tool names to deny (e.g. "Bash(git *) Edit")
  --effort <level>                      Effort level for the current session (low, medium, high, xhigh, max)
  --exclude-dynamic-system-prompt-sections
      Move per-machine sections (cwd, env info, memory paths, git status) from the system prompt into the first user message. Improves cross-user prompt-cache reuse. Only applies with the default system prompt
      (ignored with --system-prompt). (default: false)
  --fallback-model <model>              Enable automatic fallback to specified model(s) when the default model is overloaded or not available. Accepts a comma-separated list to try each in order. Re-tries the
                                        primary at the start of each user turn. (only works with --print)
  --file <specs...>                     File resources to download at startup. Format: file_id:relative_path (e.g., --file file_abc:doc.txt file_def:img.png)
  --fork-session                        When resuming, create a new session ID instead of reusing the original (use with --resume or --continue)
  --from-pr [value]                     Resume a session linked to a PR by PR number/URL, or open interactive picker with optional search term
  -h, --help                            Display help for command
  --ide                                 Automatically connect to IDE on startup if exactly one valid IDE is available
  --include-hook-events                 Include all hook lifecycle events in the output stream (only works with --output-format=stream-json)
  --include-partial-messages            Include partial message chunks as they arrive (only works with --print and --output-format=stream-json)
  --input-format <format>               Input format (only works with --print): "text" (default), or "stream-json" (realtime streaming input) (choices: "text", "stream-json")
  --json-schema <schema>                JSON Schema for structured output validation. Example: {"type":"object","properties":{"name":{"type":"string"}},"required":["name"]}
  --max-budget-usd <amount>             Maximum dollar amount to spend on API calls (only works with --print)
  --mcp-config <configs...>             Load MCP servers from JSON files or strings (space-separated)
  --model <model>                       Model for the current session. Provide an alias for the latest model (e.g. 'fable', 'opus', or 'sonnet') or a model's full name (e.g. 'claude-fable-5').
  -n, --name <name>                     Set a display name for this session (shown in the prompt box, /resume picker, and terminal title)
  --no-chrome                           Disable Claude in Chrome integration
  --no-session-persistence              Disable session persistence - sessions will not be saved to disk and cannot be resumed (only works with --print)
  --output-format <format>              Output format (only works with --print): "text" (default), "json" (single result), or "stream-json" (realtime streaming) (choices: "text", "json", "stream-json")
  --permission-mode <mode>              Permission mode to use for the session (choices: "acceptEdits", "auto", "bypassPermissions", "manual", "dontAsk", "plan")
  --plugin-dir <path>                   Load a plugin from a directory or .zip for this session only (repeatable: --plugin-dir A --plugin-dir B.zip) (default: [])
  --plugin-url <url>                    Fetch a plugin .zip from a URL for this session only (repeatable: --plugin-url A --plugin-url B) (default: [])
  -p, --print                           Print response and exit (useful for pipes). Note: The workspace trust dialog is skipped when Claude is run in non-interactive mode (via -p, or when stdout is not a TTY,
                                        e.g. piped or redirected output). Only use this in directories you trust. Settings files that fail validation are silently ignored in this mode (no error dialog is
                                        shown).
  --prompt-suggestions [value]          Enable prompt suggestions. In print/SDK mode, emits a prompt_suggestion message after each turn with a predicted next user prompt (choices: "true", "false", "1", "0",
                                        "yes", "no", "on", "off", preset: "true")
  --remote-control [name]               Start an interactive session with Remote Control enabled (optionally named)
  --remote-control-session-name-prefix <prefix>
      Prefix for auto-generated Remote Control session names (default: hostname)
  --replay-user-messages                Re-emit user messages from stdin back on stdout for acknowledgment (only works with --input-format=stream-json and --output-format=stream-json)
  -r, --resume [value]                  Resume a conversation by session ID, or open interactive picker with optional search term
  --safe-mode                           Start with all customizations (CLAUDE.md, skills, plugins, hooks, MCP servers, custom commands and agents, output styles, workflows, custom themes, keybindings, and
                                        more) disabled — useful for troubleshooting a broken configuration. Admin-managed (policy) settings still apply. Auth, model selection, built-in tools, and permissions
                                        work normally. Sets CLAUDE_CODE_SAFE_MODE=1.
  --session-id <uuid>                   Use a specific session ID for the conversation (must be a valid UUID)
  --setting-sources <sources>           Comma-separated list of setting sources to load (user, project, local).
  --settings <file-or-json>             Path to a settings JSON file or a JSON string to load additional settings from
  --strict-mcp-config                   Only use MCP servers from --mcp-config, ignoring all other MCP configurations
  --system-prompt <prompt>              System prompt to use for the session
  --tmux                                Create a tmux session for the worktree (requires --worktree). Uses iTerm2 native panes when available; use --tmux=classic for traditional tmux.
  --tools <tools...>                    Specify the list of available tools from the built-in set. Use "" to disable all tools, "default" to use all tools, or specify tool names (e.g. "Bash,Edit,Read").
  --verbose                             Override verbose mode setting from config
  -v, --version                         Output the version number
  -w, --worktree [name]                 Create a new git worktree for this session (optionally specify a name)

Commands:
  agents [options]                      Manage background agents
  auth                                  Manage authentication
  auto-mode                             Inspect auto mode classifier configuration
  doctor                                Check the health of your Claude Code installation. Reads settings files in the current directory without a trust prompt. For a full checkup that can also fix issues, run
                                        /doctor in a session.
  gateway [options]                     Run the enterprise auth/telemetry gateway
  install [options] [target]            Install Claude Code native build. Use [target] to specify version (stable, latest, or specific version)
  mcp                                   Configure and manage MCP servers
  plugin|plugins                        Manage Claude Code plugins
  project                               Manage Claude Code project state
  setup-token                           Set up a long-lived authentication token (requires Claude subscription)
  ultrareview [options] [target]        Run a cloud-hosted multi-agent code review of the current branch (or a PR number / base branch) and print the findings
  update|upgrade                        Check for updates and install if available
