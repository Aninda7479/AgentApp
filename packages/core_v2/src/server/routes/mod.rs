pub mod artifacts;
pub mod chat;
pub mod conversations;
pub mod images;
pub mod pcb;
pub mod routines;
pub mod system;
pub mod videos;

pub use artifacts::*;
pub use chat::*;
pub use conversations::*;
pub use images::*;
pub use pcb::*;
pub use routines::*;
pub use system::*;
pub use videos::*;


use axum::{
    extract::DefaultBodyLimit,
    http::{header, Method},
    middleware,
    routing::{delete, get, post},
    Router,
};
use tower_http::cors::{AllowOrigin, CorsLayer};

use crate::server::auth::{
    auth_middleware, change_auth_password, delete_auth_device, get_auth_devices,
    get_auth_history, get_auth_status, login_auth, logout_auth, serve_login, setup_auth,
    verify_auth_token,
};
use crate::server::ipc::handle_ipc;
use crate::server::spa::spa_fallback_handler;
use crate::server::state::AppState;
use crate::server::ws::handle_agent_ws;

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
        .route(
            "/api/pcb/projects",
            get(list_pcb_projects).post(save_pcb_project),
        )
        .route(
            "/api/pcb/projects/:id",
            get(get_pcb_project).delete(delete_pcb_project),
        )
        .route("/api/images/engine/status", get(get_engine_status))
        .route("/api/images/engine/install", post(install_engine))
        .route("/api/images/engine/update", post(update_engine))
        .route("/api/images/engine/rollback", post(rollback_engine))
        .route("/api/images/engine", delete(uninstall_engine))
        .route("/api/images/engine/check-update", get(check_engine_update))
        .route("/api/images/hardware", get(get_hardware_profile))
        .route("/api/images/models", get(list_image_models))
        .route("/api/images/models/pull", post(pull_image_model))
        .route("/api/images/models/open-dir", post(open_models_dir))
        .route("/api/images/models/:id", delete(delete_image_model))
        .route("/api/images/generate", post(generate_image))
        .route("/api/images/generate/stream", post(generate_image_stream))
        .route("/api/images/generations", get(list_generations))
        .route(
            "/api/images/generations/:id",
            get(get_generation).delete(delete_generation),
        )
        .route("/api/images/generations/:id/file", get(get_generation_file))
        .route("/api/videos/engine/status", get(get_video_engine_status))
        .route("/api/videos/engine/install", post(install_video_engine))
        .route("/api/videos/engine/update", post(update_video_engine))
        .route("/api/videos/engine/rollback", post(rollback_video_engine))
        .route("/api/videos/engine", delete(uninstall_video_engine))
        .route("/api/videos/engine/check-update", get(check_video_engine_update))
        .route("/api/videos/hardware", get(get_video_hardware_profile))
        .route("/api/videos/models", get(list_video_models))
        .route("/api/videos/models/pull", post(pull_video_model))
        .route("/api/videos/models/open-dir", post(open_video_models_dir))
        .route("/api/videos/models/:id", delete(delete_video_model))
        .route("/api/videos/generate", post(generate_video))
        .route("/api/videos/generate/stream", post(generate_video_stream))
        .route("/api/videos/generations", get(list_video_generations))
        .route(
            "/api/videos/generations/:id",
            get(get_video_generation).delete(delete_video_generation),
        )
        .route("/api/videos/generations/:id/file", get(get_video_file))
        .route("/api/videos/generations/:id/thumbnail", get(get_video_thumbnail))
        .route("/api/videos/generations/:id/export", post(export_video_route))
        .route("/api/videos/prompt/enhance", post(enhance_video_prompt))
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
        .route("/api/triggers/webhook/:token", post(handle_webhook_route))
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
