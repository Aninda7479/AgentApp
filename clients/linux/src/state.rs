//! Reactive application state for the Linux Native client.
//!
//! Manages active sessions, chat histories, streaming token and thought buffers,
//! workspace navigation across all 10 workspaces, Computer Use, Browser Leasing,
//! Security Guardian, In-Process REPL Console, and 24-Module Settings & Diagnostics.

use serde::{Deserialize, Serialize};
use std::collections::HashMap;

use superagent_core_v2::protocol::events::{AgentStreamEvent, SessionSyncPayload};

use crate::client::daemon_client::ConnectionStatus;
use crate::demo_data::{
    self, AccessibilityNode, BrowserTabLease, CaptureFrameMetadata, CdpStreamEvent,
    DesktopWindowItem, GuardianShieldStatus, ReplSessionState, ScriptSnippet,
    SecurityConfirmationRequest, SettingsModuleInfo, SystemDoctorReport, VariableNode,
    WebMcpToolDefinition, ZoStateBadge,
};

/// 10 Dedicated Workspaces in the Linux Client Shell.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize, Default)]
#[serde(rename_all = "snake_case")]
pub enum WorkspaceNav {
    #[default]
    Chat,
    ComputerUse,
    BrowserLeasing,
    SecurityGuardian,
    Repl,
    Companion,
    Creative,
    Hardware,
    Tasks,
    Settings,
}

impl WorkspaceNav {
    pub fn title(&self) -> &'static str {
        match self {
            Self::Chat => "Agent Chat",
            Self::ComputerUse => "Computer Use",
            Self::BrowserLeasing => "Browser Leasing",
            Self::SecurityGuardian => "Security Guardian",
            Self::Repl => "REPL Console",
            Self::Companion => "3D Companion",
            Self::Creative => "Creative Studio",
            Self::Hardware => "Hardware ECAD",
            Self::Tasks => "Tasks & Routines",
            Self::Settings => "Settings & System Doctor",
        }
    }

    pub fn icon_name(&self) -> &'static str {
        match self {
            Self::Chat => "user-available-symbolic",
            Self::ComputerUse => "input-mouse-symbolic",
            Self::BrowserLeasing => "web-browser-symbolic",
            Self::SecurityGuardian => "security-high-symbolic",
            Self::Repl => "utilities-terminal-symbolic",
            Self::Companion => "avatar-default-symbolic",
            Self::Creative => "image-x-generic-symbolic",
            Self::Hardware => "circuit-symbolic",
            Self::Tasks => "view-list-bullet-symbolic",
            Self::Settings => "preferences-system-symbolic",
        }
    }

    pub fn all() -> &'static [WorkspaceNav] {
        &[
            Self::Chat,
            Self::ComputerUse,
            Self::BrowserLeasing,
            Self::SecurityGuardian,
            Self::Repl,
            Self::Companion,
            Self::Creative,
            Self::Hardware,
            Self::Tasks,
            Self::Settings,
        ]
    }
}

/// Individual chat message model.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct ChatMessage {
    pub id: String,
    pub role: String, // "user", "assistant", "thought", "system"
    pub content: String,
    pub session_id: String,
    pub timestamp: i64,
    pub is_streaming: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tool_call: Option<serde_json::Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tool_result: Option<serde_json::Value>,
}

impl ChatMessage {
    pub fn user(session_id: impl Into<String>, content: impl Into<String>) -> Self {
        Self {
            id: format!("usr-{}", chrono::Utc::now().timestamp_millis()),
            role: "user".to_string(),
            content: content.into(),
            session_id: session_id.into(),
            timestamp: chrono::Utc::now().timestamp_millis(),
            is_streaming: false,
            tool_call: None,
            tool_result: None,
        }
    }

