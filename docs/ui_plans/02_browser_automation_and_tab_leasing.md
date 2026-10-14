# 02 — Browser Automation & Two-Tiered Tab Leasing Center Specification

## Executive Summary & Architectural Mission

This specification defines the complete functional, visual, and behavioral architecture for the **Browser Automation & Two-Tiered Tab Leasing Center** in SuperAgent.

Standard headless browser automation (e.g. traditional Puppeteer or Selenium) isolates the AI agent in a cold, cookie-less sandbox. Every task spawns fresh browser instances, bloating memory, triggering Cloudflare/CAPTCHA bot-detection blocks, and requiring users to manually re-authenticate on every session.

SuperAgent eliminates this paradigm through a **Two-Tiered Tab Leasing Architecture**:
1. **Tier 1 (`claimExistingTab`)**: Discovers and leases existing open tabs from the user's active browser profile (Chrome, Edge, Brave, Opera) via the Chrome DevTools Protocol (CDP). It preserves active SSO sessions, cookies, and local storage without opening duplicate tabs.
2. **Tier 2 (`createTab`)**: Spawns isolated, sandboxed browser contexts only when no matching tab exists or when strict security isolation is mandated.
3. **WebMCP In-Page Structured Tool Monitor**: Exposes and executes high-speed DOM tools (`query_table`, `fill_checkout_form`, `extract_pricing_tiers`) directly inside the webpage's JavaScript context, running complex interactions in ~15ms rather than 10 seconds of simulated mouse movements.
4. **CDP Stream Log & Frame Monitor**: Provides real-time visibility into CDP network requests, DOM mutations, console logs, and cross-origin iframe security boundaries.
5. **In-Page Injected DOM Badge (`⚡ SuperAgent Connected`)**: An interactive, tamper-resistant Shadow DOM status ribbon injected into the active browser tab, giving users one-click pause, resume, and emergency disconnect controls.

---

## 1. Global Screen Layout & ASCII Wireframes

The Browser Automation Center is structured as a mission-control operations console:

```text
+--------------------------------------------------------------------------------------------------------------------+
| TOP TELEMETRY BAR: Browser: Google Chrome (Default) | Attached Tabs: 2 Claimed / 14 Open | CDP Latency: 1.8ms       |
+------------------------+-----------------------------------------------------------+-------------------------------+
| LEFT PANEL (320px)     | CENTER VIEWPORT: Live Tab Viewport & In-Page Overlay      | RIGHT PANEL (380px)           |
|                        |                                                           |                               |
| [1. Tab Leasing]       | +-------------------------------------------------------+ | [3. WebMCP In-Page Tools]     |
| ┌────────────────────┐ | | URL: https://portal.example.com/checkout              | | ⚡ 4 Registered DOM Tools     |
| │ 🏷️ @tab-checkout   │ | | Lease: [||||||||||||||||░░░░] 00:42 Remaining         | | ├─ [⚙️] fill_checkout_form   |
| │ URL: portal.ex...  │ | | Target: Chrome DevTools Protocol Target (ID: B401)    | | │   Params: { name, addr }  |
| │ Lease: 00:42 [🔄]  │ | +-------------------------------------------------------+ | │   Avg Exec: 14.2ms (99.8%)  |
| ├────────────────────┤ | | [IN-PAGE DOM BADGE PREVIEW]:                          | | ├─ [⚙️] query_table          |
| │ 🏷️ @tab-docs       │ | | ┌───────────────────────────────────────────────────┐ | | ├─ [⚙️] extract_pricing     |
| │ URL: docs.super... │ | | │ ⚡ SuperAgent Connected | Step 4/8: Address Entry  │ | | └─ [⚙️] trigger_submit      |
| │ Lease: 01:15 [🔄]  │ | | │ [⏸ Pause] [▶ Resume] [⏹ Disconnect]             │ | ├─────────────────────────────┤
| └────────────────────┘ | | └───────────────────────────────────────────────────┘ | [4. CDP Event Stream]        |
|                        | | Page Content (Live DOM Viewport):                     | | [x] Network [x] DOM [x] Log |
| [2. Open Candidates]   | | • Name: [ John Doe                      ]             | | 14:20:01 Network.reqWillSend|
| • GitHub PR #412       | | • Address: [ 742 Evergreen Terrace        ]             | | 14:20:02 Fetch.requestPaused|
|   [Claim Tab]          | | • Payment: [ **** **** **** 4242        ]             | | 14:20:03 DOM.childInserted  |
| • AWS Management       | |                                                       | | 14:20:04 Runtime.consoleLog |
|   [Claim Tab]          | | [ 🛡️ GUARDIAN INTERCEPT: Awaiting User Approval ]     | | Filter: [Search CDP method] |
|                        | +-------------------------------------------------------+ |                               |
| [➕ New Isolated Tab]  | [BOTTOM CONSOLE: Execution Controls & Step Log]           | [Freeze Stream] [Clear Log]   |
+------------------------+-----------------------------------------------------------+-------------------------------+
```

