use std::path::{Path, PathBuf};
use std::sync::OnceLock;
use std::time::Instant;

use axum::{http::StatusCode, Json};
use walkdir::WalkDir;

use crate::server::ipc::memory::{load_global_memory, load_orchestrator_instructions};
use crate::server::state::AppState;
use crate::storage::pcb_storage::resolve_pcb_dir;
use crate::storage::settings::{get_cache_dir, get_superagent_dir};
use crate::types::ContentBlock;

fn scan_cache() -> &'static std::sync::Mutex<Option<(Instant, serde_json::Value)>> {
    static CACHE: OnceLock<std::sync::Mutex<Option<(Instant, serde_json::Value)>>> =
        OnceLock::new();
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
        "png" | "jpg" | "jpeg" | "gif" | "webp" | "svg" | "bmp" | "ico" | "tiff" => "image",
        "mp4" | "webm" | "mov" | "avi" | "mkv" | "flv" | "wmv" => "video",
        "mp3" | "wav" | "ogg" | "flac" | "m4a" | "aac" | "opus" => "audio",
        "pdf" | "txt" | "md" | "doc" | "docx" | "rtf" | "csv" | "xlsx" => "document",
        "rs" | "ts" | "tsx" | "js" | "jsx" | "py" | "html" | "css" | "c" | "cpp" | "h" | "go"
        | "sh" | "ps1" | "sql" => "code",
        "json" | "toml" | "yaml" | "yml" | "xml" | "env" | "ini" | "lock" => "config",
        "gguf" | "safetensors" | "onnx" | "pt" | "pth" | "ckpt" => "model",
        "exe" | "dll" | "so" | "dylib" | "node" | "bin" => "binary",
        "kicad_pcb" | "kicad_sch" | "sch" | "pcb" | "gerber" | "gbr" | "drl" => "pcb",
        _ => "other",
    }
}

fn infer_domain(path: &Path, superagent_dir: &Path) -> &'static str {
    if path.starts_with(superagent_dir.join("images")) {
        "images"
    } else if path.starts_with(superagent_dir.join("videos")) {
        "videos"
    } else if path.starts_with(superagent_dir.join("conversation")) {
        "conversation"
    } else if path.starts_with(superagent_dir.join("artifacts")) {
        "artifacts"
    } else if path.starts_with(superagent_dir.join("config")) {
        "config"
    } else if path.starts_with(superagent_dir.join("bin")) {
        "bin"
    } else if path.starts_with(superagent_dir.join("engines")) {
        "engines"
    } else if path.starts_with(superagent_dir.join("models")) {
        "models"
    } else if path.starts_with(superagent_dir.join("pcb")) {
        "pcb"
    } else {
        let ext = path.extension().and_then(|e| e.to_str()).unwrap_or("");
        match infer_file_type(ext) {
            "image" => "images",
            "video" => "videos",
            "audio" => "videos",
            _ => "other",
        }
    }
}

