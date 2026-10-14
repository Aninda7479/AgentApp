// ============================================================================
// SuperAgent Web Client — Master Demo Data Models & Stubs
// ============================================================================
// This file houses comprehensive mock models and fixtures for all 10 workspaces:
// Chat, Computer Use, Browser Leasing, REPL, Security Guardian, Companion 3D,
// Creative Canvas, Hardware ECAD, Tasks Kanban, and Settings Matrix.
// ============================================================================

export interface TrajectoryThought {
  durationSeconds: number;
  content: string;
}

export interface TrajectoryToolCall {
  id: string;
  category: 'Ran' | 'Edited' | 'Read' | 'Searched' | 'Browsed';
  toolName: string;
  target: string;
  parameters: Record<string, unknown>;
  result?: string;
  diffStats?: { added: number; removed: number };
  codeDiff?: { before: string; after: string };
  terminalOutput?: string;
}

export interface QuizQuestion {
  id: string;
  question: string;
  options: string[];
  selectedOption?: number;
  explanation?: string;
}

export interface DemoChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: string;
  thought?: TrajectoryThought;
  toolCalls?: TrajectoryToolCall[];
  quiz?: QuizQuestion;
}

// ============================================================================
// [DEMO_STUB: ChatTrajectory]
// DESCRIPTION: Multi-turn autonomous agent execution trace with collapsible reasoning, tool executions with diffs, and interactive quiz prompts.
// BACKEND_ROUTE: /api/conversations/:id/steps -> packages/core_v2/src/server/routes.rs::get_conversation_steps
// SEARCH_TAG: #DEMO_CHAT_TRAJECTORY
// ============================================================================
export const DEMO_CHAT_TRAJECTORY: DemoChatMessage[] = [
  {
    id: 'msg-01',
    role: 'user',
    content: 'Optimize the WGC capture loop in packages/core_v2 and verify screen settling time.',
    timestamp: '10:14:02 AM',
  },
  {
    id: 'msg-02',
    role: 'assistant',
    content: 'I have analyzed the Windows Graphics Capture (WGC) frame pump in `packages/core_v2`. I will profile the frame pacing, apply zero-copy surface blits, and verify the 250ms settling countdown.',
    timestamp: '10:14:05 AM',
    thought: {
      durationSeconds: 4.2,
      content: 'Inspecting packages/core_v2/src/tools/builtin/computer_use.rs for DirectX Direct3D11 device creation.\nThe frame arriving callback is holding a mutex lock during pixel buffer memcpy.\nRefactoring to double-buffered staging texture with DXGI_FORMAT_B8G8R8A8_UNORM swapchain.\nSettling check should measure pixel delta across 3 consecutive 16ms v-blanks.',
    },
    toolCalls: [
      {
        id: 'tc-01',
        category: 'Read',
        toolName: 'view_file',
        target: 'packages/core_v2/src/tools/builtin/computer_use.rs#L45-L92',
        parameters: { path: 'packages/core_v2/src/tools/builtin/computer_use.rs', lines: [45, 92] },
        result: 'Found WgcCaptureSession struct with Direct3D11CaptureFramePool.',
      },
      {
        id: 'tc-02',
        category: 'Edited',
        toolName: 'replace_file_content',
        target: 'packages/core_v2/src/tools/builtin/computer_use.rs',
        diffStats: { added: 18, removed: 4 },
        parameters: { file: 'computer_use.rs', hunkId: 1 },
        codeDiff: {
          before: 'let frame = pool.TryGetNextFrame()?;\nlet surface = frame.Surface()?;\nlet bytes = copy_pixels_blocking(&surface)?;',
          after: 'let frame = pool.TryGetNextFrame()?;\nlet surface = frame.Surface()?;\n// Zero-copy staging swapchain texture map\nlet bytes = map_staging_surface_async(&device, &surface).await?;',
        },
      },
      {
        id: 'tc-03',
        category: 'Ran',
        toolName: 'run_command',
        target: 'cargo test -p superagent-core-v2 wgc_capture',
        parameters: { command: 'cargo test -p superagent-core-v2 wgc_capture' },
        terminalOutput: 'running 3 tests\ntest tools::computer_use::tests::test_wgc_device_creation ... ok\ntest tools::computer_use::tests::test_occlusion_bounding_box ... ok\ntest tools::computer_use::tests::test_settling_countdown_jitter ... ok\n\ntest result: ok. 3 passed; 0 failed; finished in 0.42s',
      },
    ],
    quiz: {
      id: 'quiz-01',
      question: 'Which frame capture buffer strategy should SuperAgent default to for low-latency window automation?',
      options: [
        'Direct3D11 Double-Buffered Staging (Zero-copy GPU blit, ~4ms latency)',
        'GDI BitBlt Legacy Screen Copy (CPU bounded, 35ms latency)',
        'Desktop Duplication API with fallback cursor overlay',
        'WebRTC Screen Share Virtual Sink',
      ],
      selectedOption: 0,
      explanation: 'Direct3D11 staging textures allow sub-5ms occluded window capture without CPU readback bottlenecks.',
    },
  },
];
// ============================================================================
// [END_DEMO_STUB: ChatTrajectory]
// ============================================================================

export interface WindowCard {
  pid: number;
  hwnd: string;
  title: string;
  processName: string;
  geometry: { x: number; y: number; width: number; height: number };
  isOccluded: boolean;
  captureFps: number;
  selected?: boolean;
}

// ============================================================================
// [DEMO_STUB: ComputerUseWindows]
// DESCRIPTION: Active top-level desktop windows with PID, HWND handles, coordinate geometry, and WGC occlusion detection flags.
// BACKEND_ROUTE: /api/desktop/windows -> packages/core_v2/src/tools/builtin/computer_use.rs::list_windows
// SEARCH_TAG: #DEMO_COMPUTER_USE_WINDOWS
// ============================================================================
export const DEMO_WINDOWS: WindowCard[] = [
  {
    pid: 14208,
    hwnd: '0x002B0F4C',
    title: 'KiCad 9.0 - SmartSensor_RevC.kicad_pcb',
    processName: 'kicad.exe',
    geometry: { x: 120, y: 80, width: 1440, height: 900 },
    isOccluded: false,
    captureFps: 60,
    selected: true,
  },
  {
    pid: 8940,
    hwnd: '0x001A4E90',
    title: 'Google Chrome - SuperAgent WebMCP Console',
    processName: 'chrome.exe',
    geometry: { x: 0, y: 0, width: 1920, height: 1080 },
    isOccluded: true,
    captureFps: 30,
    selected: false,
  },
  {
    pid: 21544,
    hwnd: '0x003D1A02',
    title: 'Visual Studio Code - AgentApp (Workspace)',
    processName: 'Code.exe',
    geometry: { x: 200, y: 150, width: 1600, height: 960 },
    isOccluded: false,
    captureFps: 60,
    selected: false,
  },
  {
    pid: 6112,
    hwnd: '0x000F881A',
    title: 'Windows Terminal (PowerShell 7)',
    processName: 'WindowsTerminal.exe',
    geometry: { x: 450, y: 300, width: 1100, height: 650 },
    isOccluded: true,
    captureFps: 15,
    selected: false,
  },
];
// ============================================================================
// [END_DEMO_STUB: ComputerUseWindows]
// ============================================================================

