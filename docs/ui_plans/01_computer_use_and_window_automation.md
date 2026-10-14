# 01 — Computer Use & Native Window Automation Workspace Specification

## Executive Summary & Architectural Mission

This specification defines the complete functional, visual, and behavioral architecture for the **Computer Use & Native Window Automation Workspace** in SuperAgent. 

Autonomous Computer Use requires a fundamentally different user interface than traditional conversational chat. When an agent interacts with desktop applications, users need real-time situational awareness: which process is targeted, what the application's semantic accessibility tree looks like, where the agent's virtual cursor is traveling, how screen coordinates are calculated across disparate monitor DPIs, and why the agent is waiting for an interface to settle.

This workspace delivers:
1. **Window Picker & Process Inspector**: Real-time enumerations of desktop windows, process trees, and modal focus states without desktop focus-stealing.
2. **Direct3D11 / WGC Occluded Capture Canvas**: Hardware-accelerated viewport rendering occluded, minimized, or background windows via Windows Graphics Capture (`Windows.Graphics.Capture`) and Direct3D11 swapchains (with macOS CoreGraphics / Linux PipeWire equivalents).
3. **DPI-Unscaled Coordinate Crosshairs & Bounding Overlays**: Precision visualization showing exact physical pixels, virtual desktop coordinates, and logical DPI-normalized targets.
4. **Live Accessibility Tree Inspector**: Semantic tree browser exposing stable numeric element indices (`element_index`), accessibility roles, bounding rects, and document text.
5. **Mouse Trajectory & Gesture Visualizer**: Smooth cubic-Bézier movement paths, acceleration velocity curves, click ripple pulses, and drag-and-drop bounding vectors.
6. **Adaptive Settling Indicator**: Dynamic stabilization monitor showing the 1000ms base settling countdown plus up to 5000ms hold when UI spinners or DOM mutations are detected.
7. **Demo Stubs & Contracts**: Complete frontend mock datasets tagged with `// [DEMO_STUB: ...]` to enable immediate frontend UI iteration and automated testing.

---

## 1. Global Screen Layout & ASCII Wireframes

The Computer Use Workspace operates as a dedicated high-density three-column workstation with a top telemetry HUD:

```text
+--------------------------------------------------------------------------------------------------------------------+
| TOP TELEMETRY HUD: Target App: [Code.exe (PID 10428)] | Display: Primary (2560x1440 @ 150%) | Settling: [STABLE 0ms] |
+------------------------+-----------------------------------------------------------+-------------------------------+
| LEFT PANEL (320px)     | CENTER VIEWPORT: Occluded Capture Canvas & Trajectory     | RIGHT PANEL (380px)           |
|                        |                                                           |                               |
| [1. Window Picker]     | +-------------------------------------------------------+ | [3. Accessibility Tree]       |
| ┌────────────────────┐ | | Direct3D11 WGC Render Surface (1280x720 Virtual)      | | 🔍 Search elements (text/role)|
| │ [VS Code] Active   │ | |                                                       | | ├─ [0] Window "VS Code"       |
| │ PID 10428 | HWND   │ | |     (x: 420, y: 180)                                  | | │  ├─ [1] TitleBar            |
| ├────────────────────┤ | |        +-- [Hover Box: Save Button (ID: 14)]          | | │  │  ├─ [2] File Menu        |
| │ [Chrome] Occluded  │ | |        |                                              | | │  │  └─ [3] Edit Menu        |
| │ PID 8192  | HWND   │ | |     ●──┼───────────────────────► ◎ (Click Ripple)     | | │  └─ [4] Editor Workspace    |
| ├────────────────────┤ | |   Start│  Bézier Trajectory     (x: 840, y: 320)      | | │     └─ [14] Button "Save"   |
| │ [Terminal] Min     │ | |        │  Velocity: 1420 px/s                         | | │        Role: PushButton     |
| └────────────────────┘ | |        ▼                                              | | │        Bounds: [820,300,...]│
|                        | |   [DPI Unscaled Crosshair: X: 840.0 Y: 320.0 (1.5x)]  | | │        State: Focusable     |
| [2. Process Details]   | +-------------------------------------------------------+ | ├─────────────────────────────┤
| • Exe: Code.exe        |                                                           | [4. Document Text Stream]     |
| • Path: C:\Users\...   | [BOTTOM DOCK: Action Controls & Settling Timeline]        | "function deployCluster() {"  |
| • Memory: 428 MB       | [⏸ Pause] [▶ Step] [⏹ Stop] | Settling: [||||||||  420ms]   | "  const config = load();"    |
| • Parent: explorer.exe | Heuristic: Spinner Radar [CLEAN] | Target: element_index  |                               |
+------------------------+-----------------------------------------------------------+-------------------------------+
```

