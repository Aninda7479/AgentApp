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

use crate::storage::image_storage::{GenerationRecord, ImageStorage};

#[derive(Clone)]
pub struct ImageWorkspaceManager {
    pub engine: EngineManager,
    pub models: ModelRegistry,
    pub storage: ImageStorage,
}

impl ImageWorkspaceManager {
    pub fn new() -> Self {
        Self {
            engine: EngineManager::new(),
            models: ModelRegistry::new(),
            storage: ImageStorage::new(),
        }
    }

    pub fn with_dirs(engine_dir: PathBuf, models_dir: PathBuf, storage_dir: PathBuf) -> Self {
        Self {
            engine: EngineManager::with_dir(engine_dir),
            models: ModelRegistry::with_dir(models_dir),
            storage: ImageStorage::with_dir(storage_dir),
        }
    }

    /// Perform image generation using the local engine
    pub async fn generate_local(&self, req: &GenerateImageRequest) -> Result<GenerateImageResponse> {
        if !self.engine.is_installed() {
            return Err(anyhow!(
                "Local image engine is not installed. Please set up the engine in Settings -> Local Image Model."
            ));
        }

        // Resolve model ID
        let model_id = req
            .model_id
            .clone()
            .unwrap_or_else(|| {
                // Find first downloaded model or default to flux-schnell
                let list = self.models.list_models();
                list.into_iter()
                    .find(|m| m.is_downloaded)
                    .map(|m| m.id)
                    .unwrap_or_else(|| "flux-schnell".to_string())
            });

        let model_path = self.models.get_model_path(&model_id).ok_or_else(|| {
            anyhow!(
                "Model '{}' is not downloaded. Please download it first in Settings -> Local Image Model.",
                model_id
            )
        })?;

        // Pre-flight memory verification
        let catalog = self.models.curated_catalog();
        let model_info = catalog.iter().find(|m| m.id == model_id);
        let mut sys = sysinfo::System::new_all();
        sys.refresh_memory();
        let total_ram_mb = sys.total_memory() / (1024 * 1024);
        let available_ram_mb = sys.available_memory() / (1024 * 1024);
        let used_ram_mb = total_ram_mb.saturating_sub(available_ram_mb);

        let is_flux = model_id.contains("flux") || model_info.map(|m| m.family == ModelFamily::Flux).unwrap_or(false);
        let is_sdxl = model_id.contains("sdxl") || model_id.contains("sd35") || model_info.map(|m| m.family == ModelFamily::Sdxl || m.family == ModelFamily::Sd35).unwrap_or(false);

        if is_flux && available_ram_mb < 7168 {
            let avail_gb = (available_ram_mb as f64) / 1024.0;
            let used_gb = (used_ram_mb as f64) / 1024.0;
            return Err(anyhow!(
                "Out of Memory: FLUX.1 requires ~9 GB of available RAM/VRAM, but only {:.1} GB is currently available ({:.1} GB is in use by system and other applications). Please close memory-heavy applications to free up RAM, or switch to Stable Diffusion 1.5.",
                avail_gb, used_gb
            ));
        } else if is_sdxl && available_ram_mb < 2560 {
            let avail_gb = (available_ram_mb as f64) / 1024.0;
            let used_gb = (used_ram_mb as f64) / 1024.0;
            return Err(anyhow!(
                "Out of Memory: SDXL requires ~4 GB of available RAM/VRAM, but only {:.1} GB is currently available ({:.1} GB in use). Please close unused applications or switch to Stable Diffusion 1.5.",
                avail_gb, used_gb
            ));
        }

        let id = format!("img_{}", Uuid::new_v4());
        let filename = format!("{}.png", id);
        let temp_output = std::env::temp_dir().join(format!("{}.png", Uuid::new_v4()));

        info!(
            "Starting local image generation (model: {}, prompt: '{}')",
            model_id, req.prompt
        );

        let elapsed_ms = self
            .engine
            .execute_generation(req, &model_path, &temp_output)?;

        let bytes = std::fs::read(&temp_output)
            .map_err(|e| anyhow!("Failed to read generated image: {}", e))?;
        let _ = std::fs::remove_file(&temp_output);

        let seed = req.seed.unwrap_or_else(|| rand::random::<i32>().abs() as i64);
        let created_at = chrono::Utc::now().timestamp_millis();
        let width = req.width.unwrap_or(1024);
        let height = req.height.unwrap_or(1024);
        let steps = req.steps.unwrap_or(20);
        let cfg_scale = req.cfg_scale.unwrap_or(7.0);

        let record = GenerationRecord {
            id: id.clone(),
            created_at,
            prompt: req.prompt.clone(),
            negative_prompt: req.negative_prompt.clone(),
            model_id: model_id.clone(),
            source: "local".to_string(),
            width,
            height,
            steps,
            cfg_scale,
            seed,
            sampler: req.sampler.clone(),
            generation_time_ms: elapsed_ms,
            image_filename: filename.clone(),
        };

        self.storage.save_generation(&record, &bytes)?;

        Ok(GenerateImageResponse {
            success: true,
            id: id.clone(),
            image_url: format!("/api/images/generations/{}/file", id),
            prompt: req.prompt.clone(),
            negative_prompt: req.negative_prompt.clone(),
            model_id,
            source: "local".to_string(),
            width,
            height,
            steps,
            cfg_scale,
            seed,
            generation_time_ms: elapsed_ms,
            created_at,
        })
    }
}
