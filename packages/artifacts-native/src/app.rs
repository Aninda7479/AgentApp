use eframe::egui::{
    self, Align, Button, Color32, FontId, Key, Layout, Margin, Pos2, Rect, RichText, Rounding,
    ScrollArea, Stroke, TextEdit, Ui, UiBuilder, Vec2,
};
use std::sync::mpsc::{channel, Receiver, Sender};
use std::time::{Duration, Instant};

use crate::api::{
    delete_artifact, fetch_artifacts, open_artifact_browser, open_artifacts_folder,
    scan_local_artifacts, start_artifact, stop_artifact, toggle_autostart, ArtifactRuntimeState,
};

// SuperAgent Dark Theme Palette Tokens
const COLOR_BG: Color32 = Color32::from_rgb(24, 25, 27); // #18191B
const COLOR_HEADER: Color32 = Color32::from_rgb(18, 19, 21); // #121315
const COLOR_CARD: Color32 = Color32::from_rgb(33, 34, 38); // #212226
const COLOR_INPUT: Color32 = Color32::from_rgb(14, 15, 17); // #0E0F11
const COLOR_BORDER: Color32 = Color32::from_rgba_premultiplied(255, 255, 255, 20); // 0.08
const COLOR_BORDER_STRONG: Color32 = Color32::from_rgba_premultiplied(255, 255, 255, 38);
const COLOR_TEXT_MAIN: Color32 = Color32::from_rgb(242, 243, 245);
const COLOR_TEXT_MUTED: Color32 = Color32::from_rgb(148, 151, 158);
const COLOR_TEXT_FAINT: Color32 = Color32::from_rgb(110, 113, 120);

const COLOR_ACCENT: Color32 = Color32::from_rgb(217, 119, 87); // Terracotta #D97757
const COLOR_CYAN: Color32 = Color32::from_rgb(56, 189, 248); // Cyan/Sky #38BDF8
const COLOR_GREEN: Color32 = Color32::from_rgb(52, 211, 153); // Constructive #34D399
const COLOR_RED: Color32 = Color32::from_rgb(248, 113, 113); // Destructive #F87171

pub struct ArtifactsApp {
    artifacts: Vec<ArtifactRuntimeState>,
    search: String,
    loading: bool,
    confirm_delete_id: Option<String>,
    status_toast: Option<(String, Instant)>,
    tx: Sender<Vec<ArtifactRuntimeState>>,
    rx: Receiver<Vec<ArtifactRuntimeState>>,
    last_poll: Instant,
    has_gained_focus: bool,
}

impl ArtifactsApp {
    pub fn new() -> Self {
        let (tx, rx) = channel();
        let initial = scan_local_artifacts();

        // Trigger background initial fetch from daemon
        let tx_clone = tx.clone();
        tokio::spawn(async move {
            let list = fetch_artifacts().await;
            let _ = tx_clone.send(list);
        });

        Self {
            artifacts: initial,
            search: String::new(),
            loading: false,
            confirm_delete_id: None,
            status_toast: None,
            tx,
            rx,
            last_poll: Instant::now(),
            has_gained_focus: false,
        }
    }

    fn refresh(&mut self) {
        self.loading = true;
        let tx = self.tx.clone();
        tokio::spawn(async move {
            let list = fetch_artifacts().await;
            let _ = tx.send(list);
        });
    }
}

