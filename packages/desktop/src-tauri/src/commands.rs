use base64::Engine;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::io::Cursor;
use std::path::PathBuf;
use superagent_core_v2::artifact::{ArtifactManifest, ArtifactRuntimeState};
use tauri::{AppHandle, Emitter, Manager};

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
pub fn get_system_info() -> serde_json::Value {
    superagent_core_v2::server::routes::system::get_full_system_info_value()
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

#[tauri::command]
pub fn system_info() -> serde_json::Value {
    get_system_info()
}

#[tauri::command]
pub fn app_version() -> String {
    get_app_version()
}

#[tauri::command]
pub fn ollama_status() -> serde_json::Value {
    superagent_core_v2::server::routes::system::detect_ollama_installation()
}

#[tauri::command]
pub fn check_ollama_installed() -> serde_json::Value {
    ollama_status()
}

#[tauri::command]
pub fn ollama_installed_models() -> Vec<serde_json::Value> {
    superagent_core_v2::server::routes::system::scan_ollama_models_from_disk()
}

#[tauri::command]
pub fn ollama_start() -> serde_json::Value {
    match superagent_core_v2::server::routes::system::start_ollama_daemon() {
        Ok(running) => serde_json::json!({ "success": running, "running": running }),
        Err(e) => serde_json::json!({ "success": false, "error": e }),
    }
}

#[tauri::command]
pub fn start_ollama_service() -> serde_json::Value {
    ollama_start()
}

#[tauri::command]
pub fn ollama_settings_get() -> serde_json::Value {
    let settings = superagent_core_v2::storage::SettingsStore::new().load_raw().unwrap_or_else(|_| serde_json::json!({}));
    settings.get("ollama").cloned().unwrap_or_else(|| serde_json::json!({
        "baseUrl": "http://localhost:11434",
        "defaultContextLimit": "8k",
        "defaultTemperature": 0.7,
        "keepAlive": "5m",
        "autoStart": true
    }))
}

#[tauri::command]
pub fn ollama_settings_save(payload: Option<serde_json::Value>, data: Option<serde_json::Value>) -> Result<(), String> {
    let arg = payload.or(data);
    if let Some(val) = arg {
        let mut current = superagent_core_v2::storage::SettingsStore::new().load_raw().unwrap_or_else(|_| serde_json::json!({}));
        if let Some(c_obj) = current.as_object_mut() {
            c_obj.insert("ollama".to_string(), val);
            superagent_core_v2::storage::SettingsStore::new().save_raw(&current).map_err(|e| e.to_string())?;
        }
    }
    Ok(())
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
    let settings = superagent_core_v2::storage::SettingsStore::new().load_raw().unwrap_or_else(|_| serde_json::json!({}));
    serde_json::to_string_pretty(&settings).unwrap_or_else(|_| "{}".to_string())
}

#[tauri::command]
pub fn write_settings_file(content: String) -> Result<(), String> {
    let val: serde_json::Value = serde_json::from_str(&content).map_err(|e| e.to_string())?;
    superagent_core_v2::storage::SettingsStore::new().save_raw(&val).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn settings_read() -> serde_json::Value {
    superagent_core_v2::storage::SettingsStore::new().load_raw().unwrap_or_else(|_| serde_json::json!({}))
}

#[tauri::command]
#[allow(non_snake_case)]
pub fn settings_write(
    app: AppHandle,
    content: Option<serde_json::Value>,
    data: Option<serde_json::Value>,
    settings: Option<serde_json::Value>,
    payload: Option<serde_json::Value>,
    theme: Option<serde_json::Value>,
    general: Option<serde_json::Value>,
    providers: Option<serde_json::Value>,
    models: Option<serde_json::Value>,
    last_used_model: Option<serde_json::Value>,
    skills: Option<serde_json::Value>,
    plugins: Option<serde_json::Value>,
    mcp: Option<serde_json::Value>,
    telegram: Option<serde_json::Value>,
    internet_access: Option<serde_json::Value>,
    web_app: Option<serde_json::Value>,
    circle_search: Option<serde_json::Value>,
    circleSearch: Option<serde_json::Value>,
    voice: Option<serde_json::Value>,
    chat_title: Option<serde_json::Value>,
    chatTitle: Option<serde_json::Value>,
) -> Result<(), String> {
    let mut patch_map = serde_json::Map::new();

    let full_obj = content.or(data).or(settings).or(payload);
    if let Some(obj) = full_obj.as_ref().and_then(|v| v.as_object()) {
        for (k, v) in obj {
            patch_map.insert(k.clone(), v.clone());
        }
    }

    if let Some(v) = theme { patch_map.insert("theme".to_string(), v); }
    if let Some(v) = general { patch_map.insert("general".to_string(), v); }
    if let Some(v) = providers { patch_map.insert("providers".to_string(), v); }
    if let Some(v) = models { patch_map.insert("models".to_string(), v); }
    if let Some(v) = last_used_model { patch_map.insert("lastUsedModel".to_string(), v); }
    if let Some(v) = skills { patch_map.insert("skills".to_string(), v); }
    if let Some(v) = plugins { patch_map.insert("plugins".to_string(), v); }
    if let Some(v) = mcp { patch_map.insert("mcp".to_string(), v); }
    if let Some(v) = telegram { patch_map.insert("telegram".to_string(), v); }
    if let Some(v) = internet_access { patch_map.insert("internetAccess".to_string(), v); }
    if let Some(v) = web_app { patch_map.insert("webApp".to_string(), v); }
    if let Some(v) = circle_search.or(circleSearch) { patch_map.insert("circleSearch".to_string(), v); }
    if let Some(v) = voice { patch_map.insert("voice".to_string(), v); }
    if let Some(v) = chat_title.or(chatTitle) { patch_map.insert("chatTitle".to_string(), v); }

    if patch_map.contains_key("circleSearch") || patch_map.contains_key("voice") {
        use tauri_plugin_global_shortcut::GlobalShortcutExt;
        let full_settings = superagent_core_v2::storage::SettingsStore::new().load_raw().unwrap_or_default();
        let _ = app.global_shortcut().unregister_all();

        // 1. Circle to Search shortcut
        let cs_enabled = patch_map.get("circleSearch")
            .and_then(|cs| cs.get("enabled"))
            .and_then(|v| v.as_bool())
            .or_else(|| full_settings.get("circleSearch").and_then(|cs| cs.get("enabled")).and_then(|v| v.as_bool()))
            .unwrap_or(true);

        let cs_shortcut = patch_map.get("circleSearch")
            .and_then(|cs| cs.get("shortcut"))
            .and_then(|v| v.as_str())
            .or_else(|| full_settings.get("circleSearch").and_then(|cs| cs.get("shortcut")).and_then(|v| v.as_str()))
            .unwrap_or("CommandOrControl+Shift+S");

        if cs_enabled {
            let _ = app.global_shortcut().register(cs_shortcut);
        }

        // 2. Global Voice Dictation shortcut
        let voice_enabled = patch_map.get("voice")
            .and_then(|v| v.get("globalVoiceEnabled").or_else(|| v.get("typingEnabled")).or_else(|| v.get("enabled")))
            .and_then(|b| b.as_bool())
            .or_else(|| full_settings.get("voice").and_then(|v| v.get("globalVoiceEnabled").or_else(|| v.get("typingEnabled")).or_else(|| v.get("enabled"))).and_then(|b| b.as_bool()))
            .unwrap_or(false);

        let voice_shortcut = patch_map.get("voice")
            .and_then(|v| v.get("typingShortcut").or_else(|| v.get("shortcut")))
            .and_then(|s| s.as_str())
            .or_else(|| full_settings.get("voice").and_then(|v| v.get("typingShortcut").or_else(|| v.get("shortcut"))).and_then(|s| s.as_str()))
            .unwrap_or("CommandOrControl+Alt+V");

        if voice_enabled {
            let _ = app.global_shortcut().register(voice_shortcut);
        }
    }

    if !patch_map.is_empty() {
        superagent_core_v2::storage::SettingsStore::new()
            .save_patch(&serde_json::Value::Object(patch_map))
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}


#[tauri::command]
pub fn store_read() -> serde_json::Value {
    let settings_val = settings_read();
    let providers = settings_val.get("providers").cloned().unwrap_or_else(|| serde_json::json!([]));
    let models = settings_val.get("models").cloned().unwrap_or_else(|| serde_json::json!([]));

    let storage = superagent_core_v2::storage::ChatStorage::new();
    let chats_meta = storage.list_sessions().unwrap_or_default();
    
    let mut chats = Vec::new();
    for meta in chats_meta {
        chats.push(serde_json::json!({
            "id": meta.id,
            "title": meta.title,
            "project": meta.project,
            "model": meta.model,
            "timestamp": meta.created_at,
            "updatedAt": meta.updated_at,
            "stepCount": meta.message_count,
            "isRunning": false
        }));
    }

    let conv_dir = get_user_data_dir().join("conversation");
    let mut projects = Vec::new();
    for dir_name in &["projects", "Projects"] {
        let projects_dir = conv_dir.join(dir_name);
        if let Ok(entries) = fs::read_dir(&projects_dir) {
            for entry in entries.flatten() {
                let path = entry.path();
                if path.is_dir() {
                    let meta_file = path.join("meta.json");
                    let proj_file = path.join("project.json");
                    if let Ok(c) = fs::read_to_string(&meta_file).or_else(|_| fs::read_to_string(&proj_file)) {
                        if let Ok(v) = serde_json::from_str::<serde_json::Value>(&c) {
                            projects.push(v);
                        }
                    }
                }
            }
        }
    }

    serde_json::json!({
        "connectedProviders": providers,
        "modelsCatalog": models,
        "projects": projects,
        "chats": chats
    })
}

#[tauri::command]
pub fn store_write(
    data: Option<serde_json::Value>,
    content: Option<serde_json::Value>,
    payload: Option<serde_json::Value>,
    connected_providers: Option<serde_json::Value>,
    models_catalog: Option<serde_json::Value>,
    projects: Option<serde_json::Value>,
    chats: Option<serde_json::Value>,
) -> Result<(), String> {
    let mut patch = serde_json::Map::new();

    let full_obj = data.or(content).or(payload);
    if let Some(obj) = full_obj.as_ref().and_then(|v| v.as_object()) {
        if let Some(p) = obj.get("connectedProviders").or_else(|| obj.get("connected_providers")).or_else(|| obj.get("providers")) {
            if p.is_array() {
                patch.insert("providers".to_string(), p.clone());
            }
        }
        if let Some(m) = obj.get("modelsCatalog").or_else(|| obj.get("models_catalog")).or_else(|| obj.get("models")) {
            if m.is_array() {
                patch.insert("models".to_string(), m.clone());
            }
        }
        if let Some(c_arr) = obj.get("chats").and_then(|v| v.as_array()) {
            for c in c_arr {
                let _ = superagent_core_v2::storage::save_stored_chat_from_json(c);
            }
        }
        if let Some(p_arr) = obj.get("projects").and_then(|v| v.as_array()) {
            for p in p_arr {
                let _ = superagent_core_v2::storage::save_stored_project_from_json(p);
            }
        }
    }

    if let Some(p) = connected_providers {
        if p.is_array() {
            patch.insert("providers".to_string(), p);
        }
    }
    if let Some(m) = models_catalog {
        if m.is_array() {
            patch.insert("models".to_string(), m);
        }
    }
    if let Some(c_arr) = chats.as_ref().and_then(|v| v.as_array()) {
        for c in c_arr {
            let _ = superagent_core_v2::storage::save_stored_chat_from_json(c);
        }
    }
    if let Some(p_arr) = projects.as_ref().and_then(|v| v.as_array()) {
        for p in p_arr {
            let _ = superagent_core_v2::storage::save_stored_project_from_json(p);
        }
    }

    if !patch.is_empty() {
        superagent_core_v2::storage::SettingsStore::new()
            .save_patch(&serde_json::Value::Object(patch))
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub fn chat_steps_read(chat_id: Option<String>, id: Option<String>, payload: Option<serde_json::Value>) -> Vec<serde_json::Value> {
    let target_id = chat_id.or(id).or_else(|| {
        payload.and_then(|p| {
            if let Some(s) = p.as_str() {
                Some(s.to_string())
            } else {
                p.get("chatId").and_then(|v| v.as_str()).map(|s| s.to_string())
            }
        })
    });
    if let Some(cid) = target_id {
        let chat_dir = get_user_data_dir().join("conversation").join("Chats").join(&cid);
        let steps_file = chat_dir.join("steps.json");
        if let Ok(content) = fs::read_to_string(&steps_file) {
            if let Ok(steps) = serde_json::from_str::<Vec<serde_json::Value>>(&content) {
                return steps;
            }
        }
    }
    Vec::new()
}

#[tauri::command]
pub fn window_minimize(app: AppHandle) -> Result<(), String> {
    minimize_window(app)
}

#[tauri::command]
pub fn window_maximize(app: AppHandle) -> Result<(), String> {
    toggle_window_maximize(app)
}

#[tauri::command]
pub fn window_close(app: AppHandle) -> Result<(), String> {
    close_window(app)
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct DetectedModel {
    pub id: String,
    pub name: String,
    #[serde(rename = "contextLimit", default)]
    pub context_limit: Option<String>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct DetectedProvider {
    pub id: String,
    pub name: String,
    #[serde(rename = "type")]
    pub provider_type: String,
    #[serde(rename = "apiKey", default)]
    pub api_key: String,
    #[serde(rename = "baseUrl", default)]
    pub base_url: String,
    #[serde(default)]
    pub models: Vec<DetectedModel>,
}

#[tauri::command]
pub fn auto_detect_providers() -> Vec<DetectedProvider> {
    let mut detected = Vec::new();

    if check_ollama_port() {
        detected.push(DetectedProvider {
            id: "ollama".to_string(),
            name: "Ollama (Local)".to_string(),
            provider_type: "custom".to_string(),
            api_key: "".to_string(),
            base_url: "http://localhost:11434".to_string(),
            models: vec![
                DetectedModel {
                    id: "llama3.2".to_string(),
                    name: "Llama 3.2 (Local)".to_string(),
                    context_limit: Some("128k".to_string()),
                }
            ],
        });
    }

    if let Ok(key) = std::env::var("OPENAI_API_KEY") {
        if !key.trim().is_empty() {
            detected.push(DetectedProvider {
                id: "chatgpt".to_string(),
                name: "OpenAI (ChatGPT)".to_string(),
                provider_type: "env".to_string(),
                api_key: key,
                base_url: "https://api.openai.com/v1".to_string(),
                models: vec![
                    DetectedModel {
                        id: "gpt-4o".to_string(),
                        name: "GPT-4o".to_string(),
                        context_limit: Some("128k".to_string()),
                    },
                    DetectedModel {
                        id: "gpt-4o-mini".to_string(),
                        name: "GPT-4o Mini".to_string(),
                        context_limit: Some("128k".to_string()),
                    },
                ],
            });
        }
    }

    if let Ok(key) = std::env::var("ANTHROPIC_API_KEY") {
        if !key.trim().is_empty() {
            detected.push(DetectedProvider {
                id: "claude".to_string(),
                name: "Anthropic Claude".to_string(),
                provider_type: "env".to_string(),
                api_key: key,
                base_url: "https://api.anthropic.com".to_string(),
                models: vec![
                    DetectedModel {
                        id: "claude-3-7-sonnet-20250219".to_string(),
                        name: "Claude 3.7 Sonnet".to_string(),
                        context_limit: Some("200k".to_string()),
                    },
                    DetectedModel {
                        id: "claude-3-5-haiku-20241022".to_string(),
                        name: "Claude 3.5 Haiku".to_string(),
                        context_limit: Some("200k".to_string()),
                    },
                ],
            });
        }
    }

    if let Ok(key) = std::env::var("GEMINI_API_KEY").or_else(|_| std::env::var("GOOGLE_API_KEY")) {
        if !key.trim().is_empty() {
            detected.push(DetectedProvider {
                id: "gemini".to_string(),
                name: "Google Gemini".to_string(),
                provider_type: "env".to_string(),
                api_key: key,
                base_url: "https://generativelanguage.googleapis.com".to_string(),
                models: vec![
                    DetectedModel {
                        id: "gemini-2.5-pro".to_string(),
                        name: "Gemini 2.5 Pro".to_string(),
                        context_limit: Some("1M".to_string()),
                    },
                    DetectedModel {
                        id: "gemini-2.5-flash".to_string(),
                        name: "Gemini 2.5 Flash".to_string(),
                        context_limit: Some("1M".to_string()),
                    },
                ],
            });
        }
    }

    detected
}

#[tauri::command]
pub fn skills_catalog() -> Vec<serde_json::Value> {
    Vec::new()
}

#[tauri::command]
pub fn mcp_catalog() -> Vec<serde_json::Value> {
    Vec::new()
}

#[tauri::command]
pub fn plugins_catalog() -> Vec<serde_json::Value> {
    Vec::new()
}

#[tauri::command]
pub fn skills_list(_payload: Option<serde_json::Value>) -> Vec<serde_json::Value> {
    let mut skills = Vec::new();
    let home = std::env::var("USERPROFILE")
        .or_else(|_| std::env::var("HOME"))
        .unwrap_or_else(|_| ".".to_string());
    let skills_dir = std::path::PathBuf::from(home).join(".superagent").join("skills");
    if let Ok(entries) = fs::read_dir(&skills_dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_dir() {
                let name = path.file_name().unwrap_or_default().to_string_lossy().to_string();
                let desc_file = path.join("SKILL.md");
                let instructions = fs::read_to_string(&desc_file).unwrap_or_default();
                skills.push(serde_json::json!({
                    "id": name,
                    "name": name,
                    "description": instructions.lines().next().unwrap_or("User skill"),
                    "instructions": instructions,
                    "scope": "global"
                }));
            }
        }
    }
    skills
}

#[tauri::command]
pub fn skills_save(name: String, description: Option<String>, instructions: Option<String>) -> serde_json::Value {
    let home = std::env::var("USERPROFILE")
        .or_else(|_| std::env::var("HOME"))
        .unwrap_or_else(|_| ".".to_string());
    let skill_dir = std::path::PathBuf::from(home).join(".superagent").join("skills").join(&name);
    let _ = fs::create_dir_all(&skill_dir);
    let content = instructions.unwrap_or_else(|| description.unwrap_or_default());
    let _ = fs::write(skill_dir.join("SKILL.md"), content);
    serde_json::json!({ "success": true })
}

#[tauri::command]
pub fn skills_import_check(_payload: Option<serde_json::Value>) -> serde_json::Value {
    serde_json::json!({ "canImport": false, "skills": [] })
}

#[tauri::command]
pub fn skills_import_perform(_payload: Option<serde_json::Value>) -> serde_json::Value {
    serde_json::json!({ "success": true, "importedCount": 0 })
}

#[tauri::command]
pub fn kanban_load(_payload: Option<serde_json::Value>) -> serde_json::Value {
    serde_json::json!([])
}

#[tauri::command]
pub fn kanban_save(_payload: Option<serde_json::Value>) -> serde_json::Value {
    serde_json::json!({ "success": true })
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
            if let Ok(Some(monitor)) = window.current_monitor() {
                let mon_size = monitor.size();
                let scale = monitor.scale_factor();
                let logical_w = mon_size.width as f64 / scale;
                let logical_h = mon_size.height as f64 / scale;
                let target_w = (logical_w * 0.75).max(960.0).min(logical_w - 40.0);
                let target_h = (logical_h * 0.80).max(640.0).min(logical_h - 60.0);
                let _ = window.set_size(tauri::Size::Logical(tauri::LogicalSize {
                    width: target_w,
                    height: target_h,
                }));
                let _ = window.center();
            }
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
        let saved_settings = superagent_core_v2::storage::SettingsStore::new().load_raw().unwrap_or_default();
        let close_to_tray = saved_settings
            .get("general")
            .and_then(|g| g.get("closeToTray"))
            .and_then(|v| v.as_bool())
            .unwrap_or(true);

        if close_to_tray {
            let _ = window.hide();
        } else {
            window.close().map_err(|e| e.to_string())?;
        }
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

#[tauri::command]
pub fn circle_search_get_screen_image() -> Result<String, String> {
    let screens = screenshots::Screen::all().map_err(|e| e.to_string())?;
    let screen = screens.into_iter().next().ok_or_else(|| "No screens detected".to_string())?;
    let image = screen.capture().map_err(|e| e.to_string())?;
    let mut bytes: Vec<u8> = Vec::new();
    image
        .write_to(&mut Cursor::new(&mut bytes), screenshots::image::ImageOutputFormat::Jpeg(85))
        .map_err(|e| e.to_string())?;
    let b64 = base64::engine::general_purpose::STANDARD.encode(&bytes);
    Ok(format!("data:image/jpeg;base64,{}", b64))
}

#[tauri::command]
pub fn circle_search_capture_area(
    app: AppHandle,
    x: Option<i32>,
    y: Option<i32>,
    width: Option<u32>,
    height: Option<u32>,
) -> Result<String, String> {
    let window = app.get_webview_window("circle_search");
    let was_visible = window.as_ref().and_then(|w| w.is_visible().ok()).unwrap_or(false);
    if was_visible {
        if let Some(ref w) = window {
            let _ = w.hide();
            std::thread::sleep(std::time::Duration::from_millis(30));
        }
    }

    let screens = screenshots::Screen::all().map_err(|e| e.to_string())?;
    let screen = screens.into_iter().next().ok_or_else(|| "No screens detected".to_string())?;
    let full_image = screen.capture().map_err(|e| e.to_string())?;

    if was_visible {
        if let Some(ref w) = window {
            let _ = w.show();
        }
    }

    let img_w = full_image.width();
    let img_h = full_image.height();
    let scale_factor = screen.display_info.scale_factor as f64;

    let cropped = if let (Some(rx), Some(ry), Some(rw), Some(rh)) = (x, y, width, height) {
        if rw > 0 && rh > 0 {
            let phys_x = ((rx as f64) * scale_factor).round().max(0.0) as u32;
            let phys_y = ((ry as f64) * scale_factor).round().max(0.0) as u32;
            let phys_w = ((rw as f64) * scale_factor).round().max(1.0) as u32;
            let phys_h = ((rh as f64) * scale_factor).round().max(1.0) as u32;

            let crop_x = phys_x.min(img_w);
            let crop_y = phys_y.min(img_h);
            let crop_w = phys_w.min(img_w.saturating_sub(crop_x));
            let crop_h = phys_h.min(img_h.saturating_sub(crop_y));

            if crop_w > 0 && crop_h > 0 {
                use screenshots::image::GenericImageView;
                full_image.view(crop_x, crop_y, crop_w, crop_h).to_image()
            } else {
                full_image
            }
        } else {
            full_image
        }
    } else {
        full_image
    };

    let mut bytes: Vec<u8> = Vec::new();
    cropped
        .write_to(&mut Cursor::new(&mut bytes), screenshots::image::ImageOutputFormat::Png)
        .map_err(|e| e.to_string())?;
    let b64 = base64::engine::general_purpose::STANDARD.encode(&bytes);
    Ok(format!("data:image/png;base64,{}", b64))
}



fn spawn_native_circle_search() -> Result<(), String> {
    // 1. Check directory of current executable
    if let Ok(current_exe) = std::env::current_exe() {
        if let Some(parent) = current_exe.parent() {
            let candidate_names = [
                "superagent-circle-native.exe",
                "superagent-circle-native",
            ];
            for name in &candidate_names {
                let candidate = parent.join(name);
                if candidate.exists() {
                    let _ = std::process::Command::new(&candidate)
                        .spawn()
                        .map_err(|e| format!("Failed to spawn native overlay: {}", e))?;
                    return Ok(());
                }
            }
        }
    }

    // 2. Check target/debug and target/release relative to current execution context
    let dev_candidates = [
        "target/debug/superagent-circle-native.exe",
        "target/debug/superagent-circle-native",
        "target/release/superagent-circle-native.exe",
        "target/release/superagent-circle-native",
        "../target/debug/superagent-circle-native.exe",
        "../../target/debug/superagent-circle-native.exe",
    ];
    for rel in &dev_candidates {
        let p = std::path::PathBuf::from(rel);
        if p.exists() {
            let _ = std::process::Command::new(&p)
                .spawn()
                .map_err(|e| format!("Failed to spawn dev native overlay: {}", e))?;
            return Ok(());
        }
    }

    // 3. Fallback: try PATH
    std::process::Command::new("superagent-circle-native")
        .spawn()
        .map(|_| ())
        .map_err(|e| format!("Native overlay binary not found: {}", e))
}

#[tauri::command]
pub fn circle_search_show(app: AppHandle) -> Result<(), String> {
    let saved_settings = superagent_core_v2::storage::SettingsStore::new().load_raw().unwrap_or_default();
    let is_enabled = saved_settings
        .get("circleSearch")
        .and_then(|cs| cs.get("enabled"))
        .and_then(|e| e.as_bool())
        .unwrap_or(true);

    if !is_enabled {
        return Ok(());
    }

    let use_native = saved_settings
        .get("circleSearch")
        .and_then(|cs| cs.get("useNativeOverlay"))
        .and_then(|v| v.as_bool())
        .unwrap_or(true);

    if use_native {
        if let Ok(()) = spawn_native_circle_search() {
            return Ok(());
        }
    }

    if let Some(window) = app.get_webview_window("circle_search") {
        if let Ok(Some(monitor)) = window.current_monitor() {
            let size = monitor.size();
            let pos = monitor.position();
            let _ = window.set_position(tauri::Position::Physical(*pos));
            let _ = window.set_size(tauri::Size::Physical(*size));
        }
        let _ = window.set_always_on_top(true);
        let _ = window.show();
        let _ = window.set_focus();
        let _ = window.emit("circle-search-window-shown", ());
    }
    Ok(())
}

#[tauri::command]
pub fn circle_search_hide(app: AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("circle_search") {
        let _ = window.hide();
    }
    Ok(())
}

#[tauri::command]
pub fn circle_search_toggle(app: AppHandle) -> Result<(), String> {
    let saved_settings = superagent_core_v2::storage::SettingsStore::new().load_raw().unwrap_or_default();
    let is_enabled = saved_settings
        .get("circleSearch")
        .and_then(|cs| cs.get("enabled"))
        .and_then(|e| e.as_bool())
        .unwrap_or(true);

    if !is_enabled {
        return Ok(());
    }

    let use_native = saved_settings
        .get("circleSearch")
        .and_then(|cs| cs.get("useNativeOverlay"))
        .and_then(|v| v.as_bool())
        .unwrap_or(true);

    if use_native {
        if let Ok(()) = spawn_native_circle_search() {
            return Ok(());
        }
    }

    if let Some(window) = app.get_webview_window("circle_search") {
        if window.is_visible().unwrap_or(false) {
            let _ = window.hide();
        } else {
            let _ = circle_search_show(app);
        }
    }
    Ok(())
}

pub fn spawn_native_voice_dictation() -> Result<(), String> {
    // 1. Try sidecar bundled path
    if let Ok(exe) = std::env::current_exe() {
        if let Some(parent) = exe.parent() {
            let candidate = parent.join("superagent-dictation-native.exe");
            if candidate.exists() {
                let _ = std::process::Command::new(&candidate)
                    .spawn()
                    .map_err(|e| format!("Failed to spawn native dictation: {}", e))?;
                return Ok(());
            }
        }
    }

    // 2. Try workspace target/debug or target/release
    let dev_candidates = [
        "target/debug/superagent-dictation-native.exe",
        "target/debug/superagent-dictation-native",
        "target/release/superagent-dictation-native.exe",
        "target/release/superagent-dictation-native",
        "../target/debug/superagent-dictation-native.exe",
        "../../target/debug/superagent-dictation-native.exe",
    ];
    for rel in &dev_candidates {
        let p = std::path::PathBuf::from(rel);
        if p.exists() {
            let _ = std::process::Command::new(&p)
                .spawn()
                .map_err(|e| format!("Failed to spawn dev native dictation: {}", e))?;
            return Ok(());
        }
    }

    // 3. Fallback: try PATH
    std::process::Command::new("superagent-dictation-native")
        .spawn()
        .map(|_| ())
        .map_err(|e| format!("Native dictation binary not found: {}", e))
}

#[tauri::command]
pub fn voice_dictation_toggle(_app: AppHandle) -> Result<(), String> {
    let saved_settings = superagent_core_v2::storage::SettingsStore::new().load_raw().unwrap_or_default();
    let is_enabled = saved_settings
        .get("voice")
        .and_then(|v| v.get("globalVoiceEnabled").or_else(|| v.get("typingEnabled")).or_else(|| v.get("enabled")))
        .and_then(|e| e.as_bool())
        .unwrap_or(false);

    if !is_enabled {
        return Ok(());
    }

    spawn_native_voice_dictation()
}

