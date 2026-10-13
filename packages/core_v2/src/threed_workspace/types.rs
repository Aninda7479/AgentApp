use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum GpuBackend {
    Cuda,
    Vulkan,
    Metal,
    Rocm,
    Cpu,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ThreeDModality {
    TextTo3D,
    ImageTo3D,
    WorldGen,
    CharacterAvatar,
    CadSolid,
}

impl Default for ThreeDModality {
    fn default() -> Self {
        Self::TextTo3D
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ThreeDOutputFormat {
    Glb,
    Gltf,
    Obj,
    Ply,
    Stl,
    ThreeMf,
    Usdz,
}

impl Default for ThreeDOutputFormat {
    fn default() -> Self {
        Self::Glb
    }
}

impl ThreeDOutputFormat {
    pub fn extension(&self) -> &'static str {
        match self {
            Self::Glb => "glb",
            Self::Gltf => "gltf",
            Self::Obj => "obj",
            Self::Ply => "ply",
            Self::Stl => "stl",
            Self::ThreeMf => "3mf",
            Self::Usdz => "usdz",
        }
    }

    pub fn mime_type(&self) -> &'static str {
        match self {
            Self::Glb => "model/gltf-binary",
            Self::Gltf => "model/gltf+json",
            Self::Obj => "text/plain",
            Self::Ply => "application/ply",
            Self::Stl => "model/stl",
            Self::ThreeMf => "model/3mf",
            Self::Usdz => "model/vnd.usdz+zip",
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ThreeDModelFamily {
    Trellis,
    Hunyuan3d,
    Triposr,
    Tripo3d,
    Meshy,
    Shape,
    OpenaiAstra,
    Procedural,
    Custom,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ThreeDHardwareProfile {
    pub os: String,
    pub arch: String,
    pub gpu_name: Option<String>,
    pub vram_mb: Option<u64>,
    pub total_ram_mb: u64,
    pub available_ram_mb: Option<u64>,
    pub recommended_backend: GpuBackend,
    pub recommended_model_id: String,
    pub mesh_compute_supported: bool,
    pub splatting_supported: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ThreeDEngineStatus {
    pub installed: bool,
    pub version: Option<String>,
    pub backend: Option<GpuBackend>,
    pub binary_path: Option<String>,
    pub is_running: bool,
    pub is_downloading: bool,
    pub download_progress: Option<f32>,
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ThreeDModelInfo {
    pub id: String,
    pub name: String,
    pub family: ThreeDModelFamily,
    pub modality: ThreeDModality,
    pub supported_formats: Vec<ThreeDOutputFormat>,
    pub size_bytes: u64,
    pub vram_required_mb: u64,
    pub is_downloaded: bool,
    pub download_url: String,
    pub download_progress: Option<f32>,
    pub is_downloading: bool,
    pub local_path: Option<String>,
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct SpatialWorldConfig {
    pub theme: Option<String>,
    pub room_width: Option<f32>,
    pub room_length: Option<f32>,
    pub room_height: Option<f32>,
    pub density: Option<f32>,
    pub include_lighting: bool,
    pub skybox: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Generate3DRequest {
    pub prompt: String,
    pub negative_prompt: Option<String>,
    pub model_id: Option<String>,
    pub mode: Option<String>, // "local" | "cloud" | "auto"
    #[serde(default)]
    pub modality: Option<ThreeDModality>,
    #[serde(default)]
    pub output_format: Option<ThreeDOutputFormat>,
    pub init_image: Option<String>,
    pub poly_budget: Option<u32>,
    pub texture_resolution: Option<u32>,
    pub seed: Option<u64>,
    pub geometry_style: Option<String>,
    pub spatial_world: Option<SpatialWorldConfig>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Generate3DResponse {
    pub success: bool,
    pub id: String,
    pub model_url: String,
    pub thumbnail_url: Option<String>,
    pub prompt: String,
    pub model_id: String,
    pub source: String,
    pub format: ThreeDOutputFormat,
    pub poly_count: Option<u64>,
    pub vertex_count: Option<u64>,
    pub generation_time_ms: u64,
    pub created_at: i64,
    pub metadata: serde_json::Value,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SpatialSceneNode {
    pub id: String,
    pub name: String,
    pub node_type: String, // "mesh" | "group" | "light" | "camera"
    pub position: [f32; 3],
    pub rotation: [f32; 3],
    pub scale: [f32; 3],
    pub asset_url: Option<String>,
    pub color: Option<String>,
    #[serde(default)]
    pub children: Vec<SpatialSceneNode>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SpatialScene {
    pub id: String,
    pub name: String,
    pub root: SpatialSceneNode,
    pub skybox: Option<String>,
    pub ambient_light: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ThreeDProgressEvent {
    pub id: String,
    pub step: u32,
    pub total_steps: u32,
    pub stage: String,
    pub percentage: f32,
    pub message: String,
}