export interface AccessibilityNode {
  element_index: number;
  role: string;
  name: string;
  bounds: { x: number; y: number; width: number; height: number };
  state: string[];
  children?: AccessibilityNode[];
}

// ============================================================================
// [DEMO_STUB: AccessibilityTree]
// DESCRIPTION: Hierarchical UI Automation / Accessibility tree showing element indices, roles, and bounding boxes for cursor targeting.
// BACKEND_ROUTE: /api/desktop/a11y-tree -> packages/core_v2/src/tools/builtin/computer_use.rs::get_accessibility_tree
// SEARCH_TAG: #DEMO_ACCESSIBILITY_TREE
// ============================================================================
export const DEMO_ACCESSIBILITY_TREE: AccessibilityNode = {
  element_index: 0,
  role: 'Window',
  name: 'KiCad 9.0 - SmartSensor_RevC.kicad_pcb',
  bounds: { x: 120, y: 80, width: 1440, height: 900 },
  state: ['focusable', 'focused'],
  children: [
    {
      element_index: 1,
      role: 'MenuBar',
      name: 'Application Menu',
      bounds: { x: 120, y: 80, width: 1440, height: 28 },
      state: ['enabled'],
      children: [
        {
          element_index: 2,
          role: 'MenuItem',
          name: 'File',
          bounds: { x: 124, y: 82, width: 42, height: 24 },
          state: ['selectable'],
        },
        {
          element_index: 3,
          role: 'MenuItem',
          name: 'Edit',
          bounds: { x: 168, y: 82, width: 44, height: 24 },
          state: ['selectable'],
        },
        {
          element_index: 4,
          role: 'MenuItem',
          name: 'Inspect',
          bounds: { x: 214, y: 82, width: 62, height: 24 },
          state: ['selectable'],
        },
      ],
    },
    {
      element_index: 5,
      role: 'ToolBar',
      name: 'Design Rules & Routing Toolbar',
      bounds: { x: 120, y: 108, width: 1440, height: 40 },
      state: ['enabled'],
      children: [
        {
          element_index: 6,
          role: 'Button',
          name: 'Run Electrical Rules Check (ERC)',
          bounds: { x: 130, y: 112, width: 32, height: 32 },
          state: ['clickable', 'focusable'],
        },
        {
          element_index: 7,
          role: 'Button',
          name: 'Interactive Router (P)',
          bounds: { x: 170, y: 112, width: 32, height: 32 },
          state: ['clickable'],
        },
        {
          element_index: 8,
          role: 'ComboBox',
          name: 'Active Copper Layer',
          bounds: { x: 210, y: 116, width: 140, height: 24 },
          state: ['expandable', 'haspopup'],
        },
      ],
    },
    {
      element_index: 9,
      role: 'Canvas',
      name: 'Board Editor Layout Canvas',
      bounds: { x: 120, y: 148, width: 1180, height: 832 },
      state: ['focusable', 'droptarget'],
      children: [
        {
          element_index: 10,
          role: 'Graphic',
          name: 'U1 Microcontroller (RP2040 QFN-56)',
          bounds: { x: 540, y: 410, width: 160, height: 160 },
          state: ['selected', 'draggable'],
        },
        {
          element_index: 11,
          role: 'Graphic',
          name: 'C1 100nF Decoupling Capacitor',
          bounds: { x: 710, y: 430, width: 30, height: 15 },
          state: ['interactive'],
        },
      ],
    },
  ],
};
// ============================================================================
// [END_DEMO_STUB: AccessibilityTree]
// ============================================================================

export interface BezierControlPoint {
  x: number;
  y: number;
  t: number;
  velocityPxPerSec: number;
}

export interface MouseTrajectoryData {
  start: { x: number; y: number };
  end: { x: number; y: number };
  controlPoint1: { x: number; y: number };
  controlPoint2: { x: number; y: number };
  totalDurationMs: number;
  samples: BezierControlPoint[];
  currentSettlingCountdownMs: number;
  settlingThresholdMs: number;
  isSettled: boolean;
}

// ============================================================================
// [DEMO_STUB: MouseTrajectory]
// DESCRIPTION: Humanized cubic Bézier cursor path with velocity profiling and adaptive UI settling countdown.
// BACKEND_ROUTE: /api/desktop/mouse-trajectory -> packages/core_v2/src/tools/builtin/computer_use.rs::simulate_human_cursor
// SEARCH_TAG: #DEMO_MOUSE_TRAJECTORY
// ============================================================================
export const DEMO_MOUSE_TRAJECTORY: MouseTrajectoryData = {
  start: { x: 240, y: 180 },
  end: { x: 540, y: 410 },
  controlPoint1: { x: 310, y: 150 },
  controlPoint2: { x: 480, y: 320 },
  totalDurationMs: 420,
  currentSettlingCountdownMs: 38,
  settlingThresholdMs: 250,
  isSettled: false,
  samples: [
    { x: 240, y: 180, t: 0.0, velocityPxPerSec: 0 },
    { x: 275, y: 195, t: 0.15, velocityPxPerSec: 480 },
    { x: 340, y: 240, t: 0.35, velocityPxPerSec: 920 },
    { x: 410, y: 305, t: 0.6, velocityPxPerSec: 1180 },
    { x: 485, y: 370, t: 0.85, velocityPxPerSec: 640 },
    { x: 540, y: 410, t: 1.0, velocityPxPerSec: 0 },
  ],
};
// ============================================================================
// [END_DEMO_STUB: MouseTrajectory]
// ============================================================================

export interface BrowserTabLease {
  tabId: string;
  url: string;
  title: string;
  tier: 'claimExistingTab' | 'createTab';
  leaseholderAgentId: string;
  remainingSeconds: number;
  initialLeaseSeconds: number;
  faviconUrl?: string;
  isAudited: boolean;
  cdpSessionId: string;
}

