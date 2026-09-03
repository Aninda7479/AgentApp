use std::time::Duration;

use axum::{
    body::Body,
    extract::{Path as AxumPath, State},
    http::{header, HeaderMap, StatusCode},
    response::{
        sse::{Event, KeepAlive, Sse},
        Response,
    },
    Json,
};

use futures_util::stream::Stream;
use serde::Deserialize;

use crate::server::state::AppState;
use crate::storage::video_storage::VideoGenerationRecord;
use crate::video_workspace::{
    FfmpegStatus, GpuBackend, HardwareProfile, VideoEngineManager, VideoEngineStatus, VideoExportRequest,
    VideoExportResponse, VideoModelInfo, VideoUpdateInfo,
};
use crate::video_workspace::types::{GenerateVideoRequest, GenerateVideoResponse};

#[derive(Debug, Deserialize)]
pub struct InstallVideoEnginePayload {
    pub backend: Option<GpuBackend>,
}

#[derive(Debug, Deserialize)]
pub struct PullVideoModelPayload {
    pub model_id: String,
}

// ─── Engine Routes ──────────────────────────────────────────────────────────

pub async fn get_video_engine_status(State(state): State<AppState>) -> Json<VideoEngineStatus> {
    Json(state.video_workspace.engine.get_status())
}

pub async fn install_video_engine(
    State(state): State<AppState>,
    Json(payload): Json<Option<InstallVideoEnginePayload>>,
) -> Result<Json<serde_json::Value>, StatusCode> {
    let backend = payload.and_then(|p| p.backend);
    state
        .video_workspace
        .engine
        .install(backend)
        .await
        .map(|_| Json(serde_json::json!({ "success": true, "message": "Video engine installation started" })))
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)
}

pub async fn update_video_engine(
    State(state): State<AppState>,
) -> Result<Json<serde_json::Value>, StatusCode> {
    state
        .video_workspace
        .engine
        .install(None)
        .await
        .map(|_| Json(serde_json::json!({ "success": true, "message": "Video engine update started" })))
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)
}

pub async fn rollback_video_engine(
    State(state): State<AppState>,
) -> Result<Json<serde_json::Value>, StatusCode> {
    state
        .video_workspace
        .engine
        .rollback()
        .map(|_| Json(serde_json::json!({ "success": true, "message": "Rolled back to previous version" })))
        .map_err(|_| StatusCode::BAD_REQUEST)
}

pub async fn uninstall_video_engine(
    State(state): State<AppState>,
) -> Result<Json<serde_json::Value>, StatusCode> {
    state
        .video_workspace
        .engine
        .uninstall()
        .map(|_| Json(serde_json::json!({ "success": true, "message": "Video engine uninstalled" })))
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)
}

pub async fn check_video_engine_update(
    State(state): State<AppState>,
) -> Result<Json<Option<VideoUpdateInfo>>, StatusCode> {
    state
        .video_workspace
        .engine
        .check_update()
        .await
        .map(Json)
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)
}

pub async fn provision_ffmpeg(
    State(state): State<AppState>,
) -> Result<Json<serde_json::Value>, (StatusCode, Json<serde_json::Value>)> {
    state
        .video_workspace
        .engine
        .trigger_provision_ffmpeg()
        .map(|_| Json(serde_json::json!({ "success": true, "message": "FFmpeg auto-provisioning initiated" })))
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, Json(serde_json::json!({ "error": e.to_string() }))))
}

pub async fn get_ffmpeg_status(
    State(state): State<AppState>,
) -> Json<FfmpegStatus> {
    Json(state.video_workspace.engine.get_ffmpeg_status())
}

// ─── Hardware Routes ────────────────────────────────────────────────────────

pub async fn get_video_hardware_profile() -> Json<HardwareProfile> {
    Json(VideoEngineManager::detect_hardware())
}

// ─── Model Routes ───────────────────────────────────────────────────────────

pub async fn list_video_models(State(state): State<AppState>) -> Json<Vec<VideoModelInfo>> {
    Json(state.video_workspace.models.list_models())
}

