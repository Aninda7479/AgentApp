use std::path::{Path, PathBuf};

use axum::{
    extract::State,
    http::{header, StatusCode, Uri},
    response::{IntoResponse, Response},
};
use rust_embed::RustEmbed;

use crate::server::state::AppState;
use crate::storage::settings::get_superagent_dir;

#[derive(RustEmbed)]
#[folder = "ui-dist/"]
pub struct EmbeddedUi;

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

pub async fn spa_fallback_handler(
    uri: Uri,
    State(state): State<AppState>,
) -> Response {
    // Never serve SPA HTML for missing /api routes
    if uri.path().starts_with("/api/") || uri.path() == "/api" {
        return (
            StatusCode::NOT_FOUND,
            [(header::CONTENT_TYPE, "application/json")],
            serde_json::json!({
                "error": "Not Found",
                "message": format!("API endpoint not found: {}", uri.path())
            })
            .to_string(),
        )
            .into_response();
    }

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

            // Fallback for nested asset requests (e.g. /settings/index.css or /settings/renderer/entry.bundle.js)
            let mut segments: Vec<&str> = path_str.split('/').collect();
            while segments.len() > 1 {
                segments.remove(0);
                let subpath = segments.join("/");
                let candidate_path = dist.join(&subpath);
                if candidate_path.is_file() {
                    if let (Ok(canonical_dist), Ok(canonical_target)) =
                        (dist.canonicalize(), candidate_path.canonicalize())
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
            }

            if path_str == "login" || path_str.ends_with("/login") {
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

        // Fallback for nested asset requests in EmbeddedUi
        let mut segments: Vec<&str> = path_str.split('/').collect();
        while segments.len() > 1 {
            segments.remove(0);
            let subpath = segments.join("/");
            if let Some(file) = EmbeddedUi::get(&subpath) {
                let mime = mime_guess::from_path(&subpath).first_or_octet_stream();
                let cache_header = if subpath.ends_with(".html") || subpath.ends_with(".js") || subpath.ends_with(".css") || subpath.ends_with(".map") {
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
        }

        if path_str == "login" || path_str.ends_with("/login") {
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
