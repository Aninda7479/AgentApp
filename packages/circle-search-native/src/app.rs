use egui::{Color32, Id, Key, LayerId, Order, Pos2, Rect, Rounding};
use std::sync::mpsc::{channel, Receiver, Sender};

use crate::api::query_circle_search;
use crate::capture::{
    crop_to_base64_jpeg, crop_to_color_image, crop_to_image_data, CapturedScreen,
};
use crate::card::{render_hero_card, CardAction, CardRenderContext};
use crate::theme;

pub struct CircleSearchApp {
    initial_size: egui::Vec2,
    initial_pos: egui::Pos2,
    screen_info: CapturedScreen,
    screen_texture: Option<egui::TextureHandle>,
    crop_texture: Option<egui::TextureHandle>,

    drag_start: Option<Pos2>,
    drag_current: Option<Pos2>,
    selection_rect: Option<Rect>,
    is_drawing: bool,
    is_lens_active: bool,
    is_interact_mode: bool,
    is_visible: bool,

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
    recapture_rx: Receiver<Result<CapturedScreen, String>>,
    recapture_tx: Sender<Result<CapturedScreen, String>>,
    hotkey_rx: Receiver<Result<CapturedScreen, String>>,
}

impl CircleSearchApp {
    pub fn new(
        captured: CapturedScreen,
        cc: &eframe::CreationContext<'_>,
        hotkey_rx: Receiver<Result<CapturedScreen, String>>,
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
        let (recap_tx, recap_rx) = channel();

        let initial_size = egui::vec2(captured.width as f32, captured.height as f32);
        let initial_pos = egui::pos2(captured.origin_x, captured.origin_y);

        Self {
            initial_size,
            initial_pos,
            screen_info: captured,
            screen_texture,
            crop_texture: None,
            drag_start: None,
            drag_current: None,
            selection_rect: None,
            is_drawing: false,
            is_lens_active: false,
            is_interact_mode: false,
            is_visible: true,
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
            recapture_rx: recap_rx,
            recapture_tx: recap_tx,
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
        let was_interact = self.is_interact_mode;
        self.is_interact_mode = false;
        self.is_visible = false;
        self.query.clear();
        self.follow_up_query.clear();
        self.is_loading = false;
        self.ai_response = None;
        self.error_msg = None;
        self.card_pos = None;
        if was_interact {
            ctx.send_viewport_cmd(egui::ViewportCommand::InnerSize(self.initial_size));
            ctx.send_viewport_cmd(egui::ViewportCommand::OuterPosition(self.initial_pos));
        }
        ctx.send_viewport_cmd(egui::ViewportCommand::Visible(false));
        #[cfg(target_os = "windows")]
        {
            let hwnd = crate::get_app_hwnd();
            if !hwnd.is_null() {
                unsafe {
                    crate::ShowWindow(hwnd, 0 /* SW_HIDE */);
                }
            }
        }
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
        self.is_interact_mode = false;
        self.is_visible = true;
        self.query.clear();
        self.follow_up_query.clear();
        self.is_loading = false;
        self.ai_response = None;
        self.error_msg = None;
        self.card_pos = None;
    }

    pub fn trigger_recapture(&mut self, ctx: &egui::Context) {
        ctx.send_viewport_cmd(egui::ViewportCommand::Visible(false));
        let tx = self.recapture_tx.clone();
        let egui_ctx = ctx.clone();
        tokio::spawn(async move {
            tokio::time::sleep(tokio::time::Duration::from_millis(50)).await;
            let fresh = crate::capture::capture_active_screen();
            let _ = tx.send(fresh);
            egui_ctx.request_repaint();
        });
    }

    pub fn toggle_interact_mode(&mut self, ctx: &egui::Context) {
        self.is_interact_mode = !self.is_interact_mode;
        if self.is_interact_mode {
            let card_w = 480.0f32;
            let card_h = 100.0f32;
            let def_x = (self.screen_info.origin_x + self.screen_info.width as f32 - card_w - 32.0)
                .max(20.0);
            let def_y = self.screen_info.origin_y + 36.0;
            let pos = self.card_pos.unwrap_or(Pos2::new(def_x, def_y));
            ctx.send_viewport_cmd(egui::ViewportCommand::InnerSize(egui::vec2(card_w, card_h)));
            ctx.send_viewport_cmd(egui::ViewportCommand::OuterPosition(pos));
            ctx.request_repaint();
        } else {
            ctx.send_viewport_cmd(egui::ViewportCommand::InnerSize(self.initial_size));
            ctx.send_viewport_cmd(egui::ViewportCommand::OuterPosition(self.initial_pos));
            self.trigger_recapture(ctx);
        }
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
        // 0. Background Hotkey listener (Ctrl+Shift+C / Ctrl+Shift+S)
        if let Ok(res) = self.hotkey_rx.try_recv() {
            let was_interact_mode = self.is_interact_mode;
            match res {
                Ok(fresh) => {
                    let w = fresh.width as f32;
                    let h = fresh.height as f32;
                    let ox = fresh.origin_x;
                    let oy = fresh.origin_y;
                    let monitor_changed = (ox - self.initial_pos.x).abs() > 1.0
                        || (oy - self.initial_pos.y).abs() > 1.0
                        || (w - self.initial_size.x).abs() > 1.0
                        || (h - self.initial_size.y).abs() > 1.0;
                    self.reload_screen(ctx, fresh);
                    if was_interact_mode || monitor_changed {
                        self.initial_size = egui::vec2(w, h);
                        self.initial_pos = egui::pos2(ox, oy);
                        ctx.send_viewport_cmd(egui::ViewportCommand::InnerSize(self.initial_size));
                        ctx.send_viewport_cmd(egui::ViewportCommand::OuterPosition(
                            self.initial_pos,
                        ));
                    }
                }
                Err(err) => {
                    self.error_msg = Some(format!("Screen capture error: {}", err));
                }
            }
            self.is_visible = true;
            self.is_interact_mode = false;
            ctx.send_viewport_cmd(egui::ViewportCommand::Visible(true));
            ctx.send_viewport_cmd(egui::ViewportCommand::Minimized(false));
            ctx.send_viewport_cmd(egui::ViewportCommand::Focus);
            ctx.request_repaint();
        }

        // 1. Process asynchronous screen recapture results
        if let Ok(res) = self.recapture_rx.try_recv() {
            let was_interact_mode = self.is_interact_mode;
            match res {
                Ok(fresh) => {
                    let w = fresh.width as f32;
                    let h = fresh.height as f32;
                    let ox = fresh.origin_x;
                    let oy = fresh.origin_y;
                    let monitor_changed = (ox - self.initial_pos.x).abs() > 1.0
                        || (oy - self.initial_pos.y).abs() > 1.0
                        || (w - self.initial_size.x).abs() > 1.0
                        || (h - self.initial_size.y).abs() > 1.0;
                    self.reload_screen(ctx, fresh);
                    if was_interact_mode || monitor_changed {
                        self.initial_size = egui::vec2(w, h);
                        self.initial_pos = egui::pos2(ox, oy);
                        ctx.send_viewport_cmd(egui::ViewportCommand::InnerSize(self.initial_size));
                        ctx.send_viewport_cmd(egui::ViewportCommand::OuterPosition(
                            self.initial_pos,
                        ));
                    }
                    self.is_interact_mode = false;
                    self.copied_toast_timer = 2.0;
                    self.copied_toast_msg = "✓ Screen updated".to_string();
                }
                Err(err) => {
                    self.error_msg = Some(format!("Recapture failed: {}", err));
                }
            }
            self.is_visible = true;
            ctx.send_viewport_cmd(egui::ViewportCommand::Visible(true));
            ctx.send_viewport_cmd(egui::ViewportCommand::Minimized(false));
            ctx.send_viewport_cmd(egui::ViewportCommand::Focus);
            ctx.request_repaint();
        }

        // 2. Process async intelligence response
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

        // 3. Decrement toast notification timer
        if self.copied_toast_timer > 0.0 {
            self.copied_toast_timer -= ctx.input(|i| i.unstable_dt);
            ctx.request_repaint();
        }

        // 4. Keyboard handlers:
        // Ctrl+Q / Cmd+Q quits the application entirely
        if ctx.input(|i| (i.modifiers.ctrl || i.modifiers.command) && i.key_pressed(Key::Q)) {
            ctx.send_viewport_cmd(egui::ViewportCommand::Close);
        }

        // Escape hides the overlay without quitting
        if ctx.input(|i| i.key_pressed(Key::Escape)) {
            self.hide_overlay(ctx);
        }

        // F5 or Ctrl+R triggers instant screen recapture
        if ctx.input(|i| {
            i.key_pressed(Key::F5)
                || ((i.modifiers.ctrl || i.modifiers.command) && i.key_pressed(Key::R))
        }) {
            self.trigger_recapture(ctx);
        }

        // Space toggles Move Screen mode when text fields are not focused
        let has_text_focus = ctx.memory(|m| m.focused().is_some());
        if !has_text_focus && ctx.input(|i| i.key_pressed(Key::Space)) {
            self.toggle_interact_mode(ctx);
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

        let screen_rect = ctx.screen_rect();

        // 5. Draw Captured Desktop Background & Marquee (only when in circle freeze mode)
        if !self.is_interact_mode {
            let painter =
                ctx.layer_painter(LayerId::new(Order::Background, Id::new("screen_canvas")));

            if let Some(ref tex) = self.screen_texture {
                painter.image(
                    tex.id(),
                    screen_rect,
                    Rect::from_min_max(Pos2::ZERO, Pos2::new(1.0, 1.0)),
                    Color32::WHITE,
                );
            }

            // Mouse Drag & Region Selection
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

            // Draw Dimmed Mask & Radiant Marquee
            if let Some(rect) = current_rect {
                theme::paint_cutout_mask(&painter, screen_rect, rect);
                theme::paint_selection_marquee(&painter, rect);
            } else if self.is_lens_active {
                painter.rect_filled(screen_rect, Rounding::ZERO, theme::COLOR_BG_OVERLAY);
            }

            // Draw Toast Notification
            if self.copied_toast_timer > 0.0 && !self.copied_toast_msg.is_empty() {
                theme::paint_toast(&painter, screen_rect, &self.copied_toast_msg);
            }
        }

        // 6. Render Floating Intelligence Hero Panel
        let render_ctx = CardRenderContext {
            query: &mut self.query,
            follow_up_query: &mut self.follow_up_query,
            is_loading: self.is_loading,
            is_interact_mode: self.is_interact_mode,
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
                CardAction::Recapture => {
                    self.trigger_recapture(ctx);
                }
                CardAction::ToggleMoveScreen => {
                    self.toggle_interact_mode(ctx);
                }
                CardAction::Close => {
                    self.hide_overlay(ctx);
                }
            }
        }
    }
}
