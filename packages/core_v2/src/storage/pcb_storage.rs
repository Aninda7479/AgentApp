use std::fs;
use std::path::PathBuf;

use anyhow::{anyhow, Result};
use serde::{Deserialize, Serialize};

use crate::storage::settings::get_superagent_dir;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct PcbProject {
    pub id: String,
    pub name: String,
    #[serde(default = "default_revision")]
    pub revision: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    pub created_at: i64,
    pub updated_at: i64,
    pub graph: serde_json::Value,
    #[serde(default)]
    pub messages: Vec<serde_json::Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub settings: Option<serde_json::Value>,
    #[serde(default)]
    pub tags: Vec<String>,
}

fn default_revision() -> String {
    "v0.1".to_string()
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct PcbProjectMetadata {
    pub id: String,
    pub name: String,
    pub revision: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    pub created_at: i64,
    pub updated_at: i64,
    pub components_count: usize,
    pub nets_count: usize,
    pub message_count: usize,
    pub tags: Vec<String>,
}

impl From<&PcbProject> for PcbProjectMetadata {
    fn from(project: &PcbProject) -> Self {
        let components_count = project
            .graph
            .get("components")
            .and_then(|c| c.as_array())
            .map(|a| a.len())
            .unwrap_or(0);

        let nets_count = project
            .graph
            .get("nets")
            .and_then(|n| n.as_array())
            .map(|a| a.len())
            .unwrap_or(0);

        Self {
            id: project.id.clone(),
            name: project.name.clone(),
            revision: project.revision.clone(),
            description: project.description.clone(),
            created_at: project.created_at,
            updated_at: project.updated_at,
            components_count,
            nets_count,
            message_count: project.messages.len(),
            tags: project.tags.clone(),
        }
    }
}

pub fn resolve_pcb_dir(base_dir: Option<&PathBuf>) -> PathBuf {
    let base = match base_dir {
        Some(d) => d.clone(),
        None => get_superagent_dir(),
    };

    let candidates = [
        base.join("pcb"),
        PathBuf::from(".").join(".superagent").join("pcb"),
    ];

    for c in &candidates {
        if c.exists() {
            return c.clone();
        }
    }

    base.join("pcb")
}

#[derive(Debug, Clone)]
pub struct PcbStorage {
    storage_dir: PathBuf,
}

impl PcbStorage {
    pub fn new() -> Self {
        Self::with_dir(resolve_pcb_dir(None))
    }

    pub fn with_dir(storage_dir: PathBuf) -> Self {
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

    fn project_file_path(&self, id: &str) -> PathBuf {
        let safe_id = id.replace(['/', '\\', ':', '*', '?', '"', '<', '>', '|'], "_");
        self.storage_dir.join(format!("{}.json", safe_id))
    }

    pub fn list_projects(&self) -> Result<Vec<PcbProjectMetadata>> {
        self.ensure_storage_dir()?;
        let mut list = Vec::new();

        for entry in fs::read_dir(&self.storage_dir)? {
            let entry = entry?;
            let path = entry.path();
            if path.is_file() && path.extension().and_then(|e| e.to_str()) == Some("json") {
                if let Ok(content) = fs::read_to_string(&path) {
                    if let Ok(project) = serde_json::from_str::<PcbProject>(&content) {
                        list.push(PcbProjectMetadata::from(&project));
                    }
                }
            }
        }

        // Sort newest updated first
        list.sort_by(|a, b| b.updated_at.cmp(&a.updated_at));
        Ok(list)
    }

    pub fn load_project(&self, id: &str) -> Result<PcbProject> {
        let path = self.project_file_path(id);
        if !path.exists() {
            return Err(anyhow!("PCB project not found: {}", id));
        }

        let content = fs::read_to_string(path)?;
        let project = serde_json::from_str::<PcbProject>(&content)?;
        Ok(project)
    }

    pub fn save_project(&self, project: &PcbProject) -> Result<()> {
        self.ensure_storage_dir()?;
        let path = self.project_file_path(&project.id);
        let json_str = serde_json::to_string_pretty(project)?;
        fs::write(path, json_str)?;
        Ok(())
    }

    pub fn delete_project(&self, id: &str) -> Result<()> {
        let path = self.project_file_path(id);
        if path.exists() {
            fs::remove_file(path)?;
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_pcb_storage_lifecycle() {
        let temp_dir = std::env::temp_dir().join(format!("test_pcb_storage_{}", uuid::Uuid::new_v4()));
        let _ = fs::create_dir_all(&temp_dir);
        let storage = PcbStorage::with_dir(temp_dir.clone());

        let project = PcbProject {
            id: "test-proj-1".to_string(),
            name: "Smart Thermostat Board".to_string(),
            revision: "v1.0".to_string(),
            description: Some("ESP32-S3 IoT PCB".to_string()),
            created_at: 1000,
            updated_at: 2000,
            graph: serde_json::json!({
                "metadata": { "name": "Smart Thermostat" },
                "components": [
                    { "id": "U1", "name": "ESP32-S3" },
                    { "id": "R1", "name": "10k Resistor" }
                ],
                "nets": [
                    { "id": "GND", "name": "GND" }
                ]
            }),
            messages: vec![
                serde_json::json!({ "id": "m1", "sender": "user", "text": "Add ESP32" }),
                serde_json::json!({ "id": "m2", "sender": "agent", "text": "Added ESP32 and pullups" })
            ],
            settings: Some(serde_json::json!({ "layerCount": 2 })),
            tags: vec!["iot".to_string(), "esp32".to_string()],
        };

        // Save
        storage.save_project(&project).unwrap();

        // List
        let list = storage.list_projects().unwrap();
        assert_eq!(list.len(), 1);
        assert_eq!(list[0].id, "test-proj-1");
        assert_eq!(list[0].name, "Smart Thermostat Board");
        assert_eq!(list[0].components_count, 2);
        assert_eq!(list[0].nets_count, 1);
        assert_eq!(list[0].message_count, 2);

        // Load
        let loaded = storage.load_project("test-proj-1").unwrap();
        assert_eq!(loaded.id, project.id);
        assert_eq!(loaded.name, project.name);
        assert_eq!(loaded.messages.len(), 2);

        // Delete
        storage.delete_project("test-proj-1").unwrap();
        let list_after = storage.list_projects().unwrap();
        assert_eq!(list_after.len(), 0);

        let _ = fs::remove_dir_all(&temp_dir);
    }
}
