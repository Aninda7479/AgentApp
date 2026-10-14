use egui::{Color32, Id, Key, LayerId, Order, Pos2, Rect, Rounding};
use std::sync::mpsc::{channel, Receiver, Sender};

use crate::api::query_circle_search;
use crate::capture::{
    crop_to_base64_jpeg, crop_to_color_image, crop_to_image_data, CapturedScreen,
};
use crate::card::{render_hero_card, CardAction, CardRenderContext};
use crate::theme;

pub struct CircleSearchApp {
    screen_info: CapturedScreen,
    screen_texture: Option<egui::TextureHandle>,
    crop_texture: Option<egui::TextureHandle>,

    drag_start: Option<Pos2>,
    drag_current: Option<Pos2>,
    selection_rect: Option<Rect>,
    is_drawing: bool,
    is_lens_active: bool,
    is_fullscreen_mode: bool,

    query: String,
    follow_up_query: String,
    active_mode: String,
    is_loading: bool,
    ai_response: Option<String>,
    error_msg: Option<String>,
    copied_toast_timer: f32,
    copied_toast_msg: String,

    card_pos: Option<Pos2>,
    is_dragging_card: bool,

    response_rx: Receiver<Result<String, String>>,
    response_tx: Sender<Result<String, String>>,
    hotkey_rx: Receiver<()>,
}

impl CircleSearchApp {
    pub fn new(
        captured: CapturedScreen,
        cc: &eframe::CreationContext<'_>,
        hotkey_rx: Receiver<()>,
    ) -> Self {
        let width = captured.image.width() as usize;
        let height = captured.image.height() as usize;
        let raw_rgba = captured.image.as_flat_samples();
        let color_image =
            egui::ColorImage::from_rgba_unmultiplied([width, height], raw_rgba.as_slice());

        let screen_texture = Some(cc.egui_ctx.load_texture(
            "screen_capture",
            color_image,
            egui::TextureOptions::LINEAR,
        ));

        let (tx, rx) = channel();

        Self {
            screen_info: captured,
            screen_texture,
            crop_texture: None,
            drag_start: None,
            drag_current: None,
            selection_rect: None,
            is_drawing: false,
            is_lens_active: false,
            is_fullscreen_mode: false,
            query: String::new(),
            follow_up_query: String::new(),
            active_mode: "general".to_string(),
            is_loading: false,
            ai_response: None,
            error_msg: None,
            copied_toast_timer: 0.0,
            copied_toast_msg: String::new(),
            card_pos: None,
            is_dragging_card: false,
            response_rx: rx,
            response_tx: tx,
            hotkey_rx,
        }
    }

    pub fn hide_overlay(&mut self, ctx: &egui::Context) {
        self.selection_rect = None;
        self.crop_texture = None;
        self.drag_start = None;
        self.drag_current = None;
        self.is_drawing = false;
        self.is_lens_active = false;
        self.is_fullscreen_mode = false;
        self.query.clear();
        self.follow_up_query.clear();
        self.is_loading = false;
        self.ai_response = None;
        self.error_msg = None;
        self.card_pos = None;
        ctx.send_viewport_cmd(egui::ViewportCommand::Visible(false));
        ctx.request_repaint();
    }

    pub fn reload_screen(&mut self, ctx: &egui::Context, captured: CapturedScreen) {
        let width = captured.image.width() as usize;
        let height = captured.image.height() as usize;
        let raw_rgba = captured.image.as_flat_samples();
        let color_image =
            egui::ColorImage::from_rgba_unmultiplied([width, height], raw_rgba.as_slice());

        self.screen_texture =
            Some(ctx.load_texture("screen_capture", color_image, egui::TextureOptions::LINEAR));
        self.screen_info = captured;
        self.selection_rect = None;
        self.crop_texture = None;
        self.drag_start = None;
        self.drag_current = None;
        self.is_drawing = false;
        self.is_lens_active = false;
        self.is_fullscreen_mode = false;
        self.query.clear();
        self.follow_up_query.clear();
        self.is_loading = false;
        self.ai_response = None;
        self.error_msg = None;
        self.card_pos = None;
    }

    fn get_pixel_crop_coords(&self, ctx: &egui::Context, rect: Rect) -> (u32, u32, u32, u32) {
        let screen_rect = ctx.screen_rect();
        let scale_x = self.screen_info.image.width() as f32 / screen_rect.width().max(1.0);
        let scale_y = self.screen_info.image.height() as f32 / screen_rect.height().max(1.0);

        let px = (rect.min.x * scale_x).round().max(0.0) as u32;
        let py = (rect.min.y * scale_y).round().max(0.0) as u32;
        let pw = (rect.width() * scale_x).round().max(1.0) as u32;
        let ph = (rect.height() * scale_y).round().max(1.0) as u32;

        (px, py, pw, ph)
    }

