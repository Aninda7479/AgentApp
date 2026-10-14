//! Comprehensive demo data stubs and mock contracts for SuperAgent Linux Native UI.
//!
//! Provides realistic, typed mock datasets for Computer Use, Browser Leasing,
//! Security Guardian, In-Process REPL Console, 24-Module Settings, and System Doctor.
//! All stubs are tagged for automated searchability and verification.

use serde::{Deserialize, Serialize};
use std::collections::HashMap;

// ============================================================================
// [DEMO_STUB: ComputerUseWindowList]
// DESCRIPTION: Mock dataset of open desktop windows for window inspection, targeting, and WGC capture.
// BACKEND_ROUTE: GET /api/computer-use/windows -> superagent_core_v2::tools::computer_use::list_windows
// SEARCH_TAG: #DEMO_COMPUTER_USE_WINDOWS
// ============================================================================

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Default)]
#[serde(rename_all = "camelCase")]
pub struct WindowBounds {
    pub x: i32,
    pub y: i32,
    pub width: u32,
    pub height: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Default)]
#[serde(rename_all = "camelCase")]
pub struct DesktopWindowItem {
    pub id: u64,
    pub hwnd: String,
    pub app: String,
    pub title: String,
    pub process_id: u32,
    pub parent_process_id: u32,
    pub executable_path: String,
    pub bounds: WindowBounds,
    pub dpi_scale: f32,
    pub is_focused: bool,
    pub is_occluded: bool,
    pub is_minimized: bool,
    pub is_modal: bool,
    pub z_order: u32,
}

pub fn get_demo_computer_use_windows() -> Vec<DesktopWindowItem> {
    vec![
        DesktopWindowItem {
            id: 1042,
            hwnd: "0x000A04E2".to_string(),
            app: "com.microsoft.VSCode".to_string(),
            title: "AgentApp - Visual Studio Code".to_string(),
            process_id: 10428,
            parent_process_id: 4120,
            executable_path: "/usr/share/code/code".to_string(),
            bounds: WindowBounds {
                x: 100,
                y: 50,
                width: 1820,
                height: 1030,
            },
            dpi_scale: 1.5,
            is_focused: true,
            is_occluded: false,
            is_minimized: false,
            is_modal: false,
            z_order: 0,
        },
        DesktopWindowItem {
            id: 2088,
            hwnd: "0x001402F0".to_string(),
            app: "com.google.Chrome".to_string(),
            title: "SuperAgent Cloud Dashboard - Google Chrome".to_string(),
            process_id: 8192,
            parent_process_id: 4120,
            executable_path: "/opt/google/chrome/chrome".to_string(),
            bounds: WindowBounds {
                x: 200,
                y: 120,
                width: 1600,
                height: 900,
            },
            dpi_scale: 1.5,
            is_focused: false,
            is_occluded: true,
            is_minimized: false,
            is_modal: false,
            z_order: 1,
        },
        DesktopWindowItem {
            id: 3104,
            hwnd: "0x00080112".to_string(),
            app: "org.alacritty.Alacritty".to_string(),
            title: "Alacritty - cargo check -p superagent-core-v2".to_string(),
            process_id: 14210,
            parent_process_id: 4120,
            executable_path: "/usr/bin/alacritty".to_string(),
            bounds: WindowBounds {
                x: 50,
                y: 50,
                width: 1200,
                height: 800,
            },
            dpi_scale: 1.5,
            is_focused: false,
            is_occluded: true,
            is_minimized: true,
            is_modal: false,
            z_order: 2,
        },
        DesktopWindowItem {
            id: 4099,
            hwnd: "0x000508BC".to_string(),
            app: "org.gnome.TextEditor".to_string(),
            title: "Confirm Discard Changes".to_string(),
            process_id: 19804,
            parent_process_id: 4120,
            executable_path: "/usr/bin/gnome-text-editor".to_string(),
            bounds: WindowBounds {
                x: 720,
                y: 440,
                width: 480,
                height: 200,
            },
            dpi_scale: 1.5,
            is_focused: false,
            is_occluded: false,
            is_minimized: false,
            is_modal: true,
            z_order: 0,
        },
    ]
}
// ============================================================================
// [END_DEMO_STUB: ComputerUseWindowList]
// ============================================================================

// ============================================================================
// [DEMO_STUB: AccessibilityTreeDemo]
// DESCRIPTION: Mock hierarchical accessibility tree with numeric indices, roles, bounds, and actions.
// BACKEND_ROUTE: GET /api/computer-use/windows/:hwnd/ax-tree -> superagent_core_v2::tools::computer_use::get_ax_tree
// SEARCH_TAG: #DEMO_ACCESSIBILITY_TREE
// ============================================================================

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Default)]
#[serde(rename_all = "camelCase")]
pub struct AxBounds {
    pub left: i32,
    pub top: i32,
    pub width: u32,
    pub height: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Default)]
#[serde(rename_all = "camelCase")]
pub struct AccessibilityNode {
    pub element_index: u32,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub automation_id: Option<String>,
    pub role: String,
    pub name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub value: Option<String>,
    pub bounds: AxBounds,
    pub actions: Vec<String>,
    #[serde(default)]
    pub is_focused: bool,
    #[serde(default)]
    pub is_focusable: bool,
    #[serde(default)]
    pub is_expanded: bool,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub children: Vec<AccessibilityNode>,
}

pub fn get_demo_accessibility_tree() -> AccessibilityNode {
    AccessibilityNode {
        element_index: 0,
        automation_id: Some("root_window".to_string()),
        role: "Window".to_string(),
        name: "Visual Studio Code - AgentApp".to_string(),
        value: None,
        bounds: AxBounds {
            left: 100,
            top: 50,
            width: 1820,
            height: 1030,
        },
        actions: vec!["set_focus".to_string()],
        is_focused: false,
        is_focusable: true,
        is_expanded: false,
        children: vec![
            AccessibilityNode {
                element_index: 1,
                automation_id: Some("title_bar".to_string()),
                role: "TitleBar".to_string(),
                name: "AgentApp - Visual Studio Code".to_string(),
                value: None,
                bounds: AxBounds {
                    left: 100,
                    top: 50,
                    width: 1820,
                    height: 35,
                },
                actions: vec![],
                is_focused: false,
                is_focusable: false,
                is_expanded: false,
                children: vec![
                    AccessibilityNode {
                        element_index: 2,
                        automation_id: Some("btn_save".to_string()),
                        role: "Button".to_string(),
                        name: "Save (Ctrl+S)".to_string(),
                        value: None,
                        bounds: AxBounds {
                            left: 450,
                            top: 55,
                            width: 60,
                            height: 25,
                        },
                        actions: vec!["click".to_string(), "press".to_string()],
                        is_focused: false,
                        is_focusable: true,
                        is_expanded: false,
                        children: vec![],
                    },
                    AccessibilityNode {
                        element_index: 3,
                        automation_id: Some("btn_minimize".to_string()),
                        role: "Button".to_string(),
                        name: "Minimize".to_string(),
                        value: None,
                        bounds: AxBounds {
                            left: 1780,
                            top: 50,
                            width: 45,
                            height: 35,
                        },
                        actions: vec!["click".to_string(), "press".to_string()],
                        is_focused: false,
                        is_focusable: false,
                        is_expanded: false,
                        children: vec![],
                    },
                ],
            },
            AccessibilityNode {
                element_index: 4,
                automation_id: Some("editor_group".to_string()),
                role: "Document".to_string(),
                name: "src/main.rs".to_string(),
                value: None,
                bounds: AxBounds {
                    left: 350,
                    top: 85,
                    width: 1570,
                    height: 955,
                },
                actions: vec!["set_focus".to_string()],
                is_focused: false,
                is_focusable: true,
                is_expanded: false,
                children: vec![AccessibilityNode {
                    element_index: 10,
                    automation_id: Some("code_editor_area".to_string()),
                    role: "EditField".to_string(),
                    name: "Code Editor".to_string(),
                    value: Some(
                        "use superagent_core_v2::protocol;\n\npub fn capture_screen() -> Vec<u8> {\n    println!(\"Capturing occluded frame...\");\n    vec![0u8; 1024]\n}".to_string(),
                    ),
                    bounds: AxBounds {
                        left: 350,
                        top: 85,
                        width: 1570,
                        height: 955,
                    },
                    actions: vec![
                        "click".to_string(),
                        "set_focus".to_string(),
                        "set_value".to_string(),
                        "select".to_string(),
                    ],
                    is_focused: true,
                    is_focusable: true,
                    is_expanded: false,
                    children: vec![],
                }],
            },
        ],
    }
}
// ============================================================================
// [END_DEMO_STUB: AccessibilityTreeDemo]
// ============================================================================

