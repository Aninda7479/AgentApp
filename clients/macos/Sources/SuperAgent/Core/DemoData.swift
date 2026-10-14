//
// DemoData.swift
// SuperAgent
//
// Extensive native demo datasets and mock state definitions for all 10 SuperAgent workspaces.
// Every section is strictly delineated with searchable demo stub banners for rapid testing
// and offline presentation.
//

import Foundation

// ============================================================================
// [DEMO_STUB: ComputerUseDemo]
// DESCRIPTION: Mock capture stream metadata, settling radar, and trajectory for Computer Use.
// BACKEND_ROUTE: GET /api/computer-use/windows/:hwnd/capture -> superagent_core_v2::tools::computer_use::capture_wgc
// SEARCH_TAG: #DEMO_COMPUTER_USE
// ============================================================================

public struct WindowItemDemo: Identifiable, Codable, Equatable {
    public let id: String
    public let title: String
    public let appName: String
    public let pid: Int
    public let hwnd: String
    public let isOccluded: Bool
    public let isMinimized: Bool
    public let isModal: Bool
    public let bounds: RectDemo

    public init(
        id: String,
        title: String,
        appName: String,
        pid: Int,
        hwnd: String,
        isOccluded: Bool = false,
        isMinimized: Bool = false,
        isModal: Bool = false,
        bounds: RectDemo
    ) {
        self.id = id
        self.title = title
        self.appName = appName
        self.pid = pid
        self.hwnd = hwnd
        self.isOccluded = isOccluded
        self.isMinimized = isMinimized
        self.isModal = isModal
        self.bounds = bounds
    }
}

public struct RectDemo: Codable, Equatable {
    public let x: Double
    public let y: Double
    public let width: Double
    public let height: Double

    public init(x: Double, y: Double, width: Double, height: Double) {
        self.x = x
        self.y = y
        self.width = width
        self.height = height
    }
}

public struct AccessibilityNodeDemo: Identifiable, Codable, Equatable {
    public var id: String { "\(elementIndex)-\(automationId)" }
    public let elementIndex: Int
    public let automationId: String
    public let role: String
    public let name: String
    public let value: String?
    public let bounds: RectDemo
    public let actions: [String]
    public let isFocused: Bool
    public let isFocusable: Bool
    public let children: [AccessibilityNodeDemo]?

    public init(
        elementIndex: Int,
        automationId: String,
        role: String,
        name: String,
        value: String? = nil,
        bounds: RectDemo,
        actions: [String] = [],
        isFocused: Bool = false,
        isFocusable: Bool = true,
        children: [AccessibilityNodeDemo]? = nil
    ) {
        self.elementIndex = elementIndex
        self.automationId = automationId
        self.role = role
        self.name = name
        self.value = value
        self.bounds = bounds
        self.actions = actions
        self.isFocused = isFocused
        self.isFocusable = isFocusable
        self.children = children
    }
}

public struct SettlingStateDemo: Codable, Equatable {
    public var status: String // "settling", "stable", "timeout"
    public var baseDelayMs: Int
    public var spinnerHoldMs: Int
    public var maxHoldMs: Int
    public var hasActiveSpinner: Bool
    public var opticalDeltaPct: Double

    public init(
        status: String = "settling",
        baseDelayMs: Int = 1000,
        spinnerHoldMs: Int = 1420,
        maxHoldMs: Int = 5000,
        hasActiveSpinner: Bool = true,
        opticalDeltaPct: Double = 8.4
    ) {
        self.status = status
        self.baseDelayMs = baseDelayMs
        self.spinnerHoldMs = spinnerHoldMs
        self.maxHoldMs = maxHoldMs
        self.hasActiveSpinner = hasActiveSpinner
        self.opticalDeltaPct = opticalDeltaPct
    }
}

public struct TrajectoryPointDemo: Codable, Equatable {
    public let x: Double
    public let y: Double

    public init(x: Double, y: Double) {
        self.x = x
        self.y = y
    }
}

public struct ActiveTrajectoryDemo: Codable, Equatable {
    public let from: TrajectoryPointDemo
    public let to: TrajectoryPointDemo
    public let controlPoint1: TrajectoryPointDemo
    public let controlPoint2: TrajectoryPointDemo
    public let durationMs: Int
    public let velocityPxPerSec: Double
    public let targetElementIndex: Int
    public let actionType: String

    public init(
        from: TrajectoryPointDemo,
        to: TrajectoryPointDemo,
        controlPoint1: TrajectoryPointDemo,
        controlPoint2: TrajectoryPointDemo,
        durationMs: Int,
        velocityPxPerSec: Double,
        targetElementIndex: Int,
        actionType: String
    ) {
        self.from = from
        self.to = to
        self.controlPoint1 = controlPoint1
        self.controlPoint2 = controlPoint2
        self.durationMs = durationMs
        self.velocityPxPerSec = velocityPxPerSec
        self.targetElementIndex = targetElementIndex
        self.actionType = actionType
    }
}

public struct CaptureFrameMetadataDemo: Codable, Equatable {
    public let frameId: Int
    public let timestampMs: Int64
    public let hwnd: String
    public let sourceApp: String
    public let pixelWidth: Int
    public let pixelHeight: Int
    public let dpiScale: Double
    public let isOccluded: Bool
    public let settlingState: SettlingStateDemo
    public let activeTrajectory: ActiveTrajectoryDemo?

    public init(
        frameId: Int,
        timestampMs: Int64,
        hwnd: String,
        sourceApp: String,
        pixelWidth: Int,
        pixelHeight: Int,
        dpiScale: Double,
        isOccluded: Bool,
        settlingState: SettlingStateDemo,
        activeTrajectory: ActiveTrajectoryDemo?
    ) {
        self.frameId = frameId
        self.timestampMs = timestampMs
        self.hwnd = hwnd
        self.sourceApp = sourceApp
        self.pixelWidth = pixelWidth
        self.pixelHeight = pixelHeight
        self.dpiScale = dpiScale
        self.isOccluded = isOccluded
        self.settlingState = settlingState
        self.activeTrajectory = activeTrajectory
    }
}