---

## 2. Component Specifications & ASCII Wireframes

### 2.1 Window Picker Card (`WindowInspectionCard`)

The window picker card renders every open window discovered by the background engine (`list_windows`). It distinguishes between foreground windows, occluded windows (rendered behind other surfaces), and minimized windows.

#### Wireframe:
```text
+----------------------------------------------------------------+
| [App Icon] Visual Studio Code - AgentApp             [ACTIVE] ● |
+----------------------------------------------------------------+
| App ID: com.microsoft.VSCode       HWND: 0x000A04E2            |
| PID: 10428                         Z-Order: Topmost (0)        |
| Dimensions: 1920 x 1080            DPI Scale: 150% (144 DPI)   |
| State: Visible (Occluded by Chrome) Modal: False               |
+----------------------------------------------------------------+
| Actions: [🎯 Target for CUA]  [📸 Take Snapshot]  [🗗 Bring Top] |
+----------------------------------------------------------------+
```

#### Behavioral Rules:
1. **Focus Non-Stealing Targeting**: Clicking **"Target for CUA"** binds the Direct3D11 WGC capture session to `HWND: 0x000A04E2` without invoking `SetForegroundWindow` or `BringWindowToTop`. The user's active foreground typing is never interrupted.
2. **Occlusion Indicator**: If `isOccluded === true`, display a neon amber badge `[OCCLUDED]` with tooltip: *"Target is covered by other windows. Direct3D11 compositor frame buffer capture active."*
3. **Modal Warning Banner**: If `modal === true`, render a high-visibility amber pill `[MODAL BLOCKED]` indicating that child dialog inputs must be completed before parent window accepts events.
4. **State Transition Badges**:
   - `ACTIVE`: `#10b981` (Emerald) pulsing circle.
   - `OCCLUDED`: `#f59e0b` (Amber) static eye-slash icon.
   - `MINIMIZED`: `#64748b` (Slate) icon with one-click restore.

---

### 2.2 Process Inspector & Focus State Manager (`ProcessInspectorPanel`)

Displays low-level OS process telemetry to ensure the agent does not interact with elevated/privileged system dialogs (e.g. UAC prompts, security credential dialogs) without permission.

#### Wireframe:
```text
+----------------------------------------------------------------+
| ⚙️ PROCESS & SECURITY INSPECTOR                                 |
+----------------------------------------------------------------+
| Executable:        Code.exe                                    |
| Binary Path:       C:\Users\User\AppData\Local\Programs\VSCode |
| Architecture:      x64 (Native)                                |
| Process ID (PID):  10428                                       |
| Parent PID (PPID): 4120 (explorer.exe)                         |
| Integrity Level:   Medium Mandatory Level (Standard User)      |
| UAC Elevated:      NO (Safe for synthetic input)               |
| Window Station:    WinSta0\Default                             |
+----------------------------------------------------------------+
| Input Focus Manager:                                           |
| • Focus Thread ID: 14092                                       |
| • Active Control:  EditControl (HWND 0x000A0514)                |
| • Caret Position:  X: 480, Y: 240 (Blinking: True)            |
| • IME Status:      English (United States) - US                |
+----------------------------------------------------------------+
```

#### Security Boundaries:
- **Integrity Level Audit**: If integrity is `High` or `System` and SuperAgent is running as `Medium`, mark input dispatch controls as disabled with warning: *"Cross-integrity UIPI (User Interface Privilege Isolation) restricts synthetic clicks to elevated windows."*
- **Terminal Services Session Check**: Queries `WTSRegisterSessionNotification`. If the session transitions to `WTS_SESSION_LOCK`, immediately freeze input dispatch and display the `LockScreenGuardian` shield.

---

### 2.3 Direct3D11 / WGC Occluded Capture Canvas (`WgcCaptureCanvas`)

The central automation canvas receives a continuous high-framerate swapchain texture (up to 30 FPS during active interaction, throttled to 2 FPS when idle) directly from the core daemon.