// ============================================================================
// [DEMO_STUB: OccludedCaptureMock]
// DESCRIPTION: Mock capture stream metadata, settling radar, and trajectory.
// BACKEND_ROUTE: GET /api/computer-use/windows/:hwnd/capture -> superagent_core_v2::tools::computer_use::capture_frame
// SEARCH_TAG: #DEMO_OCCLUDED_CAPTURE
// ============================================================================

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Default)]
#[serde(rename_all = "camelCase")]
pub struct CaptureFrameMetadata {
    pub hwnd: String,
    pub width: u32,
    pub height: u32,
    pub format: String,
    pub frame_pool_count: usize,
    pub is_occluded: bool,
    pub capture_latency_ms: f32,
    pub settle_time_ms: u32,
    pub settle_state: String, // "settled", "settling", "displaced"
    pub frame_data_preview: String,
}

pub fn get_demo_occluded_capture() -> CaptureFrameMetadata {
    CaptureFrameMetadata {
        hwnd: "0x000A04E2".to_string(),
        width: 1820,
        height: 1030,
        format: "RGBA8_PREMULTIPLIED".to_string(),
        frame_pool_count: 3,
        is_occluded: true,
        capture_latency_ms: 11.4,
        settle_time_ms: 240,
        settle_state: "settled".to_string(),
        frame_data_preview: "base64://iVBORw0KGgoAAAANSUhEUgAABwAAAAQCAYAAAB2bM6eAAAgAElEQVR4..."
            .to_string(),
    }
}
// ============================================================================
// [END_DEMO_STUB: OccludedCaptureMock]
// ============================================================================

// ============================================================================
// [DEMO_STUB: BrowserTabLeaseList]
// DESCRIPTION: Two-tiered claimed and available browser tabs deck.
// BACKEND_ROUTE: GET /api/browser/tabs -> superagent_core_v2::server::routes::browser::list_tabs
// SEARCH_TAG: #DEMO_BROWSER_TABS
// ============================================================================

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Default)]
#[serde(rename_all = "camelCase")]
pub struct BrowserTabLease {
    pub id: String,
    pub target_id: String,
    pub mention_key: String,
    pub browser_type: String, // "chrome", "edge", "brave", "firefox"
    pub profile_name: String,
    pub title: String,
    pub url: String,
    pub favicon_url: String,
    pub is_claimed: bool,
    pub lease_type: String, // "SHARED_EXISTING", "EXCLUSIVE_NEW"
    #[serde(skip_serializing_if = "Option::is_none")]
    pub lease_start_time_ms: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub lease_expires_at_ms: Option<i64>,
    pub remaining_seconds: u32,
    pub renderer_process_id: u32,
    pub is_foreground: bool,
    pub has_webmcp: bool,
    pub webmcp_tools_count: usize,
    pub security_state: String, // "clean", "elevated", "blocked"
}

pub fn get_demo_browser_tab_leases() -> Vec<BrowserTabLease> {
    vec![
        BrowserTabLease {
            id: "tab-claimed-001".to_string(),
            target_id: "A8410291-7782-41A0-A912-88192048102A".to_string(),
            mention_key: "@tab-cart".to_string(),
            browser_type: "chrome".to_string(),
            profile_name: "Default".to_string(),
            title: "Acme Supplies - Secure Checkout & Payment".to_string(),
            url: "https://store.acmesupplies.com/checkout/step2".to_string(),
            favicon_url: "https://store.acmesupplies.com/favicon.ico".to_string(),
            is_claimed: true,
            lease_type: "EXCLUSIVE_NEW".to_string(),
            lease_start_time_ms: Some(1718291000000),
            lease_expires_at_ms: Some(1718291300000),
            remaining_seconds: 242,
            renderer_process_id: 18240,
            is_foreground: true,
            has_webmcp: true,
            webmcp_tools_count: 4,
            security_state: "elevated".to_string(),
        },
        BrowserTabLease {
            id: "tab-claimed-002".to_string(),
            target_id: "C1920481-9921-4A12-B819-90481204819B".to_string(),
            mention_key: "@tab-docs".to_string(),
            browser_type: "chrome".to_string(),
            profile_name: "Default".to_string(),
            title: "SuperAgent Architecture & UI Specification".to_string(),
            url: "https://docs.superagent.sh/guide/ui-spec".to_string(),
            favicon_url: "https://docs.superagent.sh/favicon.ico".to_string(),
            is_claimed: true,
            lease_type: "SHARED_EXISTING".to_string(),
            lease_start_time_ms: Some(1718291030000),
            lease_expires_at_ms: Some(1718291090000),
            remaining_seconds: 58,
            renderer_process_id: 21044,
            is_foreground: false,
            has_webmcp: false,
            webmcp_tools_count: 0,
            security_state: "clean".to_string(),
        },
        BrowserTabLease {
            id: "tab-candidate-003".to_string(),
            target_id: "D8491024-4102-4C99-A012-74910248102C".to_string(),
            mention_key: "@tab-github".to_string(),
            browser_type: "chrome".to_string(),
            profile_name: "Default".to_string(),
            title: "Pull Request #412: Next-Gen UI Automation - AgentApp".to_string(),
            url: "https://github.com/Aninda7479/AgentApp/pull/412".to_string(),
            favicon_url: "https://github.githubassets.com/favicons/favicon.svg".to_string(),
            is_claimed: false,
            lease_type: "SHARED_EXISTING".to_string(),
            lease_start_time_ms: None,
            lease_expires_at_ms: None,
            remaining_seconds: 0,
            renderer_process_id: 19402,
            is_foreground: false,
            has_webmcp: false,
            webmcp_tools_count: 0,
            security_state: "clean".to_string(),
        },
    ]
}
// ============================================================================
// [END_DEMO_STUB: BrowserTabLeaseList]
// ============================================================================