public let DEMO_WINDOWS: [WindowItemDemo] = [
    WindowItemDemo(
        id: "win-1",
        title: "Visual Studio Code - AgentApp",
        appName: "Code.exe",
        pid: 10428,
        hwnd: "0x000A04E2",
        isOccluded: true,
        bounds: RectDemo(x: 100, y: 50, width: 1820, height: 1030)
    ),
    WindowItemDemo(
        id: "win-2",
        title: "Google Chrome - SuperAgent Docs",
        appName: "chrome.exe",
        pid: 8192,
        hwnd: "0x000C19B4",
        isOccluded: false,
        bounds: RectDemo(x: 200, y: 120, width: 1440, height: 900)
    ),
    WindowItemDemo(
        id: "win-3",
        title: "Terminal - cargo test",
        appName: "WindowsTerminal.exe",
        pid: 14092,
        hwnd: "0x000F88A1",
        isMinimized: true,
        bounds: RectDemo(x: 300, y: 300, width: 900, height: 600)
    )
]

public let DEMO_ACCESSIBILITY_TREE: AccessibilityNodeDemo = AccessibilityNodeDemo(
    elementIndex: 0,
    automationId: "root_window",
    role: "Window",
    name: "Visual Studio Code - AgentApp",
    bounds: RectDemo(x: 100, y: 50, width: 1820, height: 1030),
    actions: ["set_focus"],
    isFocusable: true,
    children: [
        AccessibilityNodeDemo(
            elementIndex: 1,
            automationId: "title_bar",
            role: "TitleBar",
            name: "AgentApp - Visual Studio Code",
            bounds: RectDemo(x: 100, y: 50, width: 1820, height: 35),
            actions: [],
            children: [
                AccessibilityNodeDemo(
                    elementIndex: 2,
                    automationId: "btn_save",
                    role: "Button",
                    name: "Save (Ctrl+S)",
                    bounds: RectDemo(x: 450, y: 55, width: 60, height: 25),
                    actions: ["click", "press"],
                    isFocusable: true
                ),
                AccessibilityNodeDemo(
                    elementIndex: 3,
                    automationId: "btn_minimize",
                    role: "Button",
                    name: "Minimize",
                    bounds: RectDemo(x: 1780, y: 50, width: 45, height: 35),
                    actions: ["click", "press"]
                )
            ]
        ),
        AccessibilityNodeDemo(
            elementIndex: 4,
            automationId: "editor_group",
            role: "Document",
            name: "src/main.rs",
            bounds: RectDemo(x: 350, y: 85, width: 1570, height: 955),
            actions: ["set_focus"],
            isFocusable: true,
            children: [
                AccessibilityNodeDemo(
                    elementIndex: 10,
                    automationId: "code_editor_area",
                    role: "EditField",
                    name: "Code Editor",
                    value: "use windows::Graphics::Capture;\n\npub fn capture_occluded_hwnd(hwnd: HWND) -> Result<Vec<u8>, CaptureError> {\n    let d3d_device = create_d3d11_device()?;\n    Ok(vec![])\n}",
                    bounds: RectDemo(x: 350, y: 85, width: 1570, height: 955),
                    actions: ["click", "set_focus", "set_value", "select"],
                    isFocused: true,
                    isFocusable: true
                )
            ]
        )
    ]
)

public let DEMO_OCCLUDED_CAPTURE: CaptureFrameMetadataDemo = CaptureFrameMetadataDemo(
    frameId: 40192,
    timestampMs: 1718291040000,
    hwnd: "0x000A04E2",
    sourceApp: "com.microsoft.VSCode",
    pixelWidth: 2730,
    pixelHeight: 1545,
    dpiScale: 1.5,
    isOccluded: true,
    settlingState: SettlingStateDemo(
        status: "settling",
        baseDelayMs: 1000,
        spinnerHoldMs: 1420,
        maxHoldMs: 5000,
        hasActiveSpinner: true,
        opticalDeltaPct: 8.4
    ),
    activeTrajectory: ActiveTrajectoryDemo(
        from: TrajectoryPointDemo(x: 420, y: 180),
        to: TrajectoryPointDemo(x: 840, y: 320),
        controlPoint1: TrajectoryPointDemo(x: 580, y: 160),
        controlPoint2: TrajectoryPointDemo(x: 720, y: 280),
        durationMs: 450,
        velocityPxPerSec: 1420.0,
        targetElementIndex: 10,
        actionType: "click"
    )
)

// ============================================================================
// [END_DEMO_STUB: ComputerUseDemo]
// ============================================================================


// ============================================================================
// [DEMO_STUB: BrowserLeasingDemo]
// DESCRIPTION: Two-tiered tab leasing, WebMCP in-page tools, and CDP log events.
// BACKEND_ROUTE: GET /api/browser/tabs -> superagent_core_v2::tools::browser
// SEARCH_TAG: #DEMO_BROWSER_LEASING
// ============================================================================

public struct BrowserTabDemo: Identifiable, Codable, Equatable {
    public let id: String
    public let title: String
    public let url: String
    public let mentionKey: String
    public let tierType: String // "claimed_existing" or "isolated_sandbox"
    public var remainingSeconds: Int
    public let totalSeconds: Int
    public let targetId: String
    public let favicon: String
    public let isOperating: Bool

