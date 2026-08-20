use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;
use sysinfo::System;
use tauri::{AppHandle, Manager};

fn default_artifact_type() -> String {
    "static".to_string()
}

fn default_entry() -> String {
    "index.html".to_string()
}

#[derive(Serialize, Deserialize, Debug, Clone)]
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

                        let port = manifest.port.unwrap_or(3080);
                        items.push(ArtifactRuntimeState {
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

    items
}

#[tauri::command]
pub fn artifact_start(id: String) -> Result<ArtifactRuntimeState, String> {
    let list = artifact_list();
    if let Some(mut art) = list.into_iter().find(|a| a.id == id) {
        art.status = "running".to_string();
        let port = art.manifest.port.unwrap_or(3080);
        let dir = get_artifacts_dir().join(&id);
        let entry_path = dir.join(&art.manifest.entry);

        if art.manifest.artifact_type == "node" {
            let _ = std::process::Command::new("node")
                .arg(&entry_path)
                .current_dir(&dir)
                .env("PORT", port.to_string())
                .spawn();
        } else if art.manifest.artifact_type == "python" {
            let _ = std::process::Command::new("python")
                .arg(&entry_path)
                .current_dir(&dir)
                .env("PORT", port.to_string())
                .spawn();
        }

        art.port = Some(port);
        art.url = Some(format!("http://127.0.0.1:{}", port));
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
    let manifest_path = dir.join("manifest.json");
    let mut port: u16 = 3080;

    if let Ok(content) = fs::read_to_string(&manifest_path) {
        if let Ok(manifest) = serde_json::from_str::<ArtifactManifest>(&content) {
            if let Some(p) = manifest.port {
                port = p;
            }
            let entry = if manifest.entry.is_empty() {
                if manifest.artifact_type == "node" { "index.js".to_string() } else { "index.html".to_string() }
            } else {
                manifest.entry
            };
            let entry_path = dir.join(&entry);

            if manifest.artifact_type == "node" {
                let _ = std::process::Command::new("node")
                    .arg(&entry_path)
                    .current_dir(&dir)
                    .env("PORT", port.to_string())
                    .spawn();
            } else if manifest.artifact_type == "python" {
                let _ = std::process::Command::new("python")
                    .arg(&entry_path)
                    .current_dir(&dir)
                    .env("PORT", port.to_string())
                    .spawn();
            }
        }
    }

    let live_url = format!("http://127.0.0.1:{}", port);

    #[cfg(target_os = "windows")]
    {
        let _ = std::process::Command::new("cmd")
            .args(["/C", "start", "", &live_url])
            .spawn();
    }
    #[cfg(target_os = "macos")]
    {
        let _ = std::process::Command::new("open").arg(&live_url).spawn();
    }
    #[cfg(target_os = "linux")]
    {
        let _ = std::process::Command::new("xdg-open").arg(&live_url).spawn();
    }
    let _ = open::that(&live_url);
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

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct PartnerReaction {
    pub emoji: String,
    pub line: String,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct PartnerManifest {
    pub schema: String,
    pub id: String,
    pub name: String,
    pub kind: String,
    #[serde(default)]
    pub version: Option<String>,
    pub description: String,
    #[serde(default)]
    pub author: Option<String>,
    #[serde(default)]
    pub accent: Option<String>,
    #[serde(default)]
    pub emoji: Option<String>,
    #[serde(default)]
    pub model: Option<String>,
    #[serde(default)]
    pub face_overlay: Option<bool>,
    #[serde(default)]
    pub laptop: Option<bool>,
    #[serde(default)]
    pub pillow: Option<bool>,
    #[serde(default)]
    pub reactions: Option<HashMap<String, PartnerReaction>>,
    #[serde(default)]
    pub folder: Option<String>,
    #[serde(default)]
    pub dp: Option<String>,
    #[serde(default)]
    pub dp_path: Option<String>,
    #[serde(default)]
    pub dp_url: Option<String>,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct ActivePartnerState {
    pub id: Option<String>,
}

fn get_partners_dir() -> PathBuf {
    get_user_data_dir().join("partners")
}

fn get_default_lily() -> PartnerManifest {
    let lily_folder = get_user_data_dir().join("lily").to_string_lossy().to_string();
    let mut reactions = HashMap::new();
    reactions.insert(
        "idle".to_string(),
        PartnerReaction {
            emoji: "🧍".to_string(),
            line: "Ready when you are.".to_string(),
        },
    );
    reactions.insert(
        "thinking".to_string(),
        PartnerReaction {
            emoji: "🤔".to_string(),
            line: "Hmm, let me think…".to_string(),
        },
    );
    reactions.insert(
        "working".to_string(),
        PartnerReaction {
            emoji: "💻".to_string(),
            line: "On it!".to_string(),
        },
    );
    reactions.insert(
        "happy".to_string(),
        PartnerReaction {
            emoji: "🙂".to_string(),
            line: "Nice.".to_string(),
        },
    );
    reactions.insert(
        "celebrate".to_string(),
        PartnerReaction {
            emoji: "🎉".to_string(),
            line: "Done!".to_string(),
        },
    );
    reactions.insert(
        "sad".to_string(),
        PartnerReaction {
            emoji: "😢".to_string(),
            line: "That didn't go well.".to_string(),
        },
    );
    reactions.insert(
        "sleeping".to_string(),
        PartnerReaction {
            emoji: "😴".to_string(),
            line: "zzz".to_string(),
        },
    );

    PartnerManifest {
        schema: "superagent-partner".to_string(),
        id: "lily".to_string(),
        name: "Lily".to_string(),
        kind: "girl".to_string(),
        version: Some("1.0.0".to_string()),
        description: "A cute anime companion who works, sleeps, and keeps you company.".to_string(),
        author: Some("SuperAgent".to_string()),
        accent: Some("#ff8fb3".to_string()),
        emoji: Some("🧍".to_string()),
        model: Some("models/lily/v1/girl_web.glb".to_string()),
        face_overlay: Some(false),
        laptop: Some(true),
        pillow: Some(true),
        reactions: Some(reactions),
        folder: Some(lily_folder),
        dp: None,
        dp_path: None,
        dp_url: None,
    }
}

fn is_valid_manifest(manifest: &PartnerManifest) -> bool {
    if manifest.schema != "superagent-partner" {
        return false;
    }
    if manifest.id.is_empty() || manifest.name.is_empty() || manifest.kind.is_empty() || manifest.description.is_empty() {
        return false;
    }
    manifest.id.chars().all(|c| c.is_alphanumeric() || c == '_' || c == '-')
}

#[tauri::command]
pub fn partner_list() -> Vec<PartnerManifest> {
    let mut out = Vec::new();
    out.push(get_default_lily());

    let dir = get_partners_dir();
    if let Ok(entries) = fs::read_dir(&dir) {
        for entry in entries.flatten() {
            if let Ok(file_type) = entry.file_type() {
                if file_type.is_dir() {
                    let folder_name = entry.file_name().to_string_lossy().to_string();
                    if folder_name == "lily" {
                        continue;
                    }
                    let folder_path = entry.path();
                    let manifest_path = folder_path.join("partner.json");
                    if manifest_path.exists() {
                        if let Ok(raw) = fs::read_to_string(&manifest_path) {
                            if let Ok(mut manifest) = serde_json::from_str::<PartnerManifest>(&raw) {
                                if is_valid_manifest(&manifest) {
                                    manifest.folder = Some(folder_path.to_string_lossy().to_string());
                                    out.push(manifest);
                                }
                            }
                        }
                    }
                }
            }
        }
    }
    out
}

#[tauri::command]
pub fn partner_get(id: String) -> Option<PartnerManifest> {
    if id == "lily" {
        return Some(get_default_lily());
    }
    let folder_path = get_partners_dir().join(&id);
    let manifest_path = folder_path.join("partner.json");
    if manifest_path.exists() {
        if let Ok(raw) = fs::read_to_string(&manifest_path) {
            if let Ok(mut manifest) = serde_json::from_str::<PartnerManifest>(&raw) {
                if is_valid_manifest(&manifest) {
                    manifest.folder = Some(folder_path.to_string_lossy().to_string());
                    return Some(manifest);
                }
            }
        }
    }
    None
}

#[tauri::command]
pub fn partner_set_active(id: Option<String>) -> Result<(), String> {
    let dir = get_partners_dir();
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let active_path = dir.join("active.json");
    let state = ActivePartnerState { id };
    let json = serde_json::to_string_pretty(&state).map_err(|e| e.to_string())?;
    fs::write(active_path, json).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn partner_get_active() -> Option<String> {
    let active_path = get_partners_dir().join("active.json");
    if active_path.exists() {
        if let Ok(raw) = fs::read_to_string(&active_path) {
            if let Ok(state) = serde_json::from_str::<ActivePartnerState>(&raw) {
                return state.id;
            }
        }
    }
    None
}

#[tauri::command]
pub fn partner_import_json(json: String) -> Result<PartnerManifest, String> {
    let manifest: PartnerManifest = serde_json::from_str(&json).map_err(|e| format!("Invalid JSON: {}", e))?;
    if !is_valid_manifest(&manifest) {
        return Err("Not a valid Partner manifest (needs schema: \"superagent-partner\", valid id, name, kind, description).".to_string());
    }
    let dest = get_partners_dir().join(&manifest.id);
    fs::create_dir_all(&dest).map_err(|e| e.to_string())?;
    let manifest_file = dest.join("partner.json");
    let formatted = serde_json::to_string_pretty(&manifest).map_err(|e| e.to_string())?;
    fs::write(manifest_file, formatted).map_err(|e| e.to_string())?;

    let mut result = manifest;
    result.folder = Some(dest.to_string_lossy().to_string());
    Ok(result)
}

#[tauri::command]
pub fn partner_remove(id: String) -> Result<(), String> {
    if id == "lily" {
        return Err("Cannot remove built-in partner".to_string());
    }
    let target = get_partners_dir().join(&id);
    if target.exists() {
        fs::remove_dir_all(target).map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub async fn partner_pick_model_file(app: AppHandle) -> Result<Option<String>, String> {
    use tauri_plugin_dialog::DialogExt;

    let (tx, rx) = tokio::sync::oneshot::channel();
    app.dialog()
        .file()
        .add_filter("3D Model Files", &["vrm", "glb", "gltf"])
        .pick_file(move |file_path| {
            let path_str = file_path.map(|p| p.to_string());
            let _ = tx.send(path_str);
        });

    rx.await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn partner_pick_model_folder(app: AppHandle) -> Result<Option<String>, String> {
    use tauri_plugin_dialog::DialogExt;

    let (tx, rx) = tokio::sync::oneshot::channel();
    app.dialog()
        .file()
        .pick_folder(move |folder_path| {
            let path_str = folder_path.map(|p| p.to_string());
            let _ = tx.send(path_str);
        });

    rx.await.map_err(|e| e.to_string())
}

#[tauri::command]
pub fn autostart_enable() -> Result<String, String> {
    #[cfg(target_os = "windows")]
    {
        if let Ok(current_exe) = std::env::current_exe() {
            let exe_str = current_exe.to_string_lossy().to_string();
            let val = format!("\"{}\" --autostart", exe_str);
            let status = std::process::Command::new("reg")
                .args(["add", "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run", "/v", "SuperAgentDesktop", "/t", "REG_SZ", "/d", &val, "/f"])
                .status()
                .map_err(|e| e.to_string())?;
            if status.success() {
                return Ok("Autostart enabled for Windows".to_string());
            } else {
                return Err("Failed to register Windows startup key".to_string());
            }
        }
    }
    #[cfg(target_os = "macos")]
    {
        if let Ok(home) = std::env::var("HOME") {
            let plist_dir = std::path::PathBuf::from(&home).join("Library/LaunchAgents");
            let _ = fs::create_dir_all(&plist_dir);
            let plist_file = plist_dir.join("com.opensource.agentapp.desktop.plist");
            if let Ok(current_exe) = std::env::current_exe() {
                let exe_str = current_exe.to_string_lossy().to_string();
                let content = format!(
                    r#"<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
  <dict>
    <key>Label</key>
    <string>com.opensource.agentapp.desktop</string>
    <key>ProgramArguments</key>
    <array>
      <string>{}</string>
      <string>--autostart</string>
    </array>
    <key>RunAtLoad</key>
    <true/>
  </dict>
</plist>"#,
                    exe_str
                );
                fs::write(plist_file, content).map_err(|e| e.to_string())?;
                return Ok("Autostart enabled for macOS".to_string());
            }
        }
    }
    #[cfg(target_os = "linux")]
    {
        if let Ok(home) = std::env::var("HOME") {
            let autostart_dir = std::path::PathBuf::from(&home).join(".config/autostart");
            let _ = fs::create_dir_all(&autostart_dir);
            let desktop_file = autostart_dir.join("superagent.desktop");
            if let Ok(current_exe) = std::env::current_exe() {
                let exe_str = current_exe.to_string_lossy().to_string();
                let content = format!(
                    "[Desktop Entry]\nType=Application\nExec=\"{}\" --autostart\nHidden=false\nNoDisplay=false\nX-GNOME-Autostart-enabled=true\nName=SuperAgent\nComment=SuperAgent AI Assistant\n",
                    exe_str
                );
                fs::write(desktop_file, content).map_err(|e| e.to_string())?;
                return Ok("Autostart enabled for Linux".to_string());
            }
        }
    }
    Ok("Autostart enabled".to_string())
}

#[tauri::command]
pub fn autostart_disable() -> Result<String, String> {
    #[cfg(target_os = "windows")]
    {
        let _ = std::process::Command::new("reg")
            .args(["delete", "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run", "/v", "SuperAgentDesktop", "/f"])
            .status();
        return Ok("Autostart disabled for Windows".to_string());
    }
    #[cfg(target_os = "macos")]
    {
        if let Ok(home) = std::env::var("HOME") {
            let plist_file = std::path::PathBuf::from(&home).join("Library/LaunchAgents/com.opensource.agentapp.desktop.plist");
            if plist_file.exists() {
                let _ = fs::remove_file(plist_file);
            }
        }
        return Ok("Autostart disabled for macOS".to_string());
    }
    #[cfg(target_os = "linux")]
    {
        if let Ok(home) = std::env::var("HOME") {
            let desktop_file = std::path::PathBuf::from(&home).join(".config/autostart/superagent.desktop");
            if desktop_file.exists() {
                let _ = fs::remove_file(desktop_file);
            }
        }
        return Ok("Autostart disabled for Linux".to_string());
    }
    #[allow(unreachable_code)]
    Ok("Autostart disabled".to_string())
}

#[tauri::command]
pub fn autostart_is_enabled() -> bool {
    #[cfg(target_os = "windows")]
    {
        if let Ok(output) = std::process::Command::new("reg")
            .args(["query", "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run", "/v", "SuperAgentDesktop"])
            .output()
        {
            let out_str = String::from_utf8_lossy(&output.stdout);
            return out_str.contains("SuperAgentDesktop");
        }
        return false;
    }
    #[cfg(target_os = "macos")]
    {
        if let Ok(home) = std::env::var("HOME") {
            let plist_file = std::path::PathBuf::from(&home).join("Library/LaunchAgents/com.opensource.agentapp.desktop.plist");
            return plist_file.exists();
        }
        return false;
    }
    #[cfg(target_os = "linux")]
    {
        if let Ok(home) = std::env::var("HOME") {
            let desktop_file = std::path::PathBuf::from(&home).join(".config/autostart/superagent.desktop");
            return desktop_file.exists();
        }
        return false;
    }
    #[allow(unreachable_code)]
    false
}