// ============================================================================
// [DEMO_STUB: WebMcpToolsRegistry]
// DESCRIPTION: Mock catalog of in-page registered WebMCP tools and execution telemetry.
// BACKEND_ROUTE: GET /api/browser/tabs/:tabId/webmcp/tools -> superagent_core_v2::server::routes::browser::get_webmcp_tools
// SEARCH_TAG: #DEMO_WEBMCP_TOOLS
// ============================================================================

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Default)]
#[serde(rename_all = "camelCase")]
pub struct WebMcpToolProperty {
    #[serde(rename = "type")]
    pub prop_type: String,
    pub description: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub r#enum: Option<Vec<String>>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Default)]
#[serde(rename_all = "camelCase")]
pub struct WebMcpToolParameters {
    #[serde(rename = "type")]
    pub schema_type: String,
    pub properties: HashMap<String, WebMcpToolProperty>,
    pub required: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Default)]
#[serde(rename_all = "camelCase")]
pub struct WebMcpMetrics {
    pub invocations_count: u32,
    pub avg_execution_time_ms: f32,
    pub success_rate_pct: f32,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub last_executed_timestamp_ms: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Default)]
#[serde(rename_all = "camelCase")]
pub struct WebMcpInvocationRecord {
    pub call_id: String,
    pub timestamp_ms: i64,
    pub arguments: serde_json::Value,
    pub execution_time_ms: f32,
    pub status: String, // "success", "error"
    pub result_summary: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Default)]
#[serde(rename_all = "camelCase")]
pub struct WebMcpToolDefinition {
    pub name: String,
    pub description: String,
    pub parameters: WebMcpToolParameters,
    pub metrics: WebMcpMetrics,
    pub recent_history: Vec<WebMcpInvocationRecord>,
}

pub fn get_demo_webmcp_tools_registry() -> Vec<WebMcpToolDefinition> {
    let mut props1 = HashMap::new();
    props1.insert(
        "fullName".to_string(),
        WebMcpToolProperty {
            prop_type: "string".to_string(),
            description: "Customer recipient full name".to_string(),
            r#enum: None,
        },
    );
    props1.insert(
        "addressLine".to_string(),
        WebMcpToolProperty {
            prop_type: "string".to_string(),
            description: "Street shipping address".to_string(),
            r#enum: None,
        },
    );
    props1.insert(
        "postalCode".to_string(),
        WebMcpToolProperty {
            prop_type: "string".to_string(),
            description: "ZIP / Postal code".to_string(),
            r#enum: None,
        },
    );
    props1.insert(
        "paymentMethod".to_string(),
        WebMcpToolProperty {
            prop_type: "string".to_string(),
            description: "Selected payment gateway".to_string(),
            r#enum: Some(vec![
                "credit_card".to_string(),
                "paypal".to_string(),
                "apple_pay".to_string(),
            ]),
        },
    );

    let mut props2 = HashMap::new();
    props2.insert(
        "tableSelector".to_string(),
        WebMcpToolProperty {
            prop_type: "string".to_string(),
            description: "CSS selector for table element".to_string(),
            r#enum: None,
        },
    );
    props2.insert(
        "maxRows".to_string(),
        WebMcpToolProperty {
            prop_type: "number".to_string(),
            description: "Maximum rows to return".to_string(),
            r#enum: None,
        },
    );

    vec![
        WebMcpToolDefinition {
            name: "fill_checkout_form".to_string(),
            description: "Fills customer shipping, contact, and billing details into the active checkout form.".to_string(),
            parameters: WebMcpToolParameters {
                schema_type: "object".to_string(),
                properties: props1,
                required: vec!["fullName".to_string(), "addressLine".to_string(), "postalCode".to_string()],
            },
            metrics: WebMcpMetrics {
                invocations_count: 14,
                avg_execution_time_ms: 14.2,
                success_rate_pct: 100.0,
                last_executed_timestamp_ms: Some(1718291035000),
            },
            recent_history: vec![WebMcpInvocationRecord {
                call_id: "call_mcp_01".to_string(),
                timestamp_ms: 1718291035000,
                arguments: serde_json::json!({
                    "fullName": "Alex Morgan",
                    "addressLine": "100 Market St, Suite 400",
                    "postalCode": "94105",
                    "paymentMethod": "credit_card"
                }),
                execution_time_ms: 12.8,
                status: "success".to_string(),
                result_summary: "{ success: true, updatedFields: 4 }".to_string(),
            }],
        },
        WebMcpToolDefinition {
            name: "query_table".to_string(),
            description: "Extracts structured table records (e.g. SKU, quantity, unit price) from cart summary tables.".to_string(),
            parameters: WebMcpToolParameters {
                schema_type: "object".to_string(),
                properties: props2,
                required: vec!["tableSelector".to_string()],
            },
            metrics: WebMcpMetrics {
                invocations_count: 38,
                avg_execution_time_ms: 8.4,
                success_rate_pct: 97.4,
                last_executed_timestamp_ms: Some(1718290980000),
            },
            recent_history: vec![WebMcpInvocationRecord {
                call_id: "call_mcp_02".to_string(),
                timestamp_ms: 1718290980000,
                arguments: serde_json::json!({
                    "tableSelector": "#checkout-cart-table",
                    "maxRows": 10
                }),
                execution_time_ms: 7.9,
                status: "success".to_string(),
                result_summary: "Extracted 2 items (Subtotal: $45.00)".to_string(),
            }],
        },
    ]
}
// ============================================================================
// [END_DEMO_STUB: WebMcpToolsRegistry]
// ============================================================================

// ============================================================================
// [DEMO_STUB: CdpStreamLogDemo]
// DESCRIPTION: Mock Chrome DevTools Protocol telemetry stream for CDP inspector.
// BACKEND_ROUTE: WS /ws -> superagent_core_v2::browser::cdp_events
// SEARCH_TAG: #DEMO_CDP_STREAM_LOGS
// ============================================================================

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Default)]
#[serde(rename_all = "camelCase")]
pub struct CdpStreamEvent {
    pub timestamp_ms: i64,
    pub domain: String, // "Page", "DOM", "Network", "Runtime", "Security"
    pub method: String,
    pub params: serde_json::Value,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
    pub target_id: String,
}

pub fn get_demo_cdp_stream_logs() -> Vec<CdpStreamEvent> {
    vec![
        CdpStreamEvent {
            timestamp_ms: 1718291034100,
            domain: "Page".to_string(),
            method: "Page.loadEventFired".to_string(),
            params: serde_json::json!({ "timestamp": 1718291034.102 }),
            error: None,
            target_id: "A8410291-7782-41A0-A912-88192048102A".to_string(),
        },
        CdpStreamEvent {
            timestamp_ms: 1718291034250,
            domain: "DOM".to_string(),
            method: "DOM.querySelector".to_string(),
            params: serde_json::json!({ "nodeId": 14, "selector": "#checkout-cart-table" }),
            error: None,
            target_id: "A8410291-7782-41A0-A912-88192048102A".to_string(),
        },
        CdpStreamEvent {
            timestamp_ms: 1718291035000,
            domain: "Runtime".to_string(),
            method: "Runtime.evaluate".to_string(),
            params: serde_json::json!({ "expression": "window.__superagent_webmcp_exec('fill_checkout_form', { ... })" }),
            error: None,
            target_id: "A8410291-7782-41A0-A912-88192048102A".to_string(),
        },
    ]
}
// ============================================================================
// [END_DEMO_STUB: CdpStreamLogDemo]
// ============================================================================

