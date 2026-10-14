# 04 — Interactive Scripting & NodeREPL Console: UI Specification

## Executive Summary
This document specifies the user interface, behavioral architecture, and operational workflows for SuperAgent's **Interactive Scripting & NodeREPL Console** (`cua-repl` and native scripting engine). As SuperAgent executes complex multi-turn Computer Use (CUA) and browser automation tasks, it requires an in-process, persistent JavaScript scripting host. 

Traditional CLI-based agent loops invoke standalone child processes for every command, destroying runtime memory, tab bindings, and window handles between turns. The **SuperAgent In-Process REPL** maintains persistent state across agent steps, providing real-time script evaluation, live variable reflection, high-volume token streaming (up to 25,000 tokens), ANSI color syntax rendering, and fail-safe interrupt controls.

---

## 1. Runtime Architecture & The In-Process Advantage

```mermaid
graph TD
    subgraph ClientUI ["SuperAgent Desktop / Web UI"]
        Toolbar["REPL Toolbar (Reset, Interrupt, Timer, Tokens)"]
        Editor["Script Editor & Scratchpad (Monaco / CodeMirror)"]
        Terminal["Virtualized Output Stream (25,000 Token Buffer)"]
        Inspector["Live Variable & Scope Tree Inspector"]
    end

    subgraph CoreBridge ["Core v2 JSON-RPC Bridge (:1469)"]
        WSServer["WebSocket Channel (/ws: 'cua-repl')"]
        RingBuffer["25k Sliding Token Ring Buffer"]
        AnsiParser["ANSI SGR Escape Parser"]
    end

    subgraph ScriptEngine ["In-Process NodeREPL Engine (cua-repl)"]
        V8Context["Persistent V8 Context (Global Scope)"]
        Bindings["APIs: cua, sky, targetWindow, activeTabs"]
        InterruptWatchdog["Execution Watchdog (SIGINT / Worker Terminate)"]
    end

    Editor -->|Execute Code Payload| WSServer
    Toolbar -->|js_reset / Interrupt| WSServer
    WSServer -->|IPC Call: eval(code)| V8Context
    V8Context -->|Bindings Interop| Bindings
    V8Context -->|stdout / stderr stream| RingBuffer
    RingBuffer --> AnsiParser
    AnsiParser -->|Virtual Stream| Terminal
    V8Context -->|Global Scope Reflection| Inspector
    InterruptWatchdog -->|Abort Signal| V8Context
```

### 1.1 Why In-Process Persistent REPL?
1. **Persistent Tab & Window Bindings**: A browser tab claimed via `const tab = await cua.getTab({ mention: '...' })` or an OS window bound via `const app = await cua.getApp({ windowId: 1042 })` remains live in memory across turns. Sub-sequent tool calls can invoke `await tab.click(...)` without repeating expensive discovery or handshakes.
2. **Deterministic State Diffs**: The accessibility tree is diffed directly in memory against the previous turn's snapshot (`disableDiffing: false`), reducing payload size by up to 85%.
3. **Interactive Human-in-the-Loop Scratchpad**: Developers and operators can pause agent execution, type test commands directly into the REPL console, inspect live objects, and resume autonomous execution seamlessly.

---

## 2. Interactive Terminal Console Layout & ASCII Wireframes

The REPL interface is organized into a modular 4-pane workbench:

