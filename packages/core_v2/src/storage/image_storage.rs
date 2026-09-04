use std::fs;
use std::path::PathBuf;

use anyhow::{anyhow, Result};
use serde::{Deserialize, Serialize};

use crate::storage::settings::get_superagent_dir;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GenerationRecord {
    pub id: String,
    pub created_at: i64,
    pub prompt: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub negative_prompt: Option<String>,
    pub model_id: String,
    pub source: String, // "local" | "cloud"
    pub width: u32,
    pub height: u32,
    pub steps: u32,
    pub cfg_scale: f32,
    pub seed: i64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub sampler: Option<String>,
    pub generation_time_ms: u64,
    pub image_filename: String,
}

pub fn resolve_images_dir(base_dir: Option<&PathBuf>) -> PathBuf {
    let base = match base_dir {
        Some(d) => d.clone(),
        None => get_superagent_dir(),
    };

    let dir = base.join("images").join("generations");
    if !dir.exists() {
        let _ = fs::create_dir_all(&dir);
    }
    dir
}

#[derive(Debug, Clone)]
pub struct ImageStorage {
    storage_dir: PathBuf,
}

impl ImageStorage {
    pub fn new() -> Self {
        Self::with_dir(resolve_images_dir(None))
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

    pub fn image_path(&self, filename: &str) -> PathBuf {
        let safe_filename = filename.replace(['/', '\\', ':', '*', '?', '"', '<', '>', '|'], "_");
        self.storage_dir.join(safe_filename)
    }

    pub fn list_generations(&self) -> Result<Vec<GenerationRecord>> {
        self.ensure_storage_dir()?;
        let mut list = Vec::new();

        if let Ok(entries) = fs::read_dir(&self.storage_dir) {
            for entry in entries.flatten() {
                let path = entry.path();
                if path.is_file() && path.extension().and_then(|e| e.to_str()) == Some("json") {
                    if let Ok(content) = fs::read_to_string(&path) {
                        if let Ok(record) = serde_json::from_str::<GenerationRecord>(&content) {
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

    pub fn get_generation(&self, id: &str) -> Result<GenerationRecord> {
        let path = self.record_path(id);
        if !path.exists() {
            return Err(anyhow!("Generation record not found: {}", id));
        }

        let content = fs::read_to_string(path)?;
        let record = serde_json::from_str::<GenerationRecord>(&content)?;
        Ok(record)
    }

    pub fn save_generation(&self, record: &GenerationRecord, image_bytes: &[u8]) -> Result<()> {
        self.ensure_storage_dir()?;
        let img_path = self.image_path(&record.image_filename);
        fs::write(img_path, image_bytes)?;
        self.save_record(record)?;
        Ok(())
    }

    pub fn save_record(&self, record: &GenerationRecord) -> Result<()> {
        self.ensure_storage_dir()?;
        let meta_path = self.record_path(&record.id);
        let json_str = serde_json::to_string_pretty(record)?;
        fs::write(meta_path, json_str)?;
        Ok(())
    }

    pub fn delete_generation(&self, id: &str) -> Result<()> {
        if let Ok(record) = self.get_generation(id) {
            let img_path = self.image_path(&record.image_filename);
            if img_path.exists() {
                let _ = fs::remove_file(img_path);
            }
        }
        let meta_path = self.record_path(id);
        if meta_path.exists() {
            fs::remove_file(meta_path)?;
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_image_storage_lifecycle() {
        let temp_dir = std::env::temp_dir().join(format!("test_img_storage_{}", uuid::Uuid::new_v4()));
        let _ = fs::create_dir_all(&temp_dir);
        let storage = ImageStorage::with_dir(temp_dir.clone());

        let record = GenerationRecord {
            id: "test-gen-1".to_string(),
            created_at: 1000,
            prompt: "A beautiful mountain lake at sunrise".to_string(),
            negative_prompt: Some("blurry, bad quality".to_string()),
            model_id: "flux-schnell".to_string(),
            source: "local".to_string(),
            width: 1024,
            height: 1024,
            steps: 4,
            cfg_scale: 1.0,
            seed: 42,
            sampler: Some("euler".to_string()),
            generation_time_ms: 3200,
            image_filename: "test-gen-1.png".to_string(),
        };

        // Save
        storage.save_generation(&record, b"fake_png_data").unwrap();

        // List
        let list = storage.list_generations().unwrap();
        assert_eq!(list.len(), 1);
        assert_eq!(list[0].id, "test-gen-1");
        assert_eq!(list[0].prompt, "A beautiful mountain lake at sunrise");

        // Load
        let loaded = storage.get_generation("test-gen-1").unwrap();
        assert_eq!(loaded.id, record.id);
        assert_eq!(loaded.seed, 42);

        // Delete
        storage.delete_generation("test-gen-1").unwrap();
        let list_after = storage.list_generations().unwrap();
        assert_eq!(list_after.len(), 0);

        let _ = fs::remove_dir_all(&temp_dir);
    }
}
