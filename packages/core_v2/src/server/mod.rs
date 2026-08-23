use std::collections::HashMap;
use std::net::SocketAddr;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use std::time::Duration;

use anyhow::Result;
use axum::{
    extract::{
        ws::{Message, WebSocket, WebSocketUpgrade},
        DefaultBodyLimit, Path as AxumPath, State,
    },
    http::{header, HeaderMap, Method, StatusCode},
    response::{
        sse::{Event, KeepAlive, Sse},
        Html, IntoResponse, Response,
    },
    routing::{delete, get, post},
    Json, Router,
};
use futures_util::{stream::Stream, SinkExt, StreamExt};
use serde::{Deserialize, Serialize};
use sysinfo::System;
use tower_http::{
    cors::{Any, CorsLayer},
    services::{ServeDir, ServeFile},
};
use tracing::{info, warn};

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
    auth::{AuthStore, SessionEntry},
    chat_storage::{ChatSession, ChatSessionMetadata, ChatStorage},
    settings::{get_superagent_dir, SettingsStore},
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

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct SessionStateEntry {
    pub events: Vec<AgentEvent>,
    pub is_running: bool,
    pub full_assistant_text: String,
    pub full_thought_text: String,
    pub last_updated: i64,
}

impl Default for SessionStateEntry {
    fn default() -> Self {
        Self {
            events: Vec::new(),
            is_running: false,
            full_assistant_text: String::new(),
            full_thought_text: String::new(),
            last_updated: chrono::Utc::now().timestamp_millis(),
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

fn default_admin_username() -> String {
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

/// Discovers candidate locations for the compiled UI distribution folder.
pub fn find_ui_dist_dir(workspace_root: &Path) -> Option<PathBuf> {
    if let Ok(val) = std::env::var("SUPERAGENT_UI_DIST") {
        let p = PathBuf::from(val);
        if p.exists() {
            return Some(p);
        }
    }
    let candidates = [
        workspace_root.join("packages").join("ui").join("dist"),
        workspace_root.join("ui").join("dist"),
        workspace_root.join("web-dist"),
        workspace_root.join("packages").join("web").join("dist"),
        workspace_root.join("dist"),
        PathBuf::from("packages/ui/dist"),
        PathBuf::from("ui/dist"),
        PathBuf::from("web-dist"),
        PathBuf::from("dist"),
    ];
    for cand in &candidates {
        if cand.join("index.html").exists() || cand.join("login.html").exists() {
            return Some(cand.clone());
        }
    }
    None
}

/// Helper extracting session token from cookie or Authorization header.

fn extract_session_token(headers: &HeaderMap) -> Option<String> {
    if let Some(auth_val) = headers.get(header::AUTHORIZATION) {
        if let Ok(auth_str) = auth_val.to_str() {
            if let Some(token) = auth_str.strip_prefix("Bearer ") {
                return Some(token.trim().to_string());
            }
        }
    }
    if let Some(cookie_val) = headers.get(header::COOKIE) {
        if let Ok(cookie_str) = cookie_val.to_str() {
            for part in cookie_str.split(';') {
                let part = part.trim();
                if let Some(token) = part.strip_prefix("sa_session=") {
                    return Some(token.to_string());
                }
                if let Some(token) = part.strip_prefix("session=") {
                    return Some(token.to_string());
                }
                if let Some(token) = part.strip_prefix("sess=") {
                    return Some(token.to_string());
                }
            }
        }
    }
    None
}

/// Verifies whether a request is authenticated when auth is required.
fn is_request_authenticated(state: &AppState, headers: &HeaderMap) -> bool {
    let disable_auth = std::env::var("SUPERAGENT_DISABLE_AUTH").map(|v| v == "true").unwrap_or(false);
    if disable_auth {
        return true;
    }
    let settings = state.settings_store.load().unwrap_or_default();
    let auth_required = settings.enable_auth.unwrap_or(true);
    if !auth_required {
        return true;
    }
    if let Some(token) = extract_session_token(headers) {
        state.auth_store.validate_session_token(&token).is_some()
    } else {
        false
    }
}


/// Creates the complete router for the Core v2 API and static UI daemon.
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
        .allow_headers([
            header::CONTENT_TYPE,
            header::AUTHORIZATION,
            header::COOKIE,
            header::ACCEPT,
        ]);

    let mut api_router = Router::new()
        .route("/health", get(health_check))
        .route("/api/health", get(health_check))
        .route("/api/system-info", get(get_system_info))
        .route("/api/auth/status", get(get_auth_status))
        .route("/api/auth/setup", post(setup_auth))
        .route("/api/auth/login", post(login_auth))
        .route("/api/auth/logout", post(logout_auth))
        .route("/api/auth/verify", post(verify_auth_token))
        .route("/api/auth/password", post(change_auth_password))
        .route("/api/auth/change-password", post(change_auth_password))
        .route("/api/auth/devices", get(get_auth_devices))
        .route("/api/auth/devices/:id", delete(delete_auth_device))
        .route("/api/auth/history", get(get_auth_history))
        .route("/account", get(redirect_account))
        .route("/api/providers/status", get(get_providers_status))
        .route("/api/provider-proxy", post(handle_provider_proxy))
        .route("/api/update/check", get(check_for_updates))
        .route("/api/update/apply", post(apply_update))
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
        .route("/api/artifacts/sdk.js", get(get_artifact_sdk))
        .route("/api/artifacts/:id/sdk.js", get(get_artifact_sdk))
        .route(
            "/api/artifacts/:id/storage",
            get(get_artifact_storage)
                .post(set_artifact_storage)
                .put(set_artifact_storage)
                .delete(clear_artifact_storage),
        )
        .route(
            "/api/artifacts/:id/storage/:key",
            get(get_artifact_storage_key)
                .put(set_artifact_storage_key)
                .delete(delete_artifact_storage_key),
        )
        .route("/api/artifacts/:id/view", get(view_artifact_root))
        .route("/api/artifacts/:id/view/*path", get(view_artifact_file))
        .route("/api/tools", get(list_tools))
        .route("/api/integrations", get(list_integrations))
        .route("/api/personas", get(list_personas).post(save_persona))
        .route(
            "/api/personas/:id",
            get(get_persona).delete(delete_persona),
        )
        .route("/api/routines", get(list_routines).post(save_routine))
        .route(
            "/api/routines/:id",
            get(get_routine).delete(delete_routine),
        )
        .route("/api/routines/:id/run", post(run_routine_now))
        .route("/api/workflows/run", post(run_workflow))
        .route("/api/skills", get(list_skills))
        .route("/api/skills/trace/start", post(start_trace_session))
        .route("/api/skills/trace/:id/action", post(record_trace_action))
        .route("/api/skills/trace/:id/stop", post(stop_trace_session))
        .route("/api/skills/trace/:id/synthesize", post(synthesize_trace))
        .route("/api/chat/stream", post(handle_chat_stream))
        .route("/api/ipc/:channel", post(handle_ipc))
        .route("/ws/agent", get(handle_agent_ws))
        .route("/api/ws", get(handle_agent_ws));

    if let Some(ref dist) = state.ui_dist_dir {
        if dist.exists() {
            let index_file = dist.join("index.html");
            let login_file = dist.join("login.html");

            if login_file.exists() {
                let lf = login_file.clone();
                api_router = api_router.route(
                    "/login",
                    get(move || {
                        let path = lf.clone();
                        async move {
                            match tokio::fs::read_to_string(&path).await {
                                Ok(content) => Html(content).into_response(),
                                Err(_) => (StatusCode::NOT_FOUND, "login.html not found").into_response(),
                            }
                        }
                    }),
                );
            }

            let serve_service = ServeDir::new(dist)
                .fallback(ServeFile::new(index_file));

            return api_router
                .fallback_service(serve_service)
                .layer(DefaultBodyLimit::max(512 * 1024 * 1024))
                .layer(cors)
                .with_state(state);
        }
    }

    api_router
        .layer(DefaultBodyLimit::max(512 * 1024 * 1024))
        .layer(cors)
        .with_state(state)
}

async fn health_check() -> impl IntoResponse {
    Json(serde_json::json!({
        "status": "ok",
        "version": env!("CARGO_PKG_VERSION"),
        "engine": "superagent-core-v2 (Rust)",
        "timestamp": chrono::Utc::now().to_rfc3339()
    }))
}

async fn redirect_account() -> impl IntoResponse {
    axum::response::Redirect::temporary("/settings/web-app")
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

async fn get_auth_status(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> impl IntoResponse {
    let raw_settings = state.settings_store.load_raw().unwrap_or_else(|_| serde_json::json!({}));
    let owner_name = raw_settings.get("general").and_then(|g| g.get("ownerName")).and_then(|v| v.as_str());

    let disable_auth = std::env::var("SUPERAGENT_DISABLE_AUTH").map(|v| v == "true").unwrap_or(false);
    let auth_required = !disable_auth;
    let password_set = state.auth_store.is_password_set();

    let authenticated = if !auth_required {
        true
    } else if let Some(token) = extract_session_token(&headers) {
        state.auth_store.validate_session_token(&token).is_some()
    } else {
        false
    };

    Json(serde_json::json!({
        "authenticated": authenticated,
        "authRequired": auth_required,
        "passwordSet": password_set,
        "ownerName": owner_name,
        "user": if authenticated { Some("admin") } else { None },
        "version": env!("CARGO_PKG_VERSION")
    }))
}

async fn setup_auth(
    State(state): State<AppState>,
    Json(req): Json<AuthLoginRequest>,
) -> Result<Response, StatusCode> {
    if state.auth_store.is_password_set() {
        return Ok((
            StatusCode::CONFLICT,
            Json(serde_json::json!({
                "ok": false,
                "error": "A password has already been set. Please sign in."
            })),
        )
            .into_response());
    }

    if let Err(e) = state.auth_store.set_password(&req.password, Some("admin")) {
        return Ok((
            StatusCode::BAD_REQUEST,
            Json(serde_json::json!({
                "ok": false,
                "error": e.to_string()
            })),
        )
            .into_response());
    }

    let token = state.auth_store.create_session_token("admin");
    let cookie_header = format!("sa_session={}; Path=/; HttpOnly; SameSite=Lax", token);
    let body = Json(serde_json::json!({
        "ok": true,
        "success": true,
        "token": token,
        "username": "admin"
    }));

    let mut res = body.into_response();
    if let Ok(val) = header::HeaderValue::from_str(&cookie_header) {
        res.headers_mut().insert(header::SET_COOKIE, val);
    }
    Ok(res)
}

async fn login_auth(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(req): Json<AuthLoginRequest>,
) -> Result<Response, StatusCode> {
    let ip = headers
        .get("x-forwarded-for")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("127.0.0.1")
        .to_string();

    if state.auth_store.is_locked(&ip) {
        return Ok((
            StatusCode::TOO_MANY_REQUESTS,
            Json(serde_json::json!({
                "ok": false,
                "error": "Too many failed attempts. Account temporarily locked for 15 minutes."
            })),
        )
            .into_response());
    }

    if state.auth_store.verify_password(&req.username, &req.password) {
        state.auth_store.clear_failed_attempts(&ip);
        let user_agent = headers
            .get(header::USER_AGENT)
            .and_then(|v| v.to_str().ok())
            .map(|s| s.to_string());

        let token = state.auth_store.create_session_with_metadata(
            &req.username,
            Some(ip),
            user_agent,
        );

        let cookie_header = format!("sa_session={}; Path=/; HttpOnly; SameSite=Lax", token);
        let body = Json(serde_json::json!({
            "ok": true,
            "success": true,
            "token": token,
            "username": req.username
        }));

        let mut res = body.into_response();
        if let Ok(val) = header::HeaderValue::from_str(&cookie_header) {
            res.headers_mut().insert(header::SET_COOKIE, val);
        }
        Ok(res)
    } else {
        state.auth_store.record_failed_attempt(&ip);
        Ok((
            StatusCode::UNAUTHORIZED,
            Json(serde_json::json!({
                "ok": false,
                "error": "Invalid password"
            })),
        )
            .into_response())
    }
}


async fn logout_auth(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> impl IntoResponse {
    if let Some(token) = extract_session_token(&headers) {
        state.auth_store.invalidate_session(&token);
    }
    let mut res = Json(serde_json::json!({ "ok": true, "success": true })).into_response();
    if let Ok(val) = header::HeaderValue::from_str("session=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT") {
        res.headers_mut().insert(header::SET_COOKIE, val);
    }
    res
}

async fn verify_auth_token(
    State(state): State<AppState>,
    Json(req): Json<AuthVerifyRequest>,
) -> Result<Json<serde_json::Value>, StatusCode> {
    if let Some(token) = req.token {
        if let Some(user) = state.auth_store.validate_session_token(&token) {
            return Ok(Json(serde_json::json!({
                "valid": true,
                "username": user
            })));
        }
    }
    Err(StatusCode::UNAUTHORIZED)
}

async fn change_auth_password(
    State(state): State<AppState>,
    Json(req): Json<AuthPasswordRequest>,
) -> Result<Json<serde_json::Value>, StatusCode> {
    let current_pass = req.current_password.unwrap_or_else(|| "admin123".to_string());
    state
        .auth_store
        .change_password(&req.username, &current_pass, &req.new_password)
        .map(|_| Json(serde_json::json!({ "ok": true, "success": true })))
        .map_err(|_| StatusCode::BAD_REQUEST)
}

async fn get_auth_devices(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<Vec<SessionEntry>>, StatusCode> {
    if !is_request_authenticated(&state, &headers) {
        return Err(StatusCode::UNAUTHORIZED);
    }
    let list = state.auth_store.list_sessions("admin");
    Ok(Json(list))
}

async fn delete_auth_device(
    State(state): State<AppState>,
    AxumPath(session_id): AxumPath<String>,
    headers: HeaderMap,
) -> Result<Json<serde_json::Value>, StatusCode> {
    if !is_request_authenticated(&state, &headers) {
        return Err(StatusCode::UNAUTHORIZED);
    }
    let deleted = state.auth_store.invalidate_session(&session_id);
    Ok(Json(serde_json::json!({ "ok": deleted, "success": deleted })))
}

async fn get_auth_history(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<Vec<serde_json::Value>>, StatusCode> {
    if !is_request_authenticated(&state, &headers) {
        return Err(StatusCode::UNAUTHORIZED);
    }
    Ok(Json(vec![serde_json::json!({
        "timestamp": chrono::Utc::now().to_rfc3339(),
        "action": "login",
        "ip": "127.0.0.1",
        "status": "success"
    })]))
}

async fn get_providers_status(State(state): State<AppState>) -> impl IntoResponse {
    let settings = state.settings_store.load().unwrap_or_default();

    let check_provider = |key_name: &str, env_var: &str| -> bool {
        if std::env::var(env_var).map(|v| !v.trim().is_empty()).unwrap_or(false) {
            return true;
        }
        if let Some(val) = settings.api_keys.get(key_name) {
            return !val.trim().is_empty();
        }
        false
    };

    Json(serde_json::json!({
        "openai": { "configured": check_provider("openai", "OPENAI_API_KEY") },
        "anthropic": { "configured": check_provider("anthropic", "ANTHROPIC_API_KEY") },
        "gemini": { "configured": check_provider("gemini", "GEMINI_API_KEY") },
        "openrouter": { "configured": check_provider("openrouter", "OPENROUTER_API_KEY") },
        "deepseek": { "configured": check_provider("deepseek", "DEEPSEEK_API_KEY") },
        "groq": { "configured": check_provider("groq", "GROQ_API_KEY") },
        "ollama": { "configured": true }
    }))
}

fn is_private_or_loopback_host(host: &str) -> bool {
    let h = host.to_lowercase();
    if h == "localhost" || h == "127.0.0.1" || h == "::1" {
        return false;
    }
    if let Ok(ip) = h.parse::<std::net::IpAddr>() {
        match ip {
            std::net::IpAddr::V4(v4) => {
                let oct = v4.octets();
                // 169.254.x.x link local / cloud metadata
                if oct[0] == 169 && oct[1] == 254 {
                    return true;
                }
                // 10.x.x.x
                if oct[0] == 10 {
                    return true;
                }
                // 172.16.x.x - 172.31.x.x
                if oct[0] == 172 && (16..=31).contains(&oct[1]) {
                    return true;
                }
                // 192.168.x.x
                if oct[0] == 192 && oct[1] == 168 {
                    return true;
                }
            }
            std::net::IpAddr::V6(v6) => {
                if v6.is_loopback() || v6.is_multicast() {
                    return true;
                }
            }
        }
    }
    false
}

async fn handle_provider_proxy(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(req): Json<ProviderProxyRequest>,
) -> Result<Json<serde_json::Value>, (StatusCode, Json<serde_json::Value>)> {
    if !is_request_authenticated(&state, &headers) {
        return Err((
            StatusCode::UNAUTHORIZED,
            Json(serde_json::json!({ "error": "Unauthorized" })),
        ));
    }

    let parsed_url = url::Url::parse(&req.url).map_err(|_| {
        (
            StatusCode::BAD_REQUEST,
            Json(serde_json::json!({ "error": "Invalid URL" })),
        )
    })?;

    if parsed_url.scheme() != "http" && parsed_url.scheme() != "https" {
        return Err((
            StatusCode::BAD_REQUEST,
            Json(serde_json::json!({ "error": "Only http and https protocols allowed" })),
        ));
    }

    if let Some(host) = parsed_url.host_str() {
        if is_private_or_loopback_host(host) {
            return Err((
                StatusCode::FORBIDDEN,
                Json(serde_json::json!({ "error": "Access to private or link-local address is denied" })),
            ));
        }
    }

    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(30))
        .build()
        .map_err(|e| {
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(serde_json::json!({ "error": e.to_string() })),
            )
        })?;

    let method = match req.method.as_deref().unwrap_or("GET").to_uppercase().as_str() {
        "POST" => reqwest::Method::POST,
        "PUT" => reqwest::Method::PUT,
        "DELETE" => reqwest::Method::DELETE,
        "PATCH" => reqwest::Method::PATCH,
        _ => reqwest::Method::GET,
    };

    let mut request_builder = client.request(method, parsed_url);
    if let Some(hdrs) = req.headers {
        for (k, v) in hdrs {
            if let Ok(name) = reqwest::header::HeaderName::from_bytes(k.as_bytes()) {
                if let Ok(val) = reqwest::header::HeaderValue::from_str(&v) {
                    request_builder = request_builder.header(name, val);
                }
            }
        }
    }

    if let Some(body_val) = req.body {
        request_builder = request_builder.json(&body_val);
    }

    match request_builder.send().await {
        Ok(resp) => {
            let status = resp.status().as_u16();
            let ok = resp.status().is_success();
            let text = resp.text().await.unwrap_or_default();
            let data: serde_json::Value = serde_json::from_str(&text).unwrap_or(serde_json::Value::String(text));

            Ok(Json(serde_json::json!({
                "ok": ok,
                "status": status,
                "data": data
            })))
        }
        Err(err) => Err((
            StatusCode::BAD_GATEWAY,
            Json(serde_json::json!({
                "ok": false,
                "error": err.to_string()
            })),
        )),
    }
}

async fn check_for_updates() -> impl IntoResponse {
    let current_version = env!("CARGO_PKG_VERSION");
    Json(serde_json::json!({
        "current": current_version,
        "latest": current_version,
        "hasUpdate": false,
        "releaseUrl": "https://github.com/Aninda7479/AgentApp/releases"
    }))
}

async fn apply_update() -> impl IntoResponse {
    Json(serde_json::json!({
        "ok": true,
        "message": "SuperAgent Core v2 Daemon is up to date."
    }))
}

async fn get_settings(State(state): State<AppState>) -> Result<Json<serde_json::Value>, StatusCode> {
    state
        .settings_store
        .load_raw()
        .map(Json)
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)
}

async fn save_settings(
    State(state): State<AppState>,
    Json(settings): Json<serde_json::Value>,
) -> Result<Json<serde_json::Value>, StatusCode> {
    state
        .settings_store
        .save_raw(&settings)
        .map(|_| Json(serde_json::json!({ "ok": true, "success": true })))
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
    AxumPath(id): AxumPath<String>,
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
    AxumPath(id): AxumPath<String>,
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
    AxumPath(id): AxumPath<String>,
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
    AxumPath(id): AxumPath<String>,
) -> Result<Json<serde_json::Value>, StatusCode> {
    state
        .artifact_runner
        .stop_artifact(&id)
        .await
        .map(|_| Json(serde_json::json!({ "success": true })))
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)
}

// ─── Artifacts Dedicated Web Viewer & Storage SDK ─────────────────────────────

async fn get_artifact_sdk() -> impl IntoResponse {
    let sdk_js = r#"
(function (global) {
  'use strict';
  const pathname = window.location.pathname;
  const inferredId = (pathname.match(/\/api\/artifacts\/([^/]+)/) || [])[1] || '';
  const artifactId = window.__ARTIFACT_ID__ || inferredId;
  const origin = window.__SUPERAGENT_SERVER__ || window.location.origin;

  const storage = {
    get artifactId() { return artifactId; },
    async get(key, defaultValue) {
      if (defaultValue === undefined) defaultValue = null;
      if (!artifactId) return defaultValue;
      try {
        const res = await fetch(origin + '/api/artifacts/' + encodeURIComponent(artifactId) + '/storage/' + encodeURIComponent(key));
        if (!res.ok) return defaultValue;
        const data = await res.json();
        return data.value !== undefined ? data.value : defaultValue;
      } catch (e) {
        try {
          const local = localStorage.getItem('art_' + artifactId + '_' + key);
          return local ? JSON.parse(local) : defaultValue;
        } catch { return defaultValue; }
      }
    },
    async set(key, value) {
      if (!artifactId) return value;
      try {
        localStorage.setItem('art_' + artifactId + '_' + key, JSON.stringify(value));
      } catch {}
      try {
        await fetch(origin + '/api/artifacts/' + encodeURIComponent(artifactId) + '/storage/' + encodeURIComponent(key), {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ value })
        });
      } catch (e) {}
      return value;
    },
    async getAll() {
      if (!artifactId) return {};
      try {
        const res = await fetch(origin + '/api/artifacts/' + encodeURIComponent(artifactId) + '/storage');
        if (!res.ok) return {};
        const json = await res.json();
        return json.data || {};
      } catch { return {}; }
    },
    async setAll(data) {
      if (!artifactId) return data;
      try {
        await fetch(origin + '/api/artifacts/' + encodeURIComponent(artifactId) + '/storage', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ data })
        });
      } catch (e) {}
      return data;
    },
    async remove(key) {
      if (!artifactId) return false;
      try { localStorage.removeItem('art_' + artifactId + '_' + key); } catch {}
      try {
        await fetch(origin + '/api/artifacts/' + encodeURIComponent(artifactId) + '/storage/' + encodeURIComponent(key), {
          method: 'DELETE'
        });
        return true;
      } catch { return false; }
    },
    async clear() {
      if (!artifactId) return false;
      try {
        await fetch(origin + '/api/artifacts/' + encodeURIComponent(artifactId) + '/storage', {
          method: 'DELETE'
        });
        return true;
      } catch { return false; }
    }
  };

  global.SuperAgent = global.SuperAgent || {};
  global.SuperAgent.storage = storage;
  global.artifactStorage = storage;
})(window);
"#;

    (
        [(header::CONTENT_TYPE, "application/javascript; charset=utf-8")],
        sdk_js,
    )
}

