use std::time::Duration;

use axum::{
    body::Body,
    extract::{Path as AxumPath, State},
    http::{header, StatusCode},
    response::{
        sse::{Event, KeepAlive, Sse},
        Response,
    },
    Json,
};
use futures_util::stream::Stream;
use serde::Deserialize;

use crate::image_workspace::{
    EngineManager, EngineStatus, GenerateImageRequest, GenerateImageResponse, GpuBackend,
    HardwareProfile, ImageModelInfo, UpdateInfo,
};
use crate::server::state::AppState;
use crate::storage::image_storage::GenerationRecord;

#[derive(Debug, Deserialize)]
pub struct InstallEnginePayload {
    pub backend: Option<GpuBackend>,
}

#[derive(Debug, Deserialize)]
pub struct PullModelPayload {
    pub model_id: String,
}

// ─── Engine Routes ──────────────────────────────────────────────────────────

pub async fn get_engine_status(State(state): State<AppState>) -> Json<EngineStatus> {
    Json(state.image_workspace.engine.get_status())
}

pub async fn install_engine(
    State(state): State<AppState>,
    Json(payload): Json<Option<InstallEnginePayload>>,
) -> Result<Json<serde_json::Value>, StatusCode> {
    let backend = payload.and_then(|p| p.backend);
    state
        .image_workspace
        .engine
        .install(backend)
        .await
        .map(|_| Json(serde_json::json!({ "success": true, "message": "Engine installation started" })))
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)
}

pub async fn update_engine(
    State(state): State<AppState>,
) -> Result<Json<serde_json::Value>, StatusCode> {
    state
        .image_workspace
        .engine
        .install(None)
        .await
        .map(|_| Json(serde_json::json!({ "success": true, "message": "Engine update started" })))
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)
}

pub async fn rollback_engine(
    State(state): State<AppState>,
) -> Result<Json<serde_json::Value>, StatusCode> {
    state
        .image_workspace
        .engine
        .rollback()
        .map(|_| Json(serde_json::json!({ "success": true, "message": "Rolled back to previous version" })))
        .map_err(|_| StatusCode::BAD_REQUEST)
}

pub async fn uninstall_engine(
    State(state): State<AppState>,
) -> Result<Json<serde_json::Value>, StatusCode> {
    state
        .image_workspace
        .engine
        .uninstall()
        .map(|_| Json(serde_json::json!({ "success": true, "message": "Engine uninstalled" })))
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)
}

pub async fn check_engine_update(
    State(state): State<AppState>,
) -> Result<Json<Option<UpdateInfo>>, StatusCode> {
    state
        .image_workspace
        .engine
        .check_update()
        .await
        .map(Json)
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)
}

// ─── Hardware Routes ────────────────────────────────────────────────────────

pub async fn get_hardware_profile() -> Json<HardwareProfile> {
    Json(EngineManager::detect_hardware())
}

// ─── Model Routes ───────────────────────────────────────────────────────────

pub async fn list_image_models(State(state): State<AppState>) -> Json<Vec<ImageModelInfo>> {
    Json(state.image_workspace.models.list_models())
}

pub async fn pull_image_model(
    State(state): State<AppState>,
    Json(payload): Json<PullModelPayload>,
) -> Result<Json<serde_json::Value>, (StatusCode, Json<serde_json::Value>)> {
    state
        .image_workspace
        .models
        .pull_model(&payload.model_id)
        .await
        .map(|_| Json(serde_json::json!({ "success": true, "message": "Model download started" })))
        .map_err(|e| (StatusCode::BAD_REQUEST, Json(serde_json::json!({ "error": e.to_string(), "message": e.to_string() }))))
}

pub async fn delete_image_model(
    State(state): State<AppState>,
    AxumPath(id): AxumPath<String>,
) -> Result<Json<serde_json::Value>, StatusCode> {
    state
        .image_workspace
        .models
        .delete_model(&id)
        .map(|_| Json(serde_json::json!({ "success": true, "message": "Model deleted" })))
        .map_err(|_| StatusCode::BAD_REQUEST)
}

pub async fn open_models_dir(State(state): State<AppState>) -> Json<serde_json::Value> {
    let folder = state.image_workspace.models.models_dir().to_path_buf();
    let _ = std::fs::create_dir_all(&folder);
    #[cfg(target_os = "windows")]
    let _ = std::process::Command::new("explorer").arg(&folder).spawn();
    #[cfg(target_os = "macos")]
    let _ = std::process::Command::new("open").arg(&folder).spawn();
    #[cfg(target_os = "linux")]
    let _ = std::process::Command::new("xdg-open").arg(&folder).spawn();
    Json(serde_json::json!({ "success": true, "path": folder.to_string_lossy() }))
}

// ─── Generation Routes ──────────────────────────────────────────────────────