// ============================================================================
// [DEMO_STUB: BrowserTabs]
// DESCRIPTION: Two-tiered tab leasing deck distinguishing between user-shared claimed tabs and sandboxed ephemeral tabs.
// BACKEND_ROUTE: /api/browser/leases -> packages/core_v2/src/tools/builtin/browser.rs::list_tab_leases
// SEARCH_TAG: #DEMO_BROWSER_TABS
// ============================================================================
export const DEMO_BROWSER_TABS: BrowserTabLease[] = [
  {
    tabId: 'tab-sec-8841',
    url: 'https://github.com/Aninda7479/AgentApp/pulls',
    title: 'Pull Requests · Aninda7479/AgentApp',
    tier: 'claimExistingTab',
    leaseholderAgentId: 'agent-core-traversal-01',
    remainingSeconds: 274,
    initialLeaseSeconds: 600,
    isAudited: true,
    cdpSessionId: 'CDP-992B-18AC',
  },
  {
    tabId: 'tab-sec-1049',
    url: 'https://jlcpcb.com/quote/pcbOrder',
    title: 'JLCPCB Instant PCB Quote & SMT Assembly',
    tier: 'createTab',
    leaseholderAgentId: 'agent-hardware-bom-runner',
    remainingSeconds: 495,
    initialLeaseSeconds: 900,
    isAudited: true,
    cdpSessionId: 'CDP-448E-52FE',
  },
  {
    tabId: 'tab-sec-3312',
    url: 'https://docs.rs/tokio/latest/tokio/sync/struct.RwLock.html',
    title: 'RwLock in tokio::sync - Rust',
    tier: 'claimExistingTab',
    leaseholderAgentId: 'agent-core-doc-researcher',
    remainingSeconds: 65,
    initialLeaseSeconds: 300,
    isAudited: false,
    cdpSessionId: 'CDP-771A-39CC',
  },
];
// ============================================================================
// [END_DEMO_STUB: BrowserTabs]
// ============================================================================

export interface WebMcpTool {
  name: string;
  description: string;
  parameters: {
    type: string;
    properties: Record<string, { type: string; description: string; required?: boolean }>;
    required: string[];
  };
  injectedScriptSizeKb: number;
  callCount: number;
}

// ============================================================================
// [DEMO_STUB: WebMcpTools]
// DESCRIPTION: In-page DOM-injected WebMCP tools registry enabling structured data extraction and form operations.
// BACKEND_ROUTE: /api/browser/webmcp/tools -> packages/core_v2/src/mcp/webmcp.rs::get_registered_tools
// SEARCH_TAG: #DEMO_WEBMCP_TOOLS
// ============================================================================
export const DEMO_WEBMCP_TOOLS: WebMcpTool[] = [
  {
    name: 'query_table',
    description: 'Extracts tabular DOM datasets into JSON rows matching column headers.',
    parameters: {
      type: 'object',
      properties: {
        tableSelector: { type: 'string', description: 'CSS or XPath selector for <table> element', required: true },
        maxRows: { type: 'number', description: 'Maximum rows to paginate' },
      },
      required: ['tableSelector'],
    },
    injectedScriptSizeKb: 4.8,
    callCount: 142,
  },
  {
    name: 'fill_checkout_form',
    description: 'Securely auto-fills billing, shipping address and tokenized payment fields without credential leakage.',
    parameters: {
      type: 'object',
      properties: {
        formSelector: { type: 'string', description: 'Form wrapper element selector', required: true },
        profileAlias: { type: 'string', description: 'Vault credential profile alias', required: true },
      },
      required: ['formSelector', 'profileAlias'],
    },
    injectedScriptSizeKb: 8.2,
    callCount: 29,
  },
  {
    name: 'extract_article_content',
    description: 'Strips headers, navigation chrome, and advertisements to isolate main semantic article text.',
    parameters: {
      type: 'object',
      properties: {
        preserveCodeBlocks: { type: 'boolean', description: 'Keep markdown pre/code blocks intact' },
      },
      required: [],
    },
    injectedScriptSizeKb: 3.4,
    callCount: 88,
  },
];
// ============================================================================
// [END_DEMO_STUB: WebMcpTools]
// ============================================================================

export interface CdpStreamEvent {
  id: string;
  timestamp: string;
  method: string;
  latencyMs: number;
  payloadSummary: string;
  status: 'ok' | 'warning' | 'error';
}

// ============================================================================
// [DEMO_STUB: CdpStreamEvents]
// DESCRIPTION: Chrome DevTools Protocol event stream telemetry capturing network calls, DOM mutations, and runtime evaluates.
// BACKEND_ROUTE: /api/browser/cdp/stream -> packages/core_v2/src/tools/builtin/browser.rs::stream_cdp_events
// SEARCH_TAG: #DEMO_CDP_STREAM_EVENTS
// ============================================================================
export const DEMO_CDP_EVENTS: CdpStreamEvent[] = [
  {
    id: 'cdp-01',
    timestamp: '10:14:18.102',
    method: 'Page.navigate',
    latencyMs: 142,
    payloadSummary: 'url="https://github.com/Aninda7479/AgentApp/pull/84"',
    status: 'ok',
  },
  {
    id: 'cdp-02',
    timestamp: '10:14:18.245',
    method: 'DOM.getDocument',
    latencyMs: 24,
    payloadSummary: 'depth=3, pierce=true -> RootNodeId=1',
    status: 'ok',
  },
  {
    id: 'cdp-03',
    timestamp: '10:14:18.320',
    method: 'Runtime.evaluate',
    latencyMs: 12,
    payloadSummary: 'expression="window.__SUPERAGENT_BADGE__.mount()"',
    status: 'ok',
  },
  {
    id: 'cdp-04',
    timestamp: '10:14:18.680',
    method: 'Network.requestWillBeSent',
    latencyMs: 8,
    payloadSummary: 'url="https://api.github.com/_private/browser/stats" method="POST"',
    status: 'ok',
  },
  {
    id: 'cdp-05',
    timestamp: '10:14:19.012',
    method: 'Input.dispatchMouseEvent',
    latencyMs: 15,
    payloadSummary: 'type="mouseMoved", x=420, y=318, button="none"',
    status: 'ok',
  },
];
// ============================================================================
// [END_DEMO_STUB: CdpStreamEvents]
// ============================================================================

export interface ReplBufferEntry {
  id: string;
  timestamp: string;
  input: string;
  rawAnsiOutput: string;
  tokenCount: number;
  durationMs: number;
  status: 'ok' | 'error';
}

