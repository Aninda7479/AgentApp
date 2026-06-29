# Implementation Plan — Open-Source Super Agent Ecosystem ("SuperAgent")

A next-generation, community-first AI agent platform that delivers **both a Desktop GUI Application and an Agent CLI**, powered by a shared open-source TypeScript core. SuperAgent combines the best agentic workflows from OpenAI Codex, Anthropic Claude Code, and Nous Hermes Agent.

## 1. Dual-Interface Vision & Core Capabilities

SuperAgent provides two distinct interfaces sharing a single intelligent agent engine:

1. **SuperAgent Desktop App**: A rich cross-platform GUI for visual task management, interactive media previewing (Images, Audio, Video, PDFs, PPT decks), real-time agent graph visualization, and system-tray background daemon operations.
2. **SuperAgent CLI**: A fast, keyboard-driven terminal assistant with turn-queueing (`Tab`), inline diff reviews (`/diff`), and instant terminal execution.
3. **Shared Core Engine**: Universal MCP client support (STDIO/SSE/HTTP), sandboxed terminal execution, Playwright browser automation, and persistent self-improving memory (`/learn`).

---

## 2. Tech Stack & Architecture Design

To maintain maximum community accessibility, code reuse, and seamless cross-platform contribution, we utilize a modular **TypeScript Monorepo**:

* **Monorepo Manager**: `npm workspaces` or `pnpm` (standard, straightforward JS/TS tooling).
* **Shared Agent Core (`packages/core`)**: Core agent loops, tool registry, MCP protocol client, media generation suite (sharp, pdf-lib, pptxgenjs, fluent-ffmpeg), context compactor, and skill memory.
* **Desktop Application (`packages/desktop`)**: **Electron + React + Vite + Vanilla CSS / Glassmorphism**. Renders rich interactive media cards, inline video/audio players, PDF viewports, and PPT slides.
* **Terminal CLI (`packages/cli`)**: **Ink (React for Terminal)** — delivers responsive terminal UIs, streaming markdown, and keyboard shortcuts matching Codex/Claude Code.

