use egui::{
    vec2, Align2, Color32, FontId, Id, Key, LayerId, Margin, Order, Pos2, Rect, Rounding,
    ScrollArea, Stroke, TextEdit,
};
use std::sync::mpsc::{channel, Receiver, Sender};

use crate::api::query_circle_search;
use crate::capture::{crop_to_base64_jpeg, crop_to_color_image, CapturedScreen};

#[derive(Clone, Copy, Debug, PartialEq)]
pub enum ActiveTab {
    All,
    Images,
    Videos,
    News,
}

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
    active_tab: ActiveTab,
    is_loading: bool,
    ai_response: Option<String>,
    error_msg: Option<String>,
    copied_toast_timer: f32,

    card_pos: Option<Pos2>,
    is_dragging_card: bool,

    response_rx: Receiver<Result<String, String>>,
    response_tx: Sender<Result<String, String>>,
}

impl CircleSearchApp {
    pub fn new(captured: CapturedScreen, cc: &eframe::CreationContext<'_>) -> Self {
        let width = captured.image.width() as usize;
        let height = captured.image.height() as usize;
        let raw_rgba = captured.image.as_flat_samples();
        let color_image = egui::ColorImage::from_rgba_unmultiplied([width, height], raw_rgba.as_slice());

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
            active_tab: ActiveTab::All,
            is_loading: false,
            ai_response: None,
            error_msg: None,
            copied_toast_timer: 0.0,
            card_pos: None,
            is_dragging_card: false,
            response_rx: rx,
            response_tx: tx,
        }
    }

    fn update_crop_texture(&mut self, ctx: &egui::Context, rect: Rect) {
        let scale = self.screen_info.scale_factor as f32;
        let px = (rect.min.x * scale).max(0.0) as u32;
        let py = (rect.min.y * scale).max(0.0) as u32;
        let pw = (rect.width() * scale).max(1.0) as u32;
        let ph = (rect.height() * scale).max(1.0) as u32;

        if let Ok(color_img) = crop_to_color_image(&self.screen_info.image, px, py, pw, ph) {
            self.crop_texture = Some(ctx.load_texture(
                "crop_preview",
                color_img,
                egui::TextureOptions::LINEAR,
            ));
        }
    }

    fn start_analysis(&mut self, ctx: &egui::Context, prompt: String, mode: String) {
        if self.is_loading {
            return;
        }

        self.is_loading = true;
        self.error_msg = None;
        self.active_mode = mode.clone();

        let tx = self.response_tx.clone();
        let prompt_clone = if prompt.trim().is_empty() {
            match mode.as_str() {
                "explain" => "Explain what is shown in this selection in detail.".to_string(),
                "summarize" => "Summarize the key information visible in this selection.".to_string(),
                "translate" => "Translate all visible text in this selection to English (or identify language and provide English translation).".to_string(),
                "code" => "Analyze and solve or explain the code shown in this screenshot.".to_string(),
                "ocr" => "Extract and transcribe all text from this selection cleanly with exact formatting.".to_string(),
                _ => "Analyze this image selection and explain what it shows.".to_string(),
            }
        } else {
            prompt
        };

        let scale = self.screen_info.scale_factor as f32;
        let img_w = self.screen_info.image.width();
        let img_h = self.screen_info.image.height();

        let img_base64 = if self.is_fullscreen_mode || self.selection_rect.is_none() {
            crop_to_base64_jpeg(&self.screen_info.image, 0, 0, img_w, img_h).ok()
        } else if let Some(rect) = self.selection_rect {
            let px = (rect.min.x * scale).max(0.0) as u32;
            let py = (rect.min.y * scale).max(0.0) as u32;
            let pw = (rect.width() * scale).max(1.0) as u32;
            let ph = (rect.height() * scale).max(1.0) as u32;

            self.update_crop_texture(ctx, rect);
            crop_to_base64_jpeg(&self.screen_info.image, px, py, pw, ph).ok()
        } else {
            None
        };

        tokio::spawn(async move {
            let res = query_circle_search(prompt_clone, img_base64, mode).await;
            let _ = tx.send(res);
        });
    }

    fn copy_to_clipboard(&mut self, text: &str) {
        if let Ok(mut clipboard) = arboard::Clipboard::new() {
            let _ = clipboard.set_text(text.to_string());
            self.copied_toast_timer = 2.5;
        }
    }
}

