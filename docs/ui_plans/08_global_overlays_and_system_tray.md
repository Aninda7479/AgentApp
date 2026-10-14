# 08 — Global Overlays & System Tray UI Specification

## Executive Summary
This document defines the canonical architecture, visual design, and behavioral contract for SuperAgent's **Global Native Overlays** and **System Tray Mini-Launcher**. Operating outside the main application window, these components provide zero-latency OS-wide access to visual intelligence, voice dictation, and artifact management across Windows, macOS, and Linux.

---

## 1. Architectural Overview & Native Window Subsystem

### 1.1 Multi-Surface Native Overlay Architecture
SuperAgent utilizes lightweight, high-performance native overlays implemented in Rust (`egui`/`eframe`) and native platform bridges (`clients/windows`, `clients/macos`, `clients/linux`):

```
+----------------------------------------------------------------------------------------------------+
| OS Display Surface (Multi-Monitor Virtual Desktop)                                                 |
+----------------------------------------------------------------------------------------------------+
|                                                                                                    |
|   [ Global Hotkey Daemon ]                                                                         |
|        │                                                                                           |
|        ├──> Ctrl+Shift+S ───> CircleSearchOverlay (Full-screen transparent click-through canvas)    |
|        │                                                                                           |
|        ├──> Ctrl+Space ────> VoiceDictationOverlay (Floating 280x48 pill with live 24-band FFT)    |
|        │                                                                                           |
|        └──> Tray Icon Click ─> SystemTrayMiniLauncher (360x480 popover anchored to taskbar/menu)   |
|                                                                                                    |
+----------------------------------------------------------------------------------------------------+
```

### 1.2 Windowing & Compositing Mechanics
1. **Windows (Win32 / DirectComposition)**:
   - Window Styles: `WS_EX_LAYERED | WS_EX_TOPMOST | WS_EX_TOOLWINDOW | WS_POPUP`.
   - Excluded from Alt-Tab task switcher and taskbar via `WS_EX_TOOLWINDOW`.
   - Per-monitor DPI awareness: Handled via `DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2`.
   - DirectComposition transparent swapchain with alpha channel blending (`DXGI_ALPHA_MODE_PREMULTIPLIED`).
2. **macOS (AppKit / SwiftUI)**:
   - Window Type: `NSPanel` with `styleMask: [.nonactivatingPanel, .borderless]`.
   - Space Behavior: `.canJoinAllSpaces | .stationary | .ignoresCycle`.
   - Window Level: `CGWindowLevelKey.floatingWindow` or `screenSaver` for overlays.
3. **Linux (Wayland / X11)**:
   - Wayland: Configured as a top-level layer surface using `wlr-layer-shell-unstable-v1` (`ZWLR_LAYER_SHELL_V1_LAYER_OVERLAY`).
   - X11: Borderless window with `_NET_WM_STATE_STAYS_ON_TOP` and `_NET_WM_WINDOW_TYPE_UTILITY`.

---

## 2. Circle Search & Screen Intelligence Overlay (`Ctrl+Shift+S`)

### 2.1 Activation & Screen Freeze Protocol
- **Trigger**: Global hotkey `Ctrl+Shift+S` (Windows/Linux) or `Cmd+Shift+S` (macOS).
- **Execution Flow**:
  1. **Instant Desktop Snapshot**: The native capture pipeline (`packages/circle-search-native/src/capture.rs`) grabs a hardware Direct3D11 / Desktop Duplication frame buffer across all active monitors within < 16ms.
  2. **Screen Freeze**: The frozen frame buffer is rendered 1:1 on a borderless, full-screen overlay covering the entire virtual screen bounds.
  3. **Visual Dimming**: An animated dark vignette mask (`#000000` with 45% alpha) overlays the snapshot, signaling capture mode to the user.
  4. **Cursor Mode**: Switches to a high-contrast crosshair cursor (`crosshair`).

### 2.2 The Three Context Modes
The overlay header provides a segmented control allowing immediate mode toggling:

```
[ Region Selection (R) ]     [ Full Screen (F) ]     [ Text / Window OCR (T) ]
```