    public init(
        id: String,
        title: String,
        url: String,
        mentionKey: String,
        tierType: String,
        remainingSeconds: Int,
        totalSeconds: Int = 60,
        targetId: String,
        favicon: String = "globe",
        isOperating: Bool = true
    ) {
        self.id = id
        self.title = title
        self.url = url
        self.mentionKey = mentionKey
        self.tierType = tierType
        self.remainingSeconds = remainingSeconds
        self.totalSeconds = totalSeconds
        self.targetId = targetId
        self.favicon = favicon
        self.isOperating = isOperating
    }
}

public struct WebMcpToolDemo: Identifiable, Codable, Equatable {
    public let id: String
    public let name: String
    public let description: String
    public let avgExecutionMs: Double
    public let invocations: Int
    public let successRate: Double
    public let parametersSummary: String

    public init(
        id: String,
        name: String,
        description: String,
        avgExecutionMs: Double,
        invocations: Int,
        successRate: Double,
        parametersSummary: String
    ) {
        self.id = id
        self.name = name
        self.description = description
        self.avgExecutionMs = avgExecutionMs
        self.invocations = invocations
        self.successRate = successRate
        self.parametersSummary = parametersSummary
    }
}

public struct CdpEventDemo: Identifiable, Codable, Equatable {
    public let id: String
    public let timestamp: String
    public let method: String
    public let category: String // "Network", "DOM", "Log", "Fetch"
    public let payloadSummary: String

    public init(id: String, timestamp: String, method: String, category: String, payloadSummary: String) {
        self.id = id
        self.timestamp = timestamp
        self.method = method
        self.category = category
        self.payloadSummary = payloadSummary
    }
}

public let DEMO_CLAIMED_TABS: [BrowserTabDemo] = [
    BrowserTabDemo(
        id: "tab-1",
        title: "Checkout Portal - Example Store",
        url: "https://portal.example.com/checkout",
        mentionKey: "@tab-checkout",
        tierType: "claimed_existing",
        remainingSeconds: 42,
        totalSeconds: 60,
        targetId: "B401920F-1024",
        favicon: "cart",
        isOperating: true
    ),
    BrowserTabDemo(
        id: "tab-2",
        title: "SuperAgent Architecture Guide",
        url: "https://docs.superagent.sh/guide",
        mentionKey: "@tab-docs",
        tierType: "claimed_existing",
        remainingSeconds: 58,
        totalSeconds: 60,
        targetId: "C882190A-4120",
        favicon: "book",
        isOperating: false
    ),
    BrowserTabDemo(
        id: "tab-3",
        title: "Isolated Sandbox Context",
        url: "about:blank",
        mentionKey: "@tab-sandbox",
        tierType: "isolated_sandbox",
        remainingSeconds: 120,
        totalSeconds: 120,
        targetId: "SANDBOX-991A",
        favicon: "shield.lefthalf.filled",
        isOperating: false
    )
]

public let DEMO_WEBMCP_TOOLS: [WebMcpToolDemo] = [
    WebMcpToolDemo(
        id: "tool-1",
        name: "fill_checkout_form",
        description: "Fills shipping, contact, and billing fields via direct DOM tree mutation.",
        avgExecutionMs: 14.2,
        invocations: 12,
        successRate: 100.0,
        parametersSummary: "{ fullName: str, addressLine: str, postalCode: str, paymentMethod: 'card'|'paypal' }"
    ),
    WebMcpToolDemo(
        id: "tool-2",
        name: "query_table",
        description: "Extracts pricing and SKU rows into structured JSON array in ~8ms.",
        avgExecutionMs: 8.4,
        invocations: 48,
        successRate: 99.4,
        parametersSummary: "{ selector: '#cart-items', columns: ['sku', 'price', 'qty'] }"
    ),
    WebMcpToolDemo(
        id: "tool-3",
        name: "extract_pricing_tiers",
        description: "Scrapes pricing cards, trial periods, and currency symbols.",
        avgExecutionMs: 11.0,
        invocations: 6,
        successRate: 100.0,
        parametersSummary: "{ cardClass: '.pricing-plan', includeDiscounts: true }"
    ),
    WebMcpToolDemo(
        id: "tool-4",
        name: "trigger_submit",
        description: "Dispatches authenticated form submit event with synthetic validation check.",
        avgExecutionMs: 16.5,
        invocations: 4,
        successRate: 100.0,
        parametersSummary: "{ formSelector: '#order-form', bypassValidation: false }"
    )
]

public let DEMO_CDP_EVENTS: [CdpEventDemo] = [
    CdpEventDemo(id: "cdp-1", timestamp: "14:20:01.102", method: "Network.requestWillBeSent", category: "Network", payloadSummary: "POST /api/v1/checkout/session (size: 420 B)"),
    CdpEventDemo(id: "cdp-2", timestamp: "14:20:01.184", method: "Fetch.requestPaused", category: "Fetch", payloadSummary: "Intercepted request to https://pay.stripe.com/v3/elements"),
    CdpEventDemo(id: "cdp-3", timestamp: "14:20:01.320", method: "DOM.childNodeInserted", category: "DOM", payloadSummary: "Node #42 (<div class='confirmation-card'>) inserted under #app"),
    CdpEventDemo(id: "cdp-4", timestamp: "14:20:02.004", method: "Runtime.consoleAPICalled", category: "Log", payloadSummary: "[WebMCP] Injected 4 tools into global window.__superagent_mcp__"),
    CdpEventDemo(id: "cdp-5", timestamp: "14:20:02.412", method: "Network.responseReceived", category: "Network", payloadSummary: "HTTP 200 OK (Content-Type: application/json, 1.8 KB)")
]

// ============================================================================
// [END_DEMO_STUB: BrowserLeasingDemo]
// ============================================================================


// ============================================================================
// [DEMO_STUB: SecurityGuardianDemo]
// DESCRIPTION: 4-Tier confirmation requests, 16-state zo badges, and recovery actions.
// BACKEND_ROUTE: WS /ws -> superagent_core_v2::guardian
// SEARCH_TAG: #DEMO_SECURITY_GUARDIAN
// ============================================================================