// ============================================================================
// [DEMO_STUB: SecurityConfirmationRequest]
// DESCRIPTION: Mock 4-Tier security confirmation request for testing Mode 1, 2, 3, 4 dialogs.
// BACKEND_ROUTE: WS /ws -> superagent_core_v2::protocol::events::SecurityConfirmationEvent
// SEARCH_TAG: #DEMO_SECURITY_CONFIRMATION
// ============================================================================

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Default)]
#[serde(rename_all = "camelCase")]
pub struct SecurityActionDetails {
    pub data_summary: String,
    pub destination_target: String,
    pub mechanism: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub raw_payload_snippet: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Default)]
#[serde(rename_all = "camelCase")]
pub struct SecurityActionMetadata {
    pub origin: String,
    pub window_title: String,
    pub process_name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub element_index: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub coordinates: Option<(i32, i32)>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Default)]
#[serde(rename_all = "camelCase")]
pub struct SecurityConfirmationRequest {
    pub id: String,
    pub tier_mode: String, // "mode1_handoff", "mode2_always_confirm", "mode3_pre_approval", "mode4_silent"
    pub category: String, // "data_deletion", "financial", "password_change", "account_creation", "file_upload", "system_settings"
    pub title: String,
    pub risk_description: String,
    pub action_details: SecurityActionDetails,
    pub metadata: SecurityActionMetadata,
    pub pre_approved_in_prompt: bool,
    pub timeout_seconds: u32,
}

pub fn get_demo_security_confirmations() -> Vec<SecurityConfirmationRequest> {
    vec![
        SecurityConfirmationRequest {
            id: "sec-conf-8891a".to_string(),
            tier_mode: "mode2_always_confirm".to_string(),
            category: "data_deletion".to_string(),
            title: "Confirm Permanent Deletion of Production Database Records".to_string(),
            risk_description: "This action will permanently purge 1,420 user records from the staging database. This cannot be undone.".to_string(),
            action_details: SecurityActionDetails {
                data_summary: "1,420 rows from 'users_temp_migration'".to_string(),
                destination_target: "psql://admin@db.internal.superagent.io:5432/core_stage".to_string(),
                mechanism: "Direct execution of 'DROP TABLE users_temp_migration;' via terminal tool".to_string(),
                raw_payload_snippet: Some("DROP TABLE users_temp_migration CASCADE;".to_string()),
            },
            metadata: SecurityActionMetadata {
                origin: "db.internal.superagent.io".to_string(),
                window_title: "AgentApp - Terminal Session 3".to_string(),
                process_name: "superagent-cli".to_string(),
                element_index: None,
                coordinates: None,
            },
            pre_approved_in_prompt: false,
            timeout_seconds: 60,
        },
        SecurityConfirmationRequest {
            id: "sec-conf-4402b".to_string(),
            tier_mode: "mode1_handoff".to_string(),
            category: "password_change".to_string(),
            title: "User Takeover Required: Change Account Password".to_string(),
            risk_description: "SuperAgent policy prohibits autonomous submission of password modification forms.".to_string(),
            action_details: SecurityActionDetails {
                data_summary: "New Master Password for user 'alex.dev'".to_string(),
                destination_target: "https://auth.enterprise.com/user/settings/security".to_string(),
                mechanism: "DOM Form Submit on '#password-update-form'".to_string(),
                raw_payload_snippet: None,
            },
            metadata: SecurityActionMetadata {
                origin: "https://auth.enterprise.com".to_string(),
                window_title: "Account Security Settings - Google Chrome".to_string(),
                process_name: "chrome".to_string(),
                element_index: Some(44),
                coordinates: Some((840, 520)),
            },
            pre_approved_in_prompt: false,
            timeout_seconds: 180,
        },
    ]
}
// ============================================================================
// [END_DEMO_STUB: SecurityConfirmationRequest]
// ============================================================================

// ============================================================================
// [DEMO_STUB: ZoDecisionMachineStates]
// DESCRIPTION: 16-State Security Decision Machine (zo) mapping reasons to badges, recovery policies and actions.
// BACKEND_ROUTE: GET /api/security/zo-states -> superagent_core_v2::security::zo
// SEARCH_TAG: #DEMO_ZO_DECISION_STATES
// ============================================================================

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Default)]
#[serde(rename_all = "camelCase")]
pub struct ZoStateBadge {
    pub state_key: String,
    pub decision_source: String,
    pub retryable: bool,
    pub badge_color: String,
    pub explanation: String,
}

pub fn get_demo_zo_states() -> Vec<ZoStateBadge> {
    vec![
        ZoStateBadge {
            state_key: "approval_cancelled".to_string(),
            decision_source: "approval".to_string(),
            retryable: true,
            badge_color: "#f59e0b".to_string(),
            explanation: "The permission request was dismissed before a decision was made. You may retry.".to_string(),
        },
        ZoStateBadge {
            state_key: "approval_failed_closed".to_string(),
            decision_source: "approval".to_string(),
            retryable: true,
            badge_color: "#ef4444".to_string(),
            explanation: "The permission request could not complete, so access was safely blocked.".to_string(),
        },
        ZoStateBadge {
            state_key: "approval_unavailable".to_string(),
            decision_source: "approval".to_string(),
            retryable: true,
            badge_color: "#f59e0b".to_string(),
            explanation: "SuperAgent Guardian could not display the permission request modal.".to_string(),
        },
        ZoStateBadge {
            state_key: "browser_capability_blocked".to_string(),
            decision_source: "browser".to_string(),
            retryable: false,
            badge_color: "#dc2626".to_string(),
            explanation: "The browser capability policy strictly blocks this action on this domain.".to_string(),
        },
        ZoStateBadge {
            state_key: "browser_capability_unavailable".to_string(),
            decision_source: "browser".to_string(),
            retryable: true,
            badge_color: "#f59e0b".to_string(),
            explanation: "The browser capability policy could not be verified; access blocked for safety.".to_string(),
        },
        ZoStateBadge {
            state_key: "browser_context_unavailable".to_string(),
            decision_source: "browser".to_string(),
            retryable: true,
            badge_color: "#64748b".to_string(),
            explanation: "The browser context or target tab needed for this action is no longer attached.".to_string(),
        },
        ZoStateBadge {
            state_key: "browser_navigation_blocked".to_string(),
            decision_source: "browser".to_string(),
            retryable: false,
            badge_color: "#dc2626".to_string(),
            explanation: "The browser blocked this navigation. This was not a site-status or user refusal.".to_string(),
        },
        ZoStateBadge {
            state_key: "enterprise_policy_blocked".to_string(),
            decision_source: "enterprise".to_string(),
            retryable: false,
            badge_color: "#991b1b".to_string(),
            explanation: "Admin-enforced organization policy blocks this action. Cannot be overridden.".to_string(),
        },
        ZoStateBadge {
            state_key: "enterprise_policy_unavailable".to_string(),
            decision_source: "enterprise".to_string(),
            retryable: true,
            badge_color: "#f59e0b".to_string(),
            explanation: "Enterprise policy check server could not be reached; failing closed safely.".to_string(),
        },
        ZoStateBadge {
            state_key: "guardian_denied".to_string(),
            decision_source: "guardian".to_string(),
            retryable: false,
            badge_color: "#ef4444".to_string(),
            explanation: "Guardian Auto-Review determined this action was unsafe (potential prompt injection).".to_string(),
        },
        ZoStateBadge {
            state_key: "guardian_timed_out".to_string(),
            decision_source: "guardian".to_string(),
            retryable: true,
            badge_color: "#f59e0b".to_string(),
            explanation: "Guardian Auto-Review timed out. Not confirmed unsafe; you may retry once.".to_string(),
        },
        ZoStateBadge {
            state_key: "navigation_url_policy_blocked".to_string(),
            decision_source: "browser".to_string(),
            retryable: false,
            badge_color: "#dc2626".to_string(),
            explanation: "The target URL violates the browser safety allowlist/blocklist policy.".to_string(),
        },
        ZoStateBadge {
            state_key: "persisted_user_denied".to_string(),
            decision_source: "user_persisted".to_string(),
            retryable: false,
            badge_color: "#64748b".to_string(),
            explanation: "A saved user permission setting permanently denies access to this domain.".to_string(),
        },
        ZoStateBadge {
            state_key: "site_status_blocked".to_string(),
            decision_source: "site_status".to_string(),
            retryable: false,
            badge_color: "#ef4444".to_string(),
            explanation: "The site-safety engine flagged this destination as deceptive, malware, or compromised.".to_string(),
        },
        ZoStateBadge {
            state_key: "site_status_unavailable".to_string(),
            decision_source: "site_status".to_string(),
            retryable: true,
            badge_color: "#f59e0b".to_string(),
            explanation: "Site safety verification was temporarily unreachable.".to_string(),
        },
        ZoStateBadge {
            state_key: "user_declined".to_string(),
            decision_source: "user_decision".to_string(),
            retryable: false,
            badge_color: "#94a3b8".to_string(),
            explanation: "The user explicitly clicked 'Decline' on the security confirmation dialog.".to_string(),
        },
    ]
}
// ============================================================================
// [END_DEMO_STUB: ZoDecisionMachineStates]
// ============================================================================

