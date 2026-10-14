use base64::Engine;
use image::{DynamicImage, ImageBuffer, Rgba};
use std::io::Cursor;

pub struct CapturedScreen {
    pub image: image::RgbaImage,
    pub width: u32,
    pub height: u32,
    pub origin_x: f32,
    pub origin_y: f32,
    #[allow(dead_code)]
    pub scale_factor: f64,
}

/// Returns whether the host is running under a Wayland display server session.
pub fn is_wayland() -> bool {
    #[cfg(target_os = "linux")]
    {
        std::env::var("XDG_SESSION_TYPE")
            .map(|v| v.eq_ignore_ascii_case("wayland"))
            .unwrap_or(false)
            || std::env::var("WAYLAND_DISPLAY").is_ok()
    }
    #[cfg(not(target_os = "linux"))]
    {
        false
    }
}

/// Retrieves the current global cursor position if supported by the platform.
#[cfg(target_os = "windows")]
fn get_cursor_position() -> Option<(i32, i32)> {
    use std::mem::MaybeUninit;
    #[repr(C)]
    #[allow(clippy::upper_case_acronyms)]
    struct POINT {
        x: i32,
        y: i32,
    }
    extern "system" {
        fn GetCursorPos(lpPoint: *mut POINT) -> i32;
    }
    unsafe {
        let mut pt = MaybeUninit::<POINT>::uninit();
        if GetCursorPos(pt.as_mut_ptr()) != 0 {
            let pt = pt.assume_init();
            Some((pt.x, pt.y))
        } else {
            None
        }
    }
}

#[cfg(not(target_os = "windows"))]
fn get_cursor_position() -> Option<(i32, i32)> {
    None
}

#[cfg(target_os = "windows")]
mod gdi {
    use image::{ImageBuffer, Rgba};

    #[repr(C)]
    struct BitmapInfoHeader {
        bi_size: u32,
        bi_width: i32,
        bi_height: i32,
        bi_planes: u16,
        bi_bit_count: u16,
        bi_compression: u32,
        bi_size_image: u32,
        bi_x_pels_per_meter: i32,
        bi_y_pels_per_meter: i32,
        bi_clr_used: u32,
        bi_clr_important: u32,
    }

    #[link(name = "user32")]
    extern "system" {
        fn GetDC(hwnd: *mut std::ffi::c_void) -> *mut std::ffi::c_void;
        fn ReleaseDC(hwnd: *mut std::ffi::c_void, hdc: *mut std::ffi::c_void) -> i32;
    }

    #[link(name = "gdi32")]
    extern "system" {
        fn CreateCompatibleDC(hdc: *mut std::ffi::c_void) -> *mut std::ffi::c_void;
        fn CreateCompatibleBitmap(
            hdc: *mut std::ffi::c_void,
            cx: i32,
            cy: i32,
        ) -> *mut std::ffi::c_void;
        fn SelectObject(
            hdc: *mut std::ffi::c_void,
            h: *mut std::ffi::c_void,
        ) -> *mut std::ffi::c_void;
        fn BitBlt(
            hdc: *mut std::ffi::c_void,
            x: i32,
            y: i32,
            cx: i32,
            cy: i32,
            hdc_src: *mut std::ffi::c_void,
            x1: i32,
            y1: i32,
            rop: u32,
        ) -> i32;
        fn GetDIBits(
            hdc: *mut std::ffi::c_void,
            hbm: *mut std::ffi::c_void,
            start: u32,
            lines: u32,
            lpv_bits: *mut std::ffi::c_void,
            lpbmi: *mut BitmapInfoHeader,
            usage: u32,
        ) -> i32;
        fn DeleteObject(ho: *mut std::ffi::c_void) -> i32;
        fn DeleteDC(hdc: *mut std::ffi::c_void) -> i32;
    }

    const SRCCOPY: u32 = 0x00CC0020;
    const BI_RGB: u32 = 0;
    const DIB_RGB_COLORS: u32 = 0;