public enum SecurityTierDemo: String, CaseIterable, Codable {
    case mode1Handoff = "mode1_handoff"
    case mode2AlwaysConfirm = "mode2_always_confirm"
    case mode3PreApproval = "mode3_pre_approval"
    case mode4Silent = "mode4_silent"

    public var title: String {
        switch self {
        case .mode1Handoff: return "Mode 1: Hand-Off Required"
        case .mode2AlwaysConfirm: return "Mode 2: Always Confirm"
        case .mode3PreApproval: return "Mode 3: Pre-Approval"
        case .mode4Silent: return "Mode 4: No Confirmation"
        }
    }
}

public struct SecurityConfirmationDemo: Identifiable, Codable, Equatable {
    public let id: String
    public let tier: SecurityTierDemo
    public let title: String
    public let riskDescription: String
    public let actionSummary: String
    public let destinationTarget: String
    public let mechanism: String
    public let origin: String
    public let processName: String
    public let timeoutSeconds: Int

    public init(
        id: String,
        tier: SecurityTierDemo,
        title: String,
        riskDescription: String,
        actionSummary: String,
        destinationTarget: String,
        mechanism: String,
        origin: String,
        processName: String,
        timeoutSeconds: Int = 60
    ) {
        self.id = id
        self.tier = tier
        self.title = title
        self.riskDescription = riskDescription
        self.actionSummary = actionSummary
        self.destinationTarget = destinationTarget
        self.mechanism = mechanism
        self.origin = origin
        self.processName = processName
        self.timeoutSeconds = timeoutSeconds
    }
}

public struct ZoDecisionBadgeDemo: Identifiable, Codable, Equatable {
    public var id: String { stateKey }
    public let stateKey: String
    public let decisionSource: String
    public let isRetryable: Bool
    public let colorHex: String
    public let explanation: String

    public init(stateKey: String, decisionSource: String, isRetryable: Bool, colorHex: String, explanation: String) {
        self.stateKey = stateKey
        self.decisionSource = decisionSource
        self.isRetryable = isRetryable
        self.colorHex = colorHex
        self.explanation = explanation
    }
}

public let DEMO_ZO_DECISION_BADGES: [ZoDecisionBadgeDemo] = [
    ZoDecisionBadgeDemo(stateKey: "approval_cancelled", decisionSource: "approval", isRetryable: true, colorHex: "#f59e0b", explanation: "The permission request was dismissed before a decision was made."),
    ZoDecisionBadgeDemo(stateKey: "approval_failed_closed", decisionSource: "approval", isRetryable: true, colorHex: "#ef4444", explanation: "Permission request could not complete; access safely blocked."),
    ZoDecisionBadgeDemo(stateKey: "approval_unavailable", decisionSource: "approval", isRetryable: true, colorHex: "#f59e0b", explanation: "SuperAgent Guardian could not display the confirmation modal."),
    ZoDecisionBadgeDemo(stateKey: "browser_capability_blocked", decisionSource: "browser", isRetryable: false, colorHex: "#dc2626", explanation: "Browser capability policy strictly blocks this action on this domain."),
    ZoDecisionBadgeDemo(stateKey: "browser_capability_unavailable", decisionSource: "browser", isRetryable: true, colorHex: "#f59e0b", explanation: "Capability policy could not be verified; access blocked for safety."),
    ZoDecisionBadgeDemo(stateKey: "browser_context_unavailable", decisionSource: "browser", isRetryable: true, colorHex: "#64748b", explanation: "Target browser tab or window needed for action is no longer attached."),
    ZoDecisionBadgeDemo(stateKey: "browser_navigation_blocked", decisionSource: "browser", isRetryable: false, colorHex: "#dc2626", explanation: "Browser security engine blocked this navigation request."),
    ZoDecisionBadgeDemo(stateKey: "enterprise_policy_blocked", decisionSource: "enterprise", isRetryable: false, colorHex: "#991b1b", explanation: "Admin-enforced organizational policy blocks this action."),
    ZoDecisionBadgeDemo(stateKey: "enterprise_policy_unavailable", decisionSource: "enterprise", isRetryable: true, colorHex: "#f59e0b", explanation: "Enterprise policy check server unreachable; failing closed safely."),
    ZoDecisionBadgeDemo(stateKey: "guardian_denied", decisionSource: "guardian", isRetryable: false, colorHex: "#ef4444", explanation: "Guardian Auto-Review flagged potential prompt injection attack."),
    ZoDecisionBadgeDemo(stateKey: "guardian_timed_out", decisionSource: "guardian", isRetryable: true, colorHex: "#f59e0b", explanation: "Guardian Auto-Review evaluation timed out (>5000ms latency)."),
    ZoDecisionBadgeDemo(stateKey: "navigation_url_policy_blocked", decisionSource: "browser", isRetryable: false, colorHex: "#dc2626", explanation: "Target URL violates browser safety blocklist policy."),
    ZoDecisionBadgeDemo(stateKey: "persisted_user_denied", decisionSource: "user_persisted", isRetryable: false, colorHex: "#64748b", explanation: "Saved user preference permanently denies access to this domain."),
    ZoDecisionBadgeDemo(stateKey: "site_status_blocked", decisionSource: "site_status", isRetryable: false, colorHex: "#ef4444", explanation: "Destination flagged as deceptive, phishing, or malware site."),
    ZoDecisionBadgeDemo(stateKey: "site_status_unavailable", decisionSource: "site_status", isRetryable: true, colorHex: "#f59e0b", explanation: "Site safety verification temporarily unreachable."),
    ZoDecisionBadgeDemo(stateKey: "user_declined", decisionSource: "user_decision", isRetryable: false, colorHex: "#94a3b8", explanation: "User clicked 'Decline' on the security confirmation dialog.")
]

