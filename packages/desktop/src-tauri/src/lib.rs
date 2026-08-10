pub mod commands;

use commands::*;
use tauri::{
    menu::{MenuBuilder, MenuItemBuilder},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Builder, Manager, PhysicalPosition, Position, WebviewWindow, WindowEvent,
};

fn position_artifacts_window(window: &WebviewWindow) {
    if let Ok(Some(monitor)) = window.current_monitor() {
        let monitor_size = monitor.size();
        let scale_factor = monitor.scale_factor();

        let window_width = (380.0 * scale_factor) as i32;
        let window_height = (540.0 * scale_factor) as i32;

        let x = (monitor_size.width as i32) - window_width - 16;
        let y = (monitor_size.height as i32) - window_height - 56;

        let _ = window.set_position(Position::Physical(PhysicalPosition { x, y }));
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .on_window_event(|window, event| {
            if window.label() == "artifacts" {
                if let WindowEvent::Focused(false) = event {
                    let _ = window.hide();
                }
            }
        })
        .setup(|app| {
            let show_item = MenuItemBuilder::with_id("show", "Show Main App").build(app)?;
            let artifacts_item = MenuItemBuilder::with_id("artifacts", "Artifacts Inspector").build(app)?;
            let quit_item = MenuItemBuilder::with_id("quit", "Quit SuperAgent").build(app)?;

            let menu = MenuBuilder::new(app)
                .items(&[&artifacts_item, &show_item, &quit_item])
                .build()?;

            let icon = app
                .default_window_icon()
                .cloned()
                .expect("SuperAgent window icon missing for system tray");

            let _tray = TrayIconBuilder::new()
                .icon(icon)
                .tooltip("SuperAgent Artifacts & System Tray")
                .menu(&menu)
                .on_menu_event(|app, event| match event.id().as_ref() {
                    "show" => {
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    }
                    "artifacts" => {
                        if let Some(window) = app.get_webview_window("artifacts") {
                            position_artifacts_window(&window);
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    }
                    "quit" => {
                        app.exit(0);
                    }
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        let app = tray.app_handle();
                        if let Some(window) = app.get_webview_window("artifacts") {
                            if window.is_visible().unwrap_or(false) {
                                let _ = window.hide();
                            } else {
                                position_artifacts_window(&window);
                                let _ = window.show();
                                let _ = window.set_focus();
                            }
                        }
                    }
                })
                .build(app)?;

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_system_info,
            get_app_version,
            toggle_window_maximize,
            minimize_window,
            close_window,
            artifact_list,
            artifact_start,
            artifact_stop,
            artifact_open,
            artifact_delete,
            artifact_open_folder
        ])
        .run(tauri::generate_context!())
        .expect("error while running SuperAgent tauri application");
}
