use egui::{vec2, Align2, Color32, FontId, Frame, Margin, Painter, Pos2, Rect, Rounding, Stroke};

// ── SuperAgent Obsidian & Terracotta Color Tokens ────────────────────────────
// Note: Color32::from_rgba_premultiplied requires channels to be pre-scaled by alpha: (c * a) / 255
pub const COLOR_BG_OVERLAY: Color32 = Color32::from_rgba_premultiplied(6, 7, 9, 160);
pub const COLOR_BG_CARD: Color32 = Color32::from_rgba_premultiplied(19, 20, 23, 250);
#[allow(dead_code)]
pub const COLOR_BG_SURFACE: Color32 = Color32::from_rgba_premultiplied(26, 28, 33, 240);
pub const COLOR_BG_INPUT: Color32 = Color32::from_rgba_premultiplied(12, 13, 16, 245);
pub const COLOR_BG_BTN: Color32 = Color32::from_rgba_premultiplied(16, 16, 16, 16);
#[allow(dead_code)]
pub const COLOR_BG_BTN_HOVER: Color32 = Color32::from_rgba_premultiplied(32, 32, 32, 32);

pub const COLOR_BORDER_CARD: Color32 = Color32::from_rgba_premultiplied(47, 50, 57, 220);
pub const COLOR_BORDER_SUBTLE: Color32 = Color32::from_rgba_premultiplied(24, 24, 24, 24);
pub const COLOR_BORDER_FOCUSED: Color32 = Color32::from_rgba_premultiplied(170, 93, 68, 200);

pub const COLOR_ACCENT_TERRACOTTA: Color32 = Color32::from_rgb(217, 119, 87);
pub const COLOR_ACCENT_CYAN: Color32 = Color32::from_rgb(56, 189, 248);
pub const COLOR_STATUS_EMERALD: Color32 = Color32::from_rgb(52, 211, 153);
pub const COLOR_STATUS_CRIMSON: Color32 = Color32::from_rgb(248, 113, 113);

pub const COLOR_TEXT_MAIN: Color32 = Color32::from_rgb(243, 244, 246);
pub const COLOR_TEXT_MUTED: Color32 = Color32::from_rgb(156, 163, 175);
pub const COLOR_TEXT_DIM: Color32 = Color32::from_rgb(115, 120, 132);

/// Returns the primary floating acrylic window frame for SuperAgent Circle to Search.
pub fn hero_card_frame() -> Frame {
    Frame::none()
        .fill(COLOR_BG_CARD)
        .stroke(Stroke::new(1.0, COLOR_BORDER_CARD))
        .rounding(Rounding::same(20.0))
        .inner_margin(Margin::same(18.0))
}

/// Returns the framed container for the omnibox input field.
pub fn input_box_frame(is_focused: bool) -> Frame {
    let stroke_color = if is_focused {
        COLOR_BORDER_FOCUSED
    } else {
        COLOR_BORDER_SUBTLE
    };
    Frame::none()
        .fill(COLOR_BG_INPUT)
        .stroke(Stroke::new(1.0, stroke_color))
        .rounding(Rounding::same(14.0))
        .inner_margin(Margin::symmetric(14.0, 10.0))
}

/// Paints a radiant double-halo marquee selection representing SuperAgent's visual lens.
pub fn paint_selection_marquee(painter: &Painter, rect: Rect) {
    // Outer halo in warm terracotta glow
    painter.rect_stroke(
        rect.expand(4.5),
        Rounding::same(16.0),
        Stroke::new(5.0, Color32::from_rgba_unmultiplied(217, 119, 87, 75)),
    );
    // Mid aura in electric cyan tint
    painter.rect_stroke(
        rect.expand(1.5),
        Rounding::same(15.0),
        Stroke::new(1.5, Color32::from_rgba_unmultiplied(56, 189, 248, 120)),
    );
    // Inner crisp white boundary
    painter.rect_stroke(
        rect,
        Rounding::same(14.0),
        Stroke::new(2.2, Color32::from_rgb(255, 255, 255)),
    );
}

/// Paints the 4-quadrant cutout mask around the active selection rectangle.
pub fn paint_cutout_mask(painter: &Painter, screen_rect: Rect, selection: Rect) {
    let dim_color = COLOR_BG_OVERLAY;

    let top = Rect::from_min_max(
        Pos2::new(0.0, 0.0),
        Pos2::new(screen_rect.max.x, selection.min.y),
    );
    let bottom = Rect::from_min_max(
        Pos2::new(0.0, selection.max.y),
        Pos2::new(screen_rect.max.x, screen_rect.max.y),
    );
    let left = Rect::from_min_max(
        Pos2::new(0.0, selection.min.y),
        Pos2::new(selection.min.x, selection.max.y),
    );
    let right = Rect::from_min_max(
        Pos2::new(selection.max.x, selection.min.y),
        Pos2::new(screen_rect.max.x, selection.max.y),
    );

    painter.rect_filled(top, Rounding::ZERO, dim_color);
    painter.rect_filled(bottom, Rounding::ZERO, dim_color);
    painter.rect_filled(left, Rounding::ZERO, dim_color);
    painter.rect_filled(right, Rounding::ZERO, dim_color);
}

/// Draws an animated pill toast notification (e.g. for clipboard confirmation).
pub fn paint_toast(painter: &Painter, screen_rect: Rect, message: &str) {
    let toast_w = 230.0f32;
    let toast_h = 36.0f32;
    let toast_rect = Rect::from_center_size(
        Pos2::new(screen_rect.center().x, 46.0),
        vec2(toast_w, toast_h),
    );

    painter.rect_filled(
        toast_rect,
        Rounding::same(18.0),
        Color32::from_rgba_unmultiplied(20, 26, 22, 245),
    );
    painter.rect_stroke(
        toast_rect,
        Rounding::same(18.0),
        Stroke::new(1.2, COLOR_STATUS_EMERALD),
    );
    painter.text(
        toast_rect.center(),
        Align2::CENTER_CENTER,
        message,
        FontId::proportional(12.5),
        Color32::from_rgb(209, 250, 229),
    );
}