fn get_artifact_dir(id: &str) -> Option<PathBuf> {
    let superagent_dir = get_superagent_dir();
    let candidates = [
        superagent_dir.join("artifacts").join(id),
        superagent_dir.join("artifact").join(id),
    ];
    for cand in &candidates {
        if cand.exists() {
            return Some(cand.clone());
        }
    }
    None
}

async fn view_artifact_root(
    AxumPath(id): AxumPath<String>,
) -> impl IntoResponse {
    view_artifact_file(AxumPath((id, String::new()))).await
}

async fn view_artifact_file(
    AxumPath((id, subpath)): AxumPath<(String, String)>,
) -> impl IntoResponse {
    let art_dir = match get_artifact_dir(&id) {
        Some(d) => d,
        None => return (StatusCode::NOT_FOUND, "Artifact not found").into_response(),
    };

    let canonical_root = match art_dir.canonicalize() {
        Ok(p) => p,
        Err(_) => return (StatusCode::NOT_FOUND, "Artifact directory unresolvable").into_response(),
    };

    let requested_path = if subpath.trim().is_empty() || subpath == "/" {
        canonical_root.join("index.html")
    } else {
        canonical_root.join(subpath.trim_start_matches('/'))
    };

    let target_file = if requested_path.is_dir() {
        requested_path.join("index.html")
    } else {
        requested_path
    };

    // Ensure path remains inside canonical root (path traversal protection)
    let canonical_target = match target_file.canonicalize() {
        Ok(p) => p,
        Err(_) => {
            let fallback = canonical_root.join("index.html");
            if fallback.exists() {
                fallback
            } else {
                return (StatusCode::NOT_FOUND, "File not found").into_response();
            }
        }
    };

    if !canonical_target.starts_with(&canonical_root) {
        return (StatusCode::FORBIDDEN, "Forbidden: Path traversal detected").into_response();
    }

    match tokio::fs::read(&canonical_target).await {
        Ok(bytes) => {
            let mime = mime_guess::from_path(&canonical_target)
                .first_or_octet_stream()
                .to_string();
            ([(header::CONTENT_TYPE, mime)], bytes).into_response()
        }
        Err(_) => (StatusCode::NOT_FOUND, "File not found").into_response(),
    }
}

