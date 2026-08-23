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

use crate::artifact::{ArtifactRunner, ArtifactRuntimeState};
use crate::automation::{
    BrowserNavigateTool, BrowserScreenshotTool, DemonstrationTrace, RecordedAction,
    SkillSynthesizer, SynthesizedSkill, TraceRecorder, TriggerEngine, WebSearchTool,
};
use crate::integrations::catalog::{get_curated_integrations, IntegrationEntry};
use crate::media::{GeneratePdfTool, GeneratePresentationTool};
use crate::orchestrator::{AgentEngine, Coordinator, PipelineExecutor, SubagentRunner};
use crate::roster::PersonaStore;
use crate::storage::{
    auth::AuthStore,
    chat_storage::{ChatSession, ChatSessionMetadata, ChatStorage},
    settings::{get_superagent_dir, SettingsStore, UserSettings},
};
use crate::tools::builtin::{
    EditFileTool, GrepSearchTool, ListDirTool, ReadFileTool, RunCommandTool, RunSubagentTool,
    WriteFileTool,
};
use crate::tools::ToolRegistry;
use crate::types::{
    AgentEvent, AgentPersona, ModelConfig, ProviderType, RoutineExecutionLog, RoutineTrigger,
    WorkflowDefinition, WorkflowExecutionResult,
};