impl eframe::App for ArtifactsApp {
    fn update(&mut self, ctx: &egui::Context, _frame: &mut eframe::Frame) {
        // 1. Receive background list updates
        if let Ok(list) = self.rx.try_recv() {
            self.artifacts = list;
            self.loading = false;
        }

        // 2. Auto-poll every 3.5 seconds
        if self.last_poll.elapsed() > Duration::from_millis(3500) {
            self.last_poll = Instant::now();
            let tx = self.tx.clone();
            tokio::spawn(async move {
                let list = fetch_artifacts().await;
                let _ = tx.send(list);
            });
        }

        // 3. Handle keyboard shortcuts: ESC closes
        if ctx.input(|i| i.key_pressed(Key::Escape)) {
            ctx.send_viewport_cmd(egui::ViewportCommand::Close);
        }

        // 4. Auto-dismiss on blur after having gained focus
        let is_focused = ctx.input(|i| i.focused);
        if is_focused {
            self.has_gained_focus = true;
        } else if self.has_gained_focus {
            ctx.send_viewport_cmd(egui::ViewportCommand::Close);
        }

        // 5. Clean up expired toast
        if let Some((_, expire)) = self.status_toast {
            if Instant::now() > expire {
                self.status_toast = None;
            }
        }

        // 6. Draw Window Frame & Body
        let screen_rect = ctx.screen_rect();
        let painter = ctx.layer_painter(egui::LayerId::background());

        // Fill background
        painter.rect_filled(screen_rect, Rounding::same(12.0), COLOR_BG);
        painter.rect_stroke(
            screen_rect,
            Rounding::same(12.0),
            Stroke::new(1.0, COLOR_BORDER),
        );

        egui::CentralPanel::default()
            .frame(
                egui::Frame::none()
                    .fill(COLOR_BG)
                    .rounding(Rounding::same(12.0))
                    .inner_margin(Margin::same(0.0)),
            )
            .show(ctx, |ui| {
                self.render_header(ui);
                self.render_search(ui);
                self.render_artifacts_list(ui);
                self.render_footer(ui);
            });

        ctx.request_repaint_after(Duration::from_millis(500));
    }
}

impl ArtifactsApp {
    fn render_header(&mut self, ui: &mut Ui) {
        let header_rect =
            Rect::from_min_size(ui.min_rect().min, Vec2::new(ui.available_width(), 48.0));
        let painter = ui.painter();
        painter.rect_filled(header_rect, Rounding::same(12.0), COLOR_HEADER);
        painter.line_segment(
            [
                Pos2::new(header_rect.min.x, header_rect.max.y),
                Pos2::new(header_rect.max.x, header_rect.max.y),
            ],
            Stroke::new(1.0, COLOR_BORDER),
        );

        ui.allocate_new_ui(UiBuilder::new().max_rect(header_rect), |ui| {
            ui.horizontal_centered(|ui| {
                ui.add_space(12.0);

                // App Brand Icon
                let icon_text = RichText::new("⚡").color(COLOR_ACCENT).size(16.0);
                ui.label(icon_text);

                // Title & Count
                let count_str = format!("Artifacts ({})", self.artifacts.len());
                let title = RichText::new(count_str)
                    .color(COLOR_TEXT_MAIN)
                    .font(FontId::proportional(13.5))
                    .strong();
                ui.label(title);

                ui.with_layout(Layout::right_to_left(Align::Center), |ui| {
                    ui.add_space(10.0);

                    // Close Button ✕
                    let close_btn =
                        Button::new(RichText::new("✕").color(COLOR_TEXT_MUTED).size(12.0))
                            .fill(Color32::TRANSPARENT)
                            .stroke(Stroke::NONE)
                            .rounding(Rounding::same(6.0));
                    if ui.add(close_btn).on_hover_text("Close").clicked() {
                        ui.ctx().send_viewport_cmd(egui::ViewportCommand::Close);
                    }

                    // Open Storage Folder 📁
                    let folder_btn = Button::new(RichText::new("📁").size(13.0))
                        .fill(Color32::from_rgb(26, 28, 33))
                        .stroke(Stroke::new(1.0, COLOR_BORDER))
                        .rounding(Rounding::same(6.0));
                    if ui
                        .add(folder_btn)
                        .on_hover_text("Open ~/.superagent/artifacts")
                        .clicked()
                    {
                        open_artifacts_folder();
                    }

                    // Refresh Button 🔄
                    let refresh_btn = Button::new(RichText::new("🔄").size(13.0))
                        .fill(Color32::from_rgb(26, 28, 33))
                        .stroke(Stroke::new(1.0, COLOR_BORDER))
                        .rounding(Rounding::same(6.0));
                    if ui
                        .add(refresh_btn)
                        .on_hover_text("Refresh Artifacts")
                        .clicked()
                    {
                        self.refresh();
                    }
                });
            });
        });

        ui.add_space(48.0);
    }

