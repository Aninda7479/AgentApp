# SuperAgent UI Specification & Behavioral Guide
## Canonical Blueprint for Dedicated Native UIs (Web, macOS, Windows, Linux)

> **Purpose:** This document is the complete, self-contained functional and behavioral specification of SuperAgent's UI. It captures all UX patterns, states, data models, edge cases, micro-interactions, keyboard shortcuts, and network contracts from the React web application (`packages/ui`).
> **Goal:** Developers and AI coding agents building native frontends (SwiftUI on macOS, WinUI 3 on Windows, GTK4 on Linux, Web PWA) should use this document as the single source of truth without needing to consult the legacy React codebase.

---

## Table of Contents
1. [Visual Design System & Theming](#1-visual-design-system--theming)
2. [Shell & Window Architecture](#2-shell--window-architecture)
3. [Agent Workspace & Chat Feed (`WorkspaceStage`)](#3-agent-workspace--chat-feed-workspacestage)
4. [Prompt Composer & Input Controls (`ComposerBar`)](#4-prompt-composer--input-controls-composerbar)
5. [Interactive Question & Quiz Tool (`InteractiveQuestionComposer`)](#5-interactive-question--quiz-tool-interactivequestioncomposer)
6. [Image Generation Workspace (`ImageWorkspacePage`)](#6-image-generation-workspace-imageworkspacepage)
7. [Video Generation Workspace (`VideoWorkspacePage`)](#7-video-generation-workspace-videoworkspacepage)
8. [3D Studio Workspace (`ThreeDStudio`)](#8-3d-studio-workspace-theedstudio)
9. [Artifacts Runtime & Inspector (`ArtifactsPage`)](#9-artifacts-runtime--inspector-artifactspage)
10. [Tasks & Scheduled Routines (`TasksPage`)](#10-tasks--scheduled-routines-taskspage)
11. [Companion & 3D Pet (`PartnerPage`)](#11-companion--3d-pet-partnerpage)
12. [Settings, Auth & Diagnostics (`SettingsView`)](#12-settings-auth--diagnostics-settingsview)
13. [Global Modals & Overlays](#13-global-modals--overlays)
14. [IPC, WebSocket & State Synchronization Protocol](#14-ipc-websocket--state-synchronization-protocol)
15. [Behavioral Edge Cases & Performance Rules](#15-behavioral-edge-cases--performance-rules)

---

## 1. Visual Design System & Theming

### 1.1 Color Palette & Semantic Tokens
SuperAgent uses a dark-first cyberpunk-minimal aesthetic with neon accents:

| Token Name | Hex / Value (Dark) | Hex / Value (Light) | Purpose |
| :--- | :--- | :--- | :--- |
| `--brand-bg` | `#090d16` (Deep Navy Black) | `#f8fafc` | Application canvas background |
| `--brand-inner-bg` | `#0f172a` (Slate 900) | `#ffffff` | Panel & card containers |
| `--brand-card` | `#1e293b` (Slate 800) | `#f1f5f9` | Elevated surfaces & active items |
| `--brand-border` | `#334155` / `rgba(255,255,255,0.08)` | `#cbd5e1` | Subtle container borders |
| `--brand-text-main`| `#f8fafc` (Near White) | `#0f172a` | Primary headings, message text |
| `--brand-text-muted`| `#94a3b8` (Slate 400) | `#64748b` | Timestamps, secondary labels |
| `--neon-live` | `#06b6d4` (Cyan 500) | `#0284c7` | Active streaming, agent thinking, live status |
| `--neon-constructive`| `#10b981` (Emerald 500) | `#059669` | Success states, added diff lines (`+N`) |
| `--neon-destructive`| `#ef4444` (Rose 500) | `#dc2626` | Stop buttons, removed diff lines (`-N`), errors |
| `--neon-attention` | `#f59e0b` (Amber 500) | `#d97706` | Context window warnings (>80%), warnings |
| `--brand-highlight` | `#8b5cf6` (Purple 500) | `#7c3aed` | Reasoning thoughts, special tools |

### 1.2 Platform Material Adaptations
- **Windows (WinUI 3)**: Window background must use `MicaBackdrop` (or `DesktopAcrylicBackdrop`). Card containers use subtle Fluent acrylic with 1px border.
- **macOS (SwiftUI)**: Sidebar must use `.background(.ultraThinMaterial)`. Content detail pane uses system background with vibrant controls.
- **Linux (GTK4)**: Use Libadwaita standard dark stylesheet (`AdwStyleManager`) with GNOME system accent color integration.
- **Web**: Tailwind v4 with CSS variables and dark/light toggle in local storage (`sa_theme`).

---

## 2. Shell & Window Architecture

### 2.1 Navigation Layout Structure
```text
+------------------------------------------------------------------------------------+
| TitleBar: Window Controls (OS-specific) | Breadcrumb | Voice Pill | Connection Dot |
+-----------------------+------------------------------------+-----------------------+
| Sidebar (Left)        | Main Content Stage                 | Right Sidebar (Opt.)  |
| - Brand Logo & Name   | - Dynamic Page View:               | - Active Project Info |
| - Primary Nav Items:  |   * Workspace (Chat)               | - Context Usage Gauge |
|   * Workspace         |   * Images                         | - Modified Files List |
|   * Images            |   * Videos                         | - Quick Prompts Deck  |
|   * Videos            |   * 3D Studio                      | - Session Parameters  |
|   * 3D Studio         |   * Artifacts                      |                       |
|   * Artifacts         |   * Tasks                          |                       |
|   * Tasks             |   * Partner                        |                       |
|   * Settings          |   * Settings                       |                       |
| - Session History     |                                    |                       |
| - "+ New Chat" Button |                                    |                       |
+-----------------------+------------------------------------+-----------------------+
| Footer: User Profile / Device Status | Lock Screen Button | Version Pill           |
+------------------------------------------------------------------------------------+
```

### 2.2 Top Navigation Items
The sidebar navigates between distinct workspaces:
1. `trajectory` → **Workspace** (Default): AI coding & multi-turn agent conversation.
2. `images` → **Image Workspace**: Multi-model image generation & inpainting.
3. `videos` → **Video Workspace**: AI text-to-video, FFmpeg workflows.
4. `studio` → **3D Studio**: Text-to-3D, mesh inspection, Gaussian splats.
5. `artifacts` → **Artifacts**: Sandboxed web apps and widgets created by the agent.
6. `tasks` → **Tasks & Routines**: Kanban board and scheduled cron routines.
7. `partner` → **Companion**: Interactive 3D VRM pet / desktop buddy.
8. `settings` → **Settings**: LLM providers, auth, storage, doctor diagnostics.

---

## 3. Agent Workspace & Chat Feed (`WorkspaceStage`)

### 3.1 Session Lifecycle
- **Draft Session**: Opening the app starts in `draft-chat`. No API call is made until the user sends their first message. Sending a message creates a new session ID (`session-<uuid>`), saves it to storage, and activates it.
- **Session Switching**: Switching sessions loads cached steps from RAM (up to 5 resident sessions). If steps are not in memory, the client fetches them asynchronously from the daemon via `/api/conversations/:id` or `chat-steps-read`.
- **Multi-Panel Mode**: On wide screens (>= 1440px), the user can view two chat sessions side-by-side (`activePanels: [chatId1, chatId2]`).

### 3.2 Trajectory Step Data Model
Every turn in a conversation is decomposed into an array of `TrajectoryStep`:
```typescript
interface TrajectoryStep {
  id: string;                                     // Unique step ID (e.g. step-17182910-1)
  type: 'user' | 'assistant' | 'tool_call' | 'tool_result' | 'thought';
  content: string;                                // Message markdown or output text
  timestamp?: string;                             // ISO timestamp
  status?: 'pending' | 'running' | 'success' | 'error';
  toolName?: string;                              // e.g. "run_command", "edit_file"
  metadata?: {
    filename?: string;                            // Edited / read file path
    originalCode?: string;                        // Before edit (for diff viewer)
    modifiedCode?: string;                        // After edit (for diff viewer)
    addedLines?: number;                          // e.g. +14
    removedLines?: number;                        // e.g. -3
    duration?: string;                            // e.g. "4.2s"
    commandLine?: string;                         // Executed shell command
    cwd?: string;                                 // Working directory
    toolInput?: Record<string, unknown>;          // Arguments sent to tool
    [key: string]: unknown;
  };
}
```

### 3.3 Step Rendering Rules

#### 1. User Message (`type: 'user'`)
- Rendered on the right side (or full width with distinct accent border).
- Shows timestamp, copy button, edit button (loads text back into composer), and attachment chips if images/files were attached.

#### 2. Thought Process (`type: 'thought'`)
- Rendered in a collapsible disclosure card with purple accent (`--brand-highlight`).
- **Live State**: Shows an animated pulsing dot and text: `Thinking... (Xs)`.
- **Finished State**: Auto-collapses to: `Thought for Xs ˅`. If clicked, expands to show raw reasoning tokens. User manual expansion overrides auto-collapse.
- Content must wrap cleanly (`break-words overflow-wrap:anywhere`) with monospace font.

#### 3. Tool Call Card (`type: 'tool_call'`)
- Rendered as an inline action row with an icon, category label, target, and status badge:
  - **`run_command`**: Category label `Ran`, icon `>_`, target: the command string (e.g. `npm test`).
  - **`edit_file` / `replace_file_content`**: Category label `Edited`, icon `📄`, target: filename, diff stats pill `+12 -3`, and an **"Open Diff"** button.
  - **`view_file` / `read_file`**: Category label `Read`, icon `👁️`, target: filename, line range `#L1-80`.
  - **`grep_search` / `glob`**: Category label `Searched`, icon `🔍`, target: query pattern.
  - **`web_search`**: Category label `Browsed`, icon `🌐`, target: search query.
- **Collapsible Detail**: Clicking the row expands to show:
  - For commands: A simulated terminal box (`#0d1117` background) with prompt prefix `.../dir > command`, ANSI colors stripped, and copy button.
  - For file edits: Compact diff view with line changes.
  - For general tools: Formatted JSON parameters and tool result.

#### 4. Assistant Response (`type: 'assistant'`)
- Full Markdown rendering with syntax-highlighted code blocks, tables, LaTeX math (KaTeX `$math$`), and copy-code buttons.
- While streaming, shows an active typing cursor `▌`.

### 3.4 Auto-Scroll & Scroll Locking Behavior
- **Default (Bottom Locked)**: When the agent is streaming tokens or executing tools, the chat automatically scrolls to the latest step.
- **User Scroll Break**: If the user scrolls up by more than `60px` from the bottom, auto-scroll is **immediately suspended** so the user can read previous messages without being jerked downward.
- **Scroll Resumption**: If the user scrolls back to within `40px` of the bottom, or clicks a floating "Scroll to Bottom ↓" button, auto-scroll locks back on.

---

## 4. Prompt Composer & Input Controls (`ComposerBar`)

### 4.1 Composer Layout
```text
+--------------------------------------------------------------------------------+
| [Attachment Chips: file.ts (x), screenshot.png (x)]                            |
+--------------------------------------------------------------------------------+
| Multi-line Textarea (Auto-grows from 1 to 6 lines, then scrolls)               |
+--------------------------------------------------------------------------------+
| [+] Add File | [Model: Claude 3.5 Sonnet v] | [Approval: Ask v] | [Mic] | [▲ Send] |
+--------------------------------------------------------------------------------+
```

### 4.2 Interactive Sub-Controls

#### 1. Model Picker (`ModelPicker`)
- Dropdown listing all enabled models from the active providers (e.g., `gpt-4o`, `claude-3-5-sonnet`, `gemini-1.5-pro`, `deepseek-chat`, `ollama/<model>`).
- Persists user's last selected model per chat in `chatStore`.

#### 2. Human-in-the-Loop Tool Approval Mode (`approvalMode`)
Three-way toggle button:
- **`ask` (Default)**: Dangerous tools (file writes, bash commands) pause execution and prompt the user with an "Allow / Deny" dialog.
- **`always` (Autonomous)**: Agent executes all tools without prompting.
- **`never` (Read-Only)**: Agent is blocked from executing modifying tools (file edits, bash writes).

#### 3. Attachment Handling (`ComposerAttachment`)
- Accepts files via:
  - File picker button (`[+]`).
  - Drag-and-drop directly over the composer window (highlights with dashed border).
  - Clipboard image paste (`Ctrl+V` / `Cmd+V`).
- Supports images (`image/png`, `image/jpeg`, `image/webp`), source code files, and PDFs.
- Image attachments render a thumbnail chip with a remove (`x`) button.

#### 4. Voice Dictation Toggle
- Clicking the microphone icon initiates speech recognition.
- Icon pulses red while listening. Transcribed speech appends directly into the prompt text at cursor position. Clicking again or pressing `Escape` stops dictation.

### 4.3 Slash Command Autocomplete (`useSlashCommands`)
- Typing `/` at the beginning of a word opens a floating suggestions popup above the composer.
- Built-in commands:
  - `/plan`: Create an implementation plan before making edits.
  - `/goal`: Autonomous long-running execution until objective is met.
  - `/schedule`: Set a recurring cron schedule or timer.
  - `/compact`: Condense conversation history to recover context tokens.
  - `/browser`: Automate web browser navigation.
  - `/clear`: Clear current chat steps.
- **Keyboard Navigation**:
  - `ArrowDown` / `ArrowUp`: Move selection highlight.
  - `Tab` or `Enter`: Insert selected command into prompt.
  - `Escape`: Dismiss popup.

### 4.4 Agent Mention Autocomplete (`useAgentMentions`)
- Typing `@` opens an agent persona/subagent picker popup (e.g. `@core`, `@designer`, `@reviewer`).
- Selecting an agent prepends the mention to route the prompt to that subagent.

---

## 5. Interactive Question & Quiz Tool (`InteractiveQuestionComposer`)

When an agent executes the `question` or `ask_question` tool, it needs clarification from the user before continuing.

### 5.1 Trigger Mechanism
1. Core daemon sends an `AgentStreamEvent::ToolCall` with tool `question` or `ask_question`.
2. UI detects this event, pauses agent execution, and **replaces the composer bar** with the `InteractiveQuestionComposer`.

### 5.2 Visual Interface
```text
+--------------------------------------------------------------------------------+
| ❓ Agent Question (1 of 3)                                     [Dismiss (X)]   |
| "Which styling framework would you like to use for the new UI?"                |
+--------------------------------------------------------------------------------+
| [ (o) Option A: Tailwind CSS (Recommended) ]                                   |
| [ ( ) Option B: Vanilla CSS Modules        ]                                   |
| [ ( ) Option C: Styled Components          ]                                   |
| [ Other: [ Write custom response...                                      ] ]   |
+--------------------------------------------------------------------------------+
| [< Previous]                        Step 1 of 3                       [Next >] |
|                                                               [Submit Answers] |
+--------------------------------------------------------------------------------+
```

### 5.3 Behavior & State Rules
- **Multi-Question Stepper**: If the agent asked 3 questions, the user can navigate `< Prev` and `Next >` between them.
- **Single vs Multi-Select**:
  - If `isMultiSelect == false`: Radio button behavior (selecting one deselects others).
  - If `isMultiSelect == true`: Checkbox behavior (multiple options can be checked).
- **Custom Write-in**: Every question always offers a freeform text input for custom answers.
- **Answer Submission**: Clicking `Submit Answers` packages the selected choices and custom text into a formatted response string:
  ```text
  User Answers:
  1. Question: Which styling framework? -> Selected: Tailwind CSS
  2. Question: Include dark mode? -> Selected: Yes
  ```
  This is dispatched as a prompt back to the agent session, allowing the agent to resume execution with zero friction.

---

## 6. Image Generation Workspace (`ImageWorkspacePage`)

### 6.1 Layout & Controls
1. **Canvas View**: Large interactive preview of the active generated image. Supports zoom, pan, and comparison slider.
2. **Settings Drawer**:
   - **Prompt & Negative Prompt**: Text input fields with character counters.
   - **Aspect Ratio**: Segmented buttons (`1:1`, `16:9`, `9:16`, `4:3`, `3:2`).
   - **Generation Parameters**: Steps (1–50 slider), CFG Guidance Scale (1.0–20.0), Seed (`-1` for random or fixed number).
   - **Engine Selector**: Local GPU models (via ComfyUI / Stable Diffusion) vs Cloud APIs (DALL-E 3, Imagen 3, Midjourney).
3. **Filmstrip Gallery (Bottom)**: Horizontal scrolling thumbnail list of all past image generations.
   - Clicking a thumbnail displays it on the canvas.
   - Hover actions: Download (PNG), Copy Prompt, Delete, Send to Inpainting.

---

## 7. Video Generation Workspace (`VideoWorkspacePage`)

### 7.1 Layout & Controls
1. **Video Player Stage**: HTML5 / native video player supporting loop, speed adjustment (0.5x, 1x, 2x), scrub bar, and fullscreen.
2. **Generation Options**:
   - **Prompt**: Textarea with an "✨ Enhance Prompt" button (calls `/api/videos/prompt/enhance` using an LLM to add cinematographic descriptors).
   - **Duration**: Selector for 4s, 6s, 10s.
   - **FPS**: 24fps or 30fps toggle.
   - **Resolution**: 720p or 1080p.
   - **Engine Selector**: Wan2.1, HunyuanVideo, CogVideoX, LTX-Video, Sora.
3. **FFmpeg Dependency Status**: Checks `/api/videos/engine/ffmpeg/status`. If missing, shows an inline banner with a single-click "Provision FFmpeg" action.

---

## 8. 3D Studio Workspace (`ThreeDStudio`)

### 8.1 3D Viewport Controls
- Built with Three.js (Web) / native rendering pipelines:
  - **Left Drag**: Orbit / rotate around center of asset.
  - **Right Drag**: Pan camera horizontally and vertically.
  - **Scroll Wheel**: Zoom in / out.
  - **Reset Camera**: Centers and frames the bounding box of the active mesh.
- **Lighting Controls**: Toggle studio environment map, ambient brightness, and grid floor.

### 8.2 Scene Inspector
- Tree view of the loaded model:
  - Hierarchy: Root Scene → Meshes → Materials → Texture Maps.
  - Transform properties: Position (X, Y, Z), Rotation, Scale.
  - Vertex & polygon counts.

---

## 9. Artifacts Runtime & Inspector (`ArtifactsPage`)

### 9.1 Concept
Artifacts are interactive, self-contained mini-apps (React widgets, HTML/JS tools, Python scripts) created autonomously by the agent.

### 9.2 Artifact Management
- **List View**: Displays all items from `~/.superagent/artifacts/`.
  - Columns: Name, Type (`web`, `node`, `python`, `static`), Port, Status (`running`, `stopped`), Autostart toggle.
- **Runtime Actions**:
  - `Start`: Launches background process or static server on port (e.g. `3080`).
  - `Stop`: Terminates the background process.
  - `Delete`: Deletes folder from disk.
  - `View`: Renders inside an isolated iframe sandbox (`/api/artifacts/:id/view`).
  - `Open External`: Opens `http://localhost:<port>` in default system browser.

---

## 10. Tasks & Scheduled Routines (`TasksPage`)

### 10.1 Kanban View (`KanbanView`)
- 4 Kanban columns:
  1. **To Do**: Backlog of queued prompts or instructions.
  2. **In Progress**: Currently active agent runs.
  3. **Blocked / Review**: Tasks awaiting user tool approval or question answers.
  4. **Done**: Completed tasks.
- Drag-and-drop cards between columns.
- Card details: Title, description, assigned agent persona, priority badge (Low, Medium, High).

### 10.2 Routines View (`RoutinesView`)
- Automations triggered by time or webhooks:
  - Name, prompt template, cron schedule string (e.g. `0 9 * * 1-5` for every weekday at 9 AM).
  - Webhook URL token (`http://localhost:1469/api/triggers/webhook/<token>`).
  - Toggle Enabled/Disabled switch.
  - "Run Now" trigger button.

---

## 11. Companion & 3D Pet (`PartnerPage`)

### 11.1 Features
- Renders a 3D VRM avatar with idle breathing animation and procedural eye blinks.
- **Expression Reactions**:
  - While agent is thinking: Avatar triggers `Thinking` expression.
  - On tool error: Avatar triggers `Surprised` / `Confused` expression.
  - On task complete: Avatar triggers `Happy` / `Wave` animation.
- **Speech Bubble**: Floating card near the avatar echoing the agent's latest thought or summary message.

---

## 12. Settings, Auth & Diagnostics (`SettingsView`)

### 12.1 Settings Categories

#### 1. General Preferences
- **Host Owner Name**: Display name used in greeting.
- **Theme**: Dark, Light, System.
- **Audio Cues**: Chime on run complete, alert on error.
- **Language**: UI localization selector.

#### 2. LLM Providers (`ProviderRegistry`)
- API key entry cards for:
  - OpenAI, Anthropic, Google Gemini, Groq, DeepSeek, OpenRouter, Mistral.
- Each card has:
  - Obfuscated password input (`••••••••`) with show/hide toggle.
  - "Test Connection" button calling `/api/provider-proxy` to validate credentials.
  - Custom Base URL input (for enterprise proxies / Azure / LiteLLM).

#### 3. Local Models (Ollama Manager)
- Status pill: Running / Not Installed.
- Lists all downloaded Ollama models with disk size.
- "Pull Model" input field with download progress bar.

#### 4. Security & Access Control
- Change Master Password modal (scrypt hashed).
- Active Sessions / Devices list with "Revoke" button.
- Toggle for `SUPERAGENT_DISABLE_AUTH` for local-only developers.

#### 5. System Doctor Modal (`DoctorModal`)
Runs comprehensive environment diagnostic checks:
- Node.js, Rust, Git, and FFmpeg installations.
- GPU availability, VRAM detection, CUDA / Metal support.
- Port availability (`1469`).
- Disk space availability in `~/.superagent`.

---

## 13. Global Modals & Overlays

| Modal / Component | Trigger | Purpose |
| :--- | :--- | :--- |
| **`NewChatModal`** | `Cmd+N` / Sidebar button | Quick prompt or project template picker for a new conversation. |
| **`SearchModal`** | `Cmd+K` / Titlebar search | Spotlight-style fuzzy search across all chats, files, and commands. |
| **`ShortcutsModal`** | `Cmd+/` or `?` | Keyboard shortcut reference table. |
| **`DiffViewer`** | Clicking "Open Diff" on an edit step | Full-screen side-by-side or unified code diff viewer with line numbers. |
| **`DesktopLockScreen`** | Inactivity timeout or lock button | PIN / Password screen blocking access until authenticated. |
| **`DefaultPasswordAlertModal`** | Daemon startup detection | Urgent warning when the admin password is still the default `superagent`. |
| **`SystemReadinessBanners`** | Top of workspace | Non-intrusive alert when API keys are missing or daemon is offline. |
| **`AppToast`** | Global event dispatch | Bottom-right popup alerts with 4-second auto-dismiss. |

---

## 14. IPC, WebSocket & State Synchronization Protocol

### 14.1 Transport Endpoints
- **HTTP Base URL**: `http://localhost:1469` (or port discovered in `~/.superagent/web-server.lock`).
- **WebSocket URL**: `ws://localhost:1469/api/ws` (with optional `?token=<bearer-token>`).

### 14.2 WebSocket Message Protocol

#### 1. Outgoing Actions (Client → Daemon)
```json
// Heartbeat
{ "action": "PING" }

// Subscribe to specific session (reduces noise)
{ "action": "SUBSCRIBE_SESSION", "sessionId": "session-123" }

// Unsubscribe
{ "action": "UNSUBSCRIBE_SESSION", "sessionId": "session-123" }

// Rehydrate active session after reconnect
{ "action": "SYNC_SESSION", "sessionId": "session-123" }

// Return user response to interactive question tool
{ "action": "CLIENT_TOOL_RESULT", "id": "tool-call-uuid", "result": "Option A" }
```

#### 2. Incoming Wire Events (Daemon → Client)
All streaming events arrive over WebSocket as JSON with `{ "channel": "agent-event", "data": <Event> }`:
```json
// Token Chunk
{
  "type": "token",
  "sessionId": "session-123",
  "text": "Hello, world!"
}

// Thought Chunk
{
  "type": "thought",
  "sessionId": "session-123",
  "text": "Analyzing project structure..."
}

// Tool Call Started
{
  "type": "tool_call",
  "sessionId": "session-123",
  "tool": "edit_file",
  "id": "call-1",
  "args": { "TargetFile": "src/main.rs", "TargetContent": "...", "ReplacementContent": "..." }
}

// Tool Result Received
{
  "type": "tool_result",
  "sessionId": "session-123",
  "id": "call-1",
  "result": "File successfully updated."
}

// Run Finished
{
  "type": "done",
  "sessionId": "session-123"
}

// Run Aborted
{
  "type": "abort",
  "sessionId": "session-123"
}

// Error Occurred
{
  "type": "error",
  "sessionId": "session-123",
  "error": "API rate limit exceeded."
}
```

---

## 15. Behavioral Edge Cases & Performance Rules

### 15.1 Token Streaming Rendering Throttle
- **Problem**: When models emit 80+ tokens per second, re-rendering the whole chat UI on every token causes UI stutter and high CPU/GPU usage.
- **Rule**: Client implementations must buffer incoming tokens in memory and flush to the UI canvas on a `16ms` timer (60 FPS) or `requestAnimationFrame` throttle.

### 15.2 Zombie Run Cleanup on Disconnect
- If the WebSocket connection drops during an active run, the client must display an amber `Connection Lost — Reconnecting...` banner.
- Upon reconnection, the client sends `{ "action": "SYNC_SESSION", "sessionId": "<id>" }` to re-fetch missed events and synchronize the run status (`isRunning`).

### 15.3 ANSI Color Escape Stripping
- Shell command outputs from `run_command` contain ANSI color escape sequences (e.g. `\x1b[32mOK\x1b[0m`).
- Clients must strip or parse ANSI escapes into native terminal colors before rendering in the command box to prevent raw garbage characters from appearing on screen.

### 15.4 Silent IPC Channels
- Routine background probes (e.g., `system-info`, `check-for-updates`, `settings-read`) must **never trigger intrusive error modals or alerts** if they fail or time out. Only user-initiated actions (sending prompts, saving settings) should trigger error toasts.