#[derive(Clone)]
pub struct AppState {
    pub workspace_root: PathBuf,
    pub settings_store: Arc<SettingsStore>,
    pub auth_store: Arc<AuthStore>,
    pub chat_storage: Arc<ChatStorage>,
    pub artifact_runner: Arc<ArtifactRunner>,
    pub tool_registry: Arc<ToolRegistry>,
    pub persona_store: Arc<PersonaStore>,
    pub coordinator: Arc<Coordinator>,
    pub subagent_runner: Arc<SubagentRunner>,
    pub pipeline_executor: Arc<PipelineExecutor>,
    pub trigger_engine: Arc<TriggerEngine>,
    pub trace_recorder: Arc<TraceRecorder>,
    pub skill_synthesizer: Arc<SkillSynthesizer>,
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
        .route("/api/artifacts", get(list_artifacts))
        .route("/api/artifacts/:id/start", post(start_artifact))
        .route("/api/artifacts/:id/stop", post(stop_artifact))
        .route("/api/tools", get(list_tools))
        .route("/api/integrations", get(list_integrations))
        // Persona / Digital Workforce Endpoints
        .route(
            "/api/personas",
            get(list_personas).post(save_persona),
        )
        .route(
            "/api/personas/:id",
            get(get_persona).delete(delete_persona),
        )
        // Background Scheduled Routines Endpoints
        .route(
            "/api/routines",
            get(list_routines).post(save_routine),
        )
        .route(
            "/api/routines/:id",
            get(get_routine).delete(delete_routine),
        )
        .route("/api/routines/:id/run", post(run_routine_now))
        // Multi-Agent Workflow Execution
        .route("/api/workflows/run", post(run_workflow))
        // "Teach a Task" Skill Demonstration Recording & Synthesis
        .route("/api/skills", get(list_skills))
        .route("/api/skills/trace/start", post(start_trace_session))
        .route("/api/skills/trace/:id/action", post(record_trace_action))
        .route("/api/skills/trace/:id/stop", post(stop_trace_session))
        .route("/api/skills/trace/:id/synthesize", post(synthesize_trace))
        // Agent Chat Execution & WebSocket Streaming
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

async fn list_artifacts(
    State(state): State<AppState>,
) -> Result<Json<Vec<ArtifactRuntimeState>>, StatusCode> {
    let list = state.artifact_runner.scan_artifacts();
    Ok(Json(list))
}

async fn start_artifact(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<Json<ArtifactRuntimeState>, StatusCode> {
    state
        .artifact_runner
        .start_artifact(&id)
        .await
        .map(Json)
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)
}

async fn stop_artifact(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<Json<serde_json::Value>, StatusCode> {
    state
        .artifact_runner
        .stop_artifact(&id)
        .await
        .map(|_| Json(serde_json::json!({ "success": true })))
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)
}

async fn list_tools(State(state): State<AppState>) -> impl IntoResponse {
    let schemas = state.tool_registry.list_schemas();
    Json(schemas)
}

async fn list_integrations() -> Json<Vec<IntegrationEntry>> {
    Json(get_curated_integrations())
}

// ─── Persona Endpoints ────────────────────────────────────────────────────────

async fn list_personas(State(state): State<AppState>) -> Json<Vec<AgentPersona>> {
    let list = state.persona_store.list().await;
    Json(list)
}

async fn get_persona(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<Json<AgentPersona>, StatusCode> {
    state
        .persona_store
        .get(&id)
        .await
        .map(Json)
        .ok_or(StatusCode::NOT_FOUND)
}

async fn save_persona(
    State(state): State<AppState>,
    Json(persona): Json<AgentPersona>,
) -> Result<Json<AgentPersona>, StatusCode> {
    state
        .persona_store
        .save(persona)
        .await
        .map(Json)
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)
}

async fn delete_persona(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<Json<serde_json::Value>, StatusCode> {
    state
        .persona_store
        .delete(&id)
        .await
        .map(|deleted| Json(serde_json::json!({ "success": deleted })))
        .map_err(|_| StatusCode::BAD_REQUEST)
}

// ─── Routine Endpoints ────────────────────────────────────────────────────────

async fn list_routines(State(state): State<AppState>) -> Json<Vec<RoutineTrigger>> {
    let list = state.trigger_engine.list().await;
    Json(list)
}

async fn get_routine(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<Json<RoutineTrigger>, StatusCode> {
    state
        .trigger_engine
        .get(&id)
        .await
        .map(Json)
        .ok_or(StatusCode::NOT_FOUND)
}

async fn save_routine(
    State(state): State<AppState>,
    Json(routine): Json<RoutineTrigger>,
) -> Result<Json<RoutineTrigger>, StatusCode> {
    state
        .trigger_engine
        .save(routine)
        .await
        .map(Json)
        .map_err(|_| StatusCode::BAD_REQUEST)
}

async fn delete_routine(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<Json<serde_json::Value>, StatusCode> {
    state
        .trigger_engine
        .delete(&id)
        .await
        .map(|deleted| Json(serde_json::json!({ "success": deleted })))
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)
}

async fn run_routine_now(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<Json<RoutineExecutionLog>, StatusCode> {
    state
        .trigger_engine
        .execute_routine(&id)
        .await
        .map(Json)
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)
}

// ─── Workflow Execution Endpoints ─────────────────────────────────────────────

async fn run_workflow(
    State(state): State<AppState>,
    Json(req): Json<WorkflowRunRequest>,
) -> Result<Json<WorkflowExecutionResult>, StatusCode> {
    state
        .pipeline_executor
        .execute_pipeline(&req.workflow, &req.input, None)
        .await
        .map(Json)
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)
}

// ─── Demonstration Skills Endpoints ───────────────────────────────────────────

async fn list_skills(State(state): State<AppState>) -> Result<Json<Vec<SynthesizedSkill>>, StatusCode> {
    state
        .skill_synthesizer
        .list_skills()
        .await
        .map(Json)
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)
}

async fn start_trace_session(
    State(state): State<AppState>,
    Json(req): Json<StartTraceRequest>,
) -> Json<serde_json::Value> {
    let session_id = state
        .trace_recorder
        .start_session(&req.title, &req.description)
        .await;
    Json(serde_json::json!({ "sessionId": session_id }))
}

async fn record_trace_action(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Json(action): Json<RecordedAction>,
) -> Result<Json<serde_json::Value>, StatusCode> {
    let recorded = state.trace_recorder.record_action(&id, action).await;
    if recorded {
        Ok(Json(serde_json::json!({ "success": true })))
    } else {
        Err(StatusCode::NOT_FOUND)
    }
}

async fn stop_trace_session(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<Json<DemonstrationTrace>, StatusCode> {
    state
        .trace_recorder
        .stop_session(&id)
        .await
        .map(Json)
        .ok_or(StatusCode::NOT_FOUND)
}

async fn synthesize_trace(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Json(req): Json<SynthesizeTraceRequest>,
) -> Result<Json<SynthesizedSkill>, StatusCode> {
    let trace = state
        .trace_recorder
        .get_trace(&id)
        .await
        .ok_or(StatusCode::NOT_FOUND)?;

    let model_config = ModelConfig::new(ProviderType::OpenAI, "gpt-4o");

    state
        .skill_synthesizer
        .synthesize_from_trace(&trace, &req.skill_name, &model_config)
        .await
        .map(Json)
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)
}

// ─── Agent Chat Stream ────────────────────────────────────────────────────────

async fn handle_chat_stream(
    State(state): State<AppState>,
    Json(req): Json<ChatStreamRequest>,
) -> Sse<impl Stream<Item = Result<Event, axum::Error>>> {
    // Route prompt through Coordinator (detects explicit @persona-id or defaults to Chief of Staff)
    let routed = state.coordinator.route_prompt(&req.prompt).await;

    let target_persona = if let Some(ref pid) = req.persona_id {
        state.persona_store.get(pid).await.unwrap_or(routed.persona)
    } else {
        routed.persona
    };

    let mut model_config = req.provider.map(|p| {
        let m_id = req.model_id.clone().unwrap_or_else(|| "gpt-4o".to_string());
        ModelConfig::new(p, m_id)
    }).unwrap_or_else(|| target_persona.model_config.clone());

    model_config.api_key = req.api_key.or_else(|| {
        state
            .settings_store
            .get_api_key(&format!("{:?}", model_config.provider).to_lowercase())
            .ok()
            .flatten()
    });
    if req.base_url.is_some() {
        model_config.base_url = req.base_url;
    }
    if req.temperature.is_some() {
        model_config.temperature = req.temperature;
    }
    if req.max_tokens.is_some() {
        model_config.max_tokens = req.max_tokens;
    }

    let system_prompt = req
        .system_prompt
        .unwrap_or_else(|| target_persona.system_prompt.clone());
    let prompt_to_run = routed.clean_prompt;

    let mut engine = AgentEngine::new(state.tool_registry.clone());
    engine.set_max_turns(target_persona.max_turns);

    let explicit = routed.explicit_mention;
    let persona_name = target_persona.name.clone();
    let persona_id = target_persona.id.clone();

    let stream = async_stream::stream! {
        // Emit handover event if routed explicitly
        if explicit {
            let handover = AgentEvent::AgentHandover {
                from_persona: "coordinator".to_string(),
                to_persona: persona_id.clone(),
                reason: format!("Routed to specialized agent '{}'", persona_name),
            };
            if let Ok(json_str) = serde_json::to_string(&handover) {
                yield Ok(Event::default().data(json_str));
            }
        }

        match engine.run_loop(&model_config, &system_prompt, &prompt_to_run).await {
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
                let routed = state.coordinator.route_prompt(&req.prompt).await;
                let target_persona = if let Some(ref pid) = req.persona_id {
                    state.persona_store.get(pid).await.unwrap_or(routed.persona)
                } else {
                    routed.persona
                };

                let mut model_config = target_persona.model_config.clone();
                model_config.api_key = req.api_key.or_else(|| {
                    state
                        .settings_store
                        .get_api_key(&format!("{:?}", model_config.provider).to_lowercase())
                        .ok()
                        .flatten()
                });

                let system_prompt = req
                    .system_prompt
                    .unwrap_or_else(|| target_persona.system_prompt.clone());
                let prompt_to_run = routed.clean_prompt;

                let mut engine = AgentEngine::new(state.tool_registry.clone());
                engine.set_max_turns(target_persona.max_turns);

                if routed.explicit_mention {
                    let handover = AgentEvent::AgentHandover {
                        from_persona: "coordinator".to_string(),
                        to_persona: target_persona.id.clone(),
                        reason: format!("Routed to '{}'", target_persona.name),
                    };
                    if let Ok(json_str) = serde_json::to_string(&handover) {
                        let _ = socket.send(Message::Text(json_str)).await;
                    }
                }

                if let Ok(mut rx) = engine.run_loop(&model_config, &system_prompt, &prompt_to_run).await {
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
    let artifact_runner = Arc::new(ArtifactRunner::new());

    let persona_store = Arc::new(PersonaStore::new(&superagent_dir));
    let coordinator = Arc::new(Coordinator::new(persona_store.clone()));

    let mut registry = ToolRegistry::new();
    // Builtin Filesystem Tools
    registry.register(ReadFileTool::new(workspace_root.clone()));
    registry.register(WriteFileTool::new(workspace_root.clone()));
    registry.register(EditFileTool::new(workspace_root.clone()));
    registry.register(ListDirTool::new(workspace_root.clone()));
    registry.register(RunCommandTool::new(workspace_root.clone()));
    registry.register(GrepSearchTool::new(workspace_root.clone()));

    // Multimodal Media Generation Tools
    registry.register(GeneratePdfTool::new(workspace_root.clone()));
    registry.register(GeneratePresentationTool::new(workspace_root.clone()));

    // Browser Automation & Search Tools
    registry.register(BrowserNavigateTool::new());
    registry.register(BrowserScreenshotTool::new(workspace_root.clone()));
    registry.register(WebSearchTool::new());

    let tool_registry_arc = Arc::new(registry);

    let subagent_runner = Arc::new(SubagentRunner::new(
        persona_store.clone(),
        tool_registry_arc.clone(),
    ));

    // Register run_subagent tool into registry
    let mut complete_registry = (*tool_registry_arc).clone();
    complete_registry.register(RunSubagentTool::new(subagent_runner.clone()));
    let final_tool_registry = Arc::new(complete_registry);

    let pipeline_executor = Arc::new(PipelineExecutor::new(subagent_runner.clone()));
    let trigger_engine = Arc::new(TriggerEngine::new(&superagent_dir, subagent_runner.clone()));

    // Start routine background scheduler loop
    trigger_engine.clone().start_scheduler();

    let trace_recorder = Arc::new(TraceRecorder::new());
    let skill_synthesizer = Arc::new(SkillSynthesizer::new(&workspace_root));

    let state = AppState {
        workspace_root,
        settings_store,
        auth_store,
        chat_storage,
        artifact_runner,
        tool_registry: final_tool_registry,
        persona_store,
        coordinator,
        subagent_runner,
        pipeline_executor,
        trigger_engine,
        trace_recorder,
        skill_synthesizer,
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

    fn build_test_state(temp_dir: PathBuf) -> AppState {
        let settings_store = Arc::new(SettingsStore::with_path(temp_dir.join("settings.json")));
        let auth_store = Arc::new(AuthStore::new(temp_dir.join("auth")));
        let chat_storage = Arc::new(ChatStorage::with_dir(temp_dir.join("chats")));
        let artifact_runner = Arc::new(ArtifactRunner::with_dir(temp_dir.join("artifacts")));
        let persona_store = Arc::new(PersonaStore::new(&temp_dir));
        let coordinator = Arc::new(Coordinator::new(persona_store.clone()));
        let tool_registry = Arc::new(ToolRegistry::new());
        let subagent_runner = Arc::new(SubagentRunner::new(persona_store.clone(), tool_registry.clone()));
        let pipeline_executor = Arc::new(PipelineExecutor::new(subagent_runner.clone()));
        let trigger_engine = Arc::new(TriggerEngine::new(&temp_dir, subagent_runner.clone()));
        let trace_recorder = Arc::new(TraceRecorder::new());
        let skill_synthesizer = Arc::new(SkillSynthesizer::new(&temp_dir));

        AppState {
            workspace_root: temp_dir,
            settings_store,
            auth_store,
            chat_storage,
            artifact_runner,
            tool_registry,
            persona_store,
            coordinator,
            subagent_runner,
            pipeline_executor,
            trigger_engine,
            trace_recorder,
            skill_synthesizer,
        }
    }

    #[tokio::test]
    async fn test_health_check_endpoint() {
        let temp_dir = std::env::temp_dir().join(format!("test_server_{}", uuid::Uuid::new_v4()));
        let _ = std::fs::create_dir_all(&temp_dir);

        let state = build_test_state(temp_dir.clone());
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
    async fn test_personas_endpoint() {
        let temp_dir = std::env::temp_dir().join(format!("test_personas_{}", uuid::Uuid::new_v4()));
        let _ = std::fs::create_dir_all(&temp_dir);

        let state = build_test_state(temp_dir.clone());
        let app = create_router(state);
        let req = Request::builder()
            .uri("/api/personas")
            .method("GET")
            .body(Body::empty())
            .unwrap();

        let response = app.oneshot(req).await.unwrap();
        assert_eq!(response.status(), StatusCode::OK);

        let _ = std::fs::remove_dir_all(&temp_dir);
    }

    #[tokio::test]
    async fn test_routines_endpoint() {
        let temp_dir = std::env::temp_dir().join(format!("test_routines_{}", uuid::Uuid::new_v4()));
        let _ = std::fs::create_dir_all(&temp_dir);

        let state = build_test_state(temp_dir.clone());
        let app = create_router(state);
        let req = Request::builder()
            .uri("/api/routines")
            .method("GET")
            .body(Body::empty())
            .unwrap();

        let response = app.oneshot(req).await.unwrap();
        assert_eq!(response.status(), StatusCode::OK);

        let _ = std::fs::remove_dir_all(&temp_dir);
    }
}