// ============================================================================
// [DEMO_STUB: GuardianShieldStatusDemo]
// DESCRIPTION: Mock status for CUALockScreenGuardian Shield and physical input watchdog.
// BACKEND_ROUTE: GET /api/guardian/status -> superagent_core_v2::guardian
// SEARCH_TAG: #DEMO_GUARDIAN_SHIELD_STATUS
// ============================================================================

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Default)]
#[serde(rename_all = "camelCase")]
pub struct GuardianShieldStatus {
    pub is_workstation_locked: bool,
    pub is_screensaver_active: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub active_lock_event_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub last_locked_timestamp: Option<String>,
    pub input_freeze_active: bool,
    pub intercepted_input_count: u32,
    pub os_platform: String,
    pub hardware_watchdog_state: String, // "healthy", "degraded", "disabled"
}

pub fn get_demo_guardian_shield_locked() -> GuardianShieldStatus {
    GuardianShieldStatus {
        is_workstation_locked: true,
        is_screensaver_active: false,
        active_lock_event_id: Some("LOGIND_SESSION_LOCK_0x7_20261014T142204".to_string()),
        last_locked_timestamp: Some("2026-10-14T14:22:04.120Z".to_string()),
        input_freeze_active: true,
        intercepted_input_count: 14,
        os_platform: "linux".to_string(),
        hardware_watchdog_state: "healthy".to_string(),
    }
}

pub fn get_demo_guardian_shield_armed() -> GuardianShieldStatus {
    GuardianShieldStatus {
        is_workstation_locked: false,
        is_screensaver_active: false,
        active_lock_event_id: None,
        last_locked_timestamp: None,
        input_freeze_active: false,
        intercepted_input_count: 0,
        os_platform: "linux".to_string(),
        hardware_watchdog_state: "healthy".to_string(),
    }
}
// ============================================================================
// [END_DEMO_STUB: GuardianShieldStatusDemo]
// ============================================================================

// ============================================================================
// [DEMO_STUB: ReplSessionState]
// DESCRIPTION: Mock session state for the In-Process REPL Console.
// BACKEND_ROUTE: WS /ws -> superagent_core_v2::protocol::events::ReplSessionEvent
// SEARCH_TAG: #DEMO_REPL_SESSION_STATE
// ============================================================================

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Default)]
#[serde(rename_all = "camelCase")]
pub struct ReplSessionState {
    pub session_id: String,
    pub runtime_version: String,
    pub node_version: String,
    pub v8_heap_used_mb: f32,
    pub v8_heap_total_mb: f32,
    pub output_tokens_used: u32,
    pub output_token_capacity: u32,
    pub is_executing: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub execution_start_time_ms: Option<i64>,
    pub last_execution_duration_ms: u32,
    pub enabled_surfaces: Vec<String>,
    pub connected_surfaces_count: usize,
}

pub fn get_demo_repl_session() -> ReplSessionState {
    ReplSessionState {
        session_id: "repl-session-20261014-0982".to_string(),
        runtime_version: "superagent-cua-repl-v2.4".to_string(),
        node_version: "v20.12.0".to_string(),
        v8_heap_used_mb: 44.2,
        v8_heap_total_mb: 68.0,
        output_tokens_used: 14280,
        output_token_capacity: 25000,
        is_executing: false,
        execution_start_time_ms: None,
        last_execution_duration_ms: 1428,
        enabled_surfaces: vec!["computer".to_string(), "browser".to_string()],
        connected_surfaces_count: 2,
    }
}
// ============================================================================
// [END_DEMO_STUB: ReplSessionState]
// ============================================================================

// ============================================================================
// [DEMO_STUB: ReplVariableTreeDemo]
// DESCRIPTION: Mock live variable tree for the REPL Scope Inspector.
// BACKEND_ROUTE: GET /api/repl/variables -> superagent_core_v2::repl::inspect
// SEARCH_TAG: #DEMO_REPL_VARIABLE_TREE
// ============================================================================

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Default)]
#[serde(rename_all = "camelCase")]
pub struct VariableNode {
    pub name: String,
    #[serde(rename = "type")]
    pub var_type: String, // "string", "number", "boolean", "object", "array", "function"
    pub value_preview: String,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub children: Vec<VariableNode>,
    pub is_expandable: bool,
}