    pub fn assistant(
        session_id: impl Into<String>,
        content: impl Into<String>,
        is_streaming: bool,
    ) -> Self {
        Self {
            id: format!("asst-{}", chrono::Utc::now().timestamp_millis()),
            role: "assistant".to_string(),
            content: content.into(),
            session_id: session_id.into(),
            timestamp: chrono::Utc::now().timestamp_millis(),
            is_streaming,
            tool_call: None,
            tool_result: None,
        }
    }

    pub fn thought(session_id: impl Into<String>, content: impl Into<String>) -> Self {
        Self {
            id: format!("tht-{}", chrono::Utc::now().timestamp_millis()),
            role: "thought".to_string(),
            content: content.into(),
            session_id: session_id.into(),
            timestamp: chrono::Utc::now().timestamp_millis(),
            is_streaming: false,
            tool_call: None,
            tool_result: None,
        }
    }
}

/// Navigation session metadata item.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct SessionItem {
    pub id: String,
    pub title: String,
    pub updated_at: i64,
    pub is_active: bool,
}

/// Reactive application state.
#[derive(Debug, Clone)]
pub struct AppState {
    pub current_workspace: WorkspaceNav,
    pub sessions: Vec<SessionItem>,
    pub active_session_id: Option<String>,
    pub messages: HashMap<String, Vec<ChatMessage>>,
    pub streaming_thought_buffer: String,
    pub streaming_token_buffer: String,
    pub connection_status: ConnectionStatus,
    pub is_generating: bool,
    pub use_demo_data: bool,

    // ─── Computer Use State ──────────────────────────────────────────────────
    pub windows: Vec<DesktopWindowItem>,
    pub selected_window_id: Option<u64>,
    pub ax_tree: Option<AccessibilityNode>,
    pub capture_metadata: Option<CaptureFrameMetadata>,
    pub settle_indicator: String,

    // ─── Browser Leasing State ───────────────────────────────────────────────
    pub tab_leases: Vec<BrowserTabLease>,
    pub selected_tab_id: Option<String>,
    pub webmcp_tools: Vec<WebMcpToolDefinition>,
    pub cdp_events: Vec<CdpStreamEvent>,

    // ─── Security Guardian State ─────────────────────────────────────────────
    pub security_confirmations: Vec<SecurityConfirmationRequest>,
    pub zo_states: Vec<ZoStateBadge>,
    pub guardian_shield: GuardianShieldStatus,

    // ─── REPL Console State ──────────────────────────────────────────────────
    pub repl_session: ReplSessionState,
    pub repl_variables: Vec<VariableNode>,
    pub repl_snippets: Vec<ScriptSnippet>,
    pub repl_output_buffer: Vec<String>,
    pub repl_eval_input: String,

    // ─── Settings & Diagnostics State ────────────────────────────────────────
    pub settings_modules: Vec<SettingsModuleInfo>,
    pub active_settings_module_id: String,
    pub doctor_report: Option<SystemDoctorReport>,
}

impl Default for AppState {
    fn default() -> Self {
        let mut state = Self {
            current_workspace: WorkspaceNav::Chat,
            sessions: Vec::new(),
            active_session_id: None,
            messages: HashMap::new(),
            streaming_thought_buffer: String::new(),
            streaming_token_buffer: String::new(),
            connection_status: ConnectionStatus::Disconnected,
            is_generating: false,
            use_demo_data: true,

            windows: Vec::new(),
            selected_window_id: None,
            ax_tree: None,
            capture_metadata: None,
            settle_indicator: "Settled (240ms)".to_string(),

            tab_leases: Vec::new(),
            selected_tab_id: None,
            webmcp_tools: Vec::new(),
            cdp_events: Vec::new(),

            security_confirmations: Vec::new(),
            zo_states: Vec::new(),
            guardian_shield: GuardianShieldStatus::default(),

            repl_session: ReplSessionState::default(),
            repl_variables: Vec::new(),
            repl_snippets: Vec::new(),
            repl_output_buffer: Vec::new(),
            repl_eval_input: String::new(),

            settings_modules: Vec::new(),
            active_settings_module_id: "general".to_string(),
            doctor_report: None,
        };
        state.load_demo_data();
        state
    }
}

