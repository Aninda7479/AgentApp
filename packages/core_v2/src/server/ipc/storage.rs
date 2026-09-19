use std::path::{Path, PathBuf};
use std::sync::OnceLock;
use std::time::Instant;

use axum::{http::StatusCode, Json};
use walkdir::WalkDir;

use crate::server::ipc::memory::{load_global_memory, load_orchestrator_instructions};
use crate::server::state::AppState;
use crate::storage::settings::{get_cache_dir, get_superagent_dir};
use crate::types::ContentBlock;

fn scan_cache() -> &'static std::sync::Mutex<Option<(Instant, serde_json::Value)>> {
    static CACHE: OnceLock<std::sync::Mutex<Option<(Instant, serde_json::Value)>>> = OnceLock::new();
    CACHE.get_or_init(|| std::sync::Mutex::new(None))
}

fn calculate_dir_stats(dir: &Path) -> (u64, usize, i64) {
    if !dir.exists() {
        return (0, 0, 0);
    }
    let mut total_size = 0u64;
    let mut file_count = 0usize;
    let mut latest_mod = 0i64;

    for entry in WalkDir::new(dir).into_iter().filter_map(|e| e.ok()) {
        if entry.file_type().is_file() {
            file_count += 1;
            if let Ok(meta) = entry.metadata() {
                total_size += meta.len();
                if let Ok(mod_time) = meta.modified() {
                    if let Ok(dur) = mod_time.duration_since(std::time::UNIX_EPOCH) {
                        let sec = dur.as_secs() as i64;
                        if sec > latest_mod {
                            latest_mod = sec;
                        }
                    }
                }
            }
        }
    }
    (total_size, file_count, latest_mod)
}

fn infer_file_type(ext: &str) -> &'static str {
    match ext.to_lowercase().as_str() {
        "png" | "jpg" | "jpeg" | "gif" | "webp" | "svg" | "bmp" => "image",
        "mp4" | "webm" | "mov" | "avi" | "mkv" => "video",
        "pdf" => "pdf",
        "txt" | "md" | "doc" | "docx" | "csv" | "xlsx" | "json" | "xml" | "yaml" | "yml" => {
            "document"
        }
        "mp3" | "wav" | "ogg" | "flac" | "m4a" => "audio",
        _ => "other",
    }
}

fn path_is_jailed(target: &Path, allowed_roots: &[PathBuf]) -> bool {
    // Canonicalize if possible, or check starts_with
    let target_norm = target.canonicalize().unwrap_or_else(|_| target.to_path_buf());
    for root in allowed_roots {
        let root_norm = root.canonicalize().unwrap_or_else(|_| root.to_path_buf());
        if target_norm.starts_with(&root_norm) {
            return true;
        }
    }
    false
}