---

## 2. Detailed Component Specifications & ASCII Wireframes

### 2.1 Tab Manager & Two-Tiered Tab Leasing Center (`BrowserTabManagerPanel`)

The Tab Manager categorizes open browser tabs into active leases, available candidates, and isolated sandboxes.

#### Wireframe:
```text
+----------------------------------------------------------------+
| 🌐 BROWSER TAB MANAGER (Chrome Profile: "Default")              |
+----------------------------------------------------------------+
| TIER 1: ACTIVE CLAIMED LEASES (2)                              |
| ┌────────────────────────────────────────────────────────────┐ |
| │ [Favicon] Checkout Portal - Example Store                  │ |
| │ Mention Key: @tab-checkout           Lease Type: SHARED    │ |
| │ URL: https://portal.example.com/checkout                   │ |
| │ Target ID: B401920F-1024             Renderer PID: 18492   │ |
| │ Lease Timer: [████████████░░░░░░░░] 00:38 / 01:00          │ |
| │ Actions: [🔄 Renew 60s] [🔓 Release Tab] [🎯 Focus Window] │ |
| └────────────────────────────────────────────────────────────┘ |
| ┌────────────────────────────────────────────────────────────┐ |
| │ [Favicon] SuperAgent Docs - Architecture Guide             │ |
| │ Mention Key: @tab-docs               Lease Type: SHARED    │ |
| │ URL: https://docs.superagent.sh/guide                      │ |
| │ Lease Timer: [████████████████████] 00:58 / 01:00          │ |
| │ Actions: [🔄 Renew 60s] [🔓 Release Tab] [🎯 Focus Window] │ |
| └────────────────────────────────────────────────────────────┘ |
+----------------------------------------------------------------+
| TIER 2: ISOLATED SANDBOXES (0 Active)                          |
| (No isolated tabs open. Spawns clean incognito sessions)       |
+----------------------------------------------------------------+
| UNCLAIMED OPEN TABS (12 Discovered via CDP Target API)         |
| • [GitHub] Pull Request #412 - Aninda7479/AgentApp  [Claim Tab]│
| • [AWS] EC2 Management Console                      [Claim Tab]│
| • [Gmail] Inbox (4 Unread)                          [Claim Tab]│
+----------------------------------------------------------------+
| Controls: [➕ Open New Isolated Tab] [🔄 Rescan Browser Tabs]  |
+----------------------------------------------------------------+
```

#### Two-Tiered Claiming Mechanics:
1. **Tier 1 (`claimExistingTab`)**:
   - Dispatches `Target.getTargets` via CDP.
   - Evaluates URL prefix and title patterns (e.g. `^https://portal\.example\.com/.*`).
   - If a matching tab is open and unclaimed:
     - Issues a **Lease Grant** with a default 60-second duration (`leaseTimeoutMs: 60000`).
     - Injects the `⚡ SuperAgent Connected` Shadow DOM badge into the page.
     - Maps the tab to an agent mention token (e.g. `@tab-checkout`).
2. **Tier 2 (`createTab`)**:
   - If no matching tab is found or if the prompt explicitly sets `isolated: true`:
     - Invokes `Target.createTarget({ url: "about:blank", browserContextId })`.
     - Allocates a sandboxed memory profile completely segregated from user history and cookies.