#### Wireframe:
```text
+------------------------------------------------------------------------------------+
| 🖥️ WGC DIRECT3D11 STREAM  | 1920x1080 @ 30 FPS | Frame ID: #40192 | Format: BGRA8   |
+------------------------------------------------------------------------------------+
|                                                                                    |
|   ┌───────────────────────────────────────────────────────────────┐                |
|   │ [Save File Button]  ◄─────────── Bounding Box Overlay         │                |
|   │ Bounds: [X: 820, Y: 300, W: 120, H: 36]                       │                |
|   │ Target: element_index: 14                                     │                |
|   └───────────────────────────────────────────────────────────────┘                |
|                      ▲                                                             |
|                      │                                                             |
|                      │ Bézier Motion Curve                                         |
|                      │ Velocity: 1,820 px/s -> Settling                            |
|                      │                                                             |
|         ●────────────┘                                                             |
|   Start Position                                                                   |
|   (X: 420, Y: 180)                                                                 |
|                                                                                    |
|                                  [+] Crosshair Target                              |
|                                  Physical: (1230.0, 450.0)                         |
|                                  Logical:  (820.0, 300.0)                          |
|                                  DPI Multiplier: 1.50x                             |
+------------------------------------------------------------------------------------+
| Overlay Toggles: [x] Crosshair  [x] Bounding Rects  [x] Trajectory  [ ] Raw Pixels |
+------------------------------------------------------------------------------------+
```

#### Canvas Interaction & DPI Calculation:
1. **Unscaled Coordinate Mapping**:
   Desktop coordinates can be subject to OS display virtualization. The canvas calculates:
   $$\text{PhysicalX} = \text{LogicalX} \times \text{DpiScale}$$
   $$\text{PhysicalY} = \text{LogicalY} \times \text{DpiScale}$$
   When the user or agent inspects a point, the HUD renders both physical hardware pixels and logical unscaled coordinates.
2. **Interactive Manual Inspection**:
   Clicking any coordinate on the live canvas immediately queries the backend for the underlying accessibility element at that `(x, y)` point, highlighting the node in the right-side Accessibility Tree panel.
3. **Yellow Border Suppression**:
   On Windows 11 21H2+, WGC displays a yellow capture security border by default. SuperAgent's Direct3D11 engine calls `GraphicsCaptureSession.IsBorderRequired = false` (supported via Windows 10 build 20348+ / Windows 11 API contract) to eliminate visual disruption.

---

### 2.4 Live Accessibility Tree Inspector (`AccessibilityTreePanel`)

The accessibility tree is the primary semantic interface used by LLMs to navigate native software. The inspector provides an interactive tree browser with instant search, role tags, and document text previews.

#### Wireframe:
```text
+--------------------------------------------------------------------+
| 🌳 ACCESSIBILITY TREE INSPECTOR             [Collapse All] [Refresh]|
+--------------------------------------------------------------------+
| 🔍 Filter elements by name, role, or ID...                         |
+--------------------------------------------------------------------+
| ▼ [0] Window: "Visual Studio Code" (Role: Window, Bounds: 0,0,1920) |
|   ▼ [1] TitleBar: "AgentApp - Code" (Role: TitleBar)               |
|     ├─ [2] SystemMenu (Role: MenuBar)                              |
|     ├─ [3] MinimizeButton (Role: Button, Action: "press")          |
|     └─ [4] CloseButton (Role: Button, Action: "press")             |
|   ▼ [5] Pane: "Sidebar" (Role: Pane)                               |
|     ├─ [6] TreeView: "Explorer" (Role: Outline)                    |
|     │    ├─ [7] TreeItem: "src" (Expanded: True)                   |
|     │    └─ [8] TreeItem: "package.json" (Action: "double_click")  |
|   ▼ [9] Pane: "Editor Group" (Role: Document)                      |
|     ▼ [10] EditArea: "main.rs" (Role: EditField, Focused: True)    |
|       ├─ [11] Line 1: "use windows::Graphics::Capture;"            |
|       └─ [12] Line 2: "pub fn start_session() {"                   |
|   ► [13] StatusBar: "Ready" (Role: StatusBar)                      |
+--------------------------------------------------------------------+
| ELEMENT DETAILS (Node #10):                                        |
| • Element Index:    10                                             |
| • AutomationId:     "editor.main_rs"                               |
| • Role:             EditField                                      |
| • Actions:          ["click", "set_focus", "set_value", "select"]  |
| • Bounding Rect:    [Left: 340, Top: 120, Width: 1240, Height: 800]|
| • Value Text:       "use windows::Graphics::Capture;\npub fn..."   |
+--------------------------------------------------------------------+
| Actions: [🎯 Dispatch Action To Node]  [📋 Copy Index (#10)]        |
+--------------------------------------------------------------------+
```