pub async fn pull_video_model(
    State(state): State<AppState>,
    Json(payload): Json<PullVideoModelPayload>,
) -> Result<Json<serde_json::Value>, (StatusCode, Json<serde_json::Value>)> {
    state
        .video_workspace
        .models
        .pull_model(&payload.model_id)
        .await
        .map(|_| Json(serde_json::json!({ "success": true, "message": "Video model download started" })))
        .map_err(|e| (StatusCode::BAD_REQUEST, Json(serde_json::json!({ "error": e.to_string(), "message": e.to_string() }))))
}

pub async fn delete_video_model(
    State(state): State<AppState>,
    AxumPath(id): AxumPath<String>,
) -> Result<Json<serde_json::Value>, StatusCode> {
    state
        .video_workspace
        .models
        .delete_model(&id)
        .map(|_| Json(serde_json::json!({ "success": true, "message": "Video model deleted" })))
        .map_err(|_| StatusCode::BAD_REQUEST)
}

pub async fn open_video_models_dir(State(state): State<AppState>) -> Json<serde_json::Value> {
    let folder = state.video_workspace.models.models_dir().to_path_buf();
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

pub async fn generate_video(
    State(state): State<AppState>,
    Json(req): Json<GenerateVideoRequest>,
) -> Result<Json<GenerateVideoResponse>, (StatusCode, Json<serde_json::Value>)> {
    let mode = req.mode.as_deref().unwrap_or("auto");

    if mode == "local" || (mode == "auto" && state.video_workspace.engine.is_installed()) {
        match state.video_workspace.generate_local(&req).await {
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

    Err((
        StatusCode::BAD_REQUEST,
        Json(serde_json::json!({
            "error": "Local video engine is not ready. Please install the engine and download a model in Settings -> Local Video Model.",
            "message": "Local video engine is not ready. Please install the engine and download a model in Settings -> Local Video Model."
        })),
    ))
}

pub async fn generate_video_stream(
    State(state): State<AppState>,
    Json(req): Json<GenerateVideoRequest>,
) -> Sse<impl Stream<Item = Result<Event, axum::Error>>> {
    let stream = async_stream::stream! {
        let mode = req.mode.as_deref().unwrap_or("auto");

        if mode == "local" || (mode == "auto" && state.video_workspace.engine.is_installed()) {
            let (tx, mut rx) = tokio::sync::mpsc::channel(100);

            let state_clone = state.clone();
            let req_clone = req.clone();

            let join_handle = tokio::spawn(async move {
                state_clone.video_workspace.generate_local_streaming(&req_clone, tx).await
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
                        "message": format!("Video generation task failed: {}", join_err),
                        "error": format!("Video generation task failed: {}", join_err),
                        "error_type": "generation_failed"
                    });
                    if let Ok(json_str) = serde_json::to_string(&err_obj) {
                        yield Ok(Event::default().event("error").data(json_str));
                    }
                }
            }
        } else {
            let err_obj = serde_json::json!({
                "message": "Local video engine is not ready. Please install the engine and download a model in Settings -> Local Video Model.",
                "error": "Local video engine is not ready. Please install the engine and download a model in Settings -> Local Video Model.",
                "error_type": "engine_not_ready"
            });
            if let Ok(json_str) = serde_json::to_string(&err_obj) {
                yield Ok(Event::default().event("error").data(json_str));
            }
        }
    };

    Sse::new(stream).keep_alive(KeepAlive::new().interval(Duration::from_secs(15)))
}

pub async fn list_video_generations(
    State(state): State<AppState>,
) -> Result<Json<Vec<VideoGenerationRecord>>, StatusCode> {
    state
        .video_workspace
        .storage
        .list_generations()
        .map(Json)
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)
}

pub async fn get_video_generation(
    State(state): State<AppState>,
    AxumPath(id): AxumPath<String>,
) -> Result<Json<VideoGenerationRecord>, StatusCode> {
    state
        .video_workspace
        .storage
        .get_generation(&id)
        .map(Json)
        .map_err(|_| StatusCode::NOT_FOUND)
}

