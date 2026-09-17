use egui::{
    vec2, Align2, Color32, FontId, Id, Key, Pos2, Rect, Rounding, ScrollArea, Stroke, TextEdit,
};

use crate::theme::{
    self, COLOR_ACCENT_CYAN, COLOR_ACCENT_TERRACOTTA, COLOR_BORDER_SUBTLE, COLOR_STATUS_CRIMSON,
    COLOR_TEXT_DIM, COLOR_TEXT_MAIN, COLOR_TEXT_MUTED,
};

#[derive(Clone, Copy, Debug, PartialEq)]
pub enum ActiveTab {
    All,
    Insights,
    CodeOcr,
    Web,
}

pub struct CardRenderContext<'a> {
    pub query: &'a mut String,
    pub follow_up_query: &'a mut String,
    pub active_tab: &'a mut ActiveTab,
    pub is_loading: bool,
    pub is_lens_active: &'a mut bool,
    pub is_fullscreen_mode: &'a mut bool,
    pub ai_response: &'a Option<String>,
    pub error_msg: &'a Option<String>,
    pub selection_rect: &'a mut Option<Rect>,
    pub crop_texture: &'a Option<egui::TextureHandle>,
    pub copied_toast_timer: f32,
    pub copied_toast_msg: &'a str,
}

pub enum CardAction {
    SubmitQuery(String),
    CopyText(String),
    CopyImage,
    Redraw,
    Close,
}

