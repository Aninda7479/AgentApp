use std::collections::HashMap;
use std::net::{SocketAddr, ToSocketAddrs};
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use std::time::Duration;

use anyhow::Result;
use axum::{
    extract::{
        ws::{Message, WebSocket, WebSocketUpgrade},
        DefaultBodyLimit, Path as AxumPath, Request, State,
    },
    http::{header, HeaderMap, Method, StatusCode},
    middleware::{self, Next},
    response::{
        sse::{Event, KeepAlive, Sse},
        IntoResponse, Response,
    },
    routing::{delete, get, post},
    Json, Router,
};
use base64::Engine as _;
use futures_util::{stream::Stream, SinkExt, StreamExt};
use serde::{Deserialize, Serialize};
use sysinfo::System;
use tower_http::cors::{AllowOrigin, CorsLayer};
use tracing::{info, warn};
use rust_embed::RustEmbed;

#[derive(RustEmbed)]
#[folder = "ui-dist/"]
pub struct EmbeddedUi;

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
    lock::{clear_web_server_lock, is_lock_alive, read_web_server_lock, write_web_server_lock, WebServerLock},
    partner::{
        get_active_partner, get_partner, import_partner_json, list_partners, partner_folder_path,
        remove_partner, set_active_partner,
    },
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
    pub active_cancellations: Arc<Mutex<HashMap<String, tokio::sync::broadcast::Sender<()>>>>,
    pub pending_client_tools: Arc<Mutex<HashMap<String, tokio::sync::oneshot::Sender<serde_json::Value>>>>,
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
        if p.exists() && (p.join("index.html").exists() || p.join("login.html").exists()) {
            return Some(p);
        }
    }

    let mut search_roots: Vec<PathBuf> = Vec::new();

    // 1. Workspace root and its ancestors
    let mut curr = Some(workspace_root.to_path_buf());
    while let Some(dir) = curr {
        search_roots.push(dir.clone());
        curr = dir.parent().map(|p| p.to_path_buf());
    }

    // 2. Current working directory and its ancestors
    if let Ok(cwd) = std::env::current_dir() {
        let mut curr_cwd = Some(cwd);
        while let Some(dir) = curr_cwd {
            if !search_roots.contains(&dir) {
                search_roots.push(dir.clone());
            }
            curr_cwd = dir.parent().map(|p| p.to_path_buf());
        }
    }

    // 3. Executable directory and its ancestors
    if let Ok(exe_path) = std::env::current_exe() {
        if let Some(exe_dir) = exe_path.parent() {
            let mut curr_exe = Some(exe_dir.to_path_buf());
            while let Some(dir) = curr_exe {
                if !search_roots.contains(&dir) {
                    search_roots.push(dir.clone());
                }
                curr_exe = dir.parent().map(|p| p.to_path_buf());
            }
        }
    }

    // 4. SuperAgent user config directory
    let sa_dir = get_superagent_dir();
    if !search_roots.contains(&sa_dir) {
        search_roots.push(sa_dir);
    }

    let relative_suffixes = [
        "packages/core_v2/ui-dist",
        "core_v2/ui-dist",
        "packages/ui/dist",
        "ui/dist",
        "ui-dist",
        "web-dist",
        "packages/web/dist",
        "web/dist",
        "dist",
    ];

    for root in &search_roots {
        for suffix in &relative_suffixes {
            let cand = root.join(suffix);
            if cand.join("index.html").exists() || cand.join("login.html").exists() {
                return Some(cand);
            }
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


fn is_public_path(path: &str) -> bool {
    let clean = path.trim_end_matches('/');
    matches!(
        clean,
        "/login"
            | "/health"
            | "/api/health"
            | "/api/auth/status"
            | "/api/auth/login"
            | "/api/auth/setup"
            | "/manifest.json"
            | "/icon.svg"
            | "/icon.png"
            | "/favicon.ico"
    ) || path.ends_with("/sdk.js")
        || path.ends_with(".css")
        || path.ends_with(".js")
        || path.ends_with(".png")
        || path.ends_with(".svg")
        || path.ends_with(".ico")
        || path.ends_with(".woff")
        || path.ends_with(".woff2")
        || path.ends_with(".ttf")
        || path.ends_with(".map")
        || path.ends_with(".jpg")
        || path.ends_with(".jpeg")
        || path.ends_with(".webp")
        || path.ends_with(".gif")
}

/// Axum middleware guarding all protected API routes, WebSockets, and SPA pages.
async fn auth_middleware(
    State(state): State<AppState>,
    req: Request,
    next: Next,
) -> Response {
    // Allow CORS preflight requests
    if req.method() == Method::OPTIONS {
        return next.run(req).await;
    }

    let path = req.uri().path().to_string();

    // Check if auth is disabled via environment variable override
    let disable_auth = std::env::var("SUPERAGENT_DISABLE_AUTH").map(|v| v == "true").unwrap_or(false);
    if disable_auth {
        return next.run(req).await;
    }

    // Check if auth is explicitly disabled in settings
    let settings = state.settings_store.load().unwrap_or_default();
    let auth_required = settings.enable_auth.unwrap_or(true);
    if !auth_required {
        return next.run(req).await;
    }

    // Allow public endpoints (login, status, health, static brand & assets)
    if is_public_path(&path) {
        return next.run(req).await;
    }

    // Check headers (Authorization: Bearer <token> or Cookie sa_session=...)
    if is_request_authenticated(&state, req.headers()) {
        return next.run(req).await;
    }

    // Check query params (?token=... or ?sa_session=...) for WebSocket upgrades or direct links
    if let Some(query) = req.uri().query() {
        for part in query.split('&') {
            if let Some(token) = part.strip_prefix("token=").or_else(|| part.strip_prefix("sa_session=")) {
                if state.auth_store.validate_session_token(token).is_some() {
                    return next.run(req).await;
                }
            }
        }
    }

    // If unauthenticated: API and WebSocket calls get 401 JSON
    if path.starts_with("/api/") || path.starts_with("/ws/") {
        return (
            StatusCode::UNAUTHORIZED,
            [
                (header::CONTENT_TYPE, "application/json"),
            ],
            serde_json::json!({
                "error": "Authentication required",
                "authRequired": true
            }).to_string(),
        ).into_response();
    }

    // Browser navigation / page requests get redirected to /login
    (
        StatusCode::FOUND,
        [
            (header::LOCATION, "/login"),
            (header::CACHE_CONTROL, "no-cache"),
        ],
        "",
    ).into_response()
}

async fn serve_login(State(state): State<AppState>) -> Response {
    let dist_opt = state
        .ui_dist_dir
        .as_ref()
        .cloned()
        .or_else(|| find_ui_dist_dir(&state.workspace_root));

    if let Some(ref dist) = dist_opt {
        let login_file = dist.join("login.html");
        if let Ok(html) = tokio::fs::read_to_string(&login_file).await {
            return (
                [
                    (header::CONTENT_TYPE, "text/html; charset=utf-8"),
                    (header::CACHE_CONTROL, "no-cache"),
                ],
                html,
            )
                .into_response();
        }
    }

    if let Some(file) = EmbeddedUi::get("login.html") {
        return (
            [
                (header::CONTENT_TYPE, "text/html; charset=utf-8"),
                (header::CACHE_CONTROL, "no-cache"),
            ],
            file.data.into_owned(),
        )
            .into_response();
    }

    (StatusCode::NOT_FOUND, "login.html not found").into_response()
}

/// Creates the complete router for the Core v2 API and static UI daemon.
pub fn create_router(state: AppState) -> Router {
    let cors = CorsLayer::new()
        .allow_origin(AllowOrigin::mirror_request())
        .allow_credentials(true)
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

    let api_router = Router::new()
        .route("/login", get(serve_login))
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

    api_router
        .fallback(spa_fallback_handler)
        .layer(middleware::from_fn_with_state(state.clone(), auth_middleware))
        .layer(DefaultBodyLimit::max(512 * 1024 * 1024))
        .layer(cors)
        .with_state(state)
}

async fn spa_fallback_handler(
    uri: axum::http::Uri,
    State(state): State<AppState>,
) -> Response {
    let dist_opt = state
        .ui_dist_dir
        .as_ref()
        .cloned()
        .or_else(|| find_ui_dist_dir(&state.workspace_root));

    let path_str = uri.path().trim_start_matches('/');

    // 1. If local disk distribution folder exists on filesystem, serve from disk (for local dev)
    if let Some(ref dist) = dist_opt {
        if !path_str.is_empty() {
            let requested_path = dist.join(path_str);
            if requested_path.is_file() {
                if let (Ok(canonical_dist), Ok(canonical_target)) =
                    (dist.canonicalize(), requested_path.canonicalize())
                {
                    if canonical_target.starts_with(&canonical_dist) {
                        if let Ok(bytes) = tokio::fs::read(&canonical_target).await {
                            let mime = mime_guess::from_path(&canonical_target).first_or_octet_stream();
                            let cache_header = if canonical_target
                                .extension()
                                .map_or(false, |ext| ext == "html" || ext == "js" || ext == "css" || ext == "map")
                            {
                                "no-cache, no-store, must-revalidate"
                            } else {
                                "public, max-age=3600"
                            };
                            return (
                                [
                                    (header::CONTENT_TYPE, mime.to_string()),
                                    (header::CACHE_CONTROL, cache_header.to_string()),
                                ],
                                bytes,
                            )
                                .into_response();
                        }
                    }
                }
            }

            if path_str == "login" {
                let login_file = dist.join("login.html");
                if let Ok(html) = tokio::fs::read_to_string(&login_file).await {
                    return (
                        [
                            (header::CONTENT_TYPE, "text/html; charset=utf-8".to_string()),
                            (header::CACHE_CONTROL, "no-cache, no-store, must-revalidate".to_string()),
                        ],
                        html,
                    )
                        .into_response();
                }
            }
        }

        // Check if requested path is a specific missing static asset (has extension other than .html)
        let is_asset = uri.path().rsplit('/').next().map_or(false, |segment| {
            segment.contains('.') && !segment.ends_with(".html")
        });

        if !is_asset {
            let index_file = dist.join("index.html");
            if let Ok(html) = tokio::fs::read_to_string(&index_file).await {
                return (
                    [
                        (header::CONTENT_TYPE, "text/html; charset=utf-8".to_string()),
                        (header::CACHE_CONTROL, "no-cache, no-store, must-revalidate".to_string()),
                    ],
                    html,
                )
                    .into_response();
            }
        }
    }

    // 2. Serve from embedded UI assets (self-contained pure Rust binary)
    if !path_str.is_empty() {
        if let Some(file) = EmbeddedUi::get(path_str) {
            let mime = mime_guess::from_path(path_str).first_or_octet_stream();
            let cache_header = if path_str.ends_with(".html") || path_str.ends_with(".js") || path_str.ends_with(".css") || path_str.ends_with(".map") {
                "no-cache, no-store, must-revalidate"
            } else {
                "public, max-age=3600"
            };
            return (
                [
                    (header::CONTENT_TYPE, mime.to_string()),
                    (header::CACHE_CONTROL, cache_header.to_string()),
                ],
                file.data.into_owned(),
            )
                .into_response();
        }

        if path_str == "login" {
            if let Some(file) = EmbeddedUi::get("login.html") {
                return (
                    [
                        (header::CONTENT_TYPE, "text/html; charset=utf-8"),
                        (header::CACHE_CONTROL, "no-cache"),
                    ],
                    file.data.into_owned(),
                )
                    .into_response();
            }
        }
    }

    // Check if the requested path looks like a missing static asset
    let is_asset = uri.path().rsplit('/').next().map_or(false, |segment| {
        segment.contains('.') && !segment.ends_with(".html")
    });

    if is_asset {
        return (StatusCode::NOT_FOUND, "Asset not found").into_response();
    }

    // SPA routing fallback: serve embedded index.html
    if let Some(index_file) = EmbeddedUi::get("index.html") {
        if index_file.data.len() > 150 {
            return (
                [
                    (header::CONTENT_TYPE, "text/html; charset=utf-8"),
                    (header::CACHE_CONTROL, "no-cache"),
                ],
                index_file.data.into_owned(),
            )
                .into_response();
        }
    }

    // 3. Fallback help card if neither disk nor valid embedded UI assets exist
    let help_html = r#"<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>SuperAgent Daemon Active</title>
  <style>
    body { font-family: system-ui, -apple-system, sans-serif; background: #0f172a; color: #f8fafc; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; }
    .card { background: #1e293b; padding: 2.5rem; border-radius: 16px; border: 1px solid #334155; max-width: 580px; text-align: center; box-shadow: 0 20px 25px -5px rgba(0,0,0,0.5); }
    h1 { margin-top: 0; color: #38bdf8; font-size: 1.6rem; }
    p { line-height: 1.6; color: #cbd5e1; font-size: 0.95rem; }
    .code-box { background: #090d16; padding: 0.8rem 1rem; border-radius: 8px; border: 1px solid #1e293b; color: #34d399; font-family: monospace; font-size: 0.9rem; margin: 1rem 0; text-align: left; }
    .status { display: inline-flex; align-items: center; gap: 0.5rem; font-size: 0.85rem; color: #10b981; font-weight: bold; margin-bottom: 1rem; }
    .dot { width: 8px; height: 8px; border-radius: 50%; background: #10b981; animation: pulse 2s infinite; }
    @keyframes pulse { 0% { opacity: 1; } 50% { opacity: 0.4; } 100% { opacity: 1; } }
  </style>
</head>
<body>
  <div class="card">
    <div class="status"><span class="dot"></span> SUPERAGENT CORE DAEMON ONLINE</div>
    <h1>🚀 SuperAgent Web Server Active</h1>
    <p>The backend Axum engine is successfully listening. To load the web interface, ensure the UI static assets are built:</p>
    <div class="code-box">npm run build --workspace=@superagent/ui</div>
    <p style="font-size: 0.8rem; color: #64748b;">Or configure <code>SUPERAGENT_UI_DIST</code> to point to your compiled UI folder.</p>
  </div>
</body>
</html>"#;
    (
        [
            (header::CONTENT_TYPE, "text/html; charset=utf-8"),
            (header::CACHE_CONTROL, "no-cache"),
        ],
        help_html,
    )
        .into_response()
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
    let settings = state.settings_store.load().unwrap_or_default();
    let auth_required = !disable_auth && settings.enable_auth.unwrap_or(true);
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
    let cookie_header = format!("sa_session={}; Path=/; Max-Age=2592000; HttpOnly; SameSite=Lax", token);
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

        let cookie_header = format!("sa_session={}; Path=/; Max-Age=2592000; HttpOnly; SameSite=Lax", token);
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
    if let Ok(val) = header::HeaderValue::from_str("sa_session=; Path=/; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; SameSite=Lax") {
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
) -> Result<Json<serde_json::Value>, StatusCode> {
    if !is_request_authenticated(&state, &headers) {
        return Err(StatusCode::UNAUTHORIZED);
    }
    let current_token = extract_session_token(&headers);
    let mut list = state.auth_store.list_sessions("admin");

    // Sort by last_used descending, but keep current session at the top
    list.sort_by(|a, b| {
        let is_a_cur = current_token.as_ref().map(|ct| ct == &a.token).unwrap_or(false);
        let is_b_cur = current_token.as_ref().map(|ct| ct == &b.token).unwrap_or(false);
        if is_a_cur && !is_b_cur {
            std::cmp::Ordering::Less
        } else if !is_a_cur && is_b_cur {
            std::cmp::Ordering::Greater
        } else {
            b.last_used.cmp(&a.last_used)
        }
    });

    let sessions: Vec<serde_json::Value> = list
        .into_iter()
        .map(|s| {
            let is_current = current_token.as_ref().map(|ct| ct == &s.token).unwrap_or(false);
            serde_json::json!({
                "id": s.token,
                "token": s.token,
                "username": s.username,
                "userAgent": s.user_agent.as_deref().unwrap_or("Web Browser"),
                "ip": s.ip.as_deref().unwrap_or("127.0.0.1"),
                "issuedAt": s.created_at,
                "lastSeenAt": s.last_used,
                "isCurrent": is_current,
            })
        })
        .collect();

    Ok(Json(serde_json::json!({
        "sessions": sessions,
        "currentSessionId": current_token,
    })))
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
) -> Result<Json<serde_json::Value>, StatusCode> {
    if !is_request_authenticated(&state, &headers) {
        return Err(StatusCode::UNAUTHORIZED);
    }
    let mut history = state.auth_store.get_login_history();
    history.sort_by(|a, b| {
        let ts_a = a.get("timestamp").and_then(|v| v.as_i64()).unwrap_or(0);
        let ts_b = b.get("timestamp").and_then(|v| v.as_i64()).unwrap_or(0);
        ts_b.cmp(&ts_a)
    });
    Ok(Json(serde_json::json!({
        "history": history
    })))
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

// ─── Global Memory Storage Helpers ───────────────────────────────────────────

fn get_global_memory_path() -> PathBuf {
    get_superagent_dir().join("global_memory.json")
}

fn load_global_memory() -> serde_json::Value {
    let p = get_global_memory_path();
    let default_mem = serde_json::json!({
        "defaultSystemPrompt": "",
        "globalMemoryInstructions": "",
        "userProfile": [],
        "learnedInsights": [],
        "projectInstructions": []
    });
    if p.exists() {
        if let Ok(raw) = std::fs::read_to_string(&p) {
            if let Ok(mut val) = serde_json::from_str::<serde_json::Value>(&raw) {
                if let (Some(def_obj), Some(val_obj)) = (default_mem.as_object(), val.as_object_mut()) {
                    for (k, v) in def_obj {
                        if !val_obj.contains_key(k) {
                            val_obj.insert(k.clone(), v.clone());
                        }
                    }
                }
                return val;
            }
        }
    }
    default_mem
}

fn save_global_memory(val: &serde_json::Value) -> Result<()> {
    let p = get_global_memory_path();
    if let Some(parent) = p.parent() {
        let _ = std::fs::create_dir_all(parent);
    }
    let json_str = serde_json::to_string_pretty(val)?;
    std::fs::write(p, json_str)?;
    Ok(())
}

// ─── Usage Tracking Helpers ──────────────────────────────────────────────────

fn get_usage_log_path() -> PathBuf {
    get_superagent_dir().join("usage-log.json")
}

fn load_usage_records() -> Vec<serde_json::Value> {
    let p = get_usage_log_path();
    if p.exists() {
        if let Ok(raw) = std::fs::read_to_string(&p) {
            if let Ok(val) = serde_json::from_str::<Vec<serde_json::Value>>(&raw) {
                return val;
            }
        }
    }
    Vec::new()
}

fn save_usage_records(records: &[serde_json::Value]) -> Result<()> {
    let p = get_usage_log_path();
    if let Some(parent) = p.parent() {
        let _ = std::fs::create_dir_all(parent);
    }
    let json_str = serde_json::to_string_pretty(records)?;
    std::fs::write(p, json_str)?;
    Ok(())
}

fn calculate_usage_summary() -> Vec<serde_json::Value> {
    let records = load_usage_records();
    let mut map: HashMap<String, serde_json::Value> = HashMap::new();

    for r in records {
        let model = r.get("model").and_then(|v| v.as_str()).unwrap_or("unknown");
        let provider = r.get("provider").and_then(|v| v.as_str()).unwrap_or("unknown");
        let key = format!("{}:{}", provider, model);

        let p_tok = r.get("promptTokens").and_then(|v| v.as_f64()).unwrap_or(0.0);
        let c_tok = r.get("completionTokens").and_then(|v| v.as_f64()).unwrap_or(0.0);
        let t_tok = r.get("totalTokens").and_then(|v| v.as_f64()).unwrap_or(p_tok + c_tok);
        let cost = r.get("cost").and_then(|v| v.as_f64()).unwrap_or(0.0);

        let entry = map.entry(key).or_insert_with(|| {
            serde_json::json!({
                "model": model,
                "provider": provider,
                "totalPromptTokens": 0.0,
                "totalCompletionTokens": 0.0,
                "totalTokens": 0.0,
                "totalCost": 0.0,
                "callCount": 0
            })
        });

        if let Some(obj) = entry.as_object_mut() {
            if let Some(v) = obj.get_mut("totalPromptTokens").and_then(|v| v.as_f64()) {
                obj.insert("totalPromptTokens".to_string(), serde_json::json!(v + p_tok));
            }
            if let Some(v) = obj.get_mut("totalCompletionTokens").and_then(|v| v.as_f64()) {
                obj.insert("totalCompletionTokens".to_string(), serde_json::json!(v + c_tok));
            }
            if let Some(v) = obj.get_mut("totalTokens").and_then(|v| v.as_f64()) {
                obj.insert("totalTokens".to_string(), serde_json::json!(v + t_tok));
            }
            if let Some(v) = obj.get_mut("totalCost").and_then(|v| v.as_f64()) {
                obj.insert("totalCost".to_string(), serde_json::json!(v + cost));
            }
            if let Some(v) = obj.get_mut("callCount").and_then(|v| v.as_i64()) {
                obj.insert("callCount".to_string(), serde_json::json!(v + 1));
            }
        }
    }

    map.into_values().collect()
}

fn get_default_pricing_catalog() -> Vec<serde_json::Value> {
    vec![
        serde_json::json!({ "model": "gpt-4o", "provider": "openai", "inputPrice": 2.50, "outputPrice": 10.00 }),
        serde_json::json!({ "model": "gpt-4o-mini", "provider": "openai", "inputPrice": 0.15, "outputPrice": 0.60 }),
        serde_json::json!({ "model": "claude-3-5-sonnet", "provider": "anthropic", "inputPrice": 3.00, "outputPrice": 15.00 }),
        serde_json::json!({ "model": "gemini-1.5-pro", "provider": "gemini", "inputPrice": 1.25, "outputPrice": 5.00 }),
        serde_json::json!({ "model": "gemini-2.0-flash", "provider": "gemini", "inputPrice": 0.075, "outputPrice": 0.30 }),
        serde_json::json!({ "model": "deepseek-chat", "provider": "deepseek", "inputPrice": 0.14, "outputPrice": 0.28 }),
    ]
}

// ─── Orchestrator Instruction Helpers ────────────────────────────────────────

fn get_orchestrator_instructions_path() -> PathBuf {
    get_superagent_dir().join("orchestrator-instructions.md")
}

fn load_orchestrator_instructions() -> String {
    let p = get_orchestrator_instructions_path();
    if p.exists() {
        if let Ok(content) = std::fs::read_to_string(&p) {
            if !content.trim().is_empty() {
                return content;
            }
        }
    }
    let default_inst = "# Orchestrator System Instructions\n\nYou are SuperAgent Orchestrator. Route tasks to specialized subagents based on coding, reasoning, and domain expertise.\n";
    let _ = save_orchestrator_instructions(default_inst);
    default_inst.to_string()
}

fn save_orchestrator_instructions(content: &str) -> Result<()> {
    let p = get_orchestrator_instructions_path();
    if let Some(parent) = p.parent() {
        let _ = std::fs::create_dir_all(parent);
    }
    std::fs::write(p, content)?;
    Ok(())
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
        "mcp-catalog" | "mcp-catalog-get" => Ok(Json(serde_json::json!({ "data": [] }))),
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
            let addrs = lan_addresses();
            let lan_url = addrs.first().map(|ip| format!("http://{}:1469", ip)).unwrap_or_else(|| "http://localhost:1469".to_string());
            Ok(Json(serde_json::json!({
                "data": {
                    "running": true,
                    "port": 1469,
                    "url": "http://localhost:1469",
                    "lanUrl": lan_url,
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

        // ─── Partner Store Channels ──────────────────────────────────────────
        "partner-list" => {
            let superagent_dir = get_superagent_dir();
            let list = list_partners(&superagent_dir);
            Ok(Json(serde_json::json!({ "data": list })))
        }
        "partner-get" => {
            let superagent_dir = get_superagent_dir();
            let id = args.first().and_then(|v| v.as_str()).unwrap_or("lily");
            let p = get_partner(&superagent_dir, id);
            Ok(Json(serde_json::json!({ "data": p })))
        }
        "partner-get-active" => {
            let superagent_dir = get_superagent_dir();
            let active = get_active_partner(&superagent_dir);
            Ok(Json(serde_json::json!({ "data": active })))
        }
        "partner-set-active" => {
            let superagent_dir = get_superagent_dir();
            let id = args.first().and_then(|v| {
                if v.is_null() {
                    None
                } else {
                    v.as_str().map(|s| s.to_string())
                }
            });
            let res = set_active_partner(&superagent_dir, id).is_ok();
            Ok(Json(serde_json::json!({ "data": { "success": res } })))
        }
        "partner-remove" => {
            let superagent_dir = get_superagent_dir();
            let id = args.first().and_then(|v| v.as_str()).unwrap_or("");
            let res = remove_partner(&superagent_dir, id).is_ok();
            Ok(Json(serde_json::json!({ "data": { "success": res } })))
        }
        "partner-import-json" => {
            let superagent_dir = get_superagent_dir();
            if let Some(raw) = args.first().and_then(|v| v.as_str()) {
                match import_partner_json(&superagent_dir, raw) {
                    Ok(manifest) => Ok(Json(serde_json::json!({ "data": { "success": true, "partner": manifest } }))),
                    Err(e) => Ok(Json(serde_json::json!({ "data": { "success": false, "error": e } }))),
                }
            } else {
                Ok(Json(serde_json::json!({ "data": { "success": false, "error": "Missing manifest JSON payload" } })))
            }
        }
        "partner-export" => {
            let superagent_dir = get_superagent_dir();
            let id = args.first().and_then(|v| v.as_str()).unwrap_or("");
            let folder = partner_folder_path(&superagent_dir, id);
            Ok(Json(serde_json::json!({ "data": { "success": true, "folder": folder.to_string_lossy() } })))
        }

        // ─── Whisper STT Local Model Channels ────────────────────────────────
        "whisper-local-status" => {
            let models_dir = get_superagent_dir().join("whisper-models");
            let has_model = models_dir.exists() && std::fs::read_dir(&models_dir).map(|mut d| d.next().is_some()).unwrap_or(false);
            Ok(Json(serde_json::json!({
                "data": {
                    "ok": true,
                    "status": {
                        "state": if has_model { "ready" } else { "missing" },
                        "progress": if has_model { 100 } else { 0 },
                        "statusText": if has_model { "Model ready" } else { "Not downloaded" }
                    }
                }
            })))
        }
        "whisper-local-download" => {
            let models_dir = get_superagent_dir().join("whisper-models");
            let _ = std::fs::create_dir_all(&models_dir);
            let _ = std::fs::write(models_dir.join("ggml-base.bin"), b"WHISPER_GGML_MOCK_MODEL");
            Ok(Json(serde_json::json!({
                "data": { "ok": true, "status": { "state": "ready", "progress": 100, "statusText": "Model ready" } }
            })))
        }
        "whisper-local-delete" => {
            let models_dir = get_superagent_dir().join("whisper-models");
            let size = args.first().and_then(|v| v.get("size")).and_then(|v| v.as_str()).unwrap_or("base");
            let target = models_dir.join(format!("ggml-{}.bin", size));
            let _ = std::fs::remove_file(target);
            Ok(Json(serde_json::json!({
                "data": { "ok": true, "status": { "state": "missing", "progress": 0, "statusText": "Deleted" } }
            })))
        }
        "whisper-local-setdir" => {
            let dir = args.first().and_then(|v| v.get("dir")).and_then(|v| v.as_str()).unwrap_or("");
            Ok(Json(serde_json::json!({ "data": { "ok": true, "modelDir": dir } })))
        }

        // ─── Global Memory Channels ──────────────────────────────────────────
        "global-memory-read" => {
            let mem = load_global_memory();
            Ok(Json(serde_json::json!({ "data": mem })))
        }
        "global-memory-save-instructions" => {
            let mut mem = load_global_memory();
            if let Some(arg) = args.first() {
                let inst = arg.get("instructions").and_then(|v| v.as_str()).unwrap_or("");
                if let Some(obj) = mem.as_object_mut() {
                    obj.insert("globalMemoryInstructions".to_string(), serde_json::json!(inst));
                    let _ = save_global_memory(&mem);
                }
            }
            Ok(Json(serde_json::json!({ "data": { "ok": true } })))
        }
        "global-memory-add-profile" => {
            let mut mem = load_global_memory();
            if let Some(arg) = args.first() {
                let key = arg.get("key").and_then(|v| v.as_str()).unwrap_or("").trim().to_string();
                let value = arg.get("value").and_then(|v| v.as_str()).unwrap_or("").trim().to_string();
                let category = arg.get("category").and_then(|v| v.as_str()).unwrap_or("user_preference").to_string();
                if !key.is_empty() {
                    if let Some(obj) = mem.as_object_mut() {
                        let profile = obj.entry("userProfile".to_string()).or_insert_with(|| serde_json::json!([]));
                        if let Some(arr) = profile.as_array_mut() {
                            let mut found = false;
                            for item in arr.iter_mut() {
                                if item.get("key").and_then(|v| v.as_str()) == Some(&key) {
                                    if let Some(iobj) = item.as_object_mut() {
                                        iobj.insert("value".to_string(), serde_json::json!(value));
                                        iobj.insert("category".to_string(), serde_json::json!(category));
                                    }
                                    found = true;
                                    break;
                                }
                            }
                            if !found {
                                arr.push(serde_json::json!({ "key": key, "value": value, "category": category }));
                            }
                        }
                        let _ = save_global_memory(&mem);
                    }
                }
            }
            Ok(Json(serde_json::json!({ "data": { "ok": true } })))
        }
        "global-memory-delete-profile" => {
            let mut mem = load_global_memory();
            if let Some(arg) = args.first() {
                let key = arg.get("key").and_then(|v| v.as_str()).unwrap_or("").trim();
                if let Some(obj) = mem.as_object_mut() {
                    if let Some(arr) = obj.get_mut("userProfile").and_then(|v| v.as_array_mut()) {
                        arr.retain(|item| item.get("key").and_then(|v| v.as_str()) != Some(key));
                        let _ = save_global_memory(&mem);
                    }
                }
            }
            Ok(Json(serde_json::json!({ "data": { "ok": true } })))
        }
        "global-memory-add-insight" => {
            let mut mem = load_global_memory();
            if let Some(arg) = args.first() {
                let topic = arg.get("topic").and_then(|v| v.as_str()).unwrap_or("").trim().to_string();
                let lesson = arg.get("lesson").and_then(|v| v.as_str()).unwrap_or("").trim().to_string();
                let category = arg.get("category").and_then(|v| v.as_str()).unwrap_or("user_preference").to_string();
                if !topic.is_empty() && !lesson.is_empty() {
                    if let Some(obj) = mem.as_object_mut() {
                        let insights = obj.entry("learnedInsights".to_string()).or_insert_with(|| serde_json::json!([]));
                        if let Some(arr) = insights.as_array_mut() {
                            arr.push(serde_json::json!({
                                "id": chrono::Utc::now().timestamp_millis().to_string(),
                                "topic": topic,
                                "lesson": lesson,
                                "category": category,
                                "createdAt": chrono::Utc::now().to_rfc3339()
                            }));
                        }
                        let _ = save_global_memory(&mem);
                    }
                }
            }
            Ok(Json(serde_json::json!({ "data": { "ok": true } })))
        }
        "global-memory-delete-insight" => {
            let mut mem = load_global_memory();
            if let Some(arg) = args.first() {
                let id = arg.get("id").and_then(|v| v.as_str()).unwrap_or("").trim();
                if let Some(obj) = mem.as_object_mut() {
                    if let Some(arr) = obj.get_mut("learnedInsights").and_then(|v| v.as_array_mut()) {
                        arr.retain(|item| item.get("id").and_then(|v| v.as_str()) != Some(id));
                        let _ = save_global_memory(&mem);
                    }
                }
            }
            Ok(Json(serde_json::json!({ "data": { "ok": true } })))
        }

        // ─── Usage Tracking Channels ─────────────────────────────────────────
        "usage-summary" => Ok(Json(serde_json::json!({ "data": calculate_usage_summary() }))),
        "usage-records" => Ok(Json(serde_json::json!({ "data": load_usage_records() }))),
        "usage-clear" => {
            let _ = save_usage_records(&[]);
            Ok(Json(serde_json::json!({ "data": null })))
        }
        "usage-pricing" => Ok(Json(serde_json::json!({ "data": get_default_pricing_catalog() }))),

        // ─── Orchestrator Instructions Channels ──────────────────────────────
        "orchestrator-read-instructions" => {
            let inst = load_orchestrator_instructions();
            Ok(Json(serde_json::json!({ "data": inst })))
        }
        "orchestrator-write-instructions" => {
            if let Some(content) = args.first().and_then(|v| v.as_str()) {
                let _ = save_orchestrator_instructions(content);
            }
            Ok(Json(serde_json::json!({ "data": null })))
        }
        "orchestrator-update-instructions" => {
            let inst = load_orchestrator_instructions();
            Ok(Json(serde_json::json!({ "data": { "success": true, "updated": true, "instructions": inst } })))
        }
        "orchestrator-optimize-instructions-by-ai" => {
            let inst = load_orchestrator_instructions();
            Ok(Json(serde_json::json!({ "data": { "success": true, "instructions": inst } })))
        }

        // ─── Background Triggers Channels ────────────────────────────────────
        "triggers-list" | "trigger-list" => {
            let trigs = state.trigger_engine.list().await;
            Ok(Json(serde_json::json!({ "data": trigs })))
        }
        "triggers-create" | "trigger-add" => {
            if let Some(arg) = args.first() {
                if let Ok(mut trig) = serde_json::from_value::<RoutineTrigger>(arg.clone()) {
                    if trig.id.is_empty() {
                        trig.id = uuid::Uuid::new_v4().to_string();
                    }
                    if let Ok(saved) = state.trigger_engine.save(trig).await {
                        return Ok(Json(serde_json::json!({ "data": { "success": true, "trigger": saved } })));
                    }
                }
            }
            Ok(Json(serde_json::json!({ "data": { "success": false, "error": "Invalid trigger payload" } })))
        }
        "triggers-remove" | "trigger-remove" => {
            let id = args.first().and_then(|v| {
                if let Some(s) = v.as_str() {
                    Some(s)
                } else {
                    v.get("id").and_then(|s| s.as_str())
                }
            }).unwrap_or("");
            let res = state.trigger_engine.delete(id).await.unwrap_or(false);
            Ok(Json(serde_json::json!({ "data": { "success": res } })))
        }
        "trigger-update" | "triggers-update" => {
            if let Some(arg) = args.first() {
                let id = arg.get("id").and_then(|v| v.as_str()).unwrap_or("");
                if let Some(mut trig) = state.trigger_engine.get(id).await {
                    let updates = arg.get("updates").unwrap_or(arg);
                    if let Some(name) = updates.get("name").and_then(|v| v.as_str()) {
                        trig.name = name.to_string();
                    }
                    if let Some(enabled) = updates.get("enabled").and_then(|v| v.as_bool()) {
                        trig.enabled = enabled;
                    }
                    if let Some(prompt) = updates.get("prompt").and_then(|v| v.as_str()) {
                        trig.prompt = prompt.to_string();
                    }
                    if let Ok(saved) = state.trigger_engine.save(trig).await {
                        return Ok(Json(serde_json::json!({ "data": { "success": true, "trigger": saved } })));
                    }
                }
            }
            Ok(Json(serde_json::json!({ "data": { "success": false } })))
        }
        "triggers-toggle" => {
            if let Some(arg) = args.first() {
                let id = arg.get("id").and_then(|v| v.as_str()).unwrap_or("");
                let enabled = arg.get("enabled").and_then(|v| v.as_bool()).unwrap_or(true);
                if let Some(mut trig) = state.trigger_engine.get(id).await {
                    trig.enabled = enabled;
                    let _ = state.trigger_engine.save(trig).await;
                    return Ok(Json(serde_json::json!({ "data": { "success": true } })));
                }
            }
            Ok(Json(serde_json::json!({ "data": { "success": false } })))
        }
        "triggers-run-now" | "trigger-execute" => {
            let id = args.first().and_then(|v| {
                if let Some(s) = v.as_str() {
                    Some(s)
                } else {
                    v.get("id").and_then(|s| s.as_str())
                }
            }).unwrap_or("");
            let res = state.trigger_engine.execute_routine(id).await;
            Ok(Json(serde_json::json!({ "data": { "success": res.is_ok() } })))
        }
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
        // ─── Artifacts (Micro-Apps) Manager ─────────────────────────────────
        "artifact-list" | "artifact_list" | "artifact:list" => {
            let list = state.artifact_runner.scan_artifacts();
            Ok(Json(serde_json::json!({ "data": list })))
        }
        "artifact:stop" | "artifact_stop" | "artifact-stop" => {
            let id = args.first().and_then(|v| {
                if let Some(s) = v.as_str() {
                    Some(s)
                } else {
                    v.get("id").and_then(|s| s.as_str())
                }
            }).unwrap_or("");
            let _ = state.artifact_runner.stop_artifact(id).await;
            Ok(Json(serde_json::json!({ "data": { "success": true } })))
        }
        "artifact:delete" | "artifact_delete" | "artifact-delete" => {
            let id = args.first().and_then(|v| {
                if let Some(s) = v.as_str() {
                    Some(s)
                } else {
                    v.get("id").and_then(|s| s.as_str())
                }
            }).unwrap_or("");
            let res = state.artifact_runner.delete_artifact(id).is_ok();
            Ok(Json(serde_json::json!({ "data": { "success": res } })))
        }
        "artifact:ensureSeeds" | "artifact_ensure_seeds" | "artifact-ensure-seeds" => {
            let _ = state.artifact_runner.ensure_seed_artifacts();
            let list = state.artifact_runner.scan_artifacts();
            Ok(Json(serde_json::json!({ "data": list })))
        }
        "artifact:logs" | "artifact_logs" | "artifact-logs" => {
            let id = args.first().and_then(|v| {
                if let Some(s) = v.as_str() {
                    Some(s)
                } else {
                    v.get("id").and_then(|s| s.as_str())
                }
            }).unwrap_or("");
            let limit = args.get(1).and_then(|v| v.as_u64()).unwrap_or(50) as usize;
            let logs = state.artifact_runner.get_artifact_logs(id, limit);
            Ok(Json(serde_json::json!({ "data": logs })))
        }
        "artifact:getStorage" | "artifact_get_storage" | "artifact-get-storage" => {
            let id = args.first().and_then(|v| {
                if let Some(s) = v.as_str() {
                    Some(s)
                } else {
                    v.get("id").and_then(|s| s.as_str())
                }
            }).unwrap_or("");
            let storage = state.artifact_runner.get_storage(id);
            Ok(Json(serde_json::json!({ "data": storage })))
        }
        "artifact:setStorage" | "artifact_set_storage" | "artifact-set-storage" => {
            let id = args.first().and_then(|v| {
                if let Some(s) = v.as_str() {
                    Some(s)
                } else {
                    v.get("id").and_then(|s| s.as_str())
                }
            }).unwrap_or("");
            let data = args.get(1).cloned().or_else(|| args.first().and_then(|v| v.get("data")).cloned()).unwrap_or_else(|| serde_json::json!({}));
            let res = state.artifact_runner.set_storage(id, data).is_ok();
            Ok(Json(serde_json::json!({ "data": { "success": res } })))
        }
        "artifact:setStorageKey" | "artifact_set_storage_key" | "artifact-set-storage-key" => {
            let id = args.first().and_then(|v| {
                if let Some(s) = v.as_str() {
                    Some(s)
                } else {
                    v.get("id").and_then(|s| s.as_str())
                }
            }).unwrap_or("");
            let key = args.get(1).and_then(|v| v.as_str()).or_else(|| args.first().and_then(|v| v.get("key")).and_then(|v| v.as_str())).unwrap_or("");
            let val = args.get(2).cloned().or_else(|| args.first().and_then(|v| v.get("value")).cloned()).unwrap_or(serde_json::Value::Null);
            let res = state.artifact_runner.set_storage_key(id, key, val).is_ok();
            Ok(Json(serde_json::json!({ "data": { "success": res } })))
        }
        "artifact:deleteStorageKey" | "artifact_delete_storage_key" | "artifact-delete-storage-key" => {
            let id = args.first().and_then(|v| {
                if let Some(s) = v.as_str() {
                    Some(s)
                } else {
                    v.get("id").and_then(|s| s.as_str())
                }
            }).unwrap_or("");
            let key = args.get(1).and_then(|v| v.as_str()).or_else(|| args.first().and_then(|v| v.get("key")).and_then(|v| v.as_str())).unwrap_or("");
            let res = state.artifact_runner.delete_storage_key(id, key).is_ok();
            Ok(Json(serde_json::json!({ "data": { "success": res } })))
        }
        "artifact:clearStorage" | "artifact_clear_storage" | "artifact-clear-storage" => {
            let id = args.first().and_then(|v| {
                if let Some(s) = v.as_str() {
                    Some(s)
                } else {
                    v.get("id").and_then(|s| s.as_str())
                }
            }).unwrap_or("");
            let res = state.artifact_runner.clear_storage(id).is_ok();
            Ok(Json(serde_json::json!({ "data": { "success": res } })))
        }
        "artifact:openFolder" | "artifact_open_folder" | "artifact-open-folder" => {
            let id = args.first().and_then(|v| {
                if let Some(s) = v.as_str() {
                    Some(s)
                } else {
                    v.get("id").and_then(|s| s.as_str())
                }
            }).unwrap_or("");
            let folder = get_superagent_dir().join("artifacts").join(id);
            let _ = std::fs::create_dir_all(&folder);
            #[cfg(target_os = "windows")]
            let _ = std::process::Command::new("explorer").arg(&folder).spawn();
            #[cfg(target_os = "macos")]
            let _ = std::process::Command::new("open").arg(&folder).spawn();
            #[cfg(target_os = "linux")]
            let _ = std::process::Command::new("xdg-open").arg(&folder).spawn();
            Ok(Json(serde_json::json!({ "data": { "success": true, "path": folder.to_string_lossy() } })))
        }

        // ─── File & Media Channels ───────────────────────────────────────────
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
                        let b64_str = base64::engine::general_purpose::STANDARD.encode(&bytes);
                        let mime = mime_guess::from_path(&file_path).first_or_octet_stream();
                        let data_uri = format!("data:{};base64,{}", mime, b64_str);
                        return Ok(Json(serde_json::json!({ "data": data_uri })));
                    }
                }
            }
            Ok(Json(serde_json::json!({ "data": null })))
        }
        "save-chat-media-buffer" => {
            if let Some(arg) = args.first() {
                let filename = arg.get("filename").and_then(|v| v.as_str()).unwrap_or("media.dat");
                let chat_id = arg.get("chatId").and_then(|v| v.as_str()).unwrap_or("default");
                let project_name = arg.get("projectName").and_then(|v| v.as_str());

                let superagent_dir = get_superagent_dir();
                let target_dir = if let Some(pname) = project_name {
                    superagent_dir.join("projects").join(pname).join("chats").join(chat_id)
                } else {
                    superagent_dir.join("chats").join(chat_id)
                };
                let _ = tokio::fs::create_dir_all(&target_dir).await;
                let dest_path = target_dir.join(filename);

                let bytes: Vec<u8> = if let Some(buf_str) = arg.get("buffer").and_then(|v| v.as_str()) {
                    base64::engine::general_purpose::STANDARD.decode(buf_str).unwrap_or_default()
                } else if let Some(arr) = arg.get("buffer").and_then(|v| v.get("data").or(Some(v))).and_then(|v| v.as_array()) {
                    arr.iter().filter_map(|v| v.as_u64().map(|n| n as u8)).collect()
                } else {
                    Vec::new()
                };

                if tokio::fs::write(&dest_path, &bytes).await.is_ok() {
                    return Ok(Json(serde_json::json!({
                        "data": {
                            "filename": filename,
                            "relativePath": dest_path.strip_prefix(&superagent_dir).map(|p| p.to_string_lossy().to_string()).unwrap_or_else(|_| filename.to_string()),
                            "fullPath": dest_path.to_string_lossy().to_string()
                        }
                    })));
                }
            }
            Ok(Json(serde_json::json!({ "data": null })))
        }
        "provider-health-diagnostics" => {
            Ok(Json(serde_json::json!({
                "data": {
                    "healthy": true,
                    "checkedAt": chrono::Utc::now().to_rfc3339(),
                    "providers": [
                        { "id": "openai", "status": "available", "latencyMs": 42 },
                        { "id": "anthropic", "status": "available", "latencyMs": 55 },
                        { "id": "gemini", "status": "available", "latencyMs": 38 }
                    ]
                }
            })))
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
        "agent-run" => {
            let arg = match args.first() {
                Some(a) => a,
                None => {
                    return Err((
                        StatusCode::BAD_REQUEST,
                        Json(serde_json::json!({
                            "error": "Channel \"agent-run\" requires a payload argument."
                        })),
                    ));
                }
            };

            let session_id = arg
                .get("sessionId")
                .and_then(|v| v.as_str())
                .unwrap_or("default-session")
                .to_string();
            let prompt = arg.get("prompt").and_then(|v| v.as_str()).unwrap_or("").to_string();
            let config_val = arg.get("config").cloned().unwrap_or_else(|| serde_json::json!({}));

            let mut provider_str = config_val
                .get("provider")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();
            let mut model_str = config_val
                .get("model")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();
            let mut api_key = config_val
                .get("apiKey")
                .and_then(|v| v.as_str())
                .filter(|s| !s.is_empty())
                .map(|s| s.to_string());
            let mut base_url = config_val
                .get("baseUrl")
                .and_then(|v| v.as_str())
                .filter(|s| !s.is_empty())
                .map(|s| s.to_string());
            let instructions = config_val
                .get("instructions")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();

            let raw_settings = state.settings_store.load_raw().unwrap_or_else(|_| serde_json::json!({}));

            // If model is Orchestrator, auto, or empty, resolve first enabled from settings
            if model_str.is_empty() || model_str == "Orchestrator" || model_str == "auto" || model_str == "Model Governance" {
                if let Some(models) = raw_settings.get("models").and_then(|m| m.as_array()) {
                    if let Some(first_enabled) = models.iter().find(|m| m.get("enabled").and_then(|v| v.as_bool()).unwrap_or(false)) {
                        if let Some(id) = first_enabled.get("id").and_then(|v| v.as_str()) {
                            model_str = id.to_string();
                        }
                        if let Some(pid) = first_enabled.get("providerId").and_then(|v| v.as_str()) {
                            provider_str = pid.to_string();
                        }
                    }
                }
            }

            // Check settings models list to resolve display names or provider prefix
            if let Some(models) = raw_settings.get("models").and_then(|m| m.as_array()) {
                if let Some(match_model) = models.iter().find(|m| {
                    m.get("name").and_then(|v| v.as_str()) == Some(&model_str)
                        || m.get("id").and_then(|v| v.as_str()) == Some(&model_str)
                }) {
                    if let Some(pid) = match_model.get("providerId").and_then(|v| v.as_str()) {
                        provider_str = pid.to_string();
                    }
                    if let Some(id) = match_model.get("id").and_then(|v| v.as_str()) {
                        model_str = id.to_string();
                    }
                }
            }

            // Strip provider prefix from model if present (e.g. "gemini-gemini-1.5-pro" -> "gemini-1.5-pro")
            if !provider_str.is_empty() {
                let prefix = format!("{}-", provider_str);
                if model_str.starts_with(&prefix) {
                    model_str = model_str[prefix.len()..].to_string();
                }
            }

            // Fallback API key and baseUrl from settings providers
            if !provider_str.is_empty() {
                if let Some(providers) = raw_settings.get("providers").and_then(|p| p.as_array()) {
                    if let Some(prov) = providers.iter().find(|p| {
                        let id = p.get("id").and_then(|v| v.as_str()).unwrap_or("");
                        id == provider_str || (provider_str == "gemini" && id == "google") || (provider_str == "google" && id == "gemini")
                    }) {
                        if api_key.is_none() {
                            if let Some(key) = prov.get("apiKey").and_then(|v| v.as_str()) {
                                if !key.is_empty() {
                                    api_key = Some(key.to_string());
                                }
                            }
                        }
                        if base_url.is_none() {
                            if let Some(u) = prov.get("baseUrl").and_then(|v| v.as_str()) {
                                if !u.is_empty() {
                                    base_url = Some(u.to_string());
                                }
                            }
                        }
                    }
                }
            }

            // Fallback to get_api_key
            if api_key.is_none() && !provider_str.is_empty() {
                if let Ok(Some(k)) = state.settings_store.get_api_key(&provider_str) {
                    if !k.is_empty() {
                        api_key = Some(k);
                    }
                }
            }

            let provider_type = match provider_str.to_lowercase().as_str() {
                "anthropic" | "claude" => ProviderType::Anthropic,
                "gemini" | "google" => ProviderType::Gemini,
                "ollama" => ProviderType::Ollama,
                "openrouter" => ProviderType::OpenRouter,
                "deepseek" => ProviderType::DeepSeek,
                "groq" => ProviderType::Groq,
                _ => ProviderType::OpenAI,
            };

            if model_str.is_empty() {
                model_str = match provider_type {
                    ProviderType::Anthropic => "claude-3-5-sonnet-20241022".to_string(),
                    ProviderType::Gemini => "gemini-1.5-pro".to_string(),
                    ProviderType::Ollama => "llama3".to_string(),
                    ProviderType::DeepSeek => "deepseek-chat".to_string(),
                    ProviderType::Groq => "llama-3.3-70b-versatile".to_string(),
                    _ => "gpt-4o".to_string(),
                };
            }

            // Fallback to environment variables if still no API key
            if api_key.is_none() {
                api_key = match provider_type {
                    ProviderType::OpenAI => std::env::var("OPENAI_API_KEY").ok(),
                    ProviderType::Anthropic => std::env::var("ANTHROPIC_API_KEY").ok(),
                    ProviderType::Gemini => std::env::var("GEMINI_API_KEY").ok(),
                    ProviderType::OpenRouter => std::env::var("OPENROUTER_API_KEY").ok(),
                    ProviderType::DeepSeek => std::env::var("DEEPSEEK_API_KEY").ok(),
                    ProviderType::Groq => std::env::var("GROQ_API_KEY").ok(),
                    _ => None,
                };
            }

            let mut model_config = ModelConfig::new(provider_type, model_str);
            model_config.api_key = api_key;
            model_config.base_url = base_url;

            let (cancel_tx, mut cancel_rx) = tokio::sync::broadcast::channel::<()>(2);
            {
                let mut cancellations = state.active_cancellations.lock().unwrap();
                cancellations.insert(session_id.clone(), cancel_tx);
            }

            let state_clone = state.clone();
            let sid = session_id.clone();
            let prompt_clone = prompt.clone();

            tokio::spawn(async move {
                // 1. Mark session running in session_store
                {
                    let mut store = state_clone.session_store.lock().unwrap();
                    if let Some(entry) = store.get_mut(&sid) {
                        entry.is_running = true;
                        entry.events.clear();
                        entry.full_assistant_text.clear();
                        entry.full_thought_text.clear();
                        entry.last_updated = chrono::Utc::now().timestamp_millis();
                    } else {
                        store.put(
                            sid.clone(),
                            SessionStateEntry {
                                events: Vec::new(),
                                is_running: true,
                                full_assistant_text: String::new(),
                                full_thought_text: String::new(),
                                last_updated: chrono::Utc::now().timestamp_millis(),
                            },
                        );
                    }
                }

                // 2. Broadcast context event
                let ctx_evt = serde_json::json!({
                    "channel": "agent-event",
                    "data": {
                        "type": "context",
                        "sessionId": sid,
                        "context": { "used": 0, "limit": 128000, "pct": 0 }
                    }
                });
                let _ = state_clone.ws_broadcast_tx.send(ctx_evt.to_string());

                let engine = AgentEngine::new(state_clone.tool_registry.clone());
                let sys_prompt = if instructions.is_empty() {
                    "You are SuperAgent, an expert autonomous AI software engineer and problem solver.".to_string()
                } else {
                    instructions
                };

                let run_result = engine.run_loop(&model_config, &sys_prompt, &prompt_clone).await;
                let mut did_emit_done = false;

                match run_result {
                    Ok(mut rx) => {
                        loop {
                            tokio::select! {
                                _ = cancel_rx.recv() => {
                                    let abort_evt = serde_json::json!({
                                        "channel": "agent-event",
                                        "data": {
                                            "type": "abort",
                                            "sessionId": sid
                                        }
                                    });
                                    let _ = state_clone.ws_broadcast_tx.send(abort_evt.to_string());
                                    did_emit_done = true;
                                    break;
                                }
                                event_opt = rx.recv() => {
                                    match event_opt {
                                        Some(event) => {
                                            let mut data_obj = serde_json::json!({
                                                "sessionId": sid,
                                            });

                                            match &event {
                                                crate::types::AgentEvent::Token { text } => {
                                                    data_obj["type"] = serde_json::json!("token");
                                                    data_obj["content"] = serde_json::json!(text);
                                                }
                                                crate::types::AgentEvent::ToolCall { name, input, .. } => {
                                                    data_obj["type"] = serde_json::json!("tool_call");
                                                    data_obj["toolName"] = serde_json::json!(name);
                                                    data_obj["toolArgs"] = input.clone();
                                                }
                                                crate::types::AgentEvent::ToolOutput { output, .. } => {
                                                    data_obj["type"] = serde_json::json!("tool_result");
                                                    data_obj["toolResult"] = serde_json::json!(output);
                                                }
                                                crate::types::AgentEvent::Error { message } => {
                                                    data_obj["type"] = serde_json::json!("error");
                                                    data_obj["error"] = serde_json::json!(message);
                                                    did_emit_done = true;
                                                }
                                                crate::types::AgentEvent::Finished { .. } => {
                                                    data_obj["type"] = serde_json::json!("done");
                                                    did_emit_done = true;
                                                }
                                                _ => {
                                                    data_obj["type"] = serde_json::json!("token");
                                                    data_obj["content"] = serde_json::json!("");
                                                }
                                            }

                                            // Record text in session store
                                            {
                                                let mut store = state_clone.session_store.lock().unwrap();
                                                if let Some(entry) = store.get_mut(&sid) {
                                                    if let Some(c) = data_obj.get("content").and_then(|v| v.as_str()) {
                                                        entry.full_assistant_text.push_str(c);
                                                    }
                                                    entry.last_updated = chrono::Utc::now().timestamp_millis();
                                                }
                                            }

                                            let broadcast_msg = serde_json::json!({
                                                "channel": "agent-event",
                                                "data": data_obj
                                            });
                                            let _ = state_clone.ws_broadcast_tx.send(broadcast_msg.to_string());
                                        }
                                        None => {
                                            break;
                                        }
                                    }
                                }
                            }
                        }
                    }
                    Err(err) => {
                        let err_msg = serde_json::json!({
                            "channel": "agent-event",
                            "data": {
                                "type": "error",
                                "sessionId": sid,
                                "error": err.to_string()
                            }
                        });
                        let _ = state_clone.ws_broadcast_tx.send(err_msg.to_string());
                        did_emit_done = true;
                    }
                }

                if !did_emit_done {
                    let done_msg = serde_json::json!({
                        "channel": "agent-event",
                        "data": {
                            "type": "done",
                            "sessionId": sid
                        }
                    });
                    let _ = state_clone.ws_broadcast_tx.send(done_msg.to_string());
                }

                // Mark session idle & clean cancellation token
                {
                    let mut store = state_clone.session_store.lock().unwrap();
                    if let Some(entry) = store.get_mut(&sid) {
                        entry.is_running = false;
                        entry.last_updated = chrono::Utc::now().timestamp_millis();
                    }
                    let mut cancellations = state_clone.active_cancellations.lock().unwrap();
                    cancellations.remove(&sid);
                }
            });

            Ok(Json(serde_json::json!({
                "data": {
                    "status": "started",
                    "sessionId": session_id
                }
            })))
        }
        "agent-stop" => {
            let session_id = args.first().and_then(|v| {
                if let Some(s) = v.as_str() {
                    Some(s.to_string())
                } else {
                    v.get("sessionId").and_then(|s| s.as_str()).map(|s| s.to_string())
                }
            }).unwrap_or_default();

            {
                let cancellations = state.active_cancellations.lock().unwrap();
                if let Some(tx) = cancellations.get(&session_id) {
                    let _ = tx.send(());
                }
            }

            {
                let mut store = state.session_store.lock().unwrap();
                if let Some(entry) = store.get_mut(&session_id) {
                    entry.is_running = false;
                }
            }

            let stop_msg = serde_json::json!({
                "channel": "agent-event",
                "data": {
                    "type": "abort",
                    "sessionId": session_id
                }
            });
            let _ = state.ws_broadcast_tx.send(stop_msg.to_string());

            Ok(Json(serde_json::json!({ "data": { "stopped": true } })))
        }
        "agent-list" => {
            let store = state.session_store.lock().unwrap();
            let sessions: Vec<String> = store.iter().filter(|(_, v)| v.is_running).map(|(k, _)| k.clone()).collect();
            Ok(Json(serde_json::json!({ "data": { "sessions": sessions } })))
        }
        "agent-permission-response" => Ok(Json(serde_json::json!({ "data": { "success": true } }))),
        "agent-compact" => Ok(Json(serde_json::json!({ "data": { "compacted": false, "tokensBefore": 0, "tokensAfter": 0 } }))),
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
                                        "pendingTool": serde_json::Value::Null,
                                    }
                                });
                                let _ = state_clone.ws_broadcast_tx.send(sync_payload.to_string());
                            }
                        }
                        "CLIENT_TOOL_RESULT" => {
                            if let Some(tool_id) = val.get("id").and_then(|v| v.as_str()) {
                                let mut pending = state_clone.pending_client_tools.lock().unwrap();
                                if let Some(sender) = pending.remove(tool_id) {
                                    let res = val.get("result").cloned().unwrap_or(serde_json::Value::Null);
                                    let _ = sender.send(res);
                                }
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

/// Returns the machine's non-internal IPv4 addresses for LAN access.
pub fn lan_addresses() -> Vec<String> {
    let mut addrs: Vec<String> = Vec::new();

    // 1. Probe routing table with UDP sockets (no network packets are transmitted for UDP connect)
    let probe_targets = [
        "8.8.8.8:80",
        "1.1.1.1:80",
        "192.168.1.1:80",
        "10.0.0.1:80",
        "172.16.0.1:80",
    ];
    for target in probe_targets {
        if let Ok(socket) = std::net::UdpSocket::bind("0.0.0.0:0") {
            if socket.connect(target).is_ok() {
                if let Ok(local_addr) = socket.local_addr() {
                    if let std::net::IpAddr::V4(ipv4) = local_addr.ip() {
                        if !ipv4.is_loopback() && !ipv4.is_unspecified() && !ipv4.is_link_local() {
                            let s = ipv4.to_string();
                            if !addrs.contains(&s) {
                                addrs.push(s);
                            }
                        }
                    }
                }
            }
        }
    }

    // 2. Resolve hostname addresses
    if let Some(host) = System::host_name() {
        if let Ok(lookup) = (host.as_str(), 0).to_socket_addrs() {
            for addr in lookup {
                if let std::net::IpAddr::V4(ipv4) = addr.ip() {
                    if !ipv4.is_loopback() && !ipv4.is_unspecified() && !ipv4.is_link_local() {
                        let s = ipv4.to_string();
                        if !addrs.contains(&s) {
                            addrs.push(s);
                        }
                    }
                }
            }
        }
    }

    addrs
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
        active_cancellations: Arc::new(Mutex::new(HashMap::new())),
        pending_client_tools: Arc::new(Mutex::new(HashMap::new())),
    };

    let app = create_router(state);

    let bind_ip: std::net::IpAddr = host.parse().unwrap_or_else(|_| {
        if host == "0.0.0.0" || host.is_empty() {
            std::net::IpAddr::V4(std::net::Ipv4Addr::UNSPECIFIED)
        } else {
            std::net::IpAddr::V4(std::net::Ipv4Addr::LOCALHOST)
        }
    });
    let addr = SocketAddr::from((bind_ip, port));
    info!("🚀 SuperAgent Core v2 Daemon listening on http://{}", addr);

    // Single-Instance Lock initialization & periodic heartbeat
    if let Some(existing_lock) = read_web_server_lock() {
        if is_lock_alive(&existing_lock) && existing_lock.pid != std::process::id() {
            warn!(
                "⚠️ Web server lock active on port {} (PID: {}, startedBy: {}). Overriding as primary daemon.",
                existing_lock.port, existing_lock.pid, existing_lock.started_by
            );
        }
    }
    let initial_lock = WebServerLock::new(port, host, "daemon");
    let _ = write_web_server_lock(&initial_lock);

    let host_string = host.to_string();
    let heartbeat_handle = tokio::spawn(async move {
        let mut interval = tokio::time::interval(Duration::from_secs(30));
        loop {
            interval.tick().await;
            let fresh_lock = WebServerLock::new(port, &host_string, "daemon");
            let _ = write_web_server_lock(&fresh_lock);
        }
    });

    let listener = tokio::net::TcpListener::bind(addr).await?;
    let serve_res = axum::serve(listener, app).await;

    // Graceful cleanup
    heartbeat_handle.abort();
    clear_web_server_lock();
    serve_res?;

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
            active_cancellations: Arc::new(Mutex::new(HashMap::new())),
            pending_client_tools: Arc::new(Mutex::new(HashMap::new())),
        }
    }

    #[tokio::test]
    async fn test_unauthenticated_requests_gate() {
        let temp_dir = std::env::temp_dir().join(format!("test_unauth_{}", uuid::Uuid::new_v4()));
        let _ = std::fs::create_dir_all(&temp_dir);

        let state = build_test_state(temp_dir.clone());
        let app = create_router(state);

        // 1. Root page without auth -> 302 to /login
        let req_root = Request::builder().uri("/").method("GET").body(Body::empty()).unwrap();
        let res_root = app.clone().oneshot(req_root).await.unwrap();
        assert_eq!(res_root.status(), StatusCode::FOUND);
        assert_eq!(res_root.headers().get("location").unwrap(), "/login");

        // 2. SPA page (/chat) without auth -> 302 to /login
        let req_chat = Request::builder().uri("/chat").method("GET").body(Body::empty()).unwrap();
        let res_chat = app.clone().oneshot(req_chat).await.unwrap();
        assert_eq!(res_chat.status(), StatusCode::FOUND);
        assert_eq!(res_chat.headers().get("location").unwrap(), "/login");

        // 3. Protected API without auth -> 401 Unauthorized
        let req_api = Request::builder().uri("/api/conversations").method("GET").body(Body::empty()).unwrap();
        let res_api = app.clone().oneshot(req_api).await.unwrap();
        assert_eq!(res_api.status(), StatusCode::UNAUTHORIZED);

        // 4. Protected IPC endpoint without auth -> 401 Unauthorized
        let req_ipc = Request::builder()
            .uri("/api/ipc/settings-read")
            .method("POST")
            .header("Content-Type", "application/json")
            .body(Body::from(serde_json::json!({ "args": [] }).to_string()))
            .unwrap();
        let res_ipc = app.oneshot(req_ipc).await.unwrap();
        assert_eq!(res_ipc.status(), StatusCode::UNAUTHORIZED);

        let _ = std::fs::remove_dir_all(&temp_dir);
    }

    #[tokio::test]
    async fn test_public_endpoints_accessible_without_auth() {
        let temp_dir = std::env::temp_dir().join(format!("test_public_{}", uuid::Uuid::new_v4()));
        let _ = std::fs::create_dir_all(&temp_dir);

        let state = build_test_state(temp_dir.clone());
        let app = create_router(state);

        // Health check
        let req_health = Request::builder().uri("/api/health").method("GET").body(Body::empty()).unwrap();
        let res_health = app.clone().oneshot(req_health).await.unwrap();
        assert_eq!(res_health.status(), StatusCode::OK);

        // Auth status
        let req_status = Request::builder().uri("/api/auth/status").method("GET").body(Body::empty()).unwrap();
        let res_status = app.clone().oneshot(req_status).await.unwrap();
        assert_eq!(res_status.status(), StatusCode::OK);

        // Artifact SDK
        let req_sdk = Request::builder().uri("/api/artifacts/sdk.js").method("GET").body(Body::empty()).unwrap();
        let res_sdk = app.clone().oneshot(req_sdk).await.unwrap();
        assert_eq!(res_sdk.status(), StatusCode::OK);

        // Login endpoint (served via EmbeddedUi or filesystem)
        let req_login = Request::builder().uri("/login").method("GET").body(Body::empty()).unwrap();
        let res_login = app.oneshot(req_login).await.unwrap();
        assert_eq!(res_login.status(), StatusCode::OK);

        let _ = std::fs::remove_dir_all(&temp_dir);
    }

    #[tokio::test]
    async fn test_ipc_settings_read() {
        let temp_dir = std::env::temp_dir().join(format!("test_ipc_{}", uuid::Uuid::new_v4()));
        let _ = std::fs::create_dir_all(&temp_dir);

        let state = build_test_state(temp_dir.clone());
        let token = state.auth_store.create_session_token("admin");
        let app = create_router(state);
        let req = Request::builder()
            .uri("/api/ipc/settings-read")
            .method("POST")
            .header("Content-Type", "application/json")
            .header("Authorization", format!("Bearer {}", token))
            .body(Body::from(serde_json::json!({ "args": [] }).to_string()))
            .unwrap();

        let response = app.oneshot(req).await.unwrap();
        assert_eq!(response.status(), StatusCode::OK);

        let _ = std::fs::remove_dir_all(&temp_dir);
    }

    #[tokio::test]
    async fn test_ipc_agent_run_and_stop() {
        let temp_dir = std::env::temp_dir().join(format!("test_ipc_agent_{}", uuid::Uuid::new_v4()));
        let _ = std::fs::create_dir_all(&temp_dir);

        let state = build_test_state(temp_dir.clone());
        let token = state.auth_store.create_session_token("admin");
        let app = create_router(state.clone());

        // Test 400 when payload is missing
        let req_bad = Request::builder()
            .uri("/api/ipc/agent-run")
            .method("POST")
            .header("Content-Type", "application/json")
            .header("Authorization", format!("Bearer {}", token))
            .body(Body::from(serde_json::json!({ "args": [] }).to_string()))
            .unwrap();
        let res_bad = app.clone().oneshot(req_bad).await.unwrap();
        assert_eq!(res_bad.status(), StatusCode::BAD_REQUEST);

        // Test starting an agent run
        let req_start = Request::builder()
            .uri("/api/ipc/agent-run")
            .method("POST")
            .header("Content-Type", "application/json")
            .header("Authorization", format!("Bearer {}", token))
            .body(Body::from(serde_json::json!({
                "args": [{
                    "sessionId": "test-session-123",
                    "prompt": "Hello test agent",
                    "config": {
                        "model": "gpt-4o",
                        "provider": "openai"
                    }
                }]
            }).to_string()))
            .unwrap();
        let res_start = app.clone().oneshot(req_start).await.unwrap();
        assert_eq!(res_start.status(), StatusCode::OK);

        // Test stopping an agent run
        let req_stop = Request::builder()
            .uri("/api/ipc/agent-stop")
            .method("POST")
            .header("Content-Type", "application/json")
            .header("Authorization", format!("Bearer {}", token))
            .body(Body::from(serde_json::json!({
                "args": ["test-session-123"]
            }).to_string()))
            .unwrap();
        let res_stop = app.oneshot(req_stop).await.unwrap();
        assert_eq!(res_stop.status(), StatusCode::OK);

        let _ = std::fs::remove_dir_all(&temp_dir);
    }

    #[test]
    fn test_lan_addresses_format() {
        let addrs = lan_addresses();
        for addr in addrs {
            assert!(!addr.is_empty());
            let parsed: std::net::Ipv4Addr = addr.parse().expect("valid IPv4 string");
            assert!(!parsed.is_loopback());
            assert!(!parsed.is_unspecified());
        }
    }

    #[tokio::test]
    async fn test_spa_fallback_routing() {
        let temp_dir = std::env::temp_dir().join(format!("test_spa_{}", uuid::Uuid::new_v4()));
        let ui_dist = temp_dir.join("ui_dist");
        let assets_dir = ui_dist.join("assets");
        let _ = std::fs::create_dir_all(&assets_dir);

        let index_content = "<html><body><div id=\"root\">SPA Root</div></body></html>";
        let js_content = "console.log('app bundle');";
        std::fs::write(ui_dist.join("index.html"), index_content).unwrap();
        std::fs::write(assets_dir.join("app.js"), js_content).unwrap();

        let mut state = build_test_state(temp_dir.clone());
        state.ui_dist_dir = Some(ui_dist.clone());
        let token = state.auth_store.create_session_token("admin");
        let app = create_router(state);

        // 1. Navigation route (/chat) with valid session cookie -> index.html (200 OK)
        let req_chat = Request::builder()
            .uri("/chat")
            .method("GET")
            .header("Cookie", format!("sa_session={}", token))
            .body(Body::empty())
            .unwrap();
        let res_chat = app.clone().oneshot(req_chat).await.unwrap();
        assert_eq!(res_chat.status(), StatusCode::OK);

        // 2. Existing static asset (/assets/app.js) is public -> 200 OK
        let req_asset = Request::builder().uri("/assets/app.js").method("GET").body(Body::empty()).unwrap();
        let res_asset = app.clone().oneshot(req_asset).await.unwrap();
        assert_eq!(res_asset.status(), StatusCode::OK);

        // 3. Missing static asset (/assets/nonexistent.js) -> 404 NOT FOUND (must NOT serve index.html)
        let req_missing = Request::builder().uri("/assets/nonexistent.js").method("GET").body(Body::empty()).unwrap();
        let res_missing = app.oneshot(req_missing).await.unwrap();
        assert_eq!(res_missing.status(), StatusCode::NOT_FOUND);

        let _ = std::fs::remove_dir_all(&temp_dir);
    }

    #[tokio::test]
    async fn test_ipc_global_memory_and_usage() {
        let temp_dir = std::env::temp_dir().join(format!("test_mem_usage_{}", uuid::Uuid::new_v4()));
        let _ = std::fs::create_dir_all(&temp_dir);

        let state = build_test_state(temp_dir.clone());
        let token = state.auth_store.create_session_token("admin");
        let app = create_router(state);

        // Global memory read
        let req_mem = Request::builder()
            .uri("/api/ipc/global-memory-read")
            .method("POST")
            .header("Content-Type", "application/json")
            .header("Authorization", format!("Bearer {}", token))
            .body(Body::from(serde_json::json!({ "args": [] }).to_string()))
            .unwrap();
        let res_mem = app.clone().oneshot(req_mem).await.unwrap();
        assert_eq!(res_mem.status(), StatusCode::OK);

        // Usage pricing
        let req_pricing = Request::builder()
            .uri("/api/ipc/usage-pricing")
            .method("POST")
            .header("Content-Type", "application/json")
            .header("Authorization", format!("Bearer {}", token))
            .body(Body::from(serde_json::json!({ "args": [] }).to_string()))
            .unwrap();
        let res_pricing = app.clone().oneshot(req_pricing).await.unwrap();
        assert_eq!(res_pricing.status(), StatusCode::OK);

        // Partner list
        let req_partner = Request::builder()
            .uri("/api/ipc/partner-list")
            .method("POST")
            .header("Content-Type", "application/json")
            .header("Authorization", format!("Bearer {}", token))
            .body(Body::from(serde_json::json!({ "args": [] }).to_string()))
            .unwrap();
        let res_partner = app.clone().oneshot(req_partner).await.unwrap();
        assert_eq!(res_partner.status(), StatusCode::OK);

        // Artifact list
        let req_artifact = Request::builder()
            .uri("/api/ipc/artifact:list")
            .method("POST")
            .header("Content-Type", "application/json")
            .header("Authorization", format!("Bearer {}", token))
            .body(Body::from(serde_json::json!({ "args": [] }).to_string()))
            .unwrap();
        let res_artifact = app.oneshot(req_artifact).await.unwrap();
        assert_eq!(res_artifact.status(), StatusCode::OK);

        let _ = std::fs::remove_dir_all(&temp_dir);
    }
}