pub async fn get_video_file(
    State(state): State<AppState>,
    AxumPath(id): AxumPath<String>,
    headers: HeaderMap,
) -> Result<Response, StatusCode> {
    let record = state
        .video_workspace
        .storage
        .get_generation(&id)
        .map_err(|_| StatusCode::NOT_FOUND)?;

    let path = state
        .video_workspace
        .storage
        .video_path(&record.video_filename);

    if !path.exists() {
        return Err(StatusCode::NOT_FOUND);
    }

    let bytes = std::fs::read(&path).map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    let total_len = bytes.len();

    // Check for HTTP Range header for streaming & frame seeking
    if let Some(range_val) = headers.get(header::RANGE).and_then(|v| v.to_str().ok()) {
        if let Some(range_spec) = range_val.strip_prefix("bytes=") {
            let parts: Vec<&str> = range_spec.split('-').collect();
            if !parts.is_empty() {
                let start: usize = parts[0].parse().unwrap_or(0);
                let end: usize = if parts.len() > 1 && !parts[1].is_empty() {
                    parts[1].parse().unwrap_or(total_len.saturating_sub(1)).min(total_len.saturating_sub(1))
                } else {
                    total_len.saturating_sub(1)
                };

                if start <= end && start < total_len {
                    let slice = &bytes[start..=end];
                    let content_range = format!("bytes {}-{}/{}", start, end, total_len);
                    let response = Response::builder()
                        .status(StatusCode::PARTIAL_CONTENT)
                        .header(header::CONTENT_TYPE, "video/mp4")
                        .header(header::ACCEPT_RANGES, "bytes")
                        .header(header::CONTENT_RANGE, content_range)
                        .header(header::CONTENT_LENGTH, slice.len().to_string())
                        .header(header::CACHE_CONTROL, "public, max-age=31536000, immutable")
                        .body(Body::from(slice.to_vec()))
                        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
                    return Ok(response);
                } else {
                    let response = Response::builder()
                        .status(StatusCode::RANGE_NOT_SATISFIABLE)
                        .header(header::CONTENT_RANGE, format!("bytes */{}", total_len))
                        .body(Body::empty())
                        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
                    return Ok(response);
                }
            }
        }
    }

    let response = Response::builder()
        .status(StatusCode::OK)
        .header(header::CONTENT_TYPE, "video/mp4")
        .header(header::ACCEPT_RANGES, "bytes")
        .header(header::CONTENT_LENGTH, total_len.to_string())
        .header(header::CACHE_CONTROL, "public, max-age=31536000, immutable")
        .body(Body::from(bytes))
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    Ok(response)
}


pub async fn get_video_thumbnail(
    State(state): State<AppState>,
    AxumPath(id): AxumPath<String>,
) -> Result<Response, StatusCode> {
    let record = state
        .video_workspace
        .storage
        .get_generation(&id)
        .map_err(|_| StatusCode::NOT_FOUND)?;

    let path = state
        .video_workspace
        .storage
        .thumbnail_path(&record.thumbnail_filename);

    if !path.exists() {
        return Err(StatusCode::NOT_FOUND);
    }

    let bytes = std::fs::read(&path).map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    let response = Response::builder()
        .header(header::CONTENT_TYPE, "image/jpeg")
        .header(header::CACHE_CONTROL, "public, max-age=31536000, immutable")
        .body(Body::from(bytes))
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    Ok(response)
}

pub async fn export_video_route(
    State(state): State<AppState>,
    AxumPath(id): AxumPath<String>,
    Json(req): Json<VideoExportRequest>,
) -> Result<Json<VideoExportResponse>, (StatusCode, Json<serde_json::Value>)> {
    let record = match state.video_workspace.storage.get_generation(&id) {
        Ok(r) => r,
        Err(_) => {
            return Err((
                StatusCode::NOT_FOUND,
                Json(serde_json::json!({ "error": "Video record not found" })),
            ));
        }
    };

    let source_path = state
        .video_workspace
        .storage
        .video_path(&record.video_filename);

    let ext = match req.format.to_lowercase().as_str() {
        "gif" => "gif",
        "webm" => "webm",
        "prores" => "mov",
        _ => "mp4",
    };

    let export_filename = format!("{}_export.{}", id, ext);
    let output_path = state
        .video_workspace
        .storage
        .video_path(&export_filename);

    match state
        .video_workspace
        .engine
        .export_video(&source_path, &output_path, &req)
        .await
    {
        Ok(size_bytes) => Ok(Json(VideoExportResponse {
            success: true,
            export_url: format!("/api/videos/generations/{}/file", id),
            filename: export_filename,
            size_bytes,
        })),
        Err(e) => Err((
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({ "error": e.to_string(), "message": e.to_string() })),
        )),
    }
}

