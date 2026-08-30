pub mod auth;
pub mod ipc;
pub mod routes;
pub mod spa;
pub mod state;
pub mod ws;

#[cfg(test)]
mod tests;

pub use auth::*;
pub use ipc::*;
pub use routes::*;
pub use spa::*;
pub use state::*;
pub use ws::*;

use std::collections::HashMap;
use std::net::SocketAddr;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use std::time::Duration;

use anyhow::Result;
use tracing::{info, warn};

use crate::artifact::ArtifactRunner;
use crate::automation::{
    BrowserNavigateTool, BrowserScreenshotTool, SkillSynthesizer, TraceRecorder, TriggerEngine,
    WebSearchTool,
};
use crate::media::{GeneratePdfTool, GeneratePresentationTool};
use crate::orchestrator::{Coordinator, PipelineExecutor, SubagentRunner};
use crate::roster::PersonaStore;
use crate::storage::{
    auth::AuthStore, chat_storage::ChatStorage, lock::*, pcb_storage::PcbStorage,
    settings::{get_superagent_dir, SettingsStore},
};
use crate::tools::{builtin::*, ToolRegistry};

/// Starts the SuperAgent Core v2 Daemon server on the given host and port.
pub async fn start_server(
    port: u16,
    host: &str,
    workspace_root: PathBuf,
    custom_ui_dir: Option<PathBuf>,
) -> Result<()> {
    let superagent_dir = get_superagent_dir();
    let settings_store = Arc::new(SettingsStore::new());
    let auth_store = Arc::new(AuthStore::new(superagent_dir.clone()));
    let chat_storage = Arc::new(ChatStorage::new());
    let pcb_storage = Arc::new(PcbStorage::new());
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
    registry.register(CreateArtifactTool::new());
    registry.register(ListArtifactsTool::new());
    registry.register(ReadArtifactTool::new());

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
        pcb_storage,
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
