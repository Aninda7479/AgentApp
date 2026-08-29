use egui::{
    vec2, Color32, FontId, Margin, Pos2, Rect, Rounding, Stroke,
};
use std::sync::mpsc::{channel, Receiver, Sender};
use std::time::{Duration, Instant};

use crate::api::query_voice_transcribe;
use crate::audio::AudioRecorder;

#[derive(Clone, Debug, PartialEq)]
pub enum DictationState {
    Listening,
    Transcribing,
    Done(String),
    Error(String),
}

pub struct DictationApp {
    state: DictationState,
    recorder: Option<AudioRecorder>,
    level_history: Vec<f32>,
    start_time: Instant,
    tx: Sender<Result<String, String>>,
    rx: Receiver<Result<String, String>>,
    auto_dismiss_at: Option<Instant>,
    auto_paste_done: bool,
}

impl DictationApp {
    pub fn new() -> Self {
        let (tx, rx) = channel();
        let recorder = AudioRecorder::start().ok();
        let state = if recorder.is_some() {
            DictationState::Listening
        } else {
            DictationState::Error("Could not access microphone. Please check system permissions.".to_string())
        };

        Self {
            state,
            recorder,
            level_history: vec![0.05; 16],
            start_time: Instant::now(),
            tx,
            rx,
            auto_dismiss_at: None,
            auto_paste_done: false,
        }
    }

    fn stop_and_transcribe(&mut self) {
        if self.state != DictationState::Listening {
            return;
        }

        self.state = DictationState::Transcribing;
        if let Some(rec) = self.recorder.take() {
            let tx = self.tx.clone();
            let wav_res = rec.stop();
            tokio::spawn(async move {
                match wav_res {
                    Ok(wav_bytes) => {
                        let res = query_voice_transcribe(&wav_bytes).await;
                        let _ = tx.send(res);
                    }
                    Err(err) => {
                        let _ = tx.send(Err(err));
                    }
                }
            });
        } else {
            self.state = DictationState::Error("No active audio recording found.".to_string());
        }
    }

    fn copy_to_clipboard(&self, text: &str) {
        if let Ok(mut clipboard) = arboard::Clipboard::new() {
            let _ = clipboard.set_text(text.to_string());
        }
    }

    fn inject_paste(&mut self, text: &str) {
        self.copy_to_clipboard(text);

        // Simulate Ctrl+V on Windows/Linux or Cmd+V on macOS
        #[cfg(target_os = "windows")]
        {
            use enigo::{Enigo, Key, Keyboard, Settings};
            let mut enigo = match Enigo::new(&Settings::default()) {
                Ok(e) => e,
                Err(_) => return,
            };
            let _ = enigo.key(Key::Control, enigo::Direction::Press);
            let _ = enigo.key(Key::Unicode('v'), enigo::Direction::Click);
            let _ = enigo.key(Key::Control, enigo::Direction::Release);
        }
    }
}