1. **`region` (Interactive Bounding Box)**:
   - User clicks and drags to form a rectangular selection.
   - **Live Dimension Pill**: Displays floating resolution tooltip adjacent to selection (e.g. `1280 x 720 px`).
   - **Magnifier Loupe**: An 8x pixel inspection loupe follows the cursor at corners during fine-grained dragging.
   - **Selection Cutout**: The selected area clears the dark overlay mask, revealing the underlying frozen screen with a 2px animated cyan border (`#38BDF8`).
   - **Resize Handles**: 8 drag handles (corners and edge centers) allow micro-adjustments.
2. **`fullscreen` (Monitor Selector)**:
   - Automatically detects all attached physical displays.
   - Presents interactive display selection cards (`Display 1: 3840x2160 (Primary)`, `Display 2: 1920x1080 (Secondary)`).
   - Clicking a card instantly captures that entire display bounds.
3. **`textonly` (Window OCR & UI Automation)**:
   - Does not send image pixel data to cloud LLMs.
   - Interrogates the active focused window using OS Accessibility APIs (Win32 UI Automation / macOS AXUIElement / Linux AT-SPI).
   - Extracts semantic text, source code strings, or tabular contents directly into clean markdown.

### 2.3 Hero Card & Intelligence Omnibox
Once a selection is committed, the **Hero Card** floats adjacent to the selection bounding box:
- **Smart Edge Flipping**:
  * Default position: Top-right of the selection.
  * If selection bounds exceed screen edge, card automatically flips to bottom-left, top-left, or docks to screen center.
- **Quick Action Pills**:
  * `Explain Code`: Breaks down complex algorithms, compiler diagnostics, or stack traces.
  * `Summarize`: Produces a concise 3-bullet summary of long documents or emails.
  * `Fix Bug`: Detects syntax errors, typo regressions, or invalid logic.
  * `Translate`: Auto-detects foreign language and renders side-by-side English translation.
  * `Extract Table / OCR`: Converts screenshots of tables into structured Markdown / CSV tables.
- **Query Omnibox**:
  * Multi-line input supporting natural language follow-up queries.
  * Streaming AI response card with markdown code syntax highlighting.
- **Action Toolbar**:
  * `Copy Text`: Copies AI response to system clipboard.
  * `Copy Image`: Copies cropped selection PNG to clipboard.
  * `Redraw`: Resets bounding box selection.
  * **"Send to Main Chat" Bridge**: Immediately packages the screenshot, query, and OCR text into a new user message turn in SuperAgent's primary chat session, brings the main window to the foreground, and closes the overlay.

---

## 3. Global Voice Dictation Overlay

### 3.1 Floating Waveform Pill Layout
The Voice Dictation Overlay is an ultra-compact, draggable floating pill (280px width, 48px height, 24px border radius) positioned at the bottom-center of the active screen.

```
+--------------------------------------------------------------------------+
|  [● REC 00:04]   | | | | | | | | | | | | | | | | | |   [Whisper Base] (x) |
+--------------------------------------------------------------------------+
```

### 3.2 Dynamic Audio Pipeline & Reactive Frequency Bars
1. **Low-Latency Capture**:
   - Implemented via `cpal` in `packages/dictation-native/src/audio.rs`.
   - Ingests 16,000 Hz, 16-bit mono PCM stream with a 2048-sample ring buffer.
2. **Real-Time FFT Visualizer**:
   - The audio stream is partitioned into 24 frequency bands (100 Hz to 7500 Hz).
   - Rendered at 60fps as 24 vertical reactive bars with terracotta/cyan gradient colors (`#D97757` to `#38BDF8`).
   - Bar height scales dynamically with RMS decibel volume (interpolated smoothly with exponential decay).
3. **Voice Activity Detection (VAD)**:
   - Energy threshold gate detects speech onset.
   - Automatically pauses transcribing countdown during pauses.
4. **State Machine Transitions**:
   - `Listening`: Live audio waveform active, timer ticking.
   - `Transcribing`: Waveform collapses into an animated pulsing gradient loader with model badge (`Transcribing via Whisper...`).
   - `Done(Text)`: Displays green checkmark, briefly previews transcribed text snippet (e.g. `"Implement unit tests for..."`), and triggers text insertion.
   - `Error(Msg)`: Displays red alert pill with retry option (`Microphone stream disconnected`).

