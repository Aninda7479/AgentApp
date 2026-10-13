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

use crate::server::state::AppState;
use crate::storage::threed_storage::ThreeDGenerationRecord;
use crate::threed_workspace::{
    Generate3DRequest, Generate3DResponse, GpuBackend, ThreeDEngineStatus, ThreeDHardwareProfile,
    ThreeDModelInfo,
};

#[derive(Debug, Deserialize)]
pub struct InstallThreeDEnginePayload {
    pub backend: Option<GpuBackend>,
}

#[derive(Debug, Deserialize)]
pub struct PullThreeDModelPayload {
    pub model_id: String,
}

// ─── Engine & Hardware Routes ────────────────────────────────────────────────

pub async fn get_threed_engine_status(State(state): State<AppState>) -> Json<ThreeDEngineStatus> {
    Json(state.threed_workspace.engine.get_engine_status())
}

pub async fn install_threed_engine(
    State(_state): State<AppState>,
    Json(_payload): Json<Option<InstallThreeDEnginePayload>>,
) -> Result<Json<serde_json::Value>, StatusCode> {
    Ok(Json(serde_json::json!({
        "success": true,
        "message": "3D Procedural Spatial Kernel is installed and ready."
    })))
}

pub async fn get_threed_hardware_profile(
    State(state): State<AppState>,
) -> Json<ThreeDHardwareProfile> {
    Json(state.threed_workspace.engine.get_hardware_profile())
}

// ─── Models Routes ───────────────────────────────────────────────────────────

pub async fn list_threed_models(State(state): State<AppState>) -> Json<Vec<ThreeDModelInfo>> {
    Json(state.threed_workspace.models.list_models())
}

pub async fn pull_threed_model(
    State(_state): State<AppState>,
    Json(payload): Json<PullThreeDModelPayload>,
) -> Result<Json<serde_json::Value>, StatusCode> {
    Ok(Json(serde_json::json!({
        "success": true,
        "message": format!("Model '{}' configured and ready.", payload.model_id)
    })))
}

pub async fn open_threed_models_dir(
    State(state): State<AppState>,
) -> Result<Json<serde_json::Value>, StatusCode> {
    let path = state
        .threed_workspace
        .models
        .open_models_dir()
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    let path_str = path.to_string_lossy().to_string();

    #[cfg(target_os = "windows")]
    let _ = std::process::Command::new("explorer")
        .arg(&path_str)
        .spawn();
    #[cfg(target_os = "macos")]
    let _ = std::process::Command::new("open").arg(&path_str).spawn();
    #[cfg(target_os = "linux")]
    let _ = std::process::Command::new("xdg-open")
        .arg(&path_str)
        .spawn();

    Ok(Json(
        serde_json::json!({ "success": true, "path": path_str }),
    ))
}

pub async fn delete_threed_model(
    State(state): State<AppState>,
    AxumPath(id): AxumPath<String>,
) -> Result<Json<serde_json::Value>, StatusCode> {
    state
        .threed_workspace
        .models
        .delete_model(&id)
        .map(|_| Json(serde_json::json!({ "success": true })))
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)
}

// ─── Generation Routes ───────────────────────────────────────────────────────

pub async fn generate_threed(
    State(state): State<AppState>,
    Json(req): Json<Generate3DRequest>,
) -> Result<Json<Generate3DResponse>, StatusCode> {
    let api_key = match req.model_id.as_deref() {
        Some(m) if m.contains("tripo") => {
            state.settings_store.get_api_key("tripo3d").ok().flatten()
        }
        Some(m) if m.contains("meshy") => state.settings_store.get_api_key("meshy").ok().flatten(),
        _ => None,
    };

    state
        .threed_workspace
        .generate(&req, api_key)
        .await
        .map(Json)
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)
}

