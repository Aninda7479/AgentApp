//! High-performance SuperAgent Core v2 Daemon Client.
//!
//! Provides typed HTTP IPC invoking and full-duplex WebSocket event streaming
//! communicating with `superagent-core-daemon` using canonical wire protocol contracts
//! from `superagent_core_v2::protocol`.

use std::collections::HashSet;
use std::path::PathBuf;
use std::sync::Arc;
use std::time::Duration;

use futures_util::{SinkExt, StreamExt};
use serde::{de::DeserializeOwned, Deserialize, Serialize};
use tokio::sync::{broadcast, mpsc, RwLock};
use tokio_tungstenite::tungstenite::Message;
use tracing::{debug, info, warn};

use superagent_core_v2::protocol::{
    commands::{
        AGENT_RUN, AGENT_STATUS, AGENT_STOP, CHATS_READ, SYSTEM_INFO, WS_ACTION_PING,
        WS_ACTION_PONG, WS_ACTION_SUBSCRIBE_SESSION, WS_ACTION_SYNC_SESSION,
        WS_ACTION_UNSUBSCRIBE_SESSION,
    },
    dtos::{
        AgentRunRequest, AgentStatusResponse, AgentStopRequest, IpcRequestEnvelope,
        IpcResponseEnvelope,
    },
    events::{AgentStreamEvent, PongMessage, WireMessage},
};

/// Fallback daemon port when neither environment variable nor lockfile is present.
pub const DEFAULT_DAEMON_PORT: u16 = 1469;

/// Connection status enum for daemon connectivity.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "lowercase")]
pub enum ConnectionStatus {
    #[default]
    Disconnected,
    Connecting,
    Connected,
    Error,
}

/// Daemon client configuration.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct ClientConfig {
    pub http_base_url: String,
    pub ws_base_url: String,
    pub session_token: Option<String>,
}

impl ClientConfig {
    /// Creates configuration targeting a given port on localhost.
    pub fn from_port(port: u16, session_token: Option<String>) -> Self {
        Self {
            http_base_url: format!("http://127.0.0.1:{}", port),
            ws_base_url: format!("ws://127.0.0.1:{}/ws", port),
            session_token,
        }
    }

    /// Creates configuration targeting a custom server URL.
    pub fn from_server(server: &str, session_token: Option<String>) -> Self {
        let base = server.trim_end_matches('/');
        let ws_scheme = if base.starts_with("https://") {
            "wss://"
        } else {
            "ws://"
        };
        let stripped = base
            .trim_start_matches("http://")
            .trim_start_matches("https://");
        let ws_url = format!("{}{}/ws", ws_scheme, stripped);

        Self {
            http_base_url: base.to_string(),
            ws_base_url: ws_url,
            session_token,
        }
    }

    /// Discovers daemon configuration from options, environment, or lockfiles.
    pub fn discover(
        explicit_server: Option<&str>,
        explicit_port: Option<u16>,
        token: Option<String>,
    ) -> Self {
        if let Some(srv) = explicit_server {
            return Self::from_server(srv, token);
        }
        let port = explicit_port.unwrap_or_else(discover_daemon_port);
        Self::from_port(port, token)
    }
}

impl Default for ClientConfig {
    fn default() -> Self {
        Self::from_port(DEFAULT_DAEMON_PORT, None)
    }
}

/// Dynamically discovers running SuperAgent core daemon port.
/// Checks `SUPERAGENT_PORT` env var first, then `~/.superagent/web-server.lock`
/// and `~/.superagent/runtime/web-server.lock`, falling back to `1469`.
pub fn discover_daemon_port() -> u16 {
    if let Ok(port_str) = std::env::var("SUPERAGENT_PORT") {
        if let Ok(p) = port_str.trim().parse::<u16>() {
            if p > 0 {
                return p;
            }
        }
    }

    let home = std::env::var("USERPROFILE")
        .or_else(|_| std::env::var("HOME"))
        .ok();

    if let Some(home_str) = home {
        let home_path = PathBuf::from(home_str);
        let candidates = [
            home_path.join(".superagent").join("web-server.lock"),
            home_path
                .join(".superagent")
                .join("runtime")
                .join("web-server.lock"),
            PathBuf::from(".")
                .join(".superagent")
                .join("web-server.lock"),
            PathBuf::from(".")
                .join(".superagent")
                .join("runtime")
                .join("web-server.lock"),
        ];

        for path in &candidates {
            if let Ok(content) = std::fs::read_to_string(path) {
                if let Ok(val) = serde_json::from_str::<serde_json::Value>(&content) {
                    if let Some(port) = val.get("port").and_then(|v| {
                        v.as_u64()
                            .or_else(|| v.as_str().and_then(|s| s.parse::<u64>().ok()))
                    }) {
                        if port > 0 && port <= 65535 {
                            return port as u16;
                        }
                    }
                }
            }
        }
    }

    DEFAULT_DAEMON_PORT
}

