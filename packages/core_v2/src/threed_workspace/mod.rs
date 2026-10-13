pub mod engine;
pub mod models;
pub mod types;

pub use engine::*;
pub use models::*;
pub use types::*;

use anyhow::Result;
use std::fs;
use std::path::PathBuf;
use tracing::info;
use uuid::Uuid;

use crate::storage::threed_storage::{ThreeDGenerationRecord, ThreeDStorage};

#[derive(Clone)]
pub struct ThreeDWorkspaceManager {
    pub engine: ThreeDEngineManager,
    pub models: ThreeDModelRegistry,
    pub storage: ThreeDStorage,
}

impl ThreeDWorkspaceManager {
    pub fn new() -> Self {
        Self {
            engine: ThreeDEngineManager::new(),
            models: ThreeDModelRegistry::new(),
            storage: ThreeDStorage::new(),
        }
    }

    pub fn with_dirs(engine_dir: PathBuf, models_dir: PathBuf, storage_dir: PathBuf) -> Self {
        Self {
            engine: ThreeDEngineManager::with_dir(engine_dir),
            models: ThreeDModelRegistry::with_dir(models_dir),
            storage: ThreeDStorage::with_dir(storage_dir),
        }
    }

    /// Perform 3D generation and persist the resulting asset & metadata
    pub async fn generate(
        &self,
        req: &Generate3DRequest,
        api_key: Option<String>,
    ) -> Result<Generate3DResponse> {
        let start = std::time::Instant::now();
        let id = format!("model_{}", Uuid::new_v4());

        // Resolve model ID
        let model_id = req
            .model_id
            .clone()
            .unwrap_or_else(|| "procedural-world-v1".to_string());

        // Generate asset bytes
        let (file_bytes, poly_count, vertex_count, format) =
            self.engine.generate(req, api_key).await?;

        let file_name = format!("{}.{}", id, format.extension());
        let generation_time_ms = start.elapsed().as_millis() as u64;
        let created_at = chrono::Utc::now().timestamp_millis();

        let source = if model_id.contains("api") {
            "cloud".to_string()
        } else {
            "local".to_string()
        };

        let record = ThreeDGenerationRecord {
            id: id.clone(),
            created_at,
            prompt: req.prompt.clone(),
            negative_prompt: req.negative_prompt.clone(),
            model_id: model_id.clone(),
            source: source.clone(),
            format,
            poly_count: Some(poly_count),
            vertex_count: Some(vertex_count),
            generation_time_ms,
            file_name: file_name.clone(),
            thumbnail_name: None,
            metadata: serde_json::json!({
                "geometry_style": req.geometry_style,
                "poly_budget": req.poly_budget,
                "texture_resolution": req.texture_resolution,
            }),
        };

        // Persist to storage
        self.storage.save_generation(&record, &file_bytes, None)?;

        info!(
            "3D Model '{}' generated successfully ({} polys, {} vertices in {}ms)",
            id, poly_count, vertex_count, generation_time_ms
        );

        let model_url = format!("/api/threed/generations/{}/file", id);

        Ok(Generate3DResponse {
            success: true,
            id,
            model_url,
            thumbnail_url: None,
            prompt: req.prompt.clone(),
            model_id,
            source,
            format,
            poly_count: Some(poly_count),
            vertex_count: Some(vertex_count),
            generation_time_ms,
            created_at,
            metadata: record.metadata,
        })
    }

    pub fn list_generations(&self) -> Result<Vec<ThreeDGenerationRecord>> {
        self.storage.list_generations()
    }

    pub fn get_generation(&self, id: &str) -> Result<Option<ThreeDGenerationRecord>> {
        self.storage.get_generation(id)
    }

    pub fn delete_generation(&self, id: &str) -> Result<bool> {
        self.storage.delete_generation(id)
    }

    pub fn get_generation_file_bytes(&self, id: &str) -> Result<Option<(Vec<u8>, String)>> {
        let rec = self.get_generation(id)?;
        match rec {
            Some(record) => {
                let path = self.storage.file_path(&record.file_name);
                if path.exists() {
                    let bytes = fs::read(&path)?;
                    let mime = record.format.mime_type().to_string();
                    Ok(Some((bytes, mime)))
                } else {
                    Ok(None)
                }
            }
            None => Ok(None),
        }
    }
}