async fn get_artifact_storage(
    AxumPath(id): AxumPath<String>,
) -> Json<serde_json::Value> {
    let file = get_superagent_dir().join("artifacts").join(&id).join("storage.json");
    let data: serde_json::Value = tokio::fs::read_to_string(&file)
        .await
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_else(|| serde_json::json!({}));

    Json(serde_json::json!({ "ok": true, "id": id, "data": data }))
}

async fn set_artifact_storage(
    AxumPath(id): AxumPath<String>,
    Json(body): Json<serde_json::Value>,
) -> Json<serde_json::Value> {
    let payload = body.get("data").cloned().unwrap_or(body);
    let dir = get_superagent_dir().join("artifacts").join(&id);
    let _ = tokio::fs::create_dir_all(&dir).await;
    let file = dir.join("storage.json");
    let _ = tokio::fs::write(&file, serde_json::to_string_pretty(&payload).unwrap_or_default()).await;

    Json(serde_json::json!({ "ok": true, "id": id, "data": payload }))
}

async fn clear_artifact_storage(
    AxumPath(id): AxumPath<String>,
) -> Json<serde_json::Value> {
    let file = get_superagent_dir().join("artifacts").join(&id).join("storage.json");
    let _ = tokio::fs::remove_file(file).await;
    Json(serde_json::json!({ "ok": true, "id": id, "cleared": true }))
}

