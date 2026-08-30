pub mod commands;

use commands::*;
use tauri::{
    menu::{MenuBuilder, MenuItemBuilder},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Builder, Manager, PhysicalPosition, Position, WebviewWindow, WindowEvent,
};
use std::sync::atomic::{AtomicBool, Ordering};

static IS_EXPLICIT_QUIT: AtomicBool = AtomicBool::new(false);

fn position_artifacts_window(window: &WebviewWindow) {
    let monitor = window
        .current_monitor()
        .ok()
        .flatten()
        .or_else(|| window.primary_monitor().ok().flatten());

    if let Some(monitor) = monitor {
        let monitor_size = monitor.size();
        let scale_factor = monitor.scale_factor();
        let monitor_pos = monitor.position();

        let window_width = (380.0 * scale_factor) as i32;
        let window_height = (540.0 * scale_factor) as i32;

        let x = monitor_pos.x + (monitor_size.width as i32) - window_width - 16;

        #[cfg(target_os = "macos")]
        let y = monitor_pos.y + (32.0 * scale_factor) as i32; // Drops down directly from macOS top menu bar

        #[cfg(not(target_os = "macos"))]
        let y = monitor_pos.y + (monitor_size.height as i32) - window_height - 56; // Above bottom taskbar on Windows/Linux

        let _ = window.set_position(Position::Physical(PhysicalPosition { x, y }));
        let _ = window.set_always_on_top(true);
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
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(|app, shortcut, event| {
                    use tauri_plugin_global_shortcut::ShortcutState;
                    if event.state() == ShortcutState::Pressed {
                        let sc_str = shortcut.to_string();
                        let saved_settings = superagent_core_v2::storage::SettingsStore::new().load_raw().unwrap_or_default();

                        let voice_shortcut = saved_settings
                            .get("voice")
                            .and_then(|v| v.get("typingShortcut").or_else(|| v.get("shortcut")))
                            .and_then(|s| s.as_str())
                            .unwrap_or("CommandOrControl+Alt+V");

                        if sc_str.eq_ignore_ascii_case(voice_shortcut)
                            || (voice_shortcut.contains("Alt") && sc_str.contains("Alt") && sc_str.contains("KeyV"))
                            || (voice_shortcut.contains("Super") && sc_str.contains("Super"))
                        {
                            let _ = voice_dictation_toggle(app.clone());
                        } else {
                            let _ = circle_search_toggle(app.clone());
                        }
                    }
                })
                .build(),
        )

        .on_window_event(|window, event| {
            if window.label() == "artifacts" {
                if let WindowEvent::Focused(false) = event {
                    let _ = window.hide();
                }
            } else if window.label() == "circle_search" {
                if let WindowEvent::Focused(false) = event {
                    // Circle to Search overlay remains on top until explicitly closed with ESC or click
                }
            } else if window.label() == "main" {
                if let WindowEvent::CloseRequested { api, .. } = event {
                    // Minimize to tray instead of killing the entire app process
                    api.prevent_close();
                    let _ = window.hide();
                }
            }
        })
        .setup(|app| {
            let superagent_dir = superagent_core_v2::storage::settings::get_superagent_dir();
            tauri::async_runtime::spawn(async move {
                let _ = superagent_core_v2::server::start_server(1469, "127.0.0.1", superagent_dir, None).await;
            });

            let args: Vec<String> = std::env::args().collect();
            let is_dormant = args.iter().any(|arg| {
                arg == "--autostart" || arg == "--hidden" || arg == "--minimized" || arg == "--background" || arg == "--dormant"
            });

            if let Some(main_window) = app.get_webview_window("main") {
                if is_dormant {
                    let _ = main_window.hide();
                } else {
                    let _ = main_window.show();
                    let _ = main_window.maximize();
                    let _ = main_window.set_focus();
                }
            }

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
                        IS_EXPLICIT_QUIT.store(true, Ordering::SeqCst);
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

            use tauri_plugin_global_shortcut::GlobalShortcutExt;
            let saved_settings = superagent_core_v2::storage::SettingsStore::new().load_raw().unwrap_or_default();
            let shortcut_str = saved_settings
                .get("circleSearch")
                .and_then(|cs| cs.get("shortcut"))
                .and_then(|s| s.as_str())
                .unwrap_or("CommandOrControl+Shift+S");

            let is_enabled = saved_settings
                .get("circleSearch")
                .and_then(|cs| cs.get("enabled"))
                .and_then(|e| e.as_bool())
                .unwrap_or(true);

            if is_enabled {
                let _ = app.global_shortcut().register(shortcut_str);
            }

            let voice_shortcut = saved_settings
                .get("voice")
                .and_then(|v| v.get("typingShortcut").or_else(|| v.get("shortcut")))
                .and_then(|s| s.as_str())
                .unwrap_or("CommandOrControl+Alt+V");

            let voice_enabled = saved_settings
                .get("voice")
                .and_then(|v| v.get("globalVoiceEnabled").or_else(|| v.get("typingEnabled")).or_else(|| v.get("enabled")))
                .and_then(|e| e.as_bool())
                .unwrap_or(false);

            if voice_enabled {
                let _ = app.global_shortcut().register(voice_shortcut);
            }

            Ok(())

        })
        .invoke_handler(tauri::generate_handler![
            get_system_info,
            system_info,
            get_app_version,
            app_version,
            toggle_window_maximize,
            minimize_window,
            close_window,
            window_maximize,
            window_minimize,
            window_close,
            artifact_list,
            artifact_start,
            artifact_stop,
            artifact_open,
            artifact_delete,
            artifact_open_folder,
            read_text_file,
            write_text_file,
            file_exists,
            read_global_memory,
            write_global_memory,
            read_settings_file,
            write_settings_file,
            settings_read,
            settings_write,
            store_read,
            store_write,
            chat_steps_read,
            check_ollama_port,
            search_workspace_files,
            auto_detect_providers,
            skills_catalog,
            mcp_catalog,
            plugins_catalog,
            skills_list,
            skills_save,
            skills_import_check,
            skills_import_perform,
            kanban_load,
            kanban_save,
            partner_list,
            partner_get,
            partner_set_active,
            partner_get_active,
            partner_import_json,
            partner_remove,
            partner_pick_model_file,
            partner_pick_model_folder,
            autostart_enable,
            autostart_disable,
            autostart_is_enabled,
            circle_search_get_screen_image,
            circle_search_capture_area,
            circle_search_show,
            circle_search_hide,
            circle_search_toggle,
            voice_dictation_toggle,
            ollama_status,
            check_ollama_installed,
            ollama_installed_models,
            ollama_start,
            start_ollama_service,
            ollama_settings_get,
            ollama_settings_save
        ])
        .build(tauri::generate_context!())
        .expect("error while building SuperAgent tauri application")
        .run(|app_handle, event| {
            match event {
                #[cfg(target_os = "macos")]
                tauri::RunEvent::Reopen { has_visible_windows, .. } => {
                    if !has_visible_windows {
                        if let Some(window) = app_handle.get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.unminimize();
                            let _ = window.set_focus();
                        }
                    }
                }
                tauri::RunEvent::ExitRequested { api, .. } => {
                    if !IS_EXPLICIT_QUIT.load(Ordering::SeqCst) {
                        let saved_settings = superagent_core_v2::storage::SettingsStore::new().load_raw().unwrap_or_default();
                        let close_to_tray = saved_settings
                            .get("general")
                            .and_then(|g| g.get("closeToTray"))
                            .and_then(|v| v.as_bool())
                            .unwrap_or(true);

                        if close_to_tray {
                            api.prevent_exit();
                            if let Some(window) = app_handle.get_webview_window("main") {
                                let _ = window.hide();
                            }
                        }
                    }
                }
                _ => {}
            }
        });
}