pub async fn handle_storage_channel(
    ch: &str,
    state: &AppState,
    args: Vec<serde_json::Value>,
) -> Option<Result<Json<serde_json::Value>, (StatusCode, Json<serde_json::Value>)>> {
    match ch {
        "storage:scan" | "storage_scan" | "storage-scan" => {
            // Check 30s cache
            {
                if let Ok(cache_guard) = scan_cache().lock() {
                    if let Some((instant, ref val)) = *cache_guard {
                        if instant.elapsed().as_secs() < 30 {
                            return Some(Ok(Json(val.clone())));
                        }
                    }
                }
            }

            let res = tokio::task::spawn_blocking(move || {
                let superagent_dir = get_superagent_dir();
                let cache_dir = get_cache_dir();

                let mut folders = Vec::new();
                let mut total_size_bytes = 0u64;

                // 1. Conversations
                let conv_dir = superagent_dir.join("conversation");
                let (c_size, c_files, c_mod) = calculate_dir_stats(&conv_dir);
                total_size_bytes += c_size;
                folders.push(serde_json::json!({
                    "path": conv_dir.to_string_lossy(),
                    "label": "Conversations",
                    "size_bytes": c_size,
                    "file_count": c_files,
                    "last_modified": c_mod,
                }));

                // 2. Artifacts
                let art_dir = superagent_dir.join("artifacts");
                let (a_size, a_files, a_mod) = calculate_dir_stats(&art_dir);
                total_size_bytes += a_size;
                folders.push(serde_json::json!({
                    "path": art_dir.to_string_lossy(),
                    "label": "Artifacts",
                    "size_bytes": a_size,
                    "file_count": a_files,
                    "last_modified": a_mod,
                }));

                // 3. Projects
                let projects_dir = superagent_dir.join("projects");
                let (p_size, p_files, p_mod) = calculate_dir_stats(&projects_dir);
                total_size_bytes += p_size;
                folders.push(serde_json::json!({
                    "path": projects_dir.to_string_lossy(),
                    "label": "Projects",
                    "size_bytes": p_size,
                    "file_count": p_files,
                    "last_modified": p_mod,
                }));

                // Sub-projects under projects/
                if projects_dir.exists() {
                    if let Ok(entries) = std::fs::read_dir(&projects_dir) {
                        for entry in entries.flatten() {
                            let path = entry.path();
                            if path.is_dir() {
                                let name = path.file_name().and_then(|n| n.to_str()).unwrap_or("");
                                let (sub_size, sub_files, sub_mod) = calculate_dir_stats(&path);
                                folders.push(serde_json::json!({
                                    "path": path.to_string_lossy(),
                                    "label": format!("Project: {}", name),
                                    "size_bytes": sub_size,
                                    "file_count": sub_files,
                                    "last_modified": sub_mod,
                                }));
                            }
                        }
                    }
                }

                // 4. Memory (global_memory.json + orchestrator instructions)
                let mem_file = superagent_dir.join("global_memory.json");
                let inst_file = superagent_dir.join("orchestrator-instructions.md");
                let mut m_size = 0u64;
                let mut m_files = 0usize;
                let mut m_mod = 0i64;
                for f in [&mem_file, &inst_file] {
                    if f.exists() {
                        m_files += 1;
                        if let Ok(meta) = f.metadata() {
                            m_size += meta.len();
                            if let Ok(t) = meta.modified() {
                                if let Ok(dur) = t.duration_since(std::time::UNIX_EPOCH) {
                                    m_mod = m_mod.max(dur.as_secs() as i64);
                                }
                            }
                        }
                    }
                }
                total_size_bytes += m_size;
                folders.push(serde_json::json!({
                    "path": superagent_dir.to_string_lossy(),
                    "label": "Memory",
                    "size_bytes": m_size,
                    "file_count": m_files,
                    "last_modified": m_mod,
                }));

                // 5. Models (check both superagent_dir/models and cache_dir/models)
                let sa_models = superagent_dir.join("models");
                let cache_models = cache_dir.join("models");
                let (mut mod_size, mut mod_files, mut mod_last) = (0u64, 0usize, 0i64);
                let models_path = if sa_models.exists() {
                    let (s, f, l) = calculate_dir_stats(&sa_models);
                    mod_size += s;
                    mod_files += f;
                    mod_last = mod_last.max(l);
                    sa_models
                } else {
                    let (s, f, l) = calculate_dir_stats(&cache_models);
                    mod_size += s;
                    mod_files += f;
                    mod_last = mod_last.max(l);
                    cache_models
                };
                total_size_bytes += mod_size;
                folders.push(serde_json::json!({
                    "path": models_path.to_string_lossy(),
                    "label": "Models",
                    "size_bytes": mod_size,
                    "file_count": mod_files,
                    "last_modified": mod_last,
                }));

                // 6. Images
                let images_dir = superagent_dir.join("images");
                let (img_size, img_files, img_last) = calculate_dir_stats(&images_dir);
                total_size_bytes += img_size;
                folders.push(serde_json::json!({
                    "path": images_dir.to_string_lossy(),
                    "label": "Images",
                    "size_bytes": img_size,
                    "file_count": img_files,
                    "last_modified": img_last,
                }));

                // 7. Videos
                let videos_dir = superagent_dir.join("videos");
                let (vid_size, vid_files, vid_last) = calculate_dir_stats(&videos_dir);
                total_size_bytes += vid_size;
                folders.push(serde_json::json!({
                    "path": videos_dir.to_string_lossy(),
                    "label": "Videos",
                    "size_bytes": vid_size,
                    "file_count": vid_files,
                    "last_modified": vid_last,
                }));

                // 8. Config
                let config_dir = superagent_dir.join("config");
                let (cfg_size, cfg_files, cfg_last) = calculate_dir_stats(&config_dir);
                total_size_bytes += cfg_size;
                folders.push(serde_json::json!({
                    "path": config_dir.to_string_lossy(),
                    "label": "Config",
                    "size_bytes": cfg_size,
                    "file_count": cfg_files,
                    "last_modified": cfg_last,
                }));

                // 9. Binaries & Tools (bin, engines, standalone binaries)
                let mut bin_size = 0u64;
                let mut bin_files = 0usize;
                let mut bin_last = 0i64;
                for sub in &["bin", "engines"] {
                    let d = superagent_dir.join(sub);
                    if d.exists() {
                        let (s, f, l) = calculate_dir_stats(&d);
                        bin_size += s;
                        bin_files += f;
                        bin_last = bin_last.max(l);
                    }
                }
                if let Ok(entries) = std::fs::read_dir(&superagent_dir) {
                    for entry in entries.flatten() {
                        let p = entry.path();
                        if p.is_file() {
                            let ext = p.extension().and_then(|e| e.to_str()).unwrap_or("");
                            if ext == "exe" || ext == "cmd" || ext == "bat" || ext == "js" || ext == "lock" {
                                if let Ok(meta) = p.metadata() {
                                    bin_size += meta.len();
                                    bin_files += 1;
                                    if let Ok(t) = meta.modified() {
                                        if let Ok(dur) = t.duration_since(std::time::UNIX_EPOCH) {
                                            bin_last = bin_last.max(dur.as_secs() as i64);
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
                if bin_files > 0 {
                    total_size_bytes += bin_size;
                    folders.push(serde_json::json!({
                        "path": superagent_dir.to_string_lossy(),
                        "label": "Binaries & Tools",
                        "size_bytes": bin_size,
                        "file_count": bin_files,
                        "last_modified": bin_last,
                    }));
                }

                serde_json::json!({
                    "data": {
                        "folders": folders,
                        "total_size_bytes": total_size_bytes,
                    }
                })
            })
            .await
            .unwrap_or_else(|_| {
                serde_json::json!({
                    "data": {
                        "folders": [],
                        "total_size_bytes": 0,
                    }
                })
            });

            // Update cache
            if let Ok(mut cache_guard) = scan_cache().lock() {
                *cache_guard = Some((Instant::now(), res.clone()));
            }

            Some(Ok(Json(res)))
        }

        "storage:open-folder" | "storage_open_folder" | "storage-open-folder" => {
            let path_str = args
                .first()
                .and_then(|v| {
                    if let Some(s) = v.as_str() {
                        Some(s)
                    } else {
                        v.get("path").and_then(|s| s.as_str())
                    }
                })
                .unwrap_or("");

            if path_str.is_empty() {
                return Some(Err((
                    StatusCode::BAD_REQUEST,
                    Json(serde_json::json!({ "error": "Path parameter is required" })),
                )));
            }

            let target = PathBuf::from(path_str);
            let allowed_roots = vec![get_superagent_dir(), get_cache_dir()];

            if !path_is_jailed(&target, &allowed_roots) {
                return Some(Err((
                    StatusCode::FORBIDDEN,
                    Json(serde_json::json!({ "error": "Access to path outside SuperAgent directory is denied" })),
                )));
            }

            let folder_to_open = if target.is_file() {
                target.parent().unwrap_or(&target).to_path_buf()
            } else {
                target
            };

            #[cfg(target_os = "windows")]
            let _ = std::process::Command::new("explorer").arg(&folder_to_open).spawn();
            #[cfg(target_os = "macos")]
            let _ = std::process::Command::new("open").arg(&folder_to_open).spawn();
            #[cfg(target_os = "linux")]
            let _ = std::process::Command::new("xdg-open").arg(&folder_to_open).spawn();

            Some(Ok(Json(
                serde_json::json!({ "data": { "success": true, "path": folder_to_open.to_string_lossy() } }),
            )))
        }

        "storage:delete-file" | "storage_delete_file" | "storage-delete-file" => {
            let path_str = args
                .first()
                .and_then(|v| {
                    if let Some(s) = v.as_str() {
                        Some(s)
                    } else {
                        v.get("path").and_then(|s| s.as_str())
                    }
                })
                .unwrap_or("");

            if path_str.is_empty() {
                return Some(Err((
                    StatusCode::BAD_REQUEST,
                    Json(serde_json::json!({ "error": "Path parameter is required" })),
                )));
            }

            let target = PathBuf::from(path_str);
            let allowed_roots = vec![get_superagent_dir()];

            if !path_is_jailed(&target, &allowed_roots) {
                return Some(Err((
                    StatusCode::FORBIDDEN,
                    Json(serde_json::json!({ "error": "Deletion outside SuperAgent directory is denied" })),
                )));
            }

            if !target.exists() || !target.is_file() {
                return Some(Err((
                    StatusCode::NOT_FOUND,
                    Json(serde_json::json!({ "error": "File not found" })),
                )));
            }

            let freed_bytes = target.metadata().map(|m| m.len()).unwrap_or(0);
            if let Err(e) = std::fs::remove_file(&target) {
                return Some(Err((
                    StatusCode::INTERNAL_SERVER_ERROR,
                    Json(serde_json::json!({ "error": format!("Failed to delete file: {}", e) })),
                )));
            }

            // Invalidate scan cache
            if let Ok(mut cache_guard) = scan_cache().lock() {
                *cache_guard = None;
            }

            Some(Ok(Json(serde_json::json!({
                "data": { "success": true, "freed_bytes": freed_bytes }
            }))))
        }

        "storage:get-conversation-files"
        | "storage_get_conversation_files"
        | "storage-get-conversation-files" => {
            let filter_conv_id = args
                .first()
                .and_then(|v| v.get("conversationId").or_else(|| v.get("conversation_id")))
                .and_then(|v| v.as_str())
                .map(|s| s.to_string());

            let chat_storage = state.chat_storage.clone();

            let groups = tokio::task::spawn_blocking(move || {
                let mut result = Vec::new();
                let base_dir = chat_storage.storage_dir().clone();
                let chats_dir = base_dir.join("chats");

                let mut target_dirs = Vec::new();
                if let Some(ref cid) = filter_conv_id {
                    let dir = chats_dir.join(cid);
                    if dir.exists() {
                        target_dirs.push((cid.clone(), dir));
                    }
                } else if chats_dir.exists() {
                    if let Ok(entries) = std::fs::read_dir(&chats_dir) {
                        for entry in entries.flatten() {
                            let path = entry.path();
                            if path.is_dir() {
                                let id = path
                                    .file_name()
                                    .and_then(|n| n.to_str())
                                    .unwrap_or("")
                                    .to_string();
                                target_dirs.push((id, path));
                            }
                        }
                    }
                }

                for (conv_id, conv_path) in target_dirs {
                    // Try to load title from chat.json
                    let title = {
                        let chat_json_path = conv_path.join("chat.json");
                        if let Ok(content) = std::fs::read_to_string(&chat_json_path) {
                            serde_json::from_str::<serde_json::Value>(&content)
                                .ok()
                                .and_then(|v| v.get("title").and_then(|t| t.as_str()).map(|s| s.to_string()))
                                .unwrap_or_else(|| format!("Chat {}", conv_id))
                        } else {
                            format!("Chat {}", conv_id)
                        }
                    };

                    let mut files = Vec::new();
                    for entry in WalkDir::new(&conv_path).into_iter().filter_map(|e| e.ok()) {
                        if entry.file_type().is_file() {
                            let p = entry.path();
                            let file_name = p
                                .file_name()
                                .and_then(|n| n.to_str())
                                .unwrap_or("")
                                .to_string();

                            // Skip standard chat JSON files
                            if file_name == "chat.json"
                                || file_name == "steps.json"
                                || file_name == "messages.json"
                            {
                                continue;
                            }

                            let ext = p.extension().and_then(|e| e.to_str()).unwrap_or("");
                            let file_type = infer_file_type(ext);
                            let size_bytes = entry.metadata().map(|m| m.len()).unwrap_or(0);
                            let modified_at = entry
                                .metadata()
                                .ok()
                                .and_then(|m| m.modified().ok())
                                .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
                                .map(|d| d.as_secs() as i64)
                                .unwrap_or(0);

                            files.push(serde_json::json!({
                                "name": file_name,
                                "path": p.to_string_lossy(),
                                "file_type": file_type,
                                "size_bytes": size_bytes,
                                "modified_at": modified_at,
                            }));
                        }
                    }

                    if !files.is_empty() {
                        result.push(serde_json::json!({
                            "conversation_id": conv_id,
                            "conversation_title": title,
                            "files": files,
                        }));
                    }
                }

                result
            })
            .await
            .unwrap_or_default();

            Some(Ok(Json(serde_json::json!({ "data": groups }))))
        }

        "storage:get-memory-index" | "storage_get_memory_index" | "storage-get-memory-index" => {
            let chat_storage = state.chat_storage.clone();

            let res = tokio::task::spawn_blocking(move || {
                let global_mem = load_global_memory();
                let global_mem_size = serde_json::to_string(&global_mem)
                    .map(|s| s.len())
                    .unwrap_or(0);

                let sessions_meta = chat_storage.list_sessions().unwrap_or_default();
                let mut conversations = Vec::new();
                let mut total_media_count = 0usize;

                // Examine up to 200 sessions
                for meta in sessions_meta.into_iter().take(200) {
                    let mut images = 0u32;
                    let mut videos = 0u32;
                    let mut audios = 0u32;
                    let mut documents = 0u32;

                    if let Ok(session) = chat_storage.load_session(&meta.id) {
                        for msg in &session.messages {
                            for block in &msg.content {
                                match block {
                                    ContentBlock::Image { .. } => images += 1,
                                    ContentBlock::Video { .. } => videos += 1,
                                    ContentBlock::Audio { .. } => audios += 1,
                                    ContentBlock::Document { .. } => documents += 1,
                                    _ => {}
                                }
                            }
                        }
                    }

                    let media_sum = (images + videos + audios + documents) as usize;
                    total_media_count += media_sum;

                    conversations.push(serde_json::json!({
                        "id": meta.id,
                        "title": meta.title,
                        "project": meta.project,
                        "media_counts": {
                            "images": images,
                            "videos": videos,
                            "audios": audios,
                            "documents": documents,
                        },
                        "message_count": meta.message_count,
                        "updated_at": meta.updated_at,
                    }));
                }

                serde_json::json!({
                    "data": {
                        "global_memory_size": global_mem_size,
                        "conversations": conversations,
                        "total_media_count": total_media_count,
                    }
                })
            })
            .await
            .unwrap_or_else(|_| {
                serde_json::json!({
                    "data": {
                        "global_memory_size": 0,
                        "conversations": [],
                        "total_media_count": 0,
                    }
                })
            });

            Some(Ok(Json(res)))
        }

        "context-storage-read" | "context_storage_read" => {
            let scope = args
                .first()
                .and_then(|v| v.get("scope"))
                .and_then(|s| s.as_str())
                .unwrap_or("summary")
                .to_string();

            let chat_storage = state.chat_storage.clone();

            let payload = tokio::task::spawn_blocking(move || {
                let global_memory = load_global_memory();
                let orchestrator_instructions = load_orchestrator_instructions();
                let all_sessions = chat_storage.list_sessions().unwrap_or_default();
                let all_projects = chat_storage.load_all_stored_projects();

                let is_full = scope == "full";
                let session_limit = if is_full { all_sessions.len() } else { 50 };

                let mut conv_summaries = Vec::new();
                for meta in all_sessions.into_iter().take(session_limit) {
                    let mut images = 0u32;
                    let mut videos = 0u32;
                    let mut audios = 0u32;
                    let mut documents = 0u32;

                    if let Ok(session) = chat_storage.load_session(&meta.id) {
                        for msg in &session.messages {
                            for block in &msg.content {
                                match block {
                                    ContentBlock::Image { .. } => images += 1,
                                    ContentBlock::Video { .. } => videos += 1,
                                    ContentBlock::Audio { .. } => audios += 1,
                                    ContentBlock::Document { .. } => documents += 1,
                                    _ => {}
                                }
                            }
                        }
                    }

                    conv_summaries.push(serde_json::json!({
                        "id": meta.id,
                        "title": meta.title,
                        "project": meta.project,
                        "message_count": meta.message_count,
                        "media_counts": {
                            "images": images,
                            "videos": videos,
                            "audios": audios,
                            "documents": documents,
                        },
                        "updated_at": meta.updated_at,
                    }));
                }

                // File index (for full scope or lightweight summary)
                let mut file_index = Vec::new();
                let chats_dir = chat_storage.storage_dir().join("chats");
                if chats_dir.exists() {
                    for entry in WalkDir::new(&chats_dir).max_depth(3).into_iter().filter_map(|e| e.ok()) {
                        if entry.file_type().is_file() {
                            let p = entry.path();
                            let fname = p.file_name().and_then(|n| n.to_str()).unwrap_or("");
                            if fname == "chat.json" || fname == "steps.json" || fname == "messages.json" {
                                continue;
                            }
                            let ext = p.extension().and_then(|e| e.to_str()).unwrap_or("");
                            let file_type = infer_file_type(ext);
                            let size = entry.metadata().map(|m| m.len()).unwrap_or(0);
                            let mod_at = entry
                                .metadata()
                                .ok()
                                .and_then(|m| m.modified().ok())
                                .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
                                .map(|d| d.as_secs() as i64)
                                .unwrap_or(0);

                            file_index.push(serde_json::json!({
                                "name": fname,
                                "path": p.to_string_lossy(),
                                "file_type": file_type,
                                "size_bytes": size,
                                "modified_at": mod_at,
                            }));

                            if !is_full && file_index.len() >= 100 {
                                break;
                            }
                        }
                    }
                }

                serde_json::json!({
                    "data": {
                        "global_memory": global_memory,
                        "orchestrator_instructions": orchestrator_instructions,
                        "conversations": conv_summaries,
                        "projects": all_projects,
                        "file_index": file_index,
                        "storage_summary": {
                            "total_conversations": conv_summaries.len(),
                            "total_projects": all_projects.len(),
                            "total_files": file_index.len(),
                        }
                    }
                })
            })
            .await
            .unwrap_or_else(|_| {
                serde_json::json!({
                    "data": {
                        "global_memory": null,
                        "orchestrator_instructions": "",
                        "conversations": [],
                        "projects": [],
                        "file_index": [],
                        "storage_summary": {
                            "total_conversations": 0,
                            "total_projects": 0,
                            "total_files": 0,
                        }
                    }
                })
            });

            Some(Ok(Json(payload)))
        }

        _ => None,
    }
}
