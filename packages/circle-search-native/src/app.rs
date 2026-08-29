use egui::{
    vec2, Align2, Color32, FontId, Id, Key, LayerId, Margin, Order, Pos2, Rect, Rounding,
    ScrollArea, Stroke, TextEdit, Ui,
};
use std::sync::mpsc::{channel, Receiver, Sender};
use crate::api::query_circle_search;
use crate::capture::{crop_to_base64_jpeg, CapturedScreen};

pub struct CircleSearchApp {
    screen_info: CapturedScreen,
    texture: Option<egui::TextureHandle>,
    drag_start: Option<Pos2>,
    drag_current: Option<Pos2>,
    selection_rect: Option<Rect>,
    is_drawing: bool,
    is_fullscreen_mode: bool,

    query: String,
    follow_up_query: String,
    active_mode: String,
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

        let texture = Some(cc.egui_ctx.load_texture(
            "screen_capture",
            color_image,
            egui::TextureOptions::LINEAR,
        ));

        let (tx, rx) = channel();

        Self {
            screen_info: captured,
            texture,
            drag_start: None,
            drag_current: None,
            selection_rect: None,
            is_drawing: false,
            is_fullscreen_mode: false,
            query: String::new(),
            follow_up_query: String::new(),
            active_mode: "general".to_string(),
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

    fn start_analysis(&mut self, prompt: String, mode: String) {
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
            crop_to_base64_jpeg(&self.screen_info.image, px, py, pw, ph).ok()
        } else {
            None
        };

        std::thread::spawn(move || {
            let rt = tokio::runtime::Builder::new_current_thread()
                .enable_all()
                .build();

            if let Ok(rt) = rt {
                let res = rt.block_on(query_circle_search(prompt_clone, img_base64, mode));
                let _ = tx.send(res);
            } else {
                let _ = tx.send(Err("Failed to start async tokio runtime".to_string()));
            }
        });
    }

    fn copy_to_clipboard(&mut self, text: &str) {
        if let Ok(mut clipboard) = arboard::Clipboard::new() {
            let _ = clipboard.set_text(text);
            self.copied_toast_timer = 2.5;
        }
    }
}