// ============================================================================
// [DEMO_STUB: ReplBuffer]
// DESCRIPTION: Virtualized in-process REPL history buffer supporting up to 25,000 tokens with ANSI syntax escape parsing.
// BACKEND_ROUTE: /api/repl/execute -> packages/core_v2/src/tools/builtin/repl.rs::eval_repl_chunk
// SEARCH_TAG: #DEMO_REPL_BUFFER
// ============================================================================
export const DEMO_REPL_ENTRIES: ReplBufferEntry[] = [
  {
    id: 'repl-01',
    timestamp: '10:12:00',
    input: 'const core = await SuperAgent.connect();\nconsole.log(core.status);',
    rawAnsiOutput: '\x1b[32m[OK]\x1b[0m Connected to SuperAgent Core v2 (PID 1469)\n\x1b[36m{\x1b[0m status: \x1b[33m"active"\x1b[0m, uptime_sec: \x1b[35m3820\x1b[0m, active_leases: \x1b[35m3\x1b[0m \x1b[36m}\x1b[0m',
    tokenCount: 48,
    durationMs: 14,
    status: 'ok',
  },
  {
    id: 'repl-02',
    timestamp: '10:12:35',
    input: 'await core.inspectWindow({ pid: 14208 });',
    rawAnsiOutput: '\x1b[34m[WGC_INSPECT]\x1b[0m HWND: \x1b[1m0x002B0F4C\x1b[0m\nWindow: \x1b[32m"KiCad 9.0"\x1b[0m | Bounds: 1440x900\nOcclusion: \x1b[32mFALSE\x1b[0m (Direct3D11 zero-copy ready)',
    tokenCount: 62,
    durationMs: 28,
    status: 'ok',
  },
  {
    id: 'repl-03',
    timestamp: '10:13:10',
    input: 'await core.evalMath("2 ** 32 - 1");',
    rawAnsiOutput: '\x1b[35m4294967295\x1b[0m (u32::MAX)',
    tokenCount: 16,
    durationMs: 4,
    status: 'ok',
  },
  {
    id: 'repl-04',
    timestamp: '10:13:45',
    input: 'throw new Error("Simulated memory guard trip");',
    rawAnsiOutput: '\x1b[31mError: Simulated memory guard trip\x1b[0m\n    at eval (repl:1:7)\n    at ReplEngine.execute (packages/core_v2/src/repl.rs:88)',
    tokenCount: 34,
    durationMs: 6,
    status: 'error',
  },
];
// ============================================================================
// [END_DEMO_STUB: ReplBuffer]
// ============================================================================

export interface VariableScopeItem {
  name: string;
  type: string;
  value: string;
  scope: 'Global' | 'Local' | 'Closure';
  expandable?: boolean;
  children?: VariableScopeItem[];
}

// ============================================================================
// [DEMO_STUB: ReplScopes]
// DESCRIPTION: Live execution variable inspect tree across Global, Local, and Closure scopes.
// BACKEND_ROUTE: /api/repl/scope -> packages/core_v2/src/tools/builtin/repl.rs::inspect_scope
// SEARCH_TAG: #DEMO_REPL_SCOPES
// ============================================================================
export const DEMO_REPL_SCOPES: VariableScopeItem[] = [
  {
    name: 'core',
    type: 'DaemonClient',
    value: '{ isConnected: true, port: 1469 }',
    scope: 'Local',
    expandable: true,
    children: [
      { name: 'isConnected', type: 'boolean', value: 'true', scope: 'Local' },
      { name: 'port', type: 'number', value: '1469', scope: 'Local' },
      { name: 'version', type: 'string', value: '"0.44.0"', scope: 'Local' },
    ],
  },
  {
    name: 'activeWindow',
    type: 'WindowHandle',
    value: '0x002B0F4C (KiCad 9.0)',
    scope: 'Local',
  },
  {
    name: 'MAX_TOKEN_BUFFER',
    type: 'number',
    value: '25000',
    scope: 'Global',
  },
  {
    name: 'sessionSecret',
    type: 'SecretKey',
    value: '•••••••••••••••• (Protected)',
    scope: 'Closure',
  },
];
// ============================================================================
// [END_DEMO_STUB: ReplScopes]
// ============================================================================

export interface SecurityConfirmationTier {
  id: 'handoff' | 'always_confirm' | 'pre_approval' | 'no_confirmation';
  title: string;
  riskRating: 'Critical' | 'High' | 'Medium' | 'Low';
  description: string;
  badgeColor: string;
  allowedActions: string[];
}

// ============================================================================
// [DEMO_STUB: SecurityTiers]
// DESCRIPTION: 4-Tier Confirmation Matrix defining autonomous privilege elevation boundaries.
// BACKEND_ROUTE: /api/security/tiers -> packages/core_v2/src/storage/auth.rs::get_security_tiers
// SEARCH_TAG: #DEMO_SECURITY_TIERS
// ============================================================================
export const DEMO_CONFIRMATION_TIERS: SecurityConfirmationTier[] = [
  {
    id: 'handoff',
    title: 'Tier 0: Full Hand-Off',
    riskRating: 'Critical',
    description: 'Requires explicit human supervisor takeover. Agent pauses execution and yields OS mouse & keyboard control.',
    badgeColor: '#ef4444',
    allowedActions: ['Inspect read-only state', 'Render suggestion banner', 'Request human takeover'],
  },
  {
    id: 'always_confirm',
    title: 'Tier 1: Always Confirm',
    riskRating: 'High',
    description: 'Modal authorization required for every modifying OS or file action (Bash scripts, writes, purchases).',
    badgeColor: '#f59e0b',
    allowedActions: ['Read files', 'Grep code', 'Stage commands awaiting approval click'],
  },
  {
    id: 'pre_approval',
    title: 'Tier 2: Pre-Approval Window',
    riskRating: 'Medium',
    description: 'Pre-authorizes safe operations within a 15-minute lease (e.g. running unit tests, formatting code).',
    badgeColor: '#06b6d4',
    allowedActions: ['Run designated test suites', 'Edit files within Git repository root', 'Create browser tabs'],
  },
  {
    id: 'no_confirmation',
    title: 'Tier 3: Autonomous Mode',
    riskRating: 'Low',
    description: 'Full autonomy within sandboxed workspace without interactive popups.',
    badgeColor: '#10b981',
    allowedActions: ['Full autonomous agent trajectory execution', 'In-memory REPL evaluation', 'Autonomous tool chains'],
  },
];
// ============================================================================
// [END_DEMO_STUB: SecurityTiers]
// ============================================================================

export interface ZoDecisionState {
  stateIndex: number;
  name: string;
  category: 'Ingress' | 'Validation' | 'Execution' | 'Audit' | 'Remediation';
  description: string;
  active: boolean;
}

