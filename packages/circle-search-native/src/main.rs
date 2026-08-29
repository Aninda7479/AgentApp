#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod api;
mod app;
mod capture;

use app::CircleSearchApp;
use capture::capture_active_screen;

fn main() -> eframe::Result<()> {
    let rt = tokio::runtime::Builder::new_multi_thread()
        .enable_all()
        .build()
        .expect("Failed to initialize tokio runtime");
    let _guard = rt.enter();

    // 1. Capture screen before showing any window so there is zero latency/flicker
    let captured = match capture_active_screen() {
        Ok(c) => c,
        Err(e) => {
            eprintln!("Failed to capture screen for Circle to Search: {}", e);
            return Ok(());
        }
    };

    let screen_w = captured.width as f32;
    let screen_h = captured.height as f32;

    // 2. Configure native eframe viewport options for seamless transparent overlay
    let native_options = eframe::NativeOptions {
        viewport: egui::ViewportBuilder::default()
            .with_title("SuperAgent — Circle to Search (Native)")
            .with_decorations(false)
            .with_transparent(true)
            .with_always_on_top()
            .with_resizable(false)
            .with_inner_size([screen_w, screen_h])
            .with_position([0.0, 0.0])
            .with_active(true)
            .with_app_id("com.opensource.agentapp.circle-search"),
        ..Default::default()
    };

    eframe::run_native(
        "SuperAgent Circle to Search",
        native_options,
        Box::new(move |cc| {
            // Configure dark mode theme
            cc.egui_ctx.set_visuals(egui::Visuals::dark());
            Ok(Box::new(CircleSearchApp::new(captured, cc)))
        }),
    )
}