impl AppState {
    pub fn new() -> Self {
        Self::default()
    }

    /// Loads comprehensive demo datasets into all workspace views.
    pub fn load_demo_data(&mut self) {
        self.windows = demo_data::get_demo_computer_use_windows();
        if let Some(first) = self.windows.first() {
            self.selected_window_id = Some(first.id);
        }
        self.ax_tree = Some(demo_data::get_demo_accessibility_tree());
        self.capture_metadata = Some(demo_data::get_demo_occluded_capture());
        self.settle_indicator = "Settled (240ms)".to_string();

        self.tab_leases = demo_data::get_demo_browser_tab_leases();
        if let Some(first) = self.tab_leases.first() {
            self.selected_tab_id = Some(first.id.clone());
        }
        self.webmcp_tools = demo_data::get_demo_webmcp_tools_registry();
        self.cdp_events = demo_data::get_demo_cdp_stream_logs();

        self.security_confirmations = demo_data::get_demo_security_confirmations();
        self.zo_states = demo_data::get_demo_zo_states();
        self.guardian_shield = demo_data::get_demo_guardian_shield_armed();

        self.repl_session = demo_data::get_demo_repl_session();
        self.repl_variables = demo_data::get_demo_repl_variable_tree();
        self.repl_snippets = demo_data::get_demo_repl_snippets();
        self.repl_output_buffer = vec![
            "SuperAgent In-Process REPL Console [v2.4 Node.js v20.12.0]".to_string(),
            "Type 'help' or load a snippet from the snippets menu.".to_string(),
            "> const app = await cua.getApp({ windowId: 1042 });".to_string(),
            "=> WindowInfo { id: 1042, app: 'com.microsoft.VSCode' }".to_string(),
        ];

        self.settings_modules = demo_data::get_24_settings_modules();
        self.active_settings_module_id = "general".to_string();
        self.doctor_report = Some(demo_data::get_demo_system_doctor_report());
    }

    /// Switches the active primary workspace.
    pub fn switch_workspace(&mut self, ws: WorkspaceNav) {
        self.current_workspace = ws;
    }

    /// Selects a window in Computer Use inspector.
    pub fn select_window(&mut self, window_id: u64) {
        self.selected_window_id = Some(window_id);
    }

    /// Selects a browser tab in Browser Leasing.
    pub fn select_tab(&mut self, tab_id: &str) {
        self.selected_tab_id = Some(tab_id.to_string());
    }

    /// Resolves a security confirmation dialog by ID.
    pub fn resolve_security_confirmation(&mut self, id: &str, approved: bool) {
        if let Some(pos) = self.security_confirmations.iter().position(|r| r.id == id) {
            let removed = self.security_confirmations.remove(pos);
            let result_str = if approved { "Approved" } else { "Declined" };
            self.repl_output_buffer.push(format!(
                "[Security Guardian] Confirmation '{}' ({}): {}",
                removed.title, removed.tier_mode, result_str
            ));
        }
    }

    /// Evaluates a JavaScript snippet in the in-process REPL.
    pub fn run_repl_eval(&mut self, code: &str) {
        let trimmed = code.trim();
        if trimmed.is_empty() {
            return;
        }

        self.repl_output_buffer.push(format!("> {}", trimmed));
        if trimmed == "help" {
            self.repl_output_buffer.push(
                "Available Globals: cua (Computer Use API), tab (Active Browser Tab), sky (WGC Frame Pool), nodeRepl"
                    .to_string(),
            );
        } else if trimmed.contains("cua.getApp") || trimmed.contains("listWindows") {
            self.repl_output_buffer.push(
                "=> [DesktopWindowItem { id: 1042, app: 'VSCode' }, DesktopWindowItem { id: 2088, app: 'Chrome' }]"
                    .to_string(),
            );
        } else if trimmed.contains("js_reset") {
            self.reset_repl_session();
        } else {
            self.repl_output_buffer
                .push("=> Execution finished (14ms): ok".to_string());
        }

        self.repl_session.output_tokens_used = (self.repl_session.output_tokens_used + 45)
            .min(self.repl_session.output_token_capacity);
    }