    fn update_crop_texture(&mut self, ctx: &egui::Context, rect: Rect) {
        let (px, py, pw, ph) = self.get_pixel_crop_coords(ctx, rect);

        if let Ok(color_img) = crop_to_color_image(&self.screen_info.image, px, py, pw, ph) {
            self.crop_texture =
                Some(ctx.load_texture("crop_preview", color_img, egui::TextureOptions::LINEAR));
        }
    }

    fn start_analysis(&mut self, ctx: &egui::Context, prompt: String, mode: String) {
        if self.is_loading {
            return;
        }

        self.is_loading = true;
        self.error_msg = None;
        self.active_mode = mode.clone();

        let image_b64 = if let Some(rect) = self.selection_rect {
            let (px, py, pw, ph) = self.get_pixel_crop_coords(ctx, rect);
            crop_to_base64_jpeg(&self.screen_info.image, px, py, pw, ph).ok()
        } else {
            // Default: full screen capture when asking without a manual circle
            crop_to_base64_jpeg(
                &self.screen_info.image,
                0,
                0,
                self.screen_info.image.width(),
                self.screen_info.image.height(),
            )
            .ok()
        };

        let tx = self.response_tx.clone();
        tokio::spawn(async move {
            let res = query_circle_search(prompt, image_b64, mode).await;
            let _ = tx.send(res);
        });
    }

    fn copy_image_to_clipboard(&mut self, ctx: &egui::Context) {
        let (px, py, pw, ph) = if let Some(rect) = self.selection_rect {
            self.get_pixel_crop_coords(ctx, rect)
        } else {
            (
                0,
                0,
                self.screen_info.image.width(),
                self.screen_info.image.height(),
            )
        };

        if let Ok(img_data) = crop_to_image_data(&self.screen_info.image, px, py, pw, ph) {
            if let Ok(mut clipboard) = arboard::Clipboard::new() {
                if clipboard.set_image(img_data).is_ok() {
                    self.copied_toast_timer = 2.0;
                    self.copied_toast_msg = "✓ Screenshot copied to clipboard".to_string();
                }
            }
        }
    }

    fn copy_text_to_clipboard(&mut self, text: &str) {
        if let Ok(mut clipboard) = arboard::Clipboard::new() {
            if clipboard.set_text(text.to_string()).is_ok() {
                self.copied_toast_timer = 2.0;
                self.copied_toast_msg = "✓ Text copied to clipboard".to_string();
            }
        }
    }
}

