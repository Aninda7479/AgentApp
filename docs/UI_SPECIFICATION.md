# SuperAgent UI Specification & Behavioral Guide
## Canonical Master Blueprint for Dedicated Native UIs (Web, macOS, Windows, Linux)

> **Purpose:** This document is the complete, self-contained functional and behavioral specification of SuperAgent's entire frontend experience. It captures all UX patterns, states, data models, edge cases, micro-interactions, keyboard shortcuts, hardware/3D workflows, and network contracts from the React application (`packages/ui`).
> **Goal:** Developers and AI coding agents building native frontends (SwiftUI on macOS, WinUI 3 on Windows, GTK4 on Linux, Web PWA) should use this document as the single authoritative source of truth without ever needing to consult or inspect the legacy React codebase.

---

## Table of Contents
1. [Visual Design System & Theming](#1-visual-design-system--theming)
2. [Shell & Window Architecture](#2-shell--window-architecture)
3. [Agent Workspace & Chat Feed (`WorkspaceStage`)](#3-agent-workspace--chat-feed-workspacestage)
4. [Prompt Composer & Input Controls (`ComposerBar`)](#4-prompt-composer--input-controls-composerbar)
5. [Interactive Question & Quiz Tool (`InteractiveQuestionComposer`)](#5-interactive-question--quiz-tool-interactivequestioncomposer)
6. [Project Workspace & Context Engine (`WorkspaceView`, `WorkspaceRightSidebar`)](#6-project-workspace--context-engine-workspaceview-workspacerightsidebar)
7. [Image Generation Workspace (`ImageWorkspacePage`)](#7-image-generation-workspace-imageworkspacepage)
8. [Video Generation Workspace (`VideoWorkspacePage`)](#8-video-generation-workspace-videoworkspacepage)
9. [3D Studio Workspace (`ThreeDStudio`)](#9-3d-studio-workspace-threedstudio)
10. [PCB & Hardware Design Workspace (`PCBWorkspacePage`)](#10-pcb--hardware-design-workspace-pcbworkspacepage)
11. [Artifacts Runtime & Inspector (`ArtifactsPage`)](#11-artifacts-runtime--inspector-artifactspage)
12. [Tasks & Scheduled Routines (`TasksPage`)](#12-tasks--scheduled-routines-taskspage)
13. [Companion & 3D Pet Ecosystem (`PartnerPage`, `PetSprite3D`)](#13-companion--3d-pet-ecosystem-partnerpage-petsprite3d)
14. [Circle Search & Screen Intelligence Overlay (`CircleSearchOverlay`)](#14-circle-search--screen-intelligence-overlay-circlesearchoverlay)
15. [System Tray Mini-Launcher (`TrayCardApp`)](#15-system-tray-mini-launcher-traycardapp)
16. [Settings & System Governance (`SettingsView` — 18 Modules)](#16-settings--system-governance-settingsview--18-modules)
17. [Onboarding & First-Run Experience (`OnboardingWizard`)](#17-onboarding--first-run-experience-onboardingwizard)
18. [Global Modals & Dialogs Inventory](#18-global-modals--dialogs-inventory)
19. [IPC, WebSocket & State Synchronization Protocol](#19-ipc-websocket--state-synchronization-protocol)
20. [Behavioral Edge Cases & Performance Rules](#20-behavioral-edge-cases--performance-rules)

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
|   * 3D Studio         |   * PCB & Hardware ECAD            |                       |
|   * PCB & Hardware    |   * Artifacts                      |                       |
|   * Artifacts         |   * Tasks                          |                       |
|   * Tasks             |   * Partner                        |                       |
|   * Partner           |   * Settings                       |                       |
|   * Settings          |                                    |                       |
| - Session History     |                                    |                       |
| - "+ New Chat" Button |                                    |                       |
+-----------------------+------------------------------------+-----------------------+
| Footer: User Profile / Device Status | Lock Screen Button | Version Pill           |
+------------------------------------------------------------------------------------+
```

### 2.2 Top Navigation Items
The sidebar navigates between 9 distinct workspaces:
1. `trajectory` → **Workspace** (Default): AI coding & multi-turn agent conversation.
2. `images` → **Image Workspace**: Multi-model image generation, inpainting, and palette conditioning.
3. `videos` → **Video Workspace**: AI text-to-video, FFmpeg workflows, and video export.
4. `studio` → **3D Studio**: Text-to-3D, mesh retopology, PBR texturing, rigging, and animation.
5. `pcb` → **PCB & Hardware ECAD**: Circuit schematics, layout, 3D PCB inspection, and KiCad export.
6. `artifacts` → **Artifacts**: Sandboxed web apps and widgets created autonomously by the agent.
7. `tasks` → **Tasks & Routines**: Kanban board and scheduled cron routines.
8. `partner` → **Companion**: Interactive 3D VRM pet / desktop companion.
9. `settings` → **Settings**: LLM providers, local models, MCP catalog, storage, and diagnostics.

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
| [PeekingTaskDeck: ⏳ Running 'cargo test' (3.2s) | ⏱️ Timer: 5m left]        [X]|
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

#### 5. Peeking Task Deck (`PeekingTaskDeck`)
- A floating status deck anchored directly above the composer textarea.
- Automatically slides in when background jobs exist: active shell commands, Telegram uploads, scheduled timers, or queued prompt items.
- Provides quick "Cancel" or "Expand Details" actions for active background tasks.

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

## 6. Project Workspace & Context Engine (`WorkspaceView`, `WorkspaceRightSidebar`)

### 6.1 Project Directory Binding
- Sessions can be bound to a physical root folder (`project.rootPath`).
- The project config is stored in `.superagent/project.json` or detected from repository roots.
- Automatic Git detection: Extracts active branch name, commit hash, and dirty status.

### 6.2 Right Sidebar (`WorkspaceRightSidebar`)
Collapsible 320px inspection panel containing 5 tabs:
1. **Overview Tab**:
   - **Context Window Usage Gauge**: Semi-circular or linear progress bar showing token consumption.
     - Green: `< 50%` of model context window.
     - Amber: `50% - 80%`.
     - Red + Warning Banner: `> 80%` (prompts user to run `/compact`).
   - Token breakdown: Prompt tokens, completion tokens, estimated session cost ($).
   - Quick Prompts Deck (`PROMPT_SUGGESTIONS`): 1-click starter chips ("Scaffold new project", "Debug & fix issues", "Explore architecture", "Write unit tests").
2. **Files Tab**:
   - Lists all files modified or read in the active trajectory.
   - Shows line change badges (`+14`, `-3`) and status (`M`, `A`, `D`).
   - Clicking a file opens the `DiffViewer` modal.
3. **Agents Tab**:
   - Visual tree of delegated subagents.
   - Status indicators (`running`, `idle`, `completed`, `errored`).
   - Real-time tool execution logs per subagent.
4. **Partner Tab**:
   - Embedded 2D/3D companion pet widget (`PetSprite`).
   - Intimacy meter, battery level, mood reaction chip.
   - Quick interactions: Coffee break, Sleep mode, Cheer up.
5. **Info Tab**:
   - Daemon latency (ms), port number, session ID, created timestamp.

---

## 7. Image Generation Workspace (`ImageWorkspacePage`)

### 7.1 Layout & Controls
1. **Canvas View**: Large interactive preview of the active generated image. Supports zoom, pan, and comparison slider.
2. **Settings Drawer (`AdvancedSettingsDrawer`)**:
   - **Prompt & Negative Prompt**: Text input fields with character counters.
   - **Aspect Ratio**: Segmented buttons (`1:1`, `16:9`, `9:16`, `4:3`, `3:2`).
   - **Generation Parameters**: Steps (1–50 slider), CFG Guidance Scale (1.0–20.0), Seed (`-1` for random or fixed number).
   - **Engine Selector**: Local GPU models (via ComfyUI / Stable Diffusion) vs Cloud APIs (DALL-E 3, Imagen 3, Midjourney).
3. **Reference & Inpainting Shelf (`AttachmentShelf`)**:
   - Upload reference images for image-to-image or IP-Adapter style transfer.
   - Mask painter for selective inpainting/outpainting.
4. **Brand Watermark Modal (`BrandLogoModal`)**:
   - Watermarks output images with custom SVG/PNG logo.
   - 7-point anchor placement (Top-Left, Top-Center, Top-Right, Center, Bottom-Left, Bottom-Center, Bottom-Right).
   - Opacity (0–100%) and scale sliders.
5. **Color Conditioning Modal (`ColorPaletteModal`)**:
   - Curated palettes: Cyberpunk Neon, Sunset Horizon, Teal & Obsidian, Pastel Dream, Earthy Moss, Monochrome Noir.
   - Custom hex color adder with palette enforcement weight (0.1–1.0).
6. **Filmstrip Gallery (Bottom)**: Horizontal scrolling thumbnail list of all past image generations.
   - Clicking a thumbnail displays it on the canvas.
   - Hover actions: Download (PNG), Copy Prompt, Delete, Send to Inpainting.

---

## 8. Video Generation Workspace (`VideoWorkspacePage`)

### 8.1 Layout & Controls
1. **Video Player Stage**: Native video player supporting loop, speed adjustment (0.5x, 1x, 2x), scrub bar, and fullscreen.
2. **Generation Options**:
   - **Prompt**: Textarea with an "✨ Enhance Prompt" button (calls `/api/videos/prompt/enhance` using an LLM to add cinematographic descriptors).
   - **Duration**: Selector for 4s, 6s, 10s.
   - **FPS**: 24fps or 30fps toggle.
   - **Resolution**: 720p or 1080p.
   - **Engine Selector**: Wan2.1, HunyuanVideo, CogVideoX, LTX-Video, Sora.
3. **Video Attachment Shelf (`VideoAttachmentShelf`)**:
   - First-frame image input for image-to-video transitions.
   - End-frame image input for seamless interpolation.
4. **Video Export Modal (`VideoExportModal`)**:
   - Export format: `mp4`, `webm`, `gif`, `prores`.
   - Resolution scale multiplier (0.5x, 1.0x, 2.0x AI upscaling).
   - Playback speed multiplier (0.5x slow-mo to 2.0x timelapse).
5. **FFmpeg Dependency Status**: Checks `/api/videos/engine/ffmpeg/status`. If missing, shows an inline banner with a single-click "Provision FFmpeg" action.

---

## 9. 3D Studio Workspace (`ThreeDStudio`)

### 9.1 Viewport Controls (`ThreeDViewport`)
- WebGL / Three.js / native scene rendering:
  - **Left Drag**: Orbit / rotate around center of asset.
  - **Right Drag**: Pan camera horizontally and vertically.
  - **Scroll Wheel**: Zoom in / out.
  - **Reset Camera**: Centers and frames the bounding box of the active mesh.
- **Lighting Controls**: Toggle studio environment map, ambient brightness, and grid floor.

### 9.2 5-Stage Creation Pipeline (`StageNavigation`, `ActionPanel`)
1. **Stage 0: Concept & Generation**:
   - Text-to-3D prompt or image-to-3D reference upload.
   - A-Pose toggle for character generation.
   - Stylization picker: Realistic, Low-Poly, Anime, Voxel.
2. **Stage 1: Geometry & Retopology**:
   - Remeshing engine and polygon decimation.
   - Target presets: Low-poly (5,000 tris), Mid-poly (20,000 tris), High-poly (100,000 tris).
   - Quad mesh conversion toggle.
3. **Stage 2: Texturing & PBR Materials**:
   - Material channels: Albedo / Base Color, Normal map, Roughness, Metallic, Ambient Occlusion.
   - Procedural baking and texture resolution (1K, 2K, 4K).
4. **Stage 3: Auto-Rigging & Skeletal Animation**:
   - Automatic humanoid bone hierarchy detection.
   - Assign test animations: Idle breathing, Walk cycle, Run cycle, T-Pose.
5. **Stage 4: Export**:
   - Format options: `.glb`, `.gltf`, `.obj`, `.fbx`, `.usdz`.

---

## 10. PCB & Hardware Design Workspace (`PCBWorkspacePage`)

### 10.1 Multi-Stage ECAD Canvas
1. **Schematic View (`ECADSchematicCanvas`)**:
   - Interactive electronic schematic diagram editor.
   - Renders components (`U1`, `R1`, `C1`, `J1`), pin endpoints, and connected net wires.
   - Drag-and-drop component placement with grid snapping (10px grid).
2. **PCB Layout View (`PCBLayoutCanvas`)**:
   - 2D board outline with copper layers (Top Copper, Bottom Copper, SilkScreen, SolderMask).
   - Component footprint placement and ratsnest connection lines.
3. **3D Board Preview (`PCB3DPreview`)**:
   - Interactive 3D WebGL render of the assembled PCB board with green/black/blue solder mask, golden pads, and 3D component packages.
4. **Electrical Rules Check (`ercEngine`)**:
   - Runs real-time DRC/ERC checks:
     - `floating_pin`: Unconnected mandatory input pins.
     - `voltage_mismatch`: e.g. connecting a 5V rail directly to a 3.3V logic input.
     - `missing_decoupling`: ICs lacking a 100nF decoupling capacitor near power pins.
     - `missing_pullup`: I2C SDA/SCL lines missing 4.7k pull-up resistors.
     - `power_loop`: Conflicting power rail sources.

### 10.2 AI Hardware Co-Pilot (`hardwareAiEngine`)
- Natural language chat sidebar: "Add an ESP32-S3 microcontroller with USB-C 5V power, an AMS1117-3.3V LDO regulator, and a BME280 sensor on I2C".
- AI automatically populates the `PCBGraph` data model:
  - Generates components with exact LCSC part numbers (`C165948`, `C6186`).
  - Creates power rails (`VBUS_5V`, `+3V3`, `GND`).
  - Wire nets together automatically.
- Starter Templates: Blank canvas, ESP32-S3 IoT Node, RP2040 Pico Breakout, USB-C LiPo Charger.

### 10.3 ECAD Exporters (`exporters`)
- **KiCad 8 & 9**: Generates native `.kicad_sch` schematic files and `.kicad_pcb` layout files.
- **Altium Designer**: Generates `.net` wire netlists.
- **SKiDL**: Generates Python-based programmatic hardware code.
- **EasyEDA**: Generates EasyEDA JSON export.
- **BOM (Bill of Materials)**: Generates CSV containing Designator, MPN, Footprint, Manufacturer, LCSC ID, and Quantity.
- **Pick and Place (Centroid)**: Generates SMD component X/Y position and rotation angles for automated SMT assembly.

---

## 11. Artifacts Runtime & Inspector (`ArtifactsPage`)

### 11.1 Concept
Artifacts are interactive, self-contained mini-apps (React widgets, HTML/JS tools, Python scripts) created autonomously by the agent.

### 11.2 Artifact Management
- **List View**: Displays all items from `~/.superagent/artifacts/`.
  - Columns: Name, Type (`web`, `node`, `python`, `static`), Port, Status (`running`, `stopped`), Autostart toggle.
- **Runtime Actions**:
  - `Start`: Launches background process or static server on port (e.g. `3080`).
  - `Stop`: Terminates the background process.
  - `Delete`: Deletes folder from disk.
  - `View`: Renders inside an isolated iframe sandbox (`/api/artifacts/:id/view`).
  - `Open External`: Opens `http://localhost:<port>` in default system browser.

---

## 12. Tasks & Scheduled Routines (`TasksPage`)

### 12.1 Kanban View (`KanbanView`)
- 4 Kanban columns:
  1. **To Do**: Backlog of queued prompts or instructions.
  2. **In Progress**: Currently active agent runs.
  3. **Blocked / Review**: Tasks awaiting user tool approval or question answers.
  4. **Done**: Completed tasks.
- Drag-and-drop cards between columns.
- Card details: Title, description, assigned agent persona, priority badge (Low, Medium, High).

### 12.2 Routines View & Routine Modal (`RoutineModal`)
- Automations triggered by time or webhooks:
  - Name, description, prompt template.
  - **Cron Presets**: Every 15 minutes (`*/15 * * * *`), Hourly (`0 * * * *`), Daily at 9 AM (`0 9 * * *`), Weekdays at 9 AM (`0 9 * * 1-5`), or Custom.
  - Assigned persona (e.g. Trend Radar, Code Janitor).
  - Telegram notification toggle (`notifyTelegram`) + target chat ID.
  - Webhook URL token (`http://localhost:1469/api/triggers/webhook/<token>`).
  - Toggle Enabled/Disabled switch.
  - "Run Now" trigger button.

---

## 13. Companion & 3D Pet Ecosystem (`PartnerPage`, `PetSprite3D`)

### 13.1 Full Companion Studio (`PartnerPage`)
- Loads VRM 3D humanoid avatars via `@pixiv/three-vrm` / native graphics.
- **Features**:
  - **Mood Journal (`MoodJournal`)**: Tracks emotional reactions to tasks (Joy on success, Thinking during tool runs, Confused on errors).
  - **Daily Greeting (`DailyGreeting`)**: Morning greetings, evening wrap-up reminders, late-night sleep suggestions.
  - **Photo Mode (`PhotoMode`)**: Custom character poses, facial expressions, background selection, and snapshot export.
  - **Relationship Panel (`RelationshipPanel`)**: Intimacy level progress bar based on questions answered and projects shipped.
  - **Animations Library (`AnimationsPanel`)**: Over 30 clips: idle breathing, eye blink loop, waving, cheering, dancing, typing, nodding.

### 13.2 Floating Desktop Pet Mode (`PetSprite3D`)
- Can be popped out into a dedicated, borderless, transparent, always-on-top window.
- Floats on the user's desktop above all windows.
- Responds with procedural eye tracking toward the user's mouse cursor.
- Displays speech bubble tooltips echoing agent progress and notifications.

---

## 14. Circle Search & Screen Intelligence Overlay (`CircleSearchOverlay`)

### 14.1 Activation & Capture
- Global keyboard shortcut: `Ctrl+Shift+S` (Windows/Linux) / `Cmd+Shift+S` (macOS).
- Freezes screen and displays a dark semi-transparent overlay across all monitors.
- **3 Context Modes**:
  1. `region`: User clicks and drags a selection bounding box around code, images, or UI.
  2. `fullscreen`: Captures the entire active monitor.
  3. `textonly`: Extracts active window text / clipboard contents without image pixels.

### 14.2 Intelligence Omnibox & Quick Actions
- An omnibox floats directly adjacent to the user's selection bounding box.
- **Quick Action Pills**:
  - `Explain Code`: Breaks down complex algorithms or stack traces.
  - `Summarize`: Bullet-point summary of long documents.
  - `Translate`: Auto-translates foreign text to system language.
  - `Extract Data / OCR`: Pulls clean tabular text from images.
  - `Fix Bug`: Spots syntax errors or runtime issues.
- **Response Card**:
  - Markdown streaming output.
  - Copy to clipboard button.
  - Follow-up query input.
  - **"Send to Main Chat" Button**: Immediately bridges the screenshot and explanation into a new turn in the main agent trajectory.

---

## 15. System Tray Mini-Launcher (`TrayCardApp`)

### 15.1 Architecture & Positioning
- 360px x 480px compact popover window anchored directly to the OS system tray icon.
- Opens instantly on tray icon click; auto-dismisses when clicking outside.

### 15.2 Controls & Actions
- **Search Bar**: Real-time fuzzy filtering of installed artifacts.
- **Artifact Rows**:
  - Manifest icon, name, version, and type badge (`web`, `python`, `node`, `static`).
  - Real-time status pill (`running` with green dot, `stopped`, `error`).
  - Port label (e.g. `:3080`).
- **Actions**:
  - Toggle switch: Start / Stop process.
  - Click row: Launches `http://localhost:<port>` in default browser.

---

## 16. Settings & System Governance (`SettingsView` — 18 Modules)

The Settings view is divided into 18 specialized panels:

1. **General Settings (`GeneralSettings`)**:
   - Host owner display name.
   - Theme toggle: Dark, Light, System.
   - Audio feedback toggles: chime on run complete, alert on error.
   - Language selector and UI zoom level (80% to 125%).
2. **Provider Registry (`ProvidersSettings`)**:
   - Secure credential entry for OpenAI, Anthropic, Gemini, Groq, DeepSeek, OpenRouter, Mistral.
   - Obfuscated key inputs (`••••••••`) with show/hide toggle.
   - Custom Base URL input (for corporate proxies, Azure, LiteLLM).
   - "Test Connection" button calling `/api/provider-proxy`.
3. **Local Models (`LocalModelSettings`)**:
   - Ollama and LM Studio integration.
   - Discovered local models list with disk sizes.
   - "Pull Model" input with real-time download percentage progress bar.
4. **Local Image Models (`LocalImageModelSettings`)**:
   - ComfyUI, Stable Diffusion WebUI, and Flux integration.
5. **Local Video Models (`LocalVideoModelSettings`)**:
   - Wan2.1, HunyuanVideo local model checkpoints and VRAM allocation.
6. **MCP Server Dashboard (`MCPDashboard`, `McpInstallModal`)**:
   - Model Context Protocol server manager.
   - Supports `stdio` (command + args + env) and `sse` (HTTP/SSE URL) transports.
   - One-click catalog installer (Brave Search, GitHub, Postgres, SQLite, Puppeteer).
   - Toggle enable/disable per server with latency indicator.
7. **Usage & Cost Tracker (`UsageTrackerSettings`)**:
   - Token consumption bar charts (Prompt tokens vs Completion tokens).
   - Cost calculation engine based on per-million token pricing table.
   - Date range filters: All, This Month, Last Month, Last 3 Months, Custom.
   - Export usage records to CSV.
8. **Memory & Context Engine (`MemorySettings`)**:
   - User Profile Key-Value store (`preference`, `identity`, `environment`).
   - Learned Insights review and deletion.
   - Project Instruction files detector (`AGENTS.md`, `CLAUDE.md`, `.cursorrules`).
   - Vector memory and session compaction thresholds.
9. **Voice & Speech Studio (`VoiceSettings`)**:
   - STT Engine: Whisper local (tiny, base, small, medium, large) vs Cloud.
   - Phonetic correction dictionary (`from` → `to`).
   - TTS Engine: WebSpeech, ElevenLabs, OpenAI Audio.
   - Push-to-talk hotkey binding and mic sensitivity meter.
10. **Telegram Bot Bridge (`TelegramSettings`)**:
    - Bot token entry and verification.
    - Allowed User / Chat ID whitelist.
    - Incoming voice message transcription to agent prompt.
    - Remote image generation delivery.
11. **Desktop Automation (`ComputerUseSettings`)**:
    - Mouse movement & click automation toggle.
    - Keyboard emulation toggle.
    - Action safety delay slider (50ms to 1000ms).
12. **Browser Automation (`BrowserUseSettings`)**:
    - Headless vs Headed browser toggle.
    - Viewport dimensions and stealth mode.
13. **Web App Hosting (`WebAppSettings`)**:
    - Start / Stop local web server daemon.
    - Port configuration (default `1469`) and auto-start on boot.
    - LAN URL (`http://192.168.x.x:1469`) with QR code for mobile pairing.
    - Admin password management (scrypt hashed).
14. **3D Settings (`ThreeDSettings`)**:
    - Graphics quality preset (Low, Medium, High).
    - Shadow map resolution and anti-aliasing (FXAA / MSAA).
15. **Artifacts Settings (`ArtifactSettings`)**:
    - Default port range (`3000-3999`).
    - Sandboxing security policies.
16. **Storage & Data Management (`StorageSettings`)**:
    - Workspace root path (`~/.superagent`).
    - Cache cleanup and database export/import.
17. **Software Updates (`UpdatesSettings`)**:
    - Current installed version and update channel (Stable / Beta).
    - GitHub Releases updater with release notes changelog.
18. **System Doctor (`DoctorModal`)**:
    - Hardware and environment readiness checks: Node.js, Rust, Git, FFmpeg.
    - GPU VRAM detection and CUDA/Metal availability.
    - Port 1469 bind test and disk space availability.

---

## 17. Onboarding & First-Run Experience (`OnboardingWizard`)

When SuperAgent boots for the first time (no credentials configured or default password active), it presents a full-screen 4-step wizard:
1. **Step 1: Identity & Theme**:
   - User display name, greeting preference, dark/light theme selection.
2. **Step 2: Admin Password Security**:
   - Sets the scrypt-hashed master admin password (enforces minimum 8 characters).
   - Replaces the default `superagent` password.
3. **Step 3: Intelligence Engine Setup**:
   - Choose between **Cloud AI** (enter OpenAI, Anthropic, or Gemini key) or **Local AI** (auto-detects local Ollama).
   - Validates key connectivity inline before proceeding.
4. **Step 4: Workspace Preset**:
   - Coding Assistant (Focus on terminal, git, diffs).
   - Creative Studio (Images, Videos, 3D).
   - Hardware Lab (PCB ECAD, schematics).

---

## 18. Global Modals & Dialogs Inventory

| Modal / Component | Trigger | Purpose |
| :--- | :--- | :--- |
| **`NewChatModal`** | `Cmd+N` / Sidebar button | Quick prompt or project template picker for a new conversation. |
| **`SearchModal`** | `Cmd+K` / Titlebar search | Spotlight-style fuzzy search across all chats, files, and commands. |
| **`ShortcutsModal`** | `Cmd+/` or `?` | Keyboard shortcut reference table. |
| **`DiffViewer`** | Clicking "Open Diff" on an edit step | Full-screen side-by-side or unified code diff viewer with line numbers. |
| **`PermissionDialog`** | Dangerous tool execution | Sandboxed permission prompt (Allow / Deny / Remember for session). |
| **`CreateProjectModal`**| Sidebar "+ Project" | Bind a project name to one or more physical filesystem folders. |
| **`ConfigureProjectModal`**| Project settings button | Edit folder paths and pre-approved shell command patterns. |
| **`TaskRecorderModal`** | Composer action button | Record screen/keyboard actions to synthesize a reusable SKILL.md. |
| **`BYOKModal`** | 401 Unauthorized API error | "Bring Your Own Key" modal prompting for a missing or invalid API key. |
| **`ConfirmDialog`** | Destructive user action | Generic modal for deleting chats, resetting settings, or wiping data. |
| **`DesktopLockScreen`** | Inactivity timeout or lock button | PIN / Password screen blocking access until authenticated. |
| **`DefaultPasswordAlertModal`** | Daemon startup detection | Urgent warning when the admin password is still the default `superagent`. |
| **`GlobalErrorModal`** | Fatal daemon crash | Critical error modal with daemon restart and diagnostic log button. |
| **`SystemReadinessBanners`** | Top of workspace | Non-intrusive alert when API keys are missing or daemon is offline. |
| **`AppToast`** | Global event dispatch | Bottom-right popup alerts with 4-second auto-dismiss. |

---

## 19. IPC, WebSocket & State Synchronization Protocol

### 19.1 Transport Endpoints
- **HTTP Base URL**: `http://localhost:1469` (or port discovered in `~/.superagent/web-server.lock`).
- **WebSocket URL**: `ws://localhost:1469/api/ws` (with optional `?token=<bearer-token>`).

### 19.2 WebSocket Message Protocol

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

## 20. Behavioral Edge Cases & Performance Rules

### 20.1 Token Streaming Rendering Throttle
- **Problem**: When models emit 80+ tokens per second, re-rendering the whole chat UI on every token causes UI stutter and high CPU/GPU usage.
- **Rule**: Client implementations must buffer incoming tokens in memory and flush to the UI canvas on a `16ms` timer (60 FPS) or `requestAnimationFrame` throttle.

### 20.2 Zombie Run Cleanup on Disconnect
- If the WebSocket connection drops during an active run, the client must display an amber `Connection Lost — Reconnecting...` banner.
- Upon reconnection, the client sends `{ "action": "SYNC_SESSION", "sessionId": "<id>" }` to re-fetch missed events and synchronize the run status (`isRunning`).

### 20.3 ANSI Color Escape Stripping
- Shell command outputs from `run_command` contain ANSI color escape sequences (e.g. `\x1b[32mOK\x1b[0m`).
- Clients must strip or parse ANSI escapes into native terminal colors before rendering in the command box to prevent raw garbage characters from appearing on screen.

### 20.4 Silent IPC Channels
- Routine background probes (e.g., `system-info`, `check-for-updates`, `settings-read`) must **never trigger intrusive error modals or alerts** if they fail or time out. Only user-initiated actions (sending prompts, saving settings) should trigger error toasts.