pub fn get_demo_repl_variable_tree() -> Vec<VariableNode> {
    vec![
        VariableNode {
            name: "targetWindow".to_string(),
            var_type: "object".to_string(),
            value_preview: "WindowInfo { id: 2048, app: 'Google Chrome' }".to_string(),
            is_expandable: true,
            children: vec![
                VariableNode {
                    name: "id".to_string(),
                    var_type: "number".to_string(),
                    value_preview: "2048".to_string(),
                    children: vec![],
                    is_expandable: false,
                },
                VariableNode {
                    name: "app".to_string(),
                    var_type: "string".to_string(),
                    value_preview: "'Google Chrome'".to_string(),
                    children: vec![],
                    is_expandable: false,
                },
                VariableNode {
                    name: "title".to_string(),
                    var_type: "string".to_string(),
                    value_preview: "'GitHub - Dashboard'".to_string(),
                    children: vec![],
                    is_expandable: false,
                },
                VariableNode {
                    name: "bounds".to_string(),
                    var_type: "array".to_string(),
                    value_preview: "[100, 80, 1440, 900]".to_string(),
                    children: vec![],
                    is_expandable: false,
                },
                VariableNode {
                    name: "isOccluded".to_string(),
                    var_type: "boolean".to_string(),
                    value_preview: "false".to_string(),
                    children: vec![],
                    is_expandable: false,
                },
            ],
        },
        VariableNode {
            name: "activeTabs".to_string(),
            var_type: "array".to_string(),
            value_preview: "Array(2) [Tab, Tab]".to_string(),
            is_expandable: true,
            children: vec![VariableNode {
                name: "0".to_string(),
                var_type: "object".to_string(),
                value_preview: "Tab { id: 'tab-8801', url: 'https://github.com' }".to_string(),
                is_expandable: true,
                children: vec![
                    VariableNode {
                        name: "id".to_string(),
                        var_type: "string".to_string(),
                        value_preview: "'tab-8801'".to_string(),
                        children: vec![],
                        is_expandable: false,
                    },
                    VariableNode {
                        name: "url".to_string(),
                        var_type: "string".to_string(),
                        value_preview: "'https://github.com/pulls'".to_string(),
                        children: vec![],
                        is_expandable: false,
                    },
                    VariableNode {
                        name: "title".to_string(),
                        var_type: "string".to_string(),
                        value_preview: "'Pull Requests · SuperAgent'".to_string(),
                        children: vec![],
                        is_expandable: false,
                    },
                    VariableNode {
                        name: "isLeased".to_string(),
                        var_type: "boolean".to_string(),
                        value_preview: "true".to_string(),
                        children: vec![],
                        is_expandable: false,
                    },
                ],
            }],
        },
        VariableNode {
            name: "cua".to_string(),
            var_type: "object".to_string(),
            value_preview: "ComputerUseAPI { target: 'linux' }".to_string(),
            is_expandable: true,
            children: vec![
                VariableNode {
                    name: "target".to_string(),
                    var_type: "string".to_string(),
                    value_preview: "'linux'".to_string(),
                    children: vec![],
                    is_expandable: false,
                },
                VariableNode {
                    name: "getState".to_string(),
                    var_type: "function".to_string(),
                    value_preview: "[AsyncFunction: getState]".to_string(),
                    children: vec![],
                    is_expandable: false,
                },
                VariableNode {
                    name: "listWindows".to_string(),
                    var_type: "function".to_string(),
                    value_preview: "[AsyncFunction: listWindows]".to_string(),
                    children: vec![],
                    is_expandable: false,
                },
            ],
        },
    ]
}
// ============================================================================
// [END_DEMO_STUB: ReplVariableTreeDemo]
// ============================================================================

// ============================================================================
// [DEMO_STUB: ReplSnippetTemplates]
// DESCRIPTION: Quick-insert script snippets for the REPL Toolbar.
// BACKEND_ROUTE: GET /api/repl/snippets -> superagent_core_v2::repl::snippets
// SEARCH_TAG: #DEMO_REPL_SNIPPETS
// ============================================================================

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Default)]
#[serde(rename_all = "camelCase")]
pub struct ScriptSnippet {
    pub id: String,
    pub name: String,
    pub category: String, // "Computer Use", "Browser", "Diagnostics"
    pub description: String,
    pub code_template: String,
}

pub fn get_demo_repl_snippets() -> Vec<ScriptSnippet> {
    vec![
        ScriptSnippet {
            id: "snip-cua-ax-diff".to_string(),
            name: "Observe Fresh AX State".to_string(),
            category: "Computer Use".to_string(),
            description: "Fetches accessibility tree diff for active window.".to_string(),
            code_template: "// Inspect current accessibility tree state\nconst app = await cua.getApp({ windowId: targetWindow.id });\nconst axState = await app.getAXState({ disableDiffing: false });\nconsole.log(axState);".to_string(),
        },
        ScriptSnippet {
            id: "snip-browser-claim-fill".to_string(),
            name: "Claim Tab & Fill Locator".to_string(),
            category: "Browser".to_string(),
            description: "Claims an existing browser tab and fills input locator.".to_string(),
            code_template: "// Claim tab and perform locator input\nconst tab = await cua.getTab({ mention: 'tab-v1' });\nconst input = tab.playwright.locator('input[name=\"search\"]');\nawait input.fill('SuperAgent Next-Gen UI');\nawait tab.pressKey(null, 'Enter');".to_string(),
        },
        ScriptSnippet {
            id: "snip-diag-reset".to_string(),
            name: "Diagnostic Session Reset".to_string(),
            category: "Diagnostics".to_string(),
            description: "Resets V8 variable environment without closing apps.".to_string(),
            code_template: "// Clear persistent JS bindings\nawait nodeRepl.rpc('js_reset', {});\nconsole.log('Session bindings cleared successfully.');".to_string(),
        },
    ]
}
// ============================================================================
// [END_DEMO_STUB: ReplSnippetTemplates]
// ============================================================================

// ============================================================================
// [DEMO_STUB: SettingsStoreConfigurationDemo]
// DESCRIPTION: 24-Module settings store configuration payload.
// BACKEND_ROUTE: GET /api/settings -> superagent_core_v2::storage::settings_store
// SEARCH_TAG: #DEMO_SETTINGS_STORE
// ============================================================================

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Default)]
#[serde(rename_all = "camelCase")]
pub struct SettingsModuleInfo {
    pub id: String,
    pub number: u8,
    pub title: String,
    pub category: String,
    pub icon_name: String,
    pub description: String,
}

