use axum::{
    extract::{Path as AxumPath, State},
    http::StatusCode,
    Json,
};

use crate::server::state::AppState;
use crate::storage::pcb_storage::{PcbProject, PcbProjectMetadata};

pub async fn list_pcb_projects(
    State(state): State<AppState>,
) -> Result<Json<Vec<PcbProjectMetadata>>, StatusCode> {
    state
        .pcb_storage
        .list_projects()
        .map(Json)
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)
}

pub async fn get_pcb_project(
    State(state): State<AppState>,
    AxumPath(id): AxumPath<String>,
) -> Result<Json<PcbProject>, StatusCode> {
    state
        .pcb_storage
        .load_project(&id)
        .map(Json)
        .map_err(|_| StatusCode::NOT_FOUND)
}

pub async fn save_pcb_project(
    State(state): State<AppState>,
    Json(project): Json<PcbProject>,
) -> Result<Json<serde_json::Value>, StatusCode> {
    state
        .pcb_storage
        .save_project(&project)
        .map(|_| Json(serde_json::json!({ "success": true, "id": project.id })))
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)
}

pub async fn delete_pcb_project(
    State(state): State<AppState>,
    AxumPath(id): AxumPath<String>,
) -> Result<Json<serde_json::Value>, StatusCode> {
    state
        .pcb_storage
        .delete_project(&id)
        .map(|_| Json(serde_json::json!({ "success": true })))
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)
}
