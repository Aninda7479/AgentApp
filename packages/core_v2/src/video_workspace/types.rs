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
    pub ffmpeg_installed: bool,
    pub ffmpeg_version: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VideoEngineManifest {
    pub version: String,
    pub backend: GpuBackend,
    pub binary_name: String,
    pub installed_at: i64,
    pub sha256: String,
    pub source_url: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VideoEngineStatus {
    pub installed: bool,
    pub version: Option<String>,
    pub backend: Option<GpuBackend>,
    pub binary_path: Option<String>,
    pub installed_at: Option<i64>,
    pub is_running: bool,
    pub is_downloading: bool,
    pub download_progress: Option<f32>,
    pub error: Option<String>,
    pub ffmpeg_ready: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VideoUpdateInfo {
    pub current: String,
    pub latest: String,
    pub changelog: Option<String>,
    pub download_url: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum VideoModelFamily {
    Wan2_1,
    LtxVideo,
    CogVideoX,
    HunyuanVideo,
    StableVideoDiffusion,
    AnimateDiff,
    Custom,
}


#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum VideoModality {
    TextToVideo,
    ImageToVideo,
    Both,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum CameraMotionPreset {
    Static,
    PanLeft,
    PanRight,
    TiltUp,
    TiltDown,
    ZoomIn,
    ZoomOut,
    OrbitLeft,
    OrbitRight,
    CraneUp,
}

impl CameraMotionPreset {
    pub fn prompt_modifier(&self) -> &'static str {
        match self {
            CameraMotionPreset::Static => "static camera, locked-off shot",
            CameraMotionPreset::PanLeft => "smooth cinematic pan left, horizontal tracking camera movement",
            CameraMotionPreset::PanRight => "smooth cinematic pan right, horizontal tracking camera movement",
            CameraMotionPreset::TiltUp => "cinematic camera tilt upwards, ascending perspective",
            CameraMotionPreset::TiltDown => "cinematic camera tilt downwards, descending perspective",
            CameraMotionPreset::ZoomIn => "slow cinematic push in, dramatic dolly zoom into subject",
            CameraMotionPreset::ZoomOut => "smooth dolly zoom out, revealing wide landscape",
            CameraMotionPreset::OrbitLeft => "circular 3D orbit camera panning left around subject",
            CameraMotionPreset::OrbitRight => "circular 3D orbit camera panning right around subject",
            CameraMotionPreset::CraneUp => "dramatic crane shot lifting upwards into the sky",
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VideoModelInfo {
    pub id: String,
    pub name: String,
    pub family: VideoModelFamily,
    pub modality: VideoModality,
    pub quantization: String,
    pub download_url: String,
    pub filename: String,
    pub size_bytes: u64,
    pub vram_required_mb: u32,
    pub default_frames: u32,
    pub default_fps: u32,
    pub default_steps: u32,
    pub default_cfg: f32,
    pub is_downloaded: bool,
    pub local_path: Option<String>,
    pub download_progress: Option<f32>,
    pub is_downloading: bool,
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GenerateVideoRequest {
    pub prompt: String,
    pub negative_prompt: Option<String>,
    pub model_id: Option<String>,
    pub mode: Option<String>, // "local" | "cloud" | "auto"
    pub width: Option<u32>,
    pub height: Option<u32>,
    pub num_frames: Option<u32>,
    pub fps: Option<u32>,
    pub steps: Option<u32>,
    pub cfg_scale: Option<f32>,
    pub seed: Option<i64>,
    pub motion_scale: Option<f32>,
    pub motion_style: Option<String>, // "natural" | "dynamic" | "smooth" | "cinematic"
    pub loopable: Option<bool>,
    pub camera_motion: Option<CameraMotionPreset>,
    pub init_image: Option<String>, // Base64 data URL or path for I2V
    pub last_image: Option<String>, // Base64 data URL or path for transition
    pub interpolate_2x: Option<bool>,
    pub sampler: Option<String>,
}


#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GenerateVideoResponse {
    pub success: bool,
    pub id: String,
    pub video_url: String,
    pub thumbnail_url: String,
    pub prompt: String,
    pub negative_prompt: Option<String>,
    pub model_id: String,
    pub source: String, // "local" | "cloud"
    pub width: u32,
    pub height: u32,
    pub num_frames: u32,
    pub fps: u32,
    pub duration_seconds: f32,
    pub steps: u32,
    pub cfg_scale: f32,
    pub seed: i64,
    pub generation_time_ms: u64,
    pub created_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VideoProgressEvent {
    pub step: u32,
    pub total_steps: u32,
    pub frame_current: u32,
    pub frame_total: u32,
    pub progress: f32, // 0.0 to 1.0
    pub phase: String, // e.g. "loading_weights", "denoising_latents", "vae_decoding", "ffmpeg_encoding", "interpolating"
    pub step_time_ms: Option<u64>,
    pub eta_seconds: Option<f32>,
    pub elapsed_seconds: f32,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub preview_data_url: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum VideoGenerationStreamMessage {
    Progress(VideoProgressEvent),
    Complete {
        result: GenerateVideoResponse,
    },
    Error {
        message: String,
        error_type: String,
    },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VideoExportRequest {
    pub format: String, // "mp4" | "webm" | "gif" | "prores"
    pub fps: Option<u32>,
    pub scale_factor: Option<f32>, // 1.0, 1.5, 2.0
    pub speed_multiplier: Option<f32>, // 0.5, 1.0, 2.0
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VideoExportResponse {
    pub success: bool,
    pub export_url: String,
    pub filename: String,
    pub size_bytes: u64,
}