public let DEMO_SECURITY_CONFIRMATIONS: [SecurityConfirmationDemo] = [
    SecurityConfirmationDemo(
        id: "sec-conf-1",
        tier: .mode2AlwaysConfirm,
        title: "Permanent Production Database Mutation",
        riskDescription: "This action will permanently purge 1,420 user migration records from PostgreSQL.",
        actionSummary: "DROP TABLE users_temp_migration CASCADE;",
        destinationTarget: "psql://admin@db.internal.superagent.io:5432/core_stage",
        mechanism: "Direct execution via superagent-cli terminal tool",
        origin: "db.internal.superagent.io",
        processName: "superagent-cli"
    ),
    SecurityConfirmationDemo(
        id: "sec-conf-2",
        tier: .mode1Handoff,
        title: "User Takeover: Account Password Reset",
        riskDescription: "Credential change workflow requires direct user manual entry to maintain zero-leak security.",
        actionSummary: "Enter new master passphrase on https://github.com/settings/security",
        destinationTarget: "https://github.com/session",
        mechanism: "Yielding keyboard and mouse focus to physical user",
        origin: "github.com",
        processName: "Google Chrome"
    )
]

public let DEMO_VAULT_RECOVERY_BRANCHES: [String] = [
    "1. retry_after_credential_delivery",
    "2. navigate_to_new_document",
    "3. create_new_tab",
    "4. request_manual_handoff",
    "5. restart_browser_runtime",
    "6. retry_after_resolution",
    "7. stop"
]

// ============================================================================
// [END_DEMO_STUB: SecurityGuardianDemo]
// ============================================================================


// ============================================================================
// [DEMO_STUB: ReplConsoleDemo]
// DESCRIPTION: 25k virtualized terminal buffer, ANSI color parser, and scope tree.
// BACKEND_ROUTE: WS /ws: 'cua-repl' -> superagent_core_v2::repl
// SEARCH_TAG: #DEMO_REPL_CONSOLE
// ============================================================================

public struct ReplScopeNodeDemo: Identifiable, Codable, Equatable {
    public let id: String
    public let name: String
    public let typeName: String
    public let valuePreview: String
    public let children: [ReplScopeNodeDemo]?

    public init(id: String, name: String, typeName: String, valuePreview: String, children: [ReplScopeNodeDemo]? = nil) {
        self.id = id
        self.name = name
        self.typeName = typeName
        self.valuePreview = valuePreview
        self.children = children
    }
}

public let DEMO_REPL_SCOPE: [ReplScopeNodeDemo] = [
    ReplScopeNodeDemo(
        id: "scope-1",
        name: "activeTabs",
        typeName: "Array(2)",
        valuePreview: "[ Tab(@tab-checkout), Tab(@tab-docs) ]",
        children: [
            ReplScopeNodeDemo(id: "tab-sub-1", name: "0", typeName: "BrowserTab", valuePreview: "{ id: 'tab-1', url: 'https://portal.example.com' }"),
            ReplScopeNodeDemo(id: "tab-sub-2", name: "1", typeName: "BrowserTab", valuePreview: "{ id: 'tab-2', url: 'https://docs.superagent.sh' }")
        ]
    ),
    ReplScopeNodeDemo(
        id: "scope-2",
        name: "targetWindow",
        typeName: "Object",
        valuePreview: "{ hwnd: '0x000A04E2', pid: 10428, title: 'VS Code' }",
        children: [
            ReplScopeNodeDemo(id: "tw-1", name: "hwnd", typeName: "string", valuePreview: "\"0x000A04E2\""),
            ReplScopeNodeDemo(id: "tw-2", name: "pid", typeName: "number", valuePreview: "10428"),
            ReplScopeNodeDemo(id: "tw-3", name: "isOccluded", typeName: "boolean", valuePreview: "true")
        ]
    ),
    ReplScopeNodeDemo(
        id: "scope-3",
        name: "cua",
        typeName: "ComputerUseAPI",
        valuePreview: "NativeDriver(WGC + Direct3D11)",
        children: [
            ReplScopeNodeDemo(id: "cua-1", name: "settlingDelayMs", typeName: "number", valuePreview: "1000"),
            ReplScopeNodeDemo(id: "cua-2", name: "maxHoldMs", typeName: "number", valuePreview: "5000")
        ]
    ),
    ReplScopeNodeDemo(
        id: "scope-4",
        name: "sky",
        typeName: "ScreenCaptureKit",
        valuePreview: "Direct3D11Engine(swapchain: 30 FPS)"
    )
]

public let DEMO_REPL_LOG_LINES: [String] = [
    "[14:24:01] \u{001B}[36mcua_repl initialized in persistent mode (pid: 14082, node: v20.12.0)\u{001B}[0m",
    "[14:24:02] Connected surfaces: [computer, browser]",
    "> const app = await cua.getApp({ windowId: 2048 });",
    "< \u{001B}[32mBound to window 2048 (\"Visual Studio Code - AgentApp\")\u{001B}[0m",
    "> const ax = await app.getAXState({ disableDiffing: false });",
    "[AX Tree Diff] \u{001B}[32m+2 elements added\u{001B}[0m, \u{001B}[31m-0 removed\u{001B}[0m, ~1 updated",
    "AX Nodes discovered: 142 (active element: #10 code_editor_area)",
    "> await app.click([840, 320], { mouseButton: \"left\" });",
    "< \u{001B}[32mSynthetic left click dispatched at (840, 320) [Latency: 4.2ms]\u{001B}[0m",
    "[14:24:06] \u{001B}[33mBuffer status: 14,280 tokens resident in 25,000 token ring buffer\u{001B}[0m"
]

// ============================================================================
// [END_DEMO_STUB: ReplConsoleDemo]
// ============================================================================


