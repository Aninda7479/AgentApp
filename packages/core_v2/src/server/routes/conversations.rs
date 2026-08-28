use axum::{
    extract::{Path as AxumPath, State},
    http::StatusCode,
    Json,
};

use crate::server::state::AppState;
use crate::storage::chat_storage::{ChatSession, ChatSessionMetadata};

pub async fn list_conversations(
    State(state): State<AppState>,
) -> Result<Json<Vec<ChatSessionMetadata>>, StatusCode> {
    state
        .chat_storage
        .list_sessions()
        .map(Json)
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)
}

pub async fn get_conversation(
    State(state): State<AppState>,
    AxumPath(id): AxumPath<String>,
) -> Result<Json<ChatSession>, StatusCode> {
    state
        .chat_storage
        .load_session(&id)
        .map(Json)
        .map_err(|_| StatusCode::NOT_FOUND)
}

pub async fn save_conversation(
    State(state): State<AppState>,
    Json(record): Json<ChatSession>,
) -> Result<Json<serde_json::Value>, StatusCode> {
    state
        .chat_storage
        .save_session(&record)
        .map(|_| Json(serde_json::json!({ "success": true, "id": record.id })))
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)
}

pub async fn delete_conversation(
    State(state): State<AppState>,
    AxumPath(id): AxumPath<String>,
) -> Result<Json<serde_json::Value>, StatusCode> {
    state
        .chat_storage
        .delete_session(&id)
        .map(|_| Json(serde_json::json!({ "success": true })))
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)
}