#### Dual-Targeting Dispatch Model:
- **Targeting by Element Index (`element_index`)**:
  Preferred when the node has a stable accessibility index. Executes via OS accessibility invocation (`UIA_InvokePatternId` on Windows, `AXPress` on macOS).
- **Targeting by Coordinate Point (`x, y`)**:
  Fallback when an application renders custom controls (e.g. Flutter, Canvas, game engines, or Electron custom components without AX peers). Automatically calculates element bounding box center:
  $$X_c = \text{Left} + \frac{\text{Width}}{2}, \quad Y_c = \text{Top} + \frac{\text{Height}}{2}$$

---

### 2.5 Mouse Trajectory Overlay & Physics Visualizer (`MouseTrajectoryCanvas`)

To provide transparency and allow immediate user intervention, the workspace renders the agent's planned and executed cursor trajectories.

#### Trajectory Dynamics:
1. **Bézier Path Generation**:
   Mouse travel between $(x_1, y_1)$ and $(x_2, y_2)$ is interpolated using cubic-Bézier easing curves with randomized sub-pixel curvature to mimic human cursor dynamics and avoid instant teleportation triggers in bot detection heuristics:
   $$B(t) = (1-t)^3 P_0 + 3(1-t)^2 t P_1 + 3(1-t) t^2 P_2 + t^3 P_3, \quad t \in [0, 1]$$
2. **Velocity Vector Styling**:
   - Acceleration Phase: Cyan line (`#06b6d4`, width `2.5px`).
   - Constant Flight Phase: Blue line (`#3b82f6`, width `2.0px`).
   - Deceleration & Settling Phase: Emerald line (`#10b981`, width `1.5px`).
3. **Click Ripple Animation**:
   - **Single Click**: Single concentric ring expanding from 4px to 24px radius over 300ms, fading opacity from `1.0` to `0.0` (Color: Cyan `#06b6d4`).
   - **Double Click**: Twin staggered concentric rings with 80ms delay (Color: Purple `#8b5cf6`).
   - **Right Click**: Hexagonal pulse with red-amber accent (`#f59e0b`).
4. **Drag-and-Drop Vector**:
   - Origin marked with an anchored pin `⚓ [From: X1, Y1]`.
   - Dashed connector line (`stroke-dasharray: 6 4`).
   - Destination marked with a target bullseye `🎯 [To: X2, Y2]`.

---

### 2.6 Adaptive Settling Indicator & Spinner Radar (`AdaptiveSettlingWidget`)

Fixed `sleep()` timers in UI automation cause either catastrophic race conditions (when an app is slow) or extreme latency overhead (when an app is fast). SuperAgent employs **Adaptive Settling with Dynamic Delay**:
- **Baseline Wait**: Exactly 1000ms stabilization window after any input command.
- **Dynamic Hold (Up to 5000ms max)**: If an in-app spinner, cursor busy flag (`IDC_WAIT`, `IDC_APPSTARTING`), or accessibility state change is observed, the system holds execution until the interface becomes idle.

#### Wireframe:
```text
+--------------------------------------------------------------------+
| ⏳ ADAPTIVE SETTLING ENGINE                                         |
+--------------------------------------------------------------------+
| Status: [HOLDING ON SPINNER] ● (Amber Pulsing)                     |
| Baseline Delay:    [████████████████████] 1000ms (Elapsed: 1000ms) |
| Dynamic Hold:      [████████░░░░░░░░░░░░] 2400ms / 5000ms Max      |
+--------------------------------------------------------------------+
| Stability Sensors:                                                 |
| • Cursor Shape:     IDC_WAIT (Hourglass / Spinner detected)       |
| • AX Busy Flag:     UIA_IsWindowPatternAvailable: BUSY             |
| • Optical Delta:    14.2% pixel change between frames (in motion)  |
| • DOM Mutations:    12 nodes/sec (Active render)                   |
+--------------------------------------------------------------------+
| Safety Override:   [⚡ Force Proceed Now] (Bypasses remaining hold)|
+--------------------------------------------------------------------+
```

---

