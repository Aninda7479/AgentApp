use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;


use std::sync::Arc;
use anyhow::{anyhow, Result};
use tokio::sync::Mutex;

use crate::artifact::manifest::{ArtifactManifest, ArtifactRuntimeState};
use crate::storage::settings::get_superagent_dir;

pub struct ArtifactRunner {
    storage_dir: PathBuf,
    active_ports: Arc<Mutex<HashMap<String, u16>>>,
}

impl ArtifactRunner {
    pub fn new() -> Self {
        Self::with_dir(get_superagent_dir().join("artifacts"))
    }

    pub fn with_dir(storage_dir: PathBuf) -> Self {
        if !storage_dir.exists() {
            let _ = fs::create_dir_all(&storage_dir);
        }
        Self {
            storage_dir,
            active_ports: Arc::new(Mutex::new(HashMap::new())),
        }
    }

    /// Scans the storage directory for all artifact folders with valid `manifest.json`.
    pub fn scan_artifacts(&self) -> Vec<ArtifactRuntimeState> {
        let mut results = Vec::new();
        if let Ok(entries) = fs::read_dir(&self.storage_dir) {
            for entry in entries.flatten() {
                let path = entry.path();
                if path.is_dir() {
                    let manifest_path = path.join("manifest.json");
                    if let Ok(content) = fs::read_to_string(&manifest_path) {
                        if let Ok(manifest) = serde_json::from_str::<ArtifactManifest>(&content) {
                            let id = path
                                .file_name()
                                .map(|s| s.to_string_lossy().to_string())
                                .unwrap_or_default();

                            let port = manifest.port.unwrap_or(3080);
                            results.push(ArtifactRuntimeState {
                                id,
                                manifest,
                                status: "stopped".to_string(),
                                port: Some(port),
                                url: Some(format!("http://127.0.0.1:{}", port)),
                                path: path.to_string_lossy().to_string(),
                            });
                        }
                    }
                }
            }
        }

        results
    }


    /// Starts an artifact runner instance.
    pub async fn start_artifact(&self, id: &str) -> Result<ArtifactRuntimeState> {
        let artifacts = self.scan_artifacts();
        let artifact = artifacts
            .into_iter()
            .find(|a| a.id == id)
            .ok_or_else(|| anyhow!("Artifact with id '{}' not found", id))?;

        let port = artifact.port.unwrap_or(3080);
        let mut ports = self.active_ports.lock().await;
        ports.insert(id.to_string(), port);

        let mut running = artifact.clone();
        running.status = "running".to_string();
        running.url = Some(format!("http://127.0.0.1:{}", port));

        Ok(running)
    }

    /// Stops an active artifact runner instance.
    pub async fn stop_artifact(&self, id: &str) -> Result<()> {
        let mut ports = self.active_ports.lock().await;
        ports.remove(id);
        Ok(())
    }

    /// Creates a new artifact folder and writes its `manifest.json`.
    pub fn create_artifact(&self, id: &str, manifest: &ArtifactManifest) -> Result<PathBuf> {
        let dir = self.storage_dir.join(id);
        if !dir.exists() {
            fs::create_dir_all(&dir)?;
        }
        let manifest_file = dir.join("manifest.json");
        let json = serde_json::to_string_pretty(manifest)?;
        fs::write(&manifest_file, json)?;
        Ok(dir)
    }
}

impl Default for ArtifactRunner {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_artifact_runner_lifecycle() {
        let temp_dir = std::env::temp_dir().join(format!("test_art_{}", uuid::Uuid::new_v4()));
        let runner = ArtifactRunner::with_dir(temp_dir.clone());

        let manifest = ArtifactManifest {
            name: "Test Calculator".to_string(),
            description: "A simple calculator artifact".to_string(),
            version: "1.0.0".to_string(),
            artifact_type: "web".to_string(),
            icon: None,
            logo: None,
            entry: "index.html".to_string(),
            port: Some(3085),
        };

        runner.create_artifact("calc-1", &manifest).unwrap();

        let list = runner.scan_artifacts();
        assert_eq!(list.len(), 1);
        assert_eq!(list[0].id, "calc-1");

        let started = runner.start_artifact("calc-1").await.unwrap();
        assert_eq!(started.status, "running");

        runner.stop_artifact("calc-1").await.unwrap();

        let _ = fs::remove_dir_all(&temp_dir);
    }
}