impl eframe::App for CircleSearchApp {
    fn update(&mut self, ctx: &egui::Context, _frame: &mut eframe::Frame) {
        // Decrement copied toast timer
        if self.copied_toast_timer > 0.0 {
            self.copied_toast_timer -= ctx.input(|i| i.stable_dt);
            ctx.request_repaint();
        }

        // Check for async response
        while let Ok(res) = self.response_rx.try_recv() {
            self.is_loading = false;
            match res {
                Ok(content) => {
                    self.ai_response = Some(content);
                    self.error_msg = None;
                }
                Err(err) => {
                    self.error_msg = Some(err);
                }
            }
            ctx.request_repaint();
        }

        // Handle Escape key to dismiss immediately
        if ctx.input(|i| i.key_pressed(Key::Escape)) {
            ctx.send_viewport_cmd(egui::ViewportCommand::Close);
            return;
        }

        let screen_rect = ctx.screen_rect();
        let painter = ctx.layer_painter(LayerId::new(Order::Background, Id::new("bg_layer")));

        // 1. Draw screen capture texture
        if let Some(ref tex) = self.texture {
            painter.image(
                tex.id(),
                screen_rect,
                Rect::from_min_max(Pos2::ZERO, Pos2::new(1.0, 1.0)),
                Color32::WHITE,
            );
        }

        // 2. Draw modern frosted dark veil
        let dark_veil = Color32::from_rgba_unmultiplied(10, 12, 18, 130);

        if let Some(sel) = self.selection_rect {
            // Draw 4 rectangles around selection to create clear cutout
            painter.rect_filled(Rect::from_min_max(screen_rect.min, Pos2::new(screen_rect.max.x, sel.min.y)), 0.0, dark_veil);
            painter.rect_filled(Rect::from_min_max(Pos2::new(screen_rect.min.x, sel.max.y), screen_rect.max), 0.0, dark_veil);
            painter.rect_filled(Rect::from_min_max(Pos2::new(screen_rect.min.x, sel.min.y), Pos2::new(sel.min.x, sel.max.y)), 0.0, dark_veil);
            painter.rect_filled(Rect::from_min_max(Pos2::new(sel.max.x, sel.min.y), Pos2::new(screen_rect.max.x, sel.max.y)), 0.0, dark_veil);

            // Refined luminous glass border around selection
            let glass_stroke = Stroke::new(1.5, Color32::from_rgba_unmultiplied(255, 255, 255, 230));
            let glow_stroke = Stroke::new(4.0, Color32::from_rgba_unmultiplied(120, 160, 255, 45));
            painter.rect_stroke(sel, Rounding::same(8.0), glow_stroke);
            painter.rect_stroke(sel, Rounding::same(8.0), glass_stroke);

            // Corner brackets for high-precision aesthetic
            let bracket_len = 14.0;
            let bracket_stroke = Stroke::new(2.5, Color32::from_rgba_unmultiplied(255, 255, 255, 240));
            // Top-left
            painter.line_segment([sel.min, Pos2::new(sel.min.x + bracket_len, sel.min.y)], bracket_stroke);
            painter.line_segment([sel.min, Pos2::new(sel.min.x, sel.min.y + bracket_len)], bracket_stroke);
            // Top-right
            painter.line_segment([Pos2::new(sel.max.x, sel.min.y), Pos2::new(sel.max.x - bracket_len, sel.min.y)], bracket_stroke);
            painter.line_segment([Pos2::new(sel.max.x, sel.min.y), Pos2::new(sel.max.x, sel.min.y + bracket_len)], bracket_stroke);
            // Bottom-left
            painter.line_segment([Pos2::new(sel.min.x, sel.max.y), Pos2::new(sel.min.x + bracket_len, sel.max.y)], bracket_stroke);
            painter.line_segment([Pos2::new(sel.min.x, sel.max.y), Pos2::new(sel.min.x, sel.max.y - bracket_len)], bracket_stroke);
            // Bottom-right
            painter.line_segment([sel.max, Pos2::new(sel.max.x - bracket_len, sel.max.y)], bracket_stroke);
            painter.line_segment([sel.max, Pos2::new(sel.max.x, sel.max.y - bracket_len)], bracket_stroke);

            // Frosted glass size badge
            let size_text = format!("{} × {} px", sel.width() as i32, sel.height() as i32);
            let badge_pos = Pos2::new(sel.min.x, (sel.min.y - 24.0).max(10.0));
            let badge_rect = Rect::from_min_size(badge_pos, vec2(106.0, 20.0));
            painter.rect_filled(
                badge_rect,
                Rounding::same(6.0),
                Color32::from_rgba_unmultiplied(15, 18, 25, 220),
            );
            painter.rect_stroke(
                badge_rect,
                Rounding::same(6.0),
                Stroke::new(1.0, Color32::from_rgba_unmultiplied(255, 255, 255, 30)),
            );
            painter.text(
                Pos2::new(badge_pos.x + 8.0, badge_pos.y + 3.0),
                Align2::LEFT_TOP,
                size_text,
                FontId::proportional(11.0),
                Color32::from_rgb(230, 235, 245),
            );
        } else {
            // Full screen dimming if no selection
            painter.rect_filled(screen_rect, 0.0, dark_veil);
        }

        // 3. Mouse drawing interaction
        let pointer = ctx.input(|i| i.pointer.clone());
        let is_over_ui = ctx.is_pointer_over_area() || ctx.wants_pointer_input();

        if !is_over_ui && !self.is_dragging_card {
            if pointer.primary_pressed() {
                if let Some(pos) = pointer.interact_pos() {
                    self.drag_start = Some(pos);
                    self.drag_current = Some(pos);
                    self.is_drawing = true;
                    self.selection_rect = None;
                    self.ai_response = None;
                    self.error_msg = None;
                }
            } else if pointer.primary_down() && self.is_drawing {
                if let Some(pos) = pointer.interact_pos() {
                    self.drag_current = Some(pos);
                    if let Some(start) = self.drag_start {
                        let min_x = start.x.min(pos.x);
                        let min_y = start.y.min(pos.y);
                        let max_x = start.x.max(pos.x);
                        let max_y = start.y.max(pos.y);
                        if (max_x - min_x) > 10.0 && (max_y - min_y) > 10.0 {
                            self.selection_rect = Some(Rect::from_min_max(Pos2::new(min_x, min_y), Pos2::new(max_x, max_y)));
                        }
                    }
                }
            } else if pointer.primary_released() && self.is_drawing {
                self.is_drawing = false;
            }
        }

        // 4. Render Floating Frosted Glass UI Card
        self.render_floating_card(ctx, screen_rect);
    }
}

