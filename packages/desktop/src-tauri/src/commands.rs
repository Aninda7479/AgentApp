use serde::{Deserialize, Serialize};
use sysinfo::System;
use tauri::{AppHandle, Manager};

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