/// Renders the SuperAgent Visual Search intelligence panel (hero card).
pub fn render_hero_card(
    ctx: &egui::Context,
    screen_rect: Rect,
    card_pos: &mut Option<Pos2>,
    is_dragging_card: &mut bool,
    render_ctx: CardRenderContext<'_>,
) -> Option<CardAction> {
    let mut pending_action = None;

    let is_expanded = render_ctx.selection_rect.is_some()
        || render_ctx.ai_response.is_some()
        || render_ctx.is_loading
        || render_ctx.error_msg.is_some();

    let card_w = if is_expanded { 520.0f32 } else { 450.0f32 };
    let default_pos = if is_expanded {
        Pos2::new((screen_rect.max.x - card_w - 32.0).max(20.0), 36.0)
    } else {
        Pos2::new((screen_rect.max.x - card_w - 48.0).max(20.0), 48.0)
    };

    let active_pos = card_pos.unwrap_or(default_pos);

    let window_response = egui::Window::new("SuperAgent Visual Intelligence")
        .id(Id::new("superagent_visual_search_card"))
        .title_bar(false)
        .resizable(false)
        .fixed_pos(active_pos)
        .fixed_size(vec2(card_w, 0.0))
        .frame(theme::hero_card_frame())
        .show(ctx, |ui| {
            // Check dragging status
            let title_bar_id = ui.make_persistent_id("card_drag_header");
            let title_response = ui.interact(
                Rect::from_min_size(ui.cursor().min, vec2(ui.available_width(), 32.0)),
                title_bar_id,
                egui::Sense::drag(),
            );

            if title_response.dragged() {
                *is_dragging_card = true;
                let new_pos = active_pos + title_response.drag_delta();
                *card_pos = Some(new_pos);
            } else if !title_response.dragged() && *is_dragging_card {
                *is_dragging_card = false;
            }

            if !is_expanded {
                // ── COMPACT STATE: Hero Omnibox ──────────────────────────────
                ui.horizontal(|ui| {
                    // Terracotta glowing brand mark
                    let (dot_rect, _) =
                        ui.allocate_exact_size(vec2(10.0, 10.0), egui::Sense::hover());
                    ui.painter()
                        .circle_filled(dot_rect.center(), 4.5, COLOR_ACCENT_TERRACOTTA);
                    ui.painter().circle_stroke(
                        dot_rect.center(),
                        6.5,
                        Stroke::new(1.0, Color32::from_rgba_unmultiplied(217, 119, 87, 80)),
                    );

                    ui.add_space(2.0);
                    ui.label(
                        egui::RichText::new("SuperAgent")
                            .font(FontId::proportional(14.0))
                            .strong()
                            .color(COLOR_TEXT_MAIN),
                    );

                    ui.label(
                        egui::RichText::new("Visual Search")
                            .font(FontId::proportional(12.0))
                            .color(COLOR_TEXT_MUTED),
                    );

                    #[cfg(target_os = "macos")]
                    let shortcut_hint = "⌘+Shift+S";
                    #[cfg(not(target_os = "macos"))]
                    let shortcut_hint = "Ctrl+Shift+S";

                    ui.label(
                        egui::RichText::new(shortcut_hint)
                            .font(FontId::proportional(10.5))
                            .color(COLOR_TEXT_DIM),
                    );

                    ui.with_layout(egui::Layout::right_to_left(egui::Align::Center), |ui| {
                        let close_btn = egui::Button::new(
                            egui::RichText::new("✕").size(11.0).color(COLOR_TEXT_MUTED),
                        )
                        .fill(COLOR_BORDER_SUBTLE)
                        .rounding(Rounding::same(8.0));
                        if ui.add(close_btn).clicked() {
                            pending_action = Some(CardAction::Close);
                        }
                    });
                });

                ui.add_space(10.0);

                // Rounded Omnibox Input Frame
                theme::input_box_frame(false).show(ui, |ui| {
                    let text_edit = TextEdit::singleline(render_ctx.query)
                        .hint_text("Ask anything about this screen...")
                        .desired_width(ui.available_width())
                        .font(FontId::proportional(13.5))
                        .text_color(COLOR_TEXT_MAIN)
                        .frame(false);

                    let response = ui.add(text_edit);
                    if response.lost_focus() && ctx.input(|i| i.key_pressed(Key::Enter)) {
                        let q = render_ctx.query.clone();
                        pending_action = Some(CardAction::SubmitQuery(q));
                    }

                    ui.add_space(8.0);

                    ui.horizontal(|ui| {
                        let share_btn = egui::Button::new(
                            egui::RichText::new("🖥 Fullscreen").size(11.0).color(
                                if *render_ctx.is_fullscreen_mode {
                                    Color32::WHITE
                                } else {
                                    COLOR_TEXT_MUTED
                                },
                            ),
                        )
                        .fill(if *render_ctx.is_fullscreen_mode {
                            COLOR_ACCENT_TERRACOTTA
                        } else {
                            COLOR_BORDER_SUBTLE
                        })
                        .rounding(Rounding::same(10.0));

                        if ui.add(share_btn).clicked() {
                            *render_ctx.is_fullscreen_mode = !*render_ctx.is_fullscreen_mode;
                        }

                        ui.with_layout(egui::Layout::right_to_left(egui::Align::Center), |ui| {
                            let lens_btn = egui::Button::new(
                                egui::RichText::new("✦ Visual Lens")
                                    .size(11.5)
                                    .strong()
                                    .color(Color32::WHITE),
                            )
                            .fill(COLOR_ACCENT_TERRACOTTA)
                            .rounding(Rounding::same(10.0))
                            .stroke(Stroke::new(
                                1.0,
                                Color32::from_rgba_unmultiplied(255, 255, 255, 40),
                            ));

                            if ui.add(lens_btn).clicked() {
                                *render_ctx.is_lens_active = true;
                            }
                        });
                    });
                });
            } else {
                // ── EXPANDED STATE: Visual Intelligence Dashboard ───────────
                ui.horizontal(|ui| {
                    // Terracotta glowing status dot
                    let (dot_rect, _) =
                        ui.allocate_exact_size(vec2(8.0, 8.0), egui::Sense::hover());
                    ui.painter()
                        .circle_filled(dot_rect.center(), 4.0, COLOR_ACCENT_TERRACOTTA);

                    ui.add_space(2.0);
                    ui.label(
                        egui::RichText::new("SuperAgent")
                            .font(FontId::proportional(13.0))
                            .strong()
                            .color(COLOR_TEXT_MAIN),
                    );

                    ui.add_space(6.0);
                    let tabs = [
                        (ActiveTab::All, "All"),
                        (ActiveTab::Insights, "Insights"),
                        (ActiveTab::CodeOcr, "Code & OCR"),
                        (ActiveTab::Web, "Web"),
                    ];

                    for (tab, label) in tabs {
                        let is_active = *render_ctx.active_tab == tab;
                        let tab_btn = egui::Button::new(
                            egui::RichText::new(label).size(11.5).color(if is_active {
                                COLOR_ACCENT_CYAN
                            } else {
                                COLOR_TEXT_MUTED
                            }),
                        )
                        .fill(Color32::TRANSPARENT);

                        if ui.add(tab_btn).clicked() {
                            *render_ctx.active_tab = tab;
                        }
                    }

                    ui.with_layout(egui::Layout::right_to_left(egui::Align::Center), |ui| {
                        let close_btn = egui::Button::new(
                            egui::RichText::new("✕").size(11.0).color(COLOR_TEXT_MUTED),
                        )
                        .fill(COLOR_BORDER_SUBTLE)
                        .rounding(Rounding::same(8.0));
                        if ui.add(close_btn).clicked() {
                            pending_action = Some(CardAction::Close);
                        }

                        if render_ctx.ai_response.is_some() {
                            let label = if render_ctx.copied_toast_timer > 0.0
                                && render_ctx.copied_toast_msg.contains("Text")
                            {
                                "✓ Text"
                            } else {
                                "📋 Text"
                            };
                            let copy_btn = egui::Button::new(
                                egui::RichText::new(label).size(11.0).color(COLOR_TEXT_MAIN),
                            )
                            .fill(COLOR_BORDER_SUBTLE)
                            .rounding(Rounding::same(8.0));
                            if ui.add(copy_btn).clicked() {
                                if let Some(ref text) = render_ctx.ai_response {
                                    pending_action = Some(CardAction::CopyText(text.clone()));
                                }
                            }
                        }

                        if render_ctx.selection_rect.is_some() {
                            let label = if render_ctx.copied_toast_timer > 0.0
                                && render_ctx.copied_toast_msg.contains("Image")
                            {
                                "✓ Image"
                            } else {
                                "📷 Image"
                            };
                            let copy_img_btn = egui::Button::new(
                                egui::RichText::new(label).size(11.0).color(COLOR_TEXT_MAIN),
                            )
                            .fill(COLOR_BORDER_SUBTLE)
                            .rounding(Rounding::same(8.0));
                            if ui.add(copy_img_btn).clicked() {
                                pending_action = Some(CardAction::CopyImage);
                            }

                            let redraw_btn = egui::Button::new(
                                egui::RichText::new("🔄 Redraw")
                                    .size(11.0)
                                    .color(COLOR_TEXT_MUTED),
                            )
                            .fill(COLOR_BORDER_SUBTLE)
                            .rounding(Rounding::same(8.0));
                            if ui.add(redraw_btn).clicked() {
                                pending_action = Some(CardAction::Redraw);
                            }
                        }
                    });
                });

                ui.add_space(6.0);
                ui.separator();
                ui.add_space(6.0);

                // Content Area with insights & thumbnail
                ScrollArea::vertical()
                    .max_height(320.0)
                    .auto_shrink([false, false])
                    .show(ui, |ui| {
                        ui.horizontal_top(|ui| {
                            ui.vertical(|ui| {
                                ui.set_width(
                                    ui.available_width()
                                        - if render_ctx.crop_texture.is_some() {
                                            125.0
                                        } else {
                                            0.0
                                        },
                                );

                                // Loading state
                                if render_ctx.is_loading {
                                    ui.horizontal(|ui| {
                                        ui.spinner();
                                        ui.add_space(6.0);
                                        ui.label(
                                            egui::RichText::new("Analyzing visual context...")
                                                .font(FontId::proportional(13.0))
                                                .color(COLOR_ACCENT_CYAN),
                                        );
                                    });
                                    ui.add_space(8.0);
                                }

                                // Formatted AI Insights
                                if let Some(ref text) = render_ctx.ai_response {
                                    for line in text.lines() {
                                        let trimmed = line.trim();
                                        if trimmed.is_empty() {
                                            ui.add_space(5.0);
                                        } else if trimmed.starts_with("# ")
                                            || trimmed.starts_with("## ")
                                        {
                                            let h = trimmed.trim_start_matches('#').trim();
                                            ui.label(
                                                egui::RichText::new(h)
                                                    .font(FontId::proportional(14.0))
                                                    .strong()
                                                    .color(COLOR_TEXT_MAIN),
                                            );
                                        } else if trimmed.starts_with("### ")
                                            || trimmed.starts_with("Key Facts")
                                        {
                                            ui.add_space(3.0);
                                            ui.label(
                                                egui::RichText::new(
                                                    trimmed.trim_start_matches('#').trim(),
                                                )
                                                .font(FontId::proportional(12.5))
                                                .strong()
                                                .color(COLOR_ACCENT_TERRACOTTA),
                                            );
                                        } else if trimmed.starts_with("- ")
                                            || trimmed.starts_with("• ")
                                            || trimmed.starts_with("* ")
                                        {
                                            let bullet_text = &trimmed[2..];
                                            ui.horizontal_top(|ui| {
                                                ui.label(
                                                    egui::RichText::new("•")
                                                        .color(COLOR_ACCENT_TERRACOTTA),
                                                );
                                                ui.label(
                                                    egui::RichText::new(bullet_text)
                                                        .font(FontId::proportional(12.0))
                                                        .color(COLOR_TEXT_MAIN),
                                                );
                                            });
                                        } else {
                                            ui.label(
                                                egui::RichText::new(trimmed)
                                                    .font(FontId::proportional(12.5))
                                                    .color(COLOR_TEXT_MUTED),
                                            );
                                        }
                                    }
                                }

                                // Error state
                                if let Some(ref err) = render_ctx.error_msg {
                                    ui.label(
                                        egui::RichText::new(format!("⚠ {}", err))
                                            .font(FontId::proportional(12.0))
                                            .color(COLOR_STATUS_CRIMSON),
                                    );
                                }
                            });

                            // Upper-Right Cropped Selection Thumbnail
                            if let Some(ref crop_tex) = render_ctx.crop_texture {
                                let (rect, response) = ui
                                    .allocate_exact_size(vec2(115.0, 130.0), egui::Sense::click());

                                ui.painter().image(
                                    crop_tex.id(),
                                    rect,
                                    Rect::from_min_max(Pos2::ZERO, Pos2::new(1.0, 1.0)),
                                    Color32::WHITE,
                                );
                                ui.painter().rect_stroke(
                                    rect,
                                    Rounding::same(10.0),
                                    Stroke::new(1.0, COLOR_BORDER_SUBTLE),
                                );

                                if response.hovered() {
                                    ui.painter().rect_filled(
                                        rect,
                                        Rounding::same(10.0),
                                        Color32::from_rgba_unmultiplied(0, 0, 0, 140),
                                    );
                                    ui.painter().text(
                                        rect.center(),
                                        Align2::CENTER_CENTER,
                                        "📷 Copy Image",
                                        FontId::proportional(11.0),
                                        Color32::WHITE,
                                    );
                                }

                                if response.clicked() {
                                    pending_action = Some(CardAction::CopyImage);
                                }
                            }
                        });
                    });

                ui.add_space(8.0);

                // Persistent Bottom Omnibox for Follow-up questions
                theme::input_box_frame(false).show(ui, |ui| {
                    let text_edit = TextEdit::singleline(render_ctx.follow_up_query)
                        .hint_text("Ask follow-up or command...")
                        .desired_width(ui.available_width())
                        .font(FontId::proportional(12.5))
                        .text_color(COLOR_TEXT_MAIN)
                        .frame(false);

                    let response = ui.add(text_edit);
                    if response.lost_focus() && ctx.input(|i| i.key_pressed(Key::Enter)) {
                        let q = render_ctx.follow_up_query.clone();
                        render_ctx.follow_up_query.clear();
                        pending_action = Some(CardAction::SubmitQuery(q));
                    }

                    ui.add_space(4.0);

                    ui.horizontal(|ui| {
                        ui.label(
                            egui::RichText::new("Press Enter to send")
                                .font(FontId::proportional(10.5))
                                .color(COLOR_TEXT_DIM),
                        );

                        ui.with_layout(egui::Layout::right_to_left(egui::Align::Center), |ui| {
                            let lens_btn = egui::Button::new(
                                egui::RichText::new("✦ Recapture")
                                    .size(11.0)
                                    .color(COLOR_TEXT_MAIN),
                            )
                            .fill(COLOR_BORDER_SUBTLE)
                            .rounding(Rounding::same(8.0));

                            if ui.add(lens_btn).clicked() {
                                *render_ctx.is_lens_active = true;
                                *render_ctx.selection_rect = None;
                            }
                        });
                    });
                });
            }
        });

    let _ = window_response;
    pending_action
}
