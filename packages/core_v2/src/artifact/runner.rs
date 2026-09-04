use std::collections::{HashMap, VecDeque};
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
    child_processes: Arc<Mutex<HashMap<String, tokio::process::Child>>>,
    log_buffers: Arc<Mutex<HashMap<String, VecDeque<String>>>>,
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
            child_processes: Arc::new(Mutex::new(HashMap::new())),
            log_buffers: Arc::new(Mutex::new(HashMap::new())),
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

        let mut port = artifact.port.unwrap_or(3080);
        
        let a_type = artifact.manifest.artifact_type.as_str();
        if a_type == "python" || a_type == "node" {
            let listener = std::net::TcpListener::bind("127.0.0.1:0")?;
            port = listener.local_addr()?.port();
            
            let cmd = if a_type == "python" { "python" } else { "node" };
            let mut child = tokio::process::Command::new(cmd)
                .kill_on_drop(true)
                .stdin(std::process::Stdio::null())
                .arg(&artifact.manifest.entry)
                .current_dir(self.storage_dir.join(id))
                .env("PORT", port.to_string())
                .stdout(std::process::Stdio::piped())
                .stderr(std::process::Stdio::piped())
                .spawn()?;
            
            if let Some(stdout) = child.stdout.take() {
                let id_clone = id.to_string();
                let logs = self.log_buffers.clone();
                tokio::spawn(async move {
                    use tokio::io::AsyncBufReadExt;
                    let reader = tokio::io::BufReader::new(stdout);
                    let mut lines = reader.lines();
                    while let Ok(Some(line)) = lines.next_line().await {
                        let mut lock = logs.lock().await;
                        let buf = lock.entry(id_clone.clone()).or_default();
                        if buf.len() >= 1000 {
                            buf.pop_front();
                        }
                        buf.push_back(line);
                    }
                });
            }
            if let Some(stderr) = child.stderr.take() {
                let id_clone = id.to_string();
                let logs = self.log_buffers.clone();
                tokio::spawn(async move {
                    use tokio::io::AsyncBufReadExt;
                    let reader = tokio::io::BufReader::new(stderr);
                    let mut lines = reader.lines();
                    while let Ok(Some(line)) = lines.next_line().await {
                        let mut lock = logs.lock().await;
                        let buf = lock.entry(id_clone.clone()).or_default();
                        if buf.len() >= 1000 {
                            buf.pop_front();
                        }
                        buf.push_back(format!("STDERR: {}", line));
                    }
                });
            }
            
            let mut processes = self.child_processes.lock().await;
            processes.insert(id.to_string(), child);
        }

        let mut ports = self.active_ports.lock().await;
        ports.insert(id.to_string(), port);

        let mut running = artifact.clone();
        running.status = "running".to_string();
        running.url = Some(format!("http://127.0.0.1:{}", port));

        Ok(running)
    }

    /// Stops an active artifact runner instance.
    pub async fn stop_artifact(&self, id: &str) -> Result<()> {
        let mut processes = self.child_processes.lock().await;
        if let Some(mut child) = processes.remove(id) {
            let _ = child.kill().await;
        }
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

    /// Deletes an artifact folder and its contents.
    pub fn delete_artifact(&self, id: &str) -> Result<()> {
        let dir = self.storage_dir.join(id);
        if dir.exists() {
            fs::remove_dir_all(&dir)?;
        }
        Ok(())
    }

    /// Ensures seed artifacts are created if the artifacts directory is empty.
    pub fn ensure_seed_artifacts(&self) -> Result<()> {
        let list = self.scan_artifacts();
        if list.is_empty() {
            let demo_manifest = ArtifactManifest {
                name: "Interactive Demo".to_string(),
                description: "SuperAgent built-in demo artifact".to_string(),
                version: "1.0.0".to_string(),
                artifact_type: "web".to_string(),
                icon: Some("Sparkles".to_string()),
                logo: None,
                entry: "index.html".to_string(),
                port: Some(3081),
            };
            let dir = self.create_artifact("demo-app", &demo_manifest)?;
            let index_html = r#"<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>SuperAgent Demo</title></head>
<body style="font-family: sans-serif; padding: 2rem; background: #0f172a; color: #f8fafc;">
<h1>SuperAgent Artifact Runner</h1>
<p>This micro-app is running safely inside SuperAgent Core v2 Daemon.</p>
</body>
</html>"#;
            let _ = fs::write(dir.join("index.html"), index_html);
        }
        Ok(())
    }

    /// Returns the JSON storage for an artifact.
    pub fn get_storage(&self, id: &str) -> serde_json::Value {
        let file = self.storage_dir.join(id).join("storage.json");
        if file.exists() {
            if let Ok(raw) = fs::read_to_string(&file) {
                if let Ok(val) = serde_json::from_str::<serde_json::Value>(&raw) {
                    return val;
                }
            }
        }
        serde_json::json!({})
    }

    /// Replaces the JSON storage for an artifact.
    pub fn set_storage(&self, id: &str, data: serde_json::Value) -> Result<()> {
        let dir = self.storage_dir.join(id);
        fs::create_dir_all(&dir)?;
        let file = dir.join("storage.json");
        let json = serde_json::to_string_pretty(&data)?;
        fs::write(file, json)?;
        Ok(())
    }

    /// Sets a specific key in an artifact's storage.
    pub fn set_storage_key(&self, id: &str, key: &str, val: serde_json::Value) -> Result<()> {
        let mut cur = self.get_storage(id);
        if let Some(obj) = cur.as_object_mut() {
            obj.insert(key.to_string(), val);
        } else {
            let mut map = serde_json::Map::new();
            map.insert(key.to_string(), val);
            cur = serde_json::Value::Object(map);
        }
        self.set_storage(id, cur)
    }

    /// Deletes a specific key in an artifact's storage.
    pub fn delete_storage_key(&self, id: &str, key: &str) -> Result<()> {
        let mut cur = self.get_storage(id);
        if let Some(obj) = cur.as_object_mut() {
            obj.remove(key);
            self.set_storage(id, cur)?;
        }
        Ok(())
    }

    /// Clears an artifact's storage.
    pub fn clear_storage(&self, id: &str) -> Result<()> {
        self.set_storage(id, serde_json::json!({}))
    }

    /// Returns recent logs for an artifact.
    pub fn get_artifact_logs(&self, id: &str, limit: usize) -> Vec<String> {
        if let Ok(lock) = self.log_buffers.try_lock() {
            if let Some(logs) = lock.get(id) {
                let start = logs.len().saturating_sub(limit);
                let msgs: Vec<String> = logs.iter().skip(start).cloned().collect();
                if !msgs.is_empty() {
                    return msgs;
                }
            }
        }
        vec!["[artifact] Ready".to_string()]
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
