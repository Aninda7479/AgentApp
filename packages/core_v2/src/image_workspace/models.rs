use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::{Arc, RwLock};
use anyhow::{anyhow, Result};
use futures_util::StreamExt;
use tracing::{error, info};

use crate::image_workspace::types::{ImageModelInfo, ModelFamily};

#[derive(Debug, Clone)]
pub struct DownloadState {
    pub progress: f32,
    pub is_downloading: bool,
    pub error: Option<String>,
}

#[derive(Clone)]
pub struct ModelRegistry {
    models_dir: PathBuf,
    download_states: Arc<RwLock<HashMap<String, DownloadState>>>,
}

impl ModelRegistry {
    pub fn new() -> Self {
        let base = crate::storage::settings::get_superagent_dir();
        let models_dir = base.join("models").join("images");
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

    /// Curated catalog of standard diffusion / flow models
    pub fn curated_catalog(&self) -> Vec<ImageModelInfo> {
        vec![
            // ── FLUX.1 Models (Flow-Matching DiT) ───────────────────────────
            ImageModelInfo {
                id: "flux-schnell".to_string(),
                name: "FLUX.1 Schnell".to_string(),
                family: ModelFamily::Flux,
                quantization: "Q4_0".to_string(),
                download_url: "https://huggingface.co/city96/FLUX.1-schnell-gguf/resolve/main/flux1-schnell-Q4_0.gguf".to_string(),
                filename: "flux1-schnell-Q4_0.gguf".to_string(),
                size_bytes: 6_770_707_360,
                vram_required_mb: 8192,
                default_steps: 4,
                default_cfg: 1.0,
                is_downloaded: false,
                local_path: None,
                download_progress: None,
                is_downloading: false,
                error: None,
            },
            ImageModelInfo {
                id: "flux-schnell-q8".to_string(),
                name: "FLUX.1 Schnell (Q8_0 High-Precision)".to_string(),
                family: ModelFamily::Flux,
                quantization: "Q8_0".to_string(),
                download_url: "https://huggingface.co/city96/FLUX.1-schnell-gguf/resolve/main/flux1-schnell-Q8_0.gguf".to_string(),
                filename: "flux1-schnell-Q8_0.gguf".to_string(),
                size_bytes: 12_500_000_000,
                vram_required_mb: 12288,
                default_steps: 4,
                default_cfg: 1.0,
                is_downloaded: false,
                local_path: None,
                download_progress: None,
                is_downloading: false,
                error: None,
            },
            ImageModelInfo {
                id: "flux-dev".to_string(),
                name: "FLUX.1 Dev (Guidance Distilled)".to_string(),
                family: ModelFamily::Flux,
                quantization: "Q4_0".to_string(),
                download_url: "https://huggingface.co/city96/FLUX.1-dev-gguf/resolve/main/flux1-dev-Q4_0.gguf".to_string(),
                filename: "flux1-dev-Q4_0.gguf".to_string(),
                size_bytes: 6_791_167_136,
                vram_required_mb: 8192,
                default_steps: 20,
                default_cfg: 3.5,
                is_downloaded: false,
                local_path: None,
                download_progress: None,
                is_downloading: false,
                error: None,
            },

            // ── SDXL Models (1024x1024 High-Res) ────────────────────────────
            ImageModelInfo {
                id: "sdxl".to_string(),
                name: "Stable Diffusion XL (Base Q4_K)".to_string(),
                family: ModelFamily::Sdxl,
                quantization: "Q4_K".to_string(),
                download_url: "https://huggingface.co/kostakoff/stable-diffusion-xl-base-1.0-GGUF/resolve/main/sd_xl_base_1.0_0_Q4_K.gguf".to_string(),
                filename: "sd_xl_base_1.0_0_Q4_K.gguf".to_string(),
                size_bytes: 2_797_752_960,
                vram_required_mb: 4096,
                default_steps: 25,
                default_cfg: 7.0,
                is_downloaded: false,
                local_path: None,
                download_progress: None,
                is_downloading: false,
                error: None,
            },
            ImageModelInfo {
                id: "sdxl-base-q40".to_string(),
                name: "Stable Diffusion XL (Base Q4_0)".to_string(),
                family: ModelFamily::Sdxl,
                quantization: "Q4_0".to_string(),
                download_url: "https://huggingface.co/kostakoff/stable-diffusion-xl-base-1.0-GGUF/resolve/main/sd_xl_base_1.0_0_Q4_0.gguf".to_string(),
                filename: "sd_xl_base_1.0_0_Q4_0.gguf".to_string(),
                size_bytes: 2_240_000_000,
                vram_required_mb: 4096,
                default_steps: 25,
                default_cfg: 7.0,
                is_downloaded: false,
                local_path: None,
                download_progress: None,
                is_downloading: false,
                error: None,
            },
            ImageModelInfo {
                id: "sdxl-base-q80".to_string(),
                name: "Stable Diffusion XL (Base Q8_0 High-Fidelity)".to_string(),
                family: ModelFamily::Sdxl,
                quantization: "Q8_0".to_string(),
                download_url: "https://huggingface.co/kostakoff/stable-diffusion-xl-base-1.0-GGUF/resolve/main/sd_xl_base_1.0_0_Q8_0.gguf".to_string(),
                filename: "sd_xl_base_1.0_0_Q8_0.gguf".to_string(),
                size_bytes: 6_937_943_840,
                vram_required_mb: 8192,
                default_steps: 25,
                default_cfg: 7.0,
                is_downloaded: false,
                local_path: None,
                download_progress: None,
                is_downloading: false,
                error: None,
            },
            ImageModelInfo {
                id: "sdxl-turbo".to_string(),
                name: "SDXL Turbo (1-Step Real-Time)".to_string(),
                family: ModelFamily::Sdxl,
                quantization: "FP16".to_string(),
                download_url: "https://huggingface.co/stabilityai/sdxl-turbo/resolve/main/sd_xl_turbo_1.0_fp16.safetensors".to_string(),
                filename: "sd_xl_turbo_1.0_fp16.safetensors".to_string(),
                size_bytes: 6_938_081_905,
                vram_required_mb: 6144,
                default_steps: 1,
                default_cfg: 1.0,
                is_downloaded: false,
                local_path: None,
                download_progress: None,
                is_downloading: false,
                error: None,
            },
            ImageModelInfo {
                id: "juggernaut-xl".to_string(),
                name: "Juggernaut XL v9 (Photorealism & Cinematic)".to_string(),
                family: ModelFamily::Sdxl,
                quantization: "FP16".to_string(),
                download_url: "https://huggingface.co/RunDiffusion/Juggernaut-XL-v9/resolve/main/Juggernaut-XL_v9_RunDiffusionPhoto_v2.safetensors".to_string(),
                filename: "Juggernaut-XL_v9_RunDiffusionPhoto_v2.safetensors".to_string(),
                size_bytes: 7_105_348_188,
                vram_required_mb: 6144,
                default_steps: 30,
                default_cfg: 6.0,
                is_downloaded: false,
                local_path: None,
                download_progress: None,
                is_downloading: false,
                error: None,
            },

            // ── Stable Diffusion 3.5 Models ─────────────────────────────────
            ImageModelInfo {
                id: "sd35-medium".to_string(),
                name: "Stable Diffusion 3.5 Medium (Q4_K_M)".to_string(),
                family: ModelFamily::Sd35,
                quantization: "Q4_K_M".to_string(),
                download_url: "https://huggingface.co/city96/stable-diffusion-3.5-medium-gguf/resolve/main/sd3.5_medium-Q4_K_M.gguf".to_string(),
                filename: "sd3.5_medium-Q4_K_M.gguf".to_string(),
                size_bytes: 1_787_064_768,
                vram_required_mb: 4096,
                default_steps: 28,
                default_cfg: 4.5,
                is_downloaded: false,
                local_path: None,
                download_progress: None,
                is_downloading: false,
                error: None,
            },
            ImageModelInfo {
                id: "sd35-medium-q40".to_string(),
                name: "Stable Diffusion 3.5 Medium (Q4_0)".to_string(),
                family: ModelFamily::Sd35,
                quantization: "Q4_0".to_string(),
                download_url: "https://huggingface.co/city96/stable-diffusion-3.5-medium-gguf/resolve/main/sd3.5_medium-Q4_0.gguf".to_string(),
                filename: "sd3.5_medium-Q4_0.gguf".to_string(),
                size_bytes: 1_520_000_000,
                vram_required_mb: 4096,
                default_steps: 28,
                default_cfg: 4.5,
                is_downloaded: false,
                local_path: None,
                download_progress: None,
                is_downloading: false,
                error: None,
            },
            ImageModelInfo {
                id: "sd35-medium-q80".to_string(),
                name: "Stable Diffusion 3.5 Medium (Q8_0 High-Precision)".to_string(),
                family: ModelFamily::Sd35,
                quantization: "Q8_0".to_string(),
                download_url: "https://huggingface.co/city96/stable-diffusion-3.5-medium-gguf/resolve/main/sd3.5_medium-Q8_0.gguf".to_string(),
                filename: "sd3.5_medium-Q8_0.gguf".to_string(),
                size_bytes: 2_820_000_000,
                vram_required_mb: 6144,
                default_steps: 28,
                default_cfg: 4.5,
                is_downloaded: false,
                local_path: None,
                download_progress: None,
                is_downloading: false,
                error: None,
            },

            // ── Stable Diffusion 1.5 & 2.1 Models (Lightweight / Low VRAM) ──
            ImageModelInfo {
                id: "sd15".to_string(),
                name: "Stable Diffusion 1.5 (Q4_0 Lightweight)".to_string(),
                family: ModelFamily::Sd15,
                quantization: "Q4_0".to_string(),
                download_url: "https://huggingface.co/second-state/stable-diffusion-v1-5-GGUF/resolve/main/stable-diffusion-v1-5-pruned-emaonly-Q4_0.gguf".to_string(),
                filename: "stable-diffusion-v1-5-pruned-emaonly-Q4_0.gguf".to_string(),
                size_bytes: 1_566_768_416,
                vram_required_mb: 2048,
                default_steps: 20,
                default_cfg: 7.0,
                is_downloaded: false,
                local_path: None,
                download_progress: None,
                is_downloading: false,
                error: None,
            },
            ImageModelInfo {
                id: "sd15-q80".to_string(),
                name: "Stable Diffusion 1.5 (Q8_0)".to_string(),
                family: ModelFamily::Sd15,
                quantization: "Q8_0".to_string(),
                download_url: "https://huggingface.co/second-state/stable-diffusion-v1-5-GGUF/resolve/main/stable-diffusion-v1-5-pruned-emaonly-Q8_0.gguf".to_string(),
                filename: "stable-diffusion-v1-5-pruned-emaonly-Q8_0.gguf".to_string(),
                size_bytes: 1_760_000_000,
                vram_required_mb: 3072,
                default_steps: 20,
                default_cfg: 7.0,
                is_downloaded: false,
                local_path: None,
                download_progress: None,
                is_downloading: false,
                error: None,
            },
            ImageModelInfo {
                id: "sd15-safetensors".to_string(),
                name: "Stable Diffusion 1.5 Pruned (FP16 Standard)".to_string(),
                family: ModelFamily::Sd15,
                quantization: "FP16".to_string(),
                download_url: "https://huggingface.co/stable-diffusion-v1-5/stable-diffusion-v1-5/resolve/main/v1-5-pruned-emaonly.safetensors".to_string(),
                filename: "v1-5-pruned-emaonly.safetensors".to_string(),
                size_bytes: 4_265_146_304,
                vram_required_mb: 4096,
                default_steps: 20,
                default_cfg: 7.0,
                is_downloaded: false,
                local_path: None,
                download_progress: None,
                is_downloading: false,
                error: None,
            },
            ImageModelInfo {
                id: "sd21-768-q40".to_string(),
                name: "Stable Diffusion 2.1 (768px Q4_0)".to_string(),
                family: ModelFamily::Sd15,
                quantization: "Q4_0".to_string(),
                download_url: "https://huggingface.co/second-state/stable-diffusion-2-1-GGUF/resolve/main/v2-1_768-nonema-pruned-Q4_0.gguf".to_string(),
                filename: "v2-1_768-nonema-pruned-Q4_0.gguf".to_string(),
                size_bytes: 1_699_714_336,
                vram_required_mb: 3072,
                default_steps: 25,
                default_cfg: 7.5,
                is_downloaded: false,
                local_path: None,
                download_progress: None,
                is_downloading: false,
                error: None,
            },
        ]
    }

    /// List all catalog models with their local download status
    pub fn list_models(&self) -> Vec<ImageModelInfo> {
        let mut list = self.curated_catalog();
        let states = self.download_states.read().unwrap();

        for model in list.iter_mut() {
            let path = self.models_dir.join(&model.filename);
            if path.exists() && path.is_file() {
                model.is_downloaded = true;
                model.local_path = Some(path.to_string_lossy().to_string());
                if let Ok(meta) = path.metadata() {
                    model.size_bytes = meta.len();
                }
            }

            if let Some(state) = states.get(&model.id) {
                model.is_downloading = state.is_downloading;
                model.download_progress = Some(state.progress);
                model.error = state.error.clone();
            }
        }

        // Also detect custom GGUF and safetensors models in directory
        if let Ok(entries) = fs::read_dir(&self.models_dir) {
            for entry in entries.flatten() {
                let path = entry.path();
                if path.is_file() {
                    let ext = path.extension().and_then(|e| e.to_str()).unwrap_or("");
                    if ext == "gguf" || ext == "safetensors" || ext == "ckpt" {
                        let fname = path.file_name().unwrap_or_default().to_string_lossy().to_string();
                        if !list.iter().any(|m| m.filename == fname) {
                            let len = path.metadata().map(|m| m.len()).unwrap_or(0);
                            let stem = path.file_stem().unwrap_or_default().to_string_lossy().to_string();
                            list.push(ImageModelInfo {
                                id: format!("custom-{}", stem),
                                name: stem,
                                family: ModelFamily::Custom,
                                quantization: if ext == "gguf" { "GGUF" } else { "Safetensors" }.to_string(),
                                download_url: String::new(),
                                filename: fname,
                                size_bytes: len,
                                vram_required_mb: 4096,
                                default_steps: 20,
                                default_cfg: 7.0,
                                is_downloaded: true,
                                local_path: Some(path.to_string_lossy().to_string()),
                                download_progress: None,
                                is_downloading: false,
                                error: None,
                            });
                        }
                    }
                }
            }
        }

        list
    }

    pub fn get_model_path(&self, id: &str) -> Option<PathBuf> {
        let models = self.list_models();
        models.iter().find(|m| m.id == id && m.is_downloaded).map(|m| self.models_dir.join(&m.filename))
    }

    /// Pull / download a model by ID
    pub async fn pull_model(&self, model_id: &str) -> Result<()> {
        let catalog = self.curated_catalog();
        let target = catalog.into_iter().find(|m| m.id == model_id)
            .ok_or_else(|| anyhow!("Model not found in catalog: {}", model_id))?;

        let dest_path = self.models_dir.join(&target.filename);
        let temp_path = self.models_dir.join(format!("{}.tmp", target.filename));

        {
            let mut states = self.download_states.write().unwrap();
            states.insert(model_id.to_string(), DownloadState {
                progress: 0.0,
                is_downloading: true,
                error: None,
            });
        }

        let download_states = self.download_states.clone();
        let m_id = model_id.to_string();
        let url = target.download_url.clone();
        let models_dir = self.models_dir.clone();

        tokio::spawn(async move {
            info!("Starting download for image model '{}' from {}", m_id, url);
            let update_status = |prog: f32, is_dl: bool, err: Option<String>| {
                if let Ok(mut states) = download_states.write() {
                    states.insert(m_id.clone(), DownloadState { progress: prog, is_downloading: is_dl, error: err });
                }
            };

            // Ensure destination directory exists
            if let Err(e) = tokio::fs::create_dir_all(&models_dir).await {
                let err = format!("Failed to create directory: {}", e);
                error!("{}", err);
                update_status(0.0, false, Some(err));
                return;
            }

            let client = match reqwest::Client::builder()
                .user_agent("SuperAgent/0.34.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko)")
                .redirect(reqwest::redirect::Policy::limited(10))
                .build() {
                    Ok(c) => c,
                    Err(e) => {
                        let err = format!("Failed to build HTTP client: {}", e);
                        error!("{}", err);
                        update_status(0.0, false, Some(err));
                        return;
                    }
                };

            let res = match client.get(&url).send().await {
                Ok(r) if r.status().is_success() => r,
                Ok(r) => {
                    let err = format!("Download failed with HTTP {}", r.status());
                    error!("Model download failed: {}", err);
                    update_status(0.0, false, Some(err));
                    return;
                }
                Err(e) => {
                    let err = format!("Connection error: {}", e);
                    error!("Model download failed: {}", err);
                    update_status(0.0, false, Some(err));
                    return;
                }
            };

            let total_size = res.content_length().unwrap_or(target.size_bytes);
            let mut downloaded: u64 = 0;
            let mut stream = res.bytes_stream();

            let file_res = tokio::fs::File::create(&temp_path).await;
            let mut file = match file_res {
                Ok(f) => f,
                Err(e) => {
                    let err = format!("Failed to create file: {}", e);
                    error!("{}", err);
                    update_status(0.0, false, Some(err));
                    return;
                }
            };

            use tokio::io::AsyncWriteExt;
            let mut last_progress_report = 0.0;

            while let Some(item) = stream.next().await {
                match item {
                    Ok(chunk) => {
                        if let Err(e) = file.write_all(&chunk).await {
                            let err = format!("Disk write error: {}", e);
                            error!("{}", err);
                            update_status(0.0, false, Some(err));
                            let _ = tokio::fs::remove_file(&temp_path).await;
                            return;
                        }
                        downloaded += chunk.len() as u64;
                        if total_size > 0 {
                            let prog = (downloaded as f32 / total_size as f32).min(1.0);
                            if (prog - last_progress_report).abs() > 0.01 || prog >= 1.0 {
                                last_progress_report = prog;
                                update_status(prog, true, None);
                            }
                        }
                    }
                    Err(e) => {
                        let err = format!("Stream error: {}", e);
                        error!("{}", err);
                        update_status(0.0, false, Some(err));
                        let _ = tokio::fs::remove_file(&temp_path).await;
                        return;
                    }
                }
            }

            let _ = file.flush().await;
            drop(file);

            // Rename temp file to final file
            if let Err(e) = tokio::fs::rename(&temp_path, &dest_path).await {
                let err = format!("Failed to finalize file: {}", e);
                error!("{}", err);
                update_status(0.0, false, Some(err));
                return;
            }

            info!("Successfully downloaded image model '{}' to {}", m_id, dest_path.display());
            update_status(1.0, false, None);
        });

        Ok(())
    }

    /// Delete a downloaded model by ID
    pub fn delete_model(&self, model_id: &str) -> Result<()> {
        let models = self.list_models();
        let target = models.into_iter().find(|m| m.id == model_id)
            .ok_or_else(|| anyhow!("Model not found: {}", model_id))?;

        let path = self.models_dir.join(&target.filename);
        if path.exists() {
            fs::remove_file(&path)?;
            info!("Deleted model file: {}", path.display());
        }

        let temp_path = self.models_dir.join(format!("{}.tmp", target.filename));
        if temp_path.exists() {
            let _ = fs::remove_file(&temp_path);
        }

        let mut states = self.download_states.write().unwrap();
        states.remove(model_id);

        Ok(())
    }
}
