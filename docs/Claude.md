# Anthropic Claude Code CLI — Features & Shortcuts Reference

## 1. Overview & Core Philosophy
Claude Code is an agentic command-line interface (CLI) developed by Anthropic. It operates directly in the developer's terminal, offering deep codebase comprehension, autonomous file editing, terminal execution, subagent delegation, and structured project context persistence.

---

## 2. Comprehensive Feature Breakdown

### A. Core Agentic Capabilities
* **Codebase Comprehension**: Reads entire repositories, builds mental maps of project structures, and navigates file dependencies across complex codebases.
* **Autonomous File & Terminal Editing**: Reads, writes, patches, and refactors files; executes build commands, test suites, and git operations.
* **Multimodal Image Support**: Accepts image uploads (clipboard paste or path reference) for analyzing mockups, UI screenshots, and architecture diagrams.

### B. Project Memory & Instructions (`CLAUDE.md`)
* **Project-Level Context**: Automatically reads `CLAUDE.md` at the project root for custom developer guidelines, code styles, build commands, and workflow constraints.
* **Automatic Initialization (`/init`)**: Scans repository structure and tech stack to generate a tailored `CLAUDE.md` template.

### C. Subagent Delegation Architecture
* **Isolated Workstreams**: Spawns specialized subagents running in independent, isolated context windows for complex parallel tasks (e.g., test creation, security auditing, refactoring).
* **Context Preservation**: Prevents main conversation context window pollution by offloading heavy search and trial-and-error operations to subagents.

### D. Model Context Protocol (MCP) Integration
* **Multi-Transport Support**: Connects to MCP servers via `stdio`, Server-Sent Events (`sse`), and `http`.
* **Tool Discovery & Management**: Command-line integration (`claude mcp add`) for external services like Postgres databases, GitHub APIs, Slack, and web scrapers.

### E. History Compaction & Cost Management
* **Context Compression (`/compact`)**: Summarizes older conversation steps to clear token space while preserving key architectural decisions and current goals.

---

## 3. Keyboard Shortcuts & Controls

| Shortcut | Action / Function |
| :--- | :--- |
| `Ctrl + O` | Toggle verbose transcript viewer (exposes inner thought chain, tool calls, and raw outputs) |
| `Ctrl + R` | Reverse search through past prompt history |
| `Ctrl + G` (or `Ctrl + X, Ctrl + E`) | Open current prompt in configured external text editor (e.g., VS Code, Vim, Nano) |
| `Ctrl + C` | Cancel current agent execution or clear input buffer (double-press to halt/exit) |
| `Ctrl + V` / `Cmd + V` | Paste image directly from clipboard into active prompt |
| `Shift + Tab` | Cycle through execution permission modes (e.g., Manual Approve vs Auto Approve) |
| `Ctrl + B` | Background a long-running command to keep working |
| `Ctrl + L` | Redraw the terminal screen / clear visual output (does not clear context) |
| `Ctrl + ,` | Open Claude Code settings configuration |
| `Ctrl + D` | Exit active CLI session |
| `Esc` / `Esc + Esc` | Clear current input prompt or rewind conversation / code changes |
| `Alt + Enter` / `Option + Enter` | Insert newline in prompt composer without sending the message |
| `@<path>` | Mention/auto-complete file paths and directory context directly in prompt |

---

## 4. Built-in Slash Commands

| Slash Command | Description |
| :--- | :--- |
| `/compact` | Compress and summarize conversation history to free up context tokens |
| `/clear` / `/reset` / `/new` | Hard reset current session and start a fresh context window |
| `/model` | Switch between underlying Claude models (e.g., Sonnet 3.7, Opus 3.5) mid-session |
| `/diff` | Open an interactive visual diff viewer to inspect pending file modifications |
| `/mcp` | List, inspect, add, or manage active Model Context Protocol (MCP) servers |
| `/init` | Analyze project and auto-generate project-level `CLAUDE.md` rules |
| `/goal` | Set a completion condition for Claude, which then works autonomously toward that end state |
| `/plan` | Enter plan mode for planning large architectural/complex changes |
| `/security-review` | Run automated security analysis on your codebase to identify vulnerabilities (SQL injection, XSS, etc.) |
| `/code-review` / `/review` | Audit current changes or code diffs for issues |
| `/cost` / `/stats` | View cumulative session costs and token statistics |
| `/config` | View or modify configuration options (e.g. `/config verbose=true`) |
| `/memory` | Open `CLAUDE.md` to add/edit project conventions |
| `/status` | View current session status and active settings |
| `/tasks` | List active background tasks or subagents |
| `/doctor` | Run setup checkup/diagnostics to troubleshoot local configuration |
| `/verify` | Run tests or app commands to verify recent changes |
| `/btw` | Ask a side question without polluting the main conversation context window |
| `/voice` | Toggle voice dictation mode |
| `/bug` | Report issues with session logs directly to Anthropic |
| `/login` / `/logout` | Authenticate or log out from your Anthropic account |

---

## 5. Replication Blueprint (How to Implement in Super Agent)
To replicate Claude Code capabilities:
1. **Memory Hierarchy**: Support project-level guidelines (`AGENT.md` / `CLAUDE.md`) auto-loaded into system prompts.
2. **Context Compaction Algorithm**: Implement automatic token counting; when context exceeds threshold, invoke a fast summarizer LLM call to reduce trajectory to key milestone summaries.
3. **Subagent Protocol**: Implement background worker subprocesses with child event emitters that report back findings to parent coordinator agent.
4. **Rich Transcript Inspector**: Provide shortcut (`Ctrl+O`) to toggle between clean user UI and raw execution logs.
