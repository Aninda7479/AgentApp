use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use std::io::Cursor;
use std::sync::{
    atomic::{AtomicBool, Ordering},
    Arc, Mutex,
};

pub struct AudioRecorder {
    _stream: cpal::Stream,
    is_running: Arc<AtomicBool>,
    samples: Arc<Mutex<Vec<f32>>>,
    peak_level: Arc<Mutex<f32>>,
    source_sample_rate: u32,
    channels: u16,
}

impl AudioRecorder {
    pub fn start() -> Result<Self, String> {
        let host = cpal::default_host();
        let device = host
            .default_input_device()
            .ok_or_else(|| "No default microphone input device found".to_string())?;

        let config = device
            .default_input_config()
            .map_err(|e| format!("Failed to get default input config: {}", e))?;

        let sample_rate = config.sample_rate().0;
        let channels = config.channels();

        let is_running = Arc::new(AtomicBool::new(true));
        let samples = Arc::new(Mutex::new(Vec::<f32>::new()));
        let peak_level = Arc::new(Mutex::new(0.0f32));

        let samples_cb = Arc::clone(&samples);
        let peak_cb = Arc::clone(&peak_level);
        let is_running_cb = Arc::clone(&is_running);

        let err_fn = |err| eprintln!("Audio input stream error: {}", err);

        let stream = match config.sample_format() {
            cpal::SampleFormat::F32 => device.build_input_stream(
                &config.into(),
                move |data: &[f32], _: &cpal::InputCallbackInfo| {
                    if !is_running_cb.load(Ordering::Relaxed) {
                        return;
                    }
                    let mut max_abs: f32 = 0.0;
                    for &s in data {
                        let abs = s.abs();
                        if abs > max_abs {
                            max_abs = abs;
                        }
                    }
                    if let Ok(mut p) = peak_cb.try_lock() {
                        *p = (*p * 0.7) + (max_abs * 0.3);
                    }
                    if let Ok(mut buf) = samples_cb.lock() {
                        buf.extend_from_slice(data);
                    }
                },
                err_fn,
                None,
            ),
            cpal::SampleFormat::I16 => device.build_input_stream(
                &config.into(),
                move |data: &[i16], _: &cpal::InputCallbackInfo| {
                    if !is_running_cb.load(Ordering::Relaxed) {
                        return;
                    }
                    let mut max_abs: f32 = 0.0;
                    for &s in data {
                        let f = (s as f32) / (i16::MAX as f32);
                        let abs = f.abs();
                        if abs > max_abs {
                            max_abs = abs;
                        }
                    }
                    if let Ok(mut p) = peak_cb.try_lock() {
                        *p = (*p * 0.7) + (max_abs * 0.3);
                    }
                    if let Ok(mut buf) = samples_cb.lock() {
                        for &s in data {
                            buf.push((s as f32) / (i16::MAX as f32));
                        }
                    }
                },
                err_fn,
                None,
            ),
            cpal::SampleFormat::U16 => device.build_input_stream(
                &config.into(),
                move |data: &[u16], _: &cpal::InputCallbackInfo| {
                    if !is_running_cb.load(Ordering::Relaxed) {
                        return;
                    }
                    let mut max_abs: f32 = 0.0;
                    for &s in data {
                        let f = ((s as f32) - 32768.0) / 32768.0;
                        let abs = f.abs();
                        if abs > max_abs {
                            max_abs = abs;
                        }
                    }
                    if let Ok(mut p) = peak_cb.try_lock() {
                        *p = (*p * 0.7) + (max_abs * 0.3);
                    }
                    if let Ok(mut buf) = samples_cb.lock() {
                        for &s in data {
                            buf.push(((s as f32) - 32768.0) / 32768.0);
                        }
                    }
                },
                err_fn,
                None,
            ),
            _ => return Err("Unsupported audio sample format".to_string()),
        }
        .map_err(|e| format!("Failed to build audio input stream: {}", e))?;

        stream
            .play()
            .map_err(|e| format!("Failed to start audio stream: {}", e))?;

        Ok(Self {
            _stream: stream,
            is_running,
            samples,
            peak_level,
            source_sample_rate: sample_rate,
            channels,
        })
    }

    pub fn get_current_level(&self) -> f32 {
        self.peak_level.lock().map(|p| *p).unwrap_or(0.0).clamp(0.0, 1.0)
    }

    pub fn stop(self) -> Result<Vec<u8>, String> {
        self.is_running.store(false, Ordering::Relaxed);
        let raw_samples = self.samples.lock().map_err(|e| e.to_string())?.clone();

        if raw_samples.is_empty() {
            return Err("No audio captured from microphone".to_string());
        }

        // 1. Downmix channels to Mono
        let channels = self.channels as usize;
        let mono_samples: Vec<f32> = if channels > 1 {
            raw_samples
                .chunks(channels)
                .map(|frame| frame.iter().sum::<f32>() / (channels as f32))
                .collect()
        } else {
            raw_samples
        };

        // 2. Resample to 16,000 Hz (Optimal for Whisper & STT)
        let target_rate = 16000u32;
        let resampled: Vec<i16> = if self.source_sample_rate == target_rate {
            mono_samples
                .iter()
                .map(|&s| (s.clamp(-1.0, 1.0) * (i16::MAX as f32)) as i16)
                .collect()
        } else {
            let ratio = target_rate as f64 / self.source_sample_rate as f64;
            let new_len = (mono_samples.len() as f64 * ratio) as usize;
            let mut out = Vec::with_capacity(new_len);

            for i in 0..new_len {
                let src_idx = i as f64 / ratio;
                let idx0 = src_idx.floor() as usize;
                let idx1 = (idx0 + 1).min(mono_samples.len().saturating_sub(1));
                let frac = (src_idx - idx0 as f64) as f32;

                let s0 = mono_samples.get(idx0).copied().unwrap_or(0.0);
                let s1 = mono_samples.get(idx1).copied().unwrap_or(0.0);
                let sample = (s0 * (1.0 - frac)) + (s1 * frac);
                out.push((sample.clamp(-1.0, 1.0) * (i16::MAX as f32)) as i16);
            }
            out
        };

        // 3. Encode to WAV container (16kHz, 16-bit, 1 channel)
        let spec = hound::WavSpec {
            channels: 1,
            sample_rate: 16000,
            bits_per_sample: 16,
            sample_format: hound::SampleFormat::Int,
        };

        let mut wav_bytes = Vec::new();
        let mut cursor = Cursor::new(&mut wav_bytes);
        let mut writer = hound::WavWriter::new(&mut cursor, spec)
            .map_err(|e| format!("Failed to create WAV writer: {}", e))?;

        for sample in resampled {
            writer
                .write_sample(sample)
                .map_err(|e| format!("Failed to write WAV sample: {}", e))?;
        }

        writer
            .finalize()
            .map_err(|e| format!("Failed to finalize WAV audio: {}", e))?;

        Ok(wav_bytes)
    }
}
