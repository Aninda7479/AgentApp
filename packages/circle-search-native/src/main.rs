#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod api;
mod app;
mod capture;
mod card;
mod theme;

use app::CircleSearchApp;
use capture::capture_active_screen;

#[cfg(target_os = "windows")]
fn spawn_hotkey_listener() -> std::sync::mpsc::Receiver<()> {
    let (tx, rx) = std::sync::mpsc::channel();
    std::thread::spawn(move || {
        #[allow(clippy::upper_case_acronyms)]
        #[repr(C)]
        struct MSG {
            hwnd: *mut std::ffi::c_void,
            message: u32,
            w_param: usize,
            l_param: isize,
            time: u32,
            pt_x: i32,
            pt_y: i32,
        }

        #[link(name = "user32")]
        extern "system" {
            fn RegisterHotKey(
                hwnd: *mut std::ffi::c_void,
                id: i32,
                fs_modifiers: u32,
                vk: u32,
            ) -> i32;
            fn GetMessageW(
                msg: *mut MSG,
                hwnd: *mut std::ffi::c_void,
                w_msg_filter_min: u32,
                w_msg_filter_max: u32,
            ) -> i32;
        }

        const MOD_CONTROL: u32 = 0x0002;
        const MOD_SHIFT: u32 = 0x0004;
        const MOD_NOREPEAT: u32 = 0x4000;
        const VK_S: u32 = 0x53;
        const WM_HOTKEY: u32 = 0x0312;

        unsafe {
            if RegisterHotKey(
                std::ptr::null_mut(),
                1001,
                MOD_CONTROL | MOD_SHIFT | MOD_NOREPEAT,
                VK_S,
            ) != 0
            {
                let mut msg: MSG = std::mem::zeroed();
                while GetMessageW(&mut msg as *mut MSG, std::ptr::null_mut(), 0, 0) > 0 {
                    if msg.message == WM_HOTKEY {
                        let _ = tx.send(());
                    }
                }
            }
        }
    });
    rx
}

#[cfg(not(target_os = "windows"))]
fn spawn_hotkey_listener() -> std::sync::mpsc::Receiver<()> {
    let (_tx, rx) = std::sync::mpsc::channel();
    rx
}

fn main() -> eframe::Result<()> {
    let rt = tokio::runtime::Builder::new_multi_thread()
        .enable_all()
        .build()
        .expect("Failed to initialize tokio runtime");
    let _guard = rt.enter();

    // 1. Capture screen active under cursor before showing any window (zero flicker)
    let captured = match capture_active_screen() {
        Ok(c) => c,
        Err(e) => {
            eprintln!("Failed to capture screen for Circle to Search: {}", e);
            return Ok(());
        }
    };

    let origin_x = captured.origin_x;
    let origin_y = captured.origin_y;
    let screen_w = captured.width as f32;
    let screen_h = captured.height as f32;

    // 2. Start global hotkey listener (Ctrl+Shift+S) for resident background execution
    let hotkey_rx = spawn_hotkey_listener();

    // 3. Configure native eframe viewport options for seamless transparent overlay
    let native_options = eframe::NativeOptions {
        viewport: egui::ViewportBuilder::default()
            .with_title("SuperAgent — Circle to Search")
            .with_decorations(false)
            .with_transparent(true)
            .with_always_on_top()
            .with_resizable(false)
            .with_inner_size([screen_w, screen_h])
            .with_position([origin_x, origin_y])
            .with_active(true)
            .with_app_id("com.opensource.agentapp.circle-search"),
        ..Default::default()
    };

    eframe::run_native(
        "SuperAgent Circle to Search",
        native_options,
        Box::new(move |cc| {
            // Configure dark mode visuals
            cc.egui_ctx.set_visuals(egui::Visuals::dark());
            Ok(Box::new(CircleSearchApp::new(captured, cc, hotkey_rx)))
        }),
    )
}
