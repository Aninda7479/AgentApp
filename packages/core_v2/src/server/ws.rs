use axum::{
    extract::{
        ws::{Message, WebSocket, WebSocketUpgrade},
        State,
    },
    response::IntoResponse,
};
use futures_util::{SinkExt, StreamExt};
use parking_lot::RwLock;
use std::collections::HashSet;
use std::sync::Arc;
use tracing::info;

use crate::protocol::commands::{
    WS_ACTION_CLIENT_TOOL_RESULT, WS_ACTION_PING, WS_ACTION_PONG, WS_ACTION_SUBSCRIBE_SESSION,
    WS_ACTION_SYNC_SESSION, WS_ACTION_UNSUBSCRIBE_SESSION, WS_CHANNEL_SESSION_SYNC,
};
use crate::server::state::AppState;

// ─── WebSocket Event Hub & Session Resiliency ─────────────────────────────────

pub async fn handle_agent_ws(
    ws: WebSocketUpgrade,
    State(state): State<AppState>,
) -> impl IntoResponse {
    ws.on_upgrade(|socket| handle_ws_socket(socket, state))
}

/// Evaluates whether an outbound WebSocket broadcast message should be forwarded
/// to a connected client given its subscribed session IDs.
///
/// Rules:
/// - If `subscribed_sessions` is empty, all messages are forwarded (preserves backward
///   compatibility with existing Web and Tauri frontends).
/// - If the message contains session identifiers (`sessionId`, `chatId`, `session_id`) on
///   session-bound channels (`agent-event`, `session-sync`, `chat-name`), it is only forwarded
///   if the connection has subscribed to that specific session.
/// - Non-session messages (system notices, general broadcasts) are always forwarded.
pub fn should_forward_ws_message(msg_str: &str, subscribed_sessions: &HashSet<String>) -> bool {
    if subscribed_sessions.is_empty() {
        return true;
    }

    if let Ok(val) = serde_json::from_str::<serde_json::Value>(msg_str) {
        let channel = val.get("channel").and_then(|v| v.as_str()).unwrap_or("");
        if channel == "agent-event" || channel == "session-sync" || channel == "chat-name" {
            let session_id = val
                .get("data")
                .and_then(|d| {
                    d.get("sessionId")
                        .or_else(|| d.get("chatId"))
                        .or_else(|| d.get("session_id"))
                })
                .and_then(|v| v.as_str());

            if let Some(sid) = session_id {
                let clean = sid.trim_start_matches("session-");
                return subscribed_sessions.contains(sid) || subscribed_sessions.contains(clean);
            }
        }
    }

    true
}

pub async fn handle_ws_socket(socket: WebSocket, state: AppState) {
    let (mut ws_sender, mut ws_receiver) = socket.split();
    let mut broadcast_rx = state.ws_broadcast_tx.subscribe();

    info!("New WebSocket client connected to Core v2 Hub");

    // Tracks session IDs explicitly subscribed to by this client connection.
    let subscribed_sessions = Arc::new(RwLock::new(HashSet::<String>::new()));
    let subscribed_sessions_send = subscribed_sessions.clone();
    let subscribed_sessions_recv = subscribed_sessions.clone();

    let mut send_task = tokio::spawn(async move {
        loop {
            match broadcast_rx.recv().await {
                Ok(msg_str) => {
                    let should_send = {
                        let subs = subscribed_sessions_send.read();
                        should_forward_ws_message(&msg_str, &subs)
                    };

                    if !should_send {
                        continue;
                    }

                    if ws_sender.send(Message::Text(msg_str)).await.is_err() {
                        break;
                    }
                }
                Err(tokio::sync::broadcast::error::RecvError::Lagged(skipped)) => {
                    tracing::warn!(
                        "WebSocket client lagged behind, skipped {} messages",
                        skipped
                    );
                    continue;
                }
                Err(tokio::sync::broadcast::error::RecvError::Closed) => {
                    break;
                }
            }
        }
    });

    let state_clone = state.clone();
    let mut recv_task = tokio::spawn(async move {
        while let Some(Ok(msg)) = ws_receiver.next().await {
            if let Message::Text(text) = msg {
                if let Ok(val) = serde_json::from_str::<serde_json::Value>(&text) {
                    let action = val.get("action").and_then(|v| v.as_str()).unwrap_or("");
                    match action {
                        WS_ACTION_PING => {
                            let pong = serde_json::json!({
                                "action": WS_ACTION_PONG,
                                "timestamp": chrono::Utc::now().timestamp_millis()
                            });
                            let _ = state_clone.ws_broadcast_tx.send(pong.to_string());
                        }
                        WS_ACTION_SUBSCRIBE_SESSION => {
                            if let Some(sess_id) = val.get("sessionId").and_then(|v| v.as_str()) {
                                let clean = sess_id.trim_start_matches("session-").to_string();
                                let mut subs = subscribed_sessions_recv.write();
                                subs.insert(sess_id.to_string());
                                subs.insert(clean);
                                tracing::debug!(
                                    "WebSocket client subscribed to session: {}",
                                    sess_id
                                );
                            }
                        }
                        WS_ACTION_UNSUBSCRIBE_SESSION => {
                            if let Some(sess_id) = val.get("sessionId").and_then(|v| v.as_str()) {
                                let clean = sess_id.trim_start_matches("session-").to_string();
                                let mut subs = subscribed_sessions_recv.write();
                                subs.remove(sess_id);
                                subs.remove(&clean);
                                tracing::debug!(
                                    "WebSocket client unsubscribed from session: {}",
                                    sess_id
                                );
                            }
                        }
                        WS_ACTION_SYNC_SESSION => {
                            if let Some(sess_id) = val.get("sessionId").and_then(|v| v.as_str()) {
                                let mut store = state_clone.session_store.lock();
                                let clean = sess_id.trim_start_matches("session-");
                                let entry = if store.contains(clean) {
                                    store.get(clean).cloned().unwrap_or_default()
                                } else {
                                    store.get(sess_id).cloned().unwrap_or_default()
                                };
                                let sync_payload = serde_json::json!({
                                    "channel": WS_CHANNEL_SESSION_SYNC,
                                    "data": {
                                        "sessionId": sess_id,
                                        "isRunning": entry.is_running,
                                        "replayEvents": entry.events,
                                        "fullAssistantText": entry.full_assistant_text,
                                        "fullThoughtText": entry.full_thought_text,
                                        "pendingTool": serde_json::Value::Null,
                                    }
                                });
                                let _ = state_clone.ws_broadcast_tx.send(sync_payload.to_string());
                            }
                        }
                        WS_ACTION_CLIENT_TOOL_RESULT => {
                            if let Some(tool_id) = val.get("id").and_then(|v| v.as_str()) {
                                let mut pending = state_clone.pending_client_tools.lock();
                                if let Some(sender) = pending.remove(tool_id) {
                                    let res = val
                                        .get("result")
                                        .cloned()
                                        .unwrap_or(serde_json::Value::Null);
                                    let _ = sender.send(res);
                                }
                            }
                        }
                        _ => {}
                    }
                }
            }
        }
    });

    tokio::select! {
        _ = (&mut send_task) => recv_task.abort(),
        _ = (&mut recv_task) => send_task.abort(),
    }
}
