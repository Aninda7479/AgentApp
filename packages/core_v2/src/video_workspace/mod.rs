pub mod engine;
pub mod models;
pub mod types;

pub use engine::*;
pub use models::*;
pub use types::*;

use std::path::PathBuf;
use anyhow::{anyhow, Result};
use tracing::info;
use uuid::Uuid;

use crate::storage::video_storage::{VideoGenerationRecord, VideoStorage};

#[derive(Clone)]
pub struct VideoWorkspaceManager {
    pub engine: VideoEngineManager,
    pub models: VideoModelRegistry,
    pub storage: VideoStorage,
}

impl VideoWorkspaceManager {
    pub fn new() -> Self {
        Self {
            engine: VideoEngineManager::new(),
            models: VideoModelRegistry::new(),
            storage: VideoStorage::new(),
        }
    }

    pub fn with_dirs(engine_dir: PathBuf, models_dir: PathBuf, storage_dir: PathBuf) -> Self {
        Self {
            engine: VideoEngineManager::with_dir(engine_dir),
            models: VideoModelRegistry::with_dir(models_dir),
            storage: VideoStorage::with_dir(storage_dir),
        }
    }

    /// Perform video generation using the local engine synchronously
    pub async fn generate_local(&self, req: &GenerateVideoRequest) -> Result<GenerateVideoResponse> {
        if !self.engine.is_installed() {
            return Err(anyhow!(
                "Local video engine is not installed. Please set up the engine in Settings -> Local Video Model."
            ));
        }

        // Resolve model ID
        let model_id = req
            .model_id
            .clone()
            .unwrap_or_else(|| {
                let list = self.models.list_models();
                list.into_iter()
                    .find(|m| m.is_downloaded)
                    .map(|m| m.id)
                    .unwrap_or_else(|| "wan2.1-t2v-1.3b".to_string())
            });

        let model_path = self.models.get_model_path(&model_id).ok_or_else(|| {
            anyhow!(
                "Model '{}' is not downloaded. Please download it first in Settings -> Local Video Model.",
                model_id
            )
        })?;

        // Pre-flight memory verification
        let catalog = self.models.curated_catalog();
        let model_info = catalog.iter().find(|m| m.id == model_id);
        let mut sys = sysinfo::System::new_all();
        sys.refresh_memory();
        let available_ram_mb = sys.available_memory() / (1024 * 1024);

        if let Some(info) = model_info {
            let required_mb = info.vram_required_mb as u64;
            if available_ram_mb < required_mb.saturating_sub(2048) {
                let avail_gb = (available_ram_mb as f64) / 1024.0;
                let req_gb = (required_mb as f64) / 1024.0;
                return Err(anyhow!(
                    "Out of Memory: Model '{}' requires ~{:.1} GB of available memory, but only {:.1} GB is currently available. Please free up system memory or choose a lighter model.",
                    info.name, req_gb, avail_gb
                ));
            }
        }

        let id = format!("vid_{}", Uuid::new_v4());
        let video_filename = format!("{}.mp4", id);
        let thumb_filename = format!("{}.jpg", id);

        let temp_mp4 = std::env::temp_dir().join(format!("{}.mp4", Uuid::new_v4()));
        let temp_thumb = std::env::temp_dir().join(format!("{}.jpg", Uuid::new_v4()));

        let mut effective_req = req.clone();
        if let Some(ref cam) = req.camera_motion {
            effective_req.prompt = format!("{}, {}", req.prompt, cam.prompt_modifier());
        }

        let elapsed_ms = self
            .engine
            .execute_generation_streaming(&effective_req, &model_path, &temp_mp4, &temp_thumb, None)
            .await?;

        let video_bytes = std::fs::read(&temp_mp4)
            .map_err(|e| anyhow!("Failed to read generated video: {}", e))?;
        let _ = std::fs::remove_file(&temp_mp4);

        let thumb_bytes = std::fs::read(&temp_thumb).ok();
        if temp_thumb.exists() {
            let _ = std::fs::remove_file(&temp_thumb);
        }

        let num_frames = req.num_frames.unwrap_or(81);
        let fps = req.fps.unwrap_or(16);
        let duration_seconds = (num_frames as f32) / (fps as f32);
        let width = req.width.unwrap_or(720);
        let height = req.height.unwrap_or(480);
        let steps = req.steps.unwrap_or(30);
        let cfg_scale = req.cfg_scale.unwrap_or(6.0);
        let seed = req.seed.unwrap_or_else(|| rand::random::<i32>().abs() as i64);
        let created_at = chrono::Utc::now().timestamp_millis();

        let record = VideoGenerationRecord {
            id: id.clone(),
            created_at,
            prompt: req.prompt.clone(),
            negative_prompt: req.negative_prompt.clone(),
            model_id: model_id.clone(),
            source: "local".to_string(),
            width,
            height,
            num_frames,
            fps,
            duration_seconds,
            steps,
            cfg_scale,
            seed,
            motion_scale: req.motion_scale,
            camera_motion: req.camera_motion.as_ref().map(|c| format!("{:?}", c)),
            sampler: req.sampler.clone(),
            generation_time_ms: elapsed_ms,
            video_filename: video_filename.clone(),
            thumbnail_filename: thumb_filename.clone(),
        };

        self.storage
            .save_generation(&record, &video_bytes, thumb_bytes.as_deref())?;

        Ok(GenerateVideoResponse {
            success: true,
            id: id.clone(),
            video_url: format!("/api/videos/generations/{}/file", id),
            thumbnail_url: format!("/api/videos/generations/{}/thumbnail", id),
            prompt: req.prompt.clone(),
            negative_prompt: req.negative_prompt.clone(),
            model_id,
            source: "local".to_string(),
            width,
            height,
            num_frames,
            fps,
            duration_seconds,
            steps,
            cfg_scale,
            seed,
            generation_time_ms: elapsed_ms,
            created_at,
        })
    }