impl eframe::App for DictationApp {
    fn update(&mut self, ctx: &egui::Context, _frame: &mut eframe::Frame) {
        ctx.request_repaint_after(Duration::from_millis(30));

        // 1. Process asynchronous transcription result
        if let Ok(res) = self.rx.try_recv() {
            match res {
                Ok(text) => {
                    let trimmed = text.trim().to_string();
                    if trimmed.is_empty() {
                        self.state = DictationState::Error("No speech detected in audio recording.".to_string());
                    } else {
                        if !self.auto_paste_done {
                            self.inject_paste(&trimmed);
                            self.auto_paste_done = true;
                            self.auto_dismiss_at = Some(Instant::now() + Duration::from_millis(3200));
                        }
                        self.state = DictationState::Done(trimmed);
                    }
                }
                Err(err) => {
                    self.state = DictationState::Error(err);
                }
            }
        }

        // 2. Auto-dismiss timer
        if let Some(target) = self.auto_dismiss_at {
            if Instant::now() >= target {
                ctx.send_viewport_cmd(egui::ViewportCommand::Close);
            }
        }

        // 3. Global hotkeys within overlay
        if ctx.input(|i| i.key_pressed(egui::Key::Escape)) {
            ctx.send_viewport_cmd(egui::ViewportCommand::Close);
        }

        if self.state == DictationState::Listening {
            if ctx.input(|i| i.key_pressed(egui::Key::Enter) || i.key_pressed(egui::Key::Space)) {
                self.stop_and_transcribe();
            }
        }

        // 4. Sample live audio level
        if let Some(ref rec) = self.recorder {
            let lvl = rec.get_current_level();
            self.level_history.remove(0);
            self.level_history.push(lvl);
        }

        // 5. Render Floating Frosted Glass Voice Pill
        let card_w = 420.0f32;
        let screen_rect = ctx.screen_rect();
        let active_pos = Pos2::new(
            (screen_rect.center().x - (card_w / 2.0)).max(20.0),
            (screen_rect.max.y - 180.0).max(40.0),
        );

        egui::Window::new("SuperAgent Voice Dictation HUD")
            .id(egui::Id::new("superagent_dictation_hud"))
            .title_bar(false)
            .resizable(false)
            .fixed_pos(active_pos)
            .fixed_size(vec2(card_w, 0.0))
            .frame(
                egui::Frame::none()
                    .fill(Color32::from_rgba_unmultiplied(13, 16, 23, 230))
                    .stroke(Stroke::new(1.0, Color32::from_rgba_unmultiplied(255, 255, 255, 38)))
                    .rounding(Rounding::same(20.0))
                    .inner_margin(Margin::symmetric(18.0, 14.0))
                    .shadow(egui::epaint::Shadow {
                        offset: vec2(0.0, 16.0),
                        blur: 32.0,
                        spread: 0.0,
                        color: Color32::from_black_alpha(200),
                    }),
            )
            .show(ctx, |ui| {
                ui.set_width(card_w - 36.0);

                match &self.state {
                    DictationState::Listening => {
                        let elapsed = self.start_time.elapsed().as_secs();
                        let mins = elapsed / 60;
                        let secs = elapsed % 60;

                        ui.horizontal(|ui| {
                            // Pulsating red/purple recording dot
                            let (rect, _) = ui.allocate_exact_size(vec2(14.0, 14.0), egui::Sense::hover());
                            let pulse = (self.start_time.elapsed().as_millis() as f32 / 300.0).sin().abs();
                            ui.painter().circle_filled(
                                rect.center(),
                                5.0 + pulse * 2.0,
                                Color32::from_rgba_unmultiplied(239, 68, 68, (180.0 + pulse * 75.0) as u8),
                            );

                            ui.label(
                                egui::RichText::new("✦ SuperAgent Voice")
                                    .font(FontId::proportional(13.5))
                                    .strong()
                                    .color(Color32::from_rgb(240, 245, 255)),
                            );

                            ui.label(
                                egui::RichText::new(format!("{:02}:{:02}", mins, secs))
                                    .font(FontId::monospace(12.0))
                                    .color(Color32::from_rgb(150, 165, 185)),
                            );

                            ui.with_layout(egui::Layout::right_to_left(egui::Align::Center), |ui| {
                                let close_btn = egui::Button::new(egui::RichText::new("✕").size(11.0).color(Color32::from_rgb(180, 190, 205)))
                                    .fill(Color32::from_rgba_unmultiplied(255, 255, 255, 12))
                                    .rounding(Rounding::same(6.0));
                                if ui.add(close_btn).clicked() {
                                    ctx.send_viewport_cmd(egui::ViewportCommand::Close);
                                }
                            });
                        });

                        ui.add_space(8.0);

                        // Animated Dynamic Sound Waveform Bars
                        ui.horizontal(|ui| {
                            let available_w = ui.available_width() - 110.0;
                            let bar_count = 20;
                            let bar_w = (available_w / (bar_count as f32)).max(4.0) - 2.0;

                            for i in 0..bar_count {
                                let hist_idx = (i * self.level_history.len()) / bar_count;
                                let lvl = self.level_history.get(hist_idx).copied().unwrap_or(0.05);
                                let jitter = ((i as f32 * 1.7 + self.start_time.elapsed().as_millis() as f32 / 120.0).sin().abs()) * 0.15;
                                let h = (8.0 + (lvl + jitter) * 32.0).clamp(4.0, 28.0);

                                let (bar_rect, _) = ui.allocate_exact_size(vec2(bar_w, 28.0), egui::Sense::hover());
                                let top = bar_rect.center().y - (h / 2.0);
                                let draw_rect = Rect::from_min_size(Pos2::new(bar_rect.min.x, top), vec2(bar_w, h));

                                let color = if lvl > 0.3 {
                                    Color32::from_rgb(96, 165, 250) // Bright blue
                                } else {
                                    Color32::from_rgb(167, 139, 250) // Soft lavender purple
                                };

                                ui.painter().rect_filled(draw_rect, Rounding::same(2.0), color);
                            }

                            ui.with_layout(egui::Layout::right_to_left(egui::Align::Center), |ui| {
                                let stop_btn = egui::Button::new(
                                    egui::RichText::new("Done ↵")
                                        .size(12.0)
                                        .strong()
                                        .color(Color32::WHITE),
                                )
                                .fill(Color32::from_rgb(79, 70, 229))
                                .rounding(Rounding::same(10.0))
                                .stroke(Stroke::new(1.0, Color32::from_rgba_unmultiplied(255, 255, 255, 50)));

                                if ui.add(stop_btn).clicked() {
                                    self.stop_and_transcribe();
                                }
                            });
                        });
                    }

                    DictationState::Transcribing => {
                        ui.horizontal(|ui| {
                            ui.spinner();
                            ui.add_space(6.0);
                            ui.label(
                                egui::RichText::new("Transcribing with AI Whisper...")
                                    .font(FontId::proportional(13.0))
                                    .color(Color32::from_rgb(220, 230, 245)),
                            );
                        });
                    }

                    DictationState::Done(text) => {
                        ui.horizontal(|ui| {
                            ui.label(
                                egui::RichText::new("✓ Transcribed & Typed")
                                    .font(FontId::proportional(12.5))
                                    .strong()
                                    .color(Color32::from_rgb(52, 211, 153)),
                            );

                            ui.with_layout(egui::Layout::right_to_left(egui::Align::Center), |ui| {
                                let close_btn = egui::Button::new(egui::RichText::new("✕").size(11.0).color(Color32::from_rgb(180, 190, 205)))
                                    .fill(Color32::from_rgba_unmultiplied(255, 255, 255, 12))
                                    .rounding(Rounding::same(6.0));
                                if ui.add(close_btn).clicked() {
                                    ctx.send_viewport_cmd(egui::ViewportCommand::Close);
                                }

                                let copy_btn = egui::Button::new(egui::RichText::new("📋 Copy").size(11.0).color(Color32::from_rgb(220, 230, 245)))
                                    .fill(Color32::from_rgba_unmultiplied(255, 255, 255, 16))
                                    .rounding(Rounding::same(6.0));
                                if ui.add(copy_btn).clicked() {
                                    self.copy_to_clipboard(text);
                                }
                            });
                        });

                        ui.add_space(6.0);
                        egui::Frame::none()
                            .fill(Color32::from_rgba_unmultiplied(255, 255, 255, 10))
                            .rounding(Rounding::same(8.0))
                            .inner_margin(Margin::symmetric(10.0, 8.0))
                            .show(ui, |ui| {
                                ui.label(
                                    egui::RichText::new(text)
                                        .font(FontId::proportional(13.0))
                                        .color(Color32::from_rgb(245, 247, 250)),
                                );
                            });
                    }

                    DictationState::Error(err) => {
                        ui.horizontal(|ui| {
                            ui.label(
                                egui::RichText::new("⚠ Notice")
                                    .font(FontId::proportional(12.5))
                                    .strong()
                                    .color(Color32::from_rgb(251, 146, 60)),
                            );

                            ui.with_layout(egui::Layout::right_to_left(egui::Align::Center), |ui| {
                                let close_btn = egui::Button::new(egui::RichText::new("✕").size(11.0).color(Color32::from_rgb(180, 190, 205)))
                                    .fill(Color32::from_rgba_unmultiplied(255, 255, 255, 12))
                                    .rounding(Rounding::same(6.0));
                                if ui.add(close_btn).clicked() {
                                    ctx.send_viewport_cmd(egui::ViewportCommand::Close);
                                }
                            });
                        });

                        ui.add_space(4.0);
                        ui.label(
                            egui::RichText::new(err)
                                .font(FontId::proportional(12.0))
                                .color(Color32::from_rgb(254, 202, 202)),
                        );
                    }
                }
            });
    }
}
