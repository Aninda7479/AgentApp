# OpenAI Codex CLI — Features & Shortcuts Reference

## 1. Overview & Core Philosophy
OpenAI Codex CLI is an open-source, terminal-native coding agent designed for local software development. Powered by reasoning models (such as o3 and o4-mini), Codex functions as an autonomous local assistant capable of inspecting, modifying, and executing code within a sandboxed local environment.

---

## 2. Comprehensive Feature Breakdown

### A. Terminal UI (TUI) & Interactive Flow
* **Full-Screen TUI**: Interactive terminal interface displaying streaming model responses, code block previews, and diff reviews.
* **Non-Interactive Mode (`exec`)**: Run one-off commands programmatically for CI/CD or scripts (e.g., `codex exec "refactor database module"`).
* **Multimodal Input Support**: Supports code snippets, text instructions, and image inputs (screenshots, design mockups, error diagrams).
* **Turn Queueing**: Allows users to type and queue follow-up instructions while the agent is actively executing a task.

### B. Execution Sandbox & Security Controls
* **Autonomous File Editing**: Directly creates, edits, and deletes files based on user prompts.
* **Terminal Command Execution**: Runs bash/shell commands (tests, builds, lints) with user-configurable permission policies.
* **Permission Modes**:
  * *Read Only*: Agent can inspect files and analyze code without modifying disk state.
  * *Auto-edit*: Agent automatically writes changes but prompts before running terminal commands.
  * *Full Autonomy*: Agent executes commands and file edits seamlessly.

### C. Context & Project Integration
* **IDE Context Synchronization (`/ide`)**: Syncs currently open files, active selections, and cursor positions from IDEs like VS Code or Cursor into the prompt context.
* **Structured Configuration**: Global (`~/.codex/config.toml`) and project-level (`.codex/config.toml`) settings for model selection, sandbox behavior, and default prompts.

### D. Model Context Protocol (MCP) Integration
* **Full MCP Support**: Connects seamlessly to external MCP servers (STDIO and Streamable HTTP with OAuth).
* **Dynamic Tool Expansion**: Extends agent capability to query production databases, GitHub issues, Jira tickets, and external web APIs.
* **MCP Management Commands**: CLI utility to register and monitor active MCP endpoints (`codex mcp add <name> -- <command>`).

---

## 3. Keyboard Shortcuts & Navigation

| Shortcut | Action / Function |
| :--- | :--- |
| `Ctrl + L` | Clear terminal screen and reset view |
| `Ctrl + R` | Search prompt history (reverse search) |
| `Ctrl + O` / `/copy` | Copy latest completed model output to clipboard |
| `Up / Down Arrows` | Navigate through draft text history in composer |
| `Tab` | Queue follow-up prompt or command while agent is running |
| `Esc` | Interrupt active agent thinking or execution |
| `Ctrl + C` / `/exit` | Exit session |

---

## 4. Built-in Slash Commands

| Slash Command | Description |
| :--- | :--- |
| `/permissions` | Adjust autonomy levels (Read-only vs. Auto-edit vs. Full) |
| `/status` | Display current model, token usage, rate limits, and session stats |
| `/ide` | Pull current IDE active file context into prompt |
| `/diff` | Review proposed file changes and unified diffs before applying |
| `/theme` | Preview and switch TUI visual themes |
| `/clear` | Hard reset current conversation context |
| `! <command>` | Instantly run raw terminal command |

---

## 5. Replication Blueprint (How to Implement in Super Agent)
To replicate Codex capabilities:
1. **Interactive TUI**: Implement terminal UI using Ink (React in terminal) or Blessed/Bubbletea.
2. **Turn Queueing Architecture**: Implement an asynchronous message buffer that accepts user inputs while the model runner worker loop is active.
3. **IDE Bridge**: Create a lightweight VS Code extension or LSP bridge HTTP server that exposes active editor tabs and selections to the CLI agent.
4. **MCP Client Core**: Integrate `@modelcontextprotocol/sdk` to support STDIO and HTTP SSE tool servers.
