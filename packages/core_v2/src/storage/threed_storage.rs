use std::fs;
use std::path::PathBuf;

use anyhow::{anyhow, Result};
use serde::{Deserialize, Serialize};

use crate::storage::settings::get_superagent_dir;
use crate::threed_workspace::types::ThreeDOutputFormat;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ThreeDGenerationRecord {
    pub id: String,
    pub created_at: i64,
    pub prompt: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub negative_prompt: Option<String>,
    pub model_id: String,
    pub source: String, // "local" | "cloud"
    pub format: ThreeDOutputFormat,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub poly_count: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub vertex_count: Option<u64>,
    pub generation_time_ms: u64,
    pub file_name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub thumbnail_name: Option<String>,
    #[serde(default)]
    pub metadata: serde_json::Value,
}

pub fn resolve_threed_dir(base_dir: Option<&PathBuf>) -> PathBuf {
    let base = match base_dir {
        Some(d) => d.clone(),
        None => get_superagent_dir(),
    };

    let dir = base.join("threed").join("generations");
    if !dir.exists() {
        let _ = fs::create_dir_all(&dir);
    }
    dir
}

#[derive(Debug, Clone)]
pub struct ThreeDStorage {
    storage_dir: PathBuf,
}

impl ThreeDStorage {
    pub fn new() -> Self {
        Self::with_dir(resolve_threed_dir(None))
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

    pub fn file_path(&self, filename: &str) -> PathBuf {
        let safe_filename = filename.replace(['/', '\\', ':', '*', '?', '"', '<', '>', '|'], "_");
        self.storage_dir.join(safe_filename)
    }

    pub fn list_generations(&self) -> Result<Vec<ThreeDGenerationRecord>> {
        self.ensure_storage_dir()?;
        let mut list = Vec::new();

        if let Ok(entries) = fs::read_dir(&self.storage_dir) {
            for entry in entries.flatten() {
                let path = entry.path();
                if path.is_file() && path.extension().and_then(|e| e.to_str()) == Some("json") {
                    if let Ok(content) = fs::read_to_string(&path) {
                        if let Ok(record) = serde_json::from_str::<ThreeDGenerationRecord>(&content)
                        {
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

    pub fn get_generation(&self, id: &str) -> Result<Option<ThreeDGenerationRecord>> {
        let path = self.record_path(id);
        if !path.exists() {
            return Ok(None);
        }

        let content = fs::read_to_string(&path)
            .map_err(|e| anyhow!("Failed to read generation metadata {}: {}", id, e))?;
        let record = serde_json::from_str::<ThreeDGenerationRecord>(&content)
            .map_err(|e| anyhow!("Corrupted generation record {}: {}", id, e))?;

        Ok(Some(record))
    }

    pub fn save_generation(
        &self,
        record: &ThreeDGenerationRecord,
        file_bytes: &[u8],
        thumbnail_bytes: Option<&[u8]>,
    ) -> Result<()> {
        self.ensure_storage_dir()?;

        // Save 3D file
        let file_path = self.file_path(&record.file_name);
        fs::write(&file_path, file_bytes)
            .map_err(|e| anyhow!("Failed to write 3D asset file: {}", e))?;

        // Save optional thumbnail
        if let (Some(thumb_name), Some(thumb_bytes)) = (&record.thumbnail_name, thumbnail_bytes) {
            let thumb_path = self.file_path(thumb_name);
            let _ = fs::write(&thumb_path, thumb_bytes);
        }

        // Save metadata record
        let record_path = self.record_path(&record.id);
        let json = serde_json::to_string_pretty(record)?;
        fs::write(&record_path, json)
            .map_err(|e| anyhow!("Failed to write generation record JSON: {}", e))?;

        Ok(())
    }

    pub fn delete_generation(&self, id: &str) -> Result<bool> {
        let rec = self.get_generation(id)?;
        let record = match rec {
            Some(r) => r,
            None => return Ok(false),
        };

        // Remove 3D asset file
        let file_path = self.file_path(&record.file_name);
        if file_path.exists() {
            let _ = fs::remove_file(file_path);
        }

        // Remove thumbnail
        if let Some(thumb_name) = &record.thumbnail_name {
            let thumb_path = self.file_path(thumb_name);
            if thumb_path.exists() {
                let _ = fs::remove_file(thumb_path);
            }
        }

        // Remove record JSON
        let rec_path = self.record_path(id);
        if rec_path.exists() {
            let _ = fs::remove_file(rec_path);
        }

        Ok(true)
    }
}
