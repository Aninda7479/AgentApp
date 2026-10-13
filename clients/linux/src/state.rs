//! Reactive application state for the Linux Native client.
//!
//! Manages active sessions, chat histories, streaming token and thought buffers,
//! and connection lifecycle states.

use serde::{Deserialize, Serialize};
use std::collections::HashMap;

use superagent_core_v2::protocol::events::{AgentStreamEvent, SessionSyncPayload};

use crate::client::daemon_client::ConnectionStatus;

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
#[derive(Debug, Clone, Default)]
pub struct AppState {
    pub sessions: Vec<SessionItem>,
    pub active_session_id: Option<String>,
    pub messages: HashMap<String, Vec<ChatMessage>>,
    pub streaming_thought_buffer: String,
    pub streaming_token_buffer: String,
    pub connection_status: ConnectionStatus,
    pub is_generating: bool,
}

impl AppState {
    pub fn new() -> Self {
        Self::default()
    }

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
            AgentStreamEvent::StepComplete { .. } => {
                // Checkpoint
            }
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
