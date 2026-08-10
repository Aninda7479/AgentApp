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

fn seed_micro_apps_if_empty(base_dir: &PathBuf) {
    let _ = fs::create_dir_all(base_dir);

    // Seed 1: Quick Calculator App
    let calc_dir = base_dir.join("quick-calc");
    if !calc_dir.exists() {
        let _ = fs::create_dir_all(&calc_dir);
        let manifest = r#"{
  "name": "Quick Calculator",
  "description": "Glassmorphism dark scientific mini-calculator app",
  "version": "1.0.0",
  "type": "static",
  "icon": "🧮",
  "entry": "index.html"
}"#;
        let html = r#"<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Quick Calculator</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; font-family: 'Segoe UI', system-ui, sans-serif; }
    body { background: #0f172a; color: #f8fafc; display: flex; align-items: center; justify-content: center; min-height: 100vh; padding: 16px; }
    .calc { background: rgba(30, 41, 59, 0.85); backdrop-filter: blur(16px); border: 1px solid rgba(255,255,255,0.1); border-radius: 16px; width: 100%; max-width: 320px; padding: 20px; box-shadow: 0 20px 40px rgba(0,0,0,0.5); }
    .display { background: #020617; border-radius: 12px; padding: 16px; text-align: right; font-size: 28px; font-weight: 600; margin-bottom: 20px; border: 1px solid rgba(255,255,255,0.05); min-height: 64px; overflow-x: auto; word-break: break-all; color: #38bdf8; }
    .grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; }
    button { background: rgba(51, 65, 85, 0.6); color: #f8fafc; border: 1px solid rgba(255,255,255,0.08); padding: 14px; font-size: 18px; font-weight: 600; border-radius: 10px; cursor: pointer; transition: all 0.15s ease; }
    button:hover { background: rgba(71, 85, 105, 0.8); transform: translateY(-1px); }
    button:active { transform: translateY(1px); }
    button.op { background: rgba(14, 165, 233, 0.2); color: #38bdf8; border-color: rgba(56, 189, 248, 0.3); }
    button.eq { background: #0284c7; color: #fff; grid-column: span 2; }
    button.clear { background: rgba(239, 68, 68, 0.2); color: #f87171; border-color: rgba(248, 113, 113, 0.3); }
  </style>
</head>
<body>
  <div class="calc">
    <div class="display" id="display">0</div>
    <div class="grid">
      <button class="clear" onclick="clearDisplay()">C</button>
      <button onclick="append('(')">(</button>
      <button onclick="append(')')">)</button>
      <button class="op" onclick="append('/')">÷</button>
      <button onclick="append('7')">7</button>
      <button onclick="append('8')">8</button>
      <button onclick="append('9')">9</button>
      <button class="op" onclick="append('*')">×</button>
      <button onclick="append('4')">4</button>
      <button onclick="append('5')">5</button>
      <button onclick="append('6')">6</button>
      <button class="op" onclick="append('-')">-</button>
      <button onclick="append('1')">1</button>
      <button onclick="append('2')">2</button>
      <button onclick="append('3')">3</button>
      <button class="op" onclick="append('+')">+</button>
      <button onclick="append('0')">0</button>
      <button onclick="append('.')">.</button>
      <button class="eq" onclick="calculate()">=</button>
    </div>
  </div>
  <script>
    const display = document.getElementById('display');
    let expr = '0';
    function update() { display.innerText = expr || '0'; }
    function append(v) {
      if (expr === '0' && v !== '.') expr = '';
      expr += v;
      update();
    }
    function clearDisplay() { expr = '0'; update(); }
    function calculate() {
      try {
        expr = String(Function('"use strict";return (' + expr + ')')());
      } catch(e) {
        expr = 'Error';
      }
      update();
    }
  </script>
</body>
</html>"#;
        let _ = fs::write(calc_dir.join("manifest.json"), manifest);
        let _ = fs::write(calc_dir.join("index.html"), html);
    }

    // Seed 2: Super Scratchpad Notepad
    let notes_dir = base_dir.join("scratchpad");
    if !notes_dir.exists() {
        let _ = fs::create_dir_all(&notes_dir);
        let manifest = r#"{
  "name": "Super Scratchpad",
  "description": "Persistent local markdown notepad artifact app",
  "version": "1.1.0",
  "type": "static",
  "icon": "📝",
  "entry": "index.html"
}"#;
        let html = r#"<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Super Scratchpad</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; font-family: system-ui, sans-serif; }
    body { background: #090d16; color: #e2e8f0; height: 100vh; display: flex; flex-direction: column; padding: 16px; }
    header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }
    h2 { font-size: 18px; color: #a855f7; display: flex; align-items: center; gap: 8px; }
    .status { font-size: 12px; color: #94a3b8; }
    textarea { flex: 1; background: #131b2e; color: #f1f5f9; border: 1px solid #1e293b; border-radius: 12px; padding: 16px; font-size: 14px; line-height: 1.6; resize: none; outline: none; }
    textarea:focus { border-color: #a855f7; }
  </style>
</head>
<body>
  <header>
    <h2>📝 Super Scratchpad</h2>
    <span class="status" id="status">Auto-saved locally</span>
  </header>
  <textarea id="note" placeholder="Type your ideas, snippets, or code scratch notes here..."></textarea>
  <script>
    const ta = document.getElementById('note');
    const st = document.getElementById('status');
    ta.value = localStorage.getItem('scratch_note') || '';
    ta.addEventListener('input', () => {
      localStorage.setItem('scratch_note', ta.value);
      st.innerText = 'Saved at ' + new Date().toLocaleTimeString();
    });
  </script>
</body>
</html>"#;
        let _ = fs::write(notes_dir.join("manifest.json"), manifest);
        let _ = fs::write(notes_dir.join("index.html"), html);
    }
}

#[tauri::command]
pub fn artifact_list() -> Vec<ArtifactRuntimeState> {
    let dir = get_artifacts_dir();
    seed_micro_apps_if_empty(&dir);

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
        "http://localhost:14692".to_string()
    };

    let _ = open::that(target_str);
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
    let _ = open::that(dir);
    Ok(())
}

#[tauri::command]
pub fn get_system_info() -> SystemInfoResponse {
    let mut sys = System::new_all();
    sys.refresh_all();

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
pub fn get_app_version() -> String {
    env!("CARGO_PKG_VERSION").to_string()
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