```
┌───────────────────────────────────────────────────────────────────────────────┐
│                               USER INTERFACES                                 │
│    ┌──────────────────────────────────┐    ┌─────────────────────────────┐    │
│    │     Desktop App (Electron/React) │    │       Agent CLI (Ink/TUI)   │    │
│    │  - Media Viewer & Editor         │    │  - Keyboard Shortcuts       │    │
│    │  - Agent Execution Flow Graph    │    │  - Fast Shell Execution     │    │
│    │  - System Tray Daemon Control    │    │  - Inline Diff Inspection   │    │
│    └─────────────────┬────────────────┘    └──────────────┬──────────────┘    │
└──────────────────────┼────────────────────────────────────┼───────────────────┘
                       │                                    │
┌──────────────────────▼────────────────────────────────────▼───────────────────┐
│                           SHARED AGENT CORE DEEP ENGINE                       │
│                       (@superagent/core npm package)                          │
│                                                                               │
│  ┌────────────────────────┐  ┌────────────────────────┐  ┌─────────────────┐  │
│  │   Agent Loop & Planner │  │  Context Compactor     │  │ Subagent Manager│  │
│  └───────────┬────────────┘  └───────────┬────────────┘  └────────┬────────┘  │
│              │                           │                        │           │
│  ┌───────────▼───────────────────────────▼────────────────────────▼────────┐  │
│  │                          Universal Tool Registry                        │  │
│  │  ┌────────────┐  ┌─────────────┐  ┌───────────┐  ┌────────────────────┐ │  │
│  │  │  MCP Core  │  │ Terminal/PTY│  │ Browser   │  │ Media Suite Engine │ │  │
│  │  │(STDIO/SSE) │  │ Sandbox     │  │Playwright │  │(PDF/PPT/AV/Image) │ │  │
│  │  └────────────┘  └─────────────┘  └───────────┘  └────────────────────┘ │  │
│  └─────────────────────────────────────────────────────────────────────────┘  │
└───────────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Comprehensive Feature Synthesis (Codex + Claude + Hermes)

### Interfaces & Controls
| Feature | Desktop GUI App | Terminal CLI |
| :--- | :--- | :--- |
| **Media Output** | Interactive image gallery, built-in PDF viewer, audio/video player, PPT slide deck preview | Terminal ASCII previews, file paths, and external auto-launch openers |
| **Keyboard Controls** | Standard desktop hotkeys + command palette (`Cmd/Ctrl + K`) | `Tab` turn queueing, `Ctrl+O` transcript view, `Shift+Tab` permissions |
| **Visual Inspections**| GUI side-by-side git diff viewer, live agent tree node visualization | Terminal unified diffs (`/diff`), clean streaming logs |

### Engine Features (Supported in both Desktop & CLI)
* **OpenAI Codex Features**: Asynchronous turn queueing (`Tab`), IDE context synchronization (`/ide`), and visual diff reviews (`/diff`).
* **Anthropic Claude Code Features**: Project guidelines (`AGENT.md`), dynamic context compaction (`/compact`), isolated subagents, and detailed execution logging.
* **Nous Hermes Agent Features**: Persistent user memory, self-improving skill loop (`/learn`), omnichannel daemon adapters (Telegram/Discord/Slack), and multi-backend sandboxing.

---

## 4. Project Structure (Strict Rule Compliance)

All repository files are neatly routed outside root in accordance with project standards:

```
AgentApp/
├── docs/                        # Project research & architecture docs
│   ├── Codex.md                # OpenAI Codex reference
│   ├── Claude.md               # Anthropic Claude Code reference
│   └── Hermes.md               # Nous Hermes reference
├── packages/                    # Monorepo Packages
│   ├── core/                   # Shared Agent Engine
│   │   ├── src/
│   │   │   ├── planner/        # ReAct reasoning loop
│   │   │   ├── memory/         # AGENT.md parser & vector memory
│   │   │   ├── tools/          # Media, MCP, Terminal, Browser engines
│   │   │   └── types/          # TypeScript contracts
│   │   └── test/               # Core engine tests
│   ├── desktop/                # Desktop Application (Electron + React)
│   │   ├── src/                # GUI React components & main process
│   │   └── test/               # Desktop app tests
│   └── cli/                    # Terminal CLI (Ink TUI)
│       ├── src/                # Ink terminal components
│       └── test/               # CLI command tests
├── logs/                        # Gitignored debug logs (/logs/debug_*.log)
└── package.json                 # Workspace configuration
```

---

## 5. Implementation Roadmap

### Phase 1: Shared Core Engine (`packages/core`)
* Setup monorepo structure with TypeScript strict mode and `vitest`.
* Implement the core Agentic Loop, Tool Registry, sandboxed Terminal runner, and Playwright browser execution engine.
* Implement Media Engine tools: Image generation, PDF compiler (`pdf-lib`), PPT generator (`pptxgenjs`), and Audio/Video tools (`fluent-ffmpeg`).
* Integrate `@modelcontextprotocol/sdk` supporting STDIO and SSE servers.

### Phase 2: Terminal CLI Application (`packages/cli`)
* Build responsive Ink terminal interface supporting streaming markdown and live tool call status.
* Implement keyboard shortcuts (`Tab`, `Ctrl+O`, `Shift+Tab`) and slash commands (`/compact`, `/diff`, `/learn`, `/init`).

### Phase 3: Desktop GUI Application (`packages/desktop`)
* Scaffold Electron app with React frontend using Vite and Vanilla CSS design system.
* Build rich media renderers: Image canvas viewer, interactive PDF viewer, embedded video/audio players, and PPT slide presentation renderer.
* Add system tray daemon support for background agent operations and omnichannel gateway connections.

---

## 6. Open Questions & User Review
> [!IMPORTANT]
> 1. Does the dual-package approach (**Electron + React** for Desktop GUI, and **Ink + React** for Terminal CLI) align with your expectations for the Super Agent app?
> 2. For media generation, would you prefer the app to automatically fall back to free local utilities (e.g. headless Chrome for PDF, sharp for images, local ffmpeg) when external API keys are not provided?
