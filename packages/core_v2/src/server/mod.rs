use std::net::SocketAddr;
use std::path::PathBuf;
use std::sync::Arc;
use std::time::Duration;

use anyhow::Result;
use axum::{
    extract::{
        ws::{Message, WebSocket, WebSocketUpgrade},
        Path, State,
    },
    http::{header, Method, StatusCode},
    response::{
        sse::{Event, KeepAlive, Sse},
        IntoResponse,
    },
    routing::{get, post},
    Json, Router,
};
use futures_util::{stream::Stream, StreamExt};

use serde::{Deserialize, Serialize};
use sysinfo::System;
use tower_http::cors::{Any, CorsLayer};
use tracing::info;

use crate::orchestrator::AgentEngine;
use crate::storage::{
    auth::AuthStore,
    chat_storage::{ChatSession, ChatSessionMetadata, ChatStorage},
    settings::{get_superagent_dir, SettingsStore, UserSettings},
};
use crate::tools::builtin::{
    EditFileTool, GrepSearchTool, ListDirTool, ReadFileTool, RunCommandTool, WriteFileTool,
};
use crate::tools::ToolRegistry;
use crate::types::{AgentEvent, ModelConfig, ProviderType};

#[derive(Clone)]
pub struct AppState {
    pub workspace_root: PathBuf,
    pub settings_store: Arc<SettingsStore>,
    pub auth_store: Arc<AuthStore>,
    pub chat_storage: Arc<ChatStorage>,
    pub tool_registry: Arc<ToolRegistry>,
}

#[derive(Debug, Deserialize)]
pub struct ChatStreamRequest {
    pub prompt: String,
    pub system_prompt: Option<String>,
    pub provider: Option<ProviderType>,
    pub model_id: Option<String>,
    pub api_key: Option<String>,
    pub base_url: Option<String>,
    pub temperature: Option<f32>,
    pub max_tokens: Option<usize>,
    pub workspace: Option<String>,
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

/// Creates the complete router for the Core v2 API daemon.
pub fn create_router(state: AppState) -> Router {
    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods([
            Method::GET,
            Method::POST,
            Method::PUT,
            Method::DELETE,
            Method::OPTIONS,
        ])
        .allow_headers([header::CONTENT_TYPE, header::AUTHORIZATION]);

    Router::new()
        .route("/health", get(health_check))
        .route("/api/health", get(health_check))
        .route("/api/system-info", get(get_system_info))
        .route("/api/settings", get(get_settings).post(save_settings))
        .route(
            "/api/conversations",
            get(list_conversations).post(save_conversation),
        )
        .route(
            "/api/conversations/:id",
            get(get_conversation).delete(delete_conversation),
        )
        .route("/api/tools", get(list_tools))
        .route("/api/chat/stream", post(handle_chat_stream))
        .route("/ws/agent", get(handle_agent_ws))
        .layer(cors)
        .with_state(state)
}

async fn health_check() -> impl IntoResponse {
    Json(serde_json::json!({
        "status": "ok",
        "version": env!("CARGO_PKG_VERSION"),
        "engine": "superagent-core-v2 (Rust)"
    }))
}

async fn get_system_info() -> impl IntoResponse {
    let mut sys = System::new_all();
    sys.refresh_all();

    let os_name = System::name().unwrap_or_else(|| "Unknown".to_string());
    let os_version = System::os_version().unwrap_or_else(|| "Unknown".to_string());
    let total_memory_mb = sys.total_memory() / (1024 * 1024);
    let used_memory_mb = sys.used_memory() / (1024 * 1024);
    let cpu_count = sys.cpus().len();
    let hostname = System::host_name().unwrap_or_else(|| "localhost".to_string());

    Json(SystemInfoResponse {
        os_name,
        os_version,
        total_memory_mb,
        used_memory_mb,
        cpu_count,
        hostname,
    })
}

async fn get_settings(State(state): State<AppState>) -> Result<Json<UserSettings>, StatusCode> {
    state
        .settings_store
        .load()
        .map(Json)
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)
}