### 3.3 System Keyboard Injection & Text Insertion
Once Whisper completes transcription:
- SuperAgent identifies the window that had input focus prior to overlay activation.
- Injects transcribed text into the target text input via native OS keyboard emulation:
  * **Windows**: `SendInput` with `INPUT_KEYBOARD` using UTF-16 Unicode character packets (`KEYEVENTF_UNICODE`).
  * **macOS**: `CGEventPost` with `kCGHIDEventTap` or accessibility value set.
  * **Linux**: `xdotool` / `uinput` virtual device driver.
- If target window does not accept input, transcribed text is copied to clipboard with a brief toast notification.

---

## 4. System Tray Mini-Launcher (360x480 Popover)

### 4.1 Geometry, Positioning & Dismissal
- **Dimensions**: Fixed 360px width, 480px height.
- **Positioning**: Anchored precisely to the system tray notification area:
  * Windows: Bottom-right, 12px above taskbar.
  * macOS: Top-right, 6px below status menu bar icon.
  * Linux: Positioned dynamically relative to panel orientation.
- **Auto-Dismissal**: Closes automatically when the window loses focus (`WM_KILLFOCUS` / `NSWindowDidResignKey`) or when the user clicks anywhere outside the popover.

### 4.2 Popover Sections & Controls
1. **Header & Daemon Telemetry**:
   - SuperAgent logo and active release tag (`v2.4.0`).
   - Core Daemon connectivity pill (`● Daemon Online :1469` [green] or `● Offline` [red]).
   - Quick resource footprint pill: CPU % and RAM (e.g. `RAM: 142 MB`).
   - Settings gear icon (opens main Settings window).
2. **Artifacts Search Bar**:
   - Fast fuzzy filter across installed artifacts, local servers, and active agents.
   - Keyboard navigable (`ArrowUp`, `ArrowDown`, `Enter`).
3. **Artifacts Runtime Cards**:
   - Each card represents an artifact running or available locally:
     * Manifest Icon & Title (e.g. `Invoice Generator`, `3D Model Viewer`).
     * Runtime Badge: `web` [cyan], `python` [yellow], `node` [green], `static` [gray].
     * Port Label: e.g. `:3080`.
     * Live Status Dot: Green (running), Gray (stopped), Red (crashed).
     * One-Click Start/Stop Toggle Switch.
     * Quick Browser Launch Button: Opens `http://localhost:<port>` directly in user's default browser.
4. **Desktop Quick Actions Bar**:
   - `Circle Search`: Triggers `Ctrl+Shift+S` overlay.
   - `Dictation`: Triggers `Ctrl+Space` voice pill.
   - `Pet Mode`: Pops out floating 3D companion desktop pet.
   - `Open Full Studio`: Primary action button raising the main SuperAgent interface.

---

## 5. ASCII Wireframes

### 5.1 Circle Search Overlay & Hero Card Wireframe
```
+=============================================================================================================+
| [ Mode: (o) Region (R)   ( ) Fullscreen (F)   ( ) Text OCR (T) ]                     [ Esc: Close Overlay ] |
+=============================================================================================================+
|                                                                                                             |
|      (Darkened Screen Area - 45% black vignette)                                                            |
|                                                                                                             |
|                 +---------------------------------------------+                                             |
|                 | SELECTION BOUNDING BOX                      |    +--------------------------------------+ |
|                 | (100% Bright Frozen Screen Region)          |    | HERO INTELLIGENCE CARD (Floats)     | |
|                 |                                             |    +--------------------------------------+ |
|                 |   function calculateTax(subtotal) {         |    | Quick Actions:                       | |
|                 |       const rate = 0.0825;                  |    | [Explain Code] [Summarize] [Fix Bug] | |
|                 |       return subtotal * rate;               |    | [Translate]    [Extract Table]       | |
|                 |   }                                         |    +--------------------------------------+ |
|                 |                                             |    | Ask anything about this selection... | |
|                 +---------------------------------------------+    | > explain the tax calculation        | |
|                 [ 640 x 360 px ]                                   +--------------------------------------+ |
|                                                                    | AI Insights:                         | |
|                                                                    | • Calculates state tax at 8.25%.     | |
|                                                                    | • Missing floating-point rounding.   | |
|                                                                    |                                      | |
|                                                                    | [ Copy Text ] [ Copy Crop ]          | |
|                                                                    | [>> Send to Main Chat <<]            | |
|                                                                    +--------------------------------------+ |
|                                                                                                             |
+=============================================================================================================+
```

