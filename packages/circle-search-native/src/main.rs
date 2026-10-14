#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod api;
mod app;
mod capture;
mod card;
mod theme;

use app::CircleSearchApp;
use capture::capture_active_screen;

#[cfg(target_os = "windows")]
pub static MAIN_THREAD_ID: std::sync::atomic::AtomicU32 = std::sync::atomic::AtomicU32::new(0);
#[cfg(target_os = "windows")]
pub static MAIN_HWND: std::sync::atomic::AtomicUsize = std::sync::atomic::AtomicUsize::new(0);

#[cfg(target_os = "windows")]
#[allow(clippy::upper_case_acronyms)]
#[repr(C)]
pub struct MSG {
    pub hwnd: *mut std::ffi::c_void,
    pub message: u32,
    pub w_param: usize,
    pub l_param: isize,
    pub time: u32,
    pub pt_x: i32,
    pub pt_y: i32,
}

#[cfg(target_os = "windows")]
#[link(name = "user32")]
extern "system" {
    pub fn PeekMessageW(
        msg: *mut MSG,
        hwnd: *mut std::ffi::c_void,
        w_msg_filter_min: u32,
        w_msg_filter_max: u32,
        w_remove_msg: u32,
    ) -> i32;
    pub fn RegisterHotKey(hwnd: *mut std::ffi::c_void, id: i32, fs_modifiers: u32, vk: u32) -> i32;
    pub fn GetMessageW(
        msg: *mut MSG,
        hwnd: *mut std::ffi::c_void,
        w_msg_filter_min: u32,
        w_msg_filter_max: u32,
    ) -> i32;
    pub fn ShowWindow(hwnd: *mut std::ffi::c_void, n_cmd_show: i32) -> i32;
    pub fn SetForegroundWindow(hwnd: *mut std::ffi::c_void) -> i32;
    pub fn IsWindowVisible(hwnd: *mut std::ffi::c_void) -> i32;
    pub fn EnumThreadWindows(
        dw_thread_id: u32,
        lp_fn: extern "system" fn(*mut std::ffi::c_void, isize) -> i32,
        l_param: isize,
    ) -> i32;
    pub fn GetWindowTextW(
        hwnd: *mut std::ffi::c_void,
        lp_string: *mut u16,
        n_max_count: i32,
    ) -> i32;
}

#[cfg(target_os = "windows")]
#[link(name = "kernel32")]
extern "system" {
    pub fn GetCurrentThreadId() -> u32;
}

#[cfg(target_os = "windows")]
extern "system" fn enum_thread_wnd_callback(hwnd: *mut std::ffi::c_void, l_param: isize) -> i32 {
    let mut buffer = [0u16; 256];
    let len = unsafe { GetWindowTextW(hwnd, buffer.as_mut_ptr(), 256) };
    if len > 0 {
        let title = String::from_utf16_lossy(&buffer[..len as usize]);
        if title.contains("SuperAgent") || title.contains("Circle") {
            let out = unsafe { &mut *(l_param as *mut *mut std::ffi::c_void) };
            *out = hwnd;
            return 0; // Found target window
        }
    }
    1 // Continue enumeration
}

#[cfg(target_os = "windows")]
pub fn get_app_hwnd() -> *mut std::ffi::c_void {
    let existing = MAIN_HWND.load(std::sync::atomic::Ordering::SeqCst);
    if existing != 0 {
        return existing as *mut std::ffi::c_void;
    }
    let thread_id = MAIN_THREAD_ID.load(std::sync::atomic::Ordering::SeqCst);
    if thread_id == 0 {
        return std::ptr::null_mut();
    }
    let mut found: *mut std::ffi::c_void = std::ptr::null_mut();
    unsafe {
        EnumThreadWindows(
            thread_id,
            enum_thread_wnd_callback,
            &mut found as *mut _ as isize,
        );
    }
    if !found.is_null() {
        MAIN_HWND.store(found as usize, std::sync::atomic::Ordering::SeqCst);
    }
    found
}