    fn render_search(&mut self, ui: &mut Ui) {
        ui.add_space(8.0);
        ui.horizontal(|ui| {
            ui.add_space(12.0);
            let search_width = ui.available_width() - 12.0;

            egui::Frame::none()
                .fill(COLOR_INPUT)
                .stroke(Stroke::new(1.0, COLOR_BORDER_STRONG))
                .rounding(Rounding::same(8.0))
                .inner_margin(Margin::symmetric(10.0, 6.0))
                .show(ui, |ui| {
                    ui.set_width(search_width);
                    ui.horizontal(|ui| {
                        ui.label(RichText::new("🔍").size(11.0).color(COLOR_TEXT_FAINT));
                        let edit = TextEdit::singleline(&mut self.search)
                            .hint_text(
                                RichText::new("Filter artifacts...")
                                    .color(COLOR_TEXT_FAINT)
                                    .size(12.0),
                            )
                            .text_color(COLOR_TEXT_MAIN)
                            .frame(false)
                            .desired_width(search_width - 50.0);
                        ui.add(edit);

                        if !self.search.is_empty()
                            && ui
                                .add(
                                    Button::new(
                                        RichText::new("✕").size(10.0).color(COLOR_TEXT_MUTED),
                                    )
                                    .frame(false),
                                )
                                .clicked()
                        {
                            self.search.clear();
                        }
                    });
                });
        });
        ui.add_space(6.0);
    }

    fn render_artifacts_list(&mut self, ui: &mut Ui) {
        let search_term = self.search.to_lowercase();
        let filtered: Vec<ArtifactRuntimeState> = self
            .artifacts
            .iter()
            .filter(|a| {
                if search_term.is_empty() {
                    return true;
                }
                a.manifest.name.to_lowercase().contains(&search_term)
                    || a.manifest.description.to_lowercase().contains(&search_term)
                    || a.manifest
                        .artifact_type
                        .to_lowercase()
                        .contains(&search_term)
            })
            .cloned()
            .collect();

        ScrollArea::vertical()
            .auto_shrink([false, false])
            .max_height(ui.available_height() - 36.0)
            .show(ui, |ui| {
                ui.add_space(4.0);

                if filtered.is_empty() {
                    ui.vertical_centered(|ui| {
                        ui.add_space(60.0);
                        ui.label(RichText::new("📦").size(28.0));
                        ui.add_space(8.0);
                        ui.label(
                            RichText::new(if self.artifacts.is_empty() {
                                "No micro-app artifacts installed"
                            } else {
                                "No artifacts match your filter"
                            })
                            .color(COLOR_TEXT_MUTED)
                            .size(13.0)
                            .strong(),
                        );
                        ui.add_space(4.0);
                        ui.label(
                            RichText::new(
                                "Apps generated by SuperAgent appear here automatically.",
                            )
                            .color(COLOR_TEXT_FAINT)
                            .size(11.0),
                        );
                    });
                    return;
                }

                for art in filtered {
                    self.render_artifact_card(ui, &art);
                    ui.add_space(6.0);
                }
            });
    }