### 5.2 Global Voice Dictation Overlay Wireframe
```
       +--------------------------------------------------------------------+
       |  [● REC 00:06]   ||||||||||||||||||||||||   [Whisper Base: GPU]  X |
       +--------------------------------------------------------------------+
                               ▲
                 (24-Band Reactive FFT Frequency Bars)

       Transcribing State:
       +--------------------------------------------------------------------+
       |  [ ⟳ Transcribing speech with Whisper... ]                   [---] |
       +--------------------------------------------------------------------+

       Completed State:
       +--------------------------------------------------------------------+
       |  [ ✓ "Add unit test for lockscreen watchdog..." ]        [Inserted] |
       +--------------------------------------------------------------------+
```

### 5.3 System Tray Mini-Launcher (360x480) Wireframe
```
+----------------------------------------------------------------+
| SuperAgent Engine v2.4.0                           [ ⚙ Settings ]|
| Status: [ ● Daemon Online :1469 ]          RAM: 142 MB  CPU: 1%|
+----------------------------------------------------------------+
| [ Search installed artifacts & tools... (Ctrl+F)             ] |
+----------------------------------------------------------------+
| RUNNING ARTIFACTS                                              |
|                                                                |
|  [App] NextJS CRM Dashboard                        (o) ACTIVE  |
|        Port: :3080  |  Runtime: Node.js  |  PID: 14820         |
|        [ Open Browser ]   [ View Logs ]   [ Restart ]          |
|                                                                |
|  [Py]  Data Pipeline Analyzer                      ( ) STOPPED |
|        Port: :3081  |  Runtime: Python 3.11                    |
|        [ Start Process ]  [ Configure ]                        |
|                                                                |
|  [3D]  CAD Assembly Viewer                         (o) ACTIVE  |
|        Port: :3082  |  Runtime: Static Web                     |
|        [ Open Browser ]   [ View Logs ]   [ Stop ]             |
+----------------------------------------------------------------+
| QUICK DESKTOP ACTIONS                                          |
|                                                                |
|  [ 🔍 Circle Search (Ctrl+Shift+S) ]  [ 🎙 Voice (Ctrl+Space) ] |
|  [ 🐾 Summon 3D Pet Companion     ]  [ 📂 Open Data Folder  ] |
+----------------------------------------------------------------+
| [         OPEN FULL SUPERAGENT STUDIO (Ctrl+Shift+M)         ] |
+----------------------------------------------------------------+
```

---

## 6. Standardized Demo Stubs

### 6.1 Demo Stub: Circle Search Omnibox
```typescript
// ============================================================================
// [DEMO_STUB: CircleSearchOmniboxDemo]
// DESCRIPTION: Mock dataset and action handlers for the Circle Search overlay.
// BACKEND_ROUTE: POST /api/circle-search/query -> superagent_core_v2::tools::circle_search
// SEARCH_TAG: #DEMO_CIRCLE_SEARCH_OMNIBOX
// ============================================================================

export interface CircleSearchSelectionRect {
  x: number;
  y: number;
  width: number;
  height: number;
  monitorIndex: number;
}

export interface CircleSearchQueryResult {
  queryId: string;
  timestamp: string;
  mode: 'region' | 'fullscreen' | 'textonly';
  selection: CircleSearchSelectionRect;
  quickAction: 'explain' | 'summarize' | 'fix' | 'translate' | 'ocr' | 'custom';
  ocrExtractedText: string;
  aiResponseMarkdown: string;
  latencyMs: number;
  tokensUsed: { prompt: number; completion: number };
}

export const DEMO_CIRCLE_SEARCH_RESULT: CircleSearchQueryResult = {
  queryId: 'cs-query-84920',
  timestamp: '2026-10-14T14:24:10.120Z',
  mode: 'region',
  selection: {
    x: 420,
    y: 180,
    width: 640,
    height: 360,
    monitorIndex: 0,
  },
  quickAction: 'explain',
  ocrExtractedText: `function calculateTax(subtotal) {\n    const rate = 0.0825;\n    return subtotal * rate;\n}`,
  aiResponseMarkdown: `### Code Analysis
