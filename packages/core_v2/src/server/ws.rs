use axum::{
    extract::{
        ws::{Message, WebSocket, WebSocketUpgrade},
        State,
    },
    response::IntoResponse,
};
use futures_util::{SinkExt, StreamExt};
use tracing::info;

use crate::server::state::AppState;

// ─── WebSocket Event Hub & Session Resiliency ─────────────────────────────────

pub async fn handle_agent_ws(
    ws: WebSocketUpgrade,
    State(state): State<AppState>,
) -> impl IntoResponse {
    ws.on_upgrade(|socket| handle_ws_socket(socket, state))
}

pub async fn handle_ws_socket(socket: WebSocket, state: AppState) {
    let (mut ws_sender, mut ws_receiver) = socket.split();
    let mut broadcast_rx = state.ws_broadcast_tx.subscribe();

    info!("New WebSocket client connected to Core v2 Hub");

    let mut send_task = tokio::spawn(async move {
        while let Ok(msg_str) = broadcast_rx.recv().await {
            if ws_sender.send(Message::Text(msg_str)).await.is_err() {
                break;
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
                        "PING" => {
                            let pong = serde_json::json!({ "action": "PONG", "timestamp": chrono::Utc::now().timestamp_millis() });
                            let _ = state_clone.ws_broadcast_tx.send(pong.to_string());
                        }
                        "SYNC_SESSION" => {
                            if let Some(sess_id) = val.get("sessionId").and_then(|v| v.as_str()) {
                                let mut store = state_clone.session_store.lock().unwrap();
                                let entry = store.get(sess_id).cloned().unwrap_or_default();
                                let sync_payload = serde_json::json!({
                                    "channel": "session-sync",
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
                        "CLIENT_TOOL_RESULT" => {
                            if let Some(tool_id) = val.get("id").and_then(|v| v.as_str()) {
                                let mut pending = state_clone.pending_client_tools.lock().unwrap();
                                if let Some(sender) = pending.remove(tool_id) {
                                    let res = val.get("result").cloned().unwrap_or(serde_json::Value::Null);
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