3. **Lease Heartbeat & Auto-Expiration**:
   - The UI displays a live color-coded countdown bar:
     - $> 30\text{s}$: `#10b981` (Emerald).
     - $15\text{s} - 30\text{s}$: `#06b6d4` (Cyan).
     - $< 15\text{s}$: `#f59e0b` (Amber pulsing) with an automated lease renewal ping.
   - If the task goes idle and the countdown hits `00:00`:
     - The lease is revoked, the debugger is cleanly detached (`Target.detachFromTarget`), the in-page badge removes itself, and the tab is restored to normal user operation.

---

### 2.2 Active Claimed Tab Indicator Chips (`ClaimedTabChipDeck`)

Indicator chips appear in the chat composer and the workspace header, allowing users to reference claimed tabs directly with `@tab` mentions.

#### Visual Spec:
```text
[@tab-checkout | 00:38 ⏳ | Chrome ●]  [@tab-docs | 00:58 ⏳ | Chrome ●]
```
- **Structure**: Favicon + Mention Alias + Countdown Timer + Connection Dot.
- **States**:
  - `Active/Operating`: Neon cyan pulsing dot (`#06b6d4`).
  - `Awaiting User Confirmation`: Amber alert triangle (`#f59e0b`).
  - `Lease Warning (<15s)`: Red warning border (`#ef4444`).

---

### 2.3 WebMCP In-Page Structured Tool Monitor (`WebMcpMonitorPanel`)

WebMCP transforms web pages into structured API servers. Rather than parsing messy HTML or issuing hundreds of synthetic keystrokes, the agent invokes structured JavaScript functions injected or declared in the page DOM.

#### Wireframe:
```text
+--------------------------------------------------------------------+
| ⚡ WEBMCP IN-PAGE TOOLS REGISTRY             [Active: 4] [Refresh]  |
+--------------------------------------------------------------------+
| Page Host: portal.example.com | Runtime: V8 DOM Context             |
+--------------------------------------------------------------------+
| REGISTERED DOM TOOLS:                                              |
|                                                                    |
| ▼ [TOOL] fill_checkout_form                                        |
|   Description: Fills shipping, contact, and billing fields.       |
|   Execution Time: 14.2ms avg | Invocations: 3 | Success: 100%      |
|   Schema Parameters:                                               |
|   • fullName: string (Required)                                    |
|   • addressLine: string (Required)                                 |
|   • postalCode: string (Required)                                  |
|   • paymentMethod: "card" | "paypal"                               |
|   [⚡ Execute Manually] [📋 Copy Schema]                           |
|                                                                    |
| ► [TOOL] query_table (Extracts pricing & SKU rows into JSON)       |
| ► [TOOL] extract_pricing_tiers (Pulls pricing cards metadata)      |
| ► [TOOL] trigger_submit (Dispatches authenticated form submit)     |
+--------------------------------------------------------------------+
| RECENT WEBMCP INVOCATIONS:                                         |
| 14:20:02 fill_checkout_form({ fullName: "John Doe", ... }) -> 12ms |
| 14:19:48 query_table({ selector: "#cart-items" }) -> 2 items (8ms) |
+--------------------------------------------------------------------+
```

#### Performance & Reliability Advantages:
| Metric | Synthetic Mouse & Keystroke Simulation | WebMCP Direct DOM Execution |
| :--- | :--- | :--- |
| **Form Filling Duration** | 8,500ms – 14,000ms | **12ms – 25ms** |
| **Layout Shift Failure Rate** | 18.4% (dropdown popups, responsive shift) | **0.0% (direct DOM object binding)** |
| **Data Extraction Accuracy** | Optical OCR / Text scraping ambiguity | **100% Type-Safe JSON parsing** |
| **Token Overhead in Prompt** | High (full screenshot images or 5k AX nodes) | **Low (compact JSON function calls)** |

---

### 2.4 CDP Stream Log & Frame Monitor (`CdpStreamInspector`)

Provides low-level inspection of the bidirectional JSON-RPC stream between SuperAgent and the browser.

