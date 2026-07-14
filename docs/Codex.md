# OpenAI Codex CLI — Features & Shortcuts Reference

## 1. Overview & Core Philosophy
OpenAI Codex CLI (packaged as `@openai/codex`) is a terminal-based, agentic software engineering assistant designed for local codebase development. Powered by advanced reasoning models (such as o3, o3-mini, and o4-mini), it operates autonomously or semi-autonomously inside a secure sandbox to inspect, modify, and execute code directly in your terminal environment.

---

## 2. Comprehensive Feature Breakdown

### A. Terminal UI (TUI) & Interactive Flow
* **Full-Screen TUI**: Interactive terminal interface displaying streaming model responses, code block previews, and diff reviews. (CLI TUI is `packages/cli`; desktop is a separate GUI — not a single "both" feature)
* **Non-Interactive Mode (`exec`)**: Run one-off commands programmatically for CI/CD or scripts (e.g., `codex exec "refactor database module"`). (CLI `exec` exists but is a stub returning a mock — not wired to a real engine)
* **Multimodal Input Support**: Supports code snippets, text instructions, and image inputs (screenshots, design mockups, error diagrams). (Desktop attachments only; not in CLI runtime — ✅ removed)
* **Turn Queueing**: Allows users to type and queue follow-up instructions while the agent is actively executing a task. (CLI turn queue exists; CLI-only)

### B. Execution Sandbox & Security Controls
* **Autonomous File Editing**: Directly creates, edits, and deletes files based on user prompts. (Desktop `write_file` tool only; not in CLI — ✅ removed)
* **Terminal Command Execution**: Runs bash/shell commands (tests, builds, lints) with user-configurable permission policies. (Desktop `run_command` only; not in CLI — ✅ removed)
* **Configurable sandbox permissions**:
  * *on-request*: Prompt the user to approve terminal commands.
  * *untrusted*: Strict sandboxing for untrusted operations.
  * *never*: Disables execution entirely.
  (Desktop permission settings + `packages/core` `sandbox/permissions.ts`; desktop-only — ✅ removed)
* **Autonomy Levels**: Read-only vs. Auto-edit vs. Full autonomy configurations. (Desktop settings toggles only; not in CLI — ✅ removed)

### C. Context & Project Integration
* **IDE Context Synchronization (`/ide`)**: Syncs currently open files, active selections, and cursor positions from IDEs like VS Code or Cursor into the prompt context. (Not implemented)
* **Rules & Instructions Parser (`AGENTS.md`)**: Automatically reads `AGENTS.md` at the project root for repository-specific coding guidelines. (CLI `/init` reads/writes it; not wired into desktop runtime — ✅ removed)
* **Reusable Workflow Skills (`.codex/skills`)**: Allows developers to save task-specific workflows as custom skills. (CLI `/learn` skill store; not in desktop — ✅ removed)
* **Structured Configuration**: Global (`~/.codex/config.toml`) and project-level (`.codex/config.toml`) settings for model selection, sandbox behavior, and default prompts. (Both clients persist settings, but this is not a discrete user-facing feature — ✅ removed)

### D. Authentication & Billing
* **ChatGPT Login Flow**: Supports sign-in directly using ChatGPT accounts (Plus, Pro, Business, or Enterprise), making it highly cost-effective for large-volume developer sessions.

### E. Model Context Protocol (MCP) Integration
> ⚠️ `packages/core` has an MCP **client** (`mcp/*`, stdio/sse/http) but it is **not wired** into either client. No ✅.

* **Full MCP Support**: Connects seamlessly to external MCP servers (STDIO and Streamable HTTP with OAuth).
* **Dynamic Tool Expansion**: Extends agent capability to query production databases, GitHub issues, Jira tickets, and external web APIs.
* **MCP Management Commands**: CLI utility to register and monitor active MCP endpoints (`codex mcp add <name> -- <command>`). (No CLI `/mcp`; desktop dashboard is a mock)

---

## 3. Keyboard Shortcuts & Navigation

| Shortcut | Action / Function |
| :--- | :--- |
| `Ctrl + L` | Clear terminal screen and reset view / clear chat (not implemented) |
| `Ctrl + R` | Search prompt history (reverse search) (CLI-only) |
| `Ctrl + O` / `/copy` | Copy latest completed model output to clipboard (CLI-only transcript toggle; not in desktop) |
| `Up / Down Arrows` | Navigate through draft text history in composer (CLI-only) |
| `Tab` | Queue follow-up prompt or command while agent is running (CLI-only) |
| `Esc` | Interrupt active agent thinking or execution (CLI-only) |
| `Ctrl + C` / `/exit` | Exit session (CLI-only) |

---

## 4. Built-in Slash Commands

| Slash Command | Description |
| :--- | :--- |
| `/init` | Generates an `AGENTS.md` file in the project root to store custom guidelines (CLI `/init` only; not in desktop) |
| `/permissions` ✅ | Adjust autonomy levels (Read-only vs. Auto-edit vs. Full) and sandbox controls |
| `/status` | Display current model, token usage, rate limits, and session stats (CLI `/status` only; no desktop view) |
| `/ide` | Pull current IDE active file context into prompt (not implemented) |
| `/diff` ✅ | Review proposed file changes and unified diffs before applying |
| `/review` ✅ | Prompts the agent to audit pending changes or debug generated code |
| `/agent` | Switches between different active agent threads (no `/agent` command in CLI) |
| `/theme` ✅ | Preview and switch TUI visual themes |
| `/clear` ✅ | Hard reset current conversation context |
| `! <command>` | Instantly run raw terminal command (not implemented in CLI TUI) |

> ✅ = verified wired through `packages/core` into **both** `packages/cli` and `packages/desktop`. Only `/permissions`, `/diff`, `/review`, `/theme`, `/clear` qualify.

---

## 5. CLI Execution Flags

The Codex CLI supports automated and non-interactive workflows using the following flags:
*   **`codex exec "task"`**: Runs a specific task in non-interactive mode.
*   **`codex resume`**: Reconnects to a previous session.
*   **`--ask-for-approval` (`-a`)**: Controls when the agent pauses for human input.
*   **`--add-dir`**: Grants the agent write access to additional directories outside the main workspace.
*   **`--yolo`**: A shorthand for bypassing approvals and running tasks in fully autonomous mode.

---

## 6. Replication Blueprint (How to Implement in Super Agent)
To replicate Codex capabilities:
1. **Interactive TUI**: Implement terminal UI using Ink (React in terminal) or Blessed/Bubbletea.
2. **Turn Queueing Architecture**: Implement an asynchronous message buffer that accepts user inputs while the model runner worker loop is active.
3. **IDE Bridge**: Create a lightweight VS Code extension or LSP bridge HTTP server that exposes active editor tabs and selections to the CLI agent.
4. **MCP Client Core**: Integrate `@modelcontextprotocol/sdk` to support STDIO and HTTP SSE tool servers.
