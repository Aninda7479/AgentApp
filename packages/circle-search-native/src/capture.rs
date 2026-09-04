use image::{DynamicImage, ImageBuffer, Rgba};
use std::io::Cursor;
use base64::Engine;

pub struct CapturedScreen {
    pub image: image::RgbaImage,
    pub width: u32,
    pub height: u32,
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

pub fn capture_active_screen() -> Result<CapturedScreen, String> {
    let wayland = is_wayland();

    let screens = screenshots::Screen::all().map_err(|e| {
        if wayland {
            format!("Wayland display session detected: Native screen capture is restricted under Wayland protocols. Please run under X11, XWayland, or enable desktop portal capture: {}", e)
        } else {
            format!("Failed to list screens: {}", e)
        }
    })?;

    let screen = screens.into_iter().next().ok_or_else(|| {
        if wayland {
            "Wayland display session detected: No accessible screens found. Direct screen capture is restricted by Wayland security policy.".to_string()
        } else {
            "No screens detected".to_string()
        }
    })?;

    let width = screen.display_info.width;
    let height = screen.display_info.height;
    let scale_factor = screen.display_info.scale_factor as f64;

    let screenshot = screen.capture().map_err(|e| {
        if wayland {
            format!("Wayland display session capture failed (direct frame reading blocked by compositor): {}", e)
        } else {
            format!("Failed to capture screen: {}", e)
        }
    })?;
    let img_width = screenshot.width();
    let img_height = screenshot.height();

    let raw_rgba = screenshot.into_raw();
    let rgba_img = ImageBuffer::<Rgba<u8>, Vec<u8>>::from_raw(img_width, img_height, raw_rgba)
        .ok_or_else(|| "Failed to create ImageBuffer from screenshot bytes".to_string())?;

    Ok(CapturedScreen {
        image: rgba_img,
        width,
        height,
        scale_factor: if scale_factor > 0.0 { scale_factor } else { 1.0 },
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
    let cropped = dynamic_img.crop_imm(crop_x, crop_y, crop_w, crop_h).to_rgba8();

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
    let cropped = dynamic_img.crop_imm(crop_x, crop_y, crop_w, crop_h).to_rgba8();

    let raw = cropped.into_raw();
    Ok(arboard::ImageData {
        width: crop_w as usize,
        height: crop_h as usize,
        bytes: std::borrow::Cow::Owned(raw),
    })
}