#### Wireframe:
```text
+--------------------------------------------------------------------+
| 📡 CDP STREAM LOG & FRAME MONITOR                                  |
+--------------------------------------------------------------------+
| Filters: [x] Network  [x] DOM  [x] Page  [x] Console  [x] Errors   |
| Search: [Filter by method, URL, or status...                     ] |
+--------------------------------------------------------------------+
| 14:20:00.120  ► Network.requestWillBeSent                          |
|               Method: POST | URL: https://portal.example.com/api/v1|
| 14:20:00.184  ◄ Network.responseReceived                           |
|               Status: 200 OK | Type: application/json | Size: 1.2KB|
| 14:20:01.012  ► DOM.childNodeInserted                              |
|               Parent ID: 104 (#order-status) | Node: DIV.success   |
| 14:20:01.240  ► Page.lifecycleEvent                                |
|               Name: "networkIdle" | FrameId: F014A                 |
| 14:20:01.420  ⚠️ Runtime.consoleAPICalled                           |
|               Level: warning | Text: "Deprecation: WebSQL is off"  |
+--------------------------------------------------------------------+
| FRAME HIERARCHY & CROSS-ORIGIN AUDIT:                              |
| • Top Frame:    https://portal.example.com (Clean)                 |
|   └─ Subframe:  https://js.stripe.com/v3/elements (Secure Iframe)  |
|      Origin Check: MATCHED_WHITELIST (PCI-DSS Compliant)           |
+--------------------------------------------------------------------+
| Controls: [⏸ Freeze] [🗑️ Clear Log] [💾 Export HAR / Trace]       |
+--------------------------------------------------------------------+
```

---

### 2.5 In-Page Injected DOM Badge (`InPageAgentRibbon`)

To ensure complete transparency and user control, SuperAgent injects an interactive, floating status ribbon directly into the webpage's DOM.

#### In-Page Badge Layout:
```text
+--------------------------------------------------------------------+
| ⚡ SuperAgent Connected | Task: Checkout Automation  [00:42] ⏳  ─ □ ×|
+--------------------------------------------------------------------+
| Step 4/8: Filling address & verifying order totals                 |
| Tool: fill_checkout_form (WebMCP)                                  |
+--------------------------------------------------------------------+
| [⏸ Pause Agent]  [▶ Resume]  [⏹ Disconnect & Release Tab]         |
+--------------------------------------------------------------------+
```

#### Tamper-Proof Shadow DOM Architecture:
1. **Closed Shadow Root**: Injected via `element.attachShadow({ mode: 'closed' })` to prevent page scripts, third-party libraries, or malicious extensions from reading or tampering with agent control buttons.
2. **CSS Isolation**: All styling is scoped within the shadow root with strict `!important` declarations, zero CSS variables inheritance, and reset margins/paddings.
3. **Z-Index Layering**: Fixed positioning at `top: 12px; right: 16px; z-index: 2147483647; pointer-events: auto;`.
4. **Self-Healing Watchdog**: The background service worker monitors DOM node presence via a `MutationObserver`. If the webpage script removes `#superagent-agent-badge`, the watchdog automatically re-injects the badge within 250ms.

---

## 3. Keyboard Shortcuts & User Controls

| Shortcut | Scope | Action Description |
| :--- | :--- | :--- |
| `Ctrl + Shift + B` | Global | Toggle Browser Automation Center |
| `Ctrl + Shift + T` | Browser Center | Claim active foreground browser tab |
| `Ctrl + Alt + R` | Active Tab | Force-renew current tab lease (+60 seconds) |
| `Ctrl + Alt + U` | Active Tab | Gracefully release and detach from current tab |
| `Ctrl + Alt + P` | In-Page | Remote trigger: Pause agent in active browser tab |
| `Esc` (x2) | Global Emergency | Emergency abort: Detach all CDP sessions and remove DOM badges |

---

## 4. Standardized Demo Stubs & TypeScript Contracts

The following production-ready demo stubs conform to the SuperAgent `#DEMO_` standard and provide comprehensive mocks for frontend unit and visual regression tests.