// ============================================================================
// [DEMO_STUB: ZoDecisionMachine]
// DESCRIPTION: 16-State deterministic zo decision machine governing safety guards and policy transitions.
// BACKEND_ROUTE: /api/security/zo-machine -> packages/core_v2/src/orchestrator/mod.rs::get_zo_state
// SEARCH_TAG: #DEMO_ZO_DECISION_MACHINE
// ============================================================================
export const DEMO_ZO_DECISION_STATES: ZoDecisionState[] = [
  { stateIndex: 0, name: 'Idle / Guard Sleep', category: 'Ingress', description: 'Monitoring IPC bus for new agent dispatch intent.', active: false },
  { stateIndex: 1, name: 'Evaluating Intent', category: 'Ingress', description: 'Semantic parse of user prompt against system security rules.', active: false },
  { stateIndex: 2, name: 'Scanning Tool Risk', category: 'Validation', description: 'Risk categorization of requested tool payload (Read vs Write).', active: true },
  { stateIndex: 3, name: 'Checking Vault Permissions', category: 'Validation', description: 'Verifying credential authorization and origin tab bindings.', active: false },
  { stateIndex: 4, name: 'Enforcing Rate Limit', category: 'Validation', description: 'Token bucket consumption checks on LLM and external APIs.', active: false },
  { stateIndex: 5, name: 'Prompting Supervisor', category: 'Validation', description: 'Dispatching 4-Tier confirmation modal to active UI screen.', active: false },
  { stateIndex: 6, name: 'Awaiting Biometric / FIDO2', category: 'Validation', description: 'Waiting for hardware YubiKey tap or Windows Hello confirmation.', active: false },
  { stateIndex: 7, name: 'Validating Quorum', category: 'Validation', description: 'Multi-agent consensus quorum agreement before dangerous commit.', active: false },
  { stateIndex: 8, name: 'Executing Under Isolation', category: 'Execution', description: 'Sandbox container process execution with constrained filesystem.', active: false },
  { stateIndex: 9, name: 'Verifying Side Effects', category: 'Execution', description: 'Post-execution diff verification and integrity hash check.', active: false },
  { stateIndex: 10, name: 'Auditing Log Chain', category: 'Audit', description: 'Appending cryptographic SHA-256 seal to immutable audit log.', active: false },
  { stateIndex: 11, name: 'Quarantine On Anomaly', category: 'Remediation', description: 'Isolating hijacked thread if suspicious exfiltration detected.', active: false },
  { stateIndex: 12, name: 'Revoking Session Token', category: 'Remediation', description: 'Invalidating active session cookie and purging memory keys.', active: false },
  { stateIndex: 13, name: 'Escalating Privilege', category: 'Execution', description: 'Temporary sudo elevation for driver/hardware installation.', active: false },
  { stateIndex: 14, name: 'Graceful Degradation', category: 'Remediation', description: 'Falling back to read-only mode upon network disconnection.', active: false },
  { stateIndex: 15, name: 'Terminal Lockdown', category: 'Remediation', description: 'Instant kill-switch: locks screen and terminates all child processes.', active: false },
];
// ============================================================================
// [END_DEMO_STUB: ZoDecisionMachine]
// ============================================================================

export interface CredentialRecoveryBranch {
  id: string;
  name: string;
  type: string;
  status: 'Ready' | 'Configured' | 'Not Provisioned';
  description: string;
}

// ============================================================================
// [DEMO_STUB: CredentialVaultRecovery]
// DESCRIPTION: 7-branch disaster recovery options for the encrypted Credential Vault.
// BACKEND_ROUTE: /api/vault/recovery -> packages/core_v2/src/storage/auth.rs::get_vault_recovery_branches
// SEARCH_TAG: #DEMO_CREDENTIAL_VAULT_RECOVERY
// ============================================================================
export const DEMO_CREDENTIAL_RECOVERY_BRANCHES: CredentialRecoveryBranch[] = [
  { id: 'rec-1', name: 'Master Password Phrase', type: 'Scrypt KDF', status: 'Ready', description: '24-word Argon2/Scrypt salted passphrase.' },
  { id: 'rec-2', name: 'Shamir Secret Share (3-of-5)', type: 'Polynomial Split', status: 'Ready', description: 'Requires 3 custodian keys out of 5 designated team members.' },
  { id: 'rec-3', name: 'YubiKey 5 NFC / FIDO2', type: 'Hardware Token', status: 'Ready', description: 'Physical hardware security key tap verification.' },
  { id: 'rec-4', name: 'Hardware TPM 2.0 Enclave', type: 'Platform Enclave', status: 'Ready', description: 'Windows TPM sealed endorsement key pair.' },
  { id: 'rec-5', name: 'Biometric Passkey', type: 'WebAuthn / Windows Hello', status: 'Configured', description: 'Facial recognition / fingerprint reader validation.' },
  { id: 'rec-6', name: 'Time-Locked Social Recovery', type: 'Delay Oracle', status: 'Configured', description: '48-hour challenge grace period with trusted contact quorum.' },
  { id: 'rec-7', name: 'Ephemeral Emergency Token', type: 'Paper Airgap QR', status: 'Not Provisioned', description: 'Single-use cryptographic paper cold storage slip.' },
];
// ============================================================================
// [END_DEMO_STUB: CredentialVaultRecovery]
// ============================================================================

export interface CompanionState {
  avatarName: string;
  vrmModelUrl: string;
  activeMood: 'Joy' | 'Thinking' | 'Error' | 'Welcoming' | 'Sleeping';
  visemeValues: {
    A: number;
    E: number;
    I: number;
    O: number;
    U: number;
    Sil: number;
  };
  photoPresets: string[];
  desktopPetSettings: {
    alwaysOnTop: boolean;
    dockToTray: boolean;
    wanderingEnabled: boolean;
    clickThrough: boolean;
  };
}

// ============================================================================
// [DEMO_STUB: CompanionState]
// DESCRIPTION: 3D VRM digital companion presence studio with real-time lip-sync visemes and desktop pet toggles.
// BACKEND_ROUTE: /api/companion/state -> packages/core_v2/src/server/routes.rs::get_companion_state
// SEARCH_TAG: #DEMO_COMPANION_STATE
// ============================================================================
export const DEMO_COMPANION_STATE: CompanionState = {
  avatarName: 'Aria (VRM Companion v2.4)',
  vrmModelUrl: '/models/aria-cyberpunk.vrm',
  activeMood: 'Joy',
  visemeValues: {
    A: 0.12,
    E: 0.45,
    I: 0.82,
    O: 0.05,
    U: 0.0,
    Sil: 0.1,
  },
  photoPresets: ['Portrait Bokeh', 'Full Body Cyberpunk', 'Action Hero Studio', 'Studio Noir Low-Key', 'Anime Wide-Angle'],
  desktopPetSettings: {
    alwaysOnTop: true,
    dockToTray: false,
    wanderingEnabled: true,
    clickThrough: false,
  },
};
// ============================================================================
// [END_DEMO_STUB: CompanionState]
// ============================================================================