// ============================================================================
// [DEMO_STUB: CompanionDemo]
// DESCRIPTION: 3D VRM Companion, emotion moods, audio viseme FFT, and photo presets.
// BACKEND_ROUTE: GET /api/companion/state -> superagent_core_v2::partner
// SEARCH_TAG: #DEMO_COMPANION
// ============================================================================

public enum CompanionMoodDemo: String, CaseIterable, Codable {
    case joy = "Joy"
    case thinking = "Thinking"
    case error = "Error"
    case welcoming = "Welcoming"
    case sleeping = "Sleeping"

    public var systemIcon: String {
        switch self {
        case .joy: return "sparkles"
        case .thinking: return "brain.head.profile"
        case .error: return "exclamationmark.triangle.fill"
        case .welcoming: return "hand.wave.fill"
        case .sleeping: return "moon.zzz.fill"
        }
    }

    public var colorHex: String {
        switch self {
        case .joy: return "#10b981"
        case .thinking: return "#8b5cf6"
        case .error: return "#ef4444"
        case .welcoming: return "#06b6d4"
        case .sleeping: return "#64748b"
        }
    }
}

public struct CompanionStateDemo: Codable, Equatable {
    public var name: String
    public var currentMood: CompanionMoodDemo
    public var affinityLevel: Int
    public var dailyStreakDays: Int
    public var isFloatingPetActive: Bool
    public var visemeLevels: [String: Double] // "aa", "ih", "ou", "ee", "oh"

    public init(
        name: String = "Lumina",
        currentMood: CompanionMoodDemo = .welcoming,
        affinityLevel: Int = 84,
        dailyStreakDays: Int = 12,
        isFloatingPetActive: Bool = false,
        visemeLevels: [String: Double] = ["aa": 0.65, "ih": 0.40, "ou": 0.15, "ee": 0.80, "oh": 0.30]
    ) {
        self.name = name
        self.currentMood = currentMood
        self.affinityLevel = affinityLevel
        self.dailyStreakDays = dailyStreakDays
        self.isFloatingPetActive = isFloatingPetActive
        self.visemeLevels = visemeLevels
    }
}

public let DEMO_PHOTO_PRESETS: [String] = [
    "Portrait (FOV 24°, Studio Softbox)",
    "Half-Body (FOV 32°, Cyberpunk Neon)",
    "Full-Body (FOV 42°, Sunset Horizon)",
    "Chroma Key (Solid #00FF00 OBS)"
]

// ============================================================================
// [END_DEMO_STUB: CompanionDemo]
// ============================================================================


// ============================================================================
// [DEMO_STUB: CreativeStudioDemo]
// DESCRIPTION: Image generation parameters, aspect ratios, color palettes, and video stage.
// BACKEND_ROUTE: POST /api/images/generate & POST /api/videos/generate -> superagent_core_v2
// SEARCH_TAG: #DEMO_CREATIVE_STUDIO
// ============================================================================

public struct ImageGenParamsDemo: Codable, Equatable {
    public var prompt: String
    public var negativePrompt: String
    public var aspectRatio: String
    public var steps: Int
    public var cfgScale: Double
    public var seed: Int
    public var watermarkEnabled: Bool
    public var watermarkAnchor: String
    public var activePalette: String

    public init(
        prompt: String = "A futuristic cybernetic laboratory with holographic terminals, neon teal lighting, 8k resolution, masterpiece",
        negativePrompt: String = "blurry, distorted, low quality, artifacts, watermark, grainy, out of frame",
        aspectRatio: String = "16:9",
        steps: Int = 28,
        cfgScale: Double = 4.5,
        seed: Int = 492817291,
        watermarkEnabled: Bool = true,
        watermarkAnchor: String = "Bottom-Right",
        activePalette: String = "Teal & Obsidian"
    ) {
        self.prompt = prompt
        self.negativePrompt = negativePrompt
        self.aspectRatio = aspectRatio
        self.steps = steps
        self.cfgScale = cfgScale
        self.seed = seed
        self.watermarkEnabled = watermarkEnabled
        self.watermarkAnchor = watermarkAnchor
        self.activePalette = activePalette
    }
}

public struct FilmstripItemDemo: Identifiable, Codable, Equatable {
    public let id: String
    public let title: String
    public let prompt: String
    public let dimensions: String
    public let timestamp: String

    public init(id: String, title: String, prompt: String, dimensions: String, timestamp: String) {
        self.id = id
        self.title = title
        self.prompt = prompt
        self.dimensions = dimensions
        self.timestamp = timestamp
    }
}

public let DEMO_FILMSTRIP_ITEMS: [FilmstripItemDemo] = [
    FilmstripItemDemo(id: "film-1", title: "Cyber Laboratory", prompt: "Futuristic neon lab with holographic terminals", dimensions: "1344x768", timestamp: "14:18"),
    FilmstripItemDemo(id: "film-2", title: "Quantum Processor", prompt: "Macro close-up of superconducting quantum chip", dimensions: "1024x1024", timestamp: "13:52"),
    FilmstripItemDemo(id: "film-3", title: "Floating Data City", prompt: "Cyberpunk metropolis suspended above purple clouds", dimensions: "1216x832", timestamp: "12:30")
]

public struct VideoJobDemo: Identifiable, Codable, Equatable {
    public let id: String
    public let prompt: String
    public let engine: String
    public var status: String
    public var progressPercent: Int
    public let durationSec: Int
    public let fps: Int
    public let resolution: String

    public init(
        id: String,
        prompt: String,
        engine: String = "Wan2.1",
        status: String = "encoding",
        progressPercent: Int = 88,
        durationSec: Int = 6,
        fps: Int = 24,
        resolution: String = "1280x720"
    ) {
        self.id = id
        self.prompt = prompt
        self.engine = engine
        self.status = status
        self.progressPercent = progressPercent
        self.durationSec = durationSec
        self.fps = fps
        self.resolution = resolution
    }
}