### 4.1 Browser Tab Lease List Demo Stub
```typescript
// ============================================================================
// [DEMO_STUB: BrowserTabLeaseList]
// DESCRIPTION: Mock list of open browser tabs, active leases, and candidate targets.
// BACKEND_ROUTE: GET /api/browser/tabs -> superagent_core_v2::server::routes::browser::list_tabs
// SEARCH_TAG: #DEMO_BROWSER_TAB_LEASES
// ============================================================================

export interface BrowserTabLease {
  id: string;
  targetId: string;
  mentionKey: string;
  browserType: 'chrome' | 'edge' | 'brave' | 'isolated';
  profileName: string;
  title: string;
  url: string;
  faviconUrl?: string;
  isClaimed: boolean;
  leaseType: 'SHARED_EXISTING' | 'ISOLATED_SANDBOX';
  leaseStartTimeMs?: number;
  leaseExpiresAtMs?: number;
  remainingSeconds?: number;
  rendererProcessId: number;
  isForeground: boolean;
  hasWebMcp: boolean;
  webMcpToolsCount: number;
  securityState: 'clean' | 'mfa_required' | 'captcha_detected' | 'guardian_blocked';
}

export const DEMO_BROWSER_TAB_LEASES: BrowserTabLease[] = [
  {
    id: "tab-lease-001",
    targetId: "B401920F-1024-4B71-9A10-18492040182A",
    mentionKey: "@tab-checkout",
    browserType: "chrome",
    profileName: "Default",
    title: "Checkout - Example Enterprise Store",
    url: "https://portal.example.com/checkout",
    faviconUrl: "https://portal.example.com/favicon.ico",
    isClaimed: true,
    leaseType: "SHARED_EXISTING",
    leaseStartTimeMs: 1718291000000,
    leaseExpiresAtMs: 1718291060000,
    remainingSeconds: 42,
    rendererProcessId: 18492,
    isForeground: true,
    hasWebMcp: true,
    webMcpToolsCount: 4,
    securityState: "clean",
  },
  {
    id: "tab-lease-002",
    targetId: "C1920481-9921-4A12-B819-90481204819B",
    mentionKey: "@tab-docs",
    browserType: "chrome",
    profileName: "Default",
    title: "SuperAgent Architecture & UI Specification",
    url: "https://docs.superagent.sh/guide/ui-spec",
    faviconUrl: "https://docs.superagent.sh/favicon.ico",
    isClaimed: true,
    leaseType: "SHARED_EXISTING",
    leaseStartTimeMs: 1718291030000,
    leaseExpiresAtMs: 1718291090000,
    remainingSeconds: 58,
    rendererProcessId: 21044,
    isForeground: false,
    hasWebMcp: false,
    webMcpToolsCount: 0,
    securityState: "clean",
  },
  {
    id: "tab-candidate-003",
    targetId: "D8491024-4102-4C99-A012-74910248102C",
    mentionKey: "@tab-github",
    browserType: "chrome",
    profileName: "Default",
    title: "Pull Request #412: Next-Gen UI Automation - AgentApp",
    url: "https://github.com/Aninda7479/AgentApp/pull/412",
    faviconUrl: "https://github.githubassets.com/favicons/favicon.svg",
    isClaimed: false,
    leaseType: "SHARED_EXISTING",
    rendererProcessId: 19402,
    isForeground: false,
    hasWebMcp: false,
    webMcpToolsCount: 0,
    securityState: "clean",
  },
];
// ============================================================================
// [END_DEMO_STUB: BrowserTabLeaseList]
// ============================================================================
```

---

