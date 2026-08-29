#![windows_subsystem = "windows"]

mod api;
mod audio;
mod app;

use app::DictationApp;
use eframe::egui;

fn main() -> eframe::Result<()> {
    let rt = tokio::runtime::Builder::new_multi_thread()
        .enable_all()
        .build()
        .expect("Failed to initialize tokio runtime");
    let _guard = rt.enter();

    let native_options = eframe::NativeOptions {
        viewport: egui::ViewportBuilder::default()
            .with_decorations(false)
            .with_transparent(true)
            .with_always_on_top()
            .with_fullsize_content_view(true)
            .with_maximized(true)
            .with_active(true)
            .with_visible(true),
        wgpu_options: eframe::egui_wgpu::WgpuConfiguration {
            present_mode: eframe::wgpu::PresentMode::AutoVsync,
            desired_maximum_frame_latency: Some(1),
            ..Default::default()
        },
        ..Default::default()
    };

    eframe::run_native(
        "SuperAgent Voice Dictation",
        native_options,
        Box::new(|_cc| Ok(Box::new(DictationApp::new()))),
    )
}