    /// Resets the REPL evaluation context.
    pub fn reset_repl_session(&mut self) {
        self.repl_variables.clear();
        self.repl_session.output_tokens_used = 0;
        self.repl_output_buffer
            .push("[REPL] Session bindings cleared. Clean V8 context initialized.".to_string());
    }

    /// Selects an active settings module out of the 24 available.
    pub fn select_settings_module(&mut self, module_id: &str) {
        self.active_settings_module_id = module_id.to_string();
    }

    /// Refreshes the System Doctor diagnostics report.
    pub fn run_doctor_diagnostics(&mut self) {
        self.doctor_report = Some(demo_data::get_demo_system_doctor_report());
    }

    // ─── Chat & Connection State Methods ─────────────────────────────────────

    pub fn set_connection_status(&mut self, status: ConnectionStatus) {
        self.connection_status = status;
    }

    pub fn add_session(&mut self, id: String, title: String) {
        let is_first = self.sessions.is_empty();
        let item = SessionItem {
            id: id.clone(),
            title,
            updated_at: chrono::Utc::now().timestamp_millis(),
            is_active: is_first,
        };
        self.sessions.push(item);
        if is_first {
            self.active_session_id = Some(id);
        }
    }

    pub fn set_active_session(&mut self, id: &str) {
        self.active_session_id = Some(id.to_string());
        for s in &mut self.sessions {
            s.is_active = s.id == id;
        }
        self.streaming_token_buffer.clear();
        self.streaming_thought_buffer.clear();
    }

    pub fn active_messages(&self) -> Vec<ChatMessage> {
        if let Some(active_id) = &self.active_session_id {
            self.messages.get(active_id).cloned().unwrap_or_default()
        } else {
            Vec::new()
        }
    }

    pub fn add_user_message(&mut self, session_id: &str, content: &str) {
        let msg = ChatMessage::user(session_id, content);
        self.messages
            .entry(session_id.to_string())
            .or_default()
            .push(msg);
        self.streaming_token_buffer.clear();
        self.streaming_thought_buffer.clear();
        self.is_generating = true;
    }

    pub fn append_streaming_token(&mut self, _session_id: &str, token: &str) {
        self.streaming_token_buffer.push_str(token);
    }

    pub fn append_streaming_thought(&mut self, _session_id: &str, thought: &str) {
        self.streaming_thought_buffer.push_str(thought);
    }

    pub fn commit_streaming_message(&mut self, session_id: &str) {
        if !self.streaming_thought_buffer.is_empty() {
            let thought_msg = ChatMessage::thought(
                session_id,
                std::mem::take(&mut self.streaming_thought_buffer),
            );
            self.messages
                .entry(session_id.to_string())
                .or_default()
                .push(thought_msg);
        }

        if !self.streaming_token_buffer.is_empty() {
            let asst_msg = ChatMessage::assistant(
                session_id,
                std::mem::take(&mut self.streaming_token_buffer),
                false,
            );
            self.messages
                .entry(session_id.to_string())
                .or_default()
                .push(asst_msg);
        }

        self.is_generating = false;
    }