```text
+----------------------------------------------------------------------------------------------------+
| ⚡ SuperAgent In-Process REPL Console [cua-repl]                  [● Live] [00:01.842s] [14.2k/25k] |
+----------------------------------------------------------------------------------------------------+
| [▶ Run (Ctrl+Enter)] [■ Interrupt] [↺ Reset (js_reset)] | [Snippets ▼] | [Clear] [Auto-Scroll: ON]  |
+------------------------------------------------------------------+---------------------------------+
| SCRIPT EDITOR & SCRATCHPAD (Monaco / CodeMirror)                 | LIVE VARIABLE & SCOPE INSPECTOR |
| 1  // Inspect active window and capture element tree             | ▼ Global Scope (6 objects)      |
| 2  const app = await cua.getApp({ windowId: targetWindow.id });  |   ▶ activeTabs: Array(2)        |
| 3  const ax = await app.getAXState({ disableDiffing: false });   |   ▼ targetWindow: Object        |
| 4  console.log(`AX Nodes discovered: ${ax.length}`);             |     • id: 2048                  |
| 5  await app.click([640, 360], { mouseButton: "left" });         |     • app: "Google Chrome"      |
|                                                                  |     • title: "GitHub - Dashboard"|
|                                                                  |     • isOccluded: false         |
|                                                                  |   ▼ cua: ComputerUseAPI         |
|                                                                  |     • target: "windows"         |
|                                                                  |   ▶ sky: Direct3D11Engine       |
|                                                                  |   • nodeRepl: BridgeRPC         |
+------------------------------------------------------------------+---------------------------------+
| TERMINAL OUTPUT STREAM (25,000 Output Token Ring Buffer)                                           |
| [14:24:01] cua_repl initialized in persistent mode (pid: 14082, node: v20.12.0)                   |
| [14:24:02] Connected surfaces: [computer, browser]                                                |
| > const app = await cua.getApp({ windowId: 2048 });                                               |
| < Bound to window 2048 ("GitHub - Dashboard")                                                     |
| > const ax = await app.getAXState({ disableDiffing: false });                                     |
| [AX Tree Diff] +2 elements added, -0 removed, ~1 updated                                          |
| AX Nodes discovered: 142                                                                          |
| > await app.click([640, 360], { mouseButton: "left" });                                           |
| < Synthetic left click dispatched at (640, 360) [Latency: 4.2ms]                                  |
|                                                                                                    |
+----------------------------------------------------------------------------------------------------+
| Console Prompt: > type javascript expression or cua command... (Tab to autocomplete)               |
+----------------------------------------------------------------------------------------------------+
```

### 2.1 Visual Design Tokens
- Canvas Background: `--brand-bg` (`#090d16`)
- Terminal Inner Panel: `#0c1322` with 1px border `rgba(255, 255, 255, 0.08)`
- Console Stream Font: `Fira Code`, `JetBrains Mono`, or `Cascadia Code` (12.5px / 1.6 line height)
- Live Streaming Indicator: `--neon-live` (`#06b6d4`) pulsing dot
- Output Syntax:
  - Strings: `#38bdf8` (Light Sky Blue)
  - Numbers / Booleans: `#f59e0b` (Amber)
  - Object Keys: `#94a3b8` (Slate 400)
  - Success Return (`<`): `#10b981` (Emerald)
  - Errors / Stacks: `#ef4444` (Rose 500)

---

## 3. High-Capacity 25,000 Output Token Streaming Buffer

Computer Use actions output extensive logs, accessibility trees, and DOM snapshots. Standard terminals suffer severe performance degradation when rendering large buffers. SuperAgent implements a dedicated **25,000 Token Virtualized Ring Buffer**.

### 3.1 Ring Buffer Implementation Rules
1. **Sliding Window Capacity**: The buffer holds a maximum of 25,000 output tokens (~100,000 characters). When execution exceeds 25,000 tokens, the oldest log chunks are purged from the top of the buffer.
2. **Virtual Truncation Notice**: When truncation occurs, the UI prepends a sticky notification banner:
   ```text
   [ ℹ️ Buffer Truncation: 4,120 oldest tokens evicted. Full log exported to: logs/repl_session_142.log ]
   ```
3. **DOM Virtualization**: Only lines currently visible within the terminal viewport (plus a 20-line overscan buffer) are mounted to the DOM. This ensures a consistent 60 FPS even during high-throughput output.
4. **Scroll Pinning**:
   - If the user is scrolled to the bottom, the viewport automatically pins to incoming stream chunks.
   - If the user scrolls up to inspect previous output, auto-scroll pauses and a floating pill appears: `↓ Jump to Bottom (+18 new lines)`.

### 3.2 ANSI SGR Color & Escape Sequence Parser
The console stream parses ANSI 3-bit, 4-bit, 8-bit (256-color), and 24-bit TrueColor sequences:
- `\x1b[31m` -> Red (Errors, critical warnings)
- `\x1b[32m` -> Green (Successful execution, added AX nodes)
- `\x1b[36m` -> Cyan (Live agent thoughts, active locator actions)
- `\x1b[35m` -> Magenta (Variable inspector references)
- `\x1b[2m`  -> Dim (Timestamps, debug line numbers)

---

## 4. Live Variable & Scope Inspector (Interactive Tree View)

The right sidebar provides a live, expandable reflection of the V8 execution context. Every global and scoped variable created by the agent or user is displayed in real time.