fn path_is_jailed(target: &Path, allowed_roots: &[PathBuf]) -> bool {
    let target_norm = target
        .canonicalize()
        .unwrap_or_else(|_| target.to_path_buf());
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

            let workspace_root = state.workspace_root.clone();

            let res = tokio::task::spawn_blocking(move || {
                let superagent_dir = get_superagent_dir();
                let cache_dir = get_cache_dir();

                let mut domains = Vec::new();
                let mut total_size_bytes = 0u64;
                let mut total_files = 0usize;

                fn make_domain(
                    id: &str,
                    label: &str,
                    path: PathBuf,
                    desc: &str,
                    color: &str,
                    icon: &str,
                ) -> (serde_json::Value, u64, usize) {
                    let (size, files, last_mod) = calculate_dir_stats(&path);
                    (
                        serde_json::json!({
                            "id": id,
                            "label": label,
                            "path": path.to_string_lossy(),
                            "size_bytes": size,
                            "file_count": files,
                            "last_modified": last_mod,
                            "description": desc,
                            "color": color,
                            "icon": icon,
                        }),
                        size,
                        files,
                    )
                }

                // 1. Artifacts
                let (d, s, f) = make_domain(
                    "artifacts",
                    "Artifacts",
                    superagent_dir.join("artifacts"),
                    "Custom micro-apps, generated web builds, and runtime manifests",
                    "#f59e0b",
                    "Blocks",
                );
                total_size_bytes += s;
                total_files += f;
                domains.push(d);

                // 2. Binaries & Tools (bin folder + root tools like bun/ffmpeg/opencode/yt-dlp)
                let bin_dir = superagent_dir.join("bin");
                let (mut b_size, mut b_files, mut b_mod) = calculate_dir_stats(&bin_dir);
                // Also count root standalone binaries in superagent_dir
                if let Ok(entries) = std::fs::read_dir(&superagent_dir) {
                    for entry in entries.flatten() {
                        let p = entry.path();
                        if p.is_file() {
                            let ext = p.extension().and_then(|e| e.to_str()).unwrap_or("");
                            if ext == "exe" || ext == "cmd" || ext == "bat" || ext == "js" {
                                if let Ok(meta) = p.metadata() {
                                    b_size += meta.len();
                                    b_files += 1;
                                    if let Ok(t) = meta.modified() {
                                        if let Ok(dur) = t.duration_since(std::time::UNIX_EPOCH) {
                                            b_mod = b_mod.max(dur.as_secs() as i64);
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
                total_size_bytes += b_size;
                total_files += b_files;
                domains.push(serde_json::json!({
                    "id": "bin",
                    "label": "Binaries & Tools",
                    "path": bin_dir.to_string_lossy(),
                    "size_bytes": b_size,
                    "file_count": b_files,
                    "last_modified": b_mod,
                    "description": "Installed CLI executables, runtimes (Bun, FFmpeg, Opencode, yt-dlp)",
                    "color": "#14b8a6",
                    "icon": "Terminal",
                }));

                // 3. Config
                let (d, s, f) = make_domain(
                    "config",
                    "Configuration",
                    superagent_dir.join("config"),
                    "Settings, authentication keys, credentials, and app preferences",
                    "#6b7280",
                    "Settings",
                );
                total_size_bytes += s;
                total_files += f;
                domains.push(d);

                // 4. Conversation
                let (d, s, f) = make_domain(
                    "conversation",
                    "Conversations",
                    superagent_dir.join("conversation"),
                    "Chat sessions, historical messages, trajectory traces, and attachments",
                    "#6366f1",
                    "MessageSquare",
                );
                total_size_bytes += s;
                total_files += f;
                domains.push(d);

                // 5. Engines
                let (d, s, f) = make_domain(
                    "engines",
                    "Engines",
                    superagent_dir.join("engines"),
                    "AI execution runtimes, PyTorch, ONNX, and local acceleration modules",
                    "#8b5cf6",
                    "Cpu",
                );
                total_size_bytes += s;
                total_files += f;
                domains.push(d);

                // 6. Images
                let (d, s, f) = make_domain(
                    "images",
                    "Images",
                    superagent_dir.join("images"),
                    "Generated AI imagery, user photo attachments, canvas previews",
                    "#3b82f6",
                    "Image",
                );
                total_size_bytes += s;
                total_files += f;
                domains.push(d);

                // 7. Models (check superagent_dir/models and cache_dir/models)
                let sa_models = superagent_dir.join("models");
                let cache_models = cache_dir.join("models");
                let (mut m_size, mut m_files, mut m_mod) = (0u64, 0usize, 0i64);
                let models_path = if sa_models.exists() {
                    let (s, f, l) = calculate_dir_stats(&sa_models);
                    m_size += s;
                    m_files += f;
                    m_mod = m_mod.max(l);
                    sa_models
                } else {
                    let (s, f, l) = calculate_dir_stats(&cache_models);
                    m_size += s;
                    m_files += f;
                    m_mod = m_mod.max(l);
                    cache_models
                };
                total_size_bytes += m_size;
                total_files += m_files;
                domains.push(serde_json::json!({
                    "id": "models",
                    "label": "Models",
                    "path": models_path.to_string_lossy(),
                    "size_bytes": m_size,
                    "file_count": m_files,
                    "last_modified": m_mod,
                    "description": "Local GGUF LLM weights, diffusion checkpoints, and embeddings",
                    "color": "#ec4899",
                    "icon": "Box",
                }));

                // 8. PCB CAD
                let pcb_path = resolve_pcb_dir(None);
                let (d, s, f) = make_domain(
                    "pcb",
                    "PCB CAD",
                    pcb_path,
                    "Hardware designs, schematics, netlists, component libraries, and gerbers",
                    "#10b981",
                    "Layers",
                );
                total_size_bytes += s;
                total_files += f;
                domains.push(d);

                // 9. Videos
                let (d, s, f) = make_domain(
                    "videos",
                    "Videos",
                    superagent_dir.join("videos"),
                    "Rendered animations, AI video generations, and exported MP4 clips",
                    "#ef4444",
                    "Film",
                );
                total_size_bytes += s;
                total_files += f;
                domains.push(d);

                // Folders list for backwards compatibility
                let folders = domains
                    .iter()
                    .map(|d| {
                        serde_json::json!({
                            "path": d["path"],
                            "label": d["label"],
                            "size_bytes": d["size_bytes"],
                            "file_count": d["file_count"],
                            "last_modified": d["last_modified"]
                        })
                    })
                    .collect::<Vec<_>>();

                serde_json::json!({
                    "data": {
                        "domains": domains,
                        "folders": folders,
                        "total_size_bytes": total_size_bytes,
                        "total_files": total_files,
                        "workspace_root": workspace_root.to_string_lossy()
                    }
                })
            })
            .await
            .unwrap_or_else(|_| {
                serde_json::json!({
                    "data": {
                        "domains": [],
                        "folders": [],
                        "total_size_bytes": 0,
                        "total_files": 0,
                        "workspace_root": ""
                    }
                })
            });

            // Update cache
            if let Ok(mut cache_guard) = scan_cache().lock() {
                *cache_guard = Some((Instant::now(), res.clone()));
            }

            Some(Ok(Json(res)))
        }

        "storage:list-files" | "storage_list_files" | "storage-list-files" => {
            let arg_map = args.first().and_then(|v| v.as_object());
            let domain_filter = arg_map
                .and_then(|m| m.get("domain"))
                .and_then(|v| v.as_str())
                .map(|s| s.to_string());
            let path_filter = arg_map
                .and_then(|m| m.get("path"))
                .and_then(|v| v.as_str())
                .map(|s| s.to_string());
            let recursive = arg_map
                .and_then(|m| m.get("recursive"))
                .and_then(|v| v.as_bool())
                .unwrap_or(false);
            let search = arg_map
                .and_then(|m| m.get("search"))
                .and_then(|v| v.as_str())
                .map(|s| s.to_lowercase());
            let file_type_filter = arg_map
                .and_then(|m| m.get("file_type"))
                .and_then(|v| v.as_str())
                .map(|s| s.to_lowercase());
            let sort_by = arg_map
                .and_then(|m| m.get("sort_by"))
                .and_then(|v| v.as_str())
                .unwrap_or("date")
                .to_string();
            let sort_order = arg_map
                .and_then(|m| m.get("sort_order"))
                .and_then(|v| v.as_str())
                .unwrap_or("desc")
                .to_string();
            let limit = arg_map
                .and_then(|m| m.get("limit"))
                .and_then(|v| v.as_u64())
                .unwrap_or(150) as usize;

            let workspace_root = state.workspace_root.clone();

            let payload = tokio::task::spawn_blocking(move || {
                let superagent_dir = get_superagent_dir();
                let cache_dir = get_cache_dir();
                let allowed_roots = vec![superagent_dir.clone(), cache_dir.clone(), workspace_root];

                // Determine root directory to list
                let root_dir = if let Some(ref p) = path_filter {
                    let pb = PathBuf::from(p);
                    if path_is_jailed(&pb, &allowed_roots) && pb.exists() {
                        pb
                    } else {
                        superagent_dir.clone()
                    }
                } else if let Some(ref dom) = domain_filter {
                    match dom.as_str() {
                        "artifacts" => superagent_dir.join("artifacts"),
                        "bin" => superagent_dir.join("bin"),
                        "config" => superagent_dir.join("config"),
                        "conversation" => superagent_dir.join("conversation"),
                        "engines" => superagent_dir.join("engines"),
                        "images" => superagent_dir.join("images"),
                        "models" => {
                            if superagent_dir.join("models").exists() {
                                superagent_dir.join("models")
                            } else {
                                cache_dir.join("models")
                            }
                        }
                        "pcb" => resolve_pcb_dir(None),
                        "videos" => superagent_dir.join("videos"),
                        _ => superagent_dir.clone(),
                    }
                } else {
                    superagent_dir.clone()
                };

                let mut entries = Vec::new();
                let is_recursive = recursive || search.is_some() || file_type_filter.is_some();

                if is_recursive {
                    for entry in WalkDir::new(&root_dir)
                        .max_depth(32)
                        .into_iter()
                        .filter_map(|e| e.ok())
                    {
                        let p = entry.path();
                        if p == root_dir {
                            continue;
                        }

                        let fname = p.file_name().and_then(|n| n.to_str()).unwrap_or("");
                        if fname.is_empty() {
                            continue;
                        }

                        let is_dir = entry.file_type().is_dir();
                        if is_dir {
                            continue;
                        }

                        let ext = p.extension().and_then(|e| e.to_str()).unwrap_or("");
                        let ftype = infer_file_type(ext);

                        // Filters
                        if let Some(ref q) = search {
                            if !fname.to_lowercase().contains(q) {
                                continue;
                            }
                        }
                        if let Some(ref ft) = file_type_filter {
                            if ft == "media" {
                                if !matches!(ftype, "image" | "video" | "audio" | "document") {
                                    continue;
                                }
                            } else if ft != "all" && ftype != ft {
                                continue;
                            }
                        }

                        let size_bytes = entry.metadata().map(|m| m.len()).unwrap_or(0);
                        let modified_at = entry
                            .metadata()
                            .ok()
                            .and_then(|m| m.modified().ok())
                            .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
                            .map(|d| d.as_secs() as i64)
                            .unwrap_or(0);

                        let rel_path = p
                            .strip_prefix(&root_dir)
                            .unwrap_or(p)
                            .to_string_lossy()
                            .to_string();

                        let dom_tag = infer_domain(p, &superagent_dir);

                        entries.push(serde_json::json!({
                            "name": fname,
                            "path": p.to_string_lossy(),
                            "relative_path": rel_path,
                            "domain": dom_tag,
                            "file_type": ftype,
                            "extension": ext,
                            "size_bytes": size_bytes,
                            "modified_at": modified_at,
                            "is_dir": false,
                        }));

                        if entries.len() >= 50000 {
                            break;
                        }
                    }
                } else if let Ok(dir_entries) = std::fs::read_dir(&root_dir) {
                    for entry in dir_entries.flatten() {
                        let p = entry.path();
                        let fname = p.file_name().and_then(|n| n.to_str()).unwrap_or("");
                        let is_dir = p.is_dir();
                        let ext = p.extension().and_then(|e| e.to_str()).unwrap_or("");
                        let ftype = if is_dir {
                            "folder"
                        } else {
                            infer_file_type(ext)
                        };

                        if let Some(ref ft) = file_type_filter {
                            if ft == "media" {
                                if !is_dir
                                    && !matches!(ftype, "image" | "video" | "audio" | "document")
                                {
                                    continue;
                                }
                            } else if ft != "all" && ftype != ft {
                                continue;
                            }
                        }

                        let size_bytes = if is_dir {
                            0
                        } else {
                            p.metadata().map(|m| m.len()).unwrap_or(0)
                        };
                        let modified_at = p
                            .metadata()
                            .ok()
                            .and_then(|m| m.modified().ok())
                            .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
                            .map(|d| d.as_secs() as i64)
                            .unwrap_or(0);

                        let dom_tag = infer_domain(&p, &superagent_dir);

                        entries.push(serde_json::json!({
                            "name": fname,
                            "path": p.to_string_lossy(),
                            "relative_path": fname,
                            "domain": dom_tag,
                            "file_type": ftype,
                            "extension": ext,
                            "size_bytes": size_bytes,
                            "modified_at": modified_at,
                            "is_dir": is_dir,
                        }));
                    }
                }

                // Sorting
                entries.sort_by(|a, b| {
                    let a_is_dir = a["is_dir"].as_bool().unwrap_or(false);
                    let b_is_dir = b["is_dir"].as_bool().unwrap_or(false);
                    if a_is_dir != b_is_dir {
                        return b_is_dir.cmp(&a_is_dir); // folders first
                    }

                    match sort_by.as_str() {
                        "size" => {
                            let sa = a["size_bytes"].as_u64().unwrap_or(0);
                            let sb = b["size_bytes"].as_u64().unwrap_or(0);
                            if sort_order == "asc" {
                                sa.cmp(&sb)
                            } else {
                                sb.cmp(&sa)
                            }
                        }
                        "name" => {
                            let na = a["name"].as_str().unwrap_or("");
                            let nb = b["name"].as_str().unwrap_or("");
                            if sort_order == "asc" {
                                na.cmp(nb)
                            } else {
                                nb.cmp(na)
                            }
                        }
                        _ => {
                            let da = a["modified_at"].as_i64().unwrap_or(0);
                            let db = b["modified_at"].as_i64().unwrap_or(0);
                            if sort_order == "asc" {
                                da.cmp(&db)
                            } else {
                                db.cmp(&da)
                            }
                        }
                    }
                });

                let total_matching = entries.len();
                let files = if limit == 0 {
                    entries
                } else {
                    entries.into_iter().take(limit).collect::<Vec<_>>()
                };

                let parent_path = root_dir
                    .parent()
                    .filter(|p| path_is_jailed(p, &allowed_roots))
                    .map(|p| p.to_string_lossy().to_string());

                serde_json::json!({
                    "data": {
                        "files": files,
                        "current_path": root_dir.to_string_lossy(),
                        "parent_path": parent_path,
                        "total_matching": total_matching,
                    }
                })
            })
            .await
            .unwrap_or_else(|_| {
                serde_json::json!({
                    "data": {
                        "files": [],
                        "current_path": "",
                        "parent_path": null,
                        "total_matching": 0,
                    }
                })
            });

            Some(Ok(Json(payload)))
        }

        "storage:read-text-file" | "storage_read_text_file" | "storage-read-text-file" => {
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

            let max_bytes = args
                .first()
                .and_then(|v| v.get("max_bytes"))
                .and_then(|v| v.as_u64())
                .unwrap_or(512 * 1024) as usize;

            let target = PathBuf::from(path_str);
            let allowed_roots = vec![
                get_superagent_dir(),
                get_cache_dir(),
                state.workspace_root.clone(),
            ];

            if !path_is_jailed(&target, &allowed_roots) {
                return Some(Err((
                    StatusCode::FORBIDDEN,
                    Json(
                        serde_json::json!({ "error": "Access to path outside allowed directories is denied" }),
                    ),
                )));
            }

            if !target.exists() || !target.is_file() {
                return Some(Err((
                    StatusCode::NOT_FOUND,
                    Json(serde_json::json!({ "error": "File not found" })),
                )));
            }

            let result = tokio::task::spawn_blocking(move || {
                let total_bytes = target.metadata().map(|m| m.len()).unwrap_or(0);
                let mime = mime_guess::from_path(&target)
                    .first_or_octet_stream()
                    .to_string();

                let mut file = std::fs::File::open(&target).map_err(|e| e.to_string())?;
                use std::io::Read;
                let mut buffer = vec![0u8; max_bytes.min(total_bytes as usize)];
                let bytes_read = file.read(&mut buffer).map_err(|e| e.to_string())?;
                buffer.truncate(bytes_read);

                let content = String::from_utf8_lossy(&buffer).to_string();
                let truncated = total_bytes > max_bytes as u64;

                Ok::<serde_json::Value, String>(serde_json::json!({
                    "data": {
                        "content": content,
                        "truncated": truncated,
                        "total_bytes": total_bytes,
                        "mime": mime,
                    }
                }))
            })
            .await
            .unwrap_or_else(|_| Err("Task failed".to_string()));

            match result {
                Ok(val) => Some(Ok(Json(val))),
                Err(err) => Some(Err((
                    StatusCode::INTERNAL_SERVER_ERROR,
                    Json(serde_json::json!({ "error": err })),
                ))),
            }
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
                    Json(
                        serde_json::json!({ "error": "Access to path outside SuperAgent directory is denied" }),
                    ),
                )));
            }

            let folder_to_open = if target.is_file() {
                target.parent().unwrap_or(&target).to_path_buf()
            } else {
                target
            };

            #[cfg(target_os = "windows")]
            let _ = std::process::Command::new("explorer")
                .arg(&folder_to_open)
                .spawn();
            #[cfg(target_os = "macos")]
            let _ = std::process::Command::new("open")
                .arg(&folder_to_open)
                .spawn();
            #[cfg(target_os = "linux")]
            let _ = std::process::Command::new("xdg-open")
                .arg(&folder_to_open)
                .spawn();

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
                    Json(
                        serde_json::json!({ "error": "Deletion outside SuperAgent directory is denied" }),
                    ),
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
                                .and_then(|v| {
                                    v.get("title")
                                        .and_then(|t| t.as_str())
                                        .map(|s| s.to_string())
                                })
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
            let pcb_storage = state.pcb_storage.clone();

            let res = tokio::task::spawn_blocking(move || {
                let global_mem = load_global_memory();
                let global_mem_size = serde_json::to_string(&global_mem)
                    .map(|s| s.len())
                    .unwrap_or(0);

                let sessions_meta = chat_storage.list_sessions().unwrap_or_default();
                let mut conversations = Vec::new();
                let mut total_media_count = 0usize;

                for meta in sessions_meta.into_iter().take(250) {
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

                // PCB Projects
                let pcb_projects = pcb_storage.list_projects().unwrap_or_default();

                serde_json::json!({
                    "data": {
                        "global_memory_size": global_mem_size,
                        "conversations": conversations,
                        "pcb_projects": pcb_projects,
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
                        "pcb_projects": [],
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

                // File index across all .superagent
                let mut file_index = Vec::new();
                let superagent_dir = get_superagent_dir();
                let max_index_files = if is_full { 50_000 } else { 1_000 };

                if superagent_dir.exists() {
                    for entry in WalkDir::new(&superagent_dir)
                        .max_depth(32)
                        .into_iter()
                        .filter_map(|e| e.ok())
                    {
                        if entry.file_type().is_file() {
                            let p = entry.path();
                            let fname = p.file_name().and_then(|n| n.to_str()).unwrap_or("");
                            if fname == "chat.json"
                                || fname == "steps.json"
                                || fname == "messages.json"
                                || fname == "web-server.lock"
                            {
                                continue;
                            }
                            let ext = p.extension().and_then(|e| e.to_str()).unwrap_or("");
                            let file_type = infer_file_type(ext);
                            let dom_tag = infer_domain(&p, &superagent_dir);
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
                                "domain": dom_tag,
                                "file_type": file_type,
                                "size_bytes": size,
                                "modified_at": mod_at,
                            }));

                            if file_index.len() >= max_index_files {
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