    fn render_artifact_card(&mut self, ui: &mut Ui, art: &ArtifactRuntimeState) {
        let is_running = art.status == "running";
        let is_confirming_delete = self.confirm_delete_id.as_deref() == Some(&art.id);

        ui.horizontal(|ui| {
            ui.add_space(10.0);
            let card_width = ui.available_width() - 10.0;

            egui::Frame::none()
                .fill(COLOR_CARD)
                .stroke(Stroke::new(
                    1.0,
                    if is_running {
                        COLOR_GREEN
                    } else {
                        COLOR_BORDER
                    },
                ))
                .rounding(Rounding::same(8.0))
                .inner_margin(Margin::symmetric(10.0, 8.0))
                .show(ui, |ui| {
                    ui.set_width(card_width);

                    ui.vertical(|ui| {
                        // Top row: Icon, Name, Type Badge, Port
                        ui.horizontal(|ui| {
                            let icon = art.manifest.icon.as_deref().unwrap_or("📦");
                            ui.label(RichText::new(icon).size(14.0));

                            let name_text = RichText::new(&art.manifest.name)
                                .color(COLOR_TEXT_MAIN)
                                .size(12.5)
                                .strong();
                            ui.label(name_text);

                            // Type tag
                            let type_str = match art.manifest.artifact_type.as_str() {
                                "python" => "Python",
                                "node" => "Node.js",
                                "web" | "static" => "Web",
                                other => other,
                            };
                            egui::Frame::none()
                                .fill(COLOR_INPUT)
                                .rounding(Rounding::same(4.0))
                                .stroke(Stroke::new(1.0, COLOR_BORDER))
                                .inner_margin(Margin::symmetric(5.0, 1.0))
                                .show(ui, |ui| {
                                    ui.label(
                                        RichText::new(type_str)
                                            .color(COLOR_TEXT_MUTED)
                                            .size(9.5)
                                            .monospace(),
                                    );
                                });

                            // Running / Port badge
                            if is_running {
                                let port_str = format!(":{}", art.port.unwrap_or(3080));
                                egui::Frame::none()
                                    .fill(Color32::from_rgba_premultiplied(52, 211, 153, 30))
                                    .rounding(Rounding::same(4.0))
                                    .inner_margin(Margin::symmetric(5.0, 1.0))
                                    .show(ui, |ui| {
                                        ui.label(
                                            RichText::new(port_str)
                                                .color(COLOR_GREEN)
                                                .size(9.5)
                                                .monospace()
                                                .strong(),
                                        );
                                    });
                            }

                            // Autostart indicator toggle
                            let autostart_label = if art.autostart {
                                "⚡ Boot"
                            } else {
                                "○ Boot"
                            };
                            let autostart_color = if art.autostart {
                                COLOR_CYAN
                            } else {
                                COLOR_TEXT_FAINT
                            };
                            let boot_btn = Button::new(
                                RichText::new(autostart_label)
                                    .color(autostart_color)
                                    .size(9.5),
                            )
                            .fill(Color32::TRANSPARENT)
                            .stroke(Stroke::new(
                                0.5,
                                if art.autostart {
                                    COLOR_CYAN
                                } else {
                                    COLOR_BORDER
                                },
                            ))
                            .rounding(Rounding::same(4.0));
                            if ui
                                .add(boot_btn)
                                .on_hover_text(if art.autostart {
                                    "Autostarts on boot (click to disable)"
                                } else {
                                    "Enable autostart on boot"
                                })
                                .clicked()
                            {
                                let id = art.id.clone();
                                let new_val = !art.autostart;
                                tokio::spawn(async move {
                                    let _ = toggle_autostart(&id, new_val).await;
                                });
                                self.refresh();
                            }
                        });

                        // Description if present
                        if !art.manifest.description.is_empty() {
                            ui.add_space(2.0);
                            let desc_text = RichText::new(&art.manifest.description)
                                .color(COLOR_TEXT_MUTED)
                                .size(10.5);
                            ui.label(desc_text);
                        }

                        ui.add_space(4.0);

                        // Actions Row: [Run/Stop] [Open] [Delete]
                        ui.horizontal(|ui| {
                            // Run / Stop toggle
                            let run_text = if is_running { "Stop" } else { "Run" };
                            let run_color = if is_running { COLOR_RED } else { COLOR_GREEN };
                            let run_bg = if is_running {
                                Color32::from_rgba_premultiplied(248, 113, 113, 30)
                            } else {
                                Color32::from_rgba_premultiplied(52, 211, 153, 30)
                            };

                            let run_btn = Button::new(
                                RichText::new(run_text).color(run_color).size(11.0).strong(),
                            )
                            .fill(run_bg)
                            .stroke(Stroke::new(1.0, run_color))
                            .rounding(Rounding::same(5.0));

                            if ui.add(run_btn).clicked() {
                                let id = art.id.clone();
                                if is_running {
                                    tokio::spawn(async move {
                                        let _ = stop_artifact(&id).await;
                                    });
                                } else {
                                    tokio::spawn(async move {
                                        let _ = start_artifact(&id).await;
                                    });
                                }
                                self.refresh();
                            }

                            // Open in Browser
                            let open_btn = Button::new(
                                RichText::new("Open").color(COLOR_TEXT_MAIN).size(11.0),
                            )
                            .fill(Color32::from_rgb(45, 47, 54))
                            .stroke(Stroke::new(1.0, COLOR_BORDER_STRONG))
                            .rounding(Rounding::same(5.0));

                            if ui
                                .add(open_btn)
                                .on_hover_text("Open in default browser")
                                .clicked()
                            {
                                let url = art.url.clone().unwrap_or_else(|| {
                                    format!("http://127.0.0.1:{}", art.port.unwrap_or(3080))
                                });
                                open_artifact_browser(&url);
                            }

                            ui.with_layout(Layout::right_to_left(Align::Center), |ui| {
                                if is_confirming_delete {
                                    let yes_btn = Button::new(
                                        RichText::new("Confirm").color(COLOR_RED).size(10.5),
                                    )
                                    .fill(Color32::from_rgba_premultiplied(248, 113, 113, 30))
                                    .stroke(Stroke::new(1.0, COLOR_RED))
                                    .rounding(Rounding::same(4.0));
                                    if ui.add(yes_btn).clicked() {
                                        let id = art.id.clone();
                                        tokio::spawn(async move {
                                            let _ = delete_artifact(&id).await;
                                        });
                                        self.confirm_delete_id = None;
                                        self.refresh();
                                    }

                                    let cancel_btn = Button::new(
                                        RichText::new("No").color(COLOR_TEXT_MUTED).size(10.5),
                                    )
                                    .fill(Color32::TRANSPARENT)
                                    .rounding(Rounding::same(4.0));
                                    if ui.add(cancel_btn).clicked() {
                                        self.confirm_delete_id = None;
                                    }
                                } else {
                                    let del_btn = Button::new(
                                        RichText::new("🗑").color(COLOR_TEXT_MUTED).size(11.0),
                                    )
                                    .fill(Color32::TRANSPARENT)
                                    .stroke(Stroke::NONE)
                                    .rounding(Rounding::same(4.0));
                                    if ui.add(del_btn).on_hover_text("Delete artifact").clicked() {
                                        self.confirm_delete_id = Some(art.id.clone());
                                    }
                                }
                            });
                        });
                    });
                });
        });
    }

