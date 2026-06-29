# Nous Research Hermes Agent — Features & Shortcuts Reference

## 1. Overview & Core Philosophy
Hermes Agent is an open-source, 24/7 persistent AI agent framework developed by Nous Research. Unlike session-based AI tools that reset when closed, Hermes operates continuously on local or cloud infrastructure, featuring an autonomous "self-improving learning loop" and a unified cross-platform messaging gateway.

---

## 2. Comprehensive Feature Breakdown

### A. Self-Improving Learning Loop (`/learn`)
* **Dynamic Skill Generation**: Autonomously extracts patterns and workflows from successful task execution and codifies them into reusable skills.
* **Continuous Skill Refinement**: Continually updates and optimizes installed skills based on user interactions and execution outcomes.
* **Persistent User Memory**: Maintains a long-term memory store of user preferences, coding habits, system configurations, and past interactions across sessions.

### B. Platform-Agnostic Messaging Gateway ("Live Where You Do")
* **Unified Background Daemon**: Runs continuously in the background and bridges AI intelligence across multiple communication platforms.
* **Multi-Platform Integration**: Single agent identity accessible simultaneously via Telegram, Discord, Slack, WhatsApp, Signal, Email, Webhooks, and CLI.
* **Omnichannel Context Synchronization**: Memory and state are synchronized regardless of which client platform is used to interact with the agent.

### C. Execution & Infrastructure Flexibility
* **Multi-Backend Runtime**: Can execute code locally, inside Docker containers, across remote SSH servers, or on serverless GPU clusters (e.g., Modal, Daytona).
* **Low Resource Footprint**: Optimized to run efficiently on small $5 VPS instances or personal hardware.

### D. Extended Tooling & Sub-Agents
* **40+ Built-in Tools**: Web browsing, scraping, code generation, terminal execution, system monitoring, and media handling.
* **Sub-Agent Orchestration**: Spawns isolated concurrent sub-agents for heavy parallel work (e.g., background web research while generating code).

---

## 3. Keyboard Shortcuts & Controls (TUI)

| Shortcut | Action / Function |
| :--- | :--- |
| `Ctrl + C` | Interrupt current agent task (double-press forces exit) |
| `Ctrl + D` | Exit active CLI session |
| `Ctrl + Z` | Suspend TUI process to background (Unix systems) |
| `Ctrl + X, Ctrl + E` | Open prompt in configured external editor ($EDITOR) for long multi-line editing |
| `Tab` | Accept auto-suggestions, autocompletions, or inline completions |

---

## 4. Essential CLI Commands & Management

| Command / Slash Command | Description |
| :--- | :--- |
| `hermes` / `hermes chat` | Start interactive CLI session |
| `hermes --tui` | Launch rich full-screen Terminal User Interface |
| `/learn` | Capture current workflow, prompt, or feedback to generate a persistent reusable skill |
| `/model` | Switch LLM backends on the fly (e.g., Nous-Hermes, DeepSeek, Claude, OpenAI) |
| `hermes skills` | Browse, install, audit, or edit agent skill modules |
| `hermes backup` / `import` | Export or restore persistent memory databases, skill libraries, and configs |
| `hermes config` | Modify infrastructure backends, API keys, and gateway tokens |
| `hermes logs` | Stream live system logs and execution traces from the background daemon |
| `hermes update` | Pull latest code, migrate database schemas, and re-compile dependencies |

---

## 5. Replication Blueprint (How to Implement in Super Agent)
To replicate Hermes Agent capabilities:
1. **Daemon Architecture**: Implement a decoupling between the Execution Core (daemon service) and User Interfaces (CLI, Web, Messaging Adapters).
2. **Dynamic Skill Store**: Maintain a `/skills` directory containing SKILL.md and executable scripts; allow agent to dynamically write new skills via `/learn`.
3. **Omnichannel Adapters**: Build pluggable channel adapters (WebSocket, Telegram bot API, Discord bot API, CLI pipe) feeding into a central event broker.
