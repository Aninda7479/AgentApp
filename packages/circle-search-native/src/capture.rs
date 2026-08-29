use image::{DynamicImage, ImageBuffer, Rgba};
use std::io::Cursor;
use base64::Engine;

pub struct CapturedScreen {
    pub image: image::RgbaImage,
    pub width: u32,
    pub height: u32,
    pub scale_factor: f64,
}

pub fn capture_active_screen() -> Result<CapturedScreen, String> {
    let screens = screenshots::Screen::all().map_err(|e| format!("Failed to list screens: {}", e))?;
    let screen = screens.into_iter().next().ok_or_else(|| "No screens detected".to_string())?;

    let width = screen.display_info.width;
    let height = screen.display_info.height;
    let scale_factor = screen.display_info.scale_factor as f64;

    let screenshot = screen.capture().map_err(|e| format!("Failed to capture screen: {}", e))?;
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

