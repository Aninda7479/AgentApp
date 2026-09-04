use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Arc;
use parking_lot::Mutex;

use serde::{Deserialize, Serialize};

use crate::artifact::ArtifactRunner;
use crate::automation::{SkillSynthesizer, TraceRecorder, TriggerEngine};
use crate::orchestrator::{Coordinator, PipelineExecutor, SubagentRunner};
use crate::roster::PersonaStore;
use crate::storage::{
    auth::AuthStore,
    chat_storage::ChatStorage,
    pcb_storage::PcbStorage,
    settings::SettingsStore,
};
use crate::tools::ToolRegistry;
use crate::types::{AgentEvent, ChatMessage, ProviderType, WorkflowDefinition};

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct SessionStateEntry {
    pub events: Vec<AgentEvent>,
    pub is_running: bool,
    pub full_assistant_text: String,
    pub full_thought_text: String,
    pub last_updated: i64,
    /// Persisted conversation history for multi-turn context across runs.
    #[serde(default)]
    pub conversation_history: Vec<ChatMessage>,
}

impl Default for SessionStateEntry {
    fn default() -> Self {
        Self {
            events: Vec::new(),
            is_running: false,
            full_assistant_text: String::new(),
            full_thought_text: String::new(),
            last_updated: chrono::Utc::now().timestamp_millis(),
            conversation_history: Vec::new(),
        }
    }
}

#[derive(Clone)]
pub struct AppState {
    pub workspace_root: PathBuf,
    pub ui_dist_dir: Option<PathBuf>,
    pub settings_store: Arc<SettingsStore>,
    pub auth_store: Arc<AuthStore>,
    pub chat_storage: Arc<ChatStorage>,
    pub pcb_storage: Arc<PcbStorage>,
    pub artifact_runner: Arc<ArtifactRunner>,
    pub tool_registry: Arc<ToolRegistry>,
    pub persona_store: Arc<PersonaStore>,
    pub coordinator: Arc<Coordinator>,
    pub subagent_runner: Arc<SubagentRunner>,
    pub pipeline_executor: Arc<PipelineExecutor>,
    pub trigger_engine: Arc<TriggerEngine>,
    pub trace_recorder: Arc<TraceRecorder>,
    pub skill_synthesizer: Arc<SkillSynthesizer>,
    pub session_store: Arc<Mutex<lru::LruCache<String, SessionStateEntry>>>,
    pub ws_broadcast_tx: tokio::sync::broadcast::Sender<String>,
    pub active_cancellations: Arc<Mutex<HashMap<String, tokio::sync::broadcast::Sender<()>>>>,
    pub pending_client_tools: Arc<Mutex<HashMap<String, tokio::sync::oneshot::Sender<serde_json::Value>>>>,
    pub image_workspace: Arc<crate::image_workspace::ImageWorkspaceManager>,
    pub video_workspace: Arc<crate::video_workspace::VideoWorkspaceManager>,
}


#[derive(Debug, Deserialize)]
pub struct ChatStreamRequest {
    pub prompt: String,
    pub system_prompt: Option<String>,
    pub persona_id: Option<String>,
    pub provider: Option<ProviderType>,
    pub model_id: Option<String>,
    pub api_key: Option<String>,
    pub base_url: Option<String>,
    pub temperature: Option<f32>,
    pub max_tokens: Option<usize>,
    pub workspace: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct WorkflowRunRequest {
    pub workflow: WorkflowDefinition,
    pub input: String,
}

#[derive(Debug, Deserialize)]
pub struct StartTraceRequest {
    pub title: String,
    pub description: String,
}

#[derive(Debug, Deserialize)]
pub struct SynthesizeTraceRequest {
    pub skill_name: String,
}

pub fn default_admin_username() -> String {
    "admin".to_string()
}

#[derive(Debug, Deserialize)]
pub struct AuthLoginRequest {
    #[serde(default = "default_admin_username")]
    pub username: String,
    pub password: String,
}

#[derive(Debug, Deserialize)]
pub struct AuthVerifyRequest {
    pub token: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct AuthPasswordRequest {
    #[serde(default = "default_admin_username")]
    pub username: String,
    #[serde(rename = "currentPassword", alias = "current_password", alias = "current")]
    pub current_password: Option<String>,
    #[serde(rename = "newPassword", alias = "new_password", alias = "next")]
    pub new_password: String,
}

#[derive(Debug, Deserialize)]
pub struct IpcRequest {
    #[serde(default)]
    pub args: Vec<serde_json::Value>,
    #[serde(flatten, default)]
    pub extra: HashMap<String, serde_json::Value>,
}

#[derive(Debug, Deserialize)]
pub struct ProviderProxyRequest {
    pub method: Option<String>,
    pub url: String,
    pub headers: Option<HashMap<String, String>>,
    pub body: Option<serde_json::Value>,
}

#[derive(Debug, Serialize)]
pub struct SystemInfoResponse {
    pub os_name: String,
    pub os_version: String,
    pub total_memory_mb: u64,
    pub used_memory_mb: u64,
    pub cpu_count: usize,
    pub hostname: String,
}
