# SuperAgent macOS Dedicated UI (SwiftUI Native)

A high-performance, native macOS client for SuperAgent built with pure SwiftUI, Combine, and URLSession HTTP/2 & WebSocket streaming. Communicates directly with the decoupled `superagent-core-daemon` (`core_v2`) over local IPC.

---

## 1. Architecture Overview

The dedicated macOS client replaces bundled electron/web shells with a 100% native AppKit & SwiftUI user interface:

```
┌────────────────────────────────────────────────────────┐
│                   SuperAgentApp                        │
│         (Native macOS Menu Bar, Commands, Settings)     │
└───────────────────────────┬────────────────────────────┘
                            │
┌───────────────────────────▼────────────────────────────┐
│                    NavigationSplitView                 │
│   ┌─────────────────────────┬────────────────────────┐ │
│   │   SidebarView           │   DetailChatView       │ │
│   │   • Session Search      │   • Message Bubbles    │ │
│   │   • New Chat (⌘N)       │   • Thought Disclosure │ │
│   │   • Chat History List   │   • Streaming Tokens   │ │
│   │   • Daemon Port Pill    │   • ComposerBar        │ │
│   └─────────────────────────┴────────────────────────┘ │
└───────────────────────────┬────────────────────────────┘
                            │
┌───────────────────────────▼────────────────────────────┐
│                  AppState (@MainActor)                 │
│         Reactive State Store & Event Dispatcher        │
└───────────────────────────┬────────────────────────────┘
                            │
┌───────────────────────────▼────────────────────────────┐
│                      DaemonClient                      │
│   • URLSession HTTP/2:  /api/ipc/:channel               │
│   • WebSocket Client:   /ws (Heartbeat & Subscriptions) │
│   • Port Discovery:     SUPERAGENT_PORT / Lockfile     │
└───────────────────────────┬────────────────────────────┘
                            │ Local Loopback (Port 1469)
┌───────────────────────────▼────────────────────────────┐
│                superagent-core-daemon (Rust)           │
└────────────────────────────────────────────────────────┘
```

---

## 2. Key Features

- **Native macOS Design**: Built with `NavigationSplitView`, unified toolbar styling, native sidebar search, and SF Symbols.
- **Full-Duplex Streaming**: Real-time token streaming, live collapsible thought process cards (`DisclosureGroup`), and tool invocation telemetry.
- **Session-Filtered Subscriptions**: Uses `SUBSCRIBE_SESSION`, `UNSUBSCRIBE_SESSION`, and `SYNC_SESSION` over WebSocket for minimal bandwidth and instantaneous session switching.
- **Automatic Daemon Discovery**: Discovers running Core v2 daemon port automatically from:
  1. `SUPERAGENT_PORT` environment variable.
  2. `~/.superagent/web-server.lock` or `~/.superagent/runtime/web-server.lock`.
  3. Default fallback to port `1469`.
- **Automatic Reconnection**: Exponential backoff with jitter and automated session resubscription.
- **Menu Bar & Keyboard Shortcuts**:
  - `⌘N`: New Chat
  - `⌘K`: Search / Command Palette
  - `⌘.`: Stop Generation
  - `⌘⇧R`: Reconnect Daemon
  - `⌘,`: Native macOS Settings Window

---

## 3. Project Structure

```
clients/macos/
├── Package.swift                    # Swift Package Manager manifest (macOS v13+)
├── Makefile                         # Build, test, run, and Xcode shortcuts
├── README.md                        # Documentation
├── Sources/
│   └── SuperAgent/
│       ├── App.swift                # @main application entrypoint & menu commands
│       ├── Core/
│       │   ├── Protocol.swift       # Canonical constants, Codable events, and DTOs
│       │   ├── DaemonClient.swift   # URLSession HTTP/2 & WebSocket client
│       │   └── AppState.swift       # Reactive @MainActor application state
│       └── Views/
│           ├── ContentView.swift    # NavigationSplitView & detail chat feed
│           ├── ComposerBar.swift    # Text editor, model picker, and send/stop
│           └── SettingsView.swift   # Multi-tab macOS Settings scene
└── Tests/
    └── SuperAgentTests/
        └── ProtocolTests.swift      # XCTest test suite for wire protocol & events
```

---

## 4. Prerequisites

- **macOS**: macOS 13.0 (Ventura) or later (macOS 14+ Sonoma recommended).
- **Xcode / Swift**: Xcode 14.3+ with Swift 5.8 or higher.
- **SuperAgent Daemon**: `superagent-core-daemon` running locally (`cargo run -p superagent-core-v2 --bin superagent-core-daemon`).

---

## 5. Build and Test Instructions

### Using Make

```bash
# Compile the Swift package
make build

# Run the complete unit test suite
make test

# Launch the native macOS application
make run

# Open the project in Xcode
make xcode

# Clean build artifacts
make clean
```

### Using SwiftPM Directly

```bash
# Build
swift build

# Run tests
swift test

# Run application
swift run SuperAgent
```

---

## 6. Canonical Wire Protocol Verification

All Swift models in `Protocol.swift` strictly adhere to the contracts defined in `packages/core_v2/src/protocol/`:
- `commands.rs`: Shared channel strings (`agent-run`, `agent-stop`, `settings-read`, etc.).
- `events.rs`: Canonical `AgentStreamEvent` (`start_turn`, `token`, `thought`, `tool_call`, `tool_result`, `step_complete`, `done`, `error`, `abort`).
- `dtos.rs`: Request/response envelopes (`IpcRequestEnvelope<T>`, `IpcResponseEnvelope<T>`) and session control payloads (`SubscribeSessionRequest`, `SyncSessionRequest`).
