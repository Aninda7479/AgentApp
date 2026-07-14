# OpenAI ChatGPT Work Desktop Super Agent App — Reference Guide

## 1. Overview & Tri-Mode Architecture

The July 2026 update to the ChatGPT Desktop application consolidates separate client tools (including the legacy Codex standalone app) into a single, unified "Superapp". This new unified application organizes the developer and productivity workflows into three primary modes to support different tasks:

```
                  ┌─────────────────────────────────────────┐
                  │          ChatGPT Unified App            │
                  └────────────────────┬────────────────────┘
                                       │
         ┌─────────────────────────────┼─────────────────────────────┐
         ▼                             ▼                             ▼
┌─────────────────┐           ┌─────────────────┐           ┌─────────────────┐
│    Chat Mode    │           │    Work Mode    │           │   Codex Mode    │
│ - Quick Q&A     │           │ - End-to-End Pro│           │ - Repo Management│
│ - Web Search    │           │ - File Access   │           │ - PTY Terminal  │
│ - Companion TUI │           │ - Connectors    │           │ - Git Worktrees │
└─────────────────┘           └─────────────────┘           └─────────────────┘
```

*   **Chat Mode**: The traditional conversational experience for general Q&A, web search, quick brainstorming, and drafting. It often lives as a companion overlay panel or side-drawer, minimizing screen usage while working in other apps.
*   **Work Mode (ChatGPT Work)**: An agentic execution workspace designed to handle multi-step, end-to-end projects. Instead of simply generating chat bubbles, it works directly with files, triggers automated background processes, and delivers finished, formatted artifacts (documents, presentations, sites, dashboards).
*   **Codex Mode**: A developer-focused environment specializing in codebase engineering. It integrates local repository management, terminal consoles, automated debugging pipelines, git diff controls, and workspace configurations.

> [!NOTE]
> For users transitioning from older versions, the legacy client remains accessible on your system as **"ChatGPT Classic"**, ensuring existing workflows are not interrupted during migration.

---

### Model Effort Settings
Users can configure the reasoning effort of the Sol model to adjust computation depth and search tokens, balancing processing speed with reasoning accuracy.

---

## 3. Core Agentic Capabilities & Features

ChatGPT Work acts as an "execution layer" that automates workflows directly on the user's host system or cloud sandbox.

### A. Agentic Long-Horizon Execution
*   **Autonomous Step Planning** ✅: When given a high-level goal, the agent decomposes it into a series of structured steps, creating a visible plan before executing.
*   **Background Processing** ✅: Runs complex research or document generation tasks in the background, allowing the user to minimize the window and focus on other activities.
*   **Self-Healing Loop** ✅: If a terminal command, script execution, or API request fails, the agent inspects the error message, refactors its code or parameters, and automatically retries.

### B. Sites Integration (`@Sites` / `/site`)
*   **Interactive Prototyping**: Users can ask ChatGPT to "build a website" or type `/site` to generate fully functional React/static frontends or dashboards.
*   **Live Previews**: Provides an in-app browser pane to render, test, and interact with the generated site.
*   **Sharing and Hosting**: Deploy and host generated sites directly via OpenAI's hosting platform for immediate sharing with colleagues.

### C. Connectors & Apps (Legacy Plugins Replacement)
Connectors and App integrations replace the legacy ChatGPT plugin system, offering secure OAuth-based links to corporate productivity and developer suites. 

#### Available Connectors & Apps List
*   **Google Workspace Suite** ✅:
    *   *Google Drive*: Reference, read, and write files across shared drives.
    *   *Google Docs / Sheets / Slides*: Retrieve contents, append logs, write cells, or structure presentation templates.
    *   *Gmail & Google Calendar*: Read schedules, book calendar invites, and draft/send emails.
*   **Microsoft 365 Suite** ✅:
    *   *OneDrive & SharePoint*: Browse directory structures, extract document text, and save project outputs.
    *   *Outlook*: Access email threads and draft calendar invites.
    *   *Microsoft Teams*: Sync team chat topics and read logs.
*   **Cloud Storage Integrations** ✅:
    *   *Dropbox*: Ingest spreadsheets and large media assets.
    *   *Box*: Fetch legacy corporate file caches.
*   **Developer & Project Management** ✅:
    *   *GitHub*: Query repositories, audit pull requests, create issues, and manage commits.
    *   *GitLab*: Trigger CI/CD pipelines and inspect builds.
    *   *Jira & Confluence*: Update task tickets, sync backlogs, and pull knowledge base articles.
    *   *Linear*: Access sprint boards and create tasks.
    *   *Asana & Trello*: Track tasks and update board states.
*   **CRM & Business Operations** ✅:
    *   *Salesforce*: Retrieve lead statistics, update account records, and parse sales funnels.
    *   *HubSpot*: Check customer interactions and automate outreach logs.
    *   *Zendesk*: Review support tickets and search customer history logs.
*   **Productivity & Communication** ✅:
    *   *Slack*: Direct workspace channel integrations to query messages, summarize channels, or post alerts.
    *   *Notion*: Extract workspace databases, modify pages, and query wikis.
    *   *Zoom*: Fetch meeting schedules and transcribes.