    /// Applies a strongly-typed `AgentStreamEvent` to the reactive state.
    pub fn apply_stream_event(&mut self, event: &AgentStreamEvent) {
        let session_id = event.session_id().to_string();

        match event {
            AgentStreamEvent::StartTurn { .. } => {
                self.streaming_token_buffer.clear();
                self.streaming_thought_buffer.clear();
                self.is_generating = true;
            }
            AgentStreamEvent::Token { content, .. } => {
                self.append_streaming_token(&session_id, content);
            }
            AgentStreamEvent::Thought { content, .. } => {
                self.append_streaming_thought(&session_id, content);
            }
            AgentStreamEvent::ToolCall {
                tool_call_id,
                tool_name,
                tool_args,
                ..
            } => {
                let call_msg = ChatMessage {
                    id: format!("tool-{}", tool_call_id),
                    role: "system".to_string(),
                    content: format!("Tool call: {}({})", tool_name, tool_args),
                    session_id: session_id.clone(),
                    timestamp: chrono::Utc::now().timestamp_millis(),
                    is_streaming: false,
                    tool_call: Some(serde_json::json!({
                        "id": tool_call_id,
                        "name": tool_name,
                        "args": tool_args
                    })),
                    tool_result: None,
                };
                self.messages.entry(session_id).or_default().push(call_msg);
            }
            AgentStreamEvent::ToolResult {
                tool_call_id,
                tool_result,
                is_error,
                ..
            } => {
                let res_msg = ChatMessage {
                    id: format!("res-{}", tool_call_id),
                    role: "system".to_string(),
                    content: format!("Tool result: {}", tool_result),
                    session_id: session_id.clone(),
                    timestamp: chrono::Utc::now().timestamp_millis(),
                    is_streaming: false,
                    tool_call: None,
                    tool_result: Some(serde_json::json!({
                        "id": tool_call_id,
                        "result": tool_result,
                        "isError": is_error
                    })),
                };
                self.messages.entry(session_id).or_default().push(res_msg);
            }
            AgentStreamEvent::StepComplete { .. } => {}
            AgentStreamEvent::Done { .. } | AgentStreamEvent::Abort { .. } => {
                self.commit_streaming_message(&session_id);
            }
            AgentStreamEvent::Error { error, .. } => {
                self.commit_streaming_message(&session_id);
                let err_msg = ChatMessage {
                    id: format!("err-{}", chrono::Utc::now().timestamp_millis()),
                    role: "system".to_string(),
                    content: format!("Error: {}", error),
                    session_id: session_id.clone(),
                    timestamp: chrono::Utc::now().timestamp_millis(),
                    is_streaming: false,
                    tool_call: None,
                    tool_result: None,
                };
                self.messages.entry(session_id).or_default().push(err_msg);
            }
        }
    }