```text
▼ Global Scope (Active Runtime Context)
  ▼ activeTabs: Array(2)
    ▼ 0: Tab
      • id: "tab-chrome-8801"
      • url: "https://github.com/pulls"
      • title: "Pull Requests · SuperAgent"
      • providerTabId: "14092"
      • isLeased: true
    ▶ 1: Tab
  ▼ targetWindow: Object
    • id: 2048
    • app: "Google Chrome"
    • title: "GitHub - Dashboard"
    • bounds: [x: 100, y: 80, width: 1440, height: 900]
    • isMinimized: false
    • isOccluded: false
  ▼ cua: Object
    • target: "windows"
    ▶ launch_app: [Function: launch_app]
    ▶ getApp: [Function: getApp]
    ▶ listWindows: [Function: listWindows]
    ▶ createBrowserTab: [Function: createBrowserTab]
  ▼ sky: Object
    • captureEngine: "Direct3D11_WGC"
    • frameRateFps: 30
    ▶ captureOccludedFrame: [Function: captureOccludedFrame]
  ▼ memoryStats: Object
    • v8HeapUsed: "44.2 MB"
    • v8HeapTotal: "68.0 MB"
    • externalHandles: 14
```

### 4.1 Variable Tree Capabilities
- **Object Folding**: Deep objects and prototypes are lazy-loaded to prevent IPC saturation.
- **Copy Value**: Right-click context menu provides `Copy as JSON`, `Copy as Path (targetWindow.bounds[0])`, and `Log to Console`.
- **Memory Gauge**: Real-time progress bar showing V8 heap utilization against the 128 MB sandbox limit.

---

## 5. Console Toolbar & Control Operations

The top toolbar houses mission-critical execution controls:

```text
+----------------------------------------------------------------------------------------------------+
| [ ▶ Run (Ctrl+Enter) ] [ ■ Interrupt ] [ ↺ Reset (js_reset) ] | [ Snippets ▼ ] | [ 14,280 / 25k ]  |
+----------------------------------------------------------------------------------------------------+
```

### 5.1 Session Reset (`js_reset`)
When an agent encounters a broken state or variable collision, clicking `↺ Reset` invokes the `js_reset` tool routine:
- **Discards JS Bindings**: Clears all user-defined variables, functions, and global assignments in the V8 context.
- **Preserves OS Surfaces**: **Crucially, `js_reset` does NOT close open browser tabs or kill native applications.** It only resets the script execution context.
- **Auto-Reinitialization**: Initializes a fresh `cua` and `sky` API instance ready for the next command.

### 5.2 Interrupt Watchdog (`SIGINT`)
If an evaluated script encounters an infinite loop (e.g. `while(true) {}`) or an unresponsive network locator:
- Clicking `■ Interrupt` dispatches `SIGINT` to the execution worker.
- If the thread does not yield within 3,000ms, the worker thread is terminated (`worker.terminate()`) and immediately restarted.
- The terminal emits: `\x1b[31m[Script Interrupted: Execution aborted by user]\x1b[0m`.

### 5.3 Execution Timer & Token Counter
- **Timer**: Updates dynamically every 50ms during execution, settling on the final execution duration (e.g. `00:01.428s`).
- **Token Gauge**: Visual bar filling from Cyan (`<15k`) to Amber (`15k-22k`) to Red (`>22k`), warning when the 25k sliding window is nearing capacity.

---

## 6. Demo Data Stubs (`[DEMO_STUB]`)

The following standardized stubs provide complete mock data models for frontend development and visual regression tests:

