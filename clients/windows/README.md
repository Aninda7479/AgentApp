# SuperAgent Windows Dedicated UI (WinUI 3 Native)

A high-performance, native Windows 11/10 client for SuperAgent built with pure **WinUI 3 (Windows App SDK 1.5+)**, **C# 12 / .NET 8**, and **CommunityToolkit.Mvvm**. Communicates directly with the decoupled `superagent-core-daemon` (`core_v2`) over local loopback HTTP IPC and full-duplex WebSocket streaming.

---

## 1. Architecture Overview

The dedicated Windows client replaces bundled web shells with a 100% native Windows App SDK and WinUI 3 user interface:

```
┌────────────────────────────────────────────────────────┐
│                      SuperAgent                        │
│            WinUI 3 Native App (Windows 11 Mica)         │
└───────────────────────────┬────────────────────────────┘
                            │
┌───────────────────────────▼────────────────────────────┐
│                     MainWindow                         │
│   ┌─────────────────────────┬────────────────────────┐ │
│   │   NavigationView        │   Detail Chat View     │ │
│   │   • "+ New Chat" Button │   • User/Assistant     │ │
│   │   • Search Sessions     │     Bubble Templates   │ │
│   │   • Sessions ListView   │   • Thought Expander   │ │
│   │   • Daemon Port Pill    │   • Active Tool Badge  │ │
│   │   • Settings Navigation │   • Live Token Stream  │ │
│   │                         │   • ComposerBar        │ │
│   └─────────────────────────┴────────────────────────┘ │
└───────────────────────────┬────────────────────────────┘
                            │
┌───────────────────────────▼────────────────────────────┐
│                    MainViewModel                       │
│       CommunityToolkit.Mvvm Reactive State Store       │
└───────────────────────────┬────────────────────────────┘
                            │
┌───────────────────────────▼────────────────────────────┐
│                    DaemonClient                        │
│   • HttpClient:        /api/ipc/:channel (IPC Envelopes)│
│   • ClientWebSocket:   /ws (Heartbeat & Subscriptions) │
│   • Port Discovery:    SUPERAGENT_PORT / Lockfile      │
└───────────────────────────┬────────────────────────────┘
                            │ Local Loopback (Port 1469)
┌───────────────────────────▼────────────────────────────┐
│             superagent-core-daemon (Rust)              │
└────────────────────────────────────────────────────────┘
```

---

## 2. Key Features

- **Windows 11 Native Mica & Fluent Styling**: Deep OS integration utilizing `MicaBackdrop`, rounded corners, system accent colors, and official Fluent iconography.
- **Full-Duplex Streaming**: Real-time token streaming, live collapsible thought process cards (`Expander`), and animated tool execution indicators.
- **Session-Filtered Subscriptions**: Uses `SUBSCRIBE_SESSION`, `UNSUBSCRIBE_SESSION`, and `SYNC_SESSION` over WebSocket for minimal bandwidth and instantaneous session switching.
- **Automatic Daemon Discovery**: Discovers running Core v2 daemon port automatically from:
  1. `SUPERAGENT_PORT` environment variable.
  2. `~/.superagent/web-server.lock` or `~/.superagent/runtime/web-server.lock`.
  3. Default fallback to port `1469`.
- **Automatic Reconnection & Recovery**: Exponential backoff with jitter and automated session resubscription.
- **Fluent Settings Interface**: Configure local server host/port, API tokens, model provider keys (Anthropic, OpenAI, Gemini, Ollama), and preferences.

---

## 3. Project Structure

```
clients/windows/
├── SuperAgent.sln                   # Visual Studio 2022 / dotnet solution
├── README.md                        # Documentation
├── SuperAgent/
│   ├── SuperAgent.csproj            # WinUI 3 / WindowsAppSDK 1.5+ project manifest
│   ├── app.manifest                 # High-DPI PerMonitorV2 manifest
│   ├── App.xaml                     # Application resource dictionary & styles
│   ├── App.xaml.cs                  # Application lifecycle entrypoint
│   ├── MainWindow.xaml              # WinUI 3 MainWindow with Mica and NavigationView
│   ├── MainWindow.xaml.cs           # Main window codebehind and event handling
│   ├── Core/
│   │   ├── Protocol.cs              # Canonical commands, polymorphic events, and DTOs
│   │   └── DaemonClient.cs          # HttpClient and ClientWebSocket IPC client
│   ├── ViewModels/
│   │   └── MainViewModel.cs         # CommunityToolkit.Mvvm state and RelayCommands
│   ├── Views/
│   │   ├── SettingsPage.xaml        # Fluent settings page UI
│   │   └── SettingsPage.xaml.cs     # Settings page codebehind
│   └── Converters/
│       └── ValueConverters.cs       # XAML binding converters (Visibility, status colors)
└── SuperAgent.Tests/
    ├── SuperAgent.Tests.csproj      # xUnit test project manifest
    └── ProtocolTests.cs             # Unit tests verifying roundtrip wire serialization
```

---

## 4. Prerequisites

- **Operating System**: Windows 10 (version 1809+, build 17763) or Windows 11 (build 22000+).
- **.NET SDK**: .NET 8.0 SDK or higher (`dotnet --version`).
- **SuperAgent Daemon**: `superagent-core-daemon` running locally (`cargo run -p superagent-core-v2 --bin superagent-core-daemon`).

---

## 5. Build and Test Instructions

### Run Unit Tests

Execute the automated protocol serialization and daemon client tests using the .NET CLI:

```powershell
dotnet test clients/windows/SuperAgent.Tests/SuperAgent.Tests.csproj
```

### Build Solution

Build the complete solution using `dotnet build`:

```powershell
dotnet build clients/windows/SuperAgent.sln
```

### Run Windows Client

Run the client unpackaged:

```powershell
dotnet run --project clients/windows/SuperAgent/SuperAgent.csproj
```

---

## 6. Canonical Wire Protocol Verification

All C# models in `Protocol.cs` strictly adhere to the contracts defined in `packages/core_v2/src/protocol/`:
- `commands.rs`: Shared channel strings (`agent-run`, `agent-stop`, `settings-read`, `session-sync`, etc.).
- `events.rs`: Canonical `AgentStreamEvent` polymorphic hierarchy (`start_turn`, `token`, `thought`, `tool_call`, `tool_result`, `step_complete`, `done`, `error`, `abort`).
- `dtos.rs`: Request/response envelopes (`IpcRequestEnvelope<T>`, `IpcResponseEnvelope<T>`) and session control payloads (`SubscribeSessionRequest`, `SyncSessionRequest`).
