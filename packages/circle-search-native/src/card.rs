use egui::{vec2, Color32, FontId, Id, Key, Pos2, Rect, Rounding, ScrollArea, Stroke, TextEdit};

use crate::theme::{
    self, COLOR_ACCENT_CYAN, COLOR_ACCENT_TERRACOTTA, COLOR_BORDER_SUBTLE, COLOR_STATUS_CRIMSON,
    COLOR_TEXT_DIM, COLOR_TEXT_MAIN, COLOR_TEXT_MUTED,
};

fn action_button(text: &str, is_primary: bool) -> egui::Button<'_> {
    let (bg, text_color, border_color) = if is_primary {
        (
            COLOR_ACCENT_TERRACOTTA,
            Color32::WHITE,
            Color32::from_rgba_unmultiplied(255, 255, 255, 50),
        )
    } else {
        (
            theme::COLOR_BG_BTN,
            COLOR_TEXT_MAIN,
            theme::COLOR_BORDER_SUBTLE,
        )
    };

    egui::Button::new(egui::RichText::new(text).size(11.0).color(text_color))
        .fill(bg)
        .stroke(Stroke::new(1.0, border_color))
        .rounding(Rounding::same(8.0))
}

fn render_styled_text_chunk(ui: &mut egui::Ui, text: &str) {
    let parts: Vec<&str> = text.split("**").collect();
    for (idx, part) in parts.iter().enumerate() {
        if part.is_empty() {
            continue;
        }
        let is_bold = idx % 2 == 1;
        if is_bold {
            let color = if part.ends_with(':') {
                COLOR_ACCENT_TERRACOTTA
            } else {
                COLOR_TEXT_MAIN
            };
            ui.label(
                egui::RichText::new(*part)
                    .font(FontId::proportional(12.5))
                    .strong()
                    .color(color),
            );
        } else {
            ui.label(
                egui::RichText::new(*part)
                    .font(FontId::proportional(12.5))
                    .color(COLOR_TEXT_MUTED),
            );
        }
    }
}

pub struct CardRenderContext<'a> {
    pub query: &'a mut String,
    pub follow_up_query: &'a mut String,
    pub is_loading: bool,
    pub is_interact_mode: bool,
    pub ai_response: &'a Option<String>,
    pub error_msg: &'a Option<String>,
    pub selection_rect: &'a mut Option<Rect>,
    pub copied_toast_timer: f32,
    pub copied_toast_msg: &'a str,
}

pub enum CardAction {
    SubmitQuery(String),
    CopyText(String),
    CopyImage,
    Redraw,
    Recapture,
    ToggleMoveScreen,
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

    let is_expanded = !render_ctx.is_interact_mode
        && (render_ctx.selection_rect.is_some()
            || render_ctx.ai_response.is_some()
            || render_ctx.is_loading
            || render_ctx.error_msg.is_some());

    let card_w = if render_ctx.is_interact_mode {
        480.0f32
    } else if is_expanded {
        580.0f32
    } else {
        460.0f32
    };

    let active_pos = if render_ctx.is_interact_mode {
        Pos2::ZERO
    } else {
        let default_pos = if is_expanded {
            Pos2::new((screen_rect.max.x - card_w - 32.0).max(20.0), 36.0)
        } else {
            Pos2::new((screen_rect.max.x - card_w - 48.0).max(20.0), 48.0)
        };
        card_pos.unwrap_or(default_pos)
    };

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

            if !render_ctx.is_interact_mode {
                if title_response.dragged() {
                    *is_dragging_card = true;
                    let new_pos = active_pos + title_response.drag_delta();
                    *card_pos = Some(new_pos);
                } else if !title_response.dragged() && *is_dragging_card {
                    *is_dragging_card = false;
                }
            }

