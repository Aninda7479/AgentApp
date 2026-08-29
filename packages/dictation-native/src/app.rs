use egui::{
    vec2, Align2, Color32, FontId, Key, Pos2, Rect, Rounding, Stroke,
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
            DictationState::Error("Mic unavailable".to_string())
        };

        Self {
            state,
            recorder,
            level_history: vec![0.08; 12],
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
            self.state = DictationState::Error("No audio".to_string());
        }
    }

    fn copy_to_clipboard(&self, text: &str) {
        if let Ok(mut clipboard) = arboard::Clipboard::new() {
            let _ = clipboard.set_text(text.to_string());
        }
    }

    fn inject_paste(&mut self, text: &str) {
        self.copy_to_clipboard(text);

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
        // 1. Poll backend transcription response
        if let Ok(res) = self.rx.try_recv() {
            match res {
                Ok(text) => {
                    let trimmed = text.trim().to_string();
                    if !trimmed.is_empty() && !self.auto_paste_done {
                        self.inject_paste(&trimmed);
                        self.auto_paste_done = true;
                    }
                    self.state = DictationState::Done(trimmed);
                    self.auto_dismiss_at = Some(Instant::now() + Duration::from_millis(600));
                }
                Err(err) => {
                    self.state = DictationState::Error(err);
                    self.auto_dismiss_at = Some(Instant::now() + Duration::from_millis(1500));
                }
            }
        }

        // 2. Auto-dismiss timer
        if let Some(dismiss_time) = self.auto_dismiss_at {
            if Instant::now() >= dismiss_time {
                ctx.send_viewport_cmd(egui::ViewportCommand::Close);
            }
        }

        // 3. Key handling: ESC cancels, ENTER submits
        if ctx.input(|i| i.key_pressed(Key::Escape)) {
            ctx.send_viewport_cmd(egui::ViewportCommand::Close);
        }

        if ctx.input(|i| i.key_pressed(Key::Enter)) && self.state == DictationState::Listening {
            self.stop_and_transcribe();
        }

        // 4. Update audio levels
        if let Some(ref rec) = self.recorder {
            let current_level = rec.get_current_level();
            self.level_history.remove(0);
            self.level_history.push(current_level);
        }

        ctx.request_repaint();

        let screen_rect = ctx.screen_rect();
        let painter = ctx.layer_painter(egui::LayerId::new(egui::Order::Foreground, egui::Id::new("dictation_pill")));

        // 5. Draw Centered Floating Pill (Matte Charcoal Black)
        let pill_w = 186.0f32;
        let pill_h = 42.0f32;
        let pill_rect = Rect::from_center_size(screen_rect.center(), vec2(pill_w, pill_h));

        painter.rect_filled(
            pill_rect,
            Rounding::same(21.0),
            Color32::from_rgb(28, 28, 30),
        );
        painter.rect_stroke(
            pill_rect,
            Rounding::same(21.0),
            Stroke::new(1.0, Color32::from_rgba_unmultiplied(255, 255, 255, 20)),
        );

        // 6. Left Cancel Button (Vector ✕ in Gray Circle)
        let left_btn_center = Pos2::new(pill_rect.min.x + 21.0, pill_rect.center().y);
        let left_btn_radius = 15.0;
        let left_btn_rect = Rect::from_center_size(left_btn_center, vec2(30.0, 30.0));

        let left_hovered = ctx.input(|i| i.pointer.hover_pos().map_or(false, |p| left_btn_rect.contains(p)));
        let left_bg = if left_hovered {
            Color32::from_rgb(85, 85, 90)
        } else {
            Color32::from_rgb(68, 68, 72)
        };

        painter.circle_filled(left_btn_center, left_btn_radius, left_bg);

        let x_size = 4.0;
        let x_color = Color32::from_rgb(240, 240, 245);
        let x_stroke = Stroke::new(1.8, x_color);
        painter.line_segment(
            [
                Pos2::new(left_btn_center.x - x_size, left_btn_center.y - x_size),
                Pos2::new(left_btn_center.x + x_size, left_btn_center.y + x_size),
            ],
            x_stroke,
        );
        painter.line_segment(
            [
                Pos2::new(left_btn_center.x - x_size, left_btn_center.y + x_size),
                Pos2::new(left_btn_center.x + x_size, left_btn_center.y - x_size),
            ],
            x_stroke,
        );

        if ctx.input(|i| i.pointer.button_clicked(egui::PointerButton::Primary) && left_hovered) {
            ctx.send_viewport_cmd(egui::ViewportCommand::Close);
        }

        // 7. Right Done / Submit Button (Vector ✓ in Pure White Circle)
        let right_btn_center = Pos2::new(pill_rect.max.x - 21.0, pill_rect.center().y);
        let right_btn_radius = 15.0;
        let right_btn_rect = Rect::from_center_size(right_btn_center, vec2(30.0, 30.0));

        let right_hovered = ctx.input(|i| i.pointer.hover_pos().map_or(false, |p| right_btn_rect.contains(p)));
        let right_bg = if right_hovered {
            Color32::from_rgb(235, 235, 240)
        } else {
            Color32::WHITE
        };

        painter.circle_filled(right_btn_center, right_btn_radius, right_bg);

        let check_color = Color32::from_rgb(24, 24, 26);
        let check_stroke = Stroke::new(2.2, check_color);
        let p1 = Pos2::new(right_btn_center.x - 4.5, right_btn_center.y + 0.5);
        let p2 = Pos2::new(right_btn_center.x - 1.2, right_btn_center.y + 4.2);
        let p3 = Pos2::new(right_btn_center.x + 5.0, right_btn_center.y - 3.5);
        painter.line_segment([p1, p2], check_stroke);
        painter.line_segment([p2, p3], check_stroke);

        if ctx.input(|i| i.pointer.button_clicked(egui::PointerButton::Primary) && right_hovered) {
            if self.state == DictationState::Listening {
                self.stop_and_transcribe();
            }
        }

        // 8. Center Audio Equalizer Soundwave Bars
        let center_x = pill_rect.center().x;
        let center_y = pill_rect.center().y;

        match &self.state {
            DictationState::Listening => {
                let num_bars = 12;
                let bar_spacing = 6.0f32;
                let total_wave_w = (num_bars as f32 - 1.0) * bar_spacing;
                let start_x = center_x - (total_wave_w / 2.0);

                let elapsed = self.start_time.elapsed().as_secs_f32();

                for idx in 0..num_bars {
                    let bx = start_x + (idx as f32 * bar_spacing);

                    let dist_from_mid = ((idx as f32 - (num_bars as f32 / 2.0)).abs() / (num_bars as f32 / 2.0)).clamp(0.0, 1.0);
                    let shape_factor = 1.0 - (dist_from_mid * 0.45);

                    let hist_idx = (idx % self.level_history.len()) as usize;
                    let raw_level = self.level_history[hist_idx];

                    let idle_wave = (elapsed * 5.0 + idx as f32 * 0.7).sin() * 0.2 + 0.3;
                    let combined_level = (raw_level * 3.5 + idle_wave * 0.2).clamp(0.05, 1.0);

                    let min_h = 3.5f32;
                    let max_h = 24.0f32;
                    let bar_h = (min_h + (max_h - min_h) * combined_level * shape_factor).clamp(min_h, max_h);

                    let bar_top = center_y - (bar_h / 2.0);
                    let bar_bot = center_y + (bar_h / 2.0);

                    painter.line_segment(
                        [Pos2::new(bx, bar_top), Pos2::new(bx, bar_bot)],
                        Stroke::new(2.4, Color32::from_rgb(245, 245, 250)),
                    );
                }
            }
            DictationState::Transcribing => {
                let elapsed = self.start_time.elapsed().as_secs_f32();
                let num_dots = 3;
                let dot_spacing = 10.0f32;
                let start_x = center_x - (((num_dots - 1) as f32 * dot_spacing) / 2.0);

                for idx in 0..num_dots {
                    let dx = start_x + (idx as f32 * dot_spacing);
                    let phase = elapsed * 6.0 - (idx as f32 * 1.2);
                    let dy = center_y + phase.sin() * 3.0;

                    painter.circle_filled(
                        Pos2::new(dx, dy),
                        2.5,
                        Color32::from_rgb(240, 240, 250),
                    );
                }
            }
            DictationState::Done(_) => {
                painter.text(
                    Pos2::new(center_x, center_y),
                    Align2::CENTER_CENTER,
                    "Pasted",
                    FontId::proportional(12.0),
                    Color32::from_rgb(140, 235, 170),
                );
            }
            DictationState::Error(err) => {
                let display_err = if err.to_lowercase().contains("no voice stt") || err.to_lowercase().contains("key") {
                    "No STT Key"
                } else if err.to_lowercase().contains("reach") || err.to_lowercase().contains("engine") {
                    "Engine Offline"
                } else {
                    "STT Error"
                };
                painter.text(
                    Pos2::new(center_x, center_y),
                    Align2::CENTER_CENTER,
                    display_err,
                    FontId::proportional(11.5),
                    Color32::from_rgb(255, 130, 130),
                );
            }
        }
    }
}