    fn render_footer(&mut self, ui: &mut Ui) {
        let footer_rect = Rect::from_min_size(
            Pos2::new(ui.min_rect().min.x, ui.max_rect().max.y - 30.0),
            Vec2::new(ui.available_width(), 30.0),
        );
        let painter = ui.painter();
        painter.rect_filled(footer_rect, Rounding::same(12.0), COLOR_HEADER);
        painter.line_segment(
            [
                Pos2::new(footer_rect.min.x, footer_rect.min.y),
                Pos2::new(footer_rect.max.x, footer_rect.min.y),
            ],
            Stroke::new(1.0, COLOR_BORDER),
        );

        ui.allocate_new_ui(UiBuilder::new().max_rect(footer_rect), |ui| {
            ui.horizontal_centered(|ui| {
                ui.add_space(12.0);
                if let Some((msg, _)) = &self.status_toast {
                    ui.label(RichText::new(msg).color(COLOR_CYAN).size(10.0));
                } else {
                    ui.label(
                        RichText::new("~/.superagent/artifacts")
                            .color(COLOR_TEXT_FAINT)
                            .size(10.0)
                            .monospace(),
                    );
                }

                ui.with_layout(Layout::right_to_left(Align::Center), |ui| {
                    ui.add_space(12.0);
                    let tag = RichText::new("● Native Rust UI")
                        .color(COLOR_ACCENT)
                        .size(10.0)
                        .strong();
                    ui.label(tag);
                });
            });
        });
    }
}