pub fn get_24_settings_modules() -> Vec<SettingsModuleInfo> {
    vec![
        SettingsModuleInfo {
            id: "general".to_string(),
            number: 1,
            title: "General Settings".to_string(),
            category: "Core".to_string(),
            icon_name: "preferences-system-symbolic".to_string(),
            description: "App theme, startup behavior, and default agent parameters.".to_string(),
        },
        SettingsModuleInfo {
            id: "providers".to_string(),
            number: 2,
            title: "Provider Registry".to_string(),
            category: "Intelligence".to_string(),
            icon_name: "network-server-symbolic".to_string(),
            description:
                "API keys and model routing for Anthropic, OpenAI, Gemini, Groq, DeepSeek."
                    .to_string(),
        },
        SettingsModuleInfo {
            id: "local_models".to_string(),
            number: 3,
            title: "Local Models".to_string(),
            category: "Intelligence".to_string(),
            icon_name: "computer-symbolic".to_string(),
            description: "Ollama, LM Studio, and vLLM local engine orchestration.".to_string(),
        },
        SettingsModuleInfo {
            id: "local_image_models".to_string(),
            number: 4,
            title: "Local Image Models".to_string(),
            category: "Creative".to_string(),
            icon_name: "image-x-generic-symbolic".to_string(),
            description: "ComfyUI, Stable Diffusion WebUI, and local LoRA checkpoints.".to_string(),
        },
        SettingsModuleInfo {
            id: "local_video_models".to_string(),
            number: 5,
            title: "Local Video Models".to_string(),
            category: "Creative".to_string(),
            icon_name: "video-x-generic-symbolic".to_string(),
            description: "Wan2.1, HunyuanVideo, and TeaCache video generation pipelines."
                .to_string(),
        },
        SettingsModuleInfo {
            id: "mcp".to_string(),
            number: 6,
            title: "MCP Server Catalog".to_string(),
            category: "Extensibility".to_string(),
            icon_name: "system-run-symbolic".to_string(),
            description: "Model Context Protocol tools, stdio & SSE servers.".to_string(),
        },
        SettingsModuleInfo {
            id: "usage".to_string(),
            number: 7,
            title: "Usage & Cost Tracker".to_string(),
            category: "Governance".to_string(),
            icon_name: "view-financial-symbolic".to_string(),
            description: "Token accounting, provider spend caps, and budget alerts.".to_string(),
        },
        SettingsModuleInfo {
            id: "memory".to_string(),
            number: 8,
            title: "Memory & Context Engine".to_string(),
            category: "Intelligence".to_string(),
            icon_name: "document-properties-symbolic".to_string(),
            description: "Global memory, profile cards, and context window compaction.".to_string(),
        },
        SettingsModuleInfo {
            id: "voice".to_string(),
            number: 9,
            title: "Voice & Speech Studio".to_string(),
            category: "Input".to_string(),
            icon_name: "audio-input-microphone-symbolic".to_string(),
            description: "Whisper local transcription and TTS voice synthesis.".to_string(),
        },
        SettingsModuleInfo {
            id: "telegram".to_string(),
            number: 10,
            title: "Telegram Bot Bridge".to_string(),
            category: "Integrations".to_string(),
            icon_name: "mail-send-symbolic".to_string(),
            description: "Remote agent dispatching, two-way notifications, and media delivery."
                .to_string(),
        },
        SettingsModuleInfo {
            id: "computer_use".to_string(),
            number: 11,
            title: "Computer Use Automation".to_string(),
            category: "Automation".to_string(),
            icon_name: "input-mouse-symbolic".to_string(),
            description: "Screen capture backend, DPI unscaling, and humanized mouse emulation."
                .to_string(),
        },
        SettingsModuleInfo {
            id: "browser_leasing".to_string(),
            number: 12,
            title: "Browser Leasing & CDP".to_string(),
            category: "Automation".to_string(),
            icon_name: "web-browser-symbolic".to_string(),
            description: "CDP connection, tab claim policy, and in-page WebMCP injection."
                .to_string(),
        },
        SettingsModuleInfo {
            id: "security_guardian".to_string(),
            number: 13,
            title: "Security Guardian".to_string(),
            category: "Governance".to_string(),
            icon_name: "security-high-symbolic".to_string(),
            description: "4-Tier confirmation thresholds, LockScreen watchdog, and safe origins."
                .to_string(),
        },
        SettingsModuleInfo {
            id: "companion".to_string(),
            number: 14,
            title: "3D Companion & VRM".to_string(),
            category: "Companion".to_string(),
            icon_name: "avatar-default-symbolic".to_string(),
            description: "VRM model selection, spring bone physics, and lip-sync tuning."
                .to_string(),
        },
        SettingsModuleInfo {
            id: "web_hosting".to_string(),
            number: 15,
            title: "Web App Hosting & LAN".to_string(),
            category: "Network".to_string(),
            icon_name: "network-wireless-symbolic".to_string(),
            description: "Embedded Axum daemon, LAN binding, scrypt auth, and session tokens."
                .to_string(),
        },
        SettingsModuleInfo {
            id: "three_d_studio".to_string(),
            number: 16,
            title: "3D Studio Graphics".to_string(),
            category: "Creative".to_string(),
            icon_name: "media-view-subtitles-symbolic".to_string(),
            description: "Rendering shaders, shadow map resolution, and glTF / GLB exports."
                .to_string(),
        },
        SettingsModuleInfo {
            id: "ecad".to_string(),
            number: 17,
            title: "Hardware ECAD Settings".to_string(),
            category: "Hardware".to_string(),
            icon_name: "circuit-symbolic".to_string(),
            description: "KiCad CLI integration, copper layer stackups, and DRC rules.".to_string(),
        },
        SettingsModuleInfo {
            id: "artifacts".to_string(),
            number: 18,
            title: "Artifacts Sandboxing".to_string(),
            category: "Extensibility".to_string(),
            icon_name: "package-x-generic-symbolic".to_string(),
            description: "Micro-app port allocations, process isolation, and live reload."
                .to_string(),
        },
        SettingsModuleInfo {
            id: "storage".to_string(),
            number: 19,
            title: "Storage & Data Management".to_string(),
            category: "Core".to_string(),
            icon_name: "drive-harddisk-symbolic".to_string(),
            description: "Workspace paths, chat history persistence, and disk cleanup.".to_string(),
        },
        SettingsModuleInfo {
            id: "updates".to_string(),
            number: 20,
            title: "Software Updates".to_string(),
            category: "Core".to_string(),
            icon_name: "software-update-available-symbolic".to_string(),
            description: "Release channels, auto-check frequency, and delta updates.".to_string(),
        },
        SettingsModuleInfo {
            id: "doctor".to_string(),
            number: 21,
            title: "System Doctor Diagnostics".to_string(),
            category: "Diagnostics".to_string(),
            icon_name: "dialog-information-symbolic".to_string(),
            description: "System health check, port accessibility, toolchain verification."
                .to_string(),
        },
        SettingsModuleInfo {
            id: "notifications".to_string(),
            number: 22,
            title: "Notification Rules".to_string(),
            category: "Governance".to_string(),
            icon_name: "user-available-symbolic".to_string(),
            description: "Desktop toast notifications, sound alerts, and quiet hours.".to_string(),
        },
        SettingsModuleInfo {
            id: "telemetry".to_string(),
            number: 23,
            title: "Telemetry & Privacy".to_string(),
            category: "Governance".to_string(),
            icon_name: "channel-secure-symbolic".to_string(),
            description: "Strict local mode, PII prompt scrubbing, and audit log retention."
                .to_string(),
        },
        SettingsModuleInfo {
            id: "shortcuts".to_string(),
            number: 24,
            title: "Keybinding & Shortcuts".to_string(),
            category: "Input".to_string(),
            icon_name: "input-keyboard-symbolic".to_string(),
            description: "Global hotkeys for Circle Search, voice dictation, and quick launcher."
                .to_string(),
        },
    ]
}
// ============================================================================
// [END_DEMO_STUB: SettingsStoreConfigurationDemo]
// ============================================================================

// ============================================================================
// [DEMO_STUB: SystemDoctorReadinessReportDemo]
// DESCRIPTION: Mock diagnostic payload generated by System Doctor probes.
// BACKEND_ROUTE: GET /api/doctor/diagnostics -> superagent_core_v2::server::routes::doctor
// SEARCH_TAG: #DEMO_SYSTEM_DOCTOR_REPORT
// ============================================================================

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Default)]
#[serde(rename_all = "camelCase")]
pub struct SystemDoctorProbeResult {
    pub id: String,
    pub name: String,
    pub category: String, // "system", "runtime", "hardware", "network", "storage"
    pub status: String,   // "pass", "warn", "fail"
    pub detected_value: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub remediation_action: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub remediation_command: Option<String>,
    pub latency_ms: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Default)]
