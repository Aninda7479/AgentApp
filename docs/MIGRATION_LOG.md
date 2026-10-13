# Migration Memory Log: Dedicated Native UIs Architecture

This document is the persistent memory ledger for the end-to-end migration of SuperAgent from a single bundled UI to separate dedicated native UIs (Web, macOS, Windows, Linux, CLI) and decoupled `core_v2` daemon.

> **Rule for Agents & Subagents**:
> 1. Before beginning any task, update your phase status to `IN_PROGRESS` with your subagent ID, timestamp, and intended actions.
> 2. Whenever you complete a milestone or run tests, record the checkpoint and output in this file.
> 3. If an agent is stopped, restarted, or crashes, the next agent must read this file first and resume from the latest checkpoint.

---

## 1. High-Level Phase Tracker

| Phase | Description | Target Surface | Lead Role / Subagent | Status | Git Commit |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Phase 1** | Core v2 Hardening & Canonical Wire Protocol | `packages/core_v2` | Core Specialist | `COMPLETED` | `feat(core_v2): establish canonical protocol module and session-scoped ws subscriptions` |
| **Phase 2** | Web Client Decoupling & Overlay Port Auto-Discovery | `clients/web`, `dictation-native`, `artifacts-native` | Web & Overlay Specialist | `COMPLETED` | `feat(web,overlays): decouple web client and add dynamic overlay port auto-discovery` |
| **Phase 3** | Linux Dedicated UI (GTK4 + Libadwaita) | `clients/linux` | Linux Specialist | `COMPLETED` | `feat(linux): implement dedicated linux client with gtk4, libadwaita and daemon client` |
| **Phase 4** | macOS Dedicated UI (SwiftUI Native) | `clients/macos` | macOS Specialist | `NOT_STARTED` | - |
| **Phase 5** | Windows Dedicated UI (WinUI 3 Native) | `clients/windows` | Windows Specialist | `NOT_STARTED` | - |
| **Phase 6** | End-to-End Verification & Documentation | Monorepo | Integration Coordinator | `NOT_STARTED` | - |

---

## 2. Phase Execution Details & Checkpoints

### Phase 1: Core v2 Hardening & Canonical Wire Protocol
* **Objective**:
  1. Create `packages/core_v2/src/protocol/`:
     - `commands.rs`: String constants for all IPC channels (eliminates stringly-typed channel drift).
     - `events.rs`: Strongly typed `AgentStreamEvent`, `WireMessage`, and system events.
     - `dtos.rs`: Strongly typed request/response payload structs.
  2. Decouple UI serving from `core_v2` server:
     - Ensure headless mode operation when no UI is mounted.
  3. Upgrade WebSocket hub (`packages/core_v2/src/server/ws.rs`):
     - Support session-filtered subscriptions for minimal latency and bandwidth.
  4. Ensure all existing tests pass (`cargo check -p superagent-core-v2`, `cargo test -p superagent-core-v2`).
* **Status**: `COMPLETED`
* **Checkpoints**:
  - [x] Protocol module created (`commands.rs`, `events.rs`, `dtos.rs`) and exported in `lib.rs`
  - [x] SPA serving decoupled and verified with fallback 404 handling in test
  - [x] WebSocket hub upgraded with session subscription handling (`SUBSCRIBE_SESSION`, `UNSUBSCRIBE_SESSION`, filtered session forwarding)
  - [x] Core compilation and unit tests passing (14 server tests, 8 protocol unit tests, cargo fmt clean)
  - [x] Git commit created: `feat(core_v2): establish canonical protocol module and session-scoped ws subscriptions`

---

### Phase 2: Web Client Decoupling & Overlay Port Auto-Discovery
* **Objective**:
  1. Create `clients/web/` workspace package representing the pure browser client (derived from existing React UI, clean fetch/WS IPC).
  2. Update `packages/dictation-native` and `packages/artifacts-native` to read `~/.superagent/web-server.lock` to dynamically detect daemon port instead of hardcoding `1469`.
