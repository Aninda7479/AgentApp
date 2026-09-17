#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod api;
mod app;

use app::ArtifactsApp;
use eframe::egui;

const WINDOW_WIDTH: f32 = 380.0;
const WINDOW_HEIGHT: f32 = 540.0;

#[cfg(target_os = "macos")]
fn calculate_companion_position() -> (f32, f32) {
    // Drops down directly from the macOS top status/menu bar near the right side
    let sw = 1440.0f32;
    let x = sw - WINDOW_WIDTH - 20.0;
    let y = 32.0f32;
    (x, y)
}

#[cfg(target_os = "windows")]
fn calculate_companion_position() -> (f32, f32) {
    extern "system" {
        fn GetSystemMetrics(nIndex: i32) -> i32;
    }
    let (sw, sh) = unsafe {
        let w = GetSystemMetrics(0); // SM_CXSCREEN
        let h = GetSystemMetrics(1); // SM_CYSCREEN
        if w > 0 && h > 0 {
            (w as f32, h as f32)
        } else {
            (1920.0, 1080.0)
        }
    };
    // Positioned directly above the bottom taskbar near the notification tray
    let x = sw - WINDOW_WIDTH - 16.0;
    let y = sh - WINDOW_HEIGHT - 56.0;
    (x, y)
}

#[cfg(not(any(target_os = "macos", target_os = "windows")))]
fn calculate_companion_position() -> (f32, f32) {
    (1440.0 - WINDOW_WIDTH - 24.0, 48.0)
}

fn main() -> eframe::Result<()> {
    let rt = tokio::runtime::Builder::new_multi_thread()
        .enable_all()
        .build()
        .expect("Failed to initialize tokio runtime");
    let _guard = rt.enter();

    let (pos_x, pos_y) = calculate_companion_position();

    let native_options = eframe::NativeOptions {
        viewport: egui::ViewportBuilder::default()
            .with_title("SuperAgent Artifacts Companion")
            .with_decorations(false)
            .with_transparent(true)
            .with_always_on_top()
            .with_resizable(false)
            .with_inner_size([WINDOW_WIDTH, WINDOW_HEIGHT])
            .with_position([pos_x, pos_y])
            .with_active(true)
            .with_visible(true)
            .with_app_id("com.opensource.agentapp.artifacts-native"),
        wgpu_options: eframe::egui_wgpu::WgpuConfiguration {
            present_mode: eframe::wgpu::PresentMode::AutoVsync,
            desired_maximum_frame_latency: Some(1),
            ..Default::default()
        },
        ..Default::default()
    };

    eframe::run_native(
        "SuperAgent Artifacts Companion",
        native_options,
        Box::new(|cc| {
            cc.egui_ctx.set_visuals(egui::Visuals::dark());
            Ok(Box::new(ArtifactsApp::new()))
        }),
    )
}