The selected code defines a standard sales tax calculation function:
- **Tax Rate**: Fixed at **8.25%** (\`0.0825\`).
- **Potential Bug**: Does not round the resulting amount. JavaScript floating-point arithmetic can produce values like \`10.824999999999999\`.
- **Recommendation**:
\`\`\`typescript
function calculateTax(subtotal: number): number {
    const rate = 0.0825;
    return Math.round((subtotal * rate) * 100) / 100;
}
\`\`\``,
  latencyMs: 380,
  tokensUsed: { prompt: 145, completion: 98 },
};
// ============================================================================
// [END_DEMO_STUB: CircleSearchOmniboxDemo]
// ============================================================================
```

---

### 6.2 Demo Stub: Voice Dictation Waveform
```typescript
// ============================================================================
// [DEMO_STUB: VoiceDictationWaveformDemo]
// DESCRIPTION: Mock 24-band FFT audio spectrum & state machine for Voice Dictation.
// BACKEND_ROUTE: POST /api/voice/transcribe -> superagent_core_v2::server::routes::voice
// SEARCH_TAG: #DEMO_VOICE_DICTATION_WAVEFORM
// ============================================================================

export interface VoiceWaveformBand {
  frequencyHz: number;
  normalizedAmplitude: number; // 0.0 to 1.0
}

export interface VoiceDictationSessionMock {
  sessionId: string;
  status: 'listening' | 'transcribing' | 'done' | 'error';
  elapsedSeconds: number;
  bands: VoiceWaveformBand[];
  activeModel: string;
  transcribedText: string;
  targetWindowProcess: string;
}

export const DEMO_VOICE_DICTATION_SESSION: VoiceDictationSessionMock = {
  sessionId: 'voice-session-1092',
  status: 'listening',
  elapsedSeconds: 5.4,
  bands: [
    { frequencyHz: 120, normalizedAmplitude: 0.25 },
    { frequencyHz: 250, normalizedAmplitude: 0.42 },
    { frequencyHz: 500, normalizedAmplitude: 0.78 },
    { frequencyHz: 800, normalizedAmplitude: 0.88 },
    { frequencyHz: 1200, normalizedAmplitude: 0.95 },
    { frequencyHz: 1600, normalizedAmplitude: 0.65 },
    { frequencyHz: 2000, normalizedAmplitude: 0.54 },
    { frequencyHz: 2500, normalizedAmplitude: 0.48 },
    { frequencyHz: 3000, normalizedAmplitude: 0.32 },
    { frequencyHz: 4000, normalizedAmplitude: 0.20 },
    { frequencyHz: 5000, normalizedAmplitude: 0.15 },
    { frequencyHz: 6500, normalizedAmplitude: 0.08 },
  ],
  activeModel: 'Whisper Local Base (NVIDIA CUDA)',
  transcribedText: 'Write unit tests for the security guardian watchdog and check WTS session lock.',
  targetWindowProcess: 'Code.exe',
};
// ============================================================================
// [END_DEMO_STUB: VoiceDictationWaveformDemo]
// ============================================================================
```

---

### 6.3 Demo Stub: System Tray Artifacts List
```typescript
// ============================================================================
// [DEMO_STUB: SystemTrayArtifactsListDemo]
// DESCRIPTION: Mock list of installed artifacts displayed in the 360x480 popover.
// BACKEND_ROUTE: GET /api/artifacts -> superagent_core_v2::server::routes::artifacts
// SEARCH_TAG: #DEMO_SYSTEM_TRAY_ARTIFACTS
// ============================================================================

export interface TrayArtifactItem {
  id: string;
  title: string;
  description: string;
  version: string;
  runtimeType: 'node' | 'python' | 'web' | 'static';
  port: number;
  status: 'running' | 'stopped' | 'error';
  processId?: number;
  memoryUsageMb: number;
  autoStartOnBoot: boolean;
}