impl CircleSearchApp {
    fn render_floating_card(&mut self, ctx: &egui::Context, screen_rect: Rect) {
        let card_w = 480.0;
        let default_pos = if let Some(sel) = self.selection_rect {
            let x = (sel.center().x - (card_w / 2.0)).clamp(20.0, screen_rect.max.x - card_w - 20.0);
            let y = if (sel.max.y + 440.0) < screen_rect.max.y {
                sel.max.y + 16.0
            } else if (sel.min.y - 420.0) > 20.0 {
                sel.min.y - 420.0
            } else {
                screen_rect.max.y - 440.0
            };
            Pos2::new(x, y.max(20.0))
        } else {
            Pos2::new(
                (screen_rect.center().x - (card_w / 2.0)).max(20.0),
                (screen_rect.max.y - 340.0).max(20.0),
            )
        };

        let active_pos = self.card_pos.unwrap_or(default_pos);

        egui::Window::new("SuperAgent Frosted Glass Overlay")
            .id(Id::new("circle_search_floating_card"))
            .title_bar(false)
            .resizable(false)
            .fixed_pos(active_pos)
            .fixed_size(vec2(card_w, 0.0))
            .frame(
                egui::Frame::none()
                    .fill(Color32::from_rgba_unmultiplied(14, 17, 24, 218)) // Highly blurred frosted glass tone
                    .stroke(Stroke::new(1.0, Color32::from_rgba_unmultiplied(255, 255, 255, 38))) // Crisp top-lit glass border
                    .rounding(Rounding::same(18.0))
                    .inner_margin(Margin::same(16.0))
                    .shadow(egui::epaint::Shadow {
                        offset: vec2(0.0, 18.0),
                        blur: 36.0,
                        spread: 0.0,
                        color: Color32::from_black_alpha(210),
                    }),
            )
            .show(ctx, |ui| {
                ui.set_width(card_w - 32.0);

                // --- Header / Glass Title Bar ---
                ui.horizontal(|ui| {
                    ui.label(
                        egui::RichText::new("✦ SuperAgent Visual Intelligence")
                            .font(FontId::proportional(14.0))
                            .strong()
                            .color(Color32::from_rgb(245, 247, 250)),
                    );

                    ui.with_layout(egui::Layout::right_to_left(egui::Align::Center), |ui| {
                        let close_btn = egui::Button::new(egui::RichText::new("✕").size(12.0).color(Color32::from_rgb(180, 190, 205)))
                            .fill(Color32::from_rgba_unmultiplied(255, 255, 255, 12))
                            .rounding(Rounding::same(8.0))
                            .stroke(Stroke::new(1.0, Color32::from_rgba_unmultiplied(255, 255, 255, 20)));

                        if ui.add(close_btn).clicked() {
                            ctx.send_viewport_cmd(egui::ViewportCommand::Close);
                        }

                        if self.selection_rect.is_some() {
                            let redraw_btn = egui::Button::new(egui::RichText::new("🔄 Redraw").size(11.0).color(Color32::from_rgb(210, 220, 235)))
                                .fill(Color32::from_rgba_unmultiplied(255, 255, 255, 12))
                                .rounding(Rounding::same(8.0))
                                .stroke(Stroke::new(1.0, Color32::from_rgba_unmultiplied(255, 255, 255, 20)));

                            if ui.add(redraw_btn).clicked() {
                                self.selection_rect = None;
                                self.ai_response = None;
                                self.error_msg = None;
                            }
                        }
                    });
                });

                ui.add_space(10.0);

                // --- Omnibox Frosted Glass Input Bar ---
                ui.horizontal(|ui| {
                    let text_edit = TextEdit::singleline(&mut self.query)
                        .hint_text("Ask anything about this screen or selection... (Press Enter)")
                        .desired_width(365.0)
                        .margin(Margin::symmetric(12.0, 9.0))
                        .font(FontId::proportional(13.0));

                    let response = ui.add(text_edit);
                    if response.lost_focus() && ctx.input(|i| i.key_pressed(Key::Enter)) {
                        let q = self.query.clone();
                        self.start_analysis(q, "general".to_string());
                    }

                    let search_btn = egui::Button::new(egui::RichText::new("Search ↵").size(12.0).strong().color(Color32::WHITE))
                        .fill(Color32::from_rgba_unmultiplied(255, 255, 255, 28))
                        .rounding(Rounding::same(10.0))
                        .stroke(Stroke::new(1.0, Color32::from_rgba_unmultiplied(255, 255, 255, 45)));

                    if ui.add(search_btn).clicked() {
                        let q = self.query.clone();
                        self.start_analysis(q, "general".to_string());
                    }
                });

                ui.add_space(10.0);

                // --- Action Chips (Frosted Glass Pills) ---
                ui.horizontal_wrapped(|ui| {
                    ui.spacing_mut().item_spacing = vec2(6.0, 6.0);

                    let chips = [
                        ("✨ Explain", "explain"),
                        ("📝 Summarize", "summarize"),
                        ("💻 Code / Solve", "code"),
                        ("🌐 Translate", "translate"),
                        ("🔍 OCR Text", "ocr"),
                    ];

                    for (label, mode) in chips {
                        let is_active = self.active_mode == mode && self.is_loading;
                        let btn_text = egui::RichText::new(label)
                            .size(11.5)
                            .color(if is_active { Color32::WHITE } else { Color32::from_rgb(225, 232, 240) });

                        let btn = egui::Button::new(btn_text)
                            .fill(if is_active { Color32::from_rgba_unmultiplied(255, 255, 255, 45) } else { Color32::from_rgba_unmultiplied(255, 255, 255, 14) })
                            .rounding(Rounding::same(12.0))
                            .stroke(Stroke::new(1.0, Color32::from_rgba_unmultiplied(255, 255, 255, if is_active { 70 } else { 24 })));

                        if ui.add(btn).clicked() {
                            let q = self.query.clone();
                            self.start_analysis(q, mode.to_string());
                        }
                    }
                });

                // --- Loading Spinner with Frosted Glass Indicator ---
                if self.is_loading {
                    ui.add_space(14.0);
                    ui.horizontal(|ui| {
                        ui.spinner();
                        ui.label(
                            egui::RichText::new("Synthesizing visual intelligence insight...")
                                .size(12.5)
                                .italics()
                                .color(Color32::from_rgb(215, 225, 240)),
                        );
                    });
                }

                // --- Error Display ---
                if let Some(ref err) = self.error_msg {
                    ui.add_space(10.0);
                    ui.group(|ui| {
                        ui.set_width(card_w - 50.0);
                        ui.label(
                            egui::RichText::new(format!("⚠️ Error: {}", err))
                                .size(12.0)
                                .color(Color32::from_rgb(252, 165, 165)),
                        );
                    });
                }

                // --- AI Response Display (Frosted Pane) ---
                let resp_text = self.ai_response.clone();
                if let Some(resp) = resp_text {
                    ui.add_space(12.0);
                    ui.separator();
                    ui.add_space(8.0);

                    let mut do_copy = false;
                    ui.horizontal(|ui| {
                        ui.label(
                            egui::RichText::new("💡 Visual Insight")
                                .size(13.0)
                                .strong()
                                .color(Color32::from_rgb(250, 252, 255)),
                        );

                        ui.with_layout(egui::Layout::right_to_left(egui::Align::Center), |ui| {
                            let copy_label = if self.copied_toast_timer > 0.0 { "✓ Copied!" } else { "📋 Copy" };
                            let copy_btn = egui::Button::new(egui::RichText::new(copy_label).size(11.0).color(Color32::from_rgb(220, 230, 245)))
                                .fill(Color32::from_rgba_unmultiplied(255, 255, 255, 16))
                                .rounding(Rounding::same(8.0))
                                .stroke(Stroke::new(1.0, Color32::from_rgba_unmultiplied(255, 255, 255, 28)));

                            if ui.add(copy_btn).clicked() {
                                do_copy = true;
                            }
                        });
                    });

                    if do_copy {
                        self.copy_to_clipboard(&resp);
                    }

                    ui.add_space(6.0);

                    ScrollArea::vertical()
                        .max_height(250.0)
                        .auto_shrink([false, true])
                        .show(ui, |ui| {
                            ui.set_width(card_w - 50.0);
                            render_markdown_content(ui, &resp);
                        });

                    ui.add_space(10.0);

                    // Follow-up prompt input (Frosted Glass)
                    let mut trigger_follow_up = false;
                    ui.horizontal(|ui| {
                        let follow_up = TextEdit::singleline(&mut self.follow_up_query)
                            .hint_text("Ask a follow-up question...")
                            .desired_width(380.0)
                            .margin(Margin::symmetric(10.0, 7.0))
                            .font(FontId::proportional(12.0));

                        let resp_input = ui.add(follow_up);
                        if resp_input.lost_focus() && ctx.input(|i| i.key_pressed(Key::Enter)) {
                            trigger_follow_up = true;
                        }

                        let ask_btn = egui::Button::new(egui::RichText::new("Ask ↵").size(11.5).strong().color(Color32::WHITE))
                            .fill(Color32::from_rgba_unmultiplied(255, 255, 255, 22))
                            .rounding(Rounding::same(8.0))
                            .stroke(Stroke::new(1.0, Color32::from_rgba_unmultiplied(255, 255, 255, 36)));

                        if ui.add(ask_btn).clicked() {
                            trigger_follow_up = true;
                        }
                    });

                    if trigger_follow_up && !self.follow_up_query.trim().is_empty() {
                        let q = self.follow_up_query.clone();
                        self.follow_up_query.clear();
                        self.start_analysis(q, "general".to_string());
                    }
                }
            });
    }
}

