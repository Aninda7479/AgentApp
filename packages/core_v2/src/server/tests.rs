use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Arc;
use parking_lot::Mutex;

use axum::body::Body;
use axum::http::{Request, StatusCode};
use tower::ServiceExt;

use crate::artifact::ArtifactRunner;
use crate::automation::{SkillSynthesizer, TraceRecorder, TriggerEngine};
use crate::orchestrator::{Coordinator, PipelineExecutor, SubagentRunner};
use crate::roster::PersonaStore;
use crate::server::ipc::lan_addresses;
use crate::server::routes::create_router;
use crate::server::state::AppState;
use crate::storage::{
    auth::AuthStore,
    chat_storage::ChatStorage,
    pcb_storage::PcbStorage,
    settings::SettingsStore,
};
use crate::tools::ToolRegistry;

fn build_test_state(temp_dir: PathBuf) -> AppState {
    let settings_store = Arc::new(SettingsStore::with_path(temp_dir.join("settings.json")));
    let auth_store = Arc::new(AuthStore::new(temp_dir.join("auth")));
    let chat_storage = Arc::new(ChatStorage::with_dir(temp_dir.join("chats")));
    let pcb_storage = Arc::new(PcbStorage::with_dir(temp_dir.join("pcb")));
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
        workspace_root: temp_dir.clone(),
        ui_dist_dir: None,
        settings_store,
        auth_store,
        chat_storage,
        pcb_storage,
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
        image_workspace: Arc::new(crate::image_workspace::ImageWorkspaceManager::with_dirs(
            temp_dir.join("engines"),
            temp_dir.join("models"),
            temp_dir.join("images"),
        )),
        video_workspace: Arc::new(crate::video_workspace::VideoWorkspaceManager::with_dirs(
            temp_dir.join("video_engines"),
            temp_dir.join("video_models"),
            temp_dir.join("video_generations"),
        )),
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

#[tokio::test]
async fn test_pcb_project_endpoints() {
    let temp_dir = std::env::temp_dir().join(format!("test_pcb_{}", uuid::Uuid::new_v4()));
    let _ = std::fs::create_dir_all(&temp_dir);

    let state = build_test_state(temp_dir.clone());
    let token = state.auth_store.create_session_token("admin");
    let app = create_router(state);

    let project_payload = serde_json::json!({
        "id": "pcb-test-123",
        "name": "Solar Battery Charger",
        "revision": "v1.2",
        "description": "MPPT Solar Charger PCB",
        "created_at": 1700000000,
        "updated_at": 1700005000,
        "graph": {
            "metadata": { "name": "Solar Battery Charger", "revision": "v1.2" },
            "components": [
                { "id": "U1", "name": "BQ24650", "mpn": "BQ24650RVAR" },
                { "id": "L1", "name": "10uH Inductor", "mpn": "IHLP" }
            ],
            "nets": [
                { "id": "VBUS", "name": "VBUS" },
                { "id": "GND", "name": "GND" }
            ]
        },
        "messages": [
            { "id": "m1", "sender": "user", "text": "Design MPPT Solar Charger" },
            { "id": "m2", "sender": "agent", "text": "Synthesized circuit with BQ24650" }
        ],
        "settings": { "layerCount": 2, "copperWeight": 2 },
        "tags": ["solar", "power"]
    });

    // 1. Save PCB Project (POST /api/pcb/projects)
    let req_save = Request::builder()
        .uri("/api/pcb/projects")
        .method("POST")
        .header("Content-Type", "application/json")
        .header("Authorization", format!("Bearer {}", token))
        .body(Body::from(project_payload.to_string()))
        .unwrap();
    let res_save = app.clone().oneshot(req_save).await.unwrap();
    assert_eq!(res_save.status(), StatusCode::OK);

    // 2. List PCB Projects (GET /api/pcb/projects)
    let req_list = Request::builder()
        .uri("/api/pcb/projects")
        .method("GET")
        .header("Authorization", format!("Bearer {}", token))
        .body(Body::empty())
        .unwrap();
    let res_list = app.clone().oneshot(req_list).await.unwrap();
    assert_eq!(res_list.status(), StatusCode::OK);

    let body_bytes = axum::body::to_bytes(res_list.into_body(), usize::MAX).await.unwrap();
    let list_json: serde_json::Value = serde_json::from_slice(&body_bytes).unwrap();
    assert_eq!(list_json.as_array().unwrap().len(), 1);
    assert_eq!(list_json[0]["name"], "Solar Battery Charger");
    assert_eq!(list_json[0]["components_count"], 2);
    assert_eq!(list_json[0]["nets_count"], 2);
    assert_eq!(list_json[0]["message_count"], 2);

    // 3. Load Project (GET /api/pcb/projects/:id)
    let req_get = Request::builder()
        .uri("/api/pcb/projects/pcb-test-123")
        .method("GET")
        .header("Authorization", format!("Bearer {}", token))
        .body(Body::empty())
        .unwrap();
    let res_get = app.clone().oneshot(req_get).await.unwrap();
    assert_eq!(res_get.status(), StatusCode::OK);

    let body_bytes_get = axum::body::to_bytes(res_get.into_body(), usize::MAX).await.unwrap();
    let get_json: serde_json::Value = serde_json::from_slice(&body_bytes_get).unwrap();
    assert_eq!(get_json["name"], "Solar Battery Charger");
    assert_eq!(get_json["messages"].as_array().unwrap().len(), 2);

    // 4. Delete Project (DELETE /api/pcb/projects/:id)
    let req_del = Request::builder()
        .uri("/api/pcb/projects/pcb-test-123")
        .method("DELETE")
        .header("Authorization", format!("Bearer {}", token))
        .body(Body::empty())
        .unwrap();
    let res_del = app.clone().oneshot(req_del).await.unwrap();
    assert_eq!(res_del.status(), StatusCode::OK);

    // 5. Verify deleted (GET -> 404 NOT FOUND)
    let req_get_after = Request::builder()
        .uri("/api/pcb/projects/pcb-test-123")
        .method("GET")
        .header("Authorization", format!("Bearer {}", token))
        .body(Body::empty())
        .unwrap();
    let _res_get_after = app.oneshot(req_get_after).await.unwrap();
    let _ = std::fs::remove_dir_all(&temp_dir);
}

#[tokio::test]
async fn test_circle_search_analyze_modes() {
    let temp_dir = std::env::temp_dir().join(format!("test_circle_search_{}", uuid::Uuid::new_v4()));
    let _ = std::fs::create_dir_all(&temp_dir);

    let state = build_test_state(temp_dir.clone());
    let token = state.auth_store.create_session_token("admin");
    let app = create_router(state.clone());

    // 1. Region Selected Image Analysis (Cropped snippet)
    let region_payload = serde_json::json!({
        "prompt": "What is this button?",
        "image": "data:image/jpeg;base64,/9j/4AAQSkZJRg==",
        "mode": "explain",
        "contextMode": "region"
    });
    let req_region = Request::builder()
        .uri("/api/ipc/circle-search-analyze")
        .method("POST")
        .header("Content-Type", "application/json")
        .header("Authorization", format!("Bearer {}", token))
        .body(Body::from(serde_json::json!({ "args": [region_payload] }).to_string()))
        .unwrap();
    let res_region = app.clone().oneshot(req_region).await.unwrap();
    assert_eq!(res_region.status(), StatusCode::OK);

    // 2. Full Screen Image Analysis
    let fullscreen_payload = serde_json::json!({
        "prompt": "Summarize this screen",
        "image": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
        "mode": "summarize",
        "contextMode": "fullscreen"
    });
    let req_fullscreen = Request::builder()
        .uri("/api/ipc/circle-search-analyze")
        .method("POST")
        .header("Content-Type", "application/json")
        .header("Authorization", format!("Bearer {}", token))
        .body(Body::from(serde_json::json!({ "args": [fullscreen_payload] }).to_string()))
        .unwrap();
    let res_fullscreen = app.clone().oneshot(req_fullscreen).await.unwrap();
    assert_eq!(res_fullscreen.status(), StatusCode::OK);

    // 3. Pure Text Ask Mode (Spotlight mode - no image)
    let text_only_payload = serde_json::json!({
        "prompt": "How do I reverse a string in Rust?",
        "image": null,
        "mode": "general",
        "contextMode": "textonly"
    });
    let req_text = Request::builder()
        .uri("/api/ipc/circle-search-analyze")
        .method("POST")
        .header("Content-Type", "application/json")
        .header("Authorization", format!("Bearer {}", token))
        .body(Body::from(serde_json::json!({ "args": [text_only_payload] }).to_string()))
        .unwrap();
    let res_text = app.clone().oneshot(req_text).await.unwrap();
    assert_eq!(res_text.status(), StatusCode::OK);

    // 4. Custom Model & Provider Override (Zero Hardcoding Test)
    let custom_model_payload = serde_json::json!({
        "prompt": "Solve this equation",
        "image": "data:image/jpeg;base64,/9j/4AAQSkZJRg==",
        "provider": "gemini",
        "model": "gemini-2.5-pro",
        "mode": "code"
    });
    let req_custom = Request::builder()
        .uri("/api/ipc/circle-search-analyze")
        .method("POST")
        .header("Content-Type", "application/json")
        .header("Authorization", format!("Bearer {}", token))
        .body(Body::from(serde_json::json!({ "args": [custom_model_payload] }).to_string()))
        .unwrap();
    let res_custom = app.oneshot(req_custom).await.unwrap();
    assert_eq!(res_custom.status(), StatusCode::OK);

    let _ = std::fs::remove_dir_all(&temp_dir);
}

#[tokio::test]
async fn test_video_workspace_routes_and_storage() {
    let temp_dir = std::env::temp_dir().join(format!("test_video_ws_{}", uuid::Uuid::new_v4()));
    let _ = std::fs::create_dir_all(&temp_dir);

    let state = build_test_state(temp_dir.clone());
    let token = state.auth_store.create_session_token("admin");
    let app = create_router(state.clone());


    // 1. Get video engine status
    let req_status = Request::builder()
        .uri("/api/videos/engine/status")
        .method("GET")
        .header("Authorization", format!("Bearer {}", token))
        .body(Body::empty())
        .unwrap();
    let res_status = app.clone().oneshot(req_status).await.unwrap();
    assert_eq!(res_status.status(), StatusCode::OK);

    // 2. Get video hardware profile
    let req_hw = Request::builder()
        .uri("/api/videos/hardware")
        .method("GET")
        .header("Authorization", format!("Bearer {}", token))
        .body(Body::empty())
        .unwrap();
    let res_hw = app.clone().oneshot(req_hw).await.unwrap();
    assert_eq!(res_hw.status(), StatusCode::OK);

    // 3. List video models (catalog should return curated models like wan2.1, ltx-video, cogvideox)
    let req_models = Request::builder()
        .uri("/api/videos/models")
        .method("GET")
        .header("Authorization", format!("Bearer {}", token))
        .body(Body::empty())
        .unwrap();
    let res_models = app.clone().oneshot(req_models).await.unwrap();
    assert_eq!(res_models.status(), StatusCode::OK);

    // 4. Install video engine
    let req_install = Request::builder()
        .uri("/api/videos/engine/install")
        .method("POST")
        .header("Content-Type", "application/json")
        .header("Authorization", format!("Bearer {}", token))
        .body(Body::from(serde_json::json!({ "backend": "cpu" }).to_string()))
        .unwrap();
    let res_install = app.clone().oneshot(req_install).await.unwrap();
    assert_eq!(res_install.status(), StatusCode::OK);

    // 5. Test video storage save & list
    let record = crate::storage::video_storage::VideoGenerationRecord {
        id: "vid_test_123".to_string(),
        created_at: chrono::Utc::now().timestamp_millis(),
        prompt: "A soaring eagle over snow mountains".to_string(),
        negative_prompt: None,
        model_id: "wan2.1-t2v-1.3b".to_string(),
        source: "local".to_string(),
        width: 720,
        height: 480,
        num_frames: 49,
        fps: 16,
        duration_seconds: 3.0,
        steps: 30,
        cfg_scale: 6.0,
        seed: 42,
        motion_scale: Some(0.8),
        camera_motion: Some("PanRight".to_string()),
        sampler: None,
        generation_time_ms: 1200,
        video_filename: "vid_test_123.mp4".to_string(),
        thumbnail_filename: "vid_test_123.jpg".to_string(),
    };

    state
        .video_workspace
        .storage
        .save_generation(&record, b"FAKE_MP4_CONTENT", Some(b"FAKE_THUMB_CONTENT"))
        .unwrap();

    let req_list = Request::builder()
        .uri("/api/videos/generations")
        .method("GET")
        .header("Authorization", format!("Bearer {}", token))
        .body(Body::empty())
        .unwrap();
    let res_list = app.clone().oneshot(req_list).await.unwrap();
    assert_eq!(res_list.status(), StatusCode::OK);

    // 6. Test video file endpoint is accessible publicly (without Authorization header)
    let req_file_pub = Request::builder()
        .uri("/api/videos/generations/vid_test_123/file")
        .method("GET")
        .body(Body::empty())
        .unwrap();
    let res_file_pub = app.clone().oneshot(req_file_pub).await.unwrap();
    assert_eq!(res_file_pub.status(), StatusCode::OK);
    assert_eq!(
        res_file_pub.headers().get("content-type").unwrap(),
        "video/mp4"
    );

    // 7. Test HTTP 206 Range request on video file endpoint
    let req_range = Request::builder()
        .uri("/api/videos/generations/vid_test_123/file")
        .method("GET")
        .header("Range", "bytes=0-5")
        .body(Body::empty())
        .unwrap();
    let res_range = app.clone().oneshot(req_range).await.unwrap();
    assert_eq!(res_range.status(), StatusCode::PARTIAL_CONTENT);
    assert_eq!(
        res_range.headers().get("content-range").unwrap(),
        "bytes 0-5/16"
    );
    assert_eq!(
        res_range.headers().get("content-length").unwrap(),
        "6"
    );

    let _ = std::fs::remove_dir_all(&temp_dir);
}

#[tokio::test]
async fn test_video_engine_generation_produces_real_video() {
    let temp_dir = std::env::temp_dir().join(format!("test_video_gen_{}", uuid::Uuid::new_v4()));
    let _ = std::fs::create_dir_all(&temp_dir);

    let mp4_path = temp_dir.join("test_out.mp4");
    let thumb_path = temp_dir.join("test_out.jpg");

    let res = crate::video_workspace::VideoEngineManager::generate_placeholder_or_transcode_video(
        &mp4_path,
        &thumb_path,
        720,
        480,
        48,
        16,
        "A peaceful sheep grazing on a green field under blue sky",
    )
    .await;

    assert!(res.is_ok(), "Video generation should succeed: {:?}", res);
    assert!(mp4_path.exists(), "MP4 file must exist");
    assert!(thumb_path.exists(), "Thumbnail JPG must exist");

    let mp4_len = std::fs::metadata(&mp4_path).unwrap().len();
    let thumb_len = std::fs::metadata(&thumb_path).unwrap().len();

    // Verify it is a real video and thumbnail, not a 1KB/21-byte text stub
    assert!(
        mp4_len > 1000,
        "Generated MP4 file size should be substantial (got {} bytes)",
        mp4_len
    );
    assert!(
        thumb_len > 100,
        "Generated JPG thumbnail size should be substantial (got {} bytes)",
        thumb_len
    );

    // Verify MP4 ftyp box signature
    let header = std::fs::read(&mp4_path).unwrap();
    assert!(header.len() >= 8);
    assert_eq!(&header[4..8], b"ftyp", "Must have valid MP4 ftyp box header");

    let _ = std::fs::remove_dir_all(&temp_dir);
}