## 3. Keyboard Shortcuts & User Controls

| Shortcut | Scope | Action Description |
| :--- | :--- | :--- |
| `Ctrl + Shift + C` | Global | Toggle Computer Use Workspace visibility |
| `Ctrl + Shift + W` | Workspace | Open Window Picker modal dialog |
| `Space` | Workspace | Pause / Resume automated trajectory execution |
| `F8` | Workspace | Step forward single action in current trajectory |
| `Esc` (x2) | Global Emergency | Hard kill: Immediately abort all synthetic mouse/keyboard dispatch |
| `Ctrl + Alt + I` | Inspector | Toggle Accessibility Tree element inspector mode |
| `Ctrl + Alt + D` | Canvas | Toggle DPI unscaled coordinate crosshair overlay |

---

## 4. Standardized Demo Stubs & TypeScript Contracts

The following production-ready demo stubs conform to the SuperAgent `#DEMO_` standard and provide comprehensive mocks for frontend unit and visual regression tests.

### 4.1 Window List Demo Stub
```typescript
// ============================================================================
// [DEMO_STUB: ComputerUseWindowList]
// DESCRIPTION: Mock list of open OS application windows for development & testing.
// BACKEND_ROUTE: GET /api/computer-use/windows -> superagent_core_v2::tools::computer_use::list_windows
// SEARCH_TAG: #DEMO_COMPUTER_USE_WINDOWS
// ============================================================================

export interface DesktopWindowItem {
  id: number;
  hwnd: string;
  app: string;
  title: string;
  processId: number;
  parentProcessId: number;
  executablePath: string;
  bounds: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  dpiScale: number;
  isFocused: boolean;
  isOccluded: boolean;
  isMinimized: boolean;
  isModal: boolean;
  zOrder: number;
}

export const DEMO_COMPUTER_USE_WINDOWS: DesktopWindowItem[] = [
  {
    id: 1042,
    hwnd: "0x000A04E2",
    app: "com.microsoft.VSCode",
    title: "AgentApp - Visual Studio Code",
    processId: 10428,
    parentProcessId: 4120,
    executablePath: "C:\\Users\\Developer\\AppData\\Local\\Programs\\Microsoft VS Code\\Code.exe",
    bounds: { x: 100, y: 50, width: 1820, height: 1030 },
    dpiScale: 1.5,
    isFocused: true,
    isOccluded: false,
    isMinimized: false,
    isModal: false,
    zOrder: 0,
  },
  {
    id: 2088,
    hwnd: "0x001402F0",
    app: "com.google.Chrome",
    title: "SuperAgent Cloud Dashboard - Google Chrome",
    processId: 8192,
    parentProcessId: 4120,
    executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    bounds: { x: 200, y: 120, width: 1600, height: 900 },
    dpiScale: 1.5,
    isFocused: false,
    isOccluded: true,
    isMinimized: false,
    isModal: false,
    zOrder: 1,
  },
  {
    id: 3104,
    hwnd: "0x00080112",
    app: "org.alacritty.Alacritty",
    title: "Alacritty - cargo check -p superagent-core-v2",
    processId: 14210,
    parentProcessId: 4120,
    executablePath: "C:\\Program Files\\Alacritty\\alacritty.exe",
    bounds: { x: 50, y: 50, width: 1200, height: 800 },
    dpiScale: 1.5,
    isFocused: false,
    isOccluded: true,
    isMinimized: true,
    isModal: false,
    zOrder: 2,
  },
  {
    id: 4099,
    hwnd: "0x000508BC",
    app: "com.microsoft.Notepad",
    title: "Confirm Discard Changes",
    processId: 19804,
    parentProcessId: 4120,
    executablePath: "C:\\Windows\\System32\\notepad.exe",
    bounds: { x: 720, y: 440, width: 480, height: 200 },
    dpiScale: 1.5,
    isFocused: false,
    isOccluded: false,
    isMinimized: false,
    isModal: true,
    zOrder: 0,
  },
];
// ============================================================================
// [END_DEMO_STUB: ComputerUseWindowList]
// ============================================================================
```

---

