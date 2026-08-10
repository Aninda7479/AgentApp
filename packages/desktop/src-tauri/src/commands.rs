use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use sysinfo::System;
use tauri::{AppHandle, Manager};

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct ArtifactManifest {
    pub name: String,
    pub description: String,
    pub version: String,
    #[serde(rename = "type")]
    pub artifact_type: String, // "web", "python", "node", "static"
    pub icon: String,
    pub entry: String,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct ArtifactRuntimeState {
    pub id: String,
    pub manifest: ArtifactManifest,
    pub status: String, // "stopped", "running", "error"
    pub port: Option<u16>,
    pub url: Option<String>,
    pub path: String,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct SystemInfoResponse {
    pub os_name: String,
    pub os_version: String,
    pub total_memory_mb: u64,
    pub used_memory_mb: u64,
    pub cpu_count: usize,
    pub cpu_usage_percent: f32,
    pub hostname: String,
}

fn get_artifacts_dir() -> PathBuf {
    let home = std::env::var("USERPROFILE")
        .or_else(|_| std::env::var("HOME"))
        .unwrap_or_else(|_| ".".to_string());
    PathBuf::from(home).join(".superagent").join("artifact")
}

#[tauri::command]
pub fn artifact_list() -> Vec<ArtifactRuntimeState> {
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

                        items.push(ArtifactRuntimeState {
                            id,
                            manifest,
                            status: "stopped".to_string(),
                            port: None,
                            url: None,
                            path: path.to_string_lossy().to_string(),
                        });
                    }
                }
            }
        }
    }

    items
}

#[tauri::command]
pub fn artifact_start(id: String) -> Result<ArtifactRuntimeState, String> {
    let list = artifact_list();
    if let Some(mut art) = list.into_iter().find(|a| a.id == id) {
        art.status = "running".to_string();
        Ok(art)
    } else {
        Err(format!("Artifact {} not found", id))
    }
}

#[tauri::command]
pub fn artifact_stop(id: String) -> Result<ArtifactRuntimeState, String> {
    let list = artifact_list();
    if let Some(mut art) = list.into_iter().find(|a| a.id == id) {
        art.status = "stopped".to_string();
        Ok(art)
    } else {
        Err(format!("Artifact {} not found", id))
    }
}

#[tauri::command]
pub fn artifact_open(id: String) -> Result<(), String> {
    let dir = get_artifacts_dir().join(&id);
    let target = dir.join("index.html");
    let target_str = if target.exists() {
        target.to_string_lossy().to_string()
    } else {
        dir.to_string_lossy().to_string()
    };

    #[cfg(target_os = "windows")]
    {
        let _ = std::process::Command::new("cmd")
            .args(["/C", "start", "", &target_str])
            .spawn();
    }
    #[cfg(target_os = "macos")]
    {
        let _ = std::process::Command::new("open").arg(&target_str).spawn();
    }
    #[cfg(target_os = "linux")]
    {
        let _ = std::process::Command::new("xdg-open").arg(&target_str).spawn();
    }
    let _ = open::that(&target_str);
    Ok(())
}

#[tauri::command]
pub fn artifact_delete(id: String) -> Result<(), String> {
    let dir = get_artifacts_dir().join(id);
    if dir.exists() {
        let _ = fs::remove_dir_all(dir);
    }
    Ok(())
}

#[tauri::command]
pub fn artifact_open_folder() -> Result<(), String> {
    let dir = get_artifacts_dir();
    let _ = fs::create_dir_all(&dir);
    let path_str = dir.to_string_lossy().to_string().replace('/', "\\");

    #[cfg(target_os = "windows")]
    {
        let _ = std::process::Command::new("cmd")
            .args(["/C", "start", "", &path_str])
            .spawn();
        let _ = std::process::Command::new("explorer")
            .arg(&path_str)
            .spawn();
    }
    #[cfg(target_os = "macos")]
    {
        let _ = std::process::Command::new("open").arg(&path_str).spawn();
    }
    #[cfg(target_os = "linux")]
    {
        let _ = std::process::Command::new("xdg-open").arg(&path_str).spawn();
    }
    let _ = open::that(&dir);
    Ok(())
}