pub async fn generate_threed_stream(
    State(state): State<AppState>,
    Json(req): Json<Generate3DRequest>,
) -> Sse<impl Stream<Item = Result<Event, std::convert::Infallible>>> {
    let threed_mgr = state.threed_workspace.clone();
    let api_key = match req.model_id.as_deref() {
        Some(m) if m.contains("tripo") => {
            state.settings_store.get_api_key("tripo3d").ok().flatten()
        }
        Some(m) if m.contains("meshy") => state.settings_store.get_api_key("meshy").ok().flatten(),
        _ => None,
    };

    let stream = async_stream::stream! {
        // Step 1: Prompt & Spatial Parsing
        let init_event = serde_json::json!({
            "stage": "parsing_prompt",
            "step": 1,
            "total_steps": 4,
            "percentage": 25.0,
            "message": "Analyzing prompt and spatial parameters..."
        });
        yield Ok(Event::default().event("progress").data(init_event.to_string()));

        tokio::time::sleep(Duration::from_millis(150)).await;

        // Step 2: Geometry & Layout Computation
        let geom_event = serde_json::json!({
            "stage": "synthesizing_geometry",
            "step": 2,
            "total_steps": 4,
            "percentage": 50.0,
            "message": "Constructing mesh primitives and spatial layout..."
        });
        yield Ok(Event::default().event("progress").data(geom_event.to_string()));

        // Step 3: Material & PBR Compilation
        let pbr_event = serde_json::json!({
            "stage": "compiling_materials",
            "step": 3,
            "total_steps": 4,
            "percentage": 75.0,
            "message": "Synthesizing PBR shaders and texture coordinates..."
        });
        yield Ok(Event::default().event("progress").data(pbr_event.to_string()));

        // Step 4: Asset generation
        match threed_mgr.generate(&req, api_key).await {
            Ok(resp) => {
                let complete_event = serde_json::json!({
                    "stage": "complete",
                    "step": 4,
                    "total_steps": 4,
                    "percentage": 100.0,
                    "message": "3D asset ready",
                    "result": resp
                });
                yield Ok(Event::default().event("complete").data(complete_event.to_string()));
            }
            Err(e) => {
                let err_event = serde_json::json!({
                    "stage": "error",
                    "error": e.to_string(),
                    "message": format!("Generation failed: {}", e)
                });
                yield Ok(Event::default().event("error").data(err_event.to_string()));
            }
        }
    };

    Sse::new(stream).keep_alive(KeepAlive::new().interval(Duration::from_secs(15)))
}

// ─── Generation History & Storage Routes ─────────────────────────────────────

pub async fn list_threed_generations(
    State(state): State<AppState>,
) -> Result<Json<Vec<ThreeDGenerationRecord>>, StatusCode> {
    state
        .threed_workspace
        .list_generations()
        .map(Json)
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)
}

pub async fn get_threed_generation(
    State(state): State<AppState>,
    AxumPath(id): AxumPath<String>,
) -> Result<Json<ThreeDGenerationRecord>, StatusCode> {
    state
        .threed_workspace
        .get_generation(&id)
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?
        .map(Json)
        .ok_or(StatusCode::NOT_FOUND)
}

pub async fn get_threed_generation_file(
    State(state): State<AppState>,
    AxumPath(id): AxumPath<String>,
) -> Result<Response, StatusCode> {
    let result = state
        .threed_workspace
        .get_generation_file_bytes(&id)
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    match result {
        Some((bytes, mime)) => {
            let response = Response::builder()
                .header(header::CONTENT_TYPE, mime)
                .header(header::CACHE_CONTROL, "public, max-age=31536000, immutable")
                .body(Body::from(bytes))
                .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
            Ok(response)
        }
        None => Err(StatusCode::NOT_FOUND),
    }
}

pub async fn delete_threed_generation(
    State(state): State<AppState>,
    AxumPath(id): AxumPath<String>,
) -> Result<Json<serde_json::Value>, StatusCode> {
    state
        .threed_workspace
        .delete_generation(&id)
        .map(|success| Json(serde_json::json!({ "success": success })))
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)
}
