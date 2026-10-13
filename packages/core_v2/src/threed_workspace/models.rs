use anyhow::{anyhow, Result};
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::{Arc, RwLock};

use crate::threed_workspace::types::{
    ThreeDModality, ThreeDModelFamily, ThreeDModelInfo, ThreeDOutputFormat,
};

#[derive(Debug, Clone)]
pub struct ThreeDDownloadState {
    pub progress: f32,
    pub is_downloading: bool,
    pub error: Option<String>,
}

#[derive(Clone)]
pub struct ThreeDModelRegistry {
    models_dir: PathBuf,
    download_states: Arc<RwLock<HashMap<String, ThreeDDownloadState>>>,
}

impl ThreeDModelRegistry {
    pub fn new() -> Self {
        let base = crate::storage::settings::get_superagent_dir();
        let models_dir = base.join("models").join("threed");
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

    /// Curated catalog of standard 3D generation engines and spatial models
    pub fn curated_catalog(&self) -> Vec<ThreeDModelInfo> {
        vec![
            // ── Built-in Pure Rust Procedural Spatial World Kernel ───────────
            ThreeDModelInfo {
                id: "procedural-world-v1".to_string(),
                name: "Procedural Spatial World Kernel".to_string(),
                family: ThreeDModelFamily::Procedural,
                modality: ThreeDModality::WorldGen,
                supported_formats: vec![ThreeDOutputFormat::Glb, ThreeDOutputFormat::Obj],
                size_bytes: 0,
                vram_required_mb: 0,
                is_downloaded: true,
                download_url: String::new(),
                download_progress: None,
                is_downloading: false,
                local_path: None,
                error: None,
            },
            // ── SOTA Local Neural Engines ────────────────────────────────────
            ThreeDModelInfo {
                id: "trellis-image-large".to_string(),
                name: "Microsoft TRELLIS (Splatting & Mesh)".to_string(),
                family: ThreeDModelFamily::Trellis,
                modality: ThreeDModality::TextTo3D,
                supported_formats: vec![ThreeDOutputFormat::Glb, ThreeDOutputFormat::Ply],
                size_bytes: 4_500_000_000,
                vram_required_mb: 12_288,
                is_downloaded: false,
                download_url: "https://huggingface.co/JeffreyXiang/TRELLIS-image-large".to_string(),
                download_progress: None,
                is_downloading: false,
                local_path: None,
                error: None,
            },
            ThreeDModelInfo {
                id: "hunyuan3d-2".to_string(),
                name: "Tencent Hunyuan3D 2.0".to_string(),
                family: ThreeDModelFamily::Hunyuan3d,
                modality: ThreeDModality::TextTo3D,
                supported_formats: vec![ThreeDOutputFormat::Glb, ThreeDOutputFormat::Obj],
                size_bytes: 6_200_000_000,
                vram_required_mb: 10_240,
                is_downloaded: false,
                download_url: "https://huggingface.co/tencent/Hunyuan3D-2".to_string(),
                download_progress: None,
                is_downloading: false,
                local_path: None,
                error: None,
            },
            ThreeDModelInfo {
                id: "triposr-fast".to_string(),
                name: "TripoSR Fast (<2s Feedforward Mesh)".to_string(),
                family: ThreeDModelFamily::Triposr,
                modality: ThreeDModality::ImageTo3D,
                supported_formats: vec![ThreeDOutputFormat::Glb, ThreeDOutputFormat::Obj],
                size_bytes: 1_800_000_000,
                vram_required_mb: 4_096,
                is_downloaded: false,
                download_url: "https://huggingface.co/stabilityai/TripoSR".to_string(),
                download_progress: None,
                is_downloading: false,
                local_path: None,
                error: None,
            },
            // ── SOTA Cloud Providers ─────────────────────────────────────────
            ThreeDModelInfo {
                id: "tripo3d-api".to_string(),
                name: "Tripo3D Cloud API v2".to_string(),
                family: ThreeDModelFamily::Tripo3d,
                modality: ThreeDModality::CharacterAvatar,
                supported_formats: vec![
                    ThreeDOutputFormat::Glb,
                    ThreeDOutputFormat::Obj,
                    ThreeDOutputFormat::Stl,
                    ThreeDOutputFormat::ThreeMf,
                ],
                size_bytes: 0,
                vram_required_mb: 0,
                is_downloaded: true,
                download_url: "https://api.tripo3d.ai/v2".to_string(),
                download_progress: None,
                is_downloading: false,
                local_path: None,
                error: None,
            },
            ThreeDModelInfo {
                id: "meshy4-api".to_string(),
                name: "Meshy 4 Game-Ready API".to_string(),
                family: ThreeDModelFamily::Meshy,
                modality: ThreeDModality::TextTo3D,
                supported_formats: vec![
                    ThreeDOutputFormat::Glb,
                    ThreeDOutputFormat::Obj,
                    ThreeDOutputFormat::Usdz,
                ],
                size_bytes: 0,
                vram_required_mb: 0,
                is_downloaded: true,
                download_url: "https://api.meshy.ai/v2".to_string(),
                download_progress: None,
                is_downloading: false,
                local_path: None,
                error: None,
            },
            ThreeDModelInfo {
                id: "astra-spatial".to_string(),
                name: "OpenAI Astra Spatial World Connector".to_string(),
                family: ThreeDModelFamily::OpenaiAstra,
                modality: ThreeDModality::WorldGen,
                supported_formats: vec![ThreeDOutputFormat::Glb, ThreeDOutputFormat::Gltf],
                size_bytes: 0,
                vram_required_mb: 0,
                is_downloaded: true,
                download_url: "https://api.openai.com/v1/chat/completions".to_string(),
                download_progress: None,
                is_downloading: false,
                local_path: None,
                error: None,
            },
        ]
    }

    pub fn list_models(&self) -> Vec<ThreeDModelInfo> {
        let catalog = self.curated_catalog();
        let states = self.download_states.read().unwrap();

        catalog
            .into_iter()
            .map(|mut m| {
                let local_path = self.models_dir.join(&m.id);
                if m.family == ThreeDModelFamily::Procedural
                    || m.family == ThreeDModelFamily::Tripo3d
                    || m.family == ThreeDModelFamily::Meshy
                    || m.family == ThreeDModelFamily::OpenaiAstra
                {
                    m.is_downloaded = true;
                } else if local_path.exists() {
                    m.is_downloaded = true;
                    m.local_path = Some(local_path.to_string_lossy().to_string());
                }

                if let Some(state) = states.get(&m.id) {
                    m.is_downloading = state.is_downloading;
                    m.download_progress = Some(state.progress);
                    m.error = state.error.clone();
                }

                m
            })
            .collect()
    }

    pub fn get_model(&self, id: &str) -> Option<ThreeDModelInfo> {
        self.list_models().into_iter().find(|m| m.id == id)
    }

    pub fn get_model_path(&self, id: &str) -> Option<PathBuf> {
        let path = self.models_dir.join(id);
        if path.exists() {
            Some(path)
        } else {
            None
        }
    }

    pub fn delete_model(&self, id: &str) -> Result<bool> {
        let model = self
            .get_model(id)
            .ok_or_else(|| anyhow!("Model not found"))?;
        if model.family == ThreeDModelFamily::Procedural
            || model.family == ThreeDModelFamily::Tripo3d
            || model.family == ThreeDModelFamily::Meshy
            || model.family == ThreeDModelFamily::OpenaiAstra
        {
            return Err(anyhow!("Cannot delete built-in engine or cloud connector"));
        }

        let path = self.models_dir.join(id);
        if path.exists() {
            if path.is_dir() {
                fs::remove_dir_all(&path)?;
            } else {
                fs::remove_file(&path)?;
            }
            Ok(true)
        } else {
            Ok(false)
        }
    }

    pub fn open_models_dir(&self) -> Result<PathBuf> {
        if !self.models_dir.exists() {
            fs::create_dir_all(&self.models_dir)?;
        }
        Ok(self.models_dir.clone())
    }
}