public let DEMO_VIDEO_JOB: VideoJobDemo = VideoJobDemo(
    id: "vid-job-104",
    prompt: "Cinematic FPV drone shot flying through a neon illuminated cyberpunk canyon at twilight, 35mm anamorphic lens, volumetric smoke",
    engine: "Wan2.1",
    status: "encoding",
    progressPercent: 88,
    durationSec: 6,
    fps: 24,
    resolution: "1280x720"
)

// ============================================================================
// [END_DEMO_STUB: CreativeStudioDemo]
// ============================================================================


// ============================================================================
// [DEMO_STUB: PcbEcadDemo]
// DESCRIPTION: Schematic components, nets, copper layout layers, and real-time ERC rules.
// BACKEND_ROUTE: POST /api/pcb/erc -> superagent_core_v2::pcb
// SEARCH_TAG: #DEMO_PCB_ECAD
// ============================================================================

public struct PcbComponentDemo: Identifiable, Codable, Equatable {
    public let id: String
    public let designator: String
    public let value: String
    public let footprint: String
    public let lcscId: String
    public let x: Double
    public let y: Double

    public init(id: String, designator: String, value: String, footprint: String, lcscId: String, x: Double, y: Double) {
        self.id = id
        self.designator = designator
        self.value = value
        self.footprint = footprint
        self.lcscId = lcscId
        self.x = x
        self.y = y
    }
}

public struct PcbNetWireDemo: Identifiable, Codable, Equatable {
    public let id: String
    public let name: String
    public let fromPin: String
    public let toPin: String

    public init(id: String, name: String, fromPin: String, toPin: String) {
        self.id = id
        self.name = name
        self.fromPin = fromPin
        self.toPin = toPin
    }
}

public struct ErcRuleCheckDemo: Identifiable, Codable, Equatable {
    public let id: String
    public let code: String
    public let severity: String // "Error", "Warning", "Passed"
    public let message: String
    public let target: String

    public init(id: String, code: String, severity: String, message: String, target: String) {
        self.id = id
        self.code = code
        self.severity = severity
        self.message = message
        self.target = target
    }
}

public let DEMO_PCB_COMPONENTS: [PcbComponentDemo] = [
    PcbComponentDemo(id: "c-1", designator: "U1", value: "ESP32-S3-WROOM-1", footprint: "MODULE_ESP32-S3", lcscId: "C165948", x: 140, y: 120),
    PcbComponentDemo(id: "c-2", designator: "U2", value: "AMS1117-3.3V", footprint: "SOT-223", lcscId: "C6186", x: 60, y: 80),
    PcbComponentDemo(id: "c-3", designator: "C1", value: "100nF 50V", footprint: "C0603", lcscId: "C2040", x: 90, y: 85),
    PcbComponentDemo(id: "c-4", designator: "J1", value: "USB Type-C 16-Pin", footprint: "USB-C-16P", lcscId: "C165948", x: 30, y: 80),
    PcbComponentDemo(id: "c-5", designator: "U3", value: "BME280 Sensor", footprint: "LGA-8", lcscId: "C92489", x: 220, y: 120)
]

public let DEMO_PCB_NETS: [PcbNetWireDemo] = [
    PcbNetWireDemo(id: "net-1", name: "VBUS_5V", fromPin: "J1.VBUS", toPin: "U2.VIN"),
    PcbNetWireDemo(id: "net-2", name: "+3V3", fromPin: "U2.VOUT", toPin: "U1.VDD33"),
    PcbNetWireDemo(id: "net-3", name: "GND", fromPin: "J1.GND", toPin: "U1.GND"),
    PcbNetWireDemo(id: "net-4", name: "I2C_SDA", fromPin: "U1.GPIO4", toPin: "U3.SDA"),
    PcbNetWireDemo(id: "net-5", name: "I2C_SCL", fromPin: "U1.GPIO5", toPin: "U3.SCL")
]

public let DEMO_ERC_RULES: [ErcRuleCheckDemo] = [
    ErcRuleCheckDemo(id: "erc-1", code: "missing_decoupling", severity: "Warning", message: "U1 (ESP32-S3) missing 100nF decoupling cap near pin 2", target: "U1.VDD33"),
    ErcRuleCheckDemo(id: "erc-2", code: "missing_pullup", severity: "Passed", message: "I2C SDA/SCL pull-up resistors verified at 4.7kΩ", target: "I2C_BUS"),
    ErcRuleCheckDemo(id: "erc-3", code: "power_loop", severity: "Passed", message: "Zero circular loops detected between VBUS and +3V3 rails", target: "POWER_RAILS"),
    ErcRuleCheckDemo(id: "erc-4", code: "voltage_mismatch", severity: "Passed", message: "All logic levels match 3.3V domain specification", target: "LOGIC_DOMAIN"),
    ErcRuleCheckDemo(id: "erc-5", code: "floating_pin", severity: "Passed", message: "Zero unpulled high-impedance inputs", target: "ALL_PINS")
]

// ============================================================================
// [END_DEMO_STUB: PcbEcadDemo]
// ============================================================================


// ============================================================================
// [DEMO_STUB: TasksDemo]
// DESCRIPTION: 4-Column Kanban board and scheduled cron routines with Telegram alerts.
// BACKEND_ROUTE: GET /api/tasks & GET /api/routines -> superagent_core_v2::storage
// SEARCH_TAG: #DEMO_TASKS
// ============================================================================

public struct KanbanCardDemo: Identifiable, Codable, Equatable {
    public let id: String
    public var title: String
    public var description: String
    public var column: String // "todo", "in_progress", "blocked", "done"
    public var priority: String // "Low", "Medium", "High"
    public var assignee: String