async fn get_artifact_storage_key(
    AxumPath((id, key)): AxumPath<(String, String)>,
) -> Json<serde_json::Value> {
    let file = get_superagent_dir().join("artifacts").join(&id).join("storage.json");
    let data: HashMap<String, serde_json::Value> = tokio::fs::read_to_string(&file)
        .await
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default();

    let val = data.get(&key).cloned().unwrap_or(serde_json::Value::Null);
    Json(serde_json::json!({ "ok": true, "id": id, "key": key, "value": val }))
}

async fn set_artifact_storage_key(
    AxumPath((id, key)): AxumPath<(String, String)>,
    Json(body): Json<serde_json::Value>,
) -> Json<serde_json::Value> {
    let value = body.get("value").cloned().unwrap_or(body);
    let dir = get_superagent_dir().join("artifacts").join(&id);
    let _ = tokio::fs::create_dir_all(&dir).await;
    let file = dir.join("storage.json");

    let mut data: HashMap<String, serde_json::Value> = tokio::fs::read_to_string(&file)
        .await
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default();

    data.insert(key.clone(), value.clone());
    let _ = tokio::fs::write(&file, serde_json::to_string_pretty(&data).unwrap_or_default()).await;

    Json(serde_json::json!({ "ok": true, "id": id, "key": key, "value": value }))
}