```typescript
// ============================================================================
// [DEMO_STUB: ReplSessionState]
// DESCRIPTION: Mock session state for the In-Process REPL Console.
// BACKEND_ROUTE: WS /ws -> superagent_core_v2::protocol::events::ReplSessionEvent
// SEARCH_TAG: #DEMO_REPL_SESSION_STATE
// ============================================================================
export interface ReplSessionState {
  sessionId: string;
  runtimeVersion: string;
  nodeVersion: string;
  v8HeapUsedMb: number;
  v8HeapTotalMb: number;
  outputTokensUsed: number;
  outputTokenCapacity: number;
  isExecuting: boolean;
  executionStartTimeMs: number | null;
  lastExecutionDurationMs: number;
  enabledSurfaces: Array<"browser" | "computer" | "webmcp">;
  connectedSurfacesCount: number;
}

export const DEMO_REPL_SESSION: ReplSessionState = {
  sessionId: "repl-session-20261014-0982",
  runtimeVersion: "superagent-cua-repl-v2.4",
  nodeVersion: "v20.12.0",
  v8HeapUsedMb: 44.2,
  v8HeapTotalMb: 68.0,
  outputTokensUsed: 14280,
  outputTokenCapacity: 25000,
  isExecuting: false,
  executionStartTimeMs: null,
  lastExecutionDurationMs: 1428,
  enabledSurfaces: ["computer", "browser"],
  connectedSurfacesCount: 2,
};
// ============================================================================
// [END_DEMO_STUB: ReplSessionState]
// ============================================================================


// ============================================================================
// [DEMO_STUB: ReplVariableTreeDemo]
// DESCRIPTION: Mock live variable tree for the REPL Scope Inspector.
// BACKEND_ROUTE: GET /api/repl/variables -> superagent_core_v2::repl::inspect
// SEARCH_TAG: #DEMO_REPL_VARIABLE_TREE
// ============================================================================
export interface VariableNode {
  name: string;
  type: "string" | "number" | "boolean" | "object" | "array" | "function" | "promise";
  valuePreview: string;
  children?: VariableNode[];
  isExpandable: boolean;
}

export const DEMO_REPL_VARIABLE_TREE: VariableNode[] = [
  {
    name: "targetWindow",
    type: "object",
    valuePreview: "WindowInfo { id: 2048, app: 'Google Chrome' }",
    isExpandable: true,
    children: [
      { name: "id", type: "number", valuePreview: "2048", isExpandable: false },
      { name: "app", type: "string", valuePreview: "'Google Chrome'", isExpandable: false },
      { name: "title", type: "string", valuePreview: "'GitHub - Dashboard'", isExpandable: false },
      { name: "bounds", type: "array", valuePreview: "[100, 80, 1440, 900]", isExpandable: false },
      { name: "isOccluded", type: "boolean", valuePreview: "false", isExpandable: false },
    ],
  },
  {
    name: "activeTabs",
    type: "array",
    valuePreview: "Array(2) [Tab, Tab]",
    isExpandable: true,
    children: [
      {
        name: "0",
        type: "object",
        valuePreview: "Tab { id: 'tab-8801', url: 'https://github.com' }",
        isExpandable: true,
        children: [
          { name: "id", type: "string", valuePreview: "'tab-8801'", isExpandable: false },
          { name: "url", type: "string", valuePreview: "'https://github.com/pulls'", isExpandable: false },
          { name: "title", type: "string", valuePreview: "'Pull Requests · SuperAgent'", isExpandable: false },
          { name: "isLeased", type: "boolean", valuePreview: "true", isExpandable: false },
        ],
      },
    ],
  },
  {
    name: "cua",
    type: "object",
    valuePreview: "ComputerUseAPI { target: 'windows' }",
    isExpandable: true,
    children: [
      { name: "target", type: "string", valuePreview: "'windows'", isExpandable: false },
      { name: "getState", type: "function", valuePreview: "[AsyncFunction: getState]", isExpandable: false },
      { name: "getApp", type: "function", valuePreview: "[AsyncFunction: getApp]", isExpandable: false },
      { name: "listWindows", type: "function", valuePreview: "[AsyncFunction: listWindows]", isExpandable: false },
      { name: "createBrowserTab", type: "function", valuePreview: "[AsyncFunction: createBrowserTab]", isExpandable: false },
    ],
  },
  {
    name: "sky",
    type: "object",
    valuePreview: "Direct3D11Engine { captureEngine: 'WGC' }",
    isExpandable: true,
    children: [
      { name: "captureEngine", type: "string", valuePreview: "'Direct3D11_WGC'", isExpandable: false },
      { name: "frameRateFps", type: "number", valuePreview: "30", isExpandable: false },
    ],
  },
];
// ============================================================================
// [END_DEMO_STUB: ReplVariableTreeDemo]
// ============================================================================


// ============================================================================
// [DEMO_STUB: ReplSnippetTemplates]
// DESCRIPTION: Quick-insert script snippets for the REPL Toolbar.
// BACKEND_ROUTE: GET /api/repl/snippets -> superagent_core_v2::repl::snippets
// SEARCH_TAG: #DEMO_REPL_SNIPPETS
// ============================================================================
export interface ScriptSnippet {
  id: string;
  name: string;
  category: "Computer Use" | "Browser" | "Diagnostics";
  description: string;
  codeTemplate: string;
}

export const DEMO_REPL_SNIPPETS: ScriptSnippet[] = [
  {
    id: "snip-cua-ax-diff",
    name: "Observe Fresh AX State",
    category: "Computer Use",
    description: "Fetches accessibility tree diff for active window.",
    codeTemplate: `// Inspect current accessibility tree state\nconst app = await cua.getApp({ windowId: targetWindow.id });\nconst axState = await app.getAXState({ disableDiffing: false });\nconsole.log(axState);`,
  },
  {
    id: "snip-browser-claim-fill",
    name: "Claim Tab & Fill Locator",
    category: "Browser",
    description: "Claims an existing browser tab and fills input locator.",
    codeTemplate: `// Claim tab and perform locator input\nconst tab = await cua.getTab({ mention: 'tab-v1' });\nconst input = tab.playwright.locator('input[name="search"]');\nawait input.fill('SuperAgent Next-Gen UI');\nawait tab.pressKey(null, 'Enter');`,
  },
  {
    id: "snip-wgc-occluded-capture",
    name: "Capture Occluded Window Frame",
    category: "Computer Use",
    description: "Captures Direct3D11 swapchain buffer without raising window.",
    codeTemplate: `// Capture background window via WGC Direct3D11 swapchain\nconst screenshot = await app.getScreenshot();\nconsole.log(\`Captured screenshot buffer: \${screenshot.byteLength} bytes\`);`,
  },
  {
    id: "snip-diag-reset",
    name: "Diagnostic Session Reset",
    category: "Diagnostics",
    description: "Resets V8 variable environment without closing apps.",
    codeTemplate: `// Clear persistent JS bindings\nawait nodeRepl.rpc('js_reset', {});\nconsole.log('Session bindings cleared successfully.');`,
  },
];
// ============================================================================
// [END_DEMO_STUB: ReplSnippetTemplates]
// ============================================================================
```

---

## 7. Exhaustive Verification & Test Case Catalog

| Test ID | Test Scenario | Input / Execution Condition | Expected Behavioral Assertion | Pass / Fail Criteria |
| :--- | :--- | :--- | :--- | :--- |
| `REPL-TST-01` | **25,000 Token Buffer Eviction** | Script emits 35,000 tokens of stdout via tight logging loop. | Sliding ring buffer caps memory at 25,000 tokens. Truncation banner displayed. | **PASS**: No browser UI freezing; oldest 10k tokens evicted cleanly. |
| `REPL-TST-02` | **Infinite Loop Interruption** | Script runs `while(true) {}`. Operator clicks `■ Interrupt`. | `SIGINT` dispatches immediately; execution aborts within <3,000ms. | **PASS**: Worker thread terminates and recovers; UI returns to idle prompt. |
| `REPL-TST-03` | **`js_reset` Context Isolation** | Script sets `globalThis.mySecret = 123`. Operator executes `js_reset`. | All global variables purged. Open tabs and windows remain untouched. | **PASS**: `typeof mySecret === 'undefined'`; existing browser tabs stay connected. |
| `REPL-TST-04` | **ANSI TrueColor Rendering** | Script outputs ANSI 24-bit escape codes (`\x1b[38;2;6;182;212mCyan`). | Terminal renders text in RGB(6, 182, 212) without raw escape leak. | **PASS**: Colors rendered accurately; zero raw `\x1b` escape sequences visible. |
| `REPL-TST-05` | **Cyclic Object Reflection** | User defines object with cyclic reference: `a.self = a`. | Variable Inspector handles cycle gracefully without stack overflow. | **PASS**: Inspector displays `[Circular]` badge; UI remains responsive. |
| `REPL-TST-06` | **Scroll Pinning & Jump-to-Bottom**| Output streams continuously while user scrolls up 300px. | Viewport remains pinned at scroll position; floating jump button appears. | **PASS**: User reading position preserved; jump button snaps to bottom. |
| `REPL-TST-07` | **V8 Heap Memory Threshold** | Script allocates large ArrayBuffers exceeding 128 MB sandbox limit. | Guardian intercepts allocation; logs memory exhaustion error cleanly. | **PASS**: REPL throws Out-Of-Memory error without crashing Core daemon. |
| `REPL-TST-08` | **Snippet One-Click Insertion** | User clicks snippet "Claim Tab & Fill Locator" from Snippets menu. | Code template inserts at cursor position with proper indentation. | **PASS**: Monaco editor loads snippet text; syntax highlighting applies instantly. |
