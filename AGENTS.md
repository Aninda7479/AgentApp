# AGENTS.md — SuperAgent Developer & Agent Guide

Welcome to the SuperAgent repository (`AgentApp`). This document defines the engineering standards, operational constraints, build instructions, and testing workflows for AI coding agents and human contributors working on this monorepo.

---

## 1. Explicit Don'ts (86% benchmark)

Clear operational boundaries for what you must **NEVER** do in this repository:

- 🚫 **NEVER touch or modify `legacy/`**: The `legacy/` directory (`legacy/core`) is the retired, deprecated TypeScript core kept solely for historical reference. The active, production intelligence engine is **`packages/core_v2`** (pure Rust). Any edits in `legacy/` are strictly forbidden and will be rejected.
- 🚫 **NEVER commit directly to `main`, `master`, or `release`**: All work must occur on dedicated feature/fix branches and merge via pull requests. Direct pushes to release branches are blocked.
- 🚫 **NEVER commit secrets, credentials, or private API keys**: Never hardcode, stage, or commit API keys (OpenAI, Anthropic, Gemini, Groq, DeepSeek, OpenRouter, Telegram bot tokens), private keys, session tokens, or local credentials (`auth.json`, `.env`). Always check your git diff before staging.
- 🚫 **NEVER introduce explicit `any` types in TypeScript**: In `@superagent/ui`, `@superagent/desktop`, and `@superagent/browser-extension`, write explicit interfaces, types, or generics. Maintain strict TypeScript compliance (`noImplicitAny`).
- 🚫 **NEVER perform broad formatting sweeps across untouched files**: Keep PR diffs tight and focused on the functional change. Do not run mass reformatters, newline normalizers, or prettier passes on code you did not change.
- 🚫 **NEVER break the Core-to-UI IPC / WebSocket protocol silently**: The backend daemon (`packages/core_v2`) and frontend surfaces (`@superagent/ui`, `@superagent/desktop`, `@superagent/browser-extension`) communicate via WebSocket and JSON-RPC (`/ws` at port `1469`). Never change event names or payload structures without updating all client consumers in lockstep.
- 🚫 **NEVER disable or weaken security/auth guards**: The `AuthStore` in `packages/core_v2` enforces scrypt-hashed password authentication, constant-time validation, and signed session cookies. Do not disable authentication checks, remove CSRF protections, or permit unauthorized route access in production code.
- 🚫 **NEVER delete or alter copyright and attribution notices**: SuperAgent is licensed under Apache 2.0 / GPL-3.0. Preserving attribution in `NOTICE` and license headers is mandatory per License Section 4(d).

---

## 2. Commit and PR Conventions (79% benchmark)

### Branch Naming Conventions
Always prefix your branches based on the nature of the change:
- `feat/<feature-name>` or `feature/<feature-name>`: New capabilities or enhancements.
- `fix/<bug-description>`: Bug fixes and issue patches.
- `refactor/<scope>`: Code restructuring without behavior alteration.
- `chore/<task>`: Dependency updates, CI/workflow adjustments, tooling.
- `docs/<topic>`: Documentation improvements and guides.
- `auto/<timestamp>-<skill>`: Dedicated branches for automated agent improvement loops.