### 4.2 Accessibility Tree Demo Stub
```typescript
// ============================================================================
// [DEMO_STUB: AccessibilityTreeDemo]
// DESCRIPTION: Mock hierarchical accessibility tree with numeric indices & roles.
// BACKEND_ROUTE: GET /api/computer-use/windows/:hwnd/ax-tree -> superagent_core_v2::tools::computer_use::get_ax_tree
// SEARCH_TAG: #DEMO_ACCESSIBILITY_TREE
// ============================================================================

export interface AccessibilityNode {
  elementIndex: number;
  automationId?: string;
  role: 'Window' | 'TitleBar' | 'MenuBar' | 'MenuItem' | 'Button' | 'EditField' | 'Document' | 'TreeItem' | 'StatusBar' | 'ComboBox' | 'CheckBox';
  name: string;
  value?: string;
  bounds: {
    left: number;
    top: number;
    width: number;
    height: number;
  };
  actions: ('click' | 'double_click' | 'press' | 'set_focus' | 'set_value' | 'select' | 'expand')[];
  isFocused?: boolean;
  isFocusable?: boolean;
  isExpanded?: boolean;
  children?: AccessibilityNode[];
}

export const DEMO_ACCESSIBILITY_TREE: AccessibilityNode = {
  elementIndex: 0,
  automationId: "root_window",
  role: "Window",
  name: "Visual Studio Code - AgentApp",
  bounds: { left: 100, top: 50, width: 1820, height: 1030 },
  actions: ["set_focus"],
  isFocusable: true,
  children: [
    {
      elementIndex: 1,
      automationId: "title_bar",
      role: "TitleBar",
      name: "AgentApp - Visual Studio Code",
      bounds: { left: 100, top: 50, width: 1820, height: 35 },
      actions: [],
      children: [
        {
          elementIndex: 2,
          automationId: "btn_save",
          role: "Button",
          name: "Save (Ctrl+S)",
          bounds: { left: 450, top: 55, width: 60, height: 25 },
          actions: ["click", "press"],
          isFocusable: true,
        },
        {
          elementIndex: 3,
          automationId: "btn_minimize",
          role: "Button",
          name: "Minimize",
          bounds: { left: 1780, top: 50, width: 45, height: 35 },
          actions: ["click", "press"],
        },
      ],
    },
    {
      elementIndex: 4,
      automationId: "editor_group",
      role: "Document",
      name: "src/main.rs",
      bounds: { left: 350, top: 85, width: 1570, height: 955 },
      actions: ["set_focus"],
      isFocusable: true,
      children: [
        {
          elementIndex: 10,
          automationId: "code_editor_area",
          role: "EditField",
          name: "Code Editor",
          value: "use windows::Graphics::Capture;\n\npub fn capture_occluded_hwnd(hwnd: HWND) -> Result<Vec<u8>, CaptureError> {\n    // Direct3D11 frame pool allocation\n    let d3d_device = create_d3d11_device()?;\n    Ok(vec![])\n}",
          bounds: { left: 350, top: 85, width: 1570, height: 955 },
          actions: ["click", "set_focus", "set_value", "select"],
          isFocused: true,
          isFocusable: true,
        },
      ],
    },
  ],
};
// ============================================================================
// [END_DEMO_STUB: AccessibilityTreeDemo]
// ============================================================================
```

---

### 4.3 Occluded Capture Canvas Mock
```typescript
// ============================================================================
// [DEMO_STUB: OccludedCaptureMock]
// DESCRIPTION: Mock capture stream metadata, settling radar, and trajectory.
// BACKEND_ROUTE: GET /api/computer-use/windows/:hwnd/capture -> superagent_core_v2::tools::computer_use::capture_wgc
// SEARCH_TAG: #DEMO_OCCLUDED_CAPTURE
// ============================================================================

export interface CaptureFrameMetadata {
  frameId: number;
  timestampMs: number;
  hwnd: string;
  sourceApp: string;
  pixelWidth: number;
  pixelHeight: number;
  format: 'BGRA8' | 'RGBA8' | 'JPEG';
  dpiScale: number;
  isOccluded: boolean;
  settlingState: {
    status: 'settling' | 'stable' | 'timeout';
    baseDelayMs: number;
    spinnerHoldMs: number;
    maxHoldMs: number;
    hasActiveSpinner: boolean;
    opticalDeltaPct: number;
  };
  activeTrajectory?: {
    from: { x: number; y: number };
    to: { x: number; y: number };
    controlPoint1: { x: number; y: number };
    controlPoint2: { x: number; y: number };
    durationMs: number;
    targetElementIndex: number;
    actionType: 'click' | 'double_click' | 'drag' | 'type';
  };
}

export const DEMO_OCCLUDED_CAPTURE_METADATA: CaptureFrameMetadata = {
  frameId: 40192,
  timestampMs: 1718291040000,
  hwnd: "0x000A04E2",
  sourceApp: "com.microsoft.VSCode",
  pixelWidth: 2730,
  pixelHeight: 1545,
  format: "BGRA8",
  dpiScale: 1.5,
  isOccluded: true,
  settlingState: {
    status: "settling",
    baseDelayMs: 1000,
    spinnerHoldMs: 1420,
    maxHoldMs: 5000,
    hasActiveSpinner: true,
    opticalDeltaPct: 8.4,
  },
  activeTrajectory: {
    from: { x: 420, y: 180 },
    to: { x: 840, y: 320 },
    controlPoint1: { x: 580, y: 160 },
    controlPoint2: { x: 720, y: 280 },
    durationMs: 450,
    targetElementIndex: 14,
    actionType: "click",
  },
};
// ============================================================================
// [END_DEMO_STUB: OccludedCaptureMock]
// ============================================================================
```

