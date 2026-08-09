pub mod commands;

use commands::*;
use tauri::Builder;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .invoke_handler(tauri::generate_handler![
            get_system_info,
            get_app_version,
            toggle_window_maximize,
            minimize_window,
            close_window
        ])
        .run(tauri::generate_context!())
        .expect("error while running SuperAgent tauri application");
}