async fn save_settings(
    State(state): State<AppState>,
    Json(settings): Json<UserSettings>,
) -> Result<Json<serde_json::Value>, StatusCode> {
    state
        .settings_store
        .save(&settings)
        .map(|_| Json(serde_json::json!({ "success": true })))
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)
}

async fn list_conversations(
    State(state): State<AppState>,
) -> Result<Json<Vec<ChatSessionMetadata>>, StatusCode> {
    state
        .chat_storage
        .list_sessions()
        .map(Json)
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)
}

async fn get_conversation(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<Json<ChatSession>, StatusCode> {
    state
        .chat_storage
        .load_session(&id)
        .map(Json)
        .map_err(|_| StatusCode::NOT_FOUND)
}


async fn save_conversation(
    State(state): State<AppState>,
    Json(record): Json<ChatSession>,
) -> Result<Json<serde_json::Value>, StatusCode> {
    state
        .chat_storage
        .save_session(&record)
        .map(|_| Json(serde_json::json!({ "success": true, "id": record.id })))
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)
}

async fn delete_conversation(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<Json<serde_json::Value>, StatusCode> {
    state
        .chat_storage
        .delete_session(&id)
        .map(|_| Json(serde_json::json!({ "success": true })))
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)
}

async fn list_tools(State(state): State<AppState>) -> impl IntoResponse {
    let schemas = state.tool_registry.list_schemas();
    Json(schemas)
}

async fn handle_chat_stream(
    State(state): State<AppState>,
    Json(req): Json<ChatStreamRequest>,
) -> Sse<impl Stream<Item = Result<Event, axum::Error>>> {
    let provider = req.provider.unwrap_or(ProviderType::OpenAI);
    let model_id = req.model_id.unwrap_or_else(|| match provider {
        ProviderType::Anthropic => "claude-3-5-sonnet-20241022".to_string(),
        ProviderType::Gemini => "gemini-1.5-pro".to_string(),
        ProviderType::Ollama => "llama3".to_string(),
        _ => "gpt-4o".to_string(),
    });

    let mut model_config = ModelConfig::new(provider, model_id);
    model_config.api_key = req.api_key.or_else(|| {
        state
            .settings_store
            .get_api_key(&format!("{:?}", model_config.provider).to_lowercase())
            .ok()
            .flatten()
    });
    model_config.base_url = req.base_url;
    model_config.temperature = req.temperature;
    model_config.max_tokens = req.max_tokens;

    let engine = AgentEngine::new(state.tool_registry.clone());
    let system_prompt = req.system_prompt.unwrap_or_default();
    let user_prompt = req.prompt;

    let stream = async_stream::stream! {
        match engine.run_loop(&model_config, &system_prompt, &user_prompt).await {
            Ok(mut rx) => {
                while let Some(event) = rx.recv().await {
                    if let Ok(json_str) = serde_json::to_string(&event) {
                        yield Ok(Event::default().data(json_str));
                    }
                }
            }
            Err(err) => {
                let err_event = AgentEvent::Error { message: err.to_string() };
                if let Ok(json_str) = serde_json::to_string(&err_event) {
                    yield Ok(Event::default().data(json_str));
                }
            }
        }
    };

    Sse::new(stream).keep_alive(KeepAlive::new().interval(Duration::from_secs(15)))
}

async fn handle_agent_ws(
    ws: WebSocketUpgrade,
    State(state): State<AppState>,
) -> impl IntoResponse {
    ws.on_upgrade(|socket| handle_ws_socket(socket, state))
}