pub async fn delete_video_generation(
    State(state): State<AppState>,
    AxumPath(id): AxumPath<String>,
) -> Result<Json<serde_json::Value>, StatusCode> {
    state
        .video_workspace
        .storage
        .delete_generation(&id)
        .map(|_| Json(serde_json::json!({ "success": true })))
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)
}

#[derive(Debug, Deserialize)]
pub struct EnhancePromptPayload {
    pub prompt: String,
}

#[derive(Debug, serde::Serialize)]
pub struct EnhancePromptResponse {
    pub success: bool,
    pub enhanced_prompt: String,
}

pub async fn enhance_video_prompt(
    State(state): State<AppState>,
    Json(payload): Json<EnhancePromptPayload>,
) -> Json<EnhancePromptResponse> {
    let raw = payload.prompt.trim();
    if raw.is_empty() {
        return Json(EnhancePromptResponse {
            success: true,
            enhanced_prompt: "Cinematic wide shot of a breathtaking landscape during golden hour, rich natural colors, atmospheric lighting, dynamic motion, ultra-detailed 8k resolution, 24fps".to_string(),
        });
    }

    let settings = state.settings_store.load_raw().unwrap_or_default();
    let (provider, model_id, api_key, base_url) =
        crate::server::routes::chat::resolve_active_workspace_model(&settings, &state.settings_store);


    let provider_instance = crate::providers::ProviderFactory::create(&provider);
    let config = crate::types::ModelConfig {
        provider,
        model_id,
        api_key,
        base_url,
        temperature: Some(0.7),
        max_tokens: Some(300),
    };

    let prompt_input = format!(
        "You are an expert AI video generation prompt engineer for Wan 2.1, Sora, and Veo.\nTake this short user description and expand it into a single rich, cinematic, highly detailed video diffusion prompt specifying subject action, dynamic movement, camera perspective, lighting, and textures.\nDescription: \"{}\"\nOutput ONLY the expanded prompt text, without any explanations, markdown, or quotation marks.",
        raw
    );
    let messages = vec![crate::types::ChatMessage::user(&prompt_input)];

    if let Ok(mut rx) = provider_instance.chat_stream(&config, &messages, &[]).await {
        let mut result = String::new();
        while let Some(event) = rx.recv().await {
            if let crate::types::AgentEvent::Token { text } = event {
                result.push_str(&text);
            }
        }
        let cleaned = result.trim().trim_matches('"').trim_matches('`').trim();
        if !cleaned.is_empty() && cleaned.len() > 15 {
            return Json(EnhancePromptResponse {
                success: true,
                enhanced_prompt: cleaned.to_string(),
            });
        }
    }

    // High quality cinematic fallback
    let cinematic_enhancers = [
        "Cinematic medium shot, dynamic organic motion, lifelike details, vibrant natural lighting, volumetric atmosphere, highly detailed textures, 8k resolution, photorealistic video diffusion, 24fps",
        "Cinematic slow-motion tracking shot, fluid subject motion, soft golden rim lighting, rich color grading, sharp focus on subject, photorealistic aesthetic, 24fps",
        "Close-up cinematic framing with natural movement, atmospheric depth, realistic shadows and specular highlights, 8k photorealistic quality, 24fps",
    ];
    let enhancer = cinematic_enhancers[rand::random::<usize>() % cinematic_enhancers.len()];
    let enhanced = format!("{}, {}", raw, enhancer);

    Json(EnhancePromptResponse {
        success: true,
        enhanced_prompt: enhanced,
    })
}