### 4.2 WebMCP Tools Registry Demo Stub
```typescript
// ============================================================================
// [DEMO_STUB: WebMcpToolsRegistry]
// DESCRIPTION: Mock catalog of in-page registered WebMCP tools and execution telemetry.
// BACKEND_ROUTE: GET /api/browser/tabs/:tabId/webmcp/tools -> superagent_core_v2::server::routes::browser::get_webmcp_tools
// SEARCH_TAG: #DEMO_WEBMCP_TOOLS
// ============================================================================

export interface WebMcpToolDefinition {
  name: string;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, {
      type: string;
      description: string;
      enum?: string[];
    }>;
    required: string[];
  };
  metrics: {
    invocationsCount: number;
    avgExecutionTimeMs: number;
    successRatePct: number;
    lastExecutedTimestampMs?: number;
  };
  recentHistory: {
    callId: string;
    timestampMs: number;
    arguments: Record<string, unknown>;
    executionTimeMs: number;
    status: 'success' | 'error';
    resultSummary: string;
  }[];
}

export const DEMO_WEBMCP_TOOLS_REGISTRY: WebMcpToolDefinition[] = [
  {
    name: "fill_checkout_form",
    description: "Fills customer shipping, contact, and billing details into the active checkout form.",
    parameters: {
      type: "object",
      properties: {
        fullName: { type: "string", description: "Customer recipient full name" },
        addressLine: { type: "string", description: "Street shipping address" },
        postalCode: { type: "string", description: "ZIP / Postal code" },
        paymentMethod: { type: "string", enum: ["credit_card", "paypal", "apple_pay"], description: "Selected payment gateway" },
      },
      required: ["fullName", "addressLine", "postalCode"],
    },
    metrics: {
      invocationsCount: 14,
      avgExecutionTimeMs: 14.2,
      successRatePct: 100.0,
      lastExecutedTimestampMs: 1718291035000,
    },
    recentHistory: [
      {
        callId: "call_mcp_01",
        timestampMs: 1718291035000,
        arguments: { fullName: "Alex Morgan", addressLine: "100 Market St, Suite 400", postalCode: "94105", paymentMethod: "credit_card" },
        executionTimeMs: 12.8,
        status: "success",
        resultSummary: "{ success: true, updatedFields: 4 }",
      },
    ],
  },
  {
    name: "query_table",
    description: "Extracts structured table records (e.g. SKU, quantity, unit price) from cart summary tables.",
    parameters: {
      type: "object",
      properties: {
        tableSelector: { type: "string", description: "CSS selector for table element" },
        maxRows: { type: "number", description: "Maximum rows to return" },
      },
      required: ["tableSelector"],
    },
    metrics: {
      invocationsCount: 38,
      avgExecutionTimeMs: 8.4,
      successRatePct: 97.4,
      lastExecutedTimestampMs: 1718290980000,
    },
    recentHistory: [
      {
        callId: "call_mcp_02",
        timestampMs: 1718290980000,
        arguments: { tableSelector: "#checkout-cart-table", maxRows: 10 },
        executionTimeMs: 7.9,
        status: "success",
        resultSummary: "Extracted 2 items (Subtotal: $45.00)",
      },
    ],
  },
];
// ============================================================================
// [END_DEMO_STUB: WebMcpToolsRegistry]
// ============================================================================
```

---

### 4.3 CDP Stream Log Demo Stub
```typescript
// ============================================================================
// [DEMO_STUB: CdpStreamLogDemo]
// DESCRIPTION: Mock CDP JSON-RPC telemetry entries with network and frame events.
// BACKEND_ROUTE: GET /api/browser/tabs/:tabId/cdp/logs -> superagent_core_v2::server::routes::browser::get_cdp_stream
// SEARCH_TAG: #DEMO_CDP_STREAM_LOGS
// ============================================================================

export interface CdpLogEntry {
  id: string;
  timestampMs: number;
  direction: 'inbound' | 'outbound';
  method: string;
  category: 'Network' | 'DOM' | 'Page' | 'Runtime' | 'Security';
  summary: string;
  params?: Record<string, unknown>;
  latencyMs?: number;
  level: 'info' | 'warning' | 'error';
}

export const DEMO_CDP_STREAM_LOGS: CdpLogEntry[] = [
  {
    id: "cdp-log-101",
    timestampMs: 1718291040010,
    direction: "outbound",
    method: "Network.requestWillBeSent",
    category: "Network",
    summary: "POST https://portal.example.com/api/v1/orders/validate",
    params: { method: "POST", url: "https://portal.example.com/api/v1/orders/validate", hasPostData: true },
    level: "info",
  },
  {
    id: "cdp-log-102",
    timestampMs: 1718291040142,
    direction: "inbound",
    method: "Network.responseReceived",
    category: "Network",
    summary: "Status 200 OK (application/json, 1,420 bytes)",
    params: { status: 200, mimeType: "application/json", encodedDataLength: 1420 },
    latencyMs: 132,
    level: "info",
  },
  {
    id: "cdp-log-103",
    timestampMs: 1718291040210,
    direction: "inbound",
    method: "DOM.childNodeInserted",
    category: "DOM",
    summary: "Inserted DIV#validation-badge into container #order-summary",
    level: "info",
  },
  {
    id: "cdp-log-104",
    timestampMs: 1718291040350,
    direction: "inbound",
    method: "Page.lifecycleEvent",
    category: "Page",
    summary: "Lifecycle event: networkIdle achieved",
    params: { name: "networkIdle", frameId: "F014A" },
    level: "info",
  },
  {
    id: "cdp-log-105",
    timestampMs: 1718291040400,
    direction: "inbound",
    method: "Runtime.consoleAPICalled",
    category: "Runtime",
    summary: "[Warning] Third-party cookie will be blocked in future Chrome releases",
    level: "warning",
  },
];
// ============================================================================
// [END_DEMO_STUB: CdpStreamLogDemo]
// ============================================================================
```