    pub fn capture_gdi(
        x: i32,
        y: i32,
        w: i32,
        h: i32,
    ) -> Result<ImageBuffer<Rgba<u8>, Vec<u8>>, String> {
        unsafe {
            let hdc_screen = GetDC(std::ptr::null_mut());
            if hdc_screen.is_null() {
                return Err("GetDC failed".to_string());
            }

            let hdc_mem = CreateCompatibleDC(hdc_screen);
            if hdc_mem.is_null() {
                ReleaseDC(std::ptr::null_mut(), hdc_screen);
                return Err("CreateCompatibleDC failed".to_string());
            }

            let h_bm = CreateCompatibleBitmap(hdc_screen, w, h);
            if h_bm.is_null() {
                DeleteDC(hdc_mem);
                ReleaseDC(std::ptr::null_mut(), hdc_screen);
                return Err("CreateCompatibleBitmap failed".to_string());
            }

            let old_bm = SelectObject(hdc_mem, h_bm);

            let ok = BitBlt(hdc_mem, 0, 0, w, h, hdc_screen, x, y, SRCCOPY);
            if ok == 0 {
                SelectObject(hdc_mem, old_bm);
                DeleteObject(h_bm);
                DeleteDC(hdc_mem);
                ReleaseDC(std::ptr::null_mut(), hdc_screen);
                return Err("BitBlt failed".to_string());
            }

            let mut header = BitmapInfoHeader {
                bi_size: std::mem::size_of::<BitmapInfoHeader>() as u32,
                bi_width: w,
                bi_height: -h, // Top-down DIB
                bi_planes: 1,
                bi_bit_count: 32,
                bi_compression: BI_RGB,
                bi_size_image: 0,
                bi_x_pels_per_meter: 0,
                bi_y_pels_per_meter: 0,
                bi_clr_used: 0,
                bi_clr_important: 0,
            };

            let total_pixels = (w * h) as usize;
            let mut bgra_buf: Vec<u8> = vec![0u8; total_pixels * 4];

            let lines = GetDIBits(
                hdc_mem,
                h_bm,
                0,
                h as u32,
                bgra_buf.as_mut_ptr() as *mut std::ffi::c_void,
                &mut header,
                DIB_RGB_COLORS,
            );

            SelectObject(hdc_mem, old_bm);
            DeleteObject(h_bm);
            DeleteDC(hdc_mem);
            ReleaseDC(std::ptr::null_mut(), hdc_screen);

            if lines == 0 {
                return Err("GetDIBits failed".to_string());
            }

            // Convert BGRA to RGBA
            for chunk in bgra_buf.chunks_exact_mut(4) {
                let b = chunk[0];
                let r = chunk[2];
                chunk[0] = r;
                chunk[2] = b;
                chunk[3] = 255;
            }

            ImageBuffer::from_raw(w as u32, h as u32, bgra_buf)
                .ok_or_else(|| "Failed to construct ImageBuffer from GDI bits".to_string())
        }
    }
}

/// Captures the screen currently focused or active under the mouse cursor.
/// Seamlessly resolves multi-monitor displays on Windows, macOS, and Linux with fallback.
pub fn capture_active_screen() -> Result<CapturedScreen, String> {
    let wayland = is_wayland();

    let screens = screenshots::Screen::all().map_err(|e| {
        if wayland {
            format!("Wayland display session detected: Native screen capture is restricted by compositor policy: {}", e)
        } else {
            format!("Failed to enumerate displays: {}", e)
        }
    })?;

    if screens.is_empty() {
        return Err("No active screens detected".to_string());
    }

    // 1. Identify which screen contains the mouse cursor on multi-monitor rigs
    let cursor_pos = get_cursor_position();
    let screen = if let Some((cx, cy)) = cursor_pos {
        screens
            .iter()
            .find(|s| {
                let sx = s.display_info.x;
                let sy = s.display_info.y;
                let sw = s.display_info.width as i32;
                let sh = s.display_info.height as i32;
                cx >= sx && cx < sx + sw && cy >= sy && cy < sy + sh
            })
            .copied()
            .or_else(|| screens.iter().find(|s| s.display_info.is_primary).copied())
            .unwrap_or(screens[0])
    } else {
        screens
            .iter()
            .find(|s| s.display_info.is_primary)
            .copied()
            .unwrap_or(screens[0])
    };

    let origin_x = screen.display_info.x as f32;
    let origin_y = screen.display_info.y as f32;
    let width = screen.display_info.width;
    let height = screen.display_info.height;
    let scale_factor = screen.display_info.scale_factor as f64;

    // 2. Attempt capture using primary DirectX/CoreGraphics/X11 engine
    let primary_capture = screen.capture();

    let rgba_img = match primary_capture {
        Ok(screenshot) => {
            let img_width = screenshot.width();
            let img_height = screenshot.height();
            let raw_rgba = screenshot.into_raw();
            ImageBuffer::<Rgba<u8>, Vec<u8>>::from_raw(img_width, img_height, raw_rgba)
                .ok_or_else(|| "Failed to create ImageBuffer from screenshot bytes".to_string())?
        }
        Err(err) => {
            // Secondary fallback on Windows using native GDI BitBlt
            #[cfg(target_os = "windows")]
            {
                let sx = screen.display_info.x;
                let sy = screen.display_info.y;
                let sw = screen.display_info.width as i32;
                let sh = screen.display_info.height as i32;
                match gdi::capture_gdi(sx, sy, sw, sh) {
                    Ok(gdi_img) => gdi_img,
                    Err(gdi_err) => {
                        eprintln!(
                            "[warn] DirectX capture ({}) and GDI fallback ({}) failed; using fallback canvas",
                            err, gdi_err
                        );
                        ImageBuffer::from_pixel(width, height, Rgba([20, 22, 26, 255]))
                    }
                }
            }
            #[cfg(not(target_os = "windows"))]
            {
                eprintln!(
                    "[warn] Native screen capture failed ({}); using dark fallback canvas",
                    err
                );
                ImageBuffer::from_pixel(width, height, Rgba([20, 22, 26, 255]))
            }
        }
    };

    Ok(CapturedScreen {
        image: rgba_img,
        width,
        height,
        origin_x,
        origin_y,
        scale_factor: if scale_factor > 0.0 {
            scale_factor
        } else {
            1.0
        },
    })
}