#[tauri::command]
pub fn get_system_info() -> SystemInfoResponse {
    let mut sys = System::new();
    sys.refresh_memory();
    sys.refresh_cpu_usage();

    let total_mem = sys.total_memory() / 1024 / 1024;
    let used_mem = sys.used_memory() / 1024 / 1024;
    let cpus = sys.cpus();
    let cpu_count = cpus.len();

    let cpu_usage: f32 = if cpu_count > 0 {
        cpus.iter().map(|c| c.cpu_usage()).sum::<f32>() / cpu_count as f32
    } else {
        0.0
    };

    SystemInfoResponse {
        os_name: System::name().unwrap_or_else(|| "Unknown".to_string()),
        os_version: System::os_version().unwrap_or_else(|| "Unknown".to_string()),
        total_memory_mb: total_mem,
        used_memory_mb: used_mem,
        cpu_count,
        cpu_usage_percent: cpu_usage,
        hostname: System::host_name().unwrap_or_else(|| "SuperAgent-Device".to_string()),
    }
}

#[tauri::command]
pub fn read_text_file(path: String) -> Result<String, String> {
    fs::read_to_string(&path).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn write_text_file(path: String, content: String) -> Result<(), String> {
    if let Some(parent) = std::path::Path::new(&path).parent() {
        let _ = fs::create_dir_all(parent);
    }
    fs::write(&path, content).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn file_exists(path: String) -> bool {
    std::path::Path::new(&path).exists()
}

#[tauri::command]
pub fn get_app_version() -> String {
    env!("CARGO_PKG_VERSION").to_string()
}

fn get_user_data_dir() -> PathBuf {
    let home = std::env::var("USERPROFILE")
        .or_else(|_| std::env::var("HOME"))
        .unwrap_or_else(|_| ".".to_string());
    PathBuf::from(home).join(".superagent")
}

#[tauri::command]
pub fn read_global_memory() -> String {
    let p = get_user_data_dir().join("global_memory.json");
    fs::read_to_string(p).unwrap_or_else(|_| "{}".to_string())
}

#[tauri::command]
pub fn write_global_memory(content: String) -> Result<(), String> {
    let dir = get_user_data_dir();
    let _ = fs::create_dir_all(&dir);
    fs::write(dir.join("global_memory.json"), content).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn read_settings_file() -> String {
    let p = get_user_data_dir().join("settings.json");
    fs::read_to_string(p).unwrap_or_else(|_| "{}".to_string())
}

#[tauri::command]
pub fn write_settings_file(content: String) -> Result<(), String> {
    let dir = get_user_data_dir();
    let _ = fs::create_dir_all(&dir);
    fs::write(dir.join("settings.json"), content).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn check_ollama_port() -> bool {
    use std::net::ToSocketAddrs;
    if let Ok(mut addrs) = "127.0.0.1:11434".to_socket_addrs() {
        if let Some(addr) = addrs.next() {
            return std::net::TcpStream::connect_timeout(&addr, std::time::Duration::from_millis(300)).is_ok();
        }
    }
    false
}

#[tauri::command]
pub fn search_workspace_files(root: String, query: String) -> Vec<String> {
    let mut results = Vec::new();
    let query_lower = query.to_lowercase();
    let root_path = PathBuf::from(root);

    fn walk(dir: &PathBuf, query: &str, results: &mut Vec<String>, max_files: &mut usize) {
        if *max_files >= 100 {
            return;
        }
        if let Ok(entries) = fs::read_dir(dir) {
            for entry in entries.flatten() {
                let p = entry.path();
                let name = p.file_name().unwrap_or_default().to_string_lossy();
                if name.starts_with('.') || name == "node_modules" || name == "target" || name == "dist" {
                    continue;
                }
                if p.is_dir() {
                    walk(&p, query, results, max_files);
                } else if name.to_lowercase().contains(query) {
                    results.push(p.to_string_lossy().to_string());
                    *max_files += 1;
                }
            }
        }
    }

    let mut max = 0;
    walk(&root_path, &query_lower, &mut results, &mut max);
    results
}

#[tauri::command]
pub fn toggle_window_maximize(app: AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("main") {
        if window.is_maximized().unwrap_or(false) {
            window.unmaximize().map_err(|e| e.to_string())?;
        } else {
            window.maximize().map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}

#[tauri::command]
pub fn minimize_window(app: AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("main") {
        window.minimize().map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub fn close_window(app: AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("main") {
        window.close().map_err(|e| e.to_string())?;
    }
    Ok(())
}
