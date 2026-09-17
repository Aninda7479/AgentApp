use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;

#[derive(Serialize, Deserialize, Debug, Clone, PartialEq, Eq)]
pub struct ArtifactManifest {
    pub name: String,
    #[serde(default)]
    pub description: String,
    #[serde(default)]
    pub version: String,
    #[serde(rename = "type", default = "default_artifact_type")]
    pub artifact_type: String, // "web", "python", "node", "static"
    #[serde(default)]
    pub icon: Option<String>,
    #[serde(default)]
    pub logo: Option<String>,
    #[serde(default = "default_entry")]
    pub entry: String,
    #[serde(default)]
    pub port: Option<u16>,
    #[serde(default)]
    pub autostart: bool,
}

fn default_artifact_type() -> String {
    "static".to_string()
}

fn default_entry() -> String {
    "index.html".to_string()
}

#[derive(Serialize, Deserialize, Debug, Clone, PartialEq, Eq)]
pub struct ArtifactRuntimeState {
    pub id: String,
    pub manifest: ArtifactManifest,
    pub status: String, // "stopped", "running", "error"
    pub port: Option<u16>,
    pub url: Option<String>,
    pub path: String,
    #[serde(default)]
    pub autostart: bool,
}

pub fn get_artifacts_dir() -> PathBuf {
    let home = std::env::var("USERPROFILE")
        .or_else(|_| std::env::var("HOME"))
        .unwrap_or_else(|_| ".".to_string());
    let new_dir = PathBuf::from(&home).join(".superagent").join("artifacts");
    if new_dir.exists() {
        return new_dir;
    }
    let old_dir = PathBuf::from(&home).join(".superagent").join("artifact");
    if old_dir.exists() {
        return old_dir;
    }
    new_dir
}

fn get_local_session_token() -> Option<String> {
    if let Ok(tok) = std::env::var("SUPERAGENT_SESSION_TOKEN") {
        if !tok.trim().is_empty() {
            return Some(tok.trim().to_string());
        }
    }

    let home = std::env::var("USERPROFILE")
        .or_else(|_| std::env::var("HOME"))
        .ok()?;
    let home_path = PathBuf::from(home);
    let candidates = [
        home_path
            .join(".superagent")
            .join("config")
            .join("auth.json"),
        home_path
            .join(".superagent")
            .join("Config")
            .join("auth.json"),
        home_path.join(".superagent").join("auth.json"),
        PathBuf::from(".").join(".superagent").join("auth.json"),
    ];

    for path in &candidates {
        if let Ok(content) = fs::read_to_string(path) {
            if let Ok(val) = serde_json::from_str::<serde_json::Value>(&content) {
                if let Some(sessions) = val.get("sessions").and_then(|s| s.as_array()) {
                    if let Some(first_session) = sessions.first() {
                        if let Some(tok) = first_session
                            .get("token")
                            .or_else(|| first_session.get("id"))
                            .and_then(|t| t.as_str())
                        {
                            if !tok.trim().is_empty() {
                                return Some(tok.trim().to_string());
                            }
                        }
                    }
                }
            }
        }
    }

    None
}

/// Scans local disk artifacts directory directly as a zero-latency fallback.
pub fn scan_local_artifacts() -> Vec<ArtifactRuntimeState> {
    let dir = get_artifacts_dir();
    let mut items = Vec::new();

    if let Ok(entries) = fs::read_dir(&dir) {
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
                        let autostart = manifest.autostart;
                        items.push(ArtifactRuntimeState {
                            id,
                            manifest,
                            status: "stopped".to_string(),
                            port: Some(port),
                            url: Some(format!("http://127.0.0.1:{}", port)),
                            path: path.to_string_lossy().to_string(),
                            autostart,
                        });
                    }
                }
            }
        }
    }

    items
}