---

## 5. Comprehensive Test Case Catalog

This catalog outlines mandatory automated and manual verification procedures for the Computer Use workspace.

| Test ID | Scenario | Pre-Conditions | Execution Steps | Expected Result | Pass Criteria |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **TC-CU-001** | **Window Rehydration Failure** | Target window is actively executing multi-step action. | 1. User closes target app window externally (`Alt+F4` or taskkill).<br>2. Agent attempts next click in trajectory. | Daemon intercepts invalid `HWND` error (`ERROR_INVALID_WINDOW_HANDLE`), halts trajectory, renders banner: *"Target window terminated"*, and offers window re-selection picker. | Zero process crash. Trajectory steps transition cleanly to `error` state. |
| **TC-CU-002** | **DPI Scaling Shift** | Multi-monitor setup with 100% (1.0x) and 200% (2.0x) scale factors. | 1. Window starts on Monitor 1 (1.0x).<br>2. User drags window to Monitor 2 (2.0x).<br>3. Agent dispatches click. | Daemon handles `WM_DPICHANGED`, updates unscaled coordinate multiplier to `2.0x`. Click lands on exact logical element center. | Physical click coordinates match $X_{logical} \times 2.0$. Coordinate error $\le 1$ pixel. |
| **TC-CU-003** | **Modal Dialog Occlusion** | Target window opens a modal confirmation box (e.g. "Save before closing?"). | 1. Main window enters disabled state.<br>2. Agent attempts click on background parent window. | Focus manager flags `isModal === true`. Action targeting parent is blocked; UI prompts agent to address the top-level child modal first. | Prevents silent deadlock where agent clicks an inactive parent window indefinitely. |
| **TC-CU-004** | **Input Coordinate Drift** | Window resized by user or system reflow during active Bézier trajectory. | 1. Agent plans click at `(820, 300)`.<br>2. Window width resized by +200px before click dispatch. | If targeting by `element_index`, agent re-queries accessibility bounding rect and re-anchors destination point to new center. | Click hits the relocated button rather than stale absolute coordinates. |
| **TC-CU-005** | **DirectX Device Loss Recovery** | WGC stream active at 30 FPS. | 1. GPU driver reset or display sleep occurs (`DXGI_ERROR_DEVICE_RESET`). | Direct3D11 frame pool detects device loss, rebuilds device context, re-creates `Direct3D11CaptureFramePool`, and resumes stream within 500ms. | UI displays brief *"Reconnecting capture surface..."* toast; stream resumes without app restart. |
| **TC-CU-006** | **Stale Accessibility Tree Invalidation** | Dynamic UI changes internal DOM / node count. | 1. Node `#14` was target button.<br>2. Dynamic list insertion shifts node to `#18`. | Agent checks `name` and `role` before click dispatch. If mismatch detected, triggers full AX tree re-scan and updates target index. | Prevents clicking wrong element due to off-by-one index shifts. |
| **TC-CU-007** | **Adaptive Settling Spinner Timeout** | Web or native app displays an infinite loading spinner. | 1. Spinner radar detects continuous optical rotation.<br>2. Timer reaches 1000ms baseline. | Dynamic delay holds execution while checking delta. When hold reaches 5000ms ceiling, engine breaks hold, logs timeout warning, and proceeds to capture. | System never deadlocks on infinite spinner; maximum wait is strictly bounded at 5000ms. |