impl eframe::App for CircleSearchApp {
    fn update(&mut self, ctx: &egui::Context, _frame: &mut eframe::Frame) {
        // 0. Background Hotkey listener (Ctrl+Shift+S)
        if self.hotkey_rx.try_recv().is_ok() {
            if let Ok(fresh) = crate::capture::capture_active_screen() {
                let w = fresh.width as f32;
                let h = fresh.height as f32;
                let ox = fresh.origin_x;
                let oy = fresh.origin_y;
                self.reload_screen(ctx, fresh);
                ctx.send_viewport_cmd(egui::ViewportCommand::InnerSize(egui::vec2(w, h)));
                ctx.send_viewport_cmd(egui::ViewportCommand::OuterPosition(egui::pos2(ox, oy)));
            }
            ctx.send_viewport_cmd(egui::ViewportCommand::Visible(true));
            ctx.send_viewport_cmd(egui::ViewportCommand::Focus);
            ctx.request_repaint();
        }

        // 1. Process async intelligence response
        if let Ok(res) = self.response_rx.try_recv() {
            self.is_loading = false;
            match res {
                Ok(content) => {
                    self.ai_response = Some(content);
                }
                Err(err) => {
                    self.error_msg = Some(err);
                }
            }
        }

        // 2. Decrement toast notification timer
        if self.copied_toast_timer > 0.0 {
            self.copied_toast_timer -= ctx.input(|i| i.unstable_dt);
            ctx.request_repaint();
        }

        // 3. Global keyboard handlers:
        // Ctrl+Q / Cmd+Q quits the application entirely
        if ctx.input(|i| (i.modifiers.ctrl || i.modifiers.command) && i.key_pressed(Key::Q)) {
            ctx.send_viewport_cmd(egui::ViewportCommand::Close);
        }

        // Escape hides the overlay without quitting
        if ctx.input(|i| i.key_pressed(Key::Escape)) {
            self.hide_overlay(ctx);
        }

        // Ctrl+Shift+C copies the screenshot image to clipboard
        if ctx.input(|i| {
            (i.modifiers.ctrl || i.modifiers.command) && i.modifiers.shift && i.key_pressed(Key::C)
        }) {
            self.copy_image_to_clipboard(ctx);
        }

        // Ctrl+C copies AI text if available, or screenshot image if selection is active
        if ctx.input(|i| {
            (i.modifiers.ctrl || i.modifiers.command) && !i.modifiers.shift && i.key_pressed(Key::C)
        }) {
            if let Some(text) = self.ai_response.clone() {
                self.copy_text_to_clipboard(&text);
            } else if self.selection_rect.is_some() {
                self.copy_image_to_clipboard(ctx);
            }
        }

        // 4. Draw Captured Desktop Background
        let screen_rect = ctx.screen_rect();
        let painter = ctx.layer_painter(LayerId::new(Order::Background, Id::new("screen_canvas")));

        if let Some(ref tex) = self.screen_texture {
            painter.image(
                tex.id(),
                screen_rect,
                Rect::from_min_max(Pos2::ZERO, Pos2::new(1.0, 1.0)),
                Color32::WHITE,
            );
        }

        // 5. Mouse Drag & Region Selection
        let pointer = ctx.input(|i| i.pointer.clone());
        let is_over_card = self.is_dragging_card;

        if !is_over_card {
            if pointer.primary_pressed() {
                if let Some(pos) = pointer.hover_pos() {
                    self.drag_start = Some(pos);
                    self.drag_current = Some(pos);
                    self.is_drawing = true;
                    self.is_lens_active = true;
                }
            } else if pointer.primary_down() && self.is_drawing {
                if let Some(pos) = pointer.hover_pos() {
                    self.drag_current = Some(pos);
                }
            } else if pointer.primary_released() && self.is_drawing {
                self.is_drawing = false;
                if let (Some(start), Some(curr)) = (self.drag_start, self.drag_current) {
                    let rect = Rect::from_two_pos(start, curr);
                    if rect.width() > 15.0 && rect.height() > 15.0 {
                        self.selection_rect = Some(rect);
                        self.update_crop_texture(ctx, rect);
                        self.start_analysis(ctx, self.query.clone(), "general".to_string());
                    }
                }
            }
        }

        // Determine current marquee rectangle
        let current_rect = if self.is_drawing {
            if let (Some(start), Some(curr)) = (self.drag_start, self.drag_current) {
                let r = Rect::from_two_pos(start, curr);
                if r.width() > 5.0 && r.height() > 5.0 {
                    Some(r)
                } else {
                    self.selection_rect
                }
            } else {
                self.selection_rect
            }
        } else {
            self.selection_rect
        };

        // 6. Draw Dimmed Mask & Radiant Marquee
        if let Some(rect) = current_rect {
            theme::paint_cutout_mask(&painter, screen_rect, rect);
            theme::paint_selection_marquee(&painter, rect);
        } else if self.is_lens_active {
            painter.rect_filled(screen_rect, Rounding::ZERO, theme::COLOR_BG_OVERLAY);
        }

        // 7. Draw Toast Notification
        if self.copied_toast_timer > 0.0 && !self.copied_toast_msg.is_empty() {
            theme::paint_toast(&painter, screen_rect, &self.copied_toast_msg);
        }

        // 8. Render Floating Intelligence Hero Panel
        let render_ctx = CardRenderContext {
            query: &mut self.query,
            follow_up_query: &mut self.follow_up_query,
            is_loading: self.is_loading,
            is_lens_active: &mut self.is_lens_active,
            is_fullscreen_mode: &mut self.is_fullscreen_mode,
            ai_response: &self.ai_response,
            error_msg: &self.error_msg,
            selection_rect: &mut self.selection_rect,
            copied_toast_timer: self.copied_toast_timer,
            copied_toast_msg: &self.copied_toast_msg,
        };

        if let Some(action) = render_hero_card(
            ctx,
            screen_rect,
            &mut self.card_pos,
            &mut self.is_dragging_card,
            render_ctx,
        ) {
            match action {
                CardAction::SubmitQuery(q) => {
                    self.start_analysis(ctx, q, "general".to_string());
                }
                CardAction::CopyText(t) => {
                    self.copy_text_to_clipboard(&t);
                }
                CardAction::CopyImage => {
                    self.copy_image_to_clipboard(ctx);
                }
                CardAction::Redraw => {
                    self.selection_rect = None;
                    self.crop_texture = None;
                    self.ai_response = None;
                    self.error_msg = None;
                    self.is_lens_active = true;
                }
                CardAction::Close => {
                    self.hide_overlay(ctx);
                }
            }
        }
    }
}