export const DEMO_TRAY_ARTIFACTS: TrayArtifactItem[] = [
  {
    id: 'art-crm-dashboard',
    title: 'CRM Customer Portal',
    description: 'React + Vite customer analytics dashboard',
    version: '1.2.0',
    runtimeType: 'node',
    port: 3080,
    status: 'running',
    processId: 14820,
    memoryUsageMb: 84.5,
    autoStartOnBoot: true,
  },
  {
    id: 'art-data-pipeline',
    title: 'ETL Pipeline Inspector',
    description: 'FastAPI + Pandas log visualizer',
    version: '0.9.4',
    runtimeType: 'python',
    port: 3081,
    status: 'stopped',
    memoryUsageMb: 0.0,
    autoStartOnBoot: false,
  },
  {
    id: 'art-3d-model-viewer',
    title: 'Three.js CAD Model Viewer',
    description: 'Interactive PBR CAD inspector',
    version: '2.0.1',
    runtimeType: 'static',
    port: 3082,
    status: 'running',
    processId: 21904,
    memoryUsageMb: 32.1,
    autoStartOnBoot: true,
  },
];
// ============================================================================
// [END_DEMO_STUB: SystemTrayArtifactsListDemo]
// ============================================================================
```

---

## 7. Comprehensive Test Case Catalog

| Test ID | Test Scenario | Steps to Execute | Expected Result & Verification |
| :--- | :--- | :--- | :--- |
| `TC-OVL-01` | **Multi-Monitor DPI Boundary Crossing** | 1. Setup dual monitors: Primary (3840x2160 @ 150% DPI) and Secondary (1920x1080 @ 100% DPI).<br>2. Trigger `Ctrl+Shift+S`.<br>3. Drag selection box across monitor boundary. | Selection box renders without graphical tearing, aspect distortion, or coordinate offset. Physical pixel coordinates correctly map across both monitors. |
| `TC-OVL-02` | **Microphone Disconnection Mid-Recording** | 1. Trigger `Ctrl+Space` Voice Dictation.<br>2. Unplug physical USB microphone while in `Listening` state. | Audio recorder detects stream drop within 50ms. Pill transitions to `Error("Microphone disconnected")` without crashing the daemon. Allows user retry. |
| `TC-OVL-03` | **Tray Window Focus Loss Auto-Dismissal** | 1. Click tray icon to open 360x480 popover.<br>2. Click anywhere on desktop or another application window. | Popover captures `WM_KILLFOCUS` / `NSWindowDidResignKey` and immediately dismisses with smooth fade-out within 80ms. |
| `TC-OVL-04` | **Circle Search "Send to Main Chat" Bridge** | 1. Trigger Circle Search on a code snippet.<br>2. Click "Send to Main Chat". | Cropped image buffer and OCR markdown are sent via WebSocket (`session.message.create`). Main SuperAgent window is raised to foreground. Overlay closes cleanly. |
| `TC-OVL-05` | **Text Injection into Elevated UAC Windows** | 1. Open Notepad as Administrator.<br>2. Dictate sentence with non-elevated Voice Dictation overlay.<br>3. Commit transcription. | Dictation detects UIPI (User Interface Privilege Isolation) restriction. If keystrokes are blocked, text is automatically copied to clipboard with explanatory toast: `"Text copied to clipboard (admin window)"`. |
| `TC-OVL-06` | **Selection Bounding Box Negative Drag** | 1. Click at coordinate `(800, 600)`.<br>2. Drag cursor up and left to `(400, 300)`. | Selection engine normalizes negative width/height into valid `Rect::from_min_max(Pos2(400, 300), Pos2(800, 600))`. Crop is extracted correctly. |
| `TC-OVL-07` | **Display Resolution Change Mid-Session** | 1. Trigger Circle Search overlay.<br>2. Simulate OS display resolution change event. | Overlay receives `WM_DISPLAYCHANGE` / screen reconfiguration notification. Tears down existing swapchain and reinitializes canvas to match new virtual screen bounds. |
| `TC-OVL-08` | **Rapid Hotkey Double-Trigger (Debounce)** | 1. Rapidly press `Ctrl+Shift+S` 5 times in 500ms. | Debounce filter ensures only a single overlay instance is created. Subsequent keystrokes are safely ignored without socket spam or memory leaks. |