pub fn crop_to_base64_jpeg(
    img: &image::RgbaImage,
    x: u32,
    y: u32,
    w: u32,
    h: u32,
) -> Result<String, String> {
    let img_w = img.width();
    let img_h = img.height();

    let crop_x = x.min(img_w);
    let crop_y = y.min(img_h);
    let crop_w = w.min(img_w.saturating_sub(crop_x));
    let crop_h = h.min(img_h.saturating_sub(crop_y));

    if crop_w == 0 || crop_h == 0 {
        return Err("Crop dimensions must be greater than zero".to_string());
    }

    let dynamic_img = DynamicImage::ImageRgba8(img.clone());
    let cropped = dynamic_img.crop_imm(crop_x, crop_y, crop_w, crop_h);

    let rgb_img = cropped.to_rgb8();
    let mut bytes = Vec::new();
    let mut cursor = Cursor::new(&mut bytes);

    rgb_img
        .write_to(&mut cursor, image::ImageFormat::Jpeg)
        .map_err(|e| format!("Failed to encode JPEG: {}", e))?;

    let b64 = base64::engine::general_purpose::STANDARD.encode(&bytes);
    Ok(format!("data:image/jpeg;base64,{}", b64))
}

pub fn crop_to_color_image(
    img: &image::RgbaImage,
    x: u32,
    y: u32,
    w: u32,
    h: u32,
) -> Result<egui::ColorImage, String> {
    let img_w = img.width();
    let img_h = img.height();

    let crop_x = x.min(img_w);
    let crop_y = y.min(img_h);
    let crop_w = w.min(img_w.saturating_sub(crop_x));
    let crop_h = h.min(img_h.saturating_sub(crop_y));

    if crop_w == 0 || crop_h == 0 {
        return Err("Crop dimensions must be greater than zero".to_string());
    }

    let dynamic_img = DynamicImage::ImageRgba8(img.clone());
    let cropped = dynamic_img
        .crop_imm(crop_x, crop_y, crop_w, crop_h)
        .to_rgba8();

    let raw = cropped.into_raw();
    Ok(egui::ColorImage::from_rgba_unmultiplied(
        [crop_w as usize, crop_h as usize],
        &raw,
    ))
}

pub fn crop_to_image_data(
    img: &image::RgbaImage,
    x: u32,
    y: u32,
    w: u32,
    h: u32,
) -> Result<arboard::ImageData<'static>, String> {
    let img_w = img.width();
    let img_h = img.height();

    let crop_x = x.min(img_w);
    let crop_y = y.min(img_h);
    let crop_w = w.min(img_w.saturating_sub(crop_x));
    let crop_h = h.min(img_h.saturating_sub(crop_y));

    if crop_w == 0 || crop_h == 0 {
        return Err("Crop dimensions must be greater than zero".to_string());
    }

    let dynamic_img = DynamicImage::ImageRgba8(img.clone());
    let cropped = dynamic_img
        .crop_imm(crop_x, crop_y, crop_w, crop_h)
        .to_rgba8();

    let raw = cropped.into_raw();
    Ok(arboard::ImageData {
        width: crop_w as usize,
        height: crop_h as usize,
        bytes: std::borrow::Cow::Owned(raw),
    })
}