            if render_ctx.is_interact_mode {
                // ── LIVE DESKTOP / MOVE SCREEN STATE ─────────────────────────
                ui.horizontal(|ui| {
                    // Cyan glowing live dot
                    let (dot_rect, _) =
                        ui.allocate_exact_size(vec2(10.0, 10.0), egui::Sense::hover());
                    ui.painter().circle_filled(dot_rect.center(), 4.5, COLOR_ACCENT_CYAN);
                    ui.painter().circle_stroke(
                        dot_rect.center(),
                        6.5,
                        Stroke::new(1.0, Color32::from_rgba_unmultiplied(100, 210, 255, 80)),
                    );

                    ui.add_space(2.0);
                    ui.label(
                        egui::RichText::new("SuperAgent Live")
                            .font(FontId::proportional(13.5))
                            .strong()
                            .color(COLOR_TEXT_MAIN),
                    );

                    ui.label(
                        egui::RichText::new("Unlocked")
                            .font(FontId::proportional(11.0))
                            .color(COLOR_ACCENT_CYAN),
                    );

                    ui.with_layout(egui::Layout::right_to_left(egui::Align::Center), |ui| {
                        let close_btn = egui::Button::new(
                            egui::RichText::new("✕").size(11.0).color(COLOR_TEXT_MUTED),
                        )
                        .fill(COLOR_BORDER_SUBTLE)
                        .rounding(Rounding::same(8.0));
                        if ui
                            .add(close_btn)
                            .on_hover_text("Hide overlay (Esc)")
                            .clicked()
                        {
                            pending_action = Some(CardAction::Close);
                        }

                        let freeze_btn = action_button("✦ Freeze & Circle", true);
                        if ui
                            .add(freeze_btn)
                            .on_hover_text("Freeze current screen and start circling (Space)")
                            .clicked()
                        {
                            pending_action = Some(CardAction::ToggleMoveScreen);
                        }

                        let recap_btn = action_button("📸 Recapture", false);
                        if ui
                            .add(recap_btn)
                            .on_hover_text("Take a fresh screen capture (F5)")
                            .clicked()
                        {
                            pending_action = Some(CardAction::Recapture);
                        }
                    });
                });

                ui.add_space(6.0);
                ui.horizontal(|ui| {
                    ui.label(
                        egui::RichText::new(
                            "Desktop is interactive: scroll or switch windows freely • Press Space to Freeze & Circle",
                        )
                        .font(FontId::proportional(11.0))
                        .color(COLOR_TEXT_DIM),
                    );
                });
            } else if !is_expanded {
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

                    #[cfg(target_os = "macos")]
                    let shortcut_hint = "⌘+Shift+C";
                    #[cfg(not(target_os = "macos"))]
                    let shortcut_hint = "Ctrl+Shift+C";

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
                        if ui
                            .add(close_btn)
                            .on_hover_text("Hide overlay (Esc)")
                            .clicked()
                        {
                            pending_action = Some(CardAction::Close);
                        }

                        let move_btn = action_button("🔓 Move Screen", false);
                        if ui
                            .add(move_btn)
                            .on_hover_text("Unlock screen to scroll or switch windows (Space)")
                            .clicked()
                        {
                            pending_action = Some(CardAction::ToggleMoveScreen);
                        }

                        let recap_btn = action_button("📸 Recapture", false);
                        if ui
                            .add(recap_btn)
                            .on_hover_text("Recapture screen under cursor (F5)")
                            .clicked()
                        {
                            pending_action = Some(CardAction::Recapture);
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

                    ui.add_space(6.0);

                    ui.horizontal(|ui| {
                        ui.label(
                            egui::RichText::new(
                                "Circle anything on screen • 🔓 Move Screen to scroll • Esc to hide",
                            )
                            .font(FontId::proportional(10.5))
                            .color(COLOR_TEXT_DIM),
                        );
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

                    ui.with_layout(egui::Layout::right_to_left(egui::Align::Center), |ui| {
                        let close_btn = action_button("✕", false);
                        if ui
                            .add(close_btn)
                            .on_hover_text("Hide overlay (Esc)")
                            .clicked()
                        {
                            pending_action = Some(CardAction::Close);
                        }

                        if render_ctx.selection_rect.is_some() {
                            let redraw_btn = action_button("🔄 Redraw", false);
                            if ui
                                .add(redraw_btn)
                                .on_hover_text("Circle new area")
                                .clicked()
                            {
                                pending_action = Some(CardAction::Redraw);
                            }

                            let img_label = if render_ctx.copied_toast_timer > 0.0
                                && (render_ctx.copied_toast_msg.contains("Screenshot")
                                    || render_ctx.copied_toast_msg.contains("Image"))
                            {
                                "✓ Image Copied"
                            } else {
                                "📷 Copy Image"
                            };
                            let copy_img_btn = action_button(img_label, false);
                            if ui
                                .add(copy_img_btn)
                                .on_hover_text("Copy selected area screenshot image to clipboard (Ctrl+C)")
                                .clicked()
                            {
                                pending_action = Some(CardAction::CopyImage);
                            }
                        }

                        if render_ctx.ai_response.is_some() {
                            let text_label = if render_ctx.copied_toast_timer > 0.0
                                && render_ctx.copied_toast_msg.contains("Text")
                            {
                                "✓ Text Copied"
                            } else {
                                "📋 Copy Text"
                            };
                            let copy_text_btn = action_button(text_label, false);
                            if ui
                                .add(copy_text_btn)
                                .on_hover_text("Copy AI text insights to clipboard (Ctrl+C)")
                                .clicked()
                            {
                                if let Some(ref text) = render_ctx.ai_response {
                                    pending_action = Some(CardAction::CopyText(text.clone()));
                                }
                            }
                        }

                        let recap_btn = action_button("📸 Recapture", false);
                        if ui
                            .add(recap_btn)
                            .on_hover_text("Recapture screen with current view (F5)")
                            .clicked()
                        {
                            pending_action = Some(CardAction::Recapture);
                        }

                        let move_btn = action_button("🔓 Move Screen", false);
                        if ui
                            .add(move_btn)
                            .on_hover_text("Unlock screen to scroll or navigate (Space)")
                            .clicked()
                        {
                            pending_action = Some(CardAction::ToggleMoveScreen);
                        }
                    });
                });

                ui.add_space(6.0);
                ui.separator();
                ui.add_space(6.0);

                // Content Area with generous auto-expanding reading height
                let min_h = if render_ctx.ai_response.is_some() {
                    240.0f32
                } else if render_ctx.is_loading {
                    60.0f32
                } else {
                    40.0f32
                };

                ScrollArea::vertical()
                    .min_scrolled_height(min_h)
                    .max_height(480.0)
                    .auto_shrink([false, false])
                    .show(ui, |ui| {
                        ui.set_min_height(min_h);
                        ui.vertical(|ui| {
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
                                        ui.add_space(4.0);
                                        continue;
                                    }

                                    // Filter out redundant boilerplate intros/headings
                                    let lower = trimmed.to_lowercase();
                                    if lower.starts_with("visual intelligence analysis")
                                        || lower.starts_with("**visual intelligence analysis")
                                        || lower.starts_with("🔍 **visual intelligence analysis")
                                        || lower.starts_with("visual analysis")
                                        || lower.starts_with("here is what is happening")
                                    {
                                        continue;
                                    }

                                    if trimmed.starts_with("# ") || trimmed.starts_with("## ") {
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
                                        ui.horizontal_wrapped(|ui| {
                                            ui.spacing_mut().item_spacing = vec2(3.0, 2.0);
                                            ui.label(
                                                egui::RichText::new("•")
                                                    .font(FontId::proportional(12.0))
                                                    .color(COLOR_ACCENT_TERRACOTTA),
                                            );
                                            render_styled_text_chunk(ui, bullet_text);
                                        });
                                    } else {
                                        ui.horizontal_wrapped(|ui| {
                                            ui.spacing_mut().item_spacing = vec2(3.0, 2.0);
                                            render_styled_text_chunk(ui, trimmed);
                                        });
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
                            egui::RichText::new(
                                "Press Enter to send • F5 to recapture • Space to move screen • Esc to hide",
                            )
                            .font(FontId::proportional(10.5))
                            .color(COLOR_TEXT_DIM),
                        );
                    });
                });
            }
        });

    let _ = window_response;
    pending_action
}