impl eframe::App for CircleSearchApp {
    fn update(&mut self, ctx: &egui::Context, _frame: &mut eframe::Frame) {
        let dt = ctx.input(|i| i.stable_dt).min(0.1);
        if self.copied_toast_timer > 0.0 {
            self.copied_toast_timer = (self.copied_toast_timer - dt).max(0.0);
            ctx.request_repaint();
        }

        if let Ok(res) = self.response_rx.try_recv() {
            self.is_loading = false;
            match res {
                Ok(text) => self.ai_response = Some(text),
                Err(err) => self.error_msg = Some(err),
            }
        }

        if ctx.input(|i| i.key_pressed(Key::Escape)) {
            ctx.send_viewport_cmd(egui::ViewportCommand::Close);
        }

        let screen_rect = ctx.screen_rect();
        let painter = ctx.layer_painter(LayerId::new(Order::Background, Id::new("screen_canvas")));

        // 1. Draw Captured Desktop Background
        if let Some(ref tex) = self.screen_texture {
            painter.image(
                tex.id(),
                screen_rect,
                Rect::from_min_max(Pos2::ZERO, Pos2::new(1.0, 1.0)),
                Color32::WHITE,
            );
        }

        // 2. Mouse Drag & Region Selection
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

        // Calculate live selection rect
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

        // 3. Draw Translucent Dimmed Backdrop & Glowing Rounded Selection Marquee
        if let Some(rect) = current_rect {
            let dim_color = Color32::from_rgba_unmultiplied(0, 0, 0, 85);

            // Cutout dimming around selection
            let top_rect = Rect::from_min_max(Pos2::new(0.0, 0.0), Pos2::new(screen_rect.max.x, rect.min.y));
            let bottom_rect = Rect::from_min_max(Pos2::new(0.0, rect.max.y), Pos2::new(screen_rect.max.x, screen_rect.max.y));
            let left_rect = Rect::from_min_max(Pos2::new(0.0, rect.min.y), Pos2::new(rect.min.x, rect.max.y));
            let right_rect = Rect::from_min_max(Pos2::new(rect.max.x, rect.min.y), Pos2::new(screen_rect.max.x, rect.max.y));

            painter.rect_filled(top_rect, Rounding::ZERO, dim_color);
            painter.rect_filled(bottom_rect, Rounding::ZERO, dim_color);
            painter.rect_filled(left_rect, Rounding::ZERO, dim_color);
            painter.rect_filled(right_rect, Rounding::ZERO, dim_color);

            // Radiant Glowing Marquee (Google App on Windows style)
            painter.rect_stroke(
                rect.expand(4.0),
                Rounding::same(16.0),
                Stroke::new(6.0, Color32::from_rgba_unmultiplied(255, 255, 255, 45)),
            );
            painter.rect_stroke(
                rect,
                Rounding::same(14.0),
                Stroke::new(2.5, Color32::WHITE),
            );

            // Blue Lens Circular Badge at bottom-right of marquee
            let lens_center = Pos2::new(rect.max.x + 2.0, rect.max.y + 2.0);
            painter.circle_filled(lens_center, 14.0, Color32::from_rgb(26, 115, 232)); // Google Blue
            painter.circle_stroke(lens_center, 14.0, Stroke::new(1.5, Color32::WHITE));
            painter.text(
                lens_center,
                Align2::CENTER_CENTER,
                "✦",
                FontId::proportional(12.0),
                Color32::WHITE,
            );
        } else if self.is_lens_active {
            painter.rect_filled(screen_rect, Rounding::ZERO, Color32::from_rgba_unmultiplied(0, 0, 0, 50));
        }

        // 4. Floating Omnibox / Intelligence Panel (Hero Redesign)
        let is_expanded = self.selection_rect.is_some() || self.ai_response.is_some() || self.is_loading || self.error_msg.is_some();
        let card_w = if is_expanded { 500.0f32 } else { 440.0f32 };
        let default_pos = if is_expanded {
            Pos2::new(
                (screen_rect.max.x - card_w - 32.0).max(20.0),
                36.0,
            )
        } else {
            Pos2::new(
                (screen_rect.max.x - card_w - 48.0).max(20.0),
                48.0,
            )
        };

        let active_pos = self.card_pos.unwrap_or(default_pos);

        egui::Window::new("SuperAgent Google App Card")
            .id(Id::new("google_app_hero_card"))
            .title_bar(false)
            .resizable(false)
            .fixed_pos(active_pos)
            .fixed_size(vec2(card_w, 0.0))
            .frame(
                egui::Frame::none()
                    .fill(Color32::from_rgba_unmultiplied(16, 20, 28, 235)) // Deep frosted acrylic
                    .stroke(Stroke::new(1.0, Color32::from_rgba_unmultiplied(255, 255, 255, 42))) // Crisp glass stroke
                    .rounding(Rounding::same(22.0))
                    .inner_margin(Margin::same(18.0))
                    .shadow(egui::epaint::Shadow {
                        offset: vec2(0.0, 18.0),
                        blur: 40.0,
                        spread: 0.0,
                        color: Color32::from_black_alpha(220),
                    }),
            )
            .show(ctx, |ui| {
                ui.set_width(card_w - 36.0);

                if !is_expanded {
                    // ── STATE 1: COMPACT FLOATING OMNIBOX ─────────────────────
                    ui.horizontal(|ui| {
                        // Google/SuperAgent 4-Color Logo Glyph
                        let (logo_rect, _) = ui.allocate_exact_size(vec2(22.0, 22.0), egui::Sense::hover());
                        ui.painter().circle_filled(logo_rect.center(), 10.0, Color32::from_rgb(66, 133, 244)); // Blue
                        ui.painter().text(logo_rect.center(), Align2::CENTER_CENTER, "G", FontId::proportional(12.0), Color32::WHITE);

                        ui.add_space(2.0);
                        ui.label(
                            egui::RichText::new("Google app")
                                .font(FontId::proportional(13.5))
                                .strong()
                                .color(Color32::from_rgb(240, 245, 255)),
                        );

                        ui.label(
                            egui::RichText::new("Alt + Space")
                                .font(FontId::proportional(11.0))
                                .color(Color32::from_rgb(140, 155, 175)),
                        );

                        ui.with_layout(egui::Layout::right_to_left(egui::Align::Center), |ui| {
                            let close_btn = egui::Button::new(egui::RichText::new("✕").size(11.0).color(Color32::from_rgb(180, 190, 205)))
                                .fill(Color32::from_rgba_unmultiplied(255, 255, 255, 14))
                                .rounding(Rounding::same(8.0));
                            if ui.add(close_btn).clicked() {
                                ctx.send_viewport_cmd(egui::ViewportCommand::Close);
                            }

                            let avatar_rect = ui.allocate_exact_size(vec2(20.0, 20.0), egui::Sense::hover()).0;
                            ui.painter().circle_filled(avatar_rect.center(), 9.0, Color32::from_rgb(234, 67, 53)); // Red avatar accent
                        });
                    });

                    ui.add_space(10.0);

                    // Large Rounded Input Box
                    egui::Frame::none()
                        .fill(Color32::from_rgba_unmultiplied(255, 255, 255, 14))
                        .stroke(Stroke::new(1.0, Color32::from_rgba_unmultiplied(255, 255, 255, 28)))
                        .rounding(Rounding::same(16.0))
                        .inner_margin(Margin::symmetric(14.0, 10.0))
                        .show(ui, |ui| {
                            let text_edit = TextEdit::singleline(&mut self.query)
                                .hint_text("Ask anything")
                                .desired_width(ui.available_width())
                                .font(FontId::proportional(14.0))
                                .frame(false);

                            let response = ui.add(text_edit);
                            if response.lost_focus() && ctx.input(|i| i.key_pressed(Key::Enter)) {
                                let q = self.query.clone();
                                self.start_analysis(ctx, q, "general".to_string());
                            }

                            ui.add_space(8.0);

                            ui.horizontal(|ui| {
                                let plus_btn = egui::Button::new(egui::RichText::new("+").size(13.0).strong().color(Color32::from_rgb(220, 230, 245)))
                                    .fill(Color32::from_rgba_unmultiplied(255, 255, 255, 12))
                                    .rounding(Rounding::same(12.0));
                                ui.add(plus_btn);

                                let share_btn = egui::Button::new(
                                    egui::RichText::new("🖥 Share screen")
                                        .size(11.5)
                                        .color(if self.is_fullscreen_mode { Color32::WHITE } else { Color32::from_rgb(210, 225, 240) }),
                                )
                                .fill(if self.is_fullscreen_mode { Color32::from_rgb(66, 133, 244) } else { Color32::from_rgba_unmultiplied(255, 255, 255, 12) })
                                .rounding(Rounding::same(12.0));

                                if ui.add(share_btn).clicked() {
                                    self.is_fullscreen_mode = !self.is_fullscreen_mode;
                                }

                                ui.with_layout(egui::Layout::right_to_left(egui::Align::Center), |ui| {
                                    // Blue Google Lens Action Button
                                    let lens_btn = egui::Button::new(
                                        egui::RichText::new("✦ Lens")
                                            .size(11.5)
                                            .strong()
                                            .color(Color32::WHITE),
                                    )
                                    .fill(Color32::from_rgb(26, 115, 232))
                                    .rounding(Rounding::same(12.0))
                                    .stroke(Stroke::new(1.0, Color32::from_rgba_unmultiplied(255, 255, 255, 50)));

                                    if ui.add(lens_btn).clicked() {
                                        self.is_lens_active = true;
                                    }
                                });
                            });
                        });
                } else {
                    // ── STATE 2: EXPANDED INTELLIGENCE WINDOW ────────────────
                    // Top Navigation Bar (AI Mode ▾ | All | Images | Videos | News)
                    ui.horizontal(|ui| {
                        let ai_mode_btn = egui::Button::new(
                            egui::RichText::new("AI Mode ▾")
                                .size(13.0)
                                .strong()
                                .color(Color32::from_rgb(245, 248, 255)),
                        )
                        .fill(Color32::TRANSPARENT);
                        ui.add(ai_mode_btn);

                        ui.add_space(6.0);
                        let tabs = [
                            (ActiveTab::All, "All"),
                            (ActiveTab::Images, "Images"),
                            (ActiveTab::Videos, "Videos"),
                            (ActiveTab::News, "News"),
                        ];

                        for (tab, label) in tabs {
                            let is_active = self.active_tab == tab;
                            let tab_btn = egui::Button::new(
                                egui::RichText::new(label)
                                    .size(12.0)
                                    .color(if is_active { Color32::WHITE } else { Color32::from_rgb(160, 175, 195) }),
                            )
                            .fill(Color32::TRANSPARENT);

                            if ui.add(tab_btn).clicked() {
                                self.active_tab = tab;
                            }
                        }

                        ui.with_layout(egui::Layout::right_to_left(egui::Align::Center), |ui| {
                            let close_btn = egui::Button::new(egui::RichText::new("✕").size(11.0).color(Color32::from_rgb(180, 190, 205)))
                                .fill(Color32::from_rgba_unmultiplied(255, 255, 255, 14))
                                .rounding(Rounding::same(8.0));
                            if ui.add(close_btn).clicked() {
                                ctx.send_viewport_cmd(egui::ViewportCommand::Close);
                            }

                            if self.ai_response.is_some() {
                                let label = if self.copied_toast_timer > 0.0 { "✓ Copied" } else { "📋" };
                                let copy_btn = egui::Button::new(egui::RichText::new(label).size(11.0).color(Color32::from_rgb(200, 215, 235)))
                                    .fill(Color32::from_rgba_unmultiplied(255, 255, 255, 14))
                                    .rounding(Rounding::same(8.0));
                                if ui.add(copy_btn).clicked() {
                                    if let Some(ref text) = self.ai_response.clone() {
                                        self.copy_to_clipboard(text);
                                    }
                                }
                            }

                            if self.selection_rect.is_some() {
                                let redraw_btn = egui::Button::new(egui::RichText::new("🔄").size(11.0).color(Color32::from_rgb(200, 215, 235)))
                                    .fill(Color32::from_rgba_unmultiplied(255, 255, 255, 14))
                                    .rounding(Rounding::same(8.0));
                                if ui.add(redraw_btn).clicked() {
                                    self.selection_rect = None;
                                    self.crop_texture = None;
                                    self.ai_response = None;
                                    self.error_msg = None;
                                }
                            }
                        });
                    });

                    ui.add_space(6.0);
                    ui.separator();
                    ui.add_space(8.0);

                    // Content Area (Scrollable Insights + Upper Right Crop Thumbnail)
                    ScrollArea::vertical()
                        .max_height(340.0)
                        .auto_shrink([false, false])
                        .show(ui, |ui| {
                            ui.horizontal_top(|ui| {
                                ui.vertical(|ui| {
                                    ui.set_width(ui.available_width() - if self.crop_texture.is_some() { 120.0 } else { 0.0 });

                                    // Loading Spinner ("Looking 🔍")
                                    if self.is_loading {
                                        ui.horizontal(|ui| {
                                            ui.spinner();
                                            ui.add_space(4.0);
                                            ui.label(
                                                egui::RichText::new("Looking 🔍")
                                                    .font(FontId::proportional(14.0))
                                                    .strong()
                                                    .color(Color32::from_rgb(220, 235, 255)),
                                            );
                                        });
                                        ui.add_space(10.0);
                                    }

                                    // AI Response Formatted Insights
                                    if let Some(ref text) = self.ai_response {
                                        for line in text.lines() {
                                            let trimmed = line.trim();
                                            if trimmed.is_empty() {
                                                ui.add_space(6.0);
                                            } else if trimmed.starts_with("# ") || trimmed.starts_with("## ") {
                                                let h = trimmed.trim_start_matches('#').trim();
                                                ui.label(
                                                    egui::RichText::new(h)
                                                        .font(FontId::proportional(14.5))
                                                        .strong()
                                                        .color(Color32::from_rgb(245, 248, 255)),
                                                );
                                            } else if trimmed.starts_with("### ") || trimmed.starts_with("Key Facts") {
                                                ui.add_space(4.0);
                                                ui.label(
                                                    egui::RichText::new(trimmed.trim_start_matches('#').trim())
                                                        .font(FontId::proportional(13.0))
                                                        .strong()
                                                        .color(Color32::from_rgb(220, 230, 245)),
                                                );
                                            } else if trimmed.starts_with("- ") || trimmed.starts_with("• ") || trimmed.starts_with("* ") {
                                                let bullet_text = &trimmed[2..];
                                                ui.horizontal_top(|ui| {
                                                    ui.label(egui::RichText::new("•").color(Color32::from_rgb(140, 165, 200)));
                                                    ui.label(
                                                        egui::RichText::new(bullet_text)
                                                            .font(FontId::proportional(12.5))
                                                            .color(Color32::from_rgb(225, 232, 240)),
                                                    );
                                                });
                                            } else {
                                                ui.label(
                                                    egui::RichText::new(trimmed)
                                                        .font(FontId::proportional(13.0))
                                                        .color(Color32::from_rgb(235, 240, 248)),
                                                );
                                            }
                                        }
                                    }

                                    // Error Message
                                    if let Some(ref err) = self.error_msg {
                                        ui.label(
                                            egui::RichText::new(format!("⚠ {}", err))
                                                .font(FontId::proportional(12.5))
                                                .color(Color32::from_rgb(254, 202, 202)),
                                        );
                                    }
                                });

                                // Upper-Right Cropped Selection Thumbnail
                                if let Some(ref crop_tex) = self.crop_texture {
                                    egui::Frame::none()
                                        .stroke(Stroke::new(1.0, Color32::from_rgba_unmultiplied(255, 255, 255, 50)))
                                        .rounding(Rounding::same(12.0))
                                        .show(ui, |ui| {
                                            ui.image((crop_tex.id(), vec2(110.0, 125.0)));
                                        });
                                }
                            });
                        });

                    ui.add_space(10.0);

                    // Persistent Bottom Input Bar ("Ask anything")
                    egui::Frame::none()
                        .fill(Color32::from_rgba_unmultiplied(255, 255, 255, 12))
                        .stroke(Stroke::new(1.0, Color32::from_rgba_unmultiplied(255, 255, 255, 24)))
                        .rounding(Rounding::same(16.0))
                        .inner_margin(Margin::symmetric(14.0, 8.0))
                        .show(ui, |ui| {
                            let text_edit = TextEdit::singleline(&mut self.follow_up_query)
                                .hint_text("Ask anything")
                                .desired_width(ui.available_width())
                                .font(FontId::proportional(13.0))
                                .frame(false);

                            let response = ui.add(text_edit);
                            if response.lost_focus() && ctx.input(|i| i.key_pressed(Key::Enter)) {
                                let q = self.follow_up_query.clone();
                                self.follow_up_query.clear();
                                self.start_analysis(ctx, q, "general".to_string());
                            }

                            ui.add_space(6.0);

                            ui.horizontal(|ui| {
                                let plus_btn = egui::Button::new(egui::RichText::new("+").size(12.0).strong().color(Color32::from_rgb(220, 230, 245)))
                                    .fill(Color32::from_rgba_unmultiplied(255, 255, 255, 10))
                                    .rounding(Rounding::same(10.0));
                                ui.add(plus_btn);

                                let share_btn = egui::Button::new(
                                    egui::RichText::new("🖥 Share screen")
                                        .size(11.0)
                                        .color(Color32::from_rgb(200, 215, 235)),
                                )
                                .fill(Color32::from_rgba_unmultiplied(255, 255, 255, 10))
                                .rounding(Rounding::same(10.0));
                                ui.add(share_btn);

                                ui.with_layout(egui::Layout::right_to_left(egui::Align::Center), |ui| {
                                    let lens_btn = egui::Button::new(
                                        egui::RichText::new("✦")
                                            .size(12.0)
                                            .strong()
                                            .color(Color32::WHITE),
                                    )
                                    .fill(Color32::from_rgb(26, 115, 232))
                                    .rounding(Rounding::same(10.0));

                                    if ui.add(lens_btn).clicked() {
                                        self.is_lens_active = true;
                                        self.selection_rect = None;
                                    }
                                });
                            });
                        });
                }
            });
    }
}