* **Status**: `COMPLETED`
* **Checkpoints**:
  - [x] Dictation overlay port discovery implemented (`SUPERAGENT_PORT` -> `web-server.lock` candidates -> fallback `1469`) and verified with unit test
  - [x] Artifacts overlay port discovery implemented across all 5 IPC endpoints (`artifact:list`, `artifact:start`, `artifact:stop`, `artifact:delete`, `artifact:toggleAutostart`) and verified with unit test
  - [x] Web client scaffolded under `clients/web/` (`@superagent/web-client`) with standalone browser entry (`index.html`, `main.tsx`), client configuration (`config.ts`), DaemonClient HTTP/WS protocol bridge (`client.ts`), and React UI (`App.tsx`)
  - [x] Added `"clients/web"` to root `package.json` workspaces, added `build:web` and `test:web`
  - [x] Web client builds cleanly (`npm run build:web`) and unit tests pass (`npm run test:web`)
  - [x] Rust workspace compiles cleanly (`cargo check --workspace`) and passes code formatting check (`cargo fmt -- --check`)
  - [x] Verification completed for Phase 2 commit: `feat(web,overlays): decouple web client and add dynamic overlay port auto-discovery`

---

### Phase 3: Linux Dedicated UI (GTK4 + Libadwaita)
* **Objective**:
  1. Scaffold `clients/linux/` Rust workspace package (`superagent-linux-client`).
  2. Implement native GTK4 / Libadwaita application with `AdwApplicationWindow`, `AdwHeaderBar`, `NavigationSplitView`, chat list, and composer.
  3. Implement high-performance `DaemonClient` communicating with `core_v2` over HTTP IPC and full-duplex WebSocket streaming using canonical `superagent_core_v2::protocol`.
* **Status**: `COMPLETED`
* **Checkpoints**:
  - [x] `clients/linux/Cargo.toml` and directory structure created with Linux target dependencies (`gtk4`, `libadwaita`, `glib`)
  - [x] High-performance `DaemonClient` implemented with full-duplex WebSocket streaming, session subscription management (`SUBSCRIBE_SESSION`, `UNSUBSCRIBE_SESSION`, `SYNC_SESSION`), ping/pong heartbeats, and HTTP IPC invocation
  - [x] Reactive `AppState` implemented managing sessions, active chat messages, streaming thought/token buffers, and connection lifecycle
  - [x] Main window with `AdwApplicationWindow`, `AdwHeaderBar`, `NavigationSplitView`, chat message list view, and composer implemented with cross-platform fallback stubs
  - [x] CLI entrypoint in `main.rs` with `--port`, `--server`, `--token`, and `--headless` modes
  - [x] Added `"clients/linux"` to root `Cargo.toml` workspace members
  - [x] Unit test suite implemented and passing (12/12 unit tests passing in `superagent-linux-client`)
  - [x] Compilation and formatting verified (`cargo check -p superagent-linux-client`, `cargo check --workspace`, `cargo clippy --package superagent-linux-client --no-deps`, `cargo fmt -- --check` all passing)

---

### Phase 4: macOS Dedicated UI (SwiftUI Native)
* **Objective**:
  1. Scaffold `clients/macos/` native SwiftUI project structure.
  2. Implement `DaemonClient.swift` with URLSession HTTP/2 and WebSocket streaming.
  3. Implement Codable protocol structs matching `core_v2/src/protocol/`.
  4. Build SwiftUI Chat, Settings, and navigation views with native macOS styling.
* **Status**: `NOT_STARTED`
* **Checkpoints**:
  - [ ] Project directory & Swift package / Xcode spec created
  - [ ] Swift models and URLSession client implemented
  - [ ] SwiftUI views with native macOS toolbar and split navigation
  - [ ] Git commit created

---

### Phase 5: Windows Dedicated UI (WinUI 3 Native)
* **Objective**:
  1. Scaffold `clients/windows/` WinUI 3 project structure.
  2. Implement `DaemonClient.cs` using `HttpClient` and `ClientWebSocket`.
  3. Implement C# record models matching `core_v2/src/protocol/`.
  4. Build WinUI 3 NavigationView with Mica effect and Fluent styling.
* **Status**: `NOT_STARTED`
* **Checkpoints**:
  - [ ] Project directory & `.csproj` / solution structure created
  - [ ] C# DaemonClient and protocol records implemented
  - [ ] WinUI 3 XAML views and viewmodels created
  - [ ] Git commit created

---

## 3. Active Incident / Recovery Notes
* **Restart Recovery**: If an agent resumes mid-flight, check which phase checkpoint was last checked above. Continue strictly from that unchecked item.
