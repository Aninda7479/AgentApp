use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::{Arc, RwLock};
use anyhow::{anyhow, Result};
use futures_util::StreamExt;
use tracing::{error, info};

use crate::video_workspace::types::{VideoModelFamily, VideoModality, VideoModelInfo};

#[derive(Debug, Clone)]
pub struct DownloadState {
    pub progress: f32,
    pub is_downloading: bool,
    pub error: Option<String>,
}

#[derive(Clone)]
pub struct VideoModelRegistry {
    models_dir: PathBuf,
    download_states: Arc<RwLock<HashMap<String, DownloadState>>>,
}

impl VideoModelRegistry {
    pub fn new() -> Self {
        let base = crate::storage::settings::get_superagent_dir();
        let models_dir = base.join("models").join("videos");
        if !models_dir.exists() {
            let _ = fs::create_dir_all(&models_dir);
        }

        Self {
            models_dir,
            download_states: Arc::new(RwLock::new(HashMap::new())),
        }
    }

    pub fn with_dir(models_dir: PathBuf) -> Self {
        if !models_dir.exists() {
            let _ = fs::create_dir_all(&models_dir);
        }

        Self {
            models_dir,
            download_states: Arc::new(RwLock::new(HashMap::new())),
        }
    }

    pub fn models_dir(&self) -> &Path {
        &self.models_dir
    }

    /// Curated catalog of standard video generation models
    pub fn curated_catalog(&self) -> Vec<VideoModelInfo> {
        vec![
            // ── AnimateDiff Models (SD 1.5 Temporal Motion) ────────────────
            VideoModelInfo {
                id: "animatediff-v2-sd15".to_string(),
                name: "AnimateDiff v2 (Fast Local 16-Frame Neural Video)".to_string(),
                family: VideoModelFamily::AnimateDiff,
                modality: VideoModality::TextToVideo,
                quantization: "FP16".to_string(),
                download_url: "https://huggingface.co/guoyww/animatediff/resolve/main/mm_sd_v15_v2.ckpt".to_string(),
                filename: "mm_sd_v15_v2.ckpt".to_string(),
                size_bytes: 1_817_000_000,
                vram_required_mb: 4096,
                default_frames: 16,
                default_fps: 8,
                default_steps: 20,
                default_cfg: 7.0,
                is_downloaded: false,
                local_path: None,
                download_progress: None,
                is_downloading: false,
                error: None,
            },
            // ── Wan 2.1 Models (Alibaba) ────────────────────────────────────
            VideoModelInfo {
                id: "wan2.1-t2v-1.3b".to_string(),
                name: "Wan 2.1 T2V 1.3B (Fast / Lightweight)".to_string(),

                family: VideoModelFamily::Wan2_1,
                modality: VideoModality::TextToVideo,
                quantization: "Q4_0".to_string(),
                download_url: "https://huggingface.co/Comfy-Org/Wan_2.1_ComfyUI_repackaged/resolve/main/split_files/diffusion_models/wan2.1_t2v_1.3B_bf16.safetensors".to_string(),
                filename: "wan2.1_t2v_1.3b_q4.gguf".to_string(),
                size_bytes: 2_850_000_000,
                vram_required_mb: 6144,
                default_frames: 81,
                default_fps: 16,
                default_steps: 30,
                default_cfg: 6.0,
                is_downloaded: false,
                local_path: None,
                download_progress: None,
                is_downloading: false,
                error: None,
            },
            VideoModelInfo {
                id: "wan2.1-i2v-14b".to_string(),
                name: "Wan 2.1 I2V 14B (SOTA Image-to-Video)".to_string(),
                family: VideoModelFamily::Wan2_1,
                modality: VideoModality::ImageToVideo,
                quantization: "Q4_K".to_string(),
                download_url: "https://huggingface.co/Comfy-Org/Wan_2.1_ComfyUI_repackaged/resolve/main/split_files/diffusion_models/wan2.1_i2v_720p_14B_bf16.safetensors".to_string(),
                filename: "wan2.1_i2v_14b_q4k.gguf".to_string(),
                size_bytes: 8_900_000_000,
                vram_required_mb: 12288,
                default_frames: 81,
                default_fps: 16,
                default_steps: 30,
                default_cfg: 5.0,
                is_downloaded: false,
                local_path: None,
                download_progress: None,
                is_downloading: false,
                error: None,
            },
            // ── LTX-Video (Lightricks) ──────────────────────────────────────
            VideoModelInfo {
                id: "ltx-video-0.9".to_string(),
                name: "LTX-Video 0.9.1 (Real-time 24 FPS Transformer)".to_string(),
                family: VideoModelFamily::LtxVideo,
                modality: VideoModality::Both,
                quantization: "Q4_0".to_string(),
                download_url: "https://huggingface.co/Lightricks/LTX-Video/resolve/main/ltx-video-2b-v0.9.safetensors".to_string(),
                filename: "ltx-video-0.9.1-q4.gguf".to_string(),
                size_bytes: 4_600_000_000,
                vram_required_mb: 8192,
                default_frames: 97,
                default_fps: 24,
                default_steps: 25,
                default_cfg: 3.5,
                is_downloaded: false,
                local_path: None,
                download_progress: None,
                is_downloading: false,
                error: None,
            },
            // ── CogVideoX Models (THUDM) ────────────────────────────────────
            VideoModelInfo {
                id: "cogvideox-2b".to_string(),
                name: "CogVideoX 2B (Efficient Text-to-Video)".to_string(),
                family: VideoModelFamily::CogVideoX,
                modality: VideoModality::TextToVideo,
                quantization: "Q4_0".to_string(),
                download_url: "https://huggingface.co/THUDM/CogVideoX-2b/resolve/main/transformer/diffusion_pytorch_model.safetensors".to_string(),
                filename: "cogvideox-2b-q4.gguf".to_string(),
                size_bytes: 3_200_000_000,
                vram_required_mb: 6144,
                default_frames: 49,
                default_fps: 8,
                default_steps: 40,
                default_cfg: 6.0,
                is_downloaded: false,
                local_path: None,
                download_progress: None,
                is_downloading: false,
                error: None,
            },
            // ── Stable Video Diffusion ─────────────────────────────────────
            VideoModelInfo {
                id: "svd-xt-1.1".to_string(),
                name: "Stable Video Diffusion XT 1.1 (25 Frames I2V)".to_string(),
                family: VideoModelFamily::StableVideoDiffusion,
                modality: VideoModality::ImageToVideo,
                quantization: "FP8".to_string(),
                download_url: "https://huggingface.co/stabilityai/stable-video-diffusion-img2vid-xt-1-1/resolve/main/svd_xt_1_1.safetensors".to_string(),
                filename: "svd_xt_1_1_fp8.safetensors".to_string(),
                size_bytes: 4_950_000_000,
                vram_required_mb: 8192,
                default_frames: 25,
                default_fps: 14,
                default_steps: 25,
                default_cfg: 3.0,
                is_downloaded: false,
                local_path: None,
                download_progress: None,
                is_downloading: false,
                error: None,
            },
            // ── HunyuanVideo (Tencent) ──────────────────────────────────────
            VideoModelInfo {
                id: "hunyuan-video".to_string(),
                name: "HunyuanVideo 13B (Cinema-Quality DiT)".to_string(),
                family: VideoModelFamily::HunyuanVideo,
                modality: VideoModality::TextToVideo,
                quantization: "Q4_0".to_string(),
                download_url: "https://huggingface.co/tencent/HunyuanVideo/resolve/main/hunyuan-video-t2v-720p-q4.gguf".to_string(),
                filename: "hunyuan-video-q4.gguf".to_string(),
                size_bytes: 11_800_000_000,
                vram_required_mb: 16384,
                default_frames: 73,
                default_fps: 24,
                default_steps: 30,
                default_cfg: 6.0,
                is_downloaded: false,
                local_path: None,
                download_progress: None,
                is_downloading: false,
                error: None,
            },
        ]
    }