---

## 5. Comprehensive Test Case Catalog

This catalog outlines mandatory automated and manual verification procedures for the Browser Automation and Tab Leasing Center.

| Test ID | Scenario | Pre-Conditions | Execution Steps | Expected Result | Pass Criteria |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **TC-BR-001** | **Tab Crash Recovery** | Agent actively automating a leased browser tab. | 1. User or OS terminates the tab renderer process (`kill -9` on Chrome renderer PID or navigate to `chrome://crash`).<br>2. CDP emits `Target.targetCrashed`. | Daemon intercepts crash event, transitions tab state to `crashed`, cancels pending tool actions, cleanly detaches debugger, and renders retry prompt: *"Tab crashed. Re-open tab?"*. | No daemon crash. UI displays red error badge and enables clean recovery without freezing agent loop. |
| **TC-BR-002** | **Lease Expiration Mid-Workflow** | Tab claimed with 60s lease; agent executing multi-step form entry. | 1. Countdown timer reaches `00:00` without user or automated renewal.<br>2. Agent attempts next DOM action. | Daemon rejects action with `BrowserUseSecurityError("lease_expired")`. In-page badge removes itself. Debugger session detaches gracefully. | User retains unhindered manual control of their tab. No orphan debugger banners remain in Chrome. |
| **TC-BR-003** | **Cross-Origin Iframe Navigation** | Form submission navigates within a third-party embedded iframe. | 1. Top-level page is `https://store.com`.<br>2. Payment form submits inside iframe `https://payment-gateway.com`. | Security engine runs origin verification: checks iframe URL against trusted PCI-DSS gateway whitelist. If origin is untrusted, execution pauses and triggers 4-tier security confirmation. | Prevents silent data exfiltration to deceptive cross-origin parent or child frames. |
| **TC-BR-004** | **Cookie & Session Reuse Verification** | User is logged into corporate SSO in Google Chrome. | 1. Agent calls `claimExistingTab("https://portal.corp.com")`.<br>2. Agent navigates to internal report. | Leased tab inherits existing active session cookies. Report loads immediately without triggering SSO credentials login prompt. | 100% authentication persistence. No new login required. |
| **TC-BR-005** | **In-Page DOM Badge Tampering** | Malicious or aggressive page script attempts to delete agent controls. | 1. Page script executes `document.querySelector('#superagent-agent-badge').remove()`. | MutationObserver inside injected content script detects removal within 250ms, re-attaches closed Shadow DOM badge, and logs audit alert. | Badge remains visible and interactive despite host page DOM manipulation. |
| **TC-BR-006** | **WebMCP Schema Mismatch Handling** | Page updates frontend JS, altering expected arguments for a WebMCP tool. | 1. Agent invokes `fill_checkout_form` with legacy parameters.<br>2. In-page script throws JSON Schema validation error. | Core daemon intercepts structured error, wraps failure with exact schema diff, and passes error back to agent planner to adjust parameters. | Graceful error recovery in 1 turn rather than catastrophic runtime exception. |
| **TC-BR-007** | **Concurrent Tab Lease Contention** | Two autonomous subagents attempt to claim the same browser tab. | 1. Subagent A claims `@tab-checkout` (Lease acquired).<br>2. Subagent B attempts `claimExistingTab` for the same URL. | Daemon lease manager returns lock error: `TAB_ALREADY_LEASED`. Subagent B falls back to Tier 2: creates an isolated tab (`createTab`) automatically. | No collision or duplicate conflicting input dispatch into a single browser tab. |
