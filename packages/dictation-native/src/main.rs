#![windows_subsystem = "windows"]

mod api;
mod audio;
mod app;

use app::DictationApp;
use eframe::egui;

#[cfg(target_os = "windows")]
fn get_screen_center_pos() -> (f32, f32) {
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
    ((sw - 200.0) / 2.0, sh - 140.0)
}

#[cfg(not(target_os = "windows"))]
fn get_screen_center_pos() -> (f32, f32) {
    (860.0, 940.0)
}

fn main() -> eframe::Result<()> {
    let rt = tokio::runtime::Builder::new_multi_thread()
        .enable_all()
        .build()
        .expect("Failed to initialize tokio runtime");
    let _guard = rt.enter();

    let (pos_x, pos_y) = get_screen_center_pos();

    let native_options = eframe::NativeOptions {
        viewport: egui::ViewportBuilder::default()
            .with_title("SuperAgent Voice Dictation")
            .with_decorations(false)
            .with_transparent(true)
            .with_always_on_top()
            .with_resizable(false)
            .with_inner_size([200.0, 50.0])
            .with_position([pos_x, pos_y])
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
        Box::new(|cc| {
            cc.egui_ctx.set_visuals(egui::Visuals::dark());
            Ok(Box::new(DictationApp::new()))
        }),
    )
}