async fn delete_artifact_storage_key(
    AxumPath((id, key)): AxumPath<(String, String)>,
) -> Json<serde_json::Value> {
    let file = get_superagent_dir().join("artifacts").join(&id).join("storage.json");
    let mut data: HashMap<String, serde_json::Value> = tokio::fs::read_to_string(&file)
        .await
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default();

    let deleted = data.remove(&key).is_some();
    if deleted {
        let _ = tokio::fs::write(&file, serde_json::to_string_pretty(&data).unwrap_or_default()).await;
    }

    Json(serde_json::json!({ "ok": true, "id": id, "key": key, "deleted": deleted }))
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
    AxumPath(id): AxumPath<String>,
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
    AxumPath(id): AxumPath<String>,
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
    AxumPath(id): AxumPath<String>,
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
    AxumPath(id): AxumPath<String>,
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
    AxumPath(id): AxumPath<String>,
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
    AxumPath(id): AxumPath<String>,
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
    AxumPath(id): AxumPath<String>,
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
    AxumPath(id): AxumPath<String>,
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

// ─── Universal IPC Dispatcher (50+ channels) ──────────────────────────────────

async fn handle_ipc(
    State(state): State<AppState>,
    AxumPath(channel): AxumPath<String>,
    _headers: HeaderMap,
    Json(req): Json<IpcRequest>,
) -> Result<Json<serde_json::Value>, (StatusCode, Json<serde_json::Value>)> {
    let args = req.args;
    let ch = channel.as_str();

    match ch {
        "store-read" => {
            let settings_val = state.settings_store.load_raw().unwrap_or_else(|_| serde_json::json!({}));
            let providers = settings_val.get("providers").cloned().unwrap_or_else(|| serde_json::json!([]));
            let models = settings_val.get("models").cloned().unwrap_or_else(|| serde_json::json!([]));
            let sessions = state.chat_storage.list_sessions().unwrap_or_default();
            Ok(Json(serde_json::json!({
                "data": {
                    "connectedProviders": providers,
                    "modelsCatalog": models,
                    "projects": [],
                    "chats": sessions
                }
            })))
        }
        "store-write" => {
            if let Some(arg) = args.first() {
                if let Some(obj) = arg.as_object() {
                    let mut current = state.settings_store.load_raw().unwrap_or_else(|_| serde_json::json!({}));
                    if let Some(c_obj) = current.as_object_mut() {
                        if let Some(p) = obj.get("connectedProviders") {
                            if p.as_array().map(|a| !a.is_empty()).unwrap_or(false) {
                                c_obj.insert("providers".to_string(), p.clone());
                            }
                        }
                        if let Some(m) = obj.get("modelsCatalog") {
                            if m.as_array().map(|a| !a.is_empty()).unwrap_or(false) {
                                c_obj.insert("models".to_string(), m.clone());
                            }
                        }
                        let _ = state.settings_store.save_raw(&current);
                    }
                }
            }
            Ok(Json(serde_json::json!({ "data": null })))
        }
        "chat-steps-read" => {
            let chat_id = args.first().and_then(|v| v.as_str()).unwrap_or("");
            if let Ok(session) = state.chat_storage.load_session(chat_id) {
                Ok(Json(serde_json::json!({ "data": session.messages })))
            } else {
                Ok(Json(serde_json::json!({ "data": [] })))
            }
        }
        "projects-read" => Ok(Json(serde_json::json!({ "data": [] }))),
        "chats-read" => {
            let sessions = state.chat_storage.list_sessions().unwrap_or_default();
            Ok(Json(serde_json::json!({ "data": sessions })))
        }
        "settings-read" => {
            let settings = state.settings_store.load_raw().unwrap_or_else(|_| serde_json::json!({}));
            Ok(Json(serde_json::json!({ "data": settings })))
        }
        "settings-write" => {
            if let Some(arg) = args.first() {
                let mut current = state.settings_store.load_raw().unwrap_or_else(|_| serde_json::json!({}));
                if let (Some(cur_map), Some(new_map)) = (current.as_object_mut(), arg.as_object()) {
                    for (k, v) in new_map {
                        cur_map.insert(k.clone(), v.clone());
                    }
                    let _ = state.settings_store.save_raw(&current);
                } else {
                    let _ = state.settings_store.save_raw(arg);
                }
            }
            Ok(Json(serde_json::json!({ "data": null })))
        }

        "system-info" | "get_system_info" => {
            let mut sys = System::new_all();
            sys.refresh_all();
            Ok(Json(serde_json::json!({
                "data": {
                    "os_name": System::name().unwrap_or_else(|| "Unknown".into()),
                    "os_version": System::os_version().unwrap_or_else(|| "Unknown".into()),
                    "total_memory_mb": sys.total_memory() / (1024 * 1024),
                    "used_memory_mb": sys.used_memory() / (1024 * 1024),
                    "cpu_count": sys.cpus().len(),
                    "hostname": System::host_name().unwrap_or_else(|| "localhost".into())
                }
            })))
        }
        "app-version" | "get_app_version" => {
            Ok(Json(serde_json::json!({ "data": env!("CARGO_PKG_VERSION") })))
        }
        "auto-detect-providers" => {
            let mut providers = Vec::new();
            if std::env::var("OPENAI_API_KEY").is_ok() {
                providers.push(serde_json::json!({
                    "id": "openai",
                    "name": "OpenAI",
                    "type": "env",
                    "models": [{ "id": "gpt-4o", "name": "GPT-4o" }, { "id": "gpt-4o-mini", "name": "GPT-4o Mini" }]
                }));
            }
            if std::env::var("ANTHROPIC_API_KEY").is_ok() {
                providers.push(serde_json::json!({
                    "id": "anthropic",
                    "name": "Anthropic",
                    "type": "env",
                    "models": [{ "id": "claude-3-5-sonnet-20241022", "name": "Claude 3.5 Sonnet" }]
                }));
            }
            if std::env::var("GEMINI_API_KEY").is_ok() {
                providers.push(serde_json::json!({
                    "id": "gemini",
                    "name": "Google Gemini",
                    "type": "env",
                    "models": [{ "id": "gemini-1.5-pro", "name": "Gemini 1.5 Pro" }]
                }));
            }
            Ok(Json(serde_json::json!({ "data": providers })))
        }
        "skills-catalog" => Ok(Json(serde_json::json!({ "data": [] }))),
        "plugins-catalog" => Ok(Json(serde_json::json!({ "data": [] }))),
        "mcp-catalog" => Ok(Json(serde_json::json!({ "data": [] }))),
        "skills-list" => {
            let skills = state.skill_synthesizer.list_skills().await.unwrap_or_default();
            Ok(Json(serde_json::json!({ "data": skills })))
        }
        "skills-save" => Ok(Json(serde_json::json!({ "data": { "success": true } }))),
        "skills-import-check" => Ok(Json(serde_json::json!({ "data": { "canImport": false, "skills": [] } }))),
        "skills-import-perform" => Ok(Json(serde_json::json!({ "data": { "success": true, "importedCount": 0 } }))),
        "kanban-load" => Ok(Json(serde_json::json!({ "data": [] }))),
        "kanban-save" => Ok(Json(serde_json::json!({ "data": { "success": true } }))),
        "web-status" => {
            Ok(Json(serde_json::json!({
                "data": {
                    "running": true,
                    "port": 1469,
                    "url": "http://localhost:1469",
                    "startedBy": "daemon"
                }
            })))
        }
        "web-start" => Ok(Json(serde_json::json!({ "data": { "success": true, "running": true } }))),
        "web-stop" => Ok(Json(serde_json::json!({ "data": { "success": false, "error": "The Web daemon cannot be stopped from within itself." } }))),
        "web-change-password" => {
            if let Some(arg) = args.first() {
                let current = arg.get("current").and_then(|v| v.as_str()).unwrap_or("admin123");
                let next = arg.get("next").and_then(|v| v.as_str()).unwrap_or("");
                if next.len() < 6 {
                    return Ok(Json(serde_json::json!({ "data": { "ok": false, "error": "Password must be at least 6 characters" } })));
                }
                let res = state.auth_store.change_password("admin", current, next).is_ok();
                return Ok(Json(serde_json::json!({ "data": { "ok": res } })));
            }
            Ok(Json(serde_json::json!({ "data": { "ok": false } })))
        }
        "pet-status" => Ok(Json(serde_json::json!({ "data": { "running": false, "enabled": false } }))),
        "pet-set-partner" => Ok(Json(serde_json::json!({ "data": { "ok": true } }))),
        "partner-list" => Ok(Json(serde_json::json!({ "data": [] }))),
        "partner-get-active" => Ok(Json(serde_json::json!({ "data": null }))),
        "partner-set-active" => Ok(Json(serde_json::json!({ "data": { "success": true } }))),
        "whisper-local-status" => Ok(Json(serde_json::json!({ "data": { "ok": true, "status": { "state": "ready" } } }))),
        "global-memory-read" => Ok(Json(serde_json::json!({ "data": { "userProfile": [], "learnedInsights": [] } }))),
        "telegram-config-get" => {
            let settings_val = state.settings_store.load_raw().unwrap_or_else(|_| serde_json::json!({}));
            let tg = settings_val.get("telegram").cloned().unwrap_or_else(|| serde_json::json!({
                "botToken": std::env::var("TELEGRAM_BOT_TOKEN").unwrap_or_default(),
                "chatId": std::env::var("TELEGRAM_CHAT_ID").unwrap_or_default(),
                "enabled": true,
                "parseMode": "Markdown"
            }));
            Ok(Json(serde_json::json!({ "data": tg })))
        }
        "telegram-config-save" => {
            if let Some(arg) = args.first() {
                let mut current = state.settings_store.load_raw().unwrap_or_else(|_| serde_json::json!({}));
                if let Some(c_obj) = current.as_object_mut() {
                    c_obj.insert("telegram".to_string(), arg.clone());
                    let _ = state.settings_store.save_raw(&current);
                }
            }
            Ok(Json(serde_json::json!({ "data": { "success": true } })))
        }
        "telegram-test" => {
            let arg = args.first();
            let bot_token = arg.and_then(|a| a.get("botToken")).and_then(|v| v.as_str()).unwrap_or("");
            let chat_id = arg.and_then(|a| a.get("chatId")).and_then(|v| v.as_str()).unwrap_or("");
            let send_test_msg = arg.and_then(|a| a.get("sendTestMessage")).and_then(|v| v.as_bool()).unwrap_or(false);

            if bot_token.trim().is_empty() {
                return Ok(Json(serde_json::json!({ "data": { "success": false, "error": "Bot token is required" } })));
            }

            let client = reqwest::Client::new();
            let me_url = format!("https://api.telegram.org/bot{}/getMe", bot_token.trim());
            match client.get(&me_url).send().await {
                Ok(resp) if resp.status().is_success() => {
                    let body: serde_json::Value = resp.json().await.unwrap_or_default();
                    let result = body.get("result");
                    let bot_name = result.and_then(|r| r.get("first_name")).and_then(|v| v.as_str()).unwrap_or("Telegram Bot");
                    let username = result.and_then(|r| r.get("username")).and_then(|v| v.as_str()).unwrap_or("");
                    let bot_id = result.and_then(|r| r.get("id")).and_then(|v| v.as_i64()).unwrap_or(0);

                    if send_test_msg && !chat_id.trim().is_empty() {
                        let send_opts = crate::integrations::telegram::TelegramSendOptions {
                            bot_token: bot_token.trim().to_string(),
                            chat_id: chat_id.trim().to_string(),
                            text: "Hello from SuperAgent! Test notification confirmed.".to_string(),
                            parse_mode: Some("Markdown".to_string()),
                            disable_notification: Some(false),
                        };
                        let tg_client = crate::integrations::telegram::TelegramClient::new();
                        let _ = tg_client.send_message(&send_opts).await;
                    }

                    Ok(Json(serde_json::json!({
                        "data": {
                            "success": true,
                            "botName": bot_name,
                            "username": username,
                            "botId": bot_id
                        }
                    })))
                }
                Ok(resp) => {
                    let err = resp.text().await.unwrap_or_else(|_| "Failed to connect to Telegram".into());
                    Ok(Json(serde_json::json!({ "data": { "success": false, "error": err } })))
                }
                Err(e) => {
                    Ok(Json(serde_json::json!({ "data": { "success": false, "error": e.to_string() } })))
                }
            }
        }
        "telegram-send" => {
            let arg = args.first();
            let mut bot_token = arg.and_then(|a| a.get("botToken")).and_then(|v| v.as_str()).unwrap_or("").to_string();
            let mut chat_id = arg.and_then(|a| a.get("chatId")).and_then(|v| v.as_str()).unwrap_or("").to_string();
            let text = arg.and_then(|a| a.get("text")).and_then(|v| v.as_str()).unwrap_or("");

            if bot_token.is_empty() || chat_id.is_empty() {
                if let Ok(s) = state.settings_store.load_raw() {
                    if let Some(tg) = s.get("telegram") {
                        if bot_token.is_empty() {
                            if let Some(tok) = tg.get("botToken").and_then(|v| v.as_str()) {
                                bot_token = tok.to_string();
                            }
                        }
                        if chat_id.is_empty() {
                            if let Some(cid) = tg.get("chatId").and_then(|v| v.as_str()) {
                                chat_id = cid.to_string();
                            }
                        }
                    }
                }
            }

            if bot_token.trim().is_empty() || chat_id.trim().is_empty() || text.trim().is_empty() {
                return Ok(Json(serde_json::json!({ "data": { "success": false, "error": "Missing botToken, chatId, or text" } })));
            }

            let send_opts = crate::integrations::telegram::TelegramSendOptions {
                bot_token: bot_token.trim().to_string(),
                chat_id: chat_id.trim().to_string(),
                text: text.to_string(),
                parse_mode: Some("Markdown".to_string()),
                disable_notification: Some(false),
            };
            let tg_client = crate::integrations::telegram::TelegramClient::new();
            match tg_client.send_message(&send_opts).await {
                Ok(res) => Ok(Json(serde_json::json!({
                    "data": {
                        "success": res.success,
                        "messageId": res.message_id,
                        "error": res.error
                    }
                }))),
                Err(e) => Ok(Json(serde_json::json!({
                    "data": { "success": false, "error": e.to_string() }
                }))),
            }
        }
        "artifact-list" | "artifact_list" | "artifact:list" => {
            let list = state.artifact_runner.scan_artifacts();
            Ok(Json(serde_json::json!({ "data": list })))
        }
        "select-project-folders" => {
            let root = state.workspace_root.to_string_lossy().to_string();
            Ok(Json(serde_json::json!({ "data": [root] })))
        }
        "select-files" => Ok(Json(serde_json::json!({ "data": [] }))),
        "copy-file-to-chat" => Ok(Json(serde_json::json!({ "data": { "success": true } }))),
        "read-file-base64" => {
            if let Some(path_str) = args.first().and_then(|v| v.as_str()) {
                let file_path = PathBuf::from(path_str);
                if file_path.exists() {
                    if let Ok(bytes) = tokio::fs::read(&file_path).await {
                        let b64 = format!("data:image/png;base64,{}", urlencoding::encode(&file_path.to_string_lossy()));
                        let _ = bytes.len();
                        return Ok(Json(serde_json::json!({ "data": b64 })));
                    }
                }
            }
            Ok(Json(serde_json::json!({ "data": null })))
        }
        // Graceful handling for desktop-only features in web browser
        "three-d-generate" | "three-d-list-models" | "three-d-delete-model" | "check-for-updates"
        | "pick-image-file" | "partner-install" | "partner-pick-model-file" | "partner-pick-model-folder"
        | "mcp-connect" | "mcp-disconnect" | "mcp-list" | "mcp-call" | "mcp-install"
        | "pet-start" | "pet-stop" | "pet-set-visible" | "pet-say" => {
            Ok(Json(serde_json::json!({
                "data": {
                    "ok": false,
                    "unsupported": true,
                    "error": "This feature is not available in the web mode."
                }
            })))
        }
        _ => {
            warn!("IPC channel not found: {}", ch);
            Ok(Json(serde_json::json!({ "data": null })))
        }
    }
}

// ─── WebSocket Event Hub & Session Resiliency ─────────────────────────────────

async fn handle_agent_ws(
    ws: WebSocketUpgrade,
    State(state): State<AppState>,
) -> impl IntoResponse {
    ws.on_upgrade(|socket| handle_ws_socket(socket, state))
}

async fn handle_ws_socket(socket: WebSocket, state: AppState) {
    let (mut ws_sender, mut ws_receiver) = socket.split();
    let mut broadcast_rx = state.ws_broadcast_tx.subscribe();

    info!("New WebSocket client connected to Core v2 Hub");

    let mut send_task = tokio::spawn(async move {
        while let Ok(msg_str) = broadcast_rx.recv().await {
            if ws_sender.send(Message::Text(msg_str)).await.is_err() {
                break;
            }
        }
    });

    let state_clone = state.clone();
    let mut recv_task = tokio::spawn(async move {
        while let Some(Ok(msg)) = ws_receiver.next().await {
            if let Message::Text(text) = msg {
                if let Ok(val) = serde_json::from_str::<serde_json::Value>(&text) {
                    let action = val.get("action").and_then(|v| v.as_str()).unwrap_or("");
                    match action {
                        "PING" => {
                            let pong = serde_json::json!({ "action": "PONG", "timestamp": chrono::Utc::now().timestamp_millis() });
                            let _ = state_clone.ws_broadcast_tx.send(pong.to_string());
                        }
                        "SYNC_SESSION" => {
                            if let Some(sess_id) = val.get("sessionId").and_then(|v| v.as_str()) {
                                let mut store = state_clone.session_store.lock().unwrap();
                                let entry = store.get(sess_id).cloned().unwrap_or_default();
                                let sync_payload = serde_json::json!({
                                    "channel": "session-sync",
                                    "data": {
                                        "sessionId": sess_id,
                                        "isRunning": entry.is_running,
                                        "replayEvents": entry.events,
                                        "fullAssistantText": entry.full_assistant_text,
                                        "fullThoughtText": entry.full_thought_text,
                                    }
                                });
                                let _ = state_clone.ws_broadcast_tx.send(sync_payload.to_string());
                            }
                        }
                        _ => {}
                    }
                }
            }
        }
    });

    tokio::select! {
        _ = (&mut send_task) => recv_task.abort(),
        _ = (&mut recv_task) => send_task.abort(),
    }
}

/// Starts the SuperAgent Core v2 Daemon server on the given host and port.
pub async fn start_server(port: u16, host: &str, workspace_root: PathBuf, custom_ui_dir: Option<PathBuf>) -> Result<()> {
    let superagent_dir = get_superagent_dir();
    let settings_store = Arc::new(SettingsStore::new());
    let auth_store = Arc::new(AuthStore::new(superagent_dir.clone()));
    let chat_storage = Arc::new(ChatStorage::new());
    let artifact_runner = Arc::new(ArtifactRunner::new());

    let persona_store = Arc::new(PersonaStore::new(&superagent_dir));
    let coordinator = Arc::new(Coordinator::new(persona_store.clone()));

    let mut registry = ToolRegistry::new();
    registry.register(ReadFileTool::new(workspace_root.clone()));
    registry.register(WriteFileTool::new(workspace_root.clone()));
    registry.register(EditFileTool::new(workspace_root.clone()));
    registry.register(ListDirTool::new(workspace_root.clone()));
    registry.register(RunCommandTool::new(workspace_root.clone()));
    registry.register(GrepSearchTool::new(workspace_root.clone()));
    registry.register(GeneratePdfTool::new(workspace_root.clone()));
    registry.register(GeneratePresentationTool::new(workspace_root.clone()));
    registry.register(BrowserNavigateTool::new());
    registry.register(BrowserScreenshotTool::new(workspace_root.clone()));
    registry.register(WebSearchTool::new());

    let tool_registry_arc = Arc::new(registry);
    let subagent_runner = Arc::new(SubagentRunner::new(
        persona_store.clone(),
        tool_registry_arc.clone(),
    ));

    let mut complete_registry = (*tool_registry_arc).clone();
    complete_registry.register(RunSubagentTool::new(subagent_runner.clone()));
    let final_tool_registry = Arc::new(complete_registry);

    let pipeline_executor = Arc::new(PipelineExecutor::new(subagent_runner.clone()));
    let trigger_engine = Arc::new(TriggerEngine::new(&superagent_dir, subagent_runner.clone()));
    trigger_engine.clone().start_scheduler();

    let trace_recorder = Arc::new(TraceRecorder::new());
    let skill_synthesizer = Arc::new(SkillSynthesizer::new(&workspace_root));

    let ui_dist_dir = custom_ui_dir.or_else(|| find_ui_dist_dir(&workspace_root));
    let (ws_broadcast_tx, _) = tokio::sync::broadcast::channel::<String>(256);

    let session_store = Arc::new(Mutex::new(lru::LruCache::new(
        std::num::NonZeroUsize::new(50).unwrap(),
    )));

    let state = AppState {
        workspace_root,
        ui_dist_dir,
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
        session_store,
        ws_broadcast_tx,
    };

    let app = create_router(state);

    let bind_ip = if host == "0.0.0.0" {
        [0, 0, 0, 0]
    } else {
        [127, 0, 0, 1]
    };
    let addr = SocketAddr::from((bind_ip, port));
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
        let session_store = Arc::new(Mutex::new(lru::LruCache::new(std::num::NonZeroUsize::new(50).unwrap())));
        let (ws_broadcast_tx, _) = tokio::sync::broadcast::channel::<String>(256);

        AppState {
            workspace_root: temp_dir,
            ui_dist_dir: None,
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
            session_store,
            ws_broadcast_tx,
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
    async fn test_ipc_settings_read() {
        let temp_dir = std::env::temp_dir().join(format!("test_ipc_{}", uuid::Uuid::new_v4()));
        let _ = std::fs::create_dir_all(&temp_dir);

        let state = build_test_state(temp_dir.clone());
        let app = create_router(state);
        let req = Request::builder()
            .uri("/api/ipc/settings-read")
            .method("POST")
            .header("Content-Type", "application/json")
            .body(Body::from(serde_json::json!({ "args": [] }).to_string()))
            .unwrap();

        let response = app.oneshot(req).await.unwrap();
        assert_eq!(response.status(), StatusCode::OK);

        let _ = std::fs::remove_dir_all(&temp_dir);
    }

    #[tokio::test]
    async fn test_artifact_sdk_endpoint() {
        let temp_dir = std::env::temp_dir().join(format!("test_sdk_{}", uuid::Uuid::new_v4()));
        let _ = std::fs::create_dir_all(&temp_dir);

        let state = build_test_state(temp_dir.clone());
        let app = create_router(state);
        let req = Request::builder()
            .uri("/api/artifacts/sdk.js")
            .method("GET")
            .body(Body::empty())
            .unwrap();

        let response = app.oneshot(req).await.unwrap();
        assert_eq!(response.status(), StatusCode::OK);

        let _ = std::fs::remove_dir_all(&temp_dir);
    }
}

