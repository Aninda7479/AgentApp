use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::{Arc, RwLock};

use anyhow::{anyhow, Result};
use futures_util::StreamExt;
use tracing::{error, info};

use crate::image_workspace::types::{ImageModelInfo, ModelFamily};
use crate::storage::settings::get_superagent_dir;

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
        let base = get_superagent_dir();
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

    pub fn get_models_dir(&self) -> &Path {
        &self.models_dir
    }

    /// Curated catalog of standard diffusion / flow models
    pub fn curated_catalog(&self) -> Vec<ImageModelInfo> {
        vec![
            ImageModelInfo {
                id: "flux-schnell".to_string(),
                name: "FLUX.1 Schnell".to_string(),
                family: ModelFamily::Flux,
                quantization: "Q4_0".to_string(),
                download_url: "https://huggingface.co/city96/FLUX.1-schnell-gguf/resolve/main/flux1-schnell-Q4_0.gguf".to_string(),
                filename: "flux1-schnell-Q4_0.gguf".to_string(),
                size_bytes: 7_380_000_000,
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
                id: "flux-dev".to_string(),
                name: "FLUX.1 Dev".to_string(),
                family: ModelFamily::Flux,
                quantization: "Q4_0".to_string(),
                download_url: "https://huggingface.co/city96/FLUX.1-dev-gguf/resolve/main/flux1-dev-Q4_0.gguf".to_string(),
                filename: "flux1-dev-Q4_0.gguf".to_string(),
                size_bytes: 7_380_000_000,
                vram_required_mb: 8192,
                default_steps: 20,
                default_cfg: 3.5,
                is_downloaded: false,
                local_path: None,
                download_progress: None,
                is_downloading: false,
                error: None,
            },
            ImageModelInfo {
                id: "sdxl".to_string(),
                name: "Stable Diffusion XL (Base)".to_string(),
                family: ModelFamily::Sdxl,
                quantization: "Q4_K_S".to_string(),
                download_url: "https://huggingface.co/leejet/stable-diffusion.cpp-models/resolve/main/sd_xl_base_1.0_q4_k_s.gguf".to_string(),
                filename: "sd_xl_base_1.0_q4_k_s.gguf".to_string(),
                size_bytes: 2_790_000_000,
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
                id: "sd35-medium".to_string(),
                name: "Stable Diffusion 3.5 Medium".to_string(),
                family: ModelFamily::Sd35,
                quantization: "Q4_K".to_string(),
                download_url: "https://huggingface.co/city96/stable-diffusion-3.5-medium-gguf/resolve/main/sd3.5_medium-Q4_K.gguf".to_string(),
                filename: "sd3.5_medium-Q4_K.gguf".to_string(),
                size_bytes: 1_930_000_000,
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
                id: "sd15".to_string(),
                name: "Stable Diffusion 1.5".to_string(),
                family: ModelFamily::Sd15,
                quantization: "Q4_0".to_string(),
                download_url: "https://huggingface.co/leejet/stable-diffusion.cpp-models/resolve/main/v1-5-pruned-emaonly-q4_0.gguf".to_string(),
                filename: "v1-5-pruned-emaonly-q4_0.gguf".to_string(),
                size_bytes: 1_280_000_000,
                vram_required_mb: 2048,
                default_steps: 20,
                default_cfg: 7.0,
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

        // Also detect custom GGUF models in directory
        if let Ok(entries) = fs::read_dir(&self.models_dir) {
            for entry in entries.flatten() {
                let path = entry.path();
                if path.is_file() {
                    let ext = path.extension().and_then(|e| e.to_str()).unwrap_or("");
                    if ext == "gguf" || ext == "safetensors" {
                        let fname = path.file_name().unwrap_or_default().to_string_lossy().to_string();
                        if !list.iter().any(|m| m.filename == fname) {
                            let len = path.metadata().map(|m| m.len()).unwrap_or(0);
                            let stem = path.file_stem().unwrap_or_default().to_string_lossy().to_string();
                            list.push(ImageModelInfo {
                                id: format!("custom-{}", stem),
                                name: stem,
                                family: ModelFamily::Custom,
                                quantization: "Custom".to_string(),
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

    /// Pull / download a model by ID asynchronously in background
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

        tokio::spawn(async move {
            info!("Starting download for image model '{}' from {}", m_id, url);
            let update_status = |prog: f32, is_dl: bool, err: Option<String>| {
                if let Ok(mut states) = download_states.write() {
                    states.insert(m_id.clone(), DownloadState { progress: prog, is_downloading: is_dl, error: err });
                }
            };

            let client = reqwest::Client::new();
            let res = match client.get(&url).send().await {
                Ok(r) if r.status().is_success() => r,
                Ok(r) => {
                    let err = format!("HTTP error: {}", r.status());
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
                    update_status(0.0, false, Some(e.to_string()));
                    return;
                }
            };

            use tokio::io::AsyncWriteExt;
            let mut last_progress_report = 0.0;

            while let Some(item) = stream.next().await {
                match item {
                    Ok(chunk) => {
                        if let Err(e) = file.write_all(&chunk).await {
                            update_status(0.0, false, Some(e.to_string()));
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
                        update_status(0.0, false, Some(e.to_string()));
                        let _ = tokio::fs::remove_file(&temp_path).await;
                        return;
                    }
                }
            }

            let _ = file.flush().await;
            drop(file);

            // Rename temp file to final file
            if let Err(e) = tokio::fs::rename(&temp_path, &dest_path).await {
                update_status(0.0, false, Some(e.to_string()));
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
        let target = models.iter().find(|m| m.id == model_id)
            .ok_or_else(|| anyhow!("Model not found: {}", model_id))?;

        let path = self.models_dir.join(&target.filename);
        if path.exists() {
            fs::remove_file(&path)?;
            info!("Deleted model file: {}", path.display());
        }

        let mut states = self.download_states.write().unwrap();
        states.remove(model_id);
        Ok(())
    }
}