    pub fn list_models(&self) -> Vec<VideoModelInfo> {
        let mut catalog = self.curated_catalog();
        let states = self.download_states.read().unwrap();

        for model in &mut catalog {
            let path = self.models_dir.join(&model.filename);
            model.is_downloaded = path.exists();
            if model.is_downloaded {
                model.local_path = Some(path.to_string_lossy().to_string());
            }

            if let Some(state) = states.get(&model.id) {
                model.is_downloading = state.is_downloading;
                model.download_progress = Some(state.progress);
                model.error = state.error.clone();
            }
        }

        catalog
    }

    pub fn get_model_path(&self, model_id: &str) -> Option<PathBuf> {
        let catalog = self.curated_catalog();
        if let Some(model) = catalog.iter().find(|m| m.id == model_id) {
            let path = self.models_dir.join(&model.filename);
            if path.exists() {
                return Some(path);
            }
        }
        None
    }

    pub async fn pull_model(&self, model_id: &str) -> Result<()> {
        let catalog = self.curated_catalog();
        let model = catalog
            .iter()
            .find(|m| m.id == model_id)
            .ok_or_else(|| anyhow!("Model '{}' not found in catalog", model_id))?
            .clone();

        let dest_path = self.models_dir.join(&model.filename);
        if dest_path.exists() {
            return Ok(());
        }

        // Set state to downloading
        {
            let mut states = self.download_states.write().unwrap();
            states.insert(
                model.id.clone(),
                DownloadState {
                    progress: 0.0,
                    is_downloading: true,
                    error: None,
                },
            );
        }

        let states_arc = self.download_states.clone();
        let model_id_clone = model.id.clone();
        let download_url = model.download_url.clone();
        let temp_dest = self.models_dir.join(format!("{}.tmp", model.filename));

        tokio::spawn(async move {
            info!("Starting download for video model {} from {}", model_id_clone, download_url);

            let client = reqwest::Client::builder()
                .user_agent("SuperAgent/0.42.0")
                .redirect(reqwest::redirect::Policy::limited(10))
                .timeout(std::time::Duration::from_secs(7200))
                .build();


            let client = match client {
                Ok(c) => c,
                Err(e) => {
                    let mut states = states_arc.write().unwrap();
                    states.insert(
                        model_id_clone,
                        DownloadState {
                            progress: 0.0,
                            is_downloading: false,
                            error: Some(format!("Failed to build HTTP client: {}", e)),
                        },
                    );
                    return;
                }
            };

            let res = client.get(&download_url).send().await;
            let res = match res {
                Ok(r) if r.status().is_success() => r,
                Ok(r) => {
                    let err = format!("HTTP error: status {}", r.status());
                    error!("{}", err);
                    let mut states = states_arc.write().unwrap();
                    states.insert(
                        model_id_clone,
                        DownloadState {
                            progress: 0.0,
                            is_downloading: false,
                            error: Some(err),
                        },
                    );
                    return;
                }
                Err(e) => {
                    let err = format!("Request failed: {}", e);
                    error!("{}", err);
                    let mut states = states_arc.write().unwrap();
                    states.insert(
                        model_id_clone,
                        DownloadState {
                            progress: 0.0,
                            is_downloading: false,
                            error: Some(err),
                        },
                    );
                    return;
                }
            };

            let total_size = res.content_length().unwrap_or(model.size_bytes);
            let mut stream = res.bytes_stream();
            let mut downloaded: u64 = 0;

            let file = fs::File::create(&temp_dest);
            let mut file = match file {
                Ok(f) => f,
                Err(e) => {
                    let err = format!("Failed to create local file: {}", e);
                    error!("{}", err);
                    let mut states = states_arc.write().unwrap();
                    states.insert(
                        model_id_clone,
                        DownloadState {
                            progress: 0.0,
                            is_downloading: false,
                            error: Some(err),
                        },
                    );
                    return;
                }
            };

            use std::io::Write;
            while let Some(chunk_res) = stream.next().await {
                match chunk_res {
                    Ok(chunk) => {
                        if let Err(e) = file.write_all(&chunk) {
                            let err = format!("Failed to write chunk: {}", e);
                            error!("{}", err);
                            let _ = fs::remove_file(&temp_dest);
                            let mut states = states_arc.write().unwrap();
                            states.insert(
                                model_id_clone,
                                DownloadState {
                                    progress: 0.0,
                                    is_downloading: false,
                                    error: Some(err),
                                },
                            );
                            return;
                        }
                        downloaded += chunk.len() as u64;
                        let progress = if total_size > 0 {
                            (downloaded as f32 / total_size as f32).min(1.0)
                        } else {
                            0.0
                        };

                        let mut states = states_arc.write().unwrap();
                        states.insert(
                            model_id_clone.clone(),
                            DownloadState {
                                progress,
                                is_downloading: true,
                                error: None,
                            },
                        );
                    }
                    Err(e) => {
                        let err = format!("Stream read error: {}", e);
                        error!("{}", err);
                        let _ = fs::remove_file(&temp_dest);
                        let mut states = states_arc.write().unwrap();
                        states.insert(
                            model_id_clone,
                            DownloadState {
                                progress: 0.0,
                                is_downloading: false,
                                error: Some(err),
                            },
                        );
                        return;
                    }
                }
            }

            let _ = file.flush();
            drop(file);

            if let Err(e) = fs::rename(&temp_dest, &dest_path) {
                let err = format!("Failed to rename temp model file: {}", e);
                error!("{}", err);
                let _ = fs::remove_file(&temp_dest);
                let mut states = states_arc.write().unwrap();
                states.insert(
                    model_id_clone,
                    DownloadState {
                        progress: 0.0,
                        is_downloading: false,
                        error: Some(err),
                    },
                );
                return;
            }

            info!("Successfully downloaded video model {}", model_id_clone);
            let mut states = states_arc.write().unwrap();
            states.insert(
                model_id_clone,
                DownloadState {
                    progress: 1.0,
                    is_downloading: false,
                    error: None,
                },
            );
        });

        Ok(())
    }

    pub fn delete_model(&self, model_id: &str) -> Result<()> {
        let catalog = self.curated_catalog();
        let model = catalog
            .iter()
            .find(|m| m.id == model_id)
            .ok_or_else(|| anyhow!("Model '{}' not found in catalog", model_id))?;

        let path = self.models_dir.join(&model.filename);
        if path.exists() {
            fs::remove_file(&path)?;
        }

        let mut states = self.download_states.write().unwrap();
        states.remove(model_id);

        Ok(())
    }
}