### Commit Message Conventions
Commits **must** adhere strictly to the [Conventional Commits](https://www.conventionalcommits.org/) specification:
```
<type>(<optional-scope>): <short description in present tense, lowercase>

[optional body explaining what and why]

[optional footer(s), e.g., Closes #123]
```

**Allowed Types:**
- `feat`: A new user-facing or architectural feature
- `fix`: A bug fix
- `refactor`: Code changes that neither fix bugs nor add features
- `test`: Adding missing tests or correcting existing tests
- `docs`: Documentation only changes
- `chore`: Build process, repository scripts, or auxiliary tool changes
- `style`: Formatting changes that do not affect the meaning of code

*Examples:*
- `feat(core_v2): add dynamic hardware fallback for video processing`
- `fix(ui): prevent ComposerBar scroll overflow on mobile viewports`
- `test(core_v2): add unit tests for workspace lock staleness`

### Pull Request (PR) Requirements
1. **Single Responsibility**: One logical change per PR. Avoid bundling unrelated fixes.
2. **Descriptive PR Details**: Include a clear summary of what changed, why the change was made, and how it was verified locally.
3. **Sign the CLA**: All first-time contributors must sign the Contributor License Agreement (the CLA bot will comment automatically on your PR).
4. **Target Branch**: Standard PRs target `main`. Autonomous agent runs target `agent-development`.
5. **Mandatory Human Review**: Nothing merges to `main` without manual maintainer review and sign-off.

---

## 3. How to Run the Tests (74% benchmark)

Execute the full monorepo test suite across all Rust crates and TypeScript workspaces with a single command from the repository root:

```bash
npm test
```

> 💡 This top-level command runs the following sequence across all packages:
> `npm run test:core && npm run test:ui && npm run test:desktop && npm run test:cli && npm run test:ext`

### Running Tests by Package / Workspace

| Package / Domain | Language | Test Runner | Command |
| :--- | :--- | :--- | :--- |
| **Full Monorepo** | Rust + TS | Cargo + Vitest | `npm test` |
| **Core Engine** (`packages/core_v2`) | Rust | Cargo | `npm run test:core`<br>_or_ `cargo test -p superagent-core-v2` |
| **UI Components** (`packages/ui`) | TypeScript | Vitest | `npm run test:ui`<br>_or_ `npm test --workspace=@superagent/ui` |
| **Desktop Shell** (`packages/desktop`) | TypeScript | Vitest | `npm run test:desktop`<br>_or_ `npm test --workspace=@superagent/desktop` |
| **CLI & TUI** (`packages/cli`) | Rust | Cargo | `npm run test:cli`<br>_or_ `cargo test -p superagent-cli` |
| **Browser Extension** (`packages/browser-extension`) | TypeScript | Vitest | `npm run test:ext`<br>_or_ `npm test --workspace=@superagent/browser-extension` |

---

## 4. Code and Lint Commands (73% benchmark)

### Rust (Engine, CLI, Native Overlays)
- **Fast Syntax & Type Check across all crates**:
  ```bash
  cargo check --workspace
  # or
  npm run check:rust
  ```
- **Check code formatting**:
  ```bash
  cargo fmt -- --check
  ```
- **Automatically apply formatting fixes**:
  ```bash
  cargo fmt
  ```
- **Run Clippy linter (static analysis)**:
  ```bash
  cargo clippy --workspace --all-targets -- -D warnings
  ```

### TypeScript & Frontend (`packages/ui`, `packages/desktop`, `packages/browser-extension`)
- **Type Check UI package**:
  ```bash
  npm run build:tsc --workspace=@superagent/ui
  ```
- **Type Check Browser Extension**:
  ```bash
  npx tsc -p packages/browser-extension/tsconfig.json --noEmit
  ```
- **Bundle UI with esbuild & Tailwind v4**:
  ```bash
  npm run build:ui
  ```
- **Bundle Browser Extension with Vite**:
  ```bash
  npm run build:ext
  ```
- **Run Vitest in Interactive Watch Mode**:
  ```bash
  npx vitest --project packages/ui
  ```

---

## 5. Checks Before a PR (64% benchmark)

Before opening any pull request or declaring a task complete, you **MUST** execute and pass every single check in this list:

- [ ] **1. Rust Workspace Check**: `cargo check --workspace` completes with zero errors.
- [ ] **2. Full Test Suite**: `npm test` passes 100% (all Rust unit tests and TypeScript Vitest specs pass).
- [ ] **3. Rust Formatting**: `cargo fmt -- --check` reports zero formatting violations.
- [ ] **4. Clippy Linting**: `cargo clippy --workspace` reports zero blocking warnings.
- [ ] **5. UI Bundle Build**: `npm run build:ui` succeeds without bundling errors.
- [ ] **6. Extension Build**: `npm run build:ext` compiles cleanly.
- [ ] **7. Full Monorepo Build**: `npm run build` succeeds end-to-end.
- [ ] **8. Clean Diff Audit**:
  - Run `git status` and `git diff` to confirm no unwanted files, debug artifacts, or temporary files are staged.
  - Confirm no files under `legacy/` were edited.
  - Confirm no API keys, secrets, or credential tokens were introduced.
- [ ] **9. Commit Format**: All commit messages follow Conventional Commits standard (`feat:`, `fix:`, etc.).

---

## 6. Build and Setup Commands (62% benchmark)

### Prerequisites
- **Node.js**: `v18` or higher (`v20+` strongly recommended)
- **npm**: `v9` or higher
- **Rust Toolchain**: Stable Rust with `rustfmt` and `clippy` components:
  ```bash
  rustup update stable
  rustup component add rustfmt clippy
  ```
- **Linux System Dependencies** (Ubuntu / Debian):
  ```bash
  sudo apt-get update && sudo apt-get install -y --no-install-recommends \
    libasound2-dev libdbus-1-dev libwebkit2gtk-4.1-dev build-essential \
    curl wget file libxdo-dev libssl-dev libayatana-appindicator3-dev librsvg2-dev
  ```

### Step-by-Step Setup from Scratch
```bash
# 1. Clone repository
git clone https://github.com/Aninda7479/AgentApp.git
cd AgentApp

# 2. Install all dependencies (workspaces + website)
npm run install:all
# (or: npm install)

# 3. Build all workspace packages
npm run build
```

### Local Development Commands

| Target | Command | Description |
| :--- | :--- | :--- |
| **Web UI + Core Daemon** | `npm run dev:web` | Live UI esbuild watch + Core daemon on port 1469 |
| **Desktop App** | `npm run dev:app` | Tauri v2 desktop application in development mode |
| **Combined Web & App** | `npm run dev` | Concurrently launches Web UI, Core daemon, and Desktop |
| **Terminal CLI** | `npm run dev:cli` | Runs `superagent-cli` via Cargo |
| **Browser Extension** | `npm run dev:ext` | Vite watch build for Chrome / Edge unpacked extension |
| **Core Daemon Only** | `npm run dev:core` | Runs Rust HTTP/WS daemon directly on port 1469 |
| **Marketing Website** | `npm run dev:site` | Vite dev server for `website/` |

### Environment Variables
Environment variables can be provided inline or in your shell environment (no `.env` is committed):
- `PORT`: HTTP/WebSocket daemon port (default: `1469`).
- `HOST`: Bind address (`0.0.0.0` by default; set `127.0.0.1` for local-only).
- `SUPERAGENT_PASSWORD`: Seed password for web/VPS admin login on first boot.
- `SUPERAGENT_DISABLE_AUTH=true`: Disables login enforcement for headless local testing.
- `RUST_LOG=info` / `RUST_LOG=debug`: Controls Rust log verbosity for daemon and CLI.
- `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GEMINI_API_KEY`, `GROQ_API_KEY`, `DEEPSEEK_API_KEY`: API provider keys (can also be saved securely via the UI/CLI settings store).

---

## 7. Project Structure Map (51% benchmark)

```
AgentApp/
├── Cargo.toml                    # Root Rust workspace configuration (resolver = "2")
├── package.json                  # Root npm monorepo configuration (npm workspaces)
├── packages/
│   ├── core_v2/                  # [ACTIVE] Pure Rust Agent Intelligence Engine & Daemon
│   │   ├── Cargo.toml            # Package manifest for superagent-core-v2 & daemon
│   │   └── src/
│   │       ├── main.rs           # Daemon binary entrypoint (superagent-core-daemon)
│   │       ├── lib.rs            # Library exports
│   │       ├── orchestrator/     # Autonomous agent loop, planning, and task execution
│   │       ├── providers/        # LLM clients (OpenAI, Anthropic, Gemini, Groq, etc.)
│   │       ├── mcp/              # Model Context Protocol (MCP) client implementation
│   │       ├── tools/            # Built-in agent tools (file_ops, shell, browser, etc.)
│   │       ├── memory/           # Persistent context, session memory, and compaction
│   │       ├── server/           # Axum HTTP server & WebSocket (/ws) communication
│   │       ├── storage/          # Settings, auth (scrypt), lock, and chat stores
│   │       ├── image_workspace/  # Image processing, generations, and prompt pipelines
│   │       └── video_workspace/  # Video generation, FFmpeg bindings, and models
│   ├── ui/                       # [ACTIVE] Shared React 18 UI across Desktop and Web
│   │   ├── package.json          # @superagent/ui package manifest
│   │   ├── src/                  # React components, pages, hooks, state stores
│   │   ├── models/               # VRM 3D companion models and animations
│   │   └── scripts/build-ui.mjs  # esbuild + Tailwind CSS v4 compiler script
│   ├── desktop/                  # [ACTIVE] Tauri v2 desktop host wrapper
│   │   ├── package.json          # @superagent/desktop package manifest
│   │   └── src-tauri/            # Rust native shell, tray icon, OS windows, shortcuts
│   ├── cli/                      # [ACTIVE] Pure Rust Terminal TUI & CLI
│   │   ├── Cargo.toml            # superagent-cli package manifest
│   │   └── src/                  # Ratatui TUI application and Clap CLI commands
│   ├── browser-extension/        # [ACTIVE] Manifest V3 Extension (Chrome / Edge / Brave)
│   │   ├── package.json          # @superagent/browser-extension package manifest
│   │   ├── src/                  # Background service worker, popup, and sidepanel
│   │   └── test/                 # Vitest test suite for extension
│   ├── circle-search-native/     # Native Rust overlay for circle-to-search (egui/eframe)
│   └── dictation-native/         # Native Rust overlay for global voice dictation (egui/cpal)
├── website/                      # Official marketing and docs site (Vite + React Router)
├── docs/                         # Developer architecture and installation guides
├── scripts/                      # Version-bumping, updater JSON, and release notes scripts
├── .github/
│   └── workflows/                # CI cross-platform matrix, PR auto-loop, releases
└── legacy/                       # [DEPRECATED] Archived TypeScript core (DO NOT MODIFY)
```

---

## 8. How to Run a Single Test (47% benchmark)

Targeting specific tests saves considerable time when debugging or developing features.

### A. Targeting a Single Rust Test (`packages/core_v2` or `packages/cli`)
Cargo matches test names using substring filters:

- **Run a single test function in Core**:
  ```bash
  cargo test -p superagent-core-v2 test_lock_staleness
  ```
- **Run all tests in a specific module**:
  ```bash
  cargo test -p superagent-core-v2 storage::lock::tests
  cargo test -p superagent-core-v2 tools::builtin::file_ops
  ```
- **Run a test with standard output displayed (`println!`, logs)**:
  ```bash
  cargo test -p superagent-core-v2 test_lock_staleness -- --nocapture
  ```
- **Run a single test in the CLI crate**:
  ```bash
  cargo test -p superagent-cli <test_function_name>
  ```

### B. Targeting a Single TypeScript / Vitest Test

- **Run an individual test file in UI (`@superagent/ui`)**:
  ```bash
  npm test --workspace=@superagent/ui -- src/renderer/components/focus-ring.test.ts
  ```
  _or directly via Vitest:_
  ```bash
  npx vitest run packages/ui/src/renderer/components/focus-ring.test.ts
  ```
- **Run a specific test case by name pattern (`-t`)**:
  ```bash
  npm test --workspace=@superagent/ui -- -t "focus ring classes"
  ```
- **Run an individual test file in Desktop (`@superagent/desktop`)**:
  ```bash
  npm test --workspace=@superagent/desktop -- src/App.test.tsx
  ```
- **Run an individual test file in Browser Extension (`@superagent/browser-extension`)**:
  ```bash
  npm test --workspace=@superagent/browser-extension -- test/markdown.test.ts
  ```
- **Run Vitest in watch mode on a single file while iterating**:
  ```bash
  npx vitest packages/ui/src/renderer/components/focus-ring.test.ts
  ```