---

### D. Skills & Pre-built Playbooks
Skills are pre-built, reusable workflow templates that instruct the agent on how to perform specific tasks using connected resources and instructions.

#### Available Skills List
*   **Document & Content Generation** ✅:
    *   *Weekly Report Generator*: Aggregates Jira task summaries, Slack commits, and Google Calendar events into formatted reports.
    *   *Presentation Slide Formatter*: Takes outline text and auto-compiles PPT slides using corporate design tokens.
    *   *Release Notes Compiler*: Audits GitHub commit history to generate user-friendly changelogs.
    *   *Email Draft Composer*: Generates professional email copy based on brief bullet-point notes.
*   **Data Processing & Analysis** ✅:
    *   *Data Cleaning & Normalization*: Parses dirty CSVs or Excel sheets to repair typos, drop duplicates, and format dates.
    *   *CSV-to-Chart Visualizer*: Converts spreadsheet metrics into interactive SVG graphs or dashboards.
    *   *Sentiment Analysis Pipeline*: Processes customer feedback logs to score user satisfaction.
    *   *SQL Query Optimizer*: Analyzes execution plans of databases to propose index improvements.
*   **Development & Coding** ✅:
    *   *Code Auditor & Linter*: Scans codebase files to find formatting issues, syntax problems, and potential bugs.
    *   *API Documentation Generator*: Generates OpenAPI / Swagger specs directly from source files.
    *   *Test Suite Auto-Writer*: Examines source code modules to generate comprehensive unit tests.
    *   *Git Commit Formatter*: Formats staging area diffs into standard Conventional Commits.
*   **Project & Task Management** ✅:
    *   *Meeting Minutes Summarizer*: Transcribes and extracts action items, decisions, and summaries from meeting audio.
    *   *Daily Standup Compiler*: Scans calendar events and Slack history to compile daily update reports.
    *   *Task Scheduler & Reminder*: Watches calendars and automatically alerts via Slack when deadlines approach.

### E. Computer Use & Sandboxed GUI Automation
*   **GUI Control** ✅: In the desktop client, the agent can obtain permission to simulate mouse movement, clicks, keyboard inputs, and interact with local applications and browsers.
*   **Picture-in-Picture (PiP) Mirror**: Operates via a visual PIP screen, enabling real-time human monitoring of the agent's actions on the desktop.
*   **Sandboxing Safeguards** ✅: Execute shell scripts or run untrusted builds safely using isolated environments, utilizing **Windows Sandbox (WSL2)** or macOS sandbox wrappers.

### F. Scheduled & Remote Tasks
*   **Task Scheduling** ✅: Schedule agents to run checks, compile reports, or synchronize directories at specific intervals (e.g., hourly, daily).
*   **Mobile-to-Desktop Handoff**: Users can queue or monitor background execution tasks from their mobile app, which then run on their local desktop daemon.

### G. Ingestion & Media Processing
*   **Drag-and-Drop Ingestion** ✅: Drop files (PDFs, CSVs, scripts) directly into the composer.
*   **Visual Screenshot Analysis** ✅: Use the system camera or take instant screen clips for immediate visual debugging, design review, or OCR parsing.

### H. Model Context Protocol (MCP) Integration
Exposes standard support for external tools and agents via the Model Context Protocol, enabling real-time expansion of the agent's capabilities:
*   **Multi-Transport Support** ✅: Connects to MCP servers via standard input/output (`stdio`), Server-Sent Events (`sse`), and remote `http`/`https` endpoints.
*   **Command Line Management** ✅: Exposes commands to configure active servers on the fly (e.g. `codex mcp add <name> -- <command>`).
*   **Session Diagnostics** ✅: Inline commands like `/mcp` or `/status` display connection logs, active endpoint tools, and runtime status.

#### Available Reference MCP Servers List
*   **Filesystem** ✅: Provides secure, sandboxed file operations (read, write, list, search, stats) within user-authorized directories.
*   **Git** ✅: Enables repository queries, branch checking, staging, committing, and inspecting logs.
*   **Fetch** ✅: Downloads website contents and converts raw HTML into clean, readable Markdown format for LLM reasoning.
*   **Brave Search / Google Search** ✅: Connects to search engines to query web indexes and retrieve snippet contexts.
*   **Database (Postgres / Sqlite / MySQL)** ✅: Enables safe database schema discovery, index suggestions, and SQL query execution.
*   **Puppeteer / Playwright** ✅: Powers automated browser scripting, page screenshots, and headless web app testing.
*   **Sequential Thinking**: A reasoning server that implements a structured step-by-step thinking loop for difficult bugs and architectural decisions.
*   **Memory** ✅: Maintains a persistent local knowledge graph database to track cross-session facts, entities, and relationships.
*   **Jira & Confluence**: Integrates issue tracking, updates sprint boards, and extracts documentation wiki articles.
*   **Sentry**: Retrieves recent software exceptions, logs, and stack traces to automate debugging.

