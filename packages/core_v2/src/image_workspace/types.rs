use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum GpuBackend {
    Cuda,
    Vulkan,
    Metal,
    Rocm,
    Cpu,
}

impl GpuBackend {
    pub fn as_str(&self) -> &'static str {
        match self {
            GpuBackend::Cuda => "cuda",
            GpuBackend::Vulkan => "vulkan",
            GpuBackend::Metal => "metal",
            GpuBackend::Rocm => "rocm",
            GpuBackend::Cpu => "cpu",
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HardwareProfile {
    pub os: String,
    pub arch: String,
    pub gpu_name: Option<String>,
    pub vram_mb: Option<u64>,
    pub total_ram_mb: u64,
    pub available_ram_mb: Option<u64>,
    pub recommended_backend: GpuBackend,
    pub recommended_model_id: String,
    pub storage_free_gb: Option<f64>,
    pub storage_total_gb: Option<f64>,
    pub storage_mount: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub npu_detected: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub npu_label: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EngineManifest {
    pub version: String,
    pub backend: GpuBackend,
    pub binary_name: String,
    pub installed_at: i64,
    pub sha256: String,
    pub source_url: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EngineStatus {
    pub installed: bool,
    pub version: Option<String>,
    pub backend: Option<GpuBackend>,
    pub binary_path: Option<String>,
    pub installed_at: Option<i64>,
    pub is_running: bool,
    pub is_downloading: bool,
    pub download_progress: Option<f32>,
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UpdateInfo {
    pub current: String,
    pub latest: String,
    pub changelog: Option<String>,
    pub download_url: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum ModelFamily {
    Flux,
    Sdxl,
    Sd35,
    Sd15,
    Custom,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ImageModelInfo {
    pub id: String,
    pub name: String,
    pub family: ModelFamily,
    pub quantization: String,
    pub download_url: String,
    pub filename: String,
    pub size_bytes: u64,
    pub vram_required_mb: u32,
    pub default_steps: u32,
    pub default_cfg: f32,
    pub is_downloaded: bool,
    pub local_path: Option<String>,
    pub download_progress: Option<f32>,
    pub is_downloading: bool,
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GenerateImageRequest {
    pub prompt: String,
    pub negative_prompt: Option<String>,
    pub model_id: Option<String>,
    pub mode: Option<String>, // "local" | "cloud" | "auto"
    pub width: Option<u32>,
    pub height: Option<u32>,
    pub steps: Option<u32>,
    pub cfg_scale: Option<f32>,
    pub seed: Option<i64>,
    pub sampler: Option<String>,
    pub init_image: Option<String>,
    pub strength: Option<f32>,
    pub guidance_mode: Option<String>, // "face_lock" | "style_pose"
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GenerateImageResponse {
    pub success: bool,
    pub id: String,
    pub image_url: String,
    pub prompt: String,
    pub negative_prompt: Option<String>,
    pub model_id: String,
    pub source: String, // "local" | "cloud"
    pub width: u32,
    pub height: u32,
    pub steps: u32,
    pub cfg_scale: f32,
    pub seed: i64,
    pub generation_time_ms: u64,
    pub created_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GenerationProgressEvent {
    pub step: u32,
    pub total_steps: u32,
    pub progress: f32, // 0.0 to 1.0
    pub phase: String, // e.g. "loading", "sampling", "decoding", "finalizing"
    pub step_time_ms: Option<u64>,
    pub eta_seconds: Option<f32>,
    pub elapsed_seconds: f32,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub preview_data_url: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum GenerationStreamMessage {
    Progress(GenerationProgressEvent),
    Complete {
        result: GenerateImageResponse,
    },
    Error {
        message: String,
        error_type: String,
    },
}