    /// Perform video generation with live step and phase streaming
    pub async fn generate_local_streaming(
        &self,
        req: &GenerateVideoRequest,
        progress_tx: tokio::sync::mpsc::Sender<VideoProgressEvent>,
    ) -> Result<GenerateVideoResponse> {
        if !self.engine.is_installed() {
            return Err(anyhow!(
                "Local video engine is not installed. Please set up the engine in Settings -> Local Video Model."
            ));
        }

        // Resolve model ID
        let model_id = req
            .model_id
            .clone()
            .unwrap_or_else(|| {
                let list = self.models.list_models();
                list.into_iter()
                    .find(|m| m.is_downloaded)
                    .map(|m| m.id)
                    .unwrap_or_else(|| "wan2.1-t2v-1.3b".to_string())
            });

        let model_path = self.models.get_model_path(&model_id).ok_or_else(|| {
            anyhow!(
                "Model '{}' is not downloaded. Please download it first in Settings -> Local Video Model.",
                model_id
            )
        })?;

        // Pre-flight memory verification
        let catalog = self.models.curated_catalog();
        let model_info = catalog.iter().find(|m| m.id == model_id);
        let mut sys = sysinfo::System::new_all();
        sys.refresh_memory();
        let available_ram_mb = sys.available_memory() / (1024 * 1024);

        if let Some(info) = model_info {
            let required_mb = info.vram_required_mb as u64;
            if available_ram_mb < required_mb.saturating_sub(2048) {
                let avail_gb = (available_ram_mb as f64) / 1024.0;
                let req_gb = (required_mb as f64) / 1024.0;
                return Err(anyhow!(
                    "Out of Memory: Model '{}' requires ~{:.1} GB of available memory, but only {:.1} GB is currently available. Please free up system memory or choose a lighter model.",
                    info.name, req_gb, avail_gb
                ));
            }
        }

        let id = format!("vid_{}", Uuid::new_v4());
        let video_filename = format!("{}.mp4", id);
        let thumb_filename = format!("{}.jpg", id);

        let temp_mp4 = std::env::temp_dir().join(format!("{}.mp4", Uuid::new_v4()));
        let temp_thumb = std::env::temp_dir().join(format!("{}.jpg", Uuid::new_v4()));

        let mut effective_req = req.clone();
        if let Some(ref cam) = req.camera_motion {
            effective_req.prompt = format!("{}, {}", req.prompt, cam.prompt_modifier());
        }

        info!(
            "Starting streaming local video generation (model: {}, prompt: '{}')",
            model_id, effective_req.prompt
        );

        let elapsed_ms = self
            .engine
            .execute_generation_streaming(&effective_req, &model_path, &temp_mp4, &temp_thumb, Some(progress_tx))
            .await?;

        let video_bytes = std::fs::read(&temp_mp4)
            .map_err(|e| anyhow!("Failed to read generated video: {}", e))?;
        let _ = std::fs::remove_file(&temp_mp4);

        let thumb_bytes = std::fs::read(&temp_thumb).ok();
        if temp_thumb.exists() {
            let _ = std::fs::remove_file(&temp_thumb);
        }

        let num_frames = req.num_frames.unwrap_or(81);
        let fps = req.fps.unwrap_or(16);
        let duration_seconds = (num_frames as f32) / (fps as f32);
        let width = req.width.unwrap_or(720);
        let height = req.height.unwrap_or(480);
        let steps = req.steps.unwrap_or(30);
        let cfg_scale = req.cfg_scale.unwrap_or(6.0);
        let seed = req.seed.unwrap_or_else(|| rand::random::<i32>().abs() as i64);
        let created_at = chrono::Utc::now().timestamp_millis();

        let record = VideoGenerationRecord {
            id: id.clone(),
            created_at,
            prompt: req.prompt.clone(),
            negative_prompt: req.negative_prompt.clone(),
            model_id: model_id.clone(),
            source: "local".to_string(),
            width,
            height,
            num_frames,
            fps,
            duration_seconds,
            steps,
            cfg_scale,
            seed,
            motion_scale: req.motion_scale,
            camera_motion: req.camera_motion.as_ref().map(|c| format!("{:?}", c)),
            sampler: req.sampler.clone(),
            generation_time_ms: elapsed_ms,
            video_filename: video_filename.clone(),
            thumbnail_filename: thumb_filename.clone(),
        };

        self.storage
            .save_generation(&record, &video_bytes, thumb_bytes.as_deref())?;

        Ok(GenerateVideoResponse {
            success: true,
            id: id.clone(),
            video_url: format!("/api/videos/generations/{}/file", id),
            thumbnail_url: format!("/api/videos/generations/{}/thumbnail", id),
            prompt: req.prompt.clone(),
            negative_prompt: req.negative_prompt.clone(),
            model_id,
            source: "local".to_string(),
            width,
            height,
            num_frames,
            fps,
            duration_seconds,
            steps,
            cfg_scale,
            seed,
            generation_time_ms: elapsed_ms,
            created_at,
        })
    }
}
