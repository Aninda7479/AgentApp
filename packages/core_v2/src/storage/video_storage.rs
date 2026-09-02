use std::fs;
use std::path::PathBuf;

use anyhow::{anyhow, Result};
use serde::{Deserialize, Serialize};

use crate::storage::settings::get_superagent_dir;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VideoGenerationRecord {
    pub id: String,
    pub created_at: i64,
    pub prompt: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub negative_prompt: Option<String>,
    pub model_id: String,
    pub source: String, // "local" | "cloud"
    pub width: u32,
    pub height: u32,
    pub num_frames: u32,
    pub fps: u32,
    pub duration_seconds: f32,
    pub steps: u32,
    pub cfg_scale: f32,
    pub seed: i64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub motion_scale: Option<f32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub camera_motion: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub sampler: Option<String>,
    pub generation_time_ms: u64,
    pub video_filename: String,
    pub thumbnail_filename: String,
}

pub fn resolve_videos_dir(base_dir: Option<&PathBuf>) -> PathBuf {
    let base = match base_dir {
        Some(d) => d.clone(),
        None => get_superagent_dir(),
    };

    let dir = base.join("videos").join("generations");
    if !dir.exists() {
        let _ = fs::create_dir_all(&dir);
    }
    dir
}

#[derive(Debug, Clone)]
pub struct VideoStorage {
    storage_dir: PathBuf,
}

impl VideoStorage {
    pub fn new() -> Self {
        Self::with_dir(resolve_videos_dir(None))
    }

    pub fn with_dir(storage_dir: PathBuf) -> Self {
        if !storage_dir.exists() {
            let _ = fs::create_dir_all(&storage_dir);
        }
        Self { storage_dir }
    }

    pub fn get_storage_dir(&self) -> &PathBuf {
        &self.storage_dir
    }

    fn ensure_storage_dir(&self) -> Result<()> {
        if !self.storage_dir.exists() {
            fs::create_dir_all(&self.storage_dir)?;
        }
        Ok(())
    }

    fn record_path(&self, id: &str) -> PathBuf {
        let safe_id = id.replace(['/', '\\', ':', '*', '?', '"', '<', '>', '|'], "_");
        self.storage_dir.join(format!("{}.json", safe_id))
    }

    pub fn video_path(&self, filename: &str) -> PathBuf {
        let safe_filename = filename.replace(['/', '\\', ':', '*', '?', '"', '<', '>', '|'], "_");
        self.storage_dir.join(safe_filename)
    }

    pub fn thumbnail_path(&self, filename: &str) -> PathBuf {
        let safe_filename = filename.replace(['/', '\\', ':', '*', '?', '"', '<', '>', '|'], "_");
        self.storage_dir.join(safe_filename)
    }

    pub fn list_generations(&self) -> Result<Vec<VideoGenerationRecord>> {
        self.ensure_storage_dir()?;
        let mut list = Vec::new();

        if let Ok(entries) = fs::read_dir(&self.storage_dir) {
            for entry in entries.flatten() {
                let path = entry.path();
                if path.is_file() && path.extension().and_then(|e| e.to_str()) == Some("json") {
                    if let Ok(content) = fs::read_to_string(&path) {
                        if let Ok(record) = serde_json::from_str::<VideoGenerationRecord>(&content) {
                            list.push(record);
                        }
                    }
                }
            }
        }

        // Sort newest first
        list.sort_by(|a, b| b.created_at.cmp(&a.created_at));
        Ok(list)
    }

    pub fn get_generation(&self, id: &str) -> Result<VideoGenerationRecord> {
        let path = self.record_path(id);
        if !path.exists() {
            return Err(anyhow!("Video generation not found: {}", id));
        }

        let content = fs::read_to_string(&path)?;
        let record = serde_json::from_str::<VideoGenerationRecord>(&content)?;
        Ok(record)
    }

    pub fn save_generation(
        &self,
        record: &VideoGenerationRecord,
        video_bytes: &[u8],
        thumbnail_bytes: Option<&[u8]>,
    ) -> Result<()> {
        self.ensure_storage_dir()?;

        let vid_path = self.video_path(&record.video_filename);
        fs::write(&vid_path, video_bytes)?;

        if let Some(thumb) = thumbnail_bytes {
            let thumb_path = self.thumbnail_path(&record.thumbnail_filename);
            let _ = fs::write(&thumb_path, thumb);
        }

        let meta_path = self.record_path(&record.id);
        let content = serde_json::to_string_pretty(record)?;
        fs::write(&meta_path, content)?;

        Ok(())
    }

    pub fn delete_generation(&self, id: &str) -> Result<()> {
        if let Ok(record) = self.get_generation(id) {
            let vid_path = self.video_path(&record.video_filename);
            let _ = fs::remove_file(vid_path);

            let thumb_path = self.thumbnail_path(&record.thumbnail_filename);
            let _ = fs::remove_file(thumb_path);
        }

        let meta_path = self.record_path(id);
        if meta_path.exists() {
            fs::remove_file(meta_path)?;
        }

        Ok(())
    }
}