/// Fetches artifacts list from SuperAgent core daemon, with local fallback.
pub async fn fetch_artifacts() -> Vec<ArtifactRuntimeState> {
    let client = match reqwest::Client::builder()
        .timeout(std::time::Duration::from_millis(1500))
        .build()
    {
        Ok(c) => c,
        Err(_) => return scan_local_artifacts(),
    };

    let url = "http://127.0.0.1:1469/api/ipc/artifact:list";
    let mut req = client.post(url).json(&serde_json::json!({ "args": [] }));

    if let Some(token) = get_local_session_token() {
        req = req.header("Authorization", format!("Bearer {}", token));
    }

    if let Ok(resp) = req.send().await {
        if resp.status().is_success() {
            if let Ok(val) = resp.json::<serde_json::Value>().await {
                if let Some(data) = val.get("data") {
                    if let Ok(list) =
                        serde_json::from_value::<Vec<ArtifactRuntimeState>>(data.clone())
                    {
                        return list;
                    }
                }
            }
        }
    }

    scan_local_artifacts()
}

/// Starts an artifact via SuperAgent core daemon.
pub async fn start_artifact(id: &str) -> Result<(), String> {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(5))
        .build()
        .map_err(|e| e.to_string())?;

    let url = "http://127.0.0.1:1469/api/ipc/artifact:start";
    let mut req = client.post(url).json(&serde_json::json!({ "args": [id] }));

    if let Some(token) = get_local_session_token() {
        req = req.header("Authorization", format!("Bearer {}", token));
    }

    let resp = req.send().await.map_err(|e| e.to_string())?;
    if resp.status().is_success() {
        Ok(())
    } else {
        Err(format!("Failed to start artifact: HTTP {}", resp.status()))
    }
}

/// Stops an artifact via SuperAgent core daemon.
pub async fn stop_artifact(id: &str) -> Result<(), String> {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(5))
        .build()
        .map_err(|e| e.to_string())?;

    let url = "http://127.0.0.1:1469/api/ipc/artifact:stop";
    let mut req = client.post(url).json(&serde_json::json!({ "args": [id] }));

    if let Some(token) = get_local_session_token() {
        req = req.header("Authorization", format!("Bearer {}", token));
    }

    let resp = req.send().await.map_err(|e| e.to_string())?;
    if resp.status().is_success() {
        Ok(())
    } else {
        Err(format!("Failed to stop artifact: HTTP {}", resp.status()))
    }
}

/// Deletes an artifact folder and its contents.
pub async fn delete_artifact(id: &str) -> Result<(), String> {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(5))
        .build()
        .map_err(|e| e.to_string())?;

    let url = "http://127.0.0.1:1469/api/ipc/artifact:delete";
    let mut req = client.post(url).json(&serde_json::json!({ "args": [id] }));

    if let Some(token) = get_local_session_token() {
        req = req.header("Authorization", format!("Bearer {}", token));
    }

    let _ = req.send().await;

    // Direct removal guarantee
    let dir = get_artifacts_dir().join(id);
    if dir.exists() {
        let _ = fs::remove_dir_all(&dir);
    }
    Ok(())
}

/// Toggles autostart in manifest.json.
pub async fn toggle_autostart(id: &str, autostart: bool) -> Result<(), String> {
    let manifest_path = get_artifacts_dir().join(id).join("manifest.json");
    if manifest_path.exists() {
        if let Ok(content) = fs::read_to_string(&manifest_path) {
            if let Ok(mut manifest) = serde_json::from_str::<ArtifactManifest>(&content) {
                manifest.autostart = autostart;
                if let Ok(json) = serde_json::to_string_pretty(&manifest) {
                    let _ = fs::write(&manifest_path, json);
                }
            }
        }
    }

    let client = match reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(3))
        .build()
    {
        Ok(c) => c,
        Err(_) => return Ok(()),
    };

    let url = "http://127.0.0.1:1469/api/ipc/artifact:toggleAutostart";
    let mut req = client.post(url).json(&serde_json::json!({
        "args": [{ "id": id, "autostart": autostart }]
    }));

    if let Some(token) = get_local_session_token() {
        req = req.header("Authorization", format!("Bearer {}", token));
    }

    let _ = req.send().await;
    Ok(())
}

/// Opens the running artifact in default browser.
pub fn open_artifact_browser(url: &str) {
    let _ = open::that(url);
}

/// Opens the artifacts storage folder on disk in file explorer.
pub fn open_artifacts_folder() {
    let dir = get_artifacts_dir();
    let _ = fs::create_dir_all(&dir);
    let _ = open::that(&dir);
}