pub async fn generate_image(
    State(state): State<AppState>,
    Json(req): Json<GenerateImageRequest>,
) -> Result<Json<GenerateImageResponse>, (StatusCode, Json<serde_json::Value>)> {
    let mode = req.mode.as_deref().unwrap_or("auto");

    // Local or Auto mode
    if mode == "local" || (mode == "auto" && state.image_workspace.engine.is_installed()) {
        match state.image_workspace.generate_local(&req).await {
            Ok(resp) => return Ok(Json(resp)),
            Err(e) => {
                let err_str = e.to_string();
                let is_oom = err_str.to_lowercase().contains("out of memory") || err_str.to_lowercase().contains("memory");
                return Err((
                    StatusCode::INTERNAL_SERVER_ERROR,
                    Json(serde_json::json!({
                        "error": err_str,
                        "message": err_str,
                        "error_type": if is_oom { "out_of_memory" } else { "generation_failed" }
                    })),
                ));
            }
        }
    }

    // Local image engine or model not ready
    Err((
        StatusCode::BAD_REQUEST,
        Json(serde_json::json!({
            "error": "Local image engine is not ready. Please install the engine and download a model in Settings -> Local Image Model.",
            "message": "Local image engine is not ready. Please install the engine and download a model in Settings -> Local Image Model."
        })),
    ))
}

pub async fn generate_image_stream(
    State(state): State<AppState>,
    Json(req): Json<GenerateImageRequest>,
) -> Sse<impl Stream<Item = Result<Event, axum::Error>>> {
    let stream = async_stream::stream! {
        let mode = req.mode.as_deref().unwrap_or("auto");

        if mode == "local" || (mode == "auto" && state.image_workspace.engine.is_installed()) {
            let (tx, mut rx) = tokio::sync::mpsc::channel(100);

            let state_clone = state.clone();
            let req_clone = req.clone();

            let join_handle = tokio::spawn(async move {
                state_clone.image_workspace.generate_local_streaming(&req_clone, tx).await
            });

            while let Some(prog) = rx.recv().await {
                if let Ok(json_str) = serde_json::to_string(&prog) {
                    yield Ok(Event::default().event("progress").data(json_str));
                }
            }

            match join_handle.await {
                Ok(Ok(resp)) => {
                    if let Ok(json_str) = serde_json::to_string(&resp) {
                        yield Ok(Event::default().event("complete").data(json_str));
                    }
                }
                Ok(Err(e)) => {
                    let err_str = e.to_string();
                    let is_oom = err_str.to_lowercase().contains("out of memory") || err_str.to_lowercase().contains("memory");
                    let err_obj = serde_json::json!({
                        "message": err_str,
                        "error": err_str,
                        "error_type": if is_oom { "out_of_memory" } else { "generation_failed" }
                    });
                    if let Ok(json_str) = serde_json::to_string(&err_obj) {
                        yield Ok(Event::default().event("error").data(json_str));
                    }
                }
                Err(join_err) => {
                    let err_obj = serde_json::json!({
                        "message": format!("Generation task failed: {}", join_err),
                        "error": format!("Generation task failed: {}", join_err),
                        "error_type": "generation_failed"
                    });
                    if let Ok(json_str) = serde_json::to_string(&err_obj) {
                        yield Ok(Event::default().event("error").data(json_str));
                    }
                }
            }
        } else {
            let err_obj = serde_json::json!({
                "message": "Local image engine is not ready. Please install the engine and download a model in Settings -> Local Image Model.",
                "error": "Local image engine is not ready. Please install the engine and download a model in Settings -> Local Image Model.",
                "error_type": "engine_not_ready"
            });
            if let Ok(json_str) = serde_json::to_string(&err_obj) {
                yield Ok(Event::default().event("error").data(json_str));
            }
        }
    };

    Sse::new(stream).keep_alive(KeepAlive::new().interval(Duration::from_secs(15)))
}

pub async fn list_generations(
    State(state): State<AppState>,
) -> Result<Json<Vec<GenerationRecord>>, StatusCode> {
    state
        .image_workspace
        .storage
        .list_generations()
        .map(Json)
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)
}

pub async fn get_generation(
    State(state): State<AppState>,
    AxumPath(id): AxumPath<String>,
) -> Result<Json<GenerationRecord>, StatusCode> {
    state
        .image_workspace
        .storage
        .get_generation(&id)
        .map(Json)
        .map_err(|_| StatusCode::NOT_FOUND)
}

pub async fn get_generation_file(
    State(state): State<AppState>,
    AxumPath(id): AxumPath<String>,
) -> Result<Response, StatusCode> {
    let record = state
        .image_workspace
        .storage
        .get_generation(&id)
        .map_err(|_| StatusCode::NOT_FOUND)?;

    let path = state
        .image_workspace
        .storage
        .image_path(&record.image_filename);

    if !path.exists() {
        return Err(StatusCode::NOT_FOUND);
    }

    let bytes = std::fs::read(&path).map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    let response = Response::builder()
        .header(header::CONTENT_TYPE, "image/png")
        .header(header::CACHE_CONTROL, "public, max-age=31536000, immutable")
        .body(Body::from(bytes))
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    Ok(response)
}

pub async fn delete_generation(
    State(state): State<AppState>,
    AxumPath(id): AxumPath<String>,
) -> Result<Json<serde_json::Value>, StatusCode> {
    state
        .image_workspace
        .storage
        .delete_generation(&id)
        .map(|_| Json(serde_json::json!({ "success": true })))
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)
}