#[cfg(target_os = "windows")]
fn spawn_hotkey_listener(
    egui_ctx: egui::Context,
) -> std::sync::mpsc::Receiver<Result<capture::CapturedScreen, String>> {
    let (tx, rx) = std::sync::mpsc::channel();
    std::thread::spawn(move || {
        const MOD_CONTROL: u32 = 0x0002;
        const MOD_SHIFT: u32 = 0x0004;
        const MOD_NOREPEAT: u32 = 0x4000;
        const VK_C: u32 = 0x43;
        const VK_S: u32 = 0x53;
        const WM_HOTKEY: u32 = 0x0312;

        unsafe {
            // Ensure thread has a Win32 message queue prior to RegisterHotKey
            let mut dummy: MSG = std::mem::zeroed();
            PeekMessageW(&mut dummy as *mut MSG, std::ptr::null_mut(), 0, 0, 0);

            // Register Ctrl+Shift+C (hotkey ID 1001)
            let mut reg_c = RegisterHotKey(
                std::ptr::null_mut(),
                1001,
                MOD_CONTROL | MOD_SHIFT | MOD_NOREPEAT,
                VK_C,
            );
            if reg_c == 0 {
                reg_c = RegisterHotKey(std::ptr::null_mut(), 1001, MOD_CONTROL | MOD_SHIFT, VK_C);
            }

            // Register Ctrl+Shift+S (hotkey ID 1002)
            let mut reg_s = RegisterHotKey(
                std::ptr::null_mut(),
                1002,
                MOD_CONTROL | MOD_SHIFT | MOD_NOREPEAT,
                VK_S,
            );
            if reg_s == 0 {
                reg_s = RegisterHotKey(std::ptr::null_mut(), 1002, MOD_CONTROL | MOD_SHIFT, VK_S);
            }

            if reg_c == 0 && reg_s == 0 {
                eprintln!("[CircleSearch] Warning: Failed to register global hotkey (Ctrl+Shift+C / Ctrl+Shift+S)");
            }

            let mut msg: MSG = std::mem::zeroed();
            while GetMessageW(&mut msg as *mut MSG, std::ptr::null_mut(), 0, 0) > 0 {
                if msg.message == WM_HOTKEY {
                    let hwnd = get_app_hwnd();

                    // If window was already visible, hide momentarily for pristine desktop capture
                    if !hwnd.is_null() && IsWindowVisible(hwnd) != 0 {
                        ShowWindow(hwnd, 0 /* SW_HIDE */);
                        std::thread::sleep(std::time::Duration::from_millis(40));
                    }

                    // 1. Capture clean active screen under cursor while overlay is hidden
                    let fresh = crate::capture::capture_active_screen();

                    // 2. Unhide window via OS API so winit does NOT drop redraw requests
                    if !hwnd.is_null() {
                        ShowWindow(hwnd, 5 /* SW_SHOW */);
                        SetForegroundWindow(hwnd);
                    }

                    // 3. Dispatch fresh capture to app and wake up winit event loop
                    let _ = tx.send(fresh);
                    egui_ctx.request_repaint();
                }
            }
        }
    });
    rx
}

#[cfg(not(target_os = "windows"))]
fn spawn_hotkey_listener(
    _egui_ctx: egui::Context,
) -> std::sync::mpsc::Receiver<Result<capture::CapturedScreen, String>> {
    let (_tx, rx) = std::sync::mpsc::channel();
    rx
}

fn main() -> eframe::Result<()> {
    #[cfg(target_os = "windows")]
    unsafe {
        MAIN_THREAD_ID.store(GetCurrentThreadId(), std::sync::atomic::Ordering::SeqCst);
    }

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

    // 2. Configure native eframe viewport options for seamless transparent overlay
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
            #[cfg(target_os = "windows")]
            {
                get_app_hwnd();
            }
            // Configure dark mode visuals
            cc.egui_ctx.set_visuals(egui::Visuals::dark());
            // Start global hotkey listener wired directly to egui_ctx to wake the loop from hidden state
            let hotkey_rx = spawn_hotkey_listener(cc.egui_ctx.clone());
            Ok(Box::new(CircleSearchApp::new(captured, cc, hotkey_rx)))
        }),
    )
}