#[serde(rename_all = "camelCase")]
pub struct SystemDoctorReport {
    pub timestamp: String,
    pub overall_status: String, // "ready", "degraded", "critical"
    pub probes: Vec<SystemDoctorProbeResult>,
    pub logs: Vec<String>,
}

pub fn get_demo_system_doctor_report() -> SystemDoctorReport {
    SystemDoctorReport {
        timestamp: "2026-10-14T14:22:01.482Z".to_string(),
        overall_status: "ready".to_string(),
        probes: vec![
            SystemDoctorProbeResult {
                id: "probe-core-daemon".to_string(),
                name: "Core v2 Daemon Connectivity".to_string(),
                category: "runtime".to_string(),
                status: "pass".to_string(),
                detected_value: "Connected (port 1469, 1.2ms latency)".to_string(),
                remediation_action: None,
                remediation_command: None,
                latency_ms: 1,
            },
            SystemDoctorProbeResult {
                id: "probe-gpu-vram".to_string(),
                name: "GPU & Direct Rendering Infrastructure".to_string(),
                category: "hardware".to_string(),
                status: "pass".to_string(),
                detected_value: "Vulkan 1.3 / DRM Render Node (/dev/dri/renderD128)".to_string(),
                remediation_action: None,
                remediation_command: None,
                latency_ms: 8,
            },
            SystemDoctorProbeResult {
                id: "probe-screen-capture".to_string(),
                name: "Desktop Window Capture Subsystem".to_string(),
                category: "system".to_string(),
                status: "pass".to_string(),
                detected_value: "PipeWire / X11 SHM Compositor Available".to_string(),
                remediation_action: None,
                remediation_command: None,
                latency_ms: 4,
            },
            SystemDoctorProbeResult {
                id: "probe-browser-cdp".to_string(),
                name: "Browser Chrome DevTools Protocol Gateway".to_string(),
                category: "network".to_string(),
                status: "warn".to_string(),
                detected_value: "Port 9222 listening, 2 tabs available (in-page WebMCP enabled)"
                    .to_string(),
                remediation_action: Some(
                    "Launch browser with --remote-debugging-port=9222 if tabs not detected"
                        .to_string(),
                ),
                remediation_command: Some("google-chrome --remote-debugging-port=9222".to_string()),
                latency_ms: 15,
            },
            SystemDoctorProbeResult {
                id: "probe-kicad-cli".to_string(),
                name: "KiCad ECAD CLI Binary".to_string(),
                category: "runtime".to_string(),
                status: "pass".to_string(),
                detected_value: "kicad-cli v8.0.4 at /usr/bin/kicad-cli".to_string(),
                remediation_action: None,
                remediation_command: None,
                latency_ms: 2,
            },
            SystemDoctorProbeResult {
                id: "probe-storage-permissions".to_string(),
                name: "Workspace Storage Write Permissions".to_string(),
                category: "storage".to_string(),
                status: "pass".to_string(),
                detected_value: "Read/Write OK (~/.superagent/workspaces)".to_string(),
                remediation_action: None,
                remediation_command: None,
                latency_ms: 1,
            },
        ],
        logs: vec![
            "[Doctor] Initialized 6 system readiness probes".to_string(),
            "[Doctor] Verified daemon connectivity on ws://127.0.0.1:1469/ws".to_string(),
            "[Doctor] Checked PipeWire portal session: active".to_string(),
            "[Doctor] System readiness evaluation: READY".to_string(),
        ],
    }
}
// ============================================================================
// [END_DEMO_STUB: SystemDoctorReadinessReportDemo]
// ============================================================================

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_computer_use_windows_demo_data() {
        let windows = get_demo_computer_use_windows();
        assert_eq!(windows.len(), 4);
        assert_eq!(windows[0].app, "com.microsoft.VSCode");
        assert!(windows[0].is_focused);

        let json = serde_json::to_string(&windows).expect("Serialization failed");
        let parsed: Vec<DesktopWindowItem> =
            serde_json::from_str(&json).expect("Deserialization failed");
        assert_eq!(parsed, windows);
    }

    #[test]
    fn test_accessibility_tree_demo_data() {
        let tree = get_demo_accessibility_tree();
        assert_eq!(tree.element_index, 0);
        assert_eq!(tree.children.len(), 2);

        let json = serde_json::to_string(&tree).expect("Serialization failed");
        let parsed: AccessibilityNode =
            serde_json::from_str(&json).expect("Deserialization failed");
        assert_eq!(parsed.children.len(), 2);
        assert_eq!(parsed.children[0].role, "TitleBar");
    }

    #[test]
    fn test_browser_tab_lease_demo_data() {
        let leases = get_demo_browser_tab_leases();
        assert_eq!(leases.len(), 3);
        assert!(leases[0].is_claimed);
        assert_eq!(leases[0].mention_key, "@tab-cart");

        let json = serde_json::to_string(&leases).expect("Serialization failed");
        let parsed: Vec<BrowserTabLease> =
            serde_json::from_str(&json).expect("Deserialization failed");
        assert_eq!(parsed, leases);
    }

    #[test]
    fn test_webmcp_tools_registry_demo_data() {
        let tools = get_demo_webmcp_tools_registry();
        assert_eq!(tools.len(), 2);
        assert_eq!(tools[0].name, "fill_checkout_form");

        let json = serde_json::to_string(&tools).expect("Serialization failed");
        let parsed: Vec<WebMcpToolDefinition> =
            serde_json::from_str(&json).expect("Deserialization failed");
        assert_eq!(parsed, tools);
    }

    #[test]
    fn test_security_confirmations_and_zo_states() {
        let confs = get_demo_security_confirmations();
        assert_eq!(confs.len(), 2);
        assert_eq!(confs[0].tier_mode, "mode2_always_confirm");

        let json_conf = serde_json::to_string(&confs).expect("Serialization failed");
        let parsed_confs: Vec<SecurityConfirmationRequest> =
            serde_json::from_str(&json_conf).unwrap();
        assert_eq!(parsed_confs, confs);

        let zo_states = get_demo_zo_states();
        assert_eq!(zo_states.len(), 16);
        assert_eq!(zo_states[0].state_key, "approval_cancelled");

        let shield_locked = get_demo_guardian_shield_locked();
        assert!(shield_locked.is_workstation_locked);
        assert!(shield_locked.input_freeze_active);
    }

    #[test]
    fn test_repl_session_and_variable_tree() {
        let repl = get_demo_repl_session();
        assert_eq!(repl.runtime_version, "superagent-cua-repl-v2.4");

        let vars = get_demo_repl_variable_tree();
        assert_eq!(vars.len(), 3);

        let snippets = get_demo_repl_snippets();
        assert_eq!(snippets.len(), 3);
    }

    #[test]
    fn test_24_settings_modules_and_doctor_report() {
        let modules = get_24_settings_modules();
        assert_eq!(modules.len(), 24);
        assert_eq!(modules[0].number, 1);
        assert_eq!(modules[23].number, 24);

        let report = get_demo_system_doctor_report();
        assert_eq!(report.overall_status, "ready");
        assert_eq!(report.probes.len(), 6);
    }
}