async fn handle_ws_socket(mut socket: WebSocket, state: AppState) {
    info!("New WebSocket agent connection established");

    while let Some(Ok(msg)) = socket.next().await {
        if let Message::Text(text) = msg {
            if let Ok(req) = serde_json::from_str::<ChatStreamRequest>(&text) {
                let provider = req.provider.unwrap_or(ProviderType::OpenAI);
                let model_id = req.model_id.unwrap_or_else(|| "gpt-4o".to_string());
                let mut model_config = ModelConfig::new(provider, model_id);
                model_config.api_key = req.api_key.or_else(|| {
                    state
                        .settings_store
                        .get_api_key(&format!("{:?}", model_config.provider).to_lowercase())
                        .ok()
                        .flatten()
                });
                model_config.base_url = req.base_url;
                model_config.temperature = req.temperature;
                model_config.max_tokens = req.max_tokens;

                let engine = AgentEngine::new(state.tool_registry.clone());
                let system_prompt = req.system_prompt.unwrap_or_default();

                if let Ok(mut rx) = engine.run_loop(&model_config, &system_prompt, &req.prompt).await {
                    while let Some(event) = rx.recv().await {
                        if let Ok(json_str) = serde_json::to_string(&event) {
                            if socket.send(Message::Text(json_str)).await.is_err() {
                                break;
                            }
                        }
                    }
                }
            }
        }
    }
}

/// Starts the SuperAgent Core v2 Daemon server on the given port.
pub async fn start_server(port: u16, workspace_root: PathBuf) -> Result<()> {
    let superagent_dir = get_superagent_dir();
    let settings_store = Arc::new(SettingsStore::new());
    let auth_store = Arc::new(AuthStore::new(superagent_dir.join("auth")));
    let chat_storage = Arc::new(ChatStorage::new());

    let mut registry = ToolRegistry::new();
    registry.register(ReadFileTool::new(workspace_root.clone()));
    registry.register(WriteFileTool::new(workspace_root.clone()));
    registry.register(EditFileTool::new(workspace_root.clone()));
    registry.register(ListDirTool::new(workspace_root.clone()));
    registry.register(RunCommandTool::new(workspace_root.clone()));
    registry.register(GrepSearchTool::new(workspace_root.clone()));

    let state = AppState {
        workspace_root,
        settings_store,
        auth_store,
        chat_storage,
        tool_registry: Arc::new(registry),
    };

    let app = create_router(state);
    let addr = SocketAddr::from(([127, 0, 0, 1], port));
    info!("🚀 SuperAgent Core v2 Daemon listening on http://{}", addr);

    let listener = tokio::net::TcpListener::bind(addr).await?;
    axum::serve(listener, app).await?;

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::body::Body;
    use axum::http::Request;
    use tower::ServiceExt;

    #[tokio::test]
    async fn test_health_check_endpoint() {
        let temp_dir = std::env::temp_dir().join(format!("test_server_{}", uuid::Uuid::new_v4()));
        let _ = std::fs::create_dir_all(&temp_dir);

        let state = AppState {
            workspace_root: temp_dir.clone(),
            settings_store: Arc::new(SettingsStore::with_path(temp_dir.join("settings.json"))),
            auth_store: Arc::new(AuthStore::new(temp_dir.join("auth"))),
            chat_storage: Arc::new(ChatStorage::with_dir(temp_dir.join("chats"))),
            tool_registry: Arc::new(ToolRegistry::new()),
        };

        let app = create_router(state);
        let req = Request::builder()
            .uri("/api/health")
            .method("GET")
            .body(Body::empty())
            .unwrap();

        let response = app.oneshot(req).await.unwrap();
        assert_eq!(response.status(), StatusCode::OK);

        let _ = std::fs::remove_dir_all(&temp_dir);
    }

    #[tokio::test]
    async fn test_system_info_endpoint() {
        let temp_dir = std::env::temp_dir().join(format!("test_server_{}", uuid::Uuid::new_v4()));
        let _ = std::fs::create_dir_all(&temp_dir);

        let state = AppState {
            workspace_root: temp_dir.clone(),
            settings_store: Arc::new(SettingsStore::with_path(temp_dir.join("settings.json"))),
            auth_store: Arc::new(AuthStore::new(temp_dir.join("auth"))),
            chat_storage: Arc::new(ChatStorage::with_dir(temp_dir.join("chats"))),
            tool_registry: Arc::new(ToolRegistry::new()),
        };

        let app = create_router(state);
        let req = Request::builder()
            .uri("/api/system-info")
            .method("GET")
            .body(Body::empty())
            .unwrap();

        let response = app.oneshot(req).await.unwrap();
        assert_eq!(response.status(), StatusCode::OK);

        let _ = std::fs::remove_dir_all(&temp_dir);
    }
}