export interface CreativeProject {
  aspectRatios: string[];
  selectedAspectRatio: string;
  models: { id: string; name: string; type: 'Local FLUX' | 'Cloud DALL-E 3' | 'Cloud Imagen 3'; vramRequiredGb?: number }[];
  selectedModelId: string;
  colorPalettes: { name: string; colors: string[] }[];
  selectedPalette: string;
  filmstripGallery: { id: string; prompt: string; seed: number; thumbnailUrl: string; resolution: string }[];
  activeVideo: {
    title: string;
    durationSeconds: number;
    fps: number;
    resolution: string;
    originalPrompt: string;
    enhancedPrompt: string;
  };
}

// ============================================================================
// [DEMO_STUB: CreativeStudio]
// DESCRIPTION: Generative image & video creative studio featuring local FLUX pipelines, aspect ratio controls, and prompt enhancers.
// BACKEND_ROUTE: /api/creative/workspace -> packages/core_v2/src/image_workspace/mod.rs::get_creative_workspace
// SEARCH_TAG: #DEMO_CREATIVE_STUDIO
// ============================================================================
export const DEMO_CREATIVE_STUDIO: CreativeProject = {
  aspectRatios: ['1:1 Square (1024x1024)', '16:9 Landscape (1920x1080)', '9:16 Mobile (1080x1920)', '4:3 Classic (1024x768)', '21:9 Ultrawide (2560x1080)'],
  selectedAspectRatio: '16:9 Landscape (1920x1080)',
  models: [
    { id: 'flux-schnell', name: 'FLUX.1 [schnell] (Local DirectML)', type: 'Local FLUX', vramRequiredGb: 12 },
    { id: 'flux-dev', name: 'FLUX.1 [dev] (Local GGUF Q4)', type: 'Local FLUX', vramRequiredGb: 16 },
    { id: 'dalle-3', name: 'OpenAI DALL-E 3 HD', type: 'Cloud DALL-E 3' },
    { id: 'imagen-3', name: 'Google Imagen 3 Fast', type: 'Cloud Imagen 3' },
  ],
  selectedModelId: 'flux-schnell',
  colorPalettes: [
    { name: 'Cyberpunk Neon', colors: ['#06b6d4', '#8b5cf6', '#ec4899', '#0f172a'] },
    { name: 'Tokyo Midnight', colors: ['#1e1b4b', '#312e81', '#0284c7', '#38bdf8'] },
    { name: 'Warm Cinematic', colors: ['#78350f', '#b45309', '#f59e0b', '#fef3c7'] },
    { name: 'Monochrome Noir', colors: ['#000000', '#262626', '#737373', '#ffffff'] },
  ],
  selectedPalette: 'Cyberpunk Neon',
  filmstripGallery: [
    {
      id: 'img-01',
      prompt: 'Cybernetic circuit board glowing with cyan neon traces in an obsidian glass casing, 8k macro photo',
      seed: 8819204,
      thumbnailUrl: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="160" height="90"><rect width="100%" height="100%" fill="%230f172a"/><circle cx="80" cy="45" r="30" fill="%2306b6d4" opacity="0.6"/><path d="M40 45 L120 45" stroke="%238b5cf6" stroke-width="4"/></svg>',
      resolution: '1920x1080',
    },
    {
      id: 'img-02',
      prompt: 'Holographic companion avatar projecting over a high-tech workstation with mechanical keyboard, cinematic bloom',
      seed: 4920112,
      thumbnailUrl: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="160" height="90"><rect width="100%" height="100%" fill="%231e293b"/><circle cx="80" cy="45" r="25" fill="%23ec4899" opacity="0.7"/><rect x="50" y="60" width="60" height="20" fill="%233b82f6" rx="4"/></svg>',
      resolution: '1920x1080',
    },
    {
      id: 'img-03',
      prompt: 'Printed circuit board schematic schematic CAD layout 3D perspective with gold pads and green solder mask',
      seed: 120984,
      thumbnailUrl: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="160" height="90"><rect width="100%" height="100%" fill="%23064e3b"/><line x1="20" y1="20" x2="140" y2="70" stroke="%23fbbf24" stroke-width="3"/><rect x="65" y="30" width="30" height="30" fill="%23022c22"/></svg>',
      resolution: '1920x1080',
    },
  ],
  activeVideo: {
    title: 'Autonomous Drone Flight Over Cyber-City Grid',
    durationSeconds: 8.5,
    fps: 30,
    resolution: '1080p (1920x1080)',
    originalPrompt: 'drone flying through futuristic neon city at sunset',
    enhancedPrompt: 'Cinematic FPV drone gliding smoothly through a dense neo-Tokyo cityscape, vibrant cyan and magenta neon holographic billboards reflecting in wet asphalt, warm sunset rim lighting on metallic facades, 4k ultra-detailed volumetric fog, smooth 60fps camera motion.',
  },
};
// ============================================================================
// [END_DEMO_STUB: CreativeStudio]
// ============================================================================

export interface ErcRuleViolation {
  code: string;
  severity: 'Error' | 'Warning' | 'Notice';
  description: string;
  affectedNets: string[];
  location: string;
}

export interface BomItem {
  reference: string;
  value: string;
  footprint: string;
  manufacturerPartNumber: string;
  jlcPcbPartNumber: string;
  unitPriceUsd: number;
  quantity: number;
}

export interface HardwareProjectData {
  projectName: string;
  revision: string;
  layerCount: 4;
  activeLayer: 'F.Cu (Top Copper)' | 'In1.Cu (Ground Plane)' | 'In2.Cu (Power Rail)' | 'B.Cu (Bottom Copper)';
  traceWidthMm: number;
  solderMaskColor: 'Cyber Green' | 'Matte Black' | 'Royal Blue' | 'Deep Red' | 'Arctic White';
  ercViolations: ErcRuleViolation[];
  aiCoPilotSuggestions: string[];
  bomItems: BomItem[];
}