    public init(id: String, title: String, description: String, column: String, priority: String, assignee: String) {
        self.id = id
        self.title = title
        self.description = description
        self.column = column
        self.priority = priority
        self.assignee = assignee
    }
}

public struct CronRoutineDemo: Identifiable, Codable, Equatable {
    public let id: String
    public var name: String
    public var cronExpression: String
    public var promptTemplate: String
    public var isEnabled: Bool
    public var notifyTelegram: Bool
    public var telegramChatId: String
    public var lastRunStatus: String

    public init(
        id: String,
        name: String,
        cronExpression: String,
        promptTemplate: String,
        isEnabled: Bool = true,
        notifyTelegram: Bool = true,
        telegramChatId: String = "@superagent_ops",
        lastRunStatus: String = "Success (12s ago)"
    ) {
        self.id = id
        self.name = name
        self.cronExpression = cronExpression
        self.promptTemplate = promptTemplate
        self.isEnabled = isEnabled
        self.notifyTelegram = notifyTelegram
        self.telegramChatId = telegramChatId
        self.lastRunStatus = lastRunStatus
    }
}

public let DEMO_KANBAN_CARDS: [KanbanCardDemo] = [
    KanbanCardDemo(id: "k-1", title: "Scaffold WGC Video Capturer", description: "Direct3D11 frame pool allocation in Rust Core", column: "todo", priority: "High", assignee: "@core"),
    KanbanCardDemo(id: "k-2", title: "Implement WebMCP Tool Registry", description: "Inject DOM tools into leased Chrome tabs", column: "in_progress", priority: "High", assignee: "@browser"),
    KanbanCardDemo(id: "k-3", title: "Review Production Migration Plan", description: "Awaiting Mode 2 User Security Confirmation", column: "blocked", priority: "Medium", assignee: "@guardian"),
    KanbanCardDemo(id: "k-4", title: "Native macOS SplitView Navigation", description: "SwiftUI Sidebar across all 10 workspaces", column: "done", priority: "High", assignee: "@macos")
]

public let DEMO_ROUTINES: [CronRoutineDemo] = [
    CronRoutineDemo(
        id: "r-1",
        name: "Morning Codebase Lint & Dependency Audit",
        cronExpression: "0 9 * * 1-5",
        promptTemplate: "Run cargo clippy and npm audit across all workspaces. Summarize vulnerabilities.",
        isEnabled: true,
        notifyTelegram: true,
        telegramChatId: "@superagent_audit"
    ),
    CronRoutineDemo(
        id: "r-2",
        name: "Periodic Git Status Check",
        cronExpression: "*/15 * * * *",
        promptTemplate: "Check git status of all local feature branches and prune stale locks.",
        isEnabled: false,
        notifyTelegram: false
    )
]

// ============================================================================
// [END_DEMO_STUB: TasksDemo]
// ============================================================================


// ============================================================================
// [DEMO_STUB: SystemDoctorDemo]
// DESCRIPTION: 8 hardware and environment readiness diagnostics for System Doctor.
// BACKEND_ROUTE: GET /api/doctor -> superagent_core_v2::server::doctor
// SEARCH_TAG: #DEMO_SYSTEM_DOCTOR
// ============================================================================

public struct DoctorCheckItemDemo: Identifiable, Codable, Equatable {
    public let id: String
    public let component: String
    public let status: String // "healthy", "warning", "failed"
    public let versionOrDetail: String
    public let recommendation: String

    public init(id: String, component: String, status: String, versionOrDetail: String, recommendation: String) {
        self.id = id
        self.component = component
        self.status = status
        self.versionOrDetail = versionOrDetail
        self.recommendation = recommendation
    }
}

public let DEMO_DOCTOR_CHECKS: [DoctorCheckItemDemo] = [
    DoctorCheckItemDemo(id: "doc-1", component: "Core v2 Daemon", status: "healthy", versionOrDetail: "Port 1469 (PID: 4182, 0.4ms latency)", recommendation: "Operational and responding to WebSocket /ws"),
    DoctorCheckItemDemo(id: "doc-2", component: "Apple Metal GPU Acceleration", status: "healthy", versionOrDetail: "Apple M-Series Metal 3 (Unified VRAM: 32 GB)", recommendation: "Ready for local diffusion and ML shaders"),
    DoctorCheckItemDemo(id: "doc-3", component: "Rust Toolchain", status: "healthy", versionOrDetail: "rustc 1.81.0 (stable-aarch64-apple-darwin)", recommendation: "Optimal compiler installed"),
    DoctorCheckItemDemo(id: "doc-4", component: "Node.js Runtime", status: "healthy", versionOrDetail: "v20.12.0 (Native ARM64)", recommendation: "Full V8 REPL compatibility guaranteed"),
    DoctorCheckItemDemo(id: "doc-5", component: "FFmpeg Video Pipeline", status: "healthy", versionOrDetail: "ffmpeg 7.0 (libx264, ProRes, WebM)", recommendation: "Hardware ProRes encoders active"),
    DoctorCheckItemDemo(id: "doc-6", component: "Apple Keychain Vault", status: "healthy", versionOrDetail: "SecItemAdd AES-256-GCM hardware key", recommendation: "Encrypted Zero-Leak storage verified"),
    DoctorCheckItemDemo(id: "doc-7", component: "Disk Space Availability", status: "healthy", versionOrDetail: "148 GB available on /", recommendation: "Sufficient room for checkpoints"),
    DoctorCheckItemDemo(id: "doc-8", component: "ScreenCaptureKit Permissions", status: "healthy", versionOrDetail: "Authorized by user in System Settings", recommendation: "Occluded window streaming available")
]

// ============================================================================
// [END_DEMO_STUB: SystemDoctorDemo]
// ============================================================================