    /// Synchronizes active state with `SessionSyncPayload`.
    pub fn apply_session_sync(&mut self, sync: &SessionSyncPayload) {
        let session_id = &sync.session_id;
        self.is_generating = sync.is_running;

        if !sync.full_thought_text.is_empty() {
            self.streaming_thought_buffer = sync.full_thought_text.clone();
        }
        if !sync.full_assistant_text.is_empty() {
            self.streaming_token_buffer = sync.full_assistant_text.clone();
        }

        if !sync.is_running {
            self.commit_streaming_message(session_id);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_app_state_session_management() {
        let mut state = AppState::new();
        state.add_session("s1".to_string(), "First Chat".to_string());
        state.add_session("s2".to_string(), "Second Chat".to_string());

        assert_eq!(state.sessions.len(), 2);
        assert_eq!(state.active_session_id.as_deref(), Some("s1"));

        state.set_active_session("s2");
        assert_eq!(state.active_session_id.as_deref(), Some("s2"));
        assert!(!state.sessions[0].is_active);
        assert!(state.sessions[1].is_active);
    }

    #[test]
    fn test_app_state_workspace_transitions() {
        let mut state = AppState::new();
        assert_eq!(state.current_workspace, WorkspaceNav::Chat);

        state.switch_workspace(WorkspaceNav::ComputerUse);
        assert_eq!(state.current_workspace, WorkspaceNav::ComputerUse);
        assert_eq!(state.current_workspace.title(), "Computer Use");

        state.switch_workspace(WorkspaceNav::BrowserLeasing);
        assert_eq!(state.current_workspace, WorkspaceNav::BrowserLeasing);

        state.switch_workspace(WorkspaceNav::SecurityGuardian);
        assert_eq!(state.current_workspace, WorkspaceNav::SecurityGuardian);

        state.switch_workspace(WorkspaceNav::Repl);
        assert_eq!(state.current_workspace, WorkspaceNav::Repl);

        state.switch_workspace(WorkspaceNav::Settings);
        assert_eq!(state.current_workspace, WorkspaceNav::Settings);
    }

    #[test]
    fn test_app_state_demo_data_integration() {
        let state = AppState::new();
        assert!(state.use_demo_data);
        assert!(!state.windows.is_empty());
        assert!(state.selected_window_id.is_some());
        assert!(!state.tab_leases.is_empty());
        assert!(!state.webmcp_tools.is_empty());
        assert!(!state.security_confirmations.is_empty());
        assert_eq!(state.zo_states.len(), 16);
        assert_eq!(state.settings_modules.len(), 24);
        assert!(state.doctor_report.is_some());
    }

    #[test]
    fn test_app_state_repl_evaluation_and_reset() {
        let mut state = AppState::new();
        let initial_lines = state.repl_output_buffer.len();

        state.run_repl_eval("const x = 42;");
        assert_eq!(state.repl_output_buffer.len(), initial_lines + 2);

        state.reset_repl_session();
        assert!(state.repl_variables.is_empty());
        assert_eq!(state.repl_session.output_tokens_used, 0);
    }

    #[test]
    fn test_app_state_security_confirmation_resolution() {
        let mut state = AppState::new();
        let initial_count = state.security_confirmations.len();
        assert!(initial_count > 0);

        let target_id = state.security_confirmations[0].id.clone();
        state.resolve_security_confirmation(&target_id, true);
        assert_eq!(state.security_confirmations.len(), initial_count - 1);
    }

    #[test]
    fn test_app_state_stream_accumulation_and_commit() {
        let mut state = AppState::new();
        state.add_session("sess-1".to_string(), "Chat".to_string());
        state.add_user_message("sess-1", "What is Rust?");

        let active = state.active_messages();
        assert_eq!(active.len(), 1);
        assert_eq!(active[0].role, "user");
        assert_eq!(active[0].content, "What is Rust?");

        state.apply_stream_event(&AgentStreamEvent::thought(
            "sess-1",
            "Thinking about Rust...",
        ));
        state.apply_stream_event(&AgentStreamEvent::token("sess-1", "Rust is a "));
        state.apply_stream_event(&AgentStreamEvent::token(
            "sess-1",
            "systems programming language.",
        ));
        assert_eq!(
            state.streaming_token_buffer,
            "Rust is a systems programming language."
        );
        assert_eq!(state.streaming_thought_buffer, "Thinking about Rust...");

        state.apply_stream_event(&AgentStreamEvent::done("sess-1", None));

        let msgs = state.active_messages();
        assert_eq!(msgs.len(), 3); // user, thought, assistant
        assert_eq!(msgs[1].role, "thought");
        assert_eq!(msgs[1].content, "Thinking about Rust...");
        assert_eq!(msgs[2].role, "assistant");
        assert_eq!(msgs[2].content, "Rust is a systems programming language.");
        assert_eq!(state.streaming_token_buffer, "");
        assert_eq!(state.streaming_thought_buffer, "");
        assert!(!state.is_generating);
    }

    #[test]
    fn test_app_state_session_sync() {
        let mut state = AppState::new();
        state.add_session("sess-sync".to_string(), "Synced Chat".to_string());

        let sync = SessionSyncPayload {
            session_id: "sess-sync".to_string(),
            is_running: false,
            replay_events: vec![],
            full_assistant_text: "Replayed response".to_string(),
            full_thought_text: "Replayed thoughts".to_string(),
            pending_tool: None,
        };

        state.apply_session_sync(&sync);

        let msgs = state.active_messages();
        assert_eq!(msgs.len(), 2);
        assert_eq!(msgs[0].role, "thought");
        assert_eq!(msgs[0].content, "Replayed thoughts");
        assert_eq!(msgs[1].role, "assistant");
        assert_eq!(msgs[1].content, "Replayed response");
    }
}