// ============================================================================
// [DEMO_STUB: HardwareProject]
// DESCRIPTION: PCB ECAD design workspace with copper layout layers, real-time ERC rule validator, AI co-pilot, and BOM exporter.
// BACKEND_ROUTE: /api/hardware/project -> packages/core_v2/src/tools/builtin/file_ops.rs::get_pcb_project
// SEARCH_TAG: #DEMO_HARDWARE_PROJECT
// ============================================================================
export const DEMO_HARDWARE_PROJECT: HardwareProjectData = {
  projectName: 'SmartSensor_Hub_RevC',
  revision: '3.2.0',
  layerCount: 4,
  activeLayer: 'F.Cu (Top Copper)',
  traceWidthMm: 0.254,
  solderMaskColor: 'Matte Black',
  ercViolations: [
    {
      code: 'ERC-W104',
      severity: 'Warning',
      description: 'Clearance violation between net +3V3 and GND polygon pour (measured 0.18mm, required >= 0.20mm).',
      affectedNets: ['+3V3', 'GND'],
      location: 'X: 52.4mm, Y: 38.1mm',
    },
    {
      code: 'ERC-E002',
      severity: 'Error',
      description: 'Pin 12 (RESET_N) of U1 has pull-up resistor missing or floating.',
      affectedNets: ['RESET_N'],
      location: 'X: 44.0mm, Y: 22.5mm',
    },
  ],
  aiCoPilotSuggestions: [
    'Add a 100nF ceramic decoupling capacitor adjacent to VDD_USB pin on U1 to eliminate EMI transients.',
    'Increase ground via stitching density around the 2.4GHz RF chip antenna feedline to reduce return-loss.',
    'Re-route differential pair USB_D+ / USB_D- with matched 90-ohm impedance and length skew < 0.15mm.',
  ],
  bomItems: [
    { reference: 'U1', value: 'RP2040', footprint: 'QFN-56_7x7mm', manufacturerPartNumber: 'RP2040-B2', jlcPcbPartNumber: 'C204000', unitPriceUsd: 0.85, quantity: 1 },
    { reference: 'U2', value: 'AMS1117-3.3', footprint: 'SOT-223', manufacturerPartNumber: 'AMS1117-3.3V', jlcPcbPartNumber: 'C6186', unitPriceUsd: 0.12, quantity: 1 },
    { reference: 'C1, C2', value: '100nF 50V', footprint: '0603_1608Metric', manufacturerPartNumber: 'CL10B104KB8NNNC', jlcPcbPartNumber: 'C14663', unitPriceUsd: 0.015, quantity: 2 },
    { reference: 'J1', value: 'USB-C-16P', footprint: 'USB-C-16P-Female', manufacturerPartNumber: 'TYPE-C-16PIN', jlcPcbPartNumber: 'C2765186', unitPriceUsd: 0.28, quantity: 1 },
  ],
};
// ============================================================================
// [END_DEMO_STUB: HardwareProject]
// ============================================================================

export interface KanbanCard {
  id: string;
  title: string;
  description: string;
  priority: 'High' | 'Medium' | 'Low';
  assignee: string;
  dueDate: string;
  tags: string[];
}

export interface CronRoutine {
  id: string;
  name: string;
  cronExpression: string;
  lastRunStatus: 'Success' | 'Failed' | 'Running';
  nextRun: string;
  telegramNotify: boolean;
  targetChatId?: string;
}

export interface TasksData {
  columns: {
    id: 'todo' | 'inprogress' | 'blocked' | 'done';
    title: string;
    cards: KanbanCard[];
  }[];
  routines: CronRoutine[];
}

// ============================================================================
// [DEMO_STUB: TasksKanban]
// DESCRIPTION: 4-Column Kanban board and scheduled cron background automation routines with Telegram alerting.
// BACKEND_ROUTE: /api/tasks/board -> packages/core_v2/src/storage/chat.rs::get_tasks_board
// SEARCH_TAG: #DEMO_TASKS_KANBAN
// ============================================================================
export const DEMO_TASKS_KANBAN: TasksData = {
  columns: [
    {
      id: 'todo',
      title: 'To Do',
      cards: [
        {
          id: 'task-101',
          title: 'Implement Shamir 3-of-5 secret recovery flow',
          description: 'Add polynomial split math in packages/core_v2/src/storage/auth.rs.',
          priority: 'High',
          assignee: 'Core Specialist',
          dueDate: 'Tomorrow',
          tags: ['Security', 'Rust'],
        },
        {
          id: 'task-102',
          title: 'Export KiCad 9 native schematic generator',
          description: 'Format .kicad_sch s-expressions with net labels.',
          priority: 'Medium',
          assignee: 'Hardware Specialist',
          dueDate: 'Oct 18',
          tags: ['ECAD', 'KiCad'],
        },
      ],
    },
    {
      id: 'inprogress',
      title: 'In Progress',
      cards: [
        {
          id: 'task-201',
          title: 'Decoupled Web Client 10-Workspace Architecture',
          description: 'Building dedicated navigation rail and workspace views in clients/web.',
          priority: 'High',
          assignee: 'Web Specialist',
          dueDate: 'Today',
          tags: ['WebClient', 'React'],
        },
      ],
    },
    {
      id: 'blocked',
      title: 'Blocked',
      cards: [
        {
          id: 'task-301',
          title: 'DirectML GGUF Quantization for AMD RDNA3',
          description: 'Waiting for upstream ONNX Runtime DirectML 1.19 release tag.',
          priority: 'Low',
          assignee: 'AI Engine Lead',
          dueDate: 'Oct 24',
          tags: ['Hardware', 'DirectML'],
        },
      ],
    },
    {
      id: 'done',
      title: 'Done',
      cards: [
        {
          id: 'task-401',
          title: 'WGC Occluded Window Capture Driver',
          description: 'Direct3D11 zero-copy frame staging swapchain implemented and verified.',
          priority: 'High',
          assignee: 'Windows Specialist',
          dueDate: 'Yesterday',
          tags: ['ComputerUse', 'Rust'],
        },
      ],
    },
  ],
  routines: [
    {
      id: 'cron-01',
      name: 'Nightly Workspace Lock & Cache Cleanup',
      cronExpression: '0 2 * * *',
      lastRunStatus: 'Success',
      nextRun: 'Tonight at 02:00 AM',
      telegramNotify: true,
      targetChatId: '-1008492019',
    },
    {
      id: 'cron-02',
      name: 'Hourly CI Monorepo Sanity Check',
      cronExpression: '0 * * * *',
      lastRunStatus: 'Success',
      nextRun: 'In 45 minutes',
      telegramNotify: false,
    },
    {
      id: 'cron-03',
      name: 'Daily Git Submodule & MCP Tool Synchronizer',
      cronExpression: '30 6 * * *',
      lastRunStatus: 'Success',
      nextRun: 'Tomorrow at 06:30 AM',
      telegramNotify: true,
      targetChatId: '-1008492019',
    },
  ],
};
// ============================================================================
// [END_DEMO_STUB: TasksKanban]
// ============================================================================