/// Error type for DaemonClient operations.
#[derive(Debug, thiserror::Error)]
pub enum DaemonClientError {
    #[error("HTTP error: {0}")]
    Http(#[from] reqwest::Error),
    #[error("IPC error response: {0}")]
    Ipc(String),
    #[error("JSON serialization error: {0}")]
    Json(#[from] serde_json::Error),
    #[error("WebSocket error: {0}")]
    WebSocket(String),
    #[error("Client disconnected")]
    Disconnected,
}

/// High-performance daemon client managing HTTP IPC and WebSocket streaming.
#[derive(Clone)]
pub struct DaemonClient {
    config: Arc<RwLock<ClientConfig>>,
    http: reqwest::Client,
    status: Arc<RwLock<ConnectionStatus>>,
    active_subscriptions: Arc<RwLock<HashSet<String>>>,
    event_tx: broadcast::Sender<WireMessage>,
    ws_send_tx: Arc<RwLock<Option<mpsc::UnboundedSender<String>>>>,
}

impl DaemonClient {
    /// Creates a new `DaemonClient` with the given configuration.
    pub fn new(config: ClientConfig) -> Self {
        let (event_tx, _) = broadcast::channel(2048);
        Self {
            config: Arc::new(RwLock::new(config)),
            http: reqwest::Client::builder()
                .timeout(Duration::from_secs(60))
                .build()
                .unwrap_or_default(),
            status: Arc::new(RwLock::new(ConnectionStatus::Disconnected)),
            active_subscriptions: Arc::new(RwLock::new(HashSet::new())),
            event_tx,
            ws_send_tx: Arc::new(RwLock::new(None)),
        }
    }

    /// Creates a `DaemonClient` from port.
    pub fn from_port(port: u16) -> Self {
        Self::new(ClientConfig::from_port(port, None))
    }

    /// Discovers local daemon configuration and creates a client.
    pub fn discover() -> Self {
        Self::new(ClientConfig::discover(None, None, None))
    }

    /// Gets current client configuration snapshot.
    pub async fn config(&self) -> ClientConfig {
        self.config.read().await.clone()
    }

    /// Gets current connection status.
    pub async fn status(&self) -> ConnectionStatus {
        self.status.read().await.clone()
    }

    /// Subscribes to broadcasted wire messages and events.
    pub fn subscribe_events(&self) -> broadcast::Receiver<WireMessage> {
        self.event_tx.subscribe()
    }

    // ─── HTTP IPC Invocation ──────────────────────────────────────────────────

    /// Invokes a backend IPC channel via HTTP POST `/api/ipc/:channel`.
    pub async fn invoke<T: DeserializeOwned, R: Serialize>(
        &self,
        channel: &str,
        args: &[R],
    ) -> Result<T, DaemonClientError> {
        let cfg = self.config().await;
        let url = format!("{}/api/ipc/{}", cfg.http_base_url, channel);

        let mut req = self.http.post(&url);
        if let Some(token) = &cfg.session_token {
            req = req.header("Authorization", format!("Bearer {}", token));
        }

        let envelope = IpcRequestEnvelope {
            channel: Some(channel.to_string()),
            args: args
                .iter()
                .map(|a| serde_json::to_value(a).unwrap_or(serde_json::Value::Null))
                .collect(),
            extra: std::collections::HashMap::new(),
        };

        let res = req.json(&envelope).send().await?;
        if !res.status().is_success() {
            let status = res.status();
            let body = res
                .text()
                .await
                .unwrap_or_else(|_| "Unknown error".to_string());
            return Err(DaemonClientError::Ipc(format!(
                "HTTP {} on channel '{}': {}",
                status, channel, body
            )));
        }

        let resp_env: IpcResponseEnvelope<T> = res.json().await?;
        if let Some(err) = resp_env.error {
            return Err(DaemonClientError::Ipc(err));
        }

        resp_env
            .data
            .ok_or_else(|| DaemonClientError::Ipc("No data returned in response envelope".into()))
    }

    /// Triggers an agent execution run.
    pub async fn agent_run(
        &self,
        req: &AgentRunRequest,
    ) -> Result<serde_json::Value, DaemonClientError> {
        self.invoke(AGENT_RUN, &[req]).await
    }

    /// Requests to stop a running agent session.
    pub async fn agent_stop(
        &self,
        session_id: &str,
    ) -> Result<serde_json::Value, DaemonClientError> {
        let req = AgentStopRequest {
            session_id: session_id.to_string(),
        };
        self.invoke(AGENT_STOP, &[req]).await
    }

    /// Checks execution status of an agent session.
    pub async fn agent_status(
        &self,
        session_id: &str,
    ) -> Result<AgentStatusResponse, DaemonClientError> {
        self.invoke(AGENT_STATUS, &[session_id]).await
    }

    /// Reads chat sessions list.
    pub async fn list_chats(&self) -> Result<serde_json::Value, DaemonClientError> {
        let empty_args: &[serde_json::Value] = &[];
        self.invoke(CHATS_READ, empty_args).await
    }

    /// Retrieves system diagnostics and host info.
    pub async fn get_system_info(&self) -> Result<serde_json::Value, DaemonClientError> {
        let empty_args: &[serde_json::Value] = &[];
        self.invoke(SYSTEM_INFO, empty_args).await
    }

    // ─── WebSocket Streaming & State Synchronization ─────────────────────────

    /// Registers a session subscription and notifies daemon over WebSocket.
    pub async fn subscribe_session(&self, session_id: &str) {
        {
            let mut subs = self.active_subscriptions.write().await;
            subs.insert(session_id.to_string());
        }
        let msg = build_subscribe_action(session_id);
        self.send_ws_raw(&msg).await;
    }

    /// Unsubscribes from session-specific events.
    pub async fn unsubscribe_session(&self, session_id: &str) {
        {
            let mut subs = self.active_subscriptions.write().await;
            subs.remove(session_id);
        }
        let msg = build_unsubscribe_action(session_id);
        self.send_ws_raw(&msg).await;
    }

    /// Requests immediate session catch-up and replay.
    pub async fn sync_session(&self, session_id: &str) {
        let msg = build_sync_action(session_id);
        self.send_ws_raw(&msg).await;
    }

    /// Sends a WebSocket ping heartbeat.
    pub async fn send_ping(&self) {
        let msg = build_ping_action();
        self.send_ws_raw(&msg).await;
    }

    /// Internal helper to send a raw payload string over active WebSocket sink.
    async fn send_ws_raw(&self, text: &str) {
        if let Some(tx) = self.ws_send_tx.read().await.as_ref() {
            let _ = tx.send(text.to_string());
        }
    }

    /// Spawns the full-duplex WebSocket client streaming loop with auto-reconnection.
    pub fn start_ws_loop(&self) -> tokio::task::JoinHandle<()> {
        let this = self.clone();
        tokio::spawn(async move {
            this.run_ws_reconnect_loop().await;
        })
    }

    async fn run_ws_reconnect_loop(&self) {
        loop {
            *self.status.write().await = ConnectionStatus::Connecting;
            let cfg = self.config().await;

            let ws_target = if let Some(token) = &cfg.session_token {
                format!("{}?token={}", cfg.ws_base_url, token)
            } else {
                cfg.ws_base_url.clone()
            };

            debug!("Connecting to daemon WebSocket at {}", ws_target);
            match tokio_tungstenite::connect_async(&ws_target).await {
                Ok((stream, _)) => {
                    info!("Connected to SuperAgent core daemon WebSocket");
                    *self.status.write().await = ConnectionStatus::Connected;

                    let (mut write_half, mut read_half) = stream.split();
                    let (tx, mut rx) = mpsc::unbounded_channel::<String>();
                    *self.ws_send_tx.write().await = Some(tx);

                    // Re-subscribe to all active sessions on (re)connection
                    let active = self.active_subscriptions.read().await.clone();
                    for session_id in active {
                        let sub_msg = build_subscribe_action(&session_id);
                        let _ = write_half.send(Message::Text(sub_msg)).await;
                    }

                    // Channel to coordinate writer shutdown
                    let mut ping_interval = tokio::time::interval(Duration::from_secs(30));

                    loop {
                        tokio::select! {
                            // Outgoing messages
                            Some(msg) = rx.recv() => {
                                if let Err(e) = write_half.send(Message::Text(msg)).await {
                                    warn!("Error sending WebSocket message: {}", e);
                                    break;
                                }
                            }
                            // Heartbeat ping
                            _ = ping_interval.tick() => {
                                let ping_json = build_ping_action();
                                if let Err(e) = write_half.send(Message::Text(ping_json)).await {
                                    warn!("Error sending WebSocket heartbeat: {}", e);
                                    break;
                                }
                            }
                            // Inbound messages
                            msg_opt = read_half.next() => {
                                match msg_opt {
                                    Some(Ok(Message::Text(text))) => {
                                        self.handle_inbound_text(&text).await;
                                    }
                                    Some(Ok(Message::Close(_))) => {
                                        info!("WebSocket connection closed by daemon");
                                        break;
                                    }
                                    Some(Ok(Message::Ping(data))) => {
                                        let _ = write_half.send(Message::Pong(data)).await;
                                    }
                                    Some(Err(e)) => {
                                        warn!("WebSocket read error: {}", e);
                                        break;
                                    }
                                    None => {
                                        debug!("WebSocket stream ended");
                                        break;
                                    }
                                    _ => {}
                                }
                            }
                        }
                    }

                    *self.ws_send_tx.write().await = None;
                    *self.status.write().await = ConnectionStatus::Disconnected;
                }
                Err(e) => {
                    warn!("Failed to connect to daemon WebSocket: {}", e);
                    *self.status.write().await = ConnectionStatus::Error;
                }
            }

            // Backoff before reconnecting
            tokio::time::sleep(Duration::from_secs(3)).await;
        }
    }

    async fn handle_inbound_text(&self, text: &str) {
        match parse_wire_message(text) {
            Ok(msg) => {
                let _ = self.event_tx.send(msg);
            }
            Err(e) => {
                debug!("Failed to parse wire message: {} (raw: {})", e, text);
            }
        }
    }
}

// ─── Canonical Action Builders & Message Parsing ─────────────────────────────

/// Builds a `SUBSCRIBE_SESSION` action JSON string.
pub fn build_subscribe_action(session_id: &str) -> String {
    serde_json::json!({
        "action": WS_ACTION_SUBSCRIBE_SESSION,
        "sessionId": session_id
    })
    .to_string()
}

/// Builds an `UNSUBSCRIBE_SESSION` action JSON string.
pub fn build_unsubscribe_action(session_id: &str) -> String {
    serde_json::json!({
        "action": WS_ACTION_UNSUBSCRIBE_SESSION,
        "sessionId": session_id
    })
    .to_string()
}

/// Builds a `SYNC_SESSION` action JSON string.
pub fn build_sync_action(session_id: &str) -> String {
    serde_json::json!({
        "action": WS_ACTION_SYNC_SESSION,
        "sessionId": session_id
    })
    .to_string()
}

/// Builds a `PING` heartbeat JSON string.
pub fn build_ping_action() -> String {
    serde_json::json!({
        "action": WS_ACTION_PING,
        "timestamp": chrono::Utc::now().timestamp_millis()
    })
    .to_string()
}

/// Builds a `PONG` heartbeat JSON string.
pub fn build_pong_action() -> String {
    serde_json::json!({
        "action": WS_ACTION_PONG,
        "timestamp": chrono::Utc::now().timestamp_millis()
    })
    .to_string()
}

/// Parses a raw WebSocket JSON string into a strongly typed `WireMessage`.
pub fn parse_wire_message(raw_json: &str) -> Result<WireMessage, serde_json::Error> {
    // Attempt standard untagged WireMessage deserialization first
    if let Ok(msg) = serde_json::from_str::<WireMessage>(raw_json) {
        return Ok(msg);
    }

    // Fallback: Check if message is a direct unwrapped AgentStreamEvent (e.g. {"type":"token", ...})
    if let Ok(event) = serde_json::from_str::<AgentStreamEvent>(raw_json) {
        return Ok(WireMessage::agent_event(event));
    }

    // Fallback: Check if message is Pong ({"action":"PONG", ...})
    if let Ok(pong) = serde_json::from_str::<PongMessage>(raw_json) {
        return Ok(WireMessage::Pong(pong));
    }

    // Fallback: Generic channel envelope ({"channel": "...", "data": ...})
    let val: serde_json::Value = serde_json::from_str(raw_json)?;
    if let Some(ch) = val.get("channel").and_then(|v| v.as_str()) {
        let data = val.get("data").cloned().unwrap_or_else(|| val.clone());
        return Ok(WireMessage::channel(ch, data));
    }

    // Final fallback: wrap as Action or generic Channel
    Ok(WireMessage::channel("raw", val))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_client_config_from_port() {
        let config = ClientConfig::from_port(1469, Some("secret".to_string()));
        assert_eq!(config.http_base_url, "http://127.0.0.1:1469");
        assert_eq!(config.ws_base_url, "ws://127.0.0.1:1469/ws");
        assert_eq!(config.session_token, Some("secret".to_string()));
    }

    #[test]
    fn test_client_config_from_server() {
        let config = ClientConfig::from_server("http://localhost:8080", None);
        assert_eq!(config.http_base_url, "http://localhost:8080");
        assert_eq!(config.ws_base_url, "ws://localhost:8080/ws");

        let secure = ClientConfig::from_server("https://agent.example.com", None);
        assert_eq!(secure.http_base_url, "https://agent.example.com");
        assert_eq!(secure.ws_base_url, "wss://agent.example.com/ws");
    }

    #[test]
    fn test_action_builders() {
        let sub = build_subscribe_action("session-abc");
        assert!(sub.contains("\"action\":\"SUBSCRIBE_SESSION\""));
        assert!(sub.contains("\"sessionId\":\"session-abc\""));

        let unsub = build_unsubscribe_action("session-abc");
        assert!(unsub.contains("\"action\":\"UNSUBSCRIBE_SESSION\""));

        let sync = build_sync_action("session-abc");
        assert!(sync.contains("\"action\":\"SYNC_SESSION\""));

        let ping = build_ping_action();
        assert!(ping.contains("\"action\":\"PING\""));
        assert!(ping.contains("\"timestamp\":"));
    }

    #[test]
    fn test_parse_wire_message_agent_event() {
        let raw = serde_json::json!({
            "channel": "agent-event",
            "data": {
                "type": "token",
                "sessionId": "s-100",
                "content": "Hello Rust GTK"
            }
        })
        .to_string();

        let msg = parse_wire_message(&raw).expect("Must parse agent-event");
        match msg {
            WireMessage::AgentEvent { channel, data } => {
                assert_eq!(channel, "agent-event");
                match data {
                    AgentStreamEvent::Token {
                        session_id,
                        content,
                    } => {
                        assert_eq!(session_id, "s-100");
                        assert_eq!(content, "Hello Rust GTK");
                    }
                    _ => panic!("Expected Token variant"),
                }
            }
            _ => panic!("Expected AgentEvent envelope"),
        }
    }

    #[test]
    fn test_parse_wire_message_direct_stream_event() {
        let raw = serde_json::json!({
            "type": "thought",
            "sessionId": "s-200",
            "content": "Reasoning about GTK4 Libadwaita architecture"
        })
        .to_string();

        let msg = parse_wire_message(&raw).expect("Must parse direct stream event");
        match msg {
            WireMessage::AgentEvent { channel, data } => {
                assert_eq!(channel, "agent-event");
                match data {
                    AgentStreamEvent::Thought {
                        session_id,
                        content,
                    } => {
                        assert_eq!(session_id, "s-200");
                        assert_eq!(content, "Reasoning about GTK4 Libadwaita architecture");
                    }
                    _ => panic!("Expected Thought variant"),
                }
            }
            _ => panic!("Expected AgentEvent envelope"),
        }
    }

    #[test]
    fn test_parse_wire_message_session_sync() {
        let raw = serde_json::json!({
            "channel": "session-sync",
            "data": {
                "sessionId": "s-300",
                "isRunning": true,
                "fullAssistantText": "Completed answer",
                "fullThoughtText": "Deep thoughts",
                "replayEvents": []
            }
        })
        .to_string();

        let msg = parse_wire_message(&raw).expect("Must parse session-sync");
        match msg {
            WireMessage::SessionSync { channel, data } => {
                assert_eq!(channel, "session-sync");
                assert_eq!(data.session_id, "s-300");
                assert!(data.is_running);
                assert_eq!(data.full_assistant_text, "Completed answer");
            }
            _ => panic!("Expected SessionSync envelope"),
        }
    }

    #[test]
    fn test_parse_wire_message_pong() {
        let raw = serde_json::json!({
            "action": "PONG",
            "timestamp": 1728864000000i64
        })
        .to_string();

        let msg = parse_wire_message(&raw).expect("Must parse pong");
        match msg {
            WireMessage::Pong(pong) => {
                assert_eq!(pong.action, "PONG");
                assert_eq!(pong.timestamp, 1728864000000i64);
            }
            _ => panic!("Expected Pong variant"),
        }
    }

    #[test]
    fn test_daemon_client_initialization() {
        let client = DaemonClient::from_port(1469);
        let rx = client.subscribe_events();
        assert_eq!(rx.len(), 0);
    }
}
