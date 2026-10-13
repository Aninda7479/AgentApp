//! Strongly typed Data Transfer Objects (DTOs) for IPC requests and responses.
//!
//! Provides canonical serialization contracts between client surfaces (Web,
//! native OS shells, extensions, CLI) and the Core daemon.

use serde::{Deserialize, Serialize};
use std::collections::HashMap;

// ─── Generic IPC Envelopes ───────────────────────────────────────────────────

/// Standard envelope for invoking IPC channels over HTTP (`/api/ipc/:channel`).
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct IpcRequestEnvelope<T = serde_json::Value> {
    #[serde(default)]
    pub channel: Option<String>,
    #[serde(default)]
    pub args: Vec<T>,
    #[serde(flatten, default)]
    pub extra: HashMap<String, serde_json::Value>,
}

impl<T> Default for IpcRequestEnvelope<T> {
    fn default() -> Self {
        Self {
            channel: None,
            args: Vec::new(),
            extra: HashMap::new(),
        }
    }
}

impl<T> IpcRequestEnvelope<T> {
    pub fn new(channel: impl Into<String>, args: Vec<T>) -> Self {
        Self {
            channel: Some(channel.into()),
            args,
            extra: HashMap::new(),
        }
    }

    pub fn with_single_arg(channel: impl Into<String>, arg: T) -> Self {
        Self {
            channel: Some(channel.into()),
            args: vec![arg],
            extra: HashMap::new(),
        }
    }
}

/// Standard response envelope returned by `/api/ipc/:channel`.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct IpcResponseEnvelope<T = serde_json::Value> {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub data: Option<T>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

impl<T> IpcResponseEnvelope<T> {
    pub fn ok(data: T) -> Self {
        Self {
            data: Some(data),
            error: None,
        }
    }

    pub fn error(error: impl Into<String>) -> Self {
        Self {
            data: None,
            error: Some(error.into()),
        }
    }
}

// ─── Agent Execution DTOs ─────────────────────────────────────────────────────

/// Configuration payload for an agent run session.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Default)]
#[serde(rename_all = "camelCase")]
pub struct AgentRunConfig {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub provider: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub model: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub api_key: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub base_url: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub instructions: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub attachments: Option<Vec<serde_json::Value>>,
}

/// Request payload for channel `agent-run`.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct AgentRunRequest {
    #[serde(default = "default_session_id")]
    pub session_id: String,
    pub prompt: String,
    #[serde(default)]
    pub config: Option<AgentRunConfig>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub current_attachments: Option<Vec<serde_json::Value>>,
}

fn default_session_id() -> String {
    "default-session".to_string()
}

/// Request payload for channel `agent-stop`.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct AgentStopRequest {
    pub session_id: String,
}

/// Response payload for channel `agent-status`.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct AgentStatusResponse {
    pub session_id: String,
    pub is_running: bool,
}

/// Request payload for channel `chat-generate-title`.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Default)]
pub struct ChatGenerateTitleRequest {
    pub prompt: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub response: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub provider: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub model: Option<String>,
    #[serde(rename = "apiKey", skip_serializing_if = "Option::is_none")]
    pub api_key: Option<String>,
    #[serde(rename = "baseUrl", skip_serializing_if = "Option::is_none")]
    pub base_url: Option<String>,
}

/// Response payload for channel `chat-generate-title`.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Default)]
pub struct ChatGenerateTitleResponse {
    pub title: Option<String>,
}

// ─── WebSocket Session Management DTOs ────────────────────────────────────────

/// Inbound action for subscribing to session-specific events.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SubscribeSessionRequest {
    pub action: String,
    pub session_id: String,
}

impl SubscribeSessionRequest {
    pub fn new(session_id: impl Into<String>) -> Self {
        Self {
            action: crate::protocol::commands::WS_ACTION_SUBSCRIBE_SESSION.to_string(),
            session_id: session_id.into(),
        }
    }
}

/// Inbound action for unsubscribing from session events.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct UnsubscribeSessionRequest {
    pub action: String,
    pub session_id: String,
}

impl UnsubscribeSessionRequest {
    pub fn new(session_id: impl Into<String>) -> Self {
        Self {
            action: crate::protocol::commands::WS_ACTION_UNSUBSCRIBE_SESSION.to_string(),
            session_id: session_id.into(),
        }
    }
}

/// Inbound action for requesting immediate state catch-up for a session.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SyncSessionRequest {
    pub action: String,
    pub session_id: String,
}

impl SyncSessionRequest {
    pub fn new(session_id: impl Into<String>) -> Self {
        Self {
            action: crate::protocol::commands::WS_ACTION_SYNC_SESSION.to_string(),
            session_id: session_id.into(),
        }
    }
}

/// Inbound action for resolving client-side tool execution results.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct ClientToolResultRequest {
    pub action: String,
    pub id: String,
    pub result: serde_json::Value,
}

// ─── System Info DTOs ─────────────────────────────────────────────────────────

/// Response payload for system diagnostics and hardware status (`system-info`, `get_system_info`).
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct SystemInfoResponse {
    pub os_name: String,
    pub os_version: String,
    pub total_memory_mb: u64,
    pub used_memory_mb: u64,
    pub cpu_count: usize,
    pub cpu_usage_percent: f32,
    pub hostname: String,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_ipc_request_envelope_roundtrip() {
        let req = IpcRequestEnvelope::with_single_arg(
            "agent-run",
            serde_json::json!({ "prompt": "hello", "sessionId": "s-1" }),
        );
        let json = serde_json::to_string(&req).unwrap();
        assert!(json.contains("\"channel\":\"agent-run\""));

        let parsed: IpcRequestEnvelope = serde_json::from_str(&json).unwrap();
        assert_eq!(parsed.channel.as_deref(), Some("agent-run"));
        assert_eq!(parsed.args.len(), 1);
    }

    #[test]
    fn test_agent_run_request() {
        let req = AgentRunRequest {
            session_id: "test-sess".to_string(),
            prompt: "What is 2 + 2?".to_string(),
            config: Some(AgentRunConfig {
                provider: Some("openai".into()),
                model: Some("gpt-4o".into()),
                ..Default::default()
            }),
            current_attachments: None,
        };
        let json = serde_json::to_string(&req).unwrap();
        assert!(json.contains("\"sessionId\":\"test-sess\""));
        assert!(json.contains("\"prompt\":\"What is 2 + 2?\""));

        let parsed: AgentRunRequest = serde_json::from_str(&json).unwrap();
        assert_eq!(parsed, req);
    }

    #[test]
    fn test_ws_subscription_requests() {
        let sub = SubscribeSessionRequest::new("sess-100");
        let json_sub = serde_json::to_string(&sub).unwrap();
        assert!(json_sub.contains("\"action\":\"SUBSCRIBE_SESSION\""));
        assert!(json_sub.contains("\"sessionId\":\"sess-100\""));

        let unsub = UnsubscribeSessionRequest::new("sess-100");
        let json_unsub = serde_json::to_string(&unsub).unwrap();
        assert!(json_unsub.contains("\"action\":\"UNSUBSCRIBE_SESSION\""));
    }
}