---

### I. App Settings & Advanced Configuration Options
The ChatGPT Desktop App settings menu (accessed via `Cmd + ,` on macOS or `Ctrl + ,` on Windows) allows users to configure agent execution, system sandboxing, and general workflow behaviors:

*   **General Settings** ✅:
    *   *Require Cmd/Ctrl + Enter*: Configures the composer to insert a newline when `Enter` is pressed, preventing accidental message sending during multiline drafts.
    *   *Prevent sleep during execution*: Keeps the host computer awake during long background agent tasks (e.g. compiling large datasets or running test suites).
    *   *Follow-up behavior*: Customizes whether the app automatically switches focus back to the IDE or active terminal when a task finishes.
*   **Agent Execution & Permissions** ✅:
    *   Allows configuration of autonomy levels for local execution:
        *   *Ask for approval*: Prompts the user before any file edits, command runs, or outbound connector updates.
        *   *Auto-review*: Runs automated background checks but requires confirmation for high-risk system commands.
        *   *Full access*: Gives the agent complete, uninterrupted read/write access.
*   **Developer Sandbox Configuration** ✅:
    *   *Sandbox Runtime*: Selects the underlying sandbox runner environment (e.g., native OS, Windows Subsystem for Linux (WSL2), or Docker containers).
    *   *Terminal Emulator Integration*: Configures shell launch commands and environment profiles for the integrated PTY window.
*   **Appearance & Editor Tuning** ✅:
    *   Customizes themes, window transparency settings (accent/glassmorphism overlays), code font selections, and terminal font sizing.

---

## 4. Keyboard Shortcuts & Navigation

| Category | Shortcut | Action / Function |
| :--- | :--- | :--- |
| **Global Overlay** | `Alt + Space` (Win) / `Option + Space` (Mac) | Summon/dismiss the ChatGPT Companion overlay anywhere |
| **Interface** | `Ctrl/Cmd + /` ✅ | Display the full keyboard shortcut reference panel |
| **Interface** | `Ctrl/Cmd + ,` ✅ | Open Settings and Preferences configuration panel |
| **Interface** | `Ctrl/Cmd + Shift + S` ✅ | Toggle sidebar navigation panel |
| **Interface** | `Ctrl/Cmd + Shift + B` ✅ | Toggle the built-in browser viewport panel |
| **Conversation** | `Ctrl/Cmd + Shift + O` ✅ | Start a fresh chat session / clear current composer |
| **Conversation** | `Shift + Esc` ✅ | Move focus directly to the composer input bar |
| **Conversation** | `Shift + Enter` ✅ | Insert a newline in the input composer (without sending) |
| **Utility** | `Ctrl/Cmd + Shift + C` ✅ | Copy the text of the latest model response to clipboard |
| **Utility** | `Ctrl/Cmd + Shift + ;` ✅ | Copy the code block from the latest response to clipboard |

---

## 5. Built-in Slash Commands

| Slash Command | Mode Availability | Description |
| :--- | :--- | :--- |
| `/plan` ✅ | Work / Codex | Prompt the agent to draft and display a multi-step execution plan before editing files |
| `/goal` | Work | Set a persistent condition that the agent must autonomously satisfy before finishing |
| `/agent` ✅ | Work | Switch between active tool agents, specific connector integrations, or background threads |
| `/model` ✅ | All | Switch the active model (Sol, Terra, Luna) or modify reasoning effort |
| `/side` ✅ | All | Launch a quick side chat sandbox without polluting the current project context |
| `/permissions` ✅ | Work / Codex | Adjust autonomy levels (e.g., *Auto-approve edits*, *Ask before terminal commands*, *Read-only*) |
| `/status` ✅ | All | Display session statistics, model rate limits, token usage, and active connectors |
| `/review` ✅ | Codex | Initiate an automated code audit or debug current staging/local modifications |
| `/site` | Work | Open the interactive Sites preview window and deploy the current application prototype |

---

## 6. Replication Blueprint for SuperAgent

To incorporate ChatGPT Work capabilities into the SuperAgent platform:

1.  **Tri-Mode Workspace Wrapper**:
    *   Design a core Electron Shell that supports dynamic switching between **Chat** (simple overlay client), **Work** (agent planner, task checklist TUI), and **Codex** (code repository manager, visual terminal, git diff integrations).
2.  **Connector Layer (OAuth & API integration)**:
    *   Create a plugins-to-connectors manager in `packages/core`. Implement standard token-based authentication for Google APIs, MS Graph API, and Slack Webhooks, wrapping them into the universal agent tool registry.
3.  **Local computer use (GUI Automation & Sandboxing)**:
    *   Integrate Playwright browser automation for web tasks.
    *   For local operating system interaction, expose screen-capture and click capabilities through sandboxed background tasks using Windows Sandbox or Docker wrappers.
4.  **Sites Rendering Engine**:
    *   Implement an iframe-based sandbox in `packages/desktop` that watches a local build directory (e.g. `./dist`) compiled by a fast local bundler (Vite) and displays instant visual prototypes.