export interface SettingsModuleMeta {
  id: string;
  title: string;
  category: 'Core & AI' | 'Automation & Web' | 'Hardware & Graphics' | 'System & Security';
  description: string;
  badge?: string;
}

export interface SystemDoctorProbe {
  checkName: string;
  component: string;
  status: 'Pass' | 'Warning' | 'Fail';
  detail: string;
}

export interface SettingsData {
  modules: SettingsModuleMeta[];
  doctorProbes: SystemDoctorProbe[];
  providers: { name: string; keyMasked: string; status: 'Active' | 'Unconfigured'; baseUrl?: string }[];
}

// ============================================================================
// [DEMO_STUB: SettingsMatrix]
// DESCRIPTION: 24-Panel expanded settings governance matrix and System Doctor hardware diagnostics probe.
// BACKEND_ROUTE: /api/settings/matrix -> packages/core_v2/src/storage/settings.rs::get_settings_manifest
// SEARCH_TAG: #DEMO_SETTINGS_MATRIX
// ============================================================================
export const DEMO_SETTINGS_MODULES: SettingsData = {
  modules: [
    { id: 'general', title: '1. General Settings', category: 'Core & AI', description: 'Application theme, language, and audio cues.' },
    { id: 'providers', title: '2. Provider Registry', category: 'Core & AI', description: 'API credentials for OpenAI, Anthropic, Gemini, Groq, DeepSeek.' },
    { id: 'local-llm', title: '3. Local LLM Models', category: 'Core & AI', description: 'Ollama and LM Studio discovery and downloads.' },
    { id: 'local-img', title: '4. Local Image Models', category: 'Hardware & Graphics', description: 'ComfyUI, Stable Diffusion, and FLUX VRAM setup.' },
    { id: 'local-vid', title: '5. Local Video Models', category: 'Hardware & Graphics', description: 'Wan2.1 and HunyuanVideo model checkpoints.' },
    { id: 'mcp', title: '6. MCP Servers Dashboard', category: 'Core & AI', description: 'Model Context Protocol stdio/SSE server catalog.' },
    { id: 'usage', title: '7. Usage & Cost Tracker', category: 'Core & AI', description: 'Token consumption analytics and CSV export.' },
    { id: 'memory', title: '8. Memory & Context Engine', category: 'Core & AI', description: 'Vector memory compaction and AGENTS.md rules.' },
    { id: 'voice', title: '9. Voice & Speech Studio', category: 'Hardware & Graphics', description: 'Whisper STT, phonetic rules, and ElevenLabs TTS.' },
    { id: 'telegram', title: '10. Telegram Bot Bridge', category: 'Automation & Web', description: 'Remote prompt execution and alert push.' },
    { id: 'computer-use', title: '11. Computer Use Automation', category: 'Automation & Web', description: 'WGC capture latency and humanized mouse Béziers.' },
    { id: 'browser-use', title: '12. Browser Automation', category: 'Automation & Web', description: 'CDP connection, stealth mode, and tab leases.' },
    { id: 'web-hosting', title: '13. Web App Hosting & Port 1469', category: 'Automation & Web', description: 'Axum daemon bind settings and LAN pairing QR.' },
    { id: '3d-graphics', title: '14. 3D Graphics Engine', category: 'Hardware & Graphics', description: 'WebGL antialiasing and VRM physics shaders.' },
    { id: 'artifacts', title: '15. Artifacts Runtime', category: 'Automation & Web', description: 'Sandboxed web application preview port range.' },
    { id: 'storage', title: '16. Storage & Workspace Paths', category: 'System & Security', description: 'Cache cleanup and SQLite database migration.' },
    { id: 'updates', title: '17. Software Updates', category: 'System & Security', description: 'Version 0.44.0 update channel and changelog.' },
    { id: 'security-guard', title: '18. Security & Access Control', category: 'System & Security', description: '4-Tier confirmation and scrypt password vault.' },
    { id: 'network-proxy', title: '19. Network Proxy & TLS', category: 'System & Security', description: 'Corporate HTTP/SOCKS5 proxy and custom CA roots.' },
    { id: 'telemetry', title: '20. Logging & Verbosity', category: 'System & Security', description: 'RUST_LOG filtering and rotation retention.' },
    { id: 'accessibility', title: '21. Accessibility & Contrast', category: 'System & Security', description: 'High contrast themes, screen-reader cues, and font scale.' },
    { id: 'notifications', title: '22. Notification Center', category: 'System & Security', description: 'OS desktop toasts and sound priority levels.' },
    { id: 'shortcuts', title: '23. Keyboard Shortcuts Matrix', category: 'System & Security', description: 'Global hotkey bindings for quick actions.' },
    { id: 'doctor', title: '24. System Doctor & Diagnostics', category: 'System & Security', description: 'Hardware probe for Node.js, Rust, FFmpeg, and VRAM.' },
  ],
  doctorProbes: [
    { checkName: 'Node.js Runtime', component: 'Host Engine', status: 'Pass', detail: 'v20.18.0 (>= v18 required)' },
    { checkName: 'Rust Toolchain', component: 'Compiler', status: 'Pass', detail: 'rustc 1.84.0 (stable-x86_64-pc-windows-msvc)' },
    { checkName: 'FFmpeg Media Encoder', component: 'Video Pipeline', status: 'Pass', detail: 'ffmpeg v7.0.2 with libx264, nvenc support' },
    { checkName: 'GPU Acceleration & VRAM', component: 'Direct3D11 / CUDA', status: 'Pass', detail: 'NVIDIA RTX 4090 (24GB VRAM detected)' },
    { checkName: 'Core Daemon Port 1469', component: 'Network Socket', status: 'Pass', detail: 'Port 1469 available (0.0.0.0 bind verified)' },
    { checkName: 'Disk Space Headroom', component: 'Filesystem', status: 'Pass', detail: '142.8 GB free on primary workspace drive' },
  ],
  providers: [
    { name: 'Anthropic Claude', keyMasked: 'sk-ant-api03-••••••••••••-AA', status: 'Active' },
    { name: 'OpenAI GPT-4o', keyMasked: 'sk-proj-••••••••••••••••••••', status: 'Active' },
    { name: 'Google Gemini', keyMasked: 'AIzaSy••••••••••••••••••••••', status: 'Active' },
    { name: 'Groq Cloud', keyMasked: 'gsk_••••••••••••••••••••••••', status: 'Active' },
    { name: 'DeepSeek AI', keyMasked: 'sk-•••••••••••••••••••••••••', status: 'Active' },
  ],
};
// ============================================================================
// [END_DEMO_STUB: SettingsMatrix]
// ============================================================================