// Clean formatted markdown reader with frosted styling
fn render_markdown_content(ui: &mut Ui, content: &str) {
    for line in content.lines() {
        let trimmed = line.trim();
        if trimmed.starts_with("### ") {
            ui.add_space(4.0);
            ui.label(
                egui::RichText::new(&trimmed[4..])
                    .font(FontId::proportional(13.0))
                    .strong()
                    .color(Color32::from_rgb(240, 245, 255)),
            );
        } else if trimmed.starts_with("## ") {
            ui.add_space(6.0);
            ui.label(
                egui::RichText::new(&trimmed[3..])
                    .font(FontId::proportional(14.0))
                    .strong()
                    .color(Color32::WHITE),
            );
        } else if trimmed.starts_with("# ") {
            ui.add_space(8.0);
            ui.label(
                egui::RichText::new(&trimmed[2..])
                    .font(FontId::proportional(15.0))
                    .strong()
                    .color(Color32::WHITE),
            );
        } else if trimmed.starts_with("- ") || trimmed.starts_with("* ") {
            ui.horizontal(|ui| {
                ui.label(egui::RichText::new("•").size(12.0).color(Color32::from_rgb(180, 200, 230)));
                ui.label(egui::RichText::new(&trimmed[2..]).size(12.0).color(Color32::from_rgb(230, 236, 244)));
            });
        } else if trimmed.starts_with("```") {
            ui.add_space(2.0);
        } else if trimmed.is_empty() {
            ui.add_space(4.0);
        } else {
            ui.label(
                egui::RichText::new(trimmed)
                    .size(12.0)
                    .color(Color32::from_rgb(230, 236, 244)),
            );
        }
    }
}
